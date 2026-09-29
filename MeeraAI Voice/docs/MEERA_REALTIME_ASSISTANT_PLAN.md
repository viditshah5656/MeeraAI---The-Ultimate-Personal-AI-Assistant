# Meera: real-time personal assistant engineering plan

Date: 2026-09-13  
Target machine: Windows, Intel i5-13420H, NVIDIA RTX 4050 Laptop GPU (6 GB VRAM)  
Current core models: Qwen3.5-2B IQ4_NL brain; Qwen3-TTS 1.7B GGUF voice; Faster-Whisper ASR

## Executive decision

Do not start by replacing Qwen or rewriting everything. The largest delay is created by orchestration, not raw model speed: the live path waits for a complete answer and then submits the complete paragraph to TTS. Meera already has token and sentence streaming code, but normal conversation does not use it.

The target is an event-driven, full-duplex session in which listening, transcript stabilization, intent prediction, safe retrieval, answer generation, speech synthesis, playback, and interruption handling overlap. The same redesign also establishes an evidence policy so a small local model does not invent answers when it should retrieve, ask, or admit uncertainty.

Literal zero latency is neither possible nor human. Natural turn transitions cluster around roughly 200 ms, and humans prepare responses while listening. Meera should therefore optimize perceived latency: stable partial ASR starts reversible preparation before the user finishes; the final endpoint commits the turn; LLM tokens are assembled into short speakable phrases; TTS and playback begin while later text is still being generated.

## Implementation status — first slice completed 2026-09-14

- Normal local chat now consumes `Supervisor.stream_dialogue()` instead of waiting for `Supervisor.handle()` to finish a full response.
- The phrase assembler can release safe clause boundaries before a full sentence ends.
- Partial ASR hypotheses use two-pass stable-prefix agreement; the complete utterance is always decoded again as the canonical final transcript.
- The ASR IPC connection has one serialized owner and request/revision IDs.
- The blocking LLM semantic-endpoint call was replaced with a deterministic syntax hint, including the `INCOMPLETE` parsing bug fix.
- Global wake-name prompt/hotword bias is empty by default, while explicitly learned pronunciations remain available.
- Valid short turns such as “hello,” “thanks,” “bye,” and “because” are no longer discarded as hallucinations.
- Memory retrieval now requires positive meaningful-word overlap; zero-relevance memories are not injected.
- TTS startup buffering was reduced from an effective 420–720 ms floor to an adaptive 180–360 ms range with a 240 ms default, and the audio stream requests low device latency.
- Research acknowledgements are deterministic and immediate; they no longer consume a separate LLM generation.
- Every live turn now records a revision, route, stage durations, and event timeline from speech onset through playback.
- The universal app launcher no longer interpolates model text into PowerShell, and credentialed CORS is restricted to loopback browser origins.
- The installer now includes the runtime packages required by voice, API, screen, and test paths.

Validation: 122 core tests passed under Python 3.10; 5 hybrid-TTS tests passed in `tts-env`. A local warm benchmark measured 422 ms to the first raw token and 204 ms to the first speakable phrase on the prompt-cached second request. These are model-only measurements; live microphone-to-audible latency must be collected from the new telemetry before further buffer/model tuning.

## What the codebase is doing now

### 1. The normal chat path is batch, not streaming

`main.py:514-536` calls `supervisor.handle(...)`, waits for the entire response, and only then sends `result.speech_text` to `speak_live`. The comments say the paragraph will stream natively, but downstream audio streaming cannot recover the time already spent waiting for all LLM tokens.

Meanwhile, `meera_runtime/supervisor.py:431-459` already exposes `stream_dialogue()`, which yields sentence/instruction pairs. The main loop bypasses it for ordinary conversation. This is the biggest immediate source of the “listen, wait, response” feeling.

### 2. Partial ASR can become the final transcript even when stale

`main.py:296-317` re-transcribes the growing utterance about every 600 ms. At endpoint, `main.py:336-344` accepts `last_streaming_text` and skips a final decode. If the last partial finished before the user's last words, those words are silently dropped.

`MicrophoneASR.transcribe()` uses one multiprocessing Pipe without request IDs or an explicit client-side serialization lock (`meera_runtime/voice.py:1310-1353`). Partial, final, and barge-in work therefore need a single owned ASR queue rather than independent callers sharing the connection.

### 3. The semantic endpointer is both blocking and logically broken

