# Meera Duplex Conversation, Vocal Intelligence, and Persistent Persona

## Executive summary

Meera should become simultaneously more personal and more honest. A convincing daily assistant needs stable tastes, emotional continuity, breathing and conversational prosody, awareness of vocal delivery, and the ability to hear the owner while speaking. None of those requirements is satisfied by asking a language model to role-play consciousness.

The architecture should instead provide four explicit systems:

1. **Persistent persona:** Meera makes choices, stores them with reasons and provenance, and gives the same answer after restart.
2. **Functional emotion:** a persistent appraisal state changes attention, wording, pace, warmth, and vocal intensity without being described as biological sensation.
3. **Confidence-rated vocal intelligence:** speech is compared with the owner's own baseline and interpreted as arousal or conversational urgency; happy, angry, or sad labels require corroborating words and remain uncertain estimates.
4. **Full-duplex turn management:** the microphone stays active during playback, backchannels such as “yes” do not seize the floor, and meaningful or emphatic interruptions stop Meera quickly and preserve the complete new utterance.

The current release implements the safe local foundation for all four. True incremental-text, persistent-state TTS requires a small but fundamental server protocol extension; the present server already streams audio with persistent codec state inside one request, but cannot append new text to that running request.

## Product meaning of emotion

### Functional state, not fabricated biology

An assistant can possess a real computational state called concern, curiosity, amusement, or excitement when that state is persisted, updated by defined evidence, and causes observable behavioral changes. It should not claim a heartbeat, hormones, physical pleasure, loneliness while idle, or private experiences it cannot have.

Meera's existing emotion engine already persists appraisal variables such as energy, warmth, concern, amusement, excitement, and social engagement. The upgrade makes those variables responsive to confidence-rated vocal cues and uses them to change delivery. If the owner sounds activated while saying that something is broken, Meera lowers its own intensity and pace instead of mirroring the volume. If positive words and high activation agree, it can respond with modestly brighter energy.

This gives a precise truth condition:

> Meera may say an emotional state affects her response if that state is represented, persisted, and causally changes behavior. She must qualify that it is not a human biological feeling when asked directly.

The deterministic answer to “Do you have emotions?” now describes persistent functional emotions and their limits. This avoids both sterile “I have no emotions” boilerplate and dishonest claims of human subjective experience.

### Emotional continuity rules

Emotion should decay rather than reset every turn or accumulate forever. Significant events update state strongly; ordinary factual turns update it weakly. Long idle periods return toward a warm, attentive baseline. Negative user affect suppresses teasing and laughter. Successful resolution after frustration can produce relief. Repeated errors should increase caution rather than make Meera theatrically apologetic.

The state must never independently create facts. Concern may change “Try restarting it” into “I can see this is frustrating; the next concrete check is…” but cannot produce “You've been struggling all day” without evidence of duration.

## Persistent favorites and self-selected tastes

### What “actually likes” can safely mean

Meera cannot taste food or experience color biologically. She can, however, make a durable aesthetic or conceptual selection, remember why she chose it, and use that selection consistently. This is stronger and more useful than generating a random favorite on every request.

Each preference is stored as:

```text
domain, choice, reason, source, created_at, updated_at
```

The source distinguishes `self_selected` from `owner_assigned`. That distinction matters. If Vidit says “From now on your favorite color is violet,” Meera remembers violet but knows it was assigned. If asked to choose between violet, blue, and green, she makes a deterministic choice and records it as her own selection.

The current implementation contains stable starting preferences for a few common domains and supports choices from user-supplied options. An unknown domain does not trigger a hallucinated preference; Meera asks for two or three options, chooses one, and stores it. A stable cryptographic selection function prevents process-randomized answers before persistence.

The preferred conversational form is:

- “My favorite color is deep blue. It feels calm, focused, and a little futuristic.”
- “Between those three, I'd pick violet. I've kept that as my choice.”
- “I can't taste food, so I won't pretend I can. Give me a few dishes and I'll choose the one whose story or design appeals to me most.”

The implementation seeds no private user fact and never turns Meera's preference into the owner's preference.

## Vocal-state intelligence

