from __future__ import annotations

import argparse
import math
import os
import random
import re
import time
import uuid
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

# Suppress noisy library warnings and progress bars
warnings.filterwarnings("ignore")
os.environ.pop("PYTHONHASHSEED", None)
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

# Windows wheels used here can legitimately bring both LLVM OpenMP (llama.cpp)
# and Intel OpenMP (PyTorch/Silero/SpeechBrain) into one coordinator process.
# This has to be set before either native library is imported; setting it later
# cannot repair an already-initialized runtime.  ASR and speaker verification
# still run in isolated worker processes, while this keeps the main dialogue
# process alive when VAD first executes.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("OMP_NUM_THREADS", "4")

from config import ASR, PATHS, SPEAKER
from meera_runtime.speaker import SpeakerMatch, VoiceAccessController, VoiceprintError
from meera_runtime.supervisor import Supervisor
from meera_runtime.conversation import ConversationEngine
from meera_runtime.voice import BargeInCapture, MicrophoneASR, play_wav, split_for_speech, stop_playback
from meera_runtime.audio_context import save_wav, recognize_song
from meera_runtime.logger import TurnTracer


def _say(supervisor: Supervisor, text: str) -> None:
    print(f"Meera: {text}")
    result = supervisor.speak_live(text)
    if not result.ok:
        message = result.error.message if result.error else result.summary
        print(f"[Voice error] {message}")


def _speak_interruptibly(
    supervisor: Supervisor,
    listener: MicrophoneASR,
    text: str,
    output_path: Path | None = None,
    instruction: str | None = None,
    access: VoiceAccessController | None = None,
    tracer: TurnTracer | None = None,
    response_started_at: float | None = None,
):
    """Speak and listen together; return speech result plus any barge-in audio."""
    last_result = None
    # qwentts.cpp already streams PCM, so ordinary replies should be one model
    # request. Starting a fresh generation every 28 words resets breathing and
    # creates a generation-sized hole that sounds like a broken voice. Only very
    # long replies are split, at complete sentence groups.
    chunks = split_for_speech(text, max_words=170, max_sentences=20)
    total_chunks = len(chunks)
    tts_total_ms = 0.0
    for index, chunk in enumerate(chunks, 1):
        detector = BargeInCapture(listener)
        supervisor.tts.set_playback_observer(detector.feed_playback)
        chunk_path = output_path
        if output_path is not None and total_chunks > 1:
            chunk_path = output_path.with_name(f"{output_path.stem}-part-{index}{output_path.suffix}")
        # Preserve one acoustic identity and prosody across the rare long-answer
        # boundary. Punctuation already supplies a natural breath; do not add a
        # synthetic sleep or redesign the sentence independently.
        chunk_instruction = supervisor.continuous_meera_instruction(instruction)
        try:
            with ThreadPoolExecutor(max_workers=1, thread_name_prefix="meera-speech") as executor:
                try:
                    future = executor.submit(supervisor.speak_live, chunk, chunk_path, chunk_instruction)
                    # Serialize PortAudio device creation on Windows: opening the
                    # microphone and speaker simultaneously from separate threads
                    # can terminate Python with native heap corruption.  Once the
                    # output stream is open, full-duplex barge-in remains active.
                    playback_started = supervisor.wait_for_playback_start(future)
                    if playback_started and tracer is not None and tracer.telemetry.ttfa_ms == 0.0:
                        tracer.event("first_playback_started")
                        if response_started_at is not None:
                            tracer.mark_ttfa((time.monotonic() - response_started_at) * 1000)
                    interruption = (
                        detector.capture_while(future, supervisor.interrupt_speech)
                        if playback_started else None
                    )
                    last_result = future.result()
                    if last_result and last_result.data:
                        tts_total_ms += float(last_result.data.get("duration_ms") or 0.0)
                except BaseException:
                    supervisor.interrupt_speech()
                    executor.shutdown(wait=False, cancel_futures=True)
                    raise
                if interruption is not None:
                    # Validate that interruption contains sufficient speech audio (>0.3s and above floor)
                    import numpy as np
                    arr = np.asarray(interruption, dtype=np.float32).reshape(-1)
                    duration_s = arr.size / listener.config.sample_rate
                    rms = float(np.sqrt(np.mean(np.square(arr)))) if arr.size else 0.0
                    if duration_s >= 0.30 and rms >= listener.calibrated_threshold * 1.1:
                        if access is not None and access.locked and access.config.enforce_identity:
                            match = access.authenticate(interruption)
                            if not match.accepted:
                                interruption = None
                    else:
                        interruption = None
                    if interruption is not None:
                        return last_result, interruption
                if not last_result.ok:
                    return last_result, None
        finally:
            supervisor.tts.set_playback_observer(None)
    if tracer is not None:
        tracer.mark_tts_done(tts_total_ms)
        tracer.event("playback_finished")
    return last_result, None