At a silence boundary, `capture_stream()` synchronously invokes the main Qwen model to decide COMPLETE versus INCOMPLETE. This competes for the same model/GPU just before response generation. In `meera_runtime/semantic_endpointer.py:12`, the check is `"COMPLETE" in answer`; the string `"INCOMPLETE"` also contains `"COMPLETE"`, so the expensive ambiguity path cannot behave as intended.

### 4. ASR configuration encourages both contention and hallucination

The default ASR model is `Systran/faster-whisper-large-v3`, device is `auto`, and language is forced to English (`config.py:128-137`). On this 6 GB GPU, automatic CUDA placement competes with the LLM and TTS. Every decode also receives an initial prompt and hotwords centered on “Meera” (`voice.py:1036-1037`), which can bias silence/background audio toward the wake name.

Word timestamps are disabled, but confidence-aware downstream code expects word information. The transcript rejection list also treats valid one-turn utterances such as “hello,” “thanks,” “bye,” “but,” and “because” as hallucinations (`voice.py:1364-1372`). That creates apparent deafness and unnatural repair loops.

The repository's ASR report says a five-utterance synthetic test favored multilingual-small on CPU INT8, but runtime defaults no longer match that result. Five synthetic clips are not enough to choose a production recognizer for the owner's microphone, accent, room noise, and Hinglish/Gujarati usage.

### 5. Unrelated memory is injected into prompts

`MemoryStore.relevant()` ranks recent memories by token overlap but returns up to eight even when scores are zero (`meera_runtime/memory.py:104-114`). An unrelated remembered fact can therefore contaminate every answer. The brain also holds process-global conversation history instead of a session-owned dialogue state.

### 6. Most factual chat has no evidence requirement

The router sends only regex-recognized “latest/current/search/news” requests to the web. Other factual requests go directly to a 2B model. A small local model is useful for conversation, rewriting, intent extraction, and grounded synthesis; it should not be treated as a database of reliable facts.

The grounded web path reduces fabrication but runs two full LLM passes—draft plus evidence audit—before speech. This is useful for high-risk research, not as the default latency profile for every grounded answer.

### 7. Interruption begins too late and history records unheard content

Barge-in requires about 192 ms of detected speech, then waits for roughly 800 ms of speech before transcribing and deciding whether to stop playback (`voice.py:2167-2184`). That is not a quick conversational interruption. Echo correlation also scans a long PCM reference in Python for every frame.

Because the full answer is committed before playback, words the user never heard can remain in conversation history. A real duplex assistant needs a playback ledger and must commit only the portion actually heard.

### 8. Existing latency logs are not an observability baseline

The tracer exists, but the live voice loop does not mark all stages. Repeated synthetic values in the log cannot explain the user's actual delay. The included stress report measured roughly 7.25 s for a cold first turn and around 1.5 s for one warm local answer, but it is not a microphone-to-first-audio benchmark.

### 9. Daily-assistant capability and safety are incomplete

Current tools cover search, pages, screen/file discovery, speech, system status, and app launching. A daily assistant still needs reminders, timers, tasks, calendar, contacts, notifications, routines, and a permission model.

`system.open_app_universal` interpolates model-controlled text into PowerShell and uses `shell=True` (`supervisor.py:289-301`). The local API allows wildcard origins with credentials (`meera_runtime/api/app.py:304`). Both must be fixed before Meera becomes always-on or gains more personal access.

## Target interaction contract

For every utterance, Meera first classifies the epistemic and action state—not merely the topic.

1. **Known personal fact:** answer from a high-confidence, attributable profile or memory item.
2. **Missing personal fact:** ask one natural question, then save only with the user's answer and a provenance timestamp.
3. **Stable general knowledge:** answer locally when confidence is high; use restrained language when it is approximate.
4. **Current, niche, or externally verifiable fact:** retrieve first, then answer with the source and timestamp available to the UI/log.
5. **Ambiguous request:** ask a focused clarification instead of guessing.
6. **Reversible local action:** execute through an allowlisted typed tool and report the result.
7. **Consequential/external action:** show or speak the proposed action and require confirmation at execution time.
8. **Unsupported request:** say what is missing and offer the closest safe next step.

This produces the desired behavior: if she does not know something about the user, she asks; if she knows it, she can answer deeply; if the answer depends on the outside world, she looks it up.

## Target architecture

### Session state machine

Replace the procedural loop with one long-lived `AssistantSession` owning explicit states:

`IDLE -> USER_SPEAKING -> ENDPOINT_PENDING -> THINKING -> SPEAKING`

