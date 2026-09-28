# Meera Natural Conversation and Proper-Noun Reliability

## Executive assessment

Meera's September voice trace did not contain one isolated recognition error. It exposed four coupled defects: an unfamiliar proper noun was decoded inconsistently; the router preserved conversational scaffolding inside the web query; the assistant repeated an unverified transcription aloud; and the response generator was expected to supply personality, truthfulness, and conversational timing simultaneously. The result sounded robotic even when each individual model technically worked.

The correction is architectural. Audio transcription remains literal evidence. A deterministic language layer separates the user's command from the semantic search query. Conversation state resolves a close name variant only when a previously verified entity makes that resolution safe. Web evidence can teach the pronunciation vocabulary for later turns. A small persistent profile supplies the user's chosen name, while deterministic social turns prevent the local model from inventing imaginary activities when asked how it is doing.

This release implements that design for the observed failures. It deliberately does not hardcode “Arijit Singh.” The same mechanism applies to another multiword name when the web result and active conversation support the correction.

## Evidence from the recorded session

The supplied runtime transcript shows the following sequence:

1. The stable partial transcript was “Hello Meera, how is it going,” but the final transcript added “mom.” Meera then invented being busy with “interesting thoughts lately.”
2. “Arijit Singh” became “Ali Jit Singh.” The web search recovered the correct person, but the acknowledgement spoke the unverified spelling first.
3. A later turn became “Harit Singh.” Because the entire sentence was retained as the nominal subject, the subject-resolution safety rule refused to repair it.
4. The acknowledgement became “Let me check the latest reliable details on Can you tell me…,” exposing an internal command string directly to speech.
5. The search itself found Arijit Singh results, yet the answer remained attached to Harit Singh and declined to answer.
6. The trace reported zero milliseconds of endpoint latency. Inspection showed endpoint timestamps were assigned after a generator `yield`; the caller exits on the yielded final frame, so that assignment was not guaranteed to execute.

These failures are causal. They should not be “fixed” by adding more style text to one prompt. The incorrect subject enters before generation, and a language model cannot reliably repair a routing error while also obeying strict grounding.

## Research findings

### Human turn-taking is a latency problem, not only a model-speed problem

Natural conversation minimizes both gaps and overlap. A cross-linguistic study of ten languages found a mean response offset of about 208 milliseconds, with language means within roughly 250 milliseconds of that overall mean.^1 That is not a realistic end-to-end target for a local research answer, but it establishes why a two-to-ten-second silent interval feels socially wrong even when the eventual answer is good.

Conversation is also adaptive and multimodal: speakers continuously adjust words and behavior in response to one another.^2 A fixed “listen, process, respond” pipeline misses this interactive structure. Meera therefore needs an immediate, semantically safe first beat while expensive retrieval proceeds, plus barge-in and continuity across the second beat.

Research on dialogue fillers supports using brief feedback to take the conversational turn earlier, but filler timing and form affect naturalness.^3 The correct implication is not to play a random “hmm.” The acknowledgement must reflect the task category without making an unverified factual claim. “Yeah—give me a sec. I’m checking the latest releases” does that. Repeating a possibly incorrect name does not.

### Proper nouns need contextual bias and conservative repair

Whisper is a sequence-to-sequence model trained across multilingual transcription and related speech tasks.^4 It can still map an unfamiliar name to common acoustic fragments. The current faster-whisper interface explicitly supports `initial_prompt`, `hotwords`, and word-level confidence/timestamp output.^5 Its own tests demonstrate hotword passage through transcription.^6

Those controls are useful but must be scoped. A permanent global prompt full of celebrity names can bias unrelated utterances and create new hallucinations. Meera now uses a persistent pronunciation store populated by an explicit correction or a strongly corroborated web resolution. The canonical name becomes a hotword on following turns. Literal aliases such as “Ali Jit Singh” can also be mapped to the verified canonical spelling.

Contextual repair follows three safety conditions:

- The candidate and active subject are compact, name-shaped phrases.
- They share a surname.
- Their remaining name tokens have sufficient string similarity.

