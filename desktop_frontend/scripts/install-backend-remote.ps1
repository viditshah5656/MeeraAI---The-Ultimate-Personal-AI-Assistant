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
$requirementsPath = Join-Path $resolvedRoot "scripts\requirements-backend-remote.txt"
if (-not (Test-Path $requirementsPath)) {
  $requirementsPath = Join-Path $PSScriptRoot "requirements-backend-remote.txt"
}
$venvPath = Join-Path $resolvedRoot "venv"
$venvPython = Join-Path $venvPath "Scripts\python.exe"

$launcher = Resolve-PythonLauncher
if (-not $launcher) {
  throw "Python 3.10 or later is required to install the MeeraAI backend."
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

Write-Step "Installing CPU PyTorch runtime..."
Invoke-Checked `
  -FilePath $venvPython `
  -Arguments @(
    "-m", "pip", "install", "--upgrade",
    "--index-url", "https://download.pytorch.org/whl/cpu",
    "torch==2.11.0+cpu"
  ) `
  -FailureMessage "Failed to install the CPU PyTorch runtime."

Write-Step "Installing Meera remote backend dependencies..."
Invoke-Checked -FilePath $venvPython -Arguments @("-m", "pip", "install", "--upgrade", "-r", $requirementsPath) -FailureMessage "Failed to install the Meera remote backend dependencies."

$verifyScript = @"
import torch
import transformers
import sambanova
import fitz
from rapidocr_onnxruntime import RapidOCR

print("torch", torch.__version__)
print("transformers", transformers.__version__)
print("sambanova", getattr(sambanova, "__version__", "unknown"))
print("pymupdf", getattr(fitz, "__version__", "available"))
print("rapidocr", RapidOCR.__module__)
"@

$verifyPath = Join-Path $env:TEMP "meera-verify-remote.py"
Set-Content -LiteralPath $verifyPath -Value $verifyScript -Encoding UTF8
try {
  Write-Step "Verifying remote backend dependencies..."
  Invoke-Checked -FilePath $venvPython -Arguments @($verifyPath) -FailureMessage "The Meera remote backend dependencies could not be verified."
} finally {
  Remove-Item -LiteralPath $verifyPath -Force -ErrorAction SilentlyContinue
}

Write-Step "MeeraAI remote backend is ready."