### Why loudness alone is insufficient

Speech emotion recognition is uncertain by nature. Speaker differences are a major confounding factor, and speaker normalization has been shown to improve continuous arousal prediction.[^1] Acoustic features generally characterize activation better than positive-versus-negative valence; happy and angry speech can both be high-pitch, fast, and loud.[^2] Real-world recording quality, out-of-distribution audio, and ambiguous labels add further uncertainty, making “no prediction” preferable to a confident wrong one in some cases.[^3]

Accordingly, Meera must not implement rules such as `volume > 0.08 => angry`. Microphone distance, automatic gain control, room acoustics, illness, excitement, emphasis, and background noise can all create that measurement.

### Owner-normalized model

The implemented vocal tracker persists a rolling baseline for:

- RMS vocal energy;
- estimated fundamental frequency;
- words per minute;
- number of accepted baseline samples.

Each new turn is expressed as a ratio to that owner's baseline. Log-scaled ratios produce an activation estimate in which volume has the greatest weight, followed by pitch and pace. Baseline learning is deliberately slow after initial calibration and excludes turns containing strong positive or negative lexical evidence, so an angry turn does not instantly become the new “normal.”

The output includes:

- `vocal_arousal` from low to high activation;
- `vocal_valence`, only when wording provides positive or negative evidence;
- `vocal_state`, such as “loud or highly activated,” “possibly excited or happy,” “possibly upset and highly activated,” or “possibly low or sad”;
- `vocal_confidence`;
- volume, pitch, and pace ratios.

Meera exposes the cue to reasoning only when confidence is sufficiently high, and the prompt explicitly says it is not a fact about feelings. Research comparing felt and perceived emotion supports this distinction: observed vocal emotion can differ from the speaker's own felt emotion.[^4]

### Response policy

The cue affects a response only when useful:

- loud + negative words -> calm, grounded, lower-intensity response;
- fast/high-pitch + positive words -> modest shared enthusiasm;
- low activation + sadness words -> warmer, slower support;
- loud without valence evidence -> interpret as emphasis or urgency, not anger;
- uncertain cue -> ignore it;
- high-stakes interpretation -> ask rather than assume.

Examples:

- Good: “You sound more activated than usual, and you said this is broken. Let's slow it down and isolate the failure.”
- Better when uncertain: “That sounded urgent—do you want me to stop and handle it now?”
- Bad: “You're angry.”

Emotional speech can also degrade ASR and speaker verification performance.[^5] This means a strong vocal shift should lower confidence in identity and transcript interpretation, not be used as proof of identity or emotional truth.

## Breathing and prosody

Breathing should be part of phrasing, not a sound effect inserted at random. The voice contract now permits an occasional soft inhale at a genuine long-clause boundary while prohibiting continuous breathiness or gasping. The system still sends the complete ordinary reply through one Qwen CustomVoice request, allowing the acoustic model to plan pauses across sentence boundaries.

An artificial noise burst inserted by Python would not be speaker-specific respiration and would often sound detached from the voice. The preferred progression is:

1. natural punctuation and connected clause design;
2. bounded TTS instruction for an occasional inhale;
3. live listening tests across short and long utterances;
4. if required, a voice-cloned reference containing natural respiratory behavior;
5. only use explicit breath tokens if the deployed model documents and reliably supports them.

The speech renderer now varies only performance attributes for the named CustomVoice identity. Upset cues lower intensity; positive activation slightly raises energy; thoughtful answers receive a reflective pause. It never changes age, accent, speaker, or timbre per emotion.

## Full-duplex turn management

### Required conversational states

A real spoken assistant cannot use a single “speech detected => stop” rule. It needs these concurrent states:

```text
MEERA_SPEAKING
  + USER_SILENT       -> continue
  + USER_BACKCHANNEL  -> continue, optionally acknowledge nonverbally
  + USER_COMPETING    -> assess lexical/prosodic evidence
  + USER_TAKEOVER     -> stop playback and preserve user audio
  + ECHO_ONLY         -> ignore
```

