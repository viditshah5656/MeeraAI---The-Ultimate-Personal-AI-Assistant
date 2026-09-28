# Meera: Voice Identity, Grounded Cognition, and Real-Time Conversation Plan

Date: 2026-09-14  
Scope: the current local Meera codebase, RTX 4050 deployment, supplied runtime traces, Qwen3-TTS, local ASR, memory, routing, web research, and spoken interaction.

## Executive decision

Meera's immediate problem is not that the language model needs a more theatrical prompt. The runtime trace shows four separate engineering failures being heard as one bad personality:

1. **The router sends personal and corrective speech to the wrong capability.** A name question became a web search, a preference update became LinkedIn research, and an explicit correction from Narendra Mohan to Narendra Modi was overwritten by stale conversation state.
2. **The system permits unsupported first-person claims.** Meera says she has been listening, digging into a project, noticed the owner had been away, or knows the owner's habits without memory or tool evidence.
3. **The voice is re-created at sentence boundaries.** Three independently synthesized sentences can have different acoustic identities, pace, energy, and pitch even when the same text prompt and speaker label are used.
4. **The spoken path is too long.** Web selection, model rewriting, multiple TTS generations, and verbose responses turn a conversational turn into a 10–62 second monologue.

The correct architecture therefore separates **what Meera knows**, **what action she is taking**, **how much she should say**, and **how one continuous voice should realize it**. Personality is the final layer, not the truth mechanism.

The first corrective release has been implemented in this repository. It uses a stable named CustomVoice speaker, synthesizes a normal reply in one request, applies actual playback-rate/pitch change, introduces sparse semantically meaningful hesitation, fixes transcript-specific routing failures, adds bounded project inspection, and enforces an epistemic speech contract. The remaining plan moves from this reliable baseline toward full-duplex, low-latency conversation without sacrificing voice identity.

## What the supplied trace proves

The trace is useful because every failure maps to a specific subsystem rather than a vague complaint about the model.

### Personal memory was bypassed

“Do you know what my name is?” triggered web research for pages about guessing names. “My name is Vidit Shah” triggered a search for strangers with that name. Both utterances are local profile operations: the first is a read; the second is an explicit memory write. Neither requires the model or internet.

The routing invariant must be:

> Explicit owner facts and questions about stored owner facts are resolved before generic chat and before web intent.

Preferred address and full name are separate fields. “Call me Vidit; my name is Vidit Shah” means `preferred_name=Vidit` and `full_name=Vidit Shah`, not that every reply should say “Vidit Shah.” The name should be used naturally—on greeting, acknowledgement, warning, or emotional emphasis—not appended mechanically to every turn.

### Conversation state overruled the user's correction

After the ASR produced “Narendra Mohan,” the user explicitly said the spelling was wrong and supplied “Narendra Modi.” The old active subject then rewrote the corrected query back to Narendra Mohan. This reverses the correct authority order.

The required authority order is:

1. explicit correction in the current utterance;
2. explicit fact or preference in the current utterance;
3. verified conversation entity;
4. durable owner memory;
5. ASR hypothesis;
6. model inference.

Lower-ranked state must never overwrite higher-ranked evidence.

### The model invented an inner life

Claims such as “I've been listening and digging into the details,” “you've been away,” and “your retirement” are not harmless warmth. They make the assistant appear to possess observations and history that do not exist. That breaks trust more severely than saying “I don't know yet.”

Meera can be human in delivery without pretending to be human in evidence. She may say “I think the bottleneck is TTS” when making an inference. She may say “I found three relevant files” after project inspection. She may not say “I've been researching this” unless a running research job actually exists.

### General news was reduced to a bad single-document audit

“Recent tech news” should return several current headlines from reputable sources. The old flow selected one search result, asked a verifier to audit a narrow claim, and spoke a long refusal. This was semantically unrelated to the user's intent.

News needs its own output contract: fresh multi-source retrieval, deduplication, a small ranked set, date checks, and one concise spoken sentence per story. A user selecting story two can then trigger the deeper evidence path.

### Voice controls were conversational claims, not controls

“Can you speak a little bit more faster?” was handled as chat. The model claimed it could adapt, but no setting changed. Spoken configuration commands must call deterministic settings tools and confirm the actual resulting value.

The local `qwentts.cpp` server parses a speed field but its current implementation does not apply it. Meera must therefore not claim that server-side speed changed. The present implementation applies the rate at audio playback, persists it, and reports the real setting.

## Architecture implemented now

### 1. Deterministic intent boundary

The following intents now execute before open-ended generation:

- profile get/set;
- voice rate changes phrased naturally, including “a little bit more faster”;
- explicit web/news requests;
- project/repository inspection;
- assistant self-description;
- incomplete utterances requiring continuation;
- pronunciation teaching and explicit corrections.

This is natural-language processing: the user can speak naturally, but high-consequence meanings resolve to typed operations instead of hoping a 2B model will improvise the correct side effect.

### 2. Grounded self-knowledge

Self-description is deterministic. Meera can truthfully describe herself as a local personal assistant that remembers explicitly taught facts, inspects the computer through approved tools, and checks the web when recency requires it. She does not invent feelings, unseen activity, or past interaction.

Project claims require a `project.inspect` result. The tool performs a bounded, read-only structural scan, excludes virtual environments and private runtime directories, and returns the top-level layout, important files, extension counts, and bounded file inventory. A later model pass may explain this evidence, but cannot honestly claim a complete code audit beyond inspected material.

### 3. Epistemic speech contract

Every factual clause should be representable internally as:

`claim -> provenance -> confidence -> time sensitivity`

Allowed provenance classes are:

- `USER_NOW`: explicitly stated in this turn;
- `MEMORY`: stored explicit owner fact;
- `TOOL`: observation returned by a local tool;
- `WEB`: retrieved external evidence with date/source;
- `GENERAL`: stable model knowledge;
- `INFERENCE`: reasoned conclusion, verbally qualified;
- `UNKNOWN`: no sufficient support.

The spoken policy is simple:

- Supported: “Your saved name is Vidit.”
- Observed: “I inspected the project and found Python modules for routing, speech, and runtime supervision.”
- Inferred: “I think sentence-level synthesis is causing the voice drift.”
- Unknown: “I don't know that yet.”

This is what it means for Meera to “mean what she says”: not consciousness theater, but a runtime guarantee that wording matches the source and certainty of the underlying state.

### 4. One acoustic identity per turn

The old path issued a TTS request for each generated sentence. The new normal path collects the cleaned reply and sends one synthesis request. That preserves speaker embedding, acoustic context, intensity, pace, and prosodic trajectory across sentence boundaries.

The default was moved from free-form VoiceDesign to Qwen3-TTS CustomVoice with the stable `serena` identity already present locally. Qwen's official project distinguishes reusable named CustomVoice speakers from VoiceDesign, and documents a “Voice Design then Clone” workflow for turning a chosen design into a reusable reference. That makes the production path:

1. use `serena` now for stability;
2. audition one exact Meera identity later;
3. generate a clean reference clip once;
4. clone from that locked reference for every future turn;
5. regression-test speaker similarity on short, long, emotional, English, Hindi, and Hinglish speech.

