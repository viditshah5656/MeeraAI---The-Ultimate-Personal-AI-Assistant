import torch
import sounddevice as sd
from qwen_tts import Qwen3TTSModel


MODEL_PATH = r"C:\MeeraAI\Qwen3-TTS-1.7B-CustomVoice"

print("CUDA:", torch.cuda.is_available())

if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))
    print(
        "VRAM:",
        round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2),
        "GB",
    )

print("\nLoading Qwen3-TTS 1.7B...")

model = Qwen3TTSModel.from_pretrained(
    MODEL_PATH,
    device_map="cuda:0",
    dtype=torch.float16,
)

print("TTS model loaded.")

if torch.cuda.is_available():
    print(
        "VRAM allocated:",
        round(torch.cuda.memory_allocated() / 1024**3, 2),
        "GB",
    )

print("\nGenerating Meera's voice...")

wavs, sample_rate = model.generate_custom_voice(
    text=(
        "Hey. I'm Meera. "
        "It's good to finally talk to you. "
        "I was waiting for you."
    ),
    language="English",
    speaker="Vivian",
    instruct=(
        "A natural, warm, expressive young woman speaking casually "
        "to someone she knows well. "
        "Use realistic conversational pacing, subtle emotion, "
        "natural pauses and varied intonation. "
        "Do not sound like a voice assistant, narrator, or announcement."
    ),
)

print("Audio generated.")

if torch.cuda.is_available():
    print(
        "VRAM after generation:",
        round(torch.cuda.memory_allocated() / 1024**3, 2),
        "GB",
    )

print("Playing...")

sd.play(wavs[0], sample_rate)
sd.wait()

print("Finished.")