Transitions may overlap through cancellable jobs. A user voice event while `THINKING` cancels speculative generation. A user voice event while `SPEAKING` immediately pauses output, captures the interruption, and either commits the interruption or resumes after a false trigger/backchannel.

Use one `asyncio` event loop and bounded, persistent workers. Do not create a new `ThreadPoolExecutor` for every turn. Every event carries `session_id`, `turn_id`, `revision`, `created_at`, and `cancel_token`. Late results from an old transcript revision are discarded.

### Audio and ASR path

- Keep the microphone open and write 20–32 ms frames to a ring buffer.
- Run Silero VAD on frames; it is cheap enough not to be the bottleneck.
- Give exactly one ASR worker ownership of the recognizer and IPC channel.
- Assign request/revision IDs to every partial and final decode.
- Decode rolling windows and apply LocalAgreement: only words shared by consecutive hypotheses become stable.
- At endpoint, always run/reconcile a final decode over the complete utterance. Never promote an arbitrary stale partial to final.
- Remove global wake-name prompt bias. Add proper nouns only for the active domain and only after measuring false insertions.
- Detect language per session/utterance where needed; preserve code-switching rather than forcing every utterance to English.
- Make hallucination rejection acoustic/confidence based. Do not blacklist legitimate conversational words globally.
- Use deterministic punctuation/syntax rules for obvious endpoints. Run a small end-of-turn classifier only for ambiguous pauses, asynchronously with a strict deadline. Fix exact parsing (`answer.strip() == "COMPLETE"`) immediately.

### Reversible prefetch while the user speaks

Once a partial transcript is stable, Meera may begin only reversible, side-effect-free work:

- load likely profile/memory candidates;
- detect “current/latest/today” and start a cancellable web search;
- warm the relevant tool capability/schema;
- prepare a response outline or KV-cache prefix.

Nothing external is sent, changed, or committed until the final transcript is accepted. A revision invalidates all speculative work with an older revision number.

### Reasoning and truth path

Introduce an `AnswerPlan` with typed fields:

- `mode`: social, personal, local_knowledge, web_grounded, tool, clarify, refuse;
- `confidence`: high, medium, low;
- `evidence_required`: boolean;
- `memory_ids` and `source_ids`;
- `response_depth`: brief, normal, deep;
- `proposed_tool_call` and confirmation policy.

Routing should combine deterministic rules with a small structured-output classifier. Rules take priority for safety and obvious current-data cues. The model does not get every tool schema on every turn: load capabilities on demand to reduce prompt size and tool confusion.

Use a claim ledger for factual responses. Every material claim is one of:

- model-common knowledge (low-risk only);
- personal memory with provenance;
- retrieved source span with timestamp;
- tool result;
- clearly marked inference.

If evidence is required and no evidence arrives, Meera asks, searches again, or says she could not verify it. She does not silently fall back to invention.

For ordinary web answers, stream from a source-backed outline and run lightweight claim checks incrementally. Reserve the current second full-model audit for high-stakes, long-form, or conflicting-source requests.

### Memory that behaves like a person, not prompt stuffing

Split memory into typed stores:

- **Profile:** name, pronunciation, timezone, stable preferences, consent flags.
- **Relationships:** people and user-defined relationships, with confidence and provenance.
- **Episodic:** short summaries of meaningful interactions, with expiry/decay.
- **Projects and commitments:** goals, decisions, open loops, reminders.
- **Semantic documents:** notes and files indexed for retrieval.
- **Conversation:** session-local turns plus a compact running summary.

Every item stores `id`, `type`, `value`, `source_turn`, `created_at`, `last_confirmed_at`, `confidence`, `sensitivity`, and optional expiry. Retrieval uses filters plus lexical/vector similarity and a minimum threshold. Zero-score memories are never included. The response records exactly which memory IDs influenced it.

Meera should ask about the user gradually and contextually, not conduct an onboarding interview every time. Unknown fields are questions only when relevant: “Which city should I use for that reminder?” A user correction supersedes the old value but retains an audit trail.

### Speech production

The hot path is:

`LLM tokens -> speakable phrase assembler -> TTS input queue -> PCM jitter buffer -> playback`