def _speak_stream_interruptibly(
    supervisor: Supervisor,
    listener: MicrophoneASR,
    sentence_iter,
    output_path: Path | None = None,
    access: VoiceAccessController | None = None,
    tracer: TurnTracer | None = None,
    response_started_at: float | None = None,
) -> tuple[ToolResult | None, object | None, list[str]]:
    """Collect the streamed text and speak it through one stable Serena request."""
    spoken_sentences: list[str] = []
    first_instruction = None
    print("Meera: ", end="", flush=True)
    for chunk, instruction in sentence_iter:
        if not spoken_sentences and tracer is not None:
            tracer.event("first_phrase_ready")
            if response_started_at is not None:
                tracer.mark_first_phrase((time.monotonic() - response_started_at) * 1000)
        if not chunk:
            continue
        print(chunk + " ", end="", flush=True)
        spoken_sentences.append(chunk)
        if first_instruction is None:
            first_instruction = instruction
    if not spoken_sentences:
        return None, None, []
    result, interruption = _speak_interruptibly(
        supervisor,
        listener,
        " ".join(spoken_sentences),
        output_path=output_path,
        instruction=first_instruction,
        access=access,
        tracer=tracer,
        response_started_at=response_started_at,
    )
    return result, interruption, spoken_sentences


def _enroll_voice(
    supervisor: Supervisor,
    listener: MicrophoneASR,
    access: VoiceAccessController,
    role: str,
) -> bool:
    prompts = (
        "Meera should recognize my voice and respond only when I speak.",
        "My natural speaking voice is being registered securely on this computer.",
        "Today I am confirming that this is the primary owner voice."
        if role == "owner" else
        "Today I am confirming that this is an additional trusted voice.",
    )
    recordings = []
    _say(supervisor, f"Okay. I need {len(prompts)} clear samples. Speak normally after each prompt.")
    for index, phrase in enumerate(prompts, 1):
        accepted = None
        for attempt in range(3):
            _say(supervisor, f"Sample {index}. Please say: {phrase}")
            audio = listener.capture()
            error = access.quality_error(audio) if audio is not None else "I didn't hear that sample."
            if not error:
                transcript = listener.transcribe(audio)
                if not transcript:
                    error = "That did not sound like a clear spoken enrollment sentence. Please try again."
                elif not _enrollment_phrase_matches(phrase, transcript):
                    error = "The sample did not match the displayed enrollment sentence. Please repeat it clearly."
            if not error:
                accepted = audio
                break
            _say(supervisor, error)
        if accepted is None:
            _say(supervisor, "Enrollment stopped because I couldn't get a clean sample.")
            return False
        recordings.append(accepted)
    try:
        name = "owner" if role == "owner" else access.store.next_secondary_name()
        access.enroll(name, role, recordings)
        if role == "owner":
            message = (
                "Your owner voice is registered. Strict owner-only access is active."
                if access.config.enforce_identity else
                "Your owner voice profile is registered. I'll use it for identity without blocking clear conversation."
            )
        else:
            message = "The second trusted voice is registered."
        _say(supervisor, message)
        return True
    except VoiceprintError as error:
        _say(supervisor, f"I couldn't register that voice. {error}")
        return False


