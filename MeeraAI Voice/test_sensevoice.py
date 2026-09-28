import numpy as np
from funasr import AutoModel

print('Loading SenseVoiceSmall...')
model = AutoModel(model='iic/SenseVoiceSmall', device='cuda:0', disable_update=True)

# Generate 1 sec of noise
dummy_audio = np.random.randn(16000).astype(np.float32)

print('Transcribing...')
res = model.generate(input=dummy_audio, language='auto', use_itn=True)
print('Result:', res)
