# =============================================================================
# Dev Wizard environment setup (Windows 10/11, PowerShell 5.1 built-in)
#
# Installs every toolchain the bundled project templates need, generates the
# template library with correct paths, installs VS Code extensions and writes
# the required VS Code user settings.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/setup.ps1 -ToolsRoot D:\dev
#   ... -NoDownload           # only templates/settings (tools must exist)
#
# Idempotent: safe to re-run, already-installed tools are skipped.
# =============================================================================
param(
    [string]$ToolsRoot = "",
    [string]$ProjectsRoot = "",
    [switch]$NoDownload
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ProgressPreference = "SilentlyContinue"

$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host ""
Write-Host "=== Dev Wizard environment setup ===" -ForegroundColor Cyan

# --- step 0: prerequisites -------------------------------------------------
$codeCmd = Get-Command code -ErrorAction SilentlyContinue
if (-not $codeCmd) {
    # probe common install locations when PATH lookup fails
    $cands = @(
        "$env:LOCALAPPDATA\Programs\Microsoft VS Code\bin",
        "$env:ProgramFiles\Microsoft VS Code\bin",
        "${env:ProgramFiles(x86)}\Microsoft VS Code\bin"
    )
    foreach ($c in $cands) {
        if (Test-Path (Join-Path $c "code.cmd")) { $env:Path += ";$c"; break }
    }
    $codeCmd = Get-Command code -ErrorAction SilentlyContinue
}
if (-not $codeCmd) {
    # last resort: HKCU App Paths\code.exe (written by the VS Code installer)
    $ap = Get-ItemProperty "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\code.exe" -ErrorAction SilentlyContinue
    if (-not $ap) { $ap = Get-ItemProperty "HKLM:\Software\Microsoft\Windows\CurrentVersion\App Paths\code.exe" -ErrorAction SilentlyContinue }
    if ($ap -and $ap.'(default)') {
        $dir = Split-Path $ap.'(default)'
        foreach ($bin in @($dir, (Join-Path $dir "bin"))) {
            if (Test-Path (Join-Path $bin "code.cmd")) { $env:Path += ";$bin"; $codeCmd = Get-Command code -ErrorAction SilentlyContinue; break }
        }
    }
}
if (-not $codeCmd) {
    Write-Host "[ERROR] VS Code 'code' command not found in PATH." -ForegroundColor Red
    Write-Host "        Install VS Code first (keep 'Add to PATH' checked), then re-run."
    exit 1
}
Write-Host "[0/8] VS Code found."

# --- step 1: ask for paths --------------------------------------------------
if (-not $ToolsRoot) {
    $in = Read-Host "Tools install root [C:\dev]"
    if (-not $in) { $in = "C:\dev" }
    $ToolsRoot = $in
}
if (-not $ProjectsRoot) { $ProjectsRoot = Join-Path $ToolsRoot "projects" }
$TemplatesRoot = Join-Path $ToolsRoot "templates"
New-Item -ItemType Directory -Force -Path $ToolsRoot, $ProjectsRoot, $TemplatesRoot | Out-Null
Write-Host ("[1/8] Tools: {0}  Templates: {1}  Projects: {2}" -f $ToolsRoot, $TemplatesRoot, $ProjectsRoot)

function Fetch($url, $out) {
    for ($i = 1; $i -le 8; $i++) {
        Write-Host ("      download attempt {0}/8: {1}" -f $i, $url) -ForegroundColor DarkGray
        if ($i -eq 1) {
            & curl.exe -L --ssl-no-revoke --connect-timeout 20 -o $out $url
        } else {
            & curl.exe -L --ssl-no-revoke --connect-timeout 20 -C - -o $out $url   # resume
        }
        if ($LASTEXITCODE -eq 0 -and (Test-Path $out) -and ((Get-Item $out).Length -gt 0)) { return }
        if ($LASTEXITCODE -eq 33) { return }   # range satisfied = file already complete
        Write-Host "      retrying in 5s..." -ForegroundColor Yellow
        Start-Sleep 5
    }
    throw "download failed after retries: $url"
}

# --- step 2: SDCC (TUNA msys2 mirror, includes 8051 support) ----------------
$sdccPath = Join-Path $ToolsRoot "sdcc"
if (Test-Path (Join-Path $sdccPath "bin\sdcc.exe")) {
    Write-Host "[2/8] SDCC already installed."
} elseif ($NoDownload) {
    Write-Host "[2/8] SKIP download (-NoDownload): SDCC missing!" -ForegroundColor Yellow
} else {
    Write-Host "[2/8] Installing SDCC ..."
    try {
        $idx = Invoke-WebRequest -UseBasicParsing "https://mirrors.tuna.tsinghua.edu.cn/msys2/mingw/mingw64/"
        $f = ([regex]::Matches($idx.Content, 'mingw-w64-x86_64-sdcc-[\d\.]+-\d+-any\.pkg\.tar\.zst') |
              ForEach-Object { $_.Value } | Sort-Object | Select-Object -Last 1)
        if (-not $f) { throw "could not find SDCC package on TUNA mirror" }
        $pkg = Join-Path $env:TEMP $f
        Fetch "https://mirrors.tuna.tsinghua.edu.cn/msys2/mingw/mingw64/$f" $pkg
        $tar = Join-Path $env:SystemRoot "System32\tar.exe"
        & $tar --zstd -xf $pkg -C $ToolsRoot
        if ($LASTEXITCODE -ne 0) { throw "extraction failed" }
        Move-Item (Join-Path $ToolsRoot "mingw64") $sdccPath
        Remove-Item $pkg -Force
    } catch {
        Write-Host ("      SDCC failed: " + $_.Exception.Message) -ForegroundColor Red
        Write-Host "      skipped - re-run setup later to retry" -ForegroundColor Yellow
    }
}
if (Test-Path $sdccPath) { $script:SdccFwd = ($sdccPath -replace '\\', '/') }

# --- step 3: ARM GCC (xpack) -------------------------------------------------
$armDir = Get-ChildItem $ToolsRoot -Directory -Filter "xpack-arm-none-eabi-gcc-*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($armDir) {
    Write-Host "[3/8] ARM GCC already installed."
} elseif ($NoDownload) {
    Write-Host "[3/8] SKIP download (-NoDownload): ARM GCC missing!" -ForegroundColor Yellow
} else {
    Write-Host "[3/8] Installing Arm GNU Toolchain (xpack, ~250 MB) ..."
    try {
        $zip = Join-Path $env:TEMP "xpack-arm-none-eabi-gcc.zip"
        Fetch "https://ghfast.top/https://github.com/xpack-dev-tools/arm-none-eabi-gcc-xpack/releases/download/v13.2.1-1.1/xpack-arm-none-eabi-gcc-13.2.1-1.1-win32-x64.zip" $zip
        Expand-Archive -Path $zip -DestinationPath $ToolsRoot -Force
        Remove-Item $zip -Force
    } catch {
        Write-Host ("      ARM GCC failed: " + $_.Exception.Message) -ForegroundColor Red
        Write-Host "      skipped - re-run setup later to retry" -ForegroundColor Yellow
    }
    $armDir = Get-ChildItem $ToolsRoot -Directory -Filter "xpack-arm-none-eabi-gcc-*" | Select-Object -First 1
}
if ($armDir) { $script:ArmPath = $armDir.FullName }

