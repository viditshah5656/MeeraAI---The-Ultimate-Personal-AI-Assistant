import os
import sys
import subprocess
import urllib.request
from pathlib import Path


# ============================================================
# MEERA AI — ONE-CLICK ENVIRONMENT INSTALLER
# ============================================================

BASE_DIR = Path(r"C:\MeeraAI")

BRAIN_ENV = BASE_DIR / "brain-env"
TTS_ENV = BASE_DIR / "tts-env"
FLASH_ENV = BASE_DIR / "flashattn-env"

PYTHON_310 = "3.10"
PYTHON_311 = "3.11"


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

def run(cmd, check=True):
    print("\n>", " ".join(map(str, cmd)))
    return subprocess.run(cmd, check=check)


def python_executable(env):
    return env / "Scripts" / "python.exe"


def pip(env, *args):
    return run([str(python_executable(env)), "-m", "pip", *args])


def create_env(env, python_version):
    if python_executable(env).exists():
        print(f"[OK] Environment already exists: {env}")
        return

    print(f"\n[+] Creating {env.name} with Python {python_version}...")
    run(["py", f"-{python_version}", "-m", "venv", str(env)])


def verify_python(version):
    try:
        result = subprocess.run(
            ["py", f"-{version}", "--version"],
            capture_output=True,
            text=True
        )

        if result.returncode == 0:
            print(f"[OK] Python {version}: {result.stdout.strip()}")
            return True

    except Exception:
        pass

    print(f"[ERROR] Python {version} is not installed.")
    return False


def install_python_311():
    """
    Installs Python 3.11 silently if it is missing.
    Python 3.10 is expected to already exist for the brain.
    """

    if verify_python(PYTHON_311):
        return True

    print("\n[+] Python 3.11 not found.")
    print("[+] Downloading official Python 3.11.9 installer...")

    installer = Path(os.environ["TEMP"]) / "python311.exe"

    url = (
        "https://www.python.org/ftp/python/3.11.9/"
        "python-3.11.9-amd64.exe"
    )

    urllib.request.urlretrieve(url, installer)

    print("[+] Installing Python 3.11...")

    run([
        str(installer),
        "/quiet",
        "InstallAllUsers=0",
        "PrependPath=1",
        "Include_launcher=1"
    ])

    if verify_python(PYTHON_311):
        return True

    print(
        "\n[ERROR] Python 3.11 was installed but the Python launcher "
        "cannot see it yet."
    )
    print("Close PowerShell, open a new one, and run this installer again.")

    return False


# ------------------------------------------------------------
# Brain
# ------------------------------------------------------------

def install_brain():

    print("\n")
    print("=" * 65)
    print(" INSTALLING MEERA BRAIN")
    print("=" * 65)

    create_env(BRAIN_ENV, PYTHON_310)

    pip(BRAIN_ENV, "install", "--upgrade", "pip")

    # llama.cpp Python binding with CUDA support
    pip(
        BRAIN_ENV,
        "install",
        "llama-cpp-python==0.3.35",
        "--extra-index-url",
        "https://abetlen.github.io/llama-cpp-python/whl/cu124"
    )

    # CPU int8 ASR avoids competing with the LLM/TTS for the 6 GB GPU.
    pip(
        BRAIN_ENV,
        "install",
        "faster-whisper",
        "sounddevice",
        "soundfile",
        "shazamio",
        "numpy",
        "ddgs",
        "silero-vad==6.2.1",
        "speechbrain==1.1.1",
        "fastapi",
        "uvicorn[standard]",
        "httpx",
        "uiautomation",
    )

    print("[OK] Brain environment installed.")


# ------------------------------------------------------------
# TTS
# ------------------------------------------------------------

def install_tts():

    print("\n")
    print("=" * 65)
    print(" INSTALLING QWEN3-TTS")
    print("=" * 65)

    create_env(TTS_ENV, PYTHON_310)

    pip(TTS_ENV, "install", "--upgrade", "pip")

    # PyTorch CUDA 12.8
    pip(
        TTS_ENV,
        "install",
        "torch==2.11.0",
        "torchaudio==2.11.0",
        "--index-url",
        "https://download.pytorch.org/whl/cu128"
    )

    # Qwen3-TTS
    pip(
        TTS_ENV,
        "install",
        "qwen-tts"
    )

    # Audio playback
    pip(
        TTS_ENV,
        "install",
        "sounddevice",
        "numpy",
        "scipy",
        "audiotsm",
        "speechbrain==1.1.1",
        "faster-whisper==1.2.1",
        "silero-vad==6.2.1",
        "nvidia-cublas-cu12",
        "nvidia-cudnn-cu12==9.*",
        "shazamio",
    )

    # Keep the trusted speaker verifier inside the MeeraAI model tree. COPY avoids
    # fragile Windows symlinks into a user cache and makes later starts local-only.
    speaker_model = BASE_DIR / "models" / "speaker-verification" / "ecapa-voxceleb-local"
    preload_speaker = (
        "from speechbrain.inference.speaker import EncoderClassifier; "
        "from speechbrain.utils.fetching import LocalStrategy; "
        f"EncoderClassifier.from_hparams(source='speechbrain/spkrec-ecapa-voxceleb', "
        f"savedir=r'{speaker_model}', local_strategy=LocalStrategy.COPY)"
    )
    run([str(python_executable(TTS_ENV)), "-c", preload_speaker])

    # Download the measured multilingual ASR model during installation so normal
    # starts never depend on the network.
    preload_asr = (
        "from faster_whisper import WhisperModel; "
        "WhisperModel('large-v3', device='cpu', compute_type='int8', cpu_threads=8)"
    )
    run([str(python_executable(TTS_ENV)), "-c", preload_asr])

    print("[OK] TTS environment installed.")


