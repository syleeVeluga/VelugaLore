param(
  [ValidateSet("validate", "list", "brief")]
  [string]$Command = "validate",

  [string]$Slice,

  [switch]$Strict
)

$ErrorActionPreference = "Stop"

function Get-RepoRoot {
  $scriptDir = Split-Path -Parent $PSCommandPath
  return (Resolve-Path (Join-Path $scriptDir "..")).Path
}

function Join-RepoPath([string]$RepoRoot, [string]$RelativePath) {
  return Join-Path $RepoRoot ($RelativePath -replace "/", [IO.Path]::DirectorySeparatorChar)
}

function Read-SliceMap([string]$RepoRoot) {
  $path = Join-RepoPath $RepoRoot ".agents/harness/slices.json"
  if (-not (Test-Path $path)) {
    throw "Missing slice map: .agents/harness/slices.json"
  }
  return Get-Content -Raw -Encoding UTF8 $path | ConvertFrom-Json
}

function Test-RequiredFile([string]$RepoRoot, [string]$RelativePath, [System.Collections.Generic.List[string]]$Errors) {
  $full = Join-RepoPath $RepoRoot $RelativePath
  if (-not (Test-Path $full)) {
    $Errors.Add("Missing required file: $RelativePath")
  }
}

function Read-AgentRegistry([string]$RepoRoot) {
  $path = Join-RepoPath $RepoRoot ".agents/agents.toml"
  $registry = @{
    agents = @{}
    subagents = @{}
  }

  if (-not (Test-Path $path)) {
    return $registry
  }

  $section = $null
  foreach ($line in (Get-Content -Encoding UTF8 $path)) {
    if ($line -match '^\s*\[\[agent\]\]\s*$') {
      $section = "agent"
      continue
    }
    if ($line -match '^\s*\[\[subagent\]\]\s*$') {
      $section = "subagent"
      continue
    }
    if ($line -match '^\s*id\s*=\s*"([^"]+)"') {
      if ($section -eq "agent") {
        $registry.agents[$Matches[1]] = $true
      } elseif ($section -eq "subagent") {
        $registry.subagents[$Matches[1]] = $true
      }
    }
  }

  return $registry
}

