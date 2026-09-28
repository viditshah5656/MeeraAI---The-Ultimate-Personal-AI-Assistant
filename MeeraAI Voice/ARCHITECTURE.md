# MeeraAI architecture map

The checked-out application is currently a Python terminal app with a llama.cpp
brain, basic Windows helpers, installer code, local models, and qwentts.cpp. The
Electron/frontend/API tree named in the brief is not present in this workspace.

The first incremental backend slice is in `meera_runtime/`: `supervisor.py`
coordinates deterministic routing, structured tools, policy, persistent tasks,
cancellation, events, local microphone ASR, and native Qwen speech. `main.py` is
the terminal voice interface; `python main.py --text` retains keyboard mode.

Later computer, browser, project, memory, monitoring, API, and UI adapters can be
added behind the same Supervisor without replacing this foundation.

Current voice-agent additions include `research.py` for validated live metasearch,
`memory.py` for explicit secret-filtered semantic memory, source-grounded response
synthesis, tone-aware prompting, and concurrent spoken research acknowledgements.

## Human emotion and speech performance

`meera_runtime/expression.py` sits after the final brain/tool result and before the
native TTS backend. It combines the current turn, recent in-memory dialogue, task
outcome, a persistent decaying emotional state, Meera's personality, and the active
voice profile. It emits a strictly validated `SpeechPerformancePlan`, optional
language-appropriate micro-reaction, and a qwentts.cpp CustomVoice instruction.

Tool payloads never pass through rewriting. Persistent emotion storage contains only
bounded numeric state and frequency counters; private utterances are not written to
the emotion log. Neutral factual answers use the deterministic fast path. Set
`MEERA_EMOTION_DEBUG=true` for compact performance telemetry.

An optional CPU-only GGUF specialist can be configured with
`MEERA_EXPRESSION_MODEL`; it is loaded at startup, refines only high-significance
plans, cannot rewrite speech or issue tools, and falls back to the deterministic
planner on malformed output or excessive latency. It is intentionally unset on the
6 GB deployment so the verified brain and Qwen3-TTS models keep GPU priority.

The native reaction evaluation harness is `scripts/evaluate_tts_expressions.py`.
It writes 24 kHz samples and an objective clipping/silence/duration report below
`.meera/runtime/artifacts/expression-evaluation/` for final listening review.

Speech generation is bounded from the spoken word count to prevent rare runaway
codec output. qwentts and PortAudio are warmed during startup, playback begins from
a 240–750 ms adaptive buffer, and pitch-preserving WSOLA runs at a configurable
`MEERA_TTS_SPEECH_RATE` (1.0 by default). Brain responses are also deduplicated and
trimmed at semantic sentence boundaries before they reach speech.

## Owner voice lock

`meera_runtime/speaker.py` enrolls and verifies captured audio before transcription
or routing.
It uses the CPU-only SpeechBrain ECAPA-TDNN verifier in a separate process so its
PyTorch/OpenMP runtime cannot conflict with llama.cpp or consume the 6 GB GPU.
Enrollment takes three clean samples; only 192-value normalized embeddings are
stored, encrypted for the current Windows account with DPAPI. Raw enrollment audio
is never persisted.

With no owner registered, say `register my voice`. Once locked, the verifier runs
continuously. By default it is advisory during normal chat so natural voice changes
do not cause dropped turns; set `MEERA_VOICE_LOCK_STRICT=true` to make unknown
speakers ignored before their words reach the assistant. An authenticated owner can
say `register second voice`; Meera then requires a fresh random spoken challenge
from the owner before collecting the second speaker's samples. A secondary speaker
cannot authorize another enrollment.

Speech rate changes are stored in the same local SQLite runtime database and loaded
at every start. Explicit post-ASR phrase corrections cover learned names and common
Whisper punctuation variants without rewriting arbitrary conversation.

## Full-duplex conversation

Normal assistant speech is now interruptible. `BargeInCapture` monitors the
microphone while streamed Qwen audio is playing, compares microphone blocks against
the exact outgoing PCM over a moving Windows-latency window, and rejects correlated
speaker echo. Two consecutive energetic non-echo blocks cancel only the current
utterance, retain the user's speech through end-of-utterance VAD, and feed that audio
directly into speaker verification and ASR as the next turn. The warmed TTS server
stays resident, so interruption does not trigger a model reload.

## Recognition accuracy

ASR uses the multilingual Whisper `small` model in an isolated CPU INT8 worker. A
measured, balanced Hinglish/English vocabulary replaces the former unbounded name
hotword list. Audio receives bounded DC/level normalization, and clear turns use one
deterministic beam decode. Only turns below the configured log-probability threshold
receive a second unbiased automatic-language decode. Word probabilities, detected
language, and fallback use remain available as runtime diagnostics.

Transcript correction is evidence-scoped: legitimate words such as `mirror` and the
complete name `Arijit Singh` are preserved, while ambiguous fragments are repaired
only when their surrounding words support the interpretation. Benchmark design,
measurements, limitations, and reproduction commands are documented in
`docs/ASR_RND_REPORT.md`.

## Adaptive dialogue and research continuity

`meera_runtime/dialogue.py` assigns a response depth before generation. Short social
turns use a 96-token budget, ordinary questions use a developed 256-token budget,
and explicit explanations, comparisons, procedures, or selected-news analysis use
up to 512 tokens. The final cleaner applies a matching word ceiling rather than the
old global two-sentence/50-word truncation. Long speech is split at complete sentence
boundaries into bounded Qwen3-TTS requests, and every part remains interruptible.

News searches are stored as a numbered `ResearchSession` in the existing SQLite
runtime database. A request such as `explain the second news` resolves the ordinal,
fetches the selected article (with focused-search fallback), and gives the brain a
long-form evidence block. The selected evidence remains active for explicit indirect
follow-ups such as `why did that happen?` or `what does it mean for ordinary users?`.
Implicit follow-ups are accepted only after research occurs in the current process.
Persisted results still support explicit numbered requests after restart, but an old
article cannot attach itself to unrelated conversation.
All deterministic replies are also recorded into the same bounded discourse history
as model replies, so pronouns can refer to tool results, headlines, and earlier
answers without creating an unrelated new search.

## Mandatory owner voice gate

Voice mode cannot enter its normal conversation loop until an owner voiceprint has
been registered. First-run enrollment starts automatically and requires three
acoustically clean recordings whose transcriptions match three prompted sentences.
Once enrolled, speaker verification runs continuously before normal ASR text reaches
routing, tools, memory, or the brain, but normal chat is allowed to continue unless
`MEERA_VOICE_LOCK_STRICT=true`. Only the registered owner can authorize a second voice.
The operating threshold is capped separately from enrollment similarity so three
carefully read samples cannot make natural short or Hinglish turns overly strict.

ASR also applies a semantic sanity gate after decoding. Repetitive low-information
output and common video/subtitle phrases such as repeated thanks, subscription
prompts, and YouTube URLs are discarded locally and never reach the brain. This
supplements speaker verification; it does not replace it.
