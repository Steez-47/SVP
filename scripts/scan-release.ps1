# Scan the unpacked application: Defender missed the compressed v0.1.0 installer.
param([string[]]$BinaryPath, [string]$Profile = 'release', [string]$Target, [switch]$IncludeInstaller)

$ErrorActionPreference = 'Stop'
$status = Get-MpComputerStatus
if (-not $status.AntivirusEnabled -or -not $status.RealTimeProtectionEnabled) {
    throw 'Microsoft Defender must be active before packaging SVP.'
}

$scanTemp = $null
try {
    if (-not $BinaryPath) {
        $repoRoot = Split-Path $PSScriptRoot -Parent
        $metadata = & cargo metadata --manifest-path (Join-Path $repoRoot 'src-tauri/Cargo.toml') --locked --no-deps --format-version 1
        if ($LASTEXITCODE -ne 0) { throw 'Could not locate the Cargo build output.' }
        $targetDir = ($metadata | ConvertFrom-Json).target_directory
        if ($Target) { $targetDir = Join-Path $targetDir $Target }
        $artifactDir = Join-Path $targetDir $Profile
        $BinaryPath = @(Join-Path $artifactDir 'svp.exe')
        if ($IncludeInstaller) {
            $version = (Get-Content -LiteralPath (Join-Path $repoRoot 'src-tauri/tauri.conf.json') -Raw | ConvertFrom-Json).version
            $installers = @(Get-ChildItem -LiteralPath (Join-Path $artifactDir 'bundle/nsis') -Filter "SVP_${version}_*-setup.exe" -File)
            if (-not $installers) { throw 'No finished SVP installer found to scan.' }
            $sevenZip = Join-Path $env:ProgramFiles '7-Zip/7z.exe'
            if (-not (Test-Path -LiteralPath $sevenZip)) { throw '7-Zip is required to verify the packaged executable.' }
            $scanTemp = Join-Path ([System.IO.Path]::GetTempPath()) ("svp-scan-" + [guid]::NewGuid().ToString('N'))
            foreach ($installer in $installers) {
                $extractDir = Join-Path $scanTemp $installer.BaseName
                & $sevenZip x $installer.FullName 'svp.exe' "-o$extractDir" -y | Out-Null
                if ($LASTEXITCODE -ne 0) { throw 'Could not extract the packaged SVP executable.' }
                $BinaryPath += $installer.FullName
                $BinaryPath += Join-Path $extractDir 'svp.exe'
            }
        }
    }
    $platformDir = Join-Path $env:ProgramData 'Microsoft/Windows Defender/Platform'
    $scanner = Get-ChildItem -Path "$platformDir/*/MpCmdRun.exe" -ErrorAction SilentlyContinue |
        Sort-Object { $_.VersionInfo.FileVersionRaw } -Descending | Select-Object -First 1 -ExpandProperty FullName
    if (-not $scanner) { $scanner = Join-Path $env:ProgramFiles 'Windows Defender/MpCmdRun.exe' }
    if (-not (Test-Path -LiteralPath $scanner -PathType Leaf)) { throw 'Microsoft Defender scanner was not found.' }

    Write-Host "Defender signatures: $($status.AntivirusSignatureVersion)"
    foreach ($binary in $BinaryPath) {
        $resolved = (Resolve-Path -LiteralPath $binary).Path
        if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) { throw "Missing executable: $resolved" }
        & $scanner -Scan -ScanType 3 -File $resolved -DisableRemediation
        if ($LASTEXITCODE -ne 0) { throw "Defender rejected $resolved (exit $LASTEXITCODE). Packaging stopped." }
        $stream = [System.IO.File]::OpenRead($resolved)
        $sha = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hash = [System.BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant()
            Write-Host "SHA256: $hash  $resolved"
        } finally {
            $sha.Dispose()
            $stream.Dispose()
        }
    }
} finally {
    # Delete only this invocation's generated extraction directory.
    if ($scanTemp -and (Test-Path -LiteralPath $scanTemp)) {
        $expectedParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\', '/')
        $resolvedTemp = [System.IO.Path]::GetFullPath($scanTemp)
        if ((Split-Path $resolvedTemp -Parent) -ne $expectedParent -or (Split-Path $resolvedTemp -Leaf) -notmatch '^svp-scan-[a-f0-9]{32}$') {
            throw "Unexpected scan directory: $resolvedTemp"
        }
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