def _enrollment_phrase_matches(expected: str, heard: str) -> bool:
    """Require meaningful phrase agreement so ambient media cannot become owner."""
    expected_words = re.findall(r"[a-z0-9]+", expected.lower())
    heard_words = re.findall(r"[a-z0-9]+", heard.lower())
    if not expected_words or not heard_words:
        return False
    important = {word for word in expected_words if len(word) >= 3}
    overlap = important.intersection(heard_words)
    return len(overlap) >= max(4, math.ceil(len(important) * .55))


def _authorize_second_voice(
    supervisor: Supervisor,
    listener: MicrophoneASR,
    access: VoiceAccessController,
) -> bool:
    colors = ("blue", "green", "silver", "amber")
    numbers = ("two", "four", "seven", "nine")
    color, number = random.choice(colors), random.choice(numbers)
    challenge = f"Meera confirms {color} {number}"
    _say(supervisor, f"Owner confirmation required. Please say: {challenge}")
    audio = listener.capture()
    if audio is None:
        _say(supervisor, "I didn't hear the owner confirmation, so I cancelled registration.")
        return False
    match = access.authenticate(audio, strict=True)
    if not match.accepted or match.role != "owner":
        _say(supervisor, "That was not the registered owner voice, so I cancelled registration.")
        return False
    spoken = listener.transcribe(audio).lower()
    required = {"meera", "confirms", color, number}
    heard = set(re.findall(r"[a-z]+", spoken))
    if not required.issubset(heard):
        _say(supervisor, "The spoken confirmation did not match, so I cancelled registration.")
        return False
    return _enroll_voice(supervisor, listener, access, "secondary")