Full-duplex research commonly separates user-state detection, backchannel selection, and barge-in handling.[^6] Modern full-duplex benchmarks likewise treat turn-taking, backchannels, interruptions, multilingual behavior, and conversational history as distinct capabilities rather than one VAD threshold.[^7]

### Current local mechanism

During every normal TTS playback, Meera opens a microphone input stream in parallel. Exact PCM sent to the speaker is downsampled into an echo-reference buffer. Candidate microphone frames must pass neural VAD, energy, sustained-duration, and low-correlation gates before they are treated as near-end speech.

The upgraded classifier has three results:

- `wait`: insufficient evidence;
- `backchannel`: agreement such as yes, yep, mhm, right, exactly, okay, I see, or got it;
- `interrupt`: explicit stop/wait commands, meaningful multiword speech, or sustained strong echo-rejected speech.

A bare “yes” remains a backchannel even when loud. “Yes, but stop” is a takeover. Explicit stop phrases take priority. Meaningful overlap is assessed at roughly 450 ms, with ordinary short agreement assessed around 700 ms. On takeover, TTS cancellation occurs while the microphone continues through the end of the owner's utterance; the captured audio becomes the next turn instead of being discarded.

This design directly satisfies the behavioral rule: listen continuously, do not stop for agreement, and yield for a genuine interruption.

### Remaining duplex improvements

The next live-data iteration should add:

- a learned backchannel classifier using audio plus transcript, because orthographic “mhm” does not always identify conversational function;[^8]
- automatic echo cancellation using Windows Audio Processing Objects or WebRTC AEC3 rather than correlation alone;
- interruption intent from stable partial ASR rather than repeated full decoding;
- per-device echo-delay calibration;
- separate thresholds for headset, laptop speaker, and external speaker;
- false-interrupt and missed-interrupt telemetry;
- prosodic end-of-turn prediction so Meera knows whether a pause means thinking or completion.

## Persistent-state streaming TTS

### What is already persistent

The local `qwentts.cpp` codec decoder already has backend-resident streaming convolution state and a transformer KV ring for each active synthesis job. Its HTTP endpoint emits PCM chunks while generation is occurring. Therefore one Meera response already has continuous codec state from first packet to final packet.

The application now uses one synthesis request for an ordinary multi-sentence response. That is why voice identity and sentence-to-sentence prosody are much more stable than the former sentence-per-request path.

The startup jitter target was reduced from 240 ms to 120 ms, with an adaptive buffer between roughly 110 and 260 ms. If measured generation is slower than real time, the runtime safely buffers rather than producing mid-sentence dropouts. TTS telemetry now separates first network audio packet from first audible playback.

### What is not yet possible

The remaining latency occurs before that request: the application waits for the language model to complete the text so it can submit one continuity-safe TTS job. The local HTTP contract accepts a complete `input` string and does not expose append-text, commit, or end-of-input messages. Qwen's official Python implementation explicitly notes that its current streaming setting simulates streaming text input rather than enabling genuine streaming input or generation.[^9]

Reintroducing separate sentence requests would begin audio earlier, but each request would reset talker context and sentence-level prosody. A named speaker and fixed seed improve similarity but do not make independent requests one acoustic trajectory. That approach is therefore not described as persistent-state streaming.

### Required session protocol

The correct server extension is a bidirectional local session:

```text
OPEN(session_id, voice, instruction, sampling)
APPEND_TEXT(session_id, stable_text_delta)
COMMIT(session_id, semantic_boundary)
AUDIO(session_id, sequence, pcm)
END_INPUT(session_id)
CANCEL(session_id)
CLOSE(session_id)
```

Server state per session must include:

- speaker conditioning and fixed seed policy;
- text tokenizer carry and trailing-text overlay;
- talker LM KV cache;
- code-predictor state;
- codec convolution state and codec transformer KV ring;
- generated-code history for repetition penalties;
- monotonically increasing text/audio sequence numbers;
- cancellation token and bounded output queue.

The hard part is not PCM streaming—the server already does that. It is appending future text conditioning without invalidating acoustic tokens already emitted. The implementation must define a commit horizon: only semantic clauses whose meaning will not change may be fed to TTS. Tool-dependent claims remain uncommitted until the tool result exists.