function Invoke-Validate([string]$RepoRoot, [switch]$Strict) {
  $errors = [System.Collections.Generic.List[string]]::new()
  $warnings = [System.Collections.Generic.List[string]]::new()

  $required = @(
    "AGENTS.md",
    "agent.md",
    ".agents/agents.toml",
    ".agents/harness/slices.json",
    ".codex/skills/weki-slice-builder/SKILL.md",
    "PRD/00-onepager.md",
    "PRD/04-architecture.md",
    "PRD/05-agent-catalog.md",
    "PRD/08-data-model.md",
    "PRD/09-code-layout.md",
    "PRD/10-extension-paths.md",
    "PRD/11-security-rbac.md",
    "PRD/12-observability.md",
    "PRD/13-implementation-guide.md",
    "PRD/14-milestones.md",
    "PRD/15-acceptance-criteria.md",
    "PRD/16-risks.md"
  )

  foreach ($file in $required) {
    Test-RequiredFile $RepoRoot $file $errors
  }

  $sliceMap = $null
  try {
    $sliceMap = Read-SliceMap $RepoRoot
  } catch {
    $errors.Add($_.Exception.Message)
  }

  if ($sliceMap) {
    $registry = Read-AgentRegistry $RepoRoot
    $ids = @{}
    foreach ($slice in $sliceMap.slices) {
      if ($slice.id -notmatch '^S-\d{2}[a-z]?$') {
        $errors.Add("Invalid slice id format: $($slice.id)")
      }
      if ($ids.ContainsKey($slice.id)) {
        $errors.Add("Duplicate slice id: $($slice.id)")
      }
      $ids[$slice.id] = $true
      foreach ($prdPath in $slice.prd) {
        Test-RequiredFile $RepoRoot $prdPath $errors
      }
      foreach ($agentId in $slice.primary_agents) {
        if (-not $registry.agents.ContainsKey($agentId)) {
          $errors.Add("Slice $($slice.id) references unknown primary agent: $agentId")
        }
      }
      if ($slice.PSObject.Properties.Name -contains "subagents") {
        foreach ($subagentId in $slice.subagents) {
          if (-not $registry.subagents.ContainsKey($subagentId)) {
            $errors.Add("Slice $($slice.id) references unknown subagent: $subagentId")
          }
        }
      }
    }
  }

  $agentsToml = Join-RepoPath $RepoRoot ".agents/agents.toml"
  if (Test-Path $agentsToml) {
    $agentContent = Get-Content -Encoding UTF8 $agentsToml
    foreach ($line in $agentContent) {
      if ($line -match '^\s*path\s*=\s*"([^"]+)"') {
        Test-RequiredFile $RepoRoot $Matches[1] $errors
      }
    }
  }

  $skillDir = Join-RepoPath $RepoRoot ".codex/skills/weki-slice-builder"
  $skillValidator = "C:/Users/ReQuiem_Imageit/.codex/skills/.system/skill-creator/scripts/quick_validate.py"
  if ((Test-Path $skillDir) -and (Test-Path $skillValidator)) {
    $validateOutput = & python $skillValidator $skillDir 2>&1
    if ($LASTEXITCODE -ne 0) {
      $errors.Add("Skill validation failed:`n$($validateOutput -join [Environment]::NewLine)")
    }
  } elseif (Test-Path $skillDir) {
    $warnings.Add("Skill quick_validate.py not found; skipped skill validator.")
  }

  $openaiYaml = Join-RepoPath $RepoRoot ".codex/skills/weki-slice-builder/agents/openai.yaml"
  if (Test-Path $openaiYaml) {
    $yamlText = Get-Content -Raw -Encoding UTF8 $openaiYaml
    if ($yamlText -notmatch '\$weki-slice-builder') {
      $errors.Add("Skill agents/openai.yaml default_prompt must mention `$weki-slice-builder.")
    }
  }

  if (-not (Test-Path (Join-RepoPath $RepoRoot "package.json"))) {
    $warnings.Add("package.json not found. This is expected before S-01 is implemented.")
  }

  if ($warnings.Count -gt 0) {
    Write-Host "Warnings:"
    foreach ($warning in $warnings) {
      Write-Host "  - $warning"
    }
  }

  if ($errors.Count -gt 0) {
    Write-Host "Validation failed:"
    foreach ($err in $errors) {
      Write-Host "  - $err"
    }
    exit 1
  }

  Write-Host "Agent harness validation passed."
}

function Invoke-List([string]$RepoRoot) {
  $sliceMap = Read-SliceMap $RepoRoot
  foreach ($slice in $sliceMap.slices) {
    $agents = $slice.primary_agents -join ", "
    Write-Host "$($slice.id) [$($slice.milestone)] $($slice.title) :: $agents"
  }
}

function Invoke-Brief([string]$RepoRoot, [string]$Slice) {
  if (-not $Slice) {
    throw "Use -Slice S-XX with -Command brief."
  }

  $sliceMap = Read-SliceMap $RepoRoot
  $match = @($sliceMap.slices | Where-Object { $_.id -eq $Slice })
  if ($match.Count -eq 0) {
    throw "Unknown slice: $Slice"
  }

  $s = $match[0]
  Write-Host "# $($s.id) - $($s.title)"
  Write-Host ""
  Write-Host "Milestone: $($s.milestone)"
  Write-Host "Primary agents: $($s.primary_agents -join ', ')"
  if ($s.PSObject.Properties.Name -contains "subagents" -and $s.subagents.Count -gt 0) {
    Write-Host "Focused subagents: $($s.subagents -join ', ')"
  }
  Write-Host ""
  Write-Host "Read:"
  foreach ($path in $s.prd) {
    Write-Host "  - $path"
  }
  Write-Host ""
  Write-Host "Definition of Done:"
  foreach ($item in $s.dod) {
    Write-Host "  - $item"
  }
  if ($s.acceptance.Count -gt 0) {
    Write-Host ""
    Write-Host "Acceptance criteria:"
    foreach ($item in $s.acceptance) {
      Write-Host "  - $item"
    }
  }
  Write-Host ""
  Write-Host "Start command:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File tools/agent-harness.ps1 -Command brief -Slice $($s.id)"
}

$repoRoot = Get-RepoRoot
switch ($Command) {
  "validate" { Invoke-Validate $repoRoot -Strict:$Strict }
  "list" { Invoke-List $repoRoot }
  "brief" { Invoke-Brief $repoRoot $Slice }
}