Qwen3-TTS was designed for streaming and controllable speech; its report and official repository describe low-latency streaming and instruction-controlled expression. However, continuity requires persistent acoustic state or one request—the application cannot recover identity by splitting independent requests and merely reusing the same prompt. Sources: [Qwen3-TTS technical report](https://arxiv.org/abs/2601.15621), [official Qwen3-TTS repository](https://github.com/QwenLM/Qwen3-TTS).

### 5. Faster, brighter speech that really changes

The stored speech rate is now honored on startup. The active profile is set to `1.15`, and 24 kHz source PCM is played at 27.6 kHz. This makes speech approximately 15% faster and raises pitch by about 2.4 semitones. Windows output-device support for 24.0, 26.4, 27.6, 28.8, and 30.0 kHz was checked locally.

This resampling intentionally couples pitch and speed because the owner requested both. The safe interactive range should remain about `0.85–1.25`; beyond that, intelligibility and speaker naturalness degrade. A later phase can replace coupled resampling with a phase-vocoder or neural prosody control if independent pitch and tempo become necessary.

The acoustic instruction now asks for one bright, moderately high feminine timbre, connected phrasing, compact pauses, lively rhythm, and no slow, heavy, timid, breathy, robotic, or childlike delivery.

### 6. Meaningful hesitation, not verbal noise

“Hmm” should communicate cognition, not decorate every answer. Research on spoken dialogue finds that fillers affect turn-taking and that timing roughly 200–500 ms into a delay can help a system hold the floor. Other work shows that different “hmm” prosodies convey different degrees of certainty; it is therefore misleading to sprinkle them randomly. Sources: [Interspeech study on conversational fillers and timing](https://www.isca-archive.org/interspeech_2019/lala19_interspeech.html), [study of prosodic forms of “hmm”](https://www.isca-archive.org/ssw_2010/lasarcyk10_ssw.html).

The implemented rule is:

- at most one hesitation in a qualifying turn;
- only for actual deliberation or uncertainty;
- normally after a meaningful clause or between sentences, not as a repetitive canned opener;
- a four-turn cooldown;
- none inside URLs, numbers, file paths, quoted evidence, or tool markup;
- none for direct profile/tool confirmations.

Examples:

- Good: “The voice itself is stable now. Hmm… the remaining delay is mainly generation and buffering.”
- Bad: “Hmm, your name is Vidit.”
- Bad: “Mmm… absolutely, mmm… let me check, mmm…”

Spontaneous-speech research supports modeling hesitations, repairs, and discourse phenomena as part of conversational synthesis, but naturalness comes from appropriate placement and intent rather than maximum frequency. Source: [Spontaneous speech synthesis overview](https://www.isca-archive.org/ssw_2010/andersson10_ssw.pdf).

### 7. Spoken-length discipline

The reply planner now targets:

- short: 4–22 words, up to 72 tokens;
- normal: 20–48 words, up to 180 tokens;
- deep: 40–85 words, up to 300 tokens.

Deep answers remain available when requested, but ordinary voice interaction no longer defaults to an essay. Sources should be visible in the UI/log and summarized naturally in speech; Meera should not read raw URLs aloud.

## Next engineering phases

### Phase A — Build a transcript regression harness

Create a versioned evaluation set from real owner speech, not typed idealizations. Each case stores audio, ASR n-best candidates, stable partials, final transcript, expected intent, expected tool, forbidden claims, preferred spoken response shape, and latency timestamps.

The first mandatory cases are the failures in the supplied trace:

- “Do you know what my name is?” -> profile read, never web.
- “My name is Vidit Shah; call me Vidit.” -> profile write with separate fields.
- “Tell me about yourself.” -> truthful capability description.
- “Speak a little bit more faster.” -> persistent voice-rate action.
- “We were actually quite…” -> wait/clarify, never invent emotion.
- “Do you know my Meera AI project?” -> state whether inspected or unknown.
- “Analyze my entire project.” -> inspect before describing.
- Narendra Mohan followed by explicit Narendra Modi correction -> corrected subject wins.
- “Recent tech news.” -> several dated headlines, not a claim-audit refusal.
- “Arijit Singh.” -> personalized pronunciation hotword and entity verification.

Release gates:

- 100% correct route/tool on the critical set;
- 0 unsupported first-person history claims;
- 0 web calls for local profile questions;
- 0 stale subject overwrites after explicit corrections;
- no spoken raw URLs;
- no more than one filler per qualifying answer.

### Phase B — Lock the final Meera voice

Use the official VoiceDesign-to-clone workflow to create an exact reference rather than re-designing a voice on every turn. Record at least 20 evaluation prompts across questions, confident answers, empathetic acknowledgements, technical explanation, names, numbers, English, Hindi, and Hinglish.

Measure:

- speaker similarity between every output and the reference;
- mean-opinion score from the owner for identity, naturalness, and pace;
- pitch median/range and words per minute;
- drift from sentence one to sentence three;
- pronunciation success for Vidit Shah, Arijit Singh, Narendra Modi, Meera, and project vocabulary.

Acceptance target: the owner identifies every blind A/B sample as the same speaker, and third-sentence similarity does not materially decline from first-sentence similarity.

### Phase C — Restore streaming without reintroducing voice drift

One full-turn TTS request fixes identity but waits for the textual answer to complete. The durable low-latency design is not to return to independent sentence calls. It is a persistent streaming TTS session that retains acoustic state while accepting semantically stable text increments.

Pipeline:

`VAD partial -> incremental ASR -> intent commitment -> response plan -> stable semantic clauses -> persistent TTS stream -> echo-aware playback/barge-in`

Incremental generation research demonstrates the basic principle of generating before a complete input is available, but the system must distinguish stable commitments from revisions. Source: [Incremental natural-language generation for dialogue systems](https://aclanthology.org/W10-4301.pdf).

Required implementation work:

1. expose or adopt a Qwen3-TTS streaming API that maintains one generation context;
2. commit only clauses whose facts and tool results are final;
3. synthesize the opening acknowledgement while retrieval runs only when it truthfully describes a running operation;
4. retain two to four audio chunks of jitter buffer;
5. cancel generation and playback immediately on verified barge-in;
6. never speak speculative tokens that a later tool result could contradict.

Target budgets on the local machine:

- end-of-user-speech detection: <=250 ms median, <=450 ms p95;
- final ASR after endpoint: <=350 ms median, <=700 ms p95;
- deterministic local reply first audio: <=450 ms median;
- local LLM reply first audio: <=900 ms median, <=1.5 s p95;
- web/retrieval acknowledgement: <=600 ms, factual answer begins as soon as evidence is available;
- barge-in stop: <=180 ms median;
- gap between continuous audio chunks: <=80 ms and inaudible.

The official Qwen3-TTS materials report very low first-packet latency under their reference setup, but that is not a promise for this Windows GGUF deployment. Meera's own traces must be the release authority.

### Phase D — Claim-level provenance and response validation

Prompts reduce hallucination; typed state prevents it. Add an internal `Claim` object to important response paths:

```text
Claim(text, provenance, evidence_ids, confidence, observed_at, expires_at)
```

Tool responses and memory reads produce claims. The verbalizer converts them into conversational speech. A validator blocks or softens sentences whose provenance is absent, whose evidence is stale, or whose confidence wording is too strong.

For local project analysis, attach file paths and inspection timestamps. For news, attach publisher, URL, publication time, retrieval time, and corroboration status. For owner facts, attach the explicit memory record and never enrich it with same-name web results unless the owner asks.

### Phase E — Personal relationship without fabricated familiarity

Build personalization from consented facts and observed interaction preferences:

- preferred address and pronunciation;
- preferred brevity, speech rate, pitch, humor, and language mix;
- active projects explicitly introduced by the owner;
- recurring routines only after explicit opt-in;
- correction history and confidence thresholds;
- short-term conversational state with expiry.

Meera may naturally say “Vidit” when it helps connection. She should avoid using the name every turn, avoid generic Gen-Z slang sprayed into technical responses, and mirror the owner's register lightly. Warmth comes from relevance, timing, and continuity—not from fake memories or constant “bro/man” imitation.

## Acceptance scenarios for the next live run

After restarting `main.py`, the owner should test these exact interactions:

1. “Do you know my name?”  
   Expected: immediate local answer using Vidit; no search acknowledgement or sources.
2. “Tell me something about yourself.”  
   Expected: truthful description of current capabilities; no claim about missing the owner, ongoing work, or feelings.
3. “Can you speak a little faster?”  
   Expected: setting changes and persists; confirmation is short; next turn is audibly faster.
4. A three-sentence prompt.  
   Expected: one consistent Serena/Meera speaker identity from first word to last.
5. “Think through why the TTS is slow.”  
   Expected: at most one well-placed hesitation, followed by evidence-based reasoning.
6. “We were actually quite…” followed by silence.  
   Expected: “Go on, I'm listening,” not an invented interpretation.
7. “Search for Narendra Mohan,” then “You heard it wrong; I said Narendra Modi.”  
   Expected: second search is Narendra Modi; old subject cannot reappear.
8. “Tell me recent tech news.”  
   Expected: concise dated headlines from multiple sources; no single-article verification refusal.
9. “Analyze my entire project.”  
   Expected: actual read-only inspection evidence and honest scope limits.

Log each turn's VAD, ASR, routing, tool, model-first-token, TTS-first-audio, speech duration, interruption, and total latency. Subjective “feels fast” is the final user criterion, but subsystem timing is what makes regressions fixable.

## Current verification status

The repository's runtime suite passes **139 tests with one configuration-dependent skip** in `tts-env`. Python compilation succeeds for the changed runtime modules. New regression coverage includes:

- stable named CustomVoice defaults;
- one continuous TTS generation for multi-sentence replies;
- natural faster-speech commands;
- persistent runtime settings;
- exact Narendra Modi correction behavior;
- full-project inspection routing;
- incomplete syntax handling;
- mid-thought hesitation placement;
- spoken news query extraction;
- owner-name operations that never reach web search.

Automated tests cannot certify perceived voice sameness or natural prosody. Those require the live acceptance run and recorded audio comparison. The immediate implementation deliberately chooses voice continuity over earliest possible sentence playback. Phase C restores sub-second streaming only after the TTS path can preserve acoustic state across chunks.

## Definition of “JARVIS-like” for Meera

The useful engineering definition is:

- understands corrections and context without letting stale context dominate;
- knows the difference between memory, observation, retrieval, inference, and ignorance;
- takes real actions when it says it has taken them;
- answers briefly by default and deeply on demand;
- speaks in one recognizable voice with intentional prosody;
- uses hesitation, humor, names, and warmth because the moment calls for them;
- starts responding quickly, can be interrupted naturally, and recovers cleanly;
- never sacrifices truth for the performance of intelligence.

That combination—not filler words or a cinematic prompt—is the path from a voice-controlled chatbot to a trusted daily personal assistant.