def voice_loop(supervisor: Supervisor) -> None:
    listener = MicrophoneASR(ASR)
    access = VoiceAccessController(SPEAKER, PATHS.runtime_root / "meera.db", PATHS.model_root)
    conversation = ConversationEngine(supervisor.router)
    try:
        if not SPEAKER.enabled:
            print("[Meera] Voice mode is disabled because mandatory voice lock is turned off. Enable MEERA_VOICE_LOCK_ENABLED to continue.")
            return
        print("[Meera] Loading high-accuracy speech recognition...")
        hotwords, corrections = supervisor.speech_vocabulary()
        listener.configure_vocabulary(hotwords, corrections)
        listener.start()
        if access.locked:
            print("[Meera] Loading owner voice verification...")
            access.start()
            if access.config.enforce_identity:
                print("[Meera] Strict owner-only voice access active.")
            else:
                print("[Meera] Owner voice profile loaded. Identity checks are adaptive.")
        else:
            print("[Meera] Owner voice registration is required before normal listening.")
        print("[Meera] Calibrating microphone - please stay quiet for a moment...")
        listener.calibrate()
        if not access.locked:
            print("[Meera] Starting mandatory owner voice registration.")
            if not _enroll_voice(supervisor, listener, access, "owner"):
                print("[Meera] Voice registration is incomplete. Normal listening is disabled.")
                return
            access.start()
            if access.config.enforce_identity:
                print("[Meera] Strict owner-only voice access active.")
            else:
                print("[Meera] Owner voice profile loaded. Identity checks are adaptive.")
        print("Meera is listening. Say 'goodbye' to exit.")
        pending_audio = None
        while True:
            tracer = None
            try:
                if pending_audio is not None:
                    audio = pending_audio
                    pending_audio = None
                else:
                    audio = None
                    listener.reset_streaming_state()
                    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="meera-stream-asr") as stream_exec:
                        transcribe_future = None
                        for partial_audio, is_final in listener.capture_stream():
                            if partial_audio is None:
                                break
                            audio = partial_audio
                            
                            # Only transcribe if the worker isn't already busy with an older chunk
                            if not is_final and (transcribe_future is None or transcribe_future.done()):
                                transcribe_future = stream_exec.submit(listener.transcribe, partial_audio)
                                def update_ui(f):
                                    try:
                                        t = f.result()
                                        if t:
                                            print(f"\rListening: {t}\033[K", end="", flush=True)
                                    except Exception:
                                        pass
                                transcribe_future.add_done_callback(update_ui)
                                
                            if is_final:
                                print() # Clear the line
                                break
                if audio is None:
                    continue
                endpoint_value = getattr(listener, "last_endpoint_at", 0.0)
                endpoint_at = float(endpoint_value) if isinstance(endpoint_value, (int, float)) and endpoint_value > 0 else time.monotonic()
                speech_value = getattr(listener, "last_speech_started_at", 0.0)
                speech_started_at = float(speech_value) if isinstance(speech_value, (int, float)) and speech_value > 0 else endpoint_at
                tracer = TurnTracer(uuid.uuid4().hex[:12], started_at=speech_started_at)
                tracer.event("endpoint_committed", at=endpoint_at)
                endpoint_latency = getattr(listener, "last_endpoint_latency_ms", 0.0)
                tracer.mark_vad_done(float(endpoint_latency) if isinstance(endpoint_latency, (int, float)) else 0.0)
                # Reject near-silent captures that slip through the VAD when its
                # neural probability briefly flickers. Whisper hallucinates common
                # phrases ("No, I'm sorry", "Thank you") from such silence.
                try:
                    import numpy as np
                    _rms = float(np.sqrt(np.mean(np.square(np.asarray(audio, dtype=np.float32))))) if len(audio) else 0.0
                    if _rms < listener.calibrated_threshold * 1.5:
                        continue
                except (ValueError, TypeError):
                    pass
                # Speaker verification and ASR are independent. Running them in
                # parallel removes their serial latency from every conversational turn.
                turn_started = time.monotonic()
                with ThreadPoolExecutor(max_workers=2, thread_name_prefix="meera-turn") as executor:
                    try:
                        speaker_future = executor.submit(access.authenticate, audio)
                        # Partials are UI/speculation hints, never canonical input.
                        # Reconcile the complete utterance after endpointing so the
                        # user's final words cannot be lost to a stale 600 ms chunk.
                        final_revision = listener.next_transcript_revision()
                        asr_started = time.monotonic()
                        text = listener.transcribe(audio, revision=final_revision, final=True)
                        tracer.mark_asr_done((time.monotonic() - asr_started) * 1000)
                        tracer.telemetry.metadata["final_transcript_revision"] = final_revision
                        tracer.event("transcript_final")
                        try:
                            speaker = speaker_future.result()
                        except Exception as verification_error:
                            # Identity is useful context, not a reason to make the
                            # conversational assistant deaf. Strict authorization
                            # paths perform their own fresh owner challenge below.
                            speaker = SpeakerMatch(
                                accepted=not access.config.enforce_identity,
                                role="unverified",
                                reason=f"verification_unavailable:{type(verification_error).__name__}",
                            )
                    except BaseException:
                        executor.shutdown(wait=False, cancel_futures=True)
                        raise
                recognition_ms = int((time.monotonic() - turn_started) * 1000)
                print(f"[Perf] ASR + voice verification: {recognition_ms} ms")
                _asr_confidence = getattr(listener, "last_confidence", None)
                _word_confidence = getattr(listener, "last_word_confidence", None)
                if (
                    isinstance(getattr(listener, "last_words", None), list)
                    and listener.last_words
                    and isinstance(_asr_confidence, (int, float))
                    and isinstance(_word_confidence, (int, float))
                ):
                    print(
                        f"[ASR] confidence={_asr_confidence:.3f}; "
                        f"word_confidence={_word_confidence:.3f}; "
                        f"final_beam={max(5, int(listener.config.beam_size))}"
                    )
                input_gain = getattr(listener, "last_input_gain", 1.0)
                input_gain = float(input_gain) if isinstance(input_gain, (int, float)) else 1.0
                raw_rms = getattr(listener, "last_raw_rms", 0.0)
                raw_rms = float(raw_rms) if isinstance(raw_rms, (int, float)) else 0.0
                enhanced_rms = getattr(listener, "last_enhanced_rms", 0.0)
                enhanced_rms = float(enhanced_rms) if isinstance(enhanced_rms, (int, float)) else 0.0
                if input_gain >= 1.25:
                    print(
                        f"[Mic] Speech boost={input_gain:.2f}x; "
                        f"rms={raw_rms:.5f}->{enhanced_rms:.5f}"
                    )
                elif input_gain < 0.95:
                    print(f"[Mic] Hot input safely attenuated to {input_gain:.2f}x.")
                if getattr(listener, "last_fallback_used", False) is True:
                    print("[ASR] Low-confidence audio received an accuracy retry.")
                if listener._endpoint_reason:
                    print(f"[VAD] {listener._endpoint_reason}")
                if not text:
                    if listener.last_rejection_reason:
                        print(f"[ASR] Ignored non-conversational audio ({listener.last_rejection_reason}).")
                    else:
                        print("I couldn't understand that.")
                    tracer.finish("rejected")
                    continue

                # Fuse identity with the already validated ASR/VAD result. In
                # adaptive mode, clear conversational speech continues even if
                # a short/noisy phrase has a weak voiceprint score. Strict mode
                # remains available through MEERA_VOICE_LOCK_STRICT=1.
                if access.locked and access.config.enforce_identity and not speaker.accepted:
                    score = f", score={speaker.score:.3f}" if speaker.score >= 0 else ""
                    print(f"[Voice access] Ignored unrecognized speaker ({speaker.reason}{score}).")
                    tracer.finish("speaker_rejected")
                    continue
                if access.locked and speaker.reason != "matched":
                    score = f", score={speaker.score:.3f}" if speaker.score >= 0 else ""
                    print(f"[Voice profile] Identity uncertain ({speaker.reason}{score}); clear speech accepted.")
                # Build an acoustic-scene snapshot before reasoning. The transcript
                # is only one modality; Meera also receives whether speech/music/ambient
                # sound was present in the same microphone frame. We pass the transcript
                # to calculate the user's speaking pace (WPM).
                scene_context = listener.analyze_scene(audio, text=text)
                supervisor.set_audio_context(scene_context, text)

                raw_text = text
                # Exit must never depend on optional transcript repair or the brain.
                # Handle the literal ASR result first so shutdown still works if a
                # normalizer is unavailable, slow, or returns an invalid value.
                raw_normalized = re.sub(r"[^a-z0-9]+", " ", raw_text.lower()).strip()
                if raw_normalized in {"exit", "quit", "goodbye", "bye", "bye bye", "shutdown meera"}:
                    supervisor.stop()
                    stop_playback()
                    print("Meera: Goodbye.")
                    tracer.finish("shutdown")
                    break
                text = supervisor.understand_speech(
                    text,
                    confidence=listener.last_confidence,
                    language=listener.last_language,
                    words=listener.last_words,
                )
                if text != raw_text:
                    print(f"[Speech brain] {raw_text} -> {text}")
                print(f"You: {text}")
                tracer.telemetry.user_text = text
                # Normalize punctuation for commands so "bye-bye", "bye bye",
                # and naturally punctuated enrollment phrases behave identically.
                normalized = re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()
                if normalized in {"register my voice", "enroll my voice", "set my voice as owner"}:
                    if access.locked:
                        _say(supervisor, "The owner voice is already registered.")
                    else:
                        _enroll_voice(supervisor, listener, access, "owner")
                    tracer.finish("voice_enrollment")
                    continue
                if normalized in {"register second voice", "register a second voice", "add another voice", "add a trusted voice"}:
                    if not access.locked:
                        _say(supervisor, "Register the owner voice first.")
                    else:
                        # Always use the fresh, longer strict challenge. A short
                        # command may not carry enough voiceprint evidence even
                        # when the owner spoke it.
                        _authorize_second_voice(supervisor, listener, access)
                    tracer.finish("voice_enrollment")
                    continue
                if normalized in {"exit", "quit", "goodbye", "bye", "bye bye", "shutdown meera"}:
                    supervisor.stop()
                    stop_playback()
                    print("Meera: Goodbye.")
                    tracer.finish("shutdown")
                    break
                # If the user asks Meera to identify/listen to the music, capture the
                # audio that continues AFTER their sentence. Otherwise the VAD utterance
                # contains mostly the command itself and there is nothing to fingerprint.
                music_request = bool(re.search(
                    r"(?i)\b(?:what(?:'s| is) (?:this|that) song|what song is this|identify (?:this|that) song|listen (?:to )?(?:this|that) song|what(?:'s| is) playing|who(?:'s| is) singing|who sang (?:this|that)|song details)\b", text.replace("\n", " ")
                ))
                if music_request:
                    print("[Meera] Listening to the continuing background audio...")
                    music_audio = listener.capture_for_duration(8.0)
                    if music_audio is not None:
                        music_context = recognize_song(
                            save_wav(music_audio, ASR.sample_rate, PATHS.runtime_root / "audio-scene")
                        )
                        # Keep the user's speech-scene information too.
                        music_context.speech_present = True
                        supervisor.set_audio_context(music_context)

                # A research turn has two beats: Meera speaks a short, topic-aware
                # acknowledgement immediately while the web/brain worker runs, then
                # continues naturally with the grounded result. Normal chat stays a
                # single turn so it remains quick and does not become performative.
                reasoning_started = time.monotonic()
                conversation_turn = conversation.begin(
                    text, asr_confidence=listener.last_confidence, words=listener.last_words
                )
                tracer.duration("route_and_conversation", reasoning_started)
                tracer.telemetry.metadata["route"] = conversation_turn.route.tool or conversation_turn.route.capability
                tracer.event("route_ready")
                supervisor.set_conversation_context(conversation.context_for(conversation_turn))
                if conversation_turn.acknowledgement:
                    print(f"Meera: {conversation_turn.acknowledgement}")
                    worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="meera-research")
                    # Web I/O proceeds during the acknowledgement, but reserve GPU
                    # priority before starting the worker so its llama.cpp answer
                    # cannot starve qwentts.cpp playback on the RTX 4050.
                    supervisor.begin_priority_speech()
                    result_future = worker.submit(supervisor.handle, text, conversation_turn.route)
                    try:
                        # The acknowledgement and researched continuation are two
                        # synthesis requests, but must sound like a single Meera
                        # speaking without a character or prosody reset.
                        continuous_voice = supervisor.continuous_meera_instruction()
                        _ack, interrupted = _speak_interruptibly(
                            supervisor, listener, conversation_turn.acknowledgement,
                            output_path=PATHS.artifact_root / "speech" / "research-ack.wav",
                            instruction=continuous_voice,
                            access=access,
                            tracer=tracer,
                            response_started_at=endpoint_at,
                        )
                        supervisor.end_priority_speech()
                        if _ack and _ack.ok and _ack.data.get("underflows"):
                            print(f"[Audio] Acknowledgement playback underflows: {_ack.data['underflows']}")
                        if interrupted is not None:
                            conversation.interrupt(conversation_turn)
                            supervisor.stop()
                            result_future.cancel()
                            pending_audio = interrupted
                            tracer.finish("interrupted")
                            print("[Meera] Interrupted; listening to you.")
                            continue
                        result = conversation.finish(conversation_turn, result_future.result())
                        if conversation_turn.resolved_subject:
                            supervisor.learn_resolved_entity(
                                conversation_turn.subject,
                                conversation_turn.resolved_subject,
                            )
                        # The tool result was expressed before entity resolution;
                        # refresh spoken delivery without making another brain call.
                        supervisor.refresh_spoken_rendering(text, result)
                        
                        # Lock the main response instruction to the acknowledgement's 
                        # instruction to prevent mid-turn prosody/identity shifts
                        result.speech_instruction = continuous_voice
                        supervisor.continuous_meera_instruction(result.speech_instruction)
                    finally:
                        supervisor.end_priority_speech()
                        worker.shutdown(wait=False, cancel_futures=True)
                else:
                    if not conversation_turn.route.tool:
                        # Consume the already-existing token stream directly. The
                        # first safe phrase reaches TTS while the rest of the answer
                        # has not yet been generated.
                        sentence_iter = supervisor.stream_dialogue(text, conversation_turn.route)
                        speech, interrupted, spoken = _speak_stream_interruptibly(
                            supervisor,
                            listener,
                            sentence_iter,
                            access=access,
                            tracer=tracer,
                            response_started_at=endpoint_at,
                        )
                        print()
                        hotwords, corrections = supervisor.speech_vocabulary()
                        listener.configure_vocabulary(hotwords, corrections)
                        if interrupted is not None:
                            conversation.interrupt(conversation_turn)
                            pending_audio = listener._enhance_captured_audio(interrupted)
                            tracer.finish("interrupted")
                            print("[Meera] Interrupted; listening to you.")
                            continue
                        if not spoken:
                            print("[Voice] The local model produced no speakable text.")
                        if speech is not None and not speech.ok:
                            message = speech.error.message if speech.error else speech.summary
                            print(f"[Voice error] {message}")
                            tracer.finish("voice_error", message)
                        else:
                            tracer.finish("success")
                        continue
                        
                    result = supervisor.handle(text)
                reasoning_ms = int((time.monotonic() - reasoning_started) * 1000)
                print(f"[Perf] Brain/routing: {reasoning_ms} ms")
                hotwords, corrections = supervisor.speech_vocabulary()
                listener.configure_vocabulary(hotwords, corrections)
                print(f"Meera: {result.summary}")
                if result.observations:
                    print("Sources:")
                    for source in result.observations:
                        print(f"  {source}")
                audio = next((Path(a.path) for a in result.artifacts if a.type == "audio/wav"), None)
                if audio:
                    play_wav(audio)
                    tracer.event("artifact_playback_finished")
                    tracer.finish("success")
                else:
                    speech, interrupted = _speak_interruptibly(
                        supervisor,
                        listener,
                        result.speech_text or result.summary,
                        instruction=result.speech_instruction,
                        access=access,
                        tracer=tracer,
                        response_started_at=endpoint_at,
                    )
                    if interrupted is not None:
                        pending_audio = interrupted
                        tracer.finish("interrupted")
                        print("[Meera] Interrupted; listening to you.")
                        continue
                    if speech.ok and speech.data:
                        first_packet_ms = speech.data.get("first_packet_ms")
                        first_audio_ms = speech.data.get("first_audio_ms")
                        duration_ms = speech.data.get("duration_ms")
                        if first_audio_ms is not None:
                            packet = f"; first packet: {first_packet_ms} ms" if first_packet_ms is not None else ""
                            print(f"[Perf] TTS first audio: {first_audio_ms} ms{packet}; total speech: {duration_ms} ms")
                        if speech.data.get("underflows"):
                            print(f"[Audio] Playback underflows: {speech.data['underflows']}")
                    if not speech.ok:
                        message = speech.error.message if speech.error else speech.summary
                        print(f"[Voice error] {message}")
                        tracer.finish("voice_error", message)
                    else:
                        tracer.finish("success")
            except KeyboardInterrupt:
                if tracer is not None:
                    tracer.finish("cancelled")
                supervisor.stop()
                stop_playback()
                print("\nMeera: Goodbye.")
                break
            except Exception as error:
                if tracer is not None:
                    tracer.finish("error", str(error))
                print(f"[Voice error] {error}")
    except KeyboardInterrupt:
        supervisor.stop()
        stop_playback()
        print("\nMeera: Goodbye.")
    finally:
        access.close()
        listener.close()


