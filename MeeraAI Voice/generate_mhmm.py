import asyncio
from pathlib import Path
import sys
sys.path.insert(0, 'C:\\MeeraAI')
from config import TTSConfig
from meera_runtime.voice import QwenCppTTSBackend

def main():
    root = Path('C:\\MeeraAI')
    tts_config = TTSConfig(
        executable=root / 'qwentts.cpp' / 'build-vs2022' / 'Release' / 'qwen3-tts-cli.exe',
        server_executable=root / 'qwentts.cpp' / 'build-vs2022' / 'Release' / 'qwen3-tts-server.exe',
        model=root / 'models' / 'qwen3-tts' / 'qwen-talker-1.7b-voicedesign-Q4_K_M.gguf',
        codec=root / 'models' / 'qwen3-tts' / 'qwen-tokenizer-12hz-Q4_K_M.gguf',
    )
    tts = QwenCppTTSBackend(tts_config)
    print('Generating mhmm...')
    tts.synthesize('Mhmm.', 'Very short natural conversational acknowledgement.', Path('C:\\MeeraAI\\mhmm1.wav'))
    tts.synthesize('Right.', 'Very short natural conversational acknowledgement.', Path('C:\\MeeraAI\\mhmm2.wav'))
    tts.synthesize('Yeah.', 'Very short natural conversational acknowledgement.', Path('C:\\MeeraAI\\mhmm3.wav'))
    print(f'Generated backchannels')

main()