- Do not wait for a full sentence when punctuation is slow. Emit a semantically safe phrase after roughly 6–14 words or a strong clause boundary.
- Never emit an unfinished number, URL, entity, code fragment, or tool result.
- Keep the TTS server, voice identity state, tokenizer, and output stream hot.
- Preserve one voice instruction for the turn; do not recreate identity or prosody per chunk.
- Start with a 160–240 ms adaptive PCM buffer and grow only after a measured underflow. The present 480 ms default is a direct latency floor.
- Crossfade adjacent audio chunks by a few milliseconds and normalize loudness across the turn.
- Let the phrase producer stay only one or two chunks ahead so cancellation is cheap.
- Use a deterministic bank of very short acknowledgements for genuinely long tools. Do not spend an LLM call generating “Let me check,” and do not fill every normal pause with chatter.

Official Qwen3-TTS packaging should be treated as batch/prototyping unless the specific qwentts.cpp path proves incremental text-to-audio behavior under measurement. Architecture-level low-latency claims are not evidence that the installed API streams from growing text.

### Full-duplex interruption

- Prefer an OS/WebRTC acoustic echo canceller; do not make per-frame brute-force correlation the long-term AEC design.
- On sustained user speech, pause playback within 120–200 ms. Classify backchannel versus interruption concurrently after pausing.
- If it is a backchannel (“mhm,” “right”), resume smoothly from the buffer.
- If it is an interruption, cancel LLM/TTS work, retain microphone pre-roll, and begin the new turn.
- Track word/phoneme playback timestamps. Commit only the text actually heard to history; attach `interrupted_at_ms` and `heard_text` to the turn.

## Latency service-level objectives

Measure from the acoustic end of the user's speech, not from after transcription.

| Stage | Warm p50 | Warm p95 | Rule |
|---|---:|---:|---|
| Endpoint commit | <=180 ms | <=350 ms | Ambiguous pauses may wait longer; obvious endpoints do not |
| Final ASR reconciliation | <=250 ms | <=500 ms | May overlap endpoint decision |
| Route + memory selection | <=30 ms | <=80 ms | No LLM in the common deterministic path |
| Local LLM first token | <=150 ms | <=300 ms | Hot model and prompt/KV cache |
| First speakable phrase | <=300 ms | <=550 ms | Measured from committed turn |
| TTS first PCM | <=250 ms | <=500 ms | Hot server; adaptive buffering |
| Playback/device | <=60 ms | <=100 ms | Persistent output stream |
| Ordinary speech onset, end-to-end | <=700 ms | <=1,200 ms | Primary user-visible SLO |
| Barge-in playback pause | <=150 ms | <=250 ms | From sustained user speech onset |

These are engineering gates, not promises derived from the current logs. Phase 0 must establish what this exact hardware can achieve. If Qwen3-TTS cannot meet first-PCM SLOs, retain it for expressive/long responses and use a faster local voice for conversational first phrases, or replace it after a blind voice-quality/latency evaluation.

## Resource placement for the 6 GB GPU

Start with a measured static policy:

- Keep the Qwen3.5-2B GGUF brain on GPU through one long-lived llama.cpp server/process.
- Run the selected Whisper model on CPU INT8 initially to avoid GPU eviction/serialization; benchmark GPU ASR only as a controlled alternative.
- Run qwentts.cpp on GPU only while measuring actual coexistence, VRAM headroom, first-PCM latency, and LLM TTFT during speech.
- Give speech generation a bounded priority window, but do not globally stall all cognition; web I/O and CPU retrieval continue.
- Avoid loading both 1.7B TTS variants. Load only the active voice model and codec.

Use llama.cpp's prompt caching and streaming server interface. Evaluate n-gram or small draft speculative decoding only after the pipeline is correct; speculative decoding cannot compensate for waiting on a full answer.

## Implementation roadmap

### Phase 0 — trustworthy benchmark harness (2–3 days)

Deliverables:

- Instrument every real turn with `turn_id` and monotonic timestamps: voice onset/end, VAD endpoint, partial/final ASR, route, retrieval, LLM first token, phrase ready, TTS request, first PCM, first audible sample, completion, interruption.
- Record CPU/GPU utilization, VRAM, queue depth, audio underflows, transcript revision count, and cancellation latency.
- Build an owner-recorded corpus of at least 200 utterances across close/far mic, fan/TV/noise, English, Hindi, Gujarati, and code-switching; include names, short replies, corrections, and interruptions.
- Add a replay runner so every pipeline revision is tested on identical audio.
- Establish cold and warm baselines; never mix them in one percentile.

Exit gate: p50/p95 timelines for at least 100 ordinary turns, WER/entity error by condition, and reproducible traces that match audible behavior.