# --- step 4: OpenOCD (xpack) --------------------------------------------------
$ocdDir = Get-ChildItem $ToolsRoot -Directory -Filter "xpack-openocd-*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($ocdDir) {
    Write-Host "[4/8] OpenOCD already installed."
} elseif ($NoDownload) {
    Write-Host "[4/8] SKIP download (-NoDownload): OpenOCD missing!" -ForegroundColor Yellow
} else {
    Write-Host "[4/8] Installing OpenOCD (xpack) ..."
    try {
        $zip = Join-Path $env:TEMP "xpack-openocd.zip"
        Fetch "https://ghfast.top/https://github.com/xpack-dev-tools/openocd-xpack/releases/download/v0.12.0-7/xpack-openocd-0.12.0-7-win32-x64.zip" $zip
        Expand-Archive -Path $zip -DestinationPath $ToolsRoot -Force
        Remove-Item $zip -Force
    } catch {
        Write-Host ("      OpenOCD failed: " + $_.Exception.Message) -ForegroundColor Red
        Write-Host "      skipped - re-run setup later to retry" -ForegroundColor Yellow
    }
    $ocdDir = Get-ChildItem $ToolsRoot -Directory -Filter "xpack-openocd-*" | Select-Object -First 1
}
if ($ocdDir) { $script:OcdPath = $ocdDir.FullName }

# --- step 5: Python 3.12 -------------------------------------------------------
$pyDir = Join-Path $ToolsRoot "python312"
if (Test-Path (Join-Path $pyDir "python.exe")) {
    Write-Host "[5/8] Python already installed."
} elseif ($NoDownload) {
    Write-Host "[5/8] SKIP download (-NoDownload): Python missing!" -ForegroundColor Yellow
} else {
    Write-Host "[5/8] Installing Python 3.12 (portable build) ..."
    try {
        $pkg = Join-Path $env:TEMP "cpython-3.12.7-install_only.tar.gz"
        Fetch "https://ghfast.top/https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-pc-windows-msvc-shared-install_only.tar.gz" $pkg
        $tar = Join-Path $env:SystemRoot "System32\tar.exe"
        & $tar -xzf $pkg -C $ToolsRoot
        if ($LASTEXITCODE -ne 0) { throw "extraction failed" }
        Move-Item (Join-Path $ToolsRoot "python") $pyDir
        Remove-Item $pkg -Force
    } catch {
        Write-Host ("      Python failed: " + $_.Exception.Message) -ForegroundColor Red
        Write-Host "      skipped - re-run setup later to retry" -ForegroundColor Yellow
    }
}
if (Test-Path (Join-Path $pyDir "python.exe")) {
    $script:PyExe = Join-Path $pyDir "python.exe"
    & $PyExe -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple 2>&1 | Out-Null
}