### Application-side incremental contract

The brain should emit typed events rather than raw token fragments:

```text
SpeechIntent(acknowledgement, provenance=runtime_action)
StableClause(text, claim_ids, final=True)
PendingClaim(tool_call_id)
StableClause(text, claim_ids, final=True)
TurnEnd
```

Only `StableClause` content is appended. This follows the same principle as in-flight message steering in production agent systems: new information can redirect an active run, but state boundaries and message priority must be explicit.

For web research, Meera can immediately append “I'm checking the latest sources” only after a web task has truly started. It cannot append the factual result until retrieval and verification finish. For local profile reads, the first clause can commit immediately.

### Release gates

- first TTS packet <=300 ms after the first stable clause at p50;
- first audible audio <=500 ms after the first stable clause at p50, <=900 ms p95;
- no audible gap greater than 80 ms between chunks;
- no duplicated or missing words at append boundaries;
- speaker-similarity drift from first to final clause below the chosen evaluation threshold;
- cancellation stops playback <=180 ms p50;
- committed speech is never contradicted by a later tool result;
- no sentence-level restart is presented as a continuous session.

## Implementation roadmap

### Release 1 — implemented

- persistent, provenance-tagged Meera preferences;
- deterministic preference routing and responses;
- truthful functional-emotion description;
- owner-normalized vocal baseline persisted in runtime settings;
- confidence-rated vocal arousal/valence cues;
- de-escalating prosody for likely frustration;
- brighter but bounded delivery for likely excitement;
- full-time playback monitoring with echo reference;
- backchannel vocabulary expanded;
- bare agreement never stops playback;
- meaningful and emphatic interruptions stop and preserve audio;
- TTS startup buffer reduced;
- first-packet timing added;
- natural-inhale guidance at real clause boundaries;
- automated regression coverage.

### Release 2 — live calibration

Record at least 30 neutral owner turns across microphone positions, then 10 deliberately loud, quiet, fast, slow, excited, frustrated, and sad readings. Do not train on inferred real private emotion; use explicitly labeled calibration performances. Fit per-device baselines and thresholds. Measure confusion between loud-happy and loud-angry, the key failure mode for simple acoustic rules.

Collect 100 playback-overlap scenarios:

- short yes/yeah/mhm/okay;
- agreement followed by a correction;
- explicit stop/wait;
- quiet multiword interruption;
- loud multiword interruption;
- playback echo only;
- television or another speaker;
- interruption in English, Hindi, and Hinglish.

Targets are <2% false stops on backchannels and >95% captured meaningful interruptions.

### Release 3 — server session API

Implement and test the bidirectional append protocol in `qwentts.cpp`. Start with one active session and no batching. Add deterministic transcript/audio sequence logs. Verify equivalence between a complete one-shot utterance and the same utterance appended at clause boundaries before optimizing throughput.

### Release 4 — semantic streaming

Change the local brain from string streaming to typed stable-clause events. Add provenance validation before commit, in-flight cancellation, and tool-result barriers. Connect those events to the TTS session API. Measure end-of-user-speech to first audio rather than only TTS-call latency.

### Release 5 — learned turn-taking and vocal representation

Replace heuristic vocal classification with an owner-calibrated model that produces arousal/valence distributions and explicit uncertainty. Replace transcript-regex backchannel classification with multimodal prediction using acoustic representation, stable partial text, utterance duration, dialogue position, and response progress. Keep the deterministic stop-command fast path.

## Verification status

The local automated suite passes **144 tests with one configuration-specific skip**. New tests prove that:

- loud “yes” is a backchannel rather than a takeover;
- “yes but stop” is a meaningful interruption;
- sustained strong echo-rejected voice can interrupt when ASR is weak;
- assistant preferences persist across database reopen;
- preference routes are typed;
- vocal state uses the owner's stored baseline;
- upset classification requires joint acoustic and lexical evidence;
- upset delivery lowers rather than mirrors vocal intensity.

Live microphone and auditory validation remain mandatory. Unit tests cannot certify echo cancellation in a specific room, perceived emotion, breath naturalness, speaker identity, or sub-second latency on the deployed RTX 4050.