### Phase 1 — correctness and safety blockers (3–5 days)

- Fix semantic endpointer exact parsing and remove main-LLM blocking from capture.
- Serialize ASR ownership; add request/revision IDs and mandatory final reconciliation.
- Remove global transcript word blacklist; replace it with signal, no-speech, repetition, and language-aware checks.
- Stop globally biasing every decode toward “Meera.”
- Add a memory score threshold and stop including zero-relevance items.
- Move conversation history into a session object.
- Replace PowerShell string interpolation and `shell=True` with resolved, allowlisted executable targets and literal arguments.
- Bind API to loopback, add a session secret, restrict origins, and separate read from write/action endpoints.

Exit gate: no dropped final words in replay, valid one-word turns survive, zero irrelevant memory injection, and tool/API security tests pass.

### Phase 2 — streaming hot path (1–2 weeks)

- Add `AssistantSession`, event types, bounded queues, cancellation, and response ledger.
- Wire `stream_dialogue()` or a replacement token stream into a phrase assembler.
- Feed phrases incrementally to TTS and maintain a persistent playback stream.
- Add reversible partial-intent prefetch with revision cancellation.
- Tune buffer size from underflow data, not comments or intuition.

Exit gate: ordinary warm speech onset p50 <=700 ms and p95 <=1.2 s; no audible gap between synthesized chunks; interruption cancels future audio.

### Phase 3 — truth and routing layer (1 week)

- Implement typed `AnswerPlan` and evidence-required policy.
- Add current/niche/high-stakes detection and web retrieval deadlines.
- Add source-span and memory provenance to the internal claim ledger.
- Load tool descriptions/capabilities on demand.
- Add “ask, retrieve, answer, or abstain” eval cases.

Exit gate: no unsupported factual assertion in the curated eval set; every web-dependent answer exposes its source IDs; ambiguous personal questions ask rather than fabricate.

### Phase 4 — human conversation and durable memory (1–2 weeks)

- Implement typed memory, corrections, sensitivity, consent, confidence, decay, and session summaries.
- Add response-depth control, discourse cues, repairs, and context-sensitive follow-up questions.
- Implement pause-first barge-in, false-interruption resume, and heard-text history truncation.
- Tune on recorded multi-turn conversations, not isolated text prompts.

Exit gate: 30-minute sessions preserve referents, corrections replace stale facts, backchannels do not derail speech, and unheard content never enters canonical history.

### Phase 5 — daily assistant surface (2–4 weeks)

Add capabilities in this order:

1. timers, reminders, and local notifications;
2. tasks and routines;
3. calendar read, then calendar write with confirmation;
4. contacts and relationship resolution;
5. email/message drafting, then sending with explicit confirmation;
6. screen/app control through typed allowlisted actions;
7. proactive briefings governed by quiet hours and notification budget.

Each capability must define read/write permissions, confirmation behavior, idempotency key, timeout, cancellation, audit event, and rollback/compensation behavior before it is enabled.

Exit gate: a daily scenario suite passes end to end, including duplicate requests, offline mode, revoked permission, ambiguous contact, missed reminder, and interrupted confirmation.

### Phase 6 — release hardening (continuous)

- Unit-test pure routing, endpoint, phrase assembly, memory, and policy functions.
- Use deterministic fake models/tools for state-machine tests.
- Run audio replay, conversation simulations, tool-contract tests, hallucination evals, and 2-hour soak tests.
- Ship behind feature flags: `streaming_session`, `stable_partial_asr`, `evidence_router`, `typed_memory`, `duplex_v2`.
- Maintain a one-command rollback to the last known-good pipeline.

## Proposed file-level refactor

| Existing area | Change |
|---|---|
| `main.py` | Reduce to bootstrap, CLI/UI wiring, and graceful shutdown |
| `meera_runtime/session.py` (new) | Own state machine, turn IDs, cancellation, response ledger |
| `meera_runtime/events.py` (new) | Typed audio/transcript/plan/token/phrase/PCM events |
| `voice.py` | Split into `audio_capture.py`, `asr_worker.py`, `turn_detector.py`, `playback.py`, `barge_in.py` |
| `semantic_endpointer.py` | Deterministic-first endpoint policy plus deadline-bounded optional classifier |
| `brain.py` | Stateless model adapter; streaming API; no global conversation history |
| `router.py` | Typed epistemic/action plan, rule priority, evidence requirement |
| `supervisor.py` | Orchestrate typed plans/tools; no audio-loop ownership |
| `memory.py` | Typed records, thresholds, provenance, session summaries, deletion/export |
| `policy.py` | Default-deny permissions, confirmation tokens, audit decisions |
| `telemetry.py` | Real spans and percentile export, with synthetic metrics clearly isolated |
| `meera_runtime/connectors/` (new) | Reminder/task/calendar/contact adapters with uniform contracts |
| `tests/replay/` (new) | Owner audio corpus manifests and deterministic replay assertions |

