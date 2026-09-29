@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"

set "VCToolsInstallDir=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\"
set "VCINSTALLDIR=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\"
set "VisualStudioVersion=17.0"
set "VSINSTALLDIR=C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\"

cd /d C:\MeeraAI\qwentts.cpp

cmake -S . -B build-ninja -G Ninja ^
  -DGGML_CUDA=ON ^
  -DGGML_CCACHE=OFF ^
  -DCMAKE_BUILD_TYPE=Release ^
  -DCMAKE_C_COMPILER="C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe" ^
  -DCMAKE_CXX_COMPILER="C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe" ^
  -DCMAKE_CUDA_COMPILER="C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.1\bin\nvcc.exe" ^
  -DCMAKE_CUDA_HOST_COMPILER="C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207\bin\Hostx64\x64\cl.exe" ^
  -DCMAKE_CUDA_ARCHITECTURES=89 ^
  -DCUDAToolkit_ROOT="C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v13.1" ^
  -DCMAKE_CUDA_FLAGS="--allow-unsupported-compiler"

exit /b %ERRORLEVEL%