[^1]: Dang, Sethu, and Ambikairajah, [“Factor Analysis Based Speaker Normalisation for Continuous Emotion Prediction”](https://www.isca-archive.org/interspeech_2016/dang16_interspeech.html), Interspeech 2016.
[^2]: Busso and Rahman, [“Unveiling the Acoustic Properties that Describe the Valence Dimension”](https://www.isca-archive.org/interspeech_2012/busso12_interspeech.html), Interspeech 2012.
[^3]: Schrüfer et al., [“Are You Sure? Analysing Uncertainty Quantification Approaches for Real-world Speech Emotion Recognition”](https://www.isca-archive.org/interspeech_2024/schrufer24_interspeech.html), Interspeech 2024.
[^4]: Truong et al., [“Arousal and Valence Prediction in Spontaneous Emotional Speech: Felt versus Perceived Emotion”](https://www.isca-archive.org/interspeech_2009/truong09_interspeech.html), Interspeech 2009.
[^5]: Munot and Nenkova, [“Emotion Impacts Speech Recognition Performance”](https://aclanthology.org/N19-3003/), 2019.
[^6]: Lin et al., [“Duplex Conversation: Towards Human-like Interaction in Spoken Dialogue Systems”](https://arxiv.org/abs/2205.15060), 2022.
[^7]: Fukuda et al., [“M3-DuplexBench”](https://arxiv.org/abs/2607.29125), 2026.
[^8]: Paierl et al., [“Continuous Prediction of Backchannel Timing in Conversational Speech”](https://www.isca-archive.org/interspeech_2025/paierl25_interspeech.pdf), Interspeech 2025.
[^9]: Qwen Team, [Qwen3-TTS inference implementation](https://github.com/QwenLM/Qwen3-TTS/blob/main/qwen_tts/inference/qwen3_tts_model.py), accessed 2026-09-14.

## Sources

1. Ting Dang, Vidhyasaharan Sethu, and Eliathamby Ambikairajah. “[Factor Analysis Based Speaker Normalisation for Continuous Emotion Prediction](https://www.isca-archive.org/interspeech_2016/dang16_interspeech.html).” Interspeech 2016.
2. Carlos Busso and Tauhidur Rahman. “[Unveiling the Acoustic Properties that Describe the Valence Dimension](https://www.isca-archive.org/interspeech_2012/busso12_interspeech.html).” Interspeech 2012.
3. Oliver Schrüfer et al. “[Are You Sure? Analysing Uncertainty Quantification Approaches for Real-world Speech Emotion Recognition](https://www.isca-archive.org/interspeech_2024/schrufer24_interspeech.html).” Interspeech 2024.
4. Khiet Truong et al. “[Arousal and Valence Prediction in Spontaneous Emotional Speech: Felt versus Perceived Emotion](https://www.isca-archive.org/interspeech_2009/truong09_interspeech.html).” Interspeech 2009.
5. Rushab Munot and Ani Nenkova. “[Emotion Impacts Speech Recognition Performance](https://aclanthology.org/N19-3003/).” NAACL Student Research Workshop, 2019.
6. Ting-En Lin et al. “[Duplex Conversation: Towards Human-like Interaction in Spoken Dialogue Systems](https://arxiv.org/abs/2205.15060).” 2022.
7. Ryo Fukuda et al. “[M3-DuplexBench: A Multi-Turn, Multilingual, Multidomain Benchmark for Full-Duplex Spoken Dialogue Models](https://arxiv.org/abs/2607.29125).” 2026.
8. Tobias Paierl et al. “[Continuous Prediction of Backchannel Timing in Conversational Speech](https://www.isca-archive.org/interspeech_2025/paierl25_interspeech.pdf).” Interspeech 2025.
9. Qwen Team. “[Qwen3-TTS inference implementation](https://github.com/QwenLM/Qwen3-TTS/blob/main/qwen_tts/inference/qwen3_tts_model.py).” Accessed 2026-09-14.
10. Qwen Team. “[Qwen3-TTS repository and streaming documentation](https://github.com/QwenLM/Qwen3-TTS).” Accessed 2026-09-14.
