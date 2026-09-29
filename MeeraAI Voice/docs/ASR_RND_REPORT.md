# MeeraAI Speech Recognition Reliability

## Executive conclusion

MeeraAI's recurring recognition failures were not primarily an intent-routing or
language-model problem. The ASR configuration used an English-only Whisper model,
forced English decoding, injected a growing list of names as permanent hotwords,
and applied several unconditional transcript rewrites. Together these choices made
short phonetic collisions predictable: an Indian conversational phrase such as
“arey yaar” could be decoded as the globally promoted name “Arijit.”

The production configuration now uses the multilingual Whisper `small` checkpoint
on CPU with English decoding and a small balanced English/Hinglish vocabulary. It
normalizes microphone level, retains word confidence metadata, performs an unbiased
language-detection retry only on genuinely low-confidence audio, and restricts
repairs to contexts that distinguish the intended phrase. The RTX 4050 remains
reserved for the concurrently resident Qwen brain and Qwen3-TTS models.

## Evidence and constraints

Whisper provides distinct English-only and multilingual `small` models. Both contain
244 million parameters; OpenAI reports that the accuracy advantage of `.en` variants
becomes less significant at the small and medium sizes. Whisper's multilingual
models support speech recognition and language identification, but the official
model card also warns that predictions can contain plausible text not actually
present in the audio because decoding combines acoustics with learned language
priors.[1][2]

Faster-whisper exposes the controls relevant here: explicit or automatic language,
beam search, initial prompts, hotwords, word timestamps, word probabilities, VAD,
and per-segment average log probability. Its implementation detects a language when
none is supplied, while the `multilingual` option can repeat detection per segment.[3]
These are biases and confidence signals—not guarantees—so globally promoting every
remembered name is unsafe.

The live MeeraAI stack occupies approximately 4.26 GB of the 6 GB GPU before ASR.
Only about 1.66 GB remained during measurement. OpenAI's reference table estimates
about 2 GB for Whisper `small`, 6 GB for Turbo, and 10 GB for the full large model.[1]
Consequently, a concurrent GPU decoder would exceed or dangerously approach the
available budget. CPU INT8 preserves TTS continuity and avoids GPU out-of-memory
failures.

AI4Bharat's 600M IndicConformer is designed for 22 Indian languages and is a useful
future benchmark candidate, but its published interface requires selecting an
Indian language and does not claim English-Hindi code-switch recognition. Its model
files are also gated. It was therefore not adopted as an unmeasured replacement for
the working local runtime.[4]

## Local controlled evaluation

Five 24 kHz test utterances were synthesized with the installed Qwen VoiceDesign
model using a conversational Indian-English/Hinglish voice profile:

- “Arey yaar, uh, what is this?”
- “Can you tell me about Arijit Singh?”
- “Yeah, can you laugh?”
- “Can you love?”
- “How do I make an eggless vanilla cake at home?”

The reusable harness is `scripts/benchmark_asr_strategies.py`. It calculates word
error rate with Levenshtein distance and records every hypothesis and elapsed time.
Synthetic audio cannot substitute for a corpus recorded from the owner's microphone,
but it is valuable for controlled regression of the exact phonetic collisions.

Measured five-utterance results on this machine:

| Strategy | Word error rate | Decode time | Key result |
|---|---:|---:|---|
| `small.en`, original biased list | 6.67% | 7.85 s | “arey yaar” became “Ariar” |
| `small.en`, no hotwords | 10.00% | 7.52 s | Lost both Hinglish and exact Arijit spelling |
| multilingual `small`, forced English, no hints | 16.67% | 7.49 s | “are we are”; “Arajeet” |
| multilingual `small`, auto language | 16.67% | 14.19 s | No gain; nearly twice the latency |
| `large-v3-turbo`, forced English | 10.00% | 29.46 s | No accuracy gain; about four times slower |
| multilingual `small`, balanced hints | **3.33%** | **7.75 s** | All five semantic phrases correct |

The remaining scored error in the winning strategy was an extra leading “uh” in
the synthetic waveform. The target phrases themselves—including the difficult
“arey yaar”/“Arijit Singh” distinction—were correct. The actual production worker
was then tested end-to-end and returned all five expected phrases with no fallback.

## Implemented reliability controls

### Acoustic input

Captured audio remains 16 kHz mono. Before decoding, the worker removes DC offset
and raises quiet recordings toward a bounded peak; it never amplifies beyond the
configured cap. Silero VAD removes non-speech while retaining 260 ms around speech.
The ASR process stays isolated from llama.cpp's OpenMP runtime.

### Decoder

The fast path is multilingual `small`, CPU INT8, beam size eight, deterministic
temperature zero, no previous-text conditioning, English decoding, word timestamps,
and the measured balanced vocabulary. The prompt is empty by default to avoid a
second uncontrolled text prior.

If average segment log probability falls below -0.78, the worker performs one
unbiased automatic-language pass. It replaces the first hypothesis only when the
alternative's acoustic score improves by more than 0.10. Clear turns therefore pay
for one decode; only uncertain turns pay for two.

### Transcript integrity

The word “mirror” is no longer rewritten as “Meera.” “Mira” is corrected only in a
clear address such as “Hey Mira.” User-taught alias corrections remain explicit and
persistent, but old hard-coded cooking aliases are removed from the database.
Built-in cake repairs require cooking context.

The “Arijit” collision uses surrounding evidence: the complete entity “Arijit Singh”
is preserved; only a leading name-like fragment followed by an interjection or
continuation is interpreted as “arey yaar.” This prevents a global replacement from
breaking legitimate music or web queries.

## Operational verification

Run the controlled benchmark:

```powershell
$env:PYTHONUTF8="1"
.\tts-env\Scripts\python.exe .\scripts\benchmark_asr_strategies.py --only small-multilingual-balanced
```

Run the real production-worker smoke test:

```powershell
.\tts-env\Scripts\python.exe -m tests.smoke_voice_runtime `
  .meera\runtime\artifacts\asr-rnd\arey-yaar.wav `
  .meera\runtime\artifacts\asr-rnd\arijit.wav `
  .meera\runtime\artifacts\asr-rnd\laugh.wav `
  .meera\runtime\artifacts\asr-rnd\love.wav `
  .meera\runtime\artifacts\asr-rnd\cake.wav
```

For meaningful owner-specific optimization, future measurements should use at least
50 consented utterances recorded on the actual microphone across quiet, fan-noise,
and normal-room conditions. Report both aggregate WER and confusion-pair accuracy;
never tune a global replacement from one anecdotal utterance.

## Sources

1. OpenAI, “[Whisper README: available models and languages](https://github.com/openai/whisper/blob/main/README.md),” accessed September 2026.
2. OpenAI, “[Whisper model card](https://github.com/openai/whisper/blob/main/model-card.md),” accessed September 2026.
3. SYSTRAN, “[faster-whisper transcription implementation and API](https://github.com/SYSTRAN/faster-whisper/blob/master/faster_whisper/transcribe.py),” accessed September 2026.
4. AI4Bharat, “[IndicConformer 600M multilingual model card](https://huggingface.co/ai4bharat/indic-conformer-600m-multilingual),” accessed September 2026.
