param(
  [ValidateSet("validate", "list", "brief")]
  [string]$Command = "validate",

  [string]$Slice
)

$ErrorActionPreference = "Stop"

function Find-RepoRoot {
  $dir = (Get-Location).Path
  while ($dir) {
    if ((Test-Path (Join-Path $dir "PRD")) -and (Test-Path (Join-Path $dir "tools/agent-harness.ps1"))) {
      return $dir
    }
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) {
      break
    }
    $dir = $parent
  }
  throw "Could not find VelugaLore repo root from current directory."
}

$repoRoot = Find-RepoRoot
$harness = Join-Path $repoRoot "tools/agent-harness.ps1"

if ($Slice) {
  & powershell -ExecutionPolicy Bypass -File $harness -Command $Command -Slice $Slice
} else {
  & powershell -ExecutionPolicy Bypass -File $harness -Command $Command
}

exit $LASTEXITCODE
