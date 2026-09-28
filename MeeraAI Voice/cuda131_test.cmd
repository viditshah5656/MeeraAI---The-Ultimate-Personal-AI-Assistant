@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
"C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.1\bin\nvcc.exe" -allow-unsupported-compiler -arch=sm_89 -ccbin "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64" "C:\MeeraAI\cuda_test.cu" -o "C:\MeeraAI\cuda_test.exe"
exit /b %ERRORLEVEL%
