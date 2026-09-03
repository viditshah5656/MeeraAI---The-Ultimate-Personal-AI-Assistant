param(
  [Parameter(Mandatory = $true)]
  [string]$InstallRoot
)

$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[MeeraAI] $Message"
}

function Resolve-PythonLauncher {
  $candidates = @(
    @{ cmd = "py"; args = @("-3.10") },
    @{ cmd = "py"; args = @("-3") },
    @{ cmd = "python"; args = @() },
    @{ cmd = "python3"; args = @() }
  )

  foreach ($candidate in $candidates) {
    try {
      & $candidate.cmd @($candidate.args + @("--version")) *> $null
      if ($LASTEXITCODE -eq 0) {
        return $candidate
      }
    } catch {
      continue
    }
  }

  return $null
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath,
    [string[]]$Arguments = @(),
    [string]$FailureMessage = "Command failed."
  )

  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw $FailureMessage
  }
}

$resolvedRoot = [System.IO.Path]::GetFullPath($InstallRoot)
$requirementsPath = Join-Path $resolvedRoot "scripts\requirements-backend-gpu.txt"
if (-not (Test-Path $requirementsPath)) {
  $requirementsPath = Join-Path $PSScriptRoot "requirements-backend-gpu.txt"
}
$venvPath = Join-Path $resolvedRoot "venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

if (-not (Get-Command "nvidia-smi" -ErrorAction SilentlyContinue)) {
  throw "MeeraAI GPU build requires an NVIDIA GPU and driver. Install the NVIDIA driver and CUDA first."
}

$gpuSummary = & nvidia-smi --query-gpu=name,driver_version --format=csv,noheader 2>$null
if (-not $gpuSummary) {
  throw "No NVIDIA GPU was detected. MeeraAI GPU build cannot continue."
}

Write-Step "Detected NVIDIA GPU: $gpuSummary"

$nvcc = Get-Command "nvcc" -ErrorAction SilentlyContinue
if ($nvcc) {
  Write-Step "CUDA toolkit detected in PATH."
} else {
  Write-Step "CUDA toolkit was not found in PATH. Continuing with PyTorch CUDA wheels."
}

$launcher = Resolve-PythonLauncher
if (-not $launcher) {
  throw "Python 3.10 or later is required to install the MeeraAI GPU backend."
}

if (-not (Test-Path $requirementsPath)) {
  throw "The MeeraAI backend requirements file could not be found."
}

if (-not (Test-Path $venvPython)) {
  Write-Step "Creating backend virtual environment..."
  Invoke-Checked -FilePath $launcher.cmd -Arguments ($launcher.args + @("-m", "venv", $venvPath)) -FailureMessage "Failed to create the backend virtual environment."
}

Write-Step "Upgrading pip tooling..."
Invoke-Checked -FilePath $venvPython -Arguments @("-m", "pip", "install", "--upgrade", "pip", "wheel") -FailureMessage "Failed to upgrade pip tooling."

Write-Step "Installing CUDA-enabled PyTorch..."
Invoke-Checked `
  -FilePath $venvPython `
  -Arguments @(
    "-m", "pip", "install", "--upgrade",
    "--index-url", "https://download.pytorch.org/whl/cu128",
    "torch==2.11.0+cu128",
    "torchaudio==2.11.0+cu128",
    "torchvision==0.26.0+cu128"
  ) `
  -FailureMessage "Failed to install the CUDA-enabled PyTorch build."

Write-Step "Installing Meera backend dependencies..."
Invoke-Checked -FilePath $venvPython -Arguments @("-m", "pip", "install", "--upgrade", "-r", $requirementsPath) -FailureMessage "Failed to install the Meera backend dependencies."

$verifyScript = @"
import torch
import bitsandbytes as bnb

print("torch", torch.__version__)
print("cuda_available", torch.cuda.is_available())
print("cuda_version", torch.version.cuda)
print("bitsandbytes", getattr(bnb, "__version__", "unknown"))

if not torch.cuda.is_available():
    raise SystemExit("CUDA verification failed")

print("gpu", torch.cuda.get_device_name(0))
"@

$verifyPath = Join-Path $env:TEMP "meera-verify-gpu.py"
Set-Content -LiteralPath $verifyPath -Value $verifyScript -Encoding UTF8
try {
  Write-Step "Verifying CUDA backend..."
  Invoke-Checked -FilePath $venvPython -Arguments @($verifyPath) -FailureMessage "The installed PyTorch build could not access CUDA."
} finally {
  Remove-Item -LiteralPath $verifyPath -Force -ErrorAction SilentlyContinue
}

Write-Step "MeeraAI GPU backend is ready."
