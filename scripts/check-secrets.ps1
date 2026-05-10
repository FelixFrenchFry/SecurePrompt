param(
    [switch]$Staged
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$patterns = @(
    @{ Name = 'Private key'; Regex = '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
    @{ Name = 'OpenAI API key'; Regex = '\bsk-[A-Za-z0-9_-]{20,}\b' },
    @{ Name = 'Anthropic API key'; Regex = '\bsk-ant-[A-Za-z0-9_-]{20,}\b' },
    @{ Name = 'Google API key'; Regex = '\bAIza[0-9A-Za-z_-]{20,}\b' },
    @{ Name = 'GitHub token'; Regex = '\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b' },
    @{ Name = 'GitHub fine-grained token'; Regex = '\bgithub_pat_[A-Za-z0-9_]{20,}\b' },
    @{ Name = 'AWS access key'; Regex = '\b(AKIA|ASIA)[0-9A-Z]{16}\b' },
    @{ Name = 'Slack token'; Regex = '\bxox[baprs]-[A-Za-z0-9-]{20,}\b' },
    @{ Name = 'Stripe live secret key'; Regex = '\bsk_live_[A-Za-z0-9]{20,}\b' },
    @{ Name = 'JWT'; Regex = '\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b' },
    @{ Name = 'Sensitive assignment'; Regex = '\b(?:[A-Z0-9_]*(?:API[_-]?KEY|ACCESS[_-]?TOKEN|AUTH[_-]?TOKEN|SECRET|PASSWORD|PRIVATE[_-]?KEY)[A-Z0-9_]*|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|secret|password|passwd|pwd|private[_-]?key)\b\s*[:=]\s*["'']?[^"''\s,;]{8,}' }
)

$textExtensions = @(
    '.css',
    '.env',
    '.html',
    '.js',
    '.json',
    '.jsx',
    '.md',
    '.ps1',
    '.sh',
    '.ts',
    '.tsx',
    '.txt',
    '.toml',
    '.yaml',
    '.yml'
)

$textFileNames = @(
    '.gitignore',
    'package.json',
    'pnpm-workspace.yaml',
    'tsconfig.json',
    'wxt.config.ts'
)

function Is-ScannableTextFile {
    param([string]$Path)

    $fileName = [System.IO.Path]::GetFileName($Path)
    $extension = [System.IO.Path]::GetExtension($Path).ToLowerInvariant()

    return $textExtensions.Contains($extension) -or $textFileNames.Contains($fileName)
}

function Get-TargetFiles {
    if ($Staged) {
        return git diff --cached --name-only --diff-filter=ACMR
    }

    return git ls-files --cached --others --exclude-standard
}

function Get-FileContent {
    param([string]$Path)

    if ($Staged) {
        return git show ":$Path"
    }

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return $null
    }

    return Get-Content -LiteralPath $Path -Raw
}

$findings = New-Object System.Collections.Generic.List[string]
$files = Get-TargetFiles | Where-Object { $_ -and (Is-ScannableTextFile $_) }

foreach ($file in $files) {
    $content = Get-FileContent $file

    if ($null -eq $content) {
        continue
    }

    $lines = $content -split "`r?`n"

    for ($index = 0; $index -lt $lines.Count; $index++) {
        $line = $lines[$index]

        foreach ($pattern in $patterns) {
            if ($line -cmatch $pattern.Regex) {
                $lineNumber = $index + 1
                $findings.Add("${file}:${lineNumber} matched $($pattern.Name)") | Out-Null
            }
        }
    }
}

if ($findings.Count -gt 0) {
    Write-Host 'Potential secrets found. Commit blocked.' -ForegroundColor Red
    $findings | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    Write-Host ''
    Write-Host 'If this is a false positive, move the value out of the repo or adjust scripts/check-secrets.ps1 deliberately.' -ForegroundColor Yellow
    exit 1
}

Write-Host 'No obvious secrets found.'