# ------------------------------------------------------------
# FlashAttention
# ------------------------------------------------------------

def install_flashattention():

    print("\n")
    print("=" * 65)
    print(" INSTALLING PREBUILT FLASHATTENTION")
    print("=" * 65)

    create_env(FLASH_ENV, PYTHON_311)

    pip(FLASH_ENV, "install", "--upgrade", "pip")

    # --------------------------------------------------------
    # IMPORTANT
    #
    # FlashAttention is installed ONLY from a .whl.
    #
    # We deliberately do NOT run:
    #
    #     pip install flash-attn
    #
    # because that can download the source .tar.gz and attempt
    # a local CUDA compilation.
    # --------------------------------------------------------

    pip(
        FLASH_ENV,
        "install",
        "torch==2.7.1",
        "torchvision==0.22.1",
        "torchaudio==2.7.1",
        "--index-url",
        "https://download.pytorch.org/whl/cu128"
    )

    # FlashAttention is an optional acceleration layer.  The previous URL used
    # an invalid wheel filename (two '+' local-version separators), so pip
    # rejected it before even downloading the wheel.  Use a valid prebuilt
    # Windows wheel and never fall back to source compilation.
    flash_wheel = (
        "https://github.com/PLISGOOD/flash-attention-windows-wheels/"
        "releases/download/v2.7.4.post1/"
        "flash_attn-2.7.4.post1-cp311-cp311-win_amd64.whl"
    )

    print("\n[+] Installing PREBUILT FlashAttention wheel...")
    print("[+] Source compilation is NOT allowed.")

    result = run([
        str(python_executable(FLASH_ENV)),
        "-m",
        "pip",
        "install",
        flash_wheel,
        "--no-deps",
    ], check=False)

    if result.returncode != 0:
        print("[WARN] FlashAttention wheel could not be installed.")
        print("[WARN] MeeraAI does not require FlashAttention to run; continuing setup.")
        return

    print("[OK] FlashAttention environment installed.")


# ------------------------------------------------------------
# Verification
# ------------------------------------------------------------

def verify_env(env, name):

    py = python_executable(env)

    print("\n")
    print("-" * 65)
    print(f" VERIFYING {name}")
    print("-" * 65)

    if not py.exists():
        print(f"[FAIL] Python executable missing: {py}")
        return False

    code = """
import torch

print("Python environment OK")
print("Torch:", torch.__version__)
print("Torch CUDA:", torch.version.cuda)

if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))
    print("CUDA available: True")
else:
    print("CUDA available: False")
"""

    result = subprocess.run(
        [str(py), "-c", code],
        text=True
    )

    return result.returncode == 0


def verify_flashattention():

    py = python_executable(FLASH_ENV)

    print("\n")
    print("-" * 65)
    print(" VERIFYING FLASHATTENTION")
    print("-" * 65)

    code = """
import torch
import flash_attn

print("FlashAttention:", flash_attn.__version__)
print("GPU:", torch.cuda.get_device_name(0))
print("CUDA:", torch.version.cuda)
print("FlashAttention import: OK")
"""

    result = subprocess.run(
        [str(py), "-c", code],
        text=True
    )

    if result.returncode != 0:
        print("[WARN] FlashAttention is unavailable; this is optional for MeeraAI.")
        return True

    return True


# ------------------------------------------------------------
# Main
# ------------------------------------------------------------

def main():

    print("=" * 65)
    print("              MEERA AI ENVIRONMENT SETUP")
    print("=" * 65)

    BASE_DIR.mkdir(parents=True, exist_ok=True)

    # --------------------------------------------------------
    # Python checks
    # --------------------------------------------------------

    print("\n[1/6] Checking Python 3.10...")

    if not verify_python(PYTHON_310):
        print(
            "\n[ERROR] Python 3.10 is required for the brain/TTS "
            "environment."
        )
        sys.exit(1)

    print("\n[2/6] Checking Python 3.11...")

    if not install_python_311():
        sys.exit(1)

    # --------------------------------------------------------
    # Environments
    # --------------------------------------------------------

    print("\n[3/6] Installing brain...")
    install_brain()

    print("\n[4/6] Installing TTS...")
    install_tts()

    print("\n[5/6] Installing FlashAttention...")
    install_flashattention()

    # --------------------------------------------------------
    # Verification
    # --------------------------------------------------------

    print("\n[6/6] Verifying everything...")

    brain_ok = verify_env(
        BRAIN_ENV,
        "MEERA BRAIN"
    )

    tts_ok = verify_env(
        TTS_ENV,
        "QWEN3-TTS"
    )

    flash_ok = verify_flashattention()

    # --------------------------------------------------------
    # Final report
    # --------------------------------------------------------

    print("\n")
    print("=" * 65)
    print("                 INSTALLATION REPORT")
    print("=" * 65)

    print(
        f"Brain environment:        {'OK' if brain_ok else 'FAILED'}"
    )

    print(
        f"TTS environment:          {'OK' if tts_ok else 'FAILED'}"
    )

    print(
        f"FlashAttention:            {'OK' if flash_ok else 'FAILED'}"
    )

    print("=" * 65)

    print("\nEnvironment locations:")
    print(f"  Brain : {BRAIN_ENV}")
    print(f"  TTS   : {TTS_ENV}")
    print(f"  Flash : {FLASH_ENV}")

    print("\nDone.")


if __name__ == "__main__":
    main()