Pydantic-style validated models are a good fit for events, plans, memories, and tool arguments. If Pydantic AI is introduced, keep it in the planning/tool layer with on-demand capabilities and structured outputs; do not put a framework agent loop in the 20–32 ms audio path. A graph/state-machine library is optional—the essential requirement is explicit state, event IDs, bounded queues, and deterministic transitions.

## Evaluation scorecard

Release decisions use a scorecard, not a demo impression:

- **Latency:** endpoint, ASR final, TTFT, first phrase, first PCM, first audible sample, interruption pause; p50/p95/p99.
- **Recognition:** WER, named-entity error, last-word deletion, language/code-switch accuracy, false accept/reject.
- **Truth:** supported-claim rate, citation correctness, ungrounded claim rate, clarification rate, false-memory use.
- **Conversation:** repair success, interruption success, false-interruption recovery, backchannel handling, 30-minute coherence.
- **Voice:** first-PCM delay, real-time factor, underflows, discontinuities, speaker-similarity drift, blind naturalness rating.
- **Tools:** correct tool/argument rate, duplicate-action rate, confirmation compliance, cancellation and timeout behavior.
- **Reliability:** cold-start time, crash-free hours, memory growth, VRAM headroom, offline degradation.

The minimum release gate is not “sounds impressive once.” It is 500 replayed turns with no correctness regression, 100 live warm turns meeting latency SLOs, zero consequential actions without the required confirmation, and a red-team set with no silent fabrication where evidence was required.

## First implementation slice

The first pull request should be deliberately narrow:

1. Add real per-turn timing marks.
2. Fix the `INCOMPLETE` parsing bug.
3. Give ASR one serialized request queue with revision IDs.
4. Always reconcile a final transcript.
5. Stop injecting zero-score memories.
6. Wire normal chat to token/phrase streaming without changing the models.
7. Measure before and after on 30 recorded utterances.

That slice attacks the user's two dominant complaints—gap and hallucination—without hiding causal effects behind a model migration.

## Research basis

- Human turn timing: [CANDOR conversational corpus analysis](https://pmc.ncbi.nlm.nih.gov/articles/PMC10065445/)
- Streaming ASR stabilization: [Whisper-Streaming and LocalAgreement](https://arxiv.org/abs/2307.14743)
- ASR implementation options: [faster-whisper official repository](https://github.com/SYSTRAN/faster-whisper) and [whisper.cpp official repository](https://github.com/ggml-org/whisper.cpp)
- VAD performance/behavior: [Silero VAD performance metrics](https://github.com/snakers4/silero-vad/wiki/Performance-Metrics) and [quality metrics](https://github.com/snakers4/silero-vad/wiki/Quality-Metrics/9a93e6bcc2890779e3c0b1dc7d38d3f9c3bbc3b4)
- Turn and interruption design reference: [LiveKit turn detection documentation](https://docs.livekit.io/agents/logic/turns/)
- Full-duplex research: [Duplex Conversation](https://arxiv.org/abs/2205.15060), [Turn-taking prediction](https://arxiv.org/abs/2208.13321), and [Full-Duplex-Bench](https://arxiv.org/abs/2503.04721)
- Local LLM serving: [llama.cpp](https://github.com/ggml-org/llama.cpp), [server schema](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-schema.cpp), and [speculative decoding](https://github.com/ggml-org/llama.cpp/blob/master/docs/speculative.md)
- Model information: [Qwen3.5-2B model card](https://huggingface.co/Qwen/Qwen3.5-2B)
- Voice implementation status: [Qwen3-TTS official repository](https://github.com/QwenLM/Qwen3-TTS) and [official streaming API discussion](https://github.com/QwenLM/Qwen3-TTS/issues/10)

Research papers and external systems inform the design, but all current-state findings above were verified directly against this repository. Performance targets remain hypotheses until Phase 0 measures this machine, microphone, and installed model builds.