This makes “Harit Singh” repairable inside an active Arijit Singh conversation, while leaving an unrelated “Harit” untouched in a fresh conversation. First-turn resolution remains evidence-based: compact ASR text is compared with returned page titles, under a threshold adjusted by ASR confidence.

### Personal conversation requires explicit profile state

Dialogue-personalization research consistently treats persona information as conditioning state rather than a phrase sprinkled onto every answer. Large-scale persona-conditioned dialogue work reports improved engagement, and related work emphasizes fluency and consistency as evaluation dimensions.^7,8

Meera now stores the user's preferred name as typed profile state. She learns it from “My name is X,” “Call me X,” or “You can call me X,” and can answer “What's my name?” The name enters private runtime context on every normal reasoning turn. The speech contract instructs the model to use it selectively: greetings, meaningful reassurance, and important completions. Saying a name every turn would feel more like a call center script than a relationship.

The system never guesses the name from a Windows username, home-directory path, account, or document. If the name is unknown, the first social greeting asks once, naturally. This preserves both privacy and trust.

### “Human” is a rendering policy, not unlimited slang

Forced slang is another kind of robot voice. The revised contract asks for relaxed modern English, matched to the speaker's energy, with light connectors such as “yeah,” “honestly,” “basically,” “look,” or “fair” only where they fit. It explicitly rejects stacked slang and fabricated accents.

Facts and style remain separate:

- The router decides whether current evidence is required.
- The web layer retrieves and opens evidence.
- The grounded answer layer may only state supported facts.
- The spoken-language contract controls contractions, transitions, sentence shape, and selective name use.
- The acoustic expression layer controls delivery without rewriting factual content.

This separation is especially important for a two-billion-parameter local model. Asking one generation pass to infer intent, repair names, decide whether to browse, remain perfectly grounded, remember a person, and perform a character creates avoidable failure modes.

## Implemented pipeline

### Final transcript reconciliation

Stable partial transcripts remain speculative and are never sent to tools. At the final decode, Meera can discard exactly one endpoint-only token when all of the following are true: the stable partial contains at least four words; it is an exact normalized prefix of the final transcript; the final contains only one additional word; and Whisper assigns that word probability below 0.62. A confident final word is always preserved.

This narrowly handles the observed “how is it going” → “how is it going mom” failure without creating a general rule that deletes valid forms of address.

### Semantic query extraction

The router removes wake words, politeness scaffolding, request verbs, and quantifier filler while retaining search constraints. The observed sentence transforms as follows:

`Can you tell me some of the latest songs of Harit Singh?`

→ `latest songs of Harit Singh`

That semantic query is used for retrieval and for the grounded answer. The raw utterance is still retained for telemetry and conversational interpretation. It is never read back as though it were a subject.

### Entity continuity and learning

For a fresh “Ali Jit Singh” query, Meera avoids saying the uncertain name in the acknowledgement. When search titles strongly identify Arijit Singh, the completed turn:

1. states the correction once;
2. makes Arijit Singh the active subject;
3. stores Arijit Singh as an ASR hotword;
4. stores Ali Jit Singh as a pronunciation alias.

In the subsequent “latest songs of Harit Singh” turn, active-topic continuity repairs the query before search. The grounded answer therefore receives “latest songs of Arijit Singh,” eliminating the contradiction in the recorded session.

### Deterministic social response

The `social_greeting` route no longer depends on a probabilistic model response. When the user asks “how's it going,” Meera gives a short grounded answer. If the preferred name is known, she may use it. If it is unknown and has never been requested, she asks what to call the user. This removes invented claims such as being busy with private thoughts or projects.

### Correct endpoint metrics

Endpoint timestamps and silence latency are now committed before the final audio frame is yielded. Measurements will therefore survive the caller breaking out of the generator. This is necessary before comparing future VAD configurations.

## Latency budget and next engineering steps

The immediate acknowledgement hides part of research latency, but the captured seven-to-ten-second research time remains too high. The current grounded path fetches a page and performs an answer pass followed by a second evidence-audit pass. On a local two-billion-parameter model, the second pass is a major cost.

The next latency milestone should measure p50, p95, and p99 for each stage separately:

- speech end to committed endpoint: target 350–650 milliseconds depending on syntax;
- final ASR: target below 700 milliseconds on ordinary short turns;
- route and acknowledgement text: target below 20 milliseconds;
- acknowledgement audio start: target below 600 milliseconds after endpoint;
- first grounded answer audio after acknowledgement: target below 1.5 seconds after web evidence arrives;
- no silent interval longer than roughly 700 milliseconds while Meera owns the turn.

The next implementation should replace the unconditional second generative audit with a risk gate. Exact family names, dates, counts, medical/legal/financial claims, and contradiction checks should retain the audit. Low-risk summaries can use deterministic citation coverage checks and one model pass. This change requires an evaluation corpus before rollout; speed must not be purchased by silently restoring hallucinations.

An ASR benchmark should also use recordings from the actual Intel microphone, room, accent, and speaking distance. It should include Arijit Singh, comparable Indian names, genuine competing names such as Ajit Singh, mixed Hindi-English sentences, quiet speech, and sentence-final address terms. Report name error rate as well as ordinary word error rate. A single successful sample is not sufficient validation.

## Acceptance scenarios

The release is considered behaviorally correct when these scenarios pass:

- “Tell me about Ali Jit Singh” does not cause the acknowledgement to repeat “Ali Jit Singh.” Reliable result titles can resolve Arijit Singh.
- After that resolution, “latest songs of Harit Singh” searches for `latest songs of Arijit Singh`.
- “Can you tell me some of the latest songs…” is never spoken back verbatim.
- A low-confidence endpoint-only “mom” can be removed when stable partial consensus excludes it; a high-confidence “mom” remains.
- “My name is Vidit” persists the preference; “What's my name?” returns Vidit.
- A greeting uses the name naturally but ordinary factual answers do not prepend it mechanically.
- “How are you?” never invents a project, activity, mood history, or sensory observation.
- Fresh unrelated names are not rewritten merely because they resemble a previously searched celebrity.

The automated suite currently covers the routing, continuity, acknowledgement, profile intent, final-tail reconciliation, evidence guards, streaming behavior, TTS identity contract, and tool safety paths.

## Operational guidance

On the next launch, greet Meera normally. If she asks what to call you, answer “Call me Vidit” or the preferred alternative. Then say “Tell me about Arijit Singh.” If the microphone still produces a wrong spelling on the first turn, the acknowledgement should withhold it and the web result should resolve it. Repeat with “Tell me some of his latest songs” and with the exact failing sentence from the trace.

For reproducible acoustic tuning, save those utterances as labeled WAV files and run the existing ASR benchmark script. Do not tune hotword thresholds against only one celebrity. The correct goal is lower proper-noun error without increasing false substitutions elsewhere.

## Sources

1. Tanya Stivers et al., “[Universals and cultural variation in turn-taking in conversation](https://pmc.ncbi.nlm.nih.gov/articles/PMC2705608/),” *Proceedings of the National Academy of Sciences*, 2009.
2. Gus Cooney et al., “[The CANDOR corpus: Insights from a large multimodal dataset of naturalistic conversation](https://pmc.ncbi.nlm.nih.gov/articles/PMC10065445/),” *Science Advances*, 2023.
3. Divesh Lala et al., “[Analysis of Effect and Timing of Fillers in Natural Turn-Taking](https://www.isca-archive.org/interspeech_2019/lala19_interspeech.html),” *Interspeech*, 2019.
4. Alec Radford et al., “[Robust Speech Recognition via Large-Scale Weak Supervision](https://cdn.openai.com/papers/whisper.pdf),” OpenAI, 2022.
5. SYSTRAN, “[faster-whisper transcription implementation and parameters](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py),” official source repository, accessed 2026.
6. SYSTRAN, “[faster-whisper transcription tests](https://github.com/SYSTRAN/faster-whisper/blob/master/tests/test_transcribe.py),” official source repository, accessed 2026.
7. Pierre-Emmanuel Mazaré et al., “[Training Millions of Personalized Dialogue Agents](https://aclanthology.org/D18-1298/),” *EMNLP*, 2018.
8. Zhaojiang Lin et al., “[Personalizing Dialogue Agents via Meta-Learning](https://arxiv.org/abs/1905.10033),” 2019.