def text_loop(supervisor: Supervisor) -> None:
    print("Meera text mode. Type 'exit' to close.")
    while True:
        try:
            text = input("\nYou: ").strip()
            if text.lower() in {"exit", "quit"}:
                print("Meera: Goodbye.")
                break
            if text:
                print(f"Meera: {supervisor.handle(text).summary}")
        except (KeyboardInterrupt, EOFError):
            supervisor.stop()
            print("\nMeera: Goodbye.")
            break


def main() -> None:
    parser = argparse.ArgumentParser(description="Meera local agent runtime")
    parser.add_argument("--text", action="store_true", help="Use keyboard input instead of the microphone")
    args = parser.parse_args()
    supervisor = Supervisor()
    
    import signal
    import os
    def force_quit(signum, frame):
        print("\nMeera: Goodbye. (Force quit)")
        from meera_runtime.watchdog import watchdog
        watchdog.shutdown_all()
        os._exit(1)
    try:
        signal.signal(signal.SIGINT, force_quit)
    except ValueError:
        pass
        
    try:
        print("Starting Meera and warming local models...")
        supervisor.preload()
        text_loop(supervisor) if args.text else voice_loop(supervisor)
    except (KeyboardInterrupt, EOFError):
        supervisor.stop()
        stop_playback()
        print("\nMeera: Goodbye.")
    finally:
        supervisor.close()


if __name__ == "__main__":
    main()