# --- step 6: materialize templates (patch path tokens) -------------------------
Write-Host "[6/8] Generating template library ..."
$srcTpl = Join-Path $RepoRoot "templates"
if (-not (Test-Path $srcTpl)) { throw "templates folder missing in repo" }

$map = @{}
if ($script:SdccFwd) { $map["__SDCC_ROOT__"] = $script:SdccFwd }
if ($script:ArmPath) { $map["__ARM_GCC_ROOT__"] = ($script:ArmPath -replace '\\', '/') }
if ($script:OcdPath) { $map["__OPENOCD_ROOT__"] = ($script:OcdPath -replace '\\', '/') }

$textExt = @(".json", ".yml", ".md", ".c", ".h", ".cpp", ".hpp", ".ps1", ".code-workspace", ".cfg", ".ld", ".yml", ".ini", ".txt")
foreach ($t in Get-ChildItem $srcTpl -Directory) {
    $dst = Join-Path $TemplatesRoot $t.Name
    if (Test-Path $dst) { Remove-Item $dst -Recurse -Force }
    Copy-Item $t.FullName $dst -Recurse
    $b = Join-Path $dst "build"
    if (Test-Path $b) { Remove-Item $b -Recurse -Force }
    Get-ChildItem $dst -Recurse -File | Where-Object { $textExt -contains $_.Extension.ToLower() } | ForEach-Object {
        $txt = Get-Content $_.FullName -Raw -Encoding UTF8
        $orig = $txt
        foreach ($k in $map.Keys) { $txt = $txt.Replace($k, $map[$k]) }
        if ($txt -ne $orig) { Set-Content -Path $_.FullName -Value $txt -Encoding UTF8 -NoNewline }
    }
    Write-Host ("      template ready: {0}" -f $t.Name)
}

# --- step 7: VS Code extensions --------------------------------------------------
Write-Host "[7/8] Installing VS Code extensions ..."
$ErrorActionPreference = "Continue"   # code.exe writes noisy stderr; don't abort on it
$devWizardVsix = ""
if (Test-Path (Join-Path $RepoRoot "scripts\make-vsix.ps1")) {
    Push-Location $RepoRoot
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\make-vsix.ps1 | Out-Null
    $devWizardVsix = Join-Path $RepoRoot "dev-wizard-$((Get-Content (Join-Path $RepoRoot 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version).vsix"
    Pop-Location
}
foreach ($ext in @("cl.eide", "ms-python.python", "marus25.cortex-debug", "ms-vscode.cmake-tools")) {
    & code --install-extension $ext 2>&1 | Out-Null
}
if ($devWizardVsix -and (Test-Path $devWizardVsix)) {
    & code --install-extension $devWizardVsix 2>&1 | Out-Null
}
$ErrorActionPreference = "Stop"
Write-Host "      extensions ready (restart VS Code to activate)"

# --- step 8: merge VS Code user settings ------------------------------------------
Write-Host "[8/8] Writing VS Code user settings ..."
$settingsPath = Join-Path $env:APPDATA "Code\User\settings.json"
$settings = $null
if (Test-Path $settingsPath) {
    Copy-Item $settingsPath "$settingsPath.bak-setup" -Force
    $raw = Get-Content $settingsPath -Raw -Encoding UTF8
    $raw = $raw -replace '(?m)^\s*//.*$', ''          # line comments
    $raw = $raw -replace '(?s)/\*.*?\*/', ''          # block comments
    try { $settings = $raw | ConvertFrom-Json } catch {
        Write-Host "      could not parse existing settings, starting fresh (backup saved)" -ForegroundColor Yellow
        $settings = New-Object PSObject
    }
}
if (-not $settings) { $settings = New-Object PSObject }
function Set-Kv($obj, $key, $value) {
    if ($obj.PSObject.Properties[$key]) { $obj.PSObject.Properties[$key].Value = $value }
    else { $obj | Add-Member -MemberType NoteProperty -Name $key -Value $value }
}
if ($script:SdccFwd) { Set-Kv $settings "EIDE.SDCC.InstallDirectory" ($sdccPath) }
if ($script:ArmPath) { Set-Kv $settings "EIDE.ARM.GCC.InstallDirectory" $script:ArmPath }
if ($script:OcdPath) { Set-Kv $settings "cortex-debug.openocdPath" $script:OcdPath }
if ($script:PyExe)   { Set-Kv $settings "python.defaultInterpreterPath" $script:PyExe }
Set-Kv $settings "devWizard.templatesRoot" $TemplatesRoot
Set-Kv $settings "devWizard.projectsRoot" $ProjectsRoot

$jsonOut = $settings | ConvertTo-Json -Depth 10
Set-Content -Path $settingsPath -Value $jsonOut -Encoding UTF8
Write-Host "      settings written (backup: settings.json.bak-setup)"

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "Restart VS Code, the wizard pops up, all project types compile with F7."
if (-not $script:ArmPath -or -not $script:OcdPath) {
    Write-Host "NOTE: some downloads were skipped (-NoDownload); STM32 debug config not written." -ForegroundColor Yellow
}
