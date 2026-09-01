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
Write-Host "[0/10] VS Code found."

# --- step 1: ask for paths --------------------------------------------------
if (-not $ToolsRoot) {
    $in = Read-Host "Tools install root [C:\dev]"
    if (-not $in) { $in = "C:\dev" }
    $ToolsRoot = $in
}
if (-not $ProjectsRoot) { $ProjectsRoot = Join-Path $ToolsRoot "projects" }
$TemplatesRoot = Join-Path $ToolsRoot "templates"
New-Item -ItemType Directory -Force -Path $ToolsRoot, $ProjectsRoot, $TemplatesRoot | Out-Null
Write-Host ("[1/10] Tools: {0}  Templates: {1}  Projects: {2}" -f $ToolsRoot, $TemplatesRoot, $ProjectsRoot)

function Fetch($url, $out) {
    # expected magic bytes per archive type - a 404/HTML page must not pass as success
    $kind = $null
    if ($out -match '\.zst$') { $kind = "zst" }
    elseif ($out -match '\.zip$') { $kind = "zip" }
    elseif ($out -match '\.gz$') { $kind = "gz" }
    for ($i = 1; $i -le 8; $i++) {
        Write-Host ("      download attempt {0}/8: {1}" -f $i, $url) -ForegroundColor DarkGray
        if ($i -eq 1) {
            & curl.exe -L --ssl-no-revoke --connect-timeout 20 -o $out $url
        } else {
            & curl.exe -L --ssl-no-revoke --connect-timeout 20 -C - -o $out $url   # resume
        }
        if ($LASTEXITCODE -eq 0 -and (Test-Path $out) -and ((Get-Item $out).Length -gt 0)) {
            if (-not $kind) { return }
            $fs = [System.IO.File]::OpenRead($out)
            $b = New-Object byte[] 4
            $n = $fs.Read($b, 0, 4)
            $fs.Close()
            $ok = switch ($kind) {
                "zst" { ($n -ge 4) -and ($b[0] -eq 0x28) -and ($b[1] -eq 0xB5) -and ($b[2] -eq 0x2F) -and ($b[3] -eq 0xFD) }
                "zip" { ($n -ge 2) -and ($b[0] -eq 0x50) -and ($b[1] -eq 0x4B) }
                "gz"  { ($n -ge 2) -and ($b[0] -eq 0x1F) -and ($b[1] -eq 0x8B) }
                default { $true }
            }
            if ($ok) { return }
            Write-Host "      downloaded file is not a valid $kind archive (mirror error page?)" -ForegroundColor Yellow
            Remove-Item $out -Force -ErrorAction SilentlyContinue
        }
        if ($LASTEXITCODE -eq 33) { return }   # range satisfied = file already complete
        Write-Host "      retrying in 5s..." -ForegroundColor Yellow
        Start-Sleep 5
    }
    throw "下载失败（已重试 8 次仍失败）：多半是网络或镜像源问题。请检查代理/网络后重新运行本脚本，已下载的部分会自动续传。URL: $url"
}

function Resolve-Msys2Pkg($IndexContent, $Pattern) {
    return ([regex]::Matches($IndexContent, $Pattern) |
            ForEach-Object { $_.Value } | Sort-Object | Select-Object -Last 1)
}

# probe: can the built-in bsdtar extract zstd? (older Win10 builds cannot)
$TarExe = Join-Path $env:SystemRoot "System32\tar.exe"
$ZstdOk = $false
if (Test-Path $TarExe) {
    $probe = Join-Path $env:TEMP "dw-zstd-probe.txt"
    Set-Content -Path $probe -Value "probe" -Encoding Ascii
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $TarExe --zstd -cf "$probe.zst" -C $env:TEMP "dw-zstd-probe.txt" 2>$null
    $ErrorActionPreference = $prevEap
    $ZstdOk = ($LASTEXITCODE -eq 0) -and (Test-Path "$probe.zst")
    Remove-Item $probe, "$probe.zst" -Force -ErrorAction SilentlyContinue
}
if (-not $ZstdOk) {
    Write-Host "[WARN] built-in tar.exe cannot extract .zst archives (older Windows 10)." -ForegroundColor Yellow
    Write-Host "       SDCC/Python steps will fail; see README troubleshooting (7-Zip manual install)." -ForegroundColor Yellow
}

# --- step 2: SDCC (TUNA msys2 mirror, includes 8051 support) ----------------
$sdccPath = Join-Path $ToolsRoot "sdcc"
if (Test-Path (Join-Path $sdccPath "bin\sdcc.exe")) {
    Write-Host "[2/10] SDCC already installed."
} elseif ($NoDownload) {
    Write-Host "[2/10] SKIP download (-NoDownload): SDCC missing!" -ForegroundColor Yellow
} else {
    Write-Host "[2/10] Installing SDCC (+ runtime libraries) ..."
    try {
        # the msys2 sdcc build needs runtime DLLs from these packages; without
        # them sdcc.exe cannot even start on a machine that has no other
        # mingw toolchain on PATH (libgcc/libstdc++/libwinpthread/libintl/zlib)
        $deps = @(
            'mingw-w64-x86_64-sdcc-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-gcc-libs-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-libwinpthread-git-[\w\.\-]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-gettext-runtime-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-libiconv-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-zlib-[\d\.]+-\d+-any\.pkg\.tar\.zst'
        )
        $idx = Invoke-WebRequest -UseBasicParsing "https://mirrors.tuna.tsinghua.edu.cn/msys2/mingw/mingw64/"
        $pkgs = @()
        foreach ($p in $deps) {
            $f = Resolve-Msys2Pkg $idx.Content $p
            if (-not $f) { throw "could not find package matching $p on TUNA mirror" }
            $pkgs += $f
        }
        $tar = Join-Path $env:SystemRoot "System32\tar.exe"
        foreach ($f in $pkgs) {
            Write-Host ("      fetching {0}" -f $f) -ForegroundColor DarkGray
            $pkg = Join-Path $env:TEMP $f
            Fetch "https://mirrors.tuna.tsinghua.edu.cn/msys2/mingw/mingw64/$f" $pkg
            & $tar --zstd -xf $pkg -C $ToolsRoot
            if ($LASTEXITCODE -ne 0) { throw "解压失败：$f。若提示 .zst 不支持，见 README 故障排查，用 7-Zip 手动解压后重跑 setup.ps1。" }
            Remove-Item $pkg -Force
        }
        Move-Item (Join-Path $ToolsRoot "mingw64") $sdccPath
    } catch {
        Write-Host ("      SDCC failed: " + $_.Exception.Message) -ForegroundColor Red
        Write-Host "      skipped - re-run setup later to retry" -ForegroundColor Yellow
    }
}
if (Test-Path $sdccPath) { $script:SdccFwd = ($sdccPath -replace '\\', '/') }

# --- step 3: ARM GCC (xpack) -------------------------------------------------
$armDir = Get-ChildItem $ToolsRoot -Directory -Filter "xpack-arm-none-eabi-gcc-*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($armDir) {
    Write-Host "[3/10] ARM GCC already installed."
} elseif ($NoDownload) {
    Write-Host "[3/10] SKIP download (-NoDownload): ARM GCC missing!" -ForegroundColor Yellow
} else {
    Write-Host "[3/10] Installing Arm GNU Toolchain (xpack, ~250 MB) ..."
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
    Write-Host "[4/10] OpenOCD already installed."
} elseif ($NoDownload) {
    Write-Host "[4/10] SKIP download (-NoDownload): OpenOCD missing!" -ForegroundColor Yellow
} else {
    Write-Host "[4/10] Installing OpenOCD (xpack) ..."
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
    Write-Host "[5/10] Python already installed."
} elseif ($NoDownload) {
    Write-Host "[5/10] SKIP download (-NoDownload): Python missing!" -ForegroundColor Yellow
} else {
    Write-Host "[5/10] Installing Python 3.12 (portable build) ..."
    try {
        $pkg = Join-Path $env:TEMP "cpython-3.12.7-install_only.tar.gz"
        Fetch "https://ghfast.top/https://github.com/indygreg/python-build-standalone/releases/download/20241016/cpython-3.12.7+20241016-x86_64-pc-windows-msvc-shared-install_only.tar.gz" $pkg
        $tar = Join-Path $env:SystemRoot "System32\tar.exe"
        & $tar -xzf $pkg -C $ToolsRoot
        if ($LASTEXITCODE -ne 0) { throw "解压失败：Python 压缩包解压出错，见 README 故障排查（或手动用 tar 解压）。" }
        Move-Item (Join-Path $ToolsRoot "python") $pyDir
        Remove-Item $pkg -Force
    } catch {
        Write-Host ("      Python failed: " + $_.Exception.Message) -ForegroundColor Red
        Write-Host "      skipped - re-run setup later to retry" -ForegroundColor Yellow
    }
}
if (Test-Path (Join-Path $pyDir "python.exe")) {
    $script:PyExe = Join-Path $pyDir "python.exe"
    # pip writes progress to stderr; with $ErrorActionPreference = "Stop" a
    # redirected native stderr stream becomes a NativeCommandError in PS 5.1
    # and aborts the script, so all pip calls run under "Continue"
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    & $PyExe -m pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple 2>&1 | Out-Null
    # STC51 uploader required by EIDE (it spawns bare "stcgal")
    if (Test-Path (Join-Path $pyDir "Lib\site-packages\stcgal")) {
        Write-Host "[5/10] stcgal already installed."
    } else {
        Write-Host "[5/10] Installing stcgal (STC51 flashing tool) ..."
        & $PyExe -m pip install --quiet stcgal 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0 -and (Test-Path (Join-Path $pyDir "Lib\site-packages\stcgal"))) {
            Write-Host "      stcgal installed."
        } else {
            Write-Host "      stcgal install failed - STC51 flashing will not work; re-run setup later" -ForegroundColor Yellow
        }
    }
    $ErrorActionPreference = $prevEap
}

# --- step 6: CMake (portable build from Kitware) ------------------------------
$cmakeDir = Get-ChildItem $ToolsRoot -Directory -Filter "cmake-*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($cmakeDir -and (Test-Path (Join-Path $cmakeDir.FullName "bin\cmake.exe"))) {
    Write-Host "[6/10] CMake already installed."
} elseif ($NoDownload) {
    Write-Host "[6/10] SKIP download (-NoDownload): CMake missing!" -ForegroundColor Yellow
} else {
    Write-Host "[6/10] Installing CMake (portable build) ..."
    try {
        $zip = Join-Path $env:TEMP "cmake-win64.zip"
        Fetch "https://ghfast.top/https://github.com/Kitware/CMake/releases/download/v3.30.0/cmake-3.30.0-windows-x86_64.zip" $zip
        Expand-Archive -Path $zip -DestinationPath $ToolsRoot -Force
        Remove-Item $zip -Force
    } catch {
        Write-Host ("      CMake failed: " + $_.Exception.Message) -ForegroundColor Red
        Write-Host "      skipped - re-run setup later to retry" -ForegroundColor Yellow
    }
    $cmakeDir = Get-ChildItem $ToolsRoot -Directory -Filter "cmake-*" | Select-Object -First 1
}
if ($cmakeDir -and (Test-Path (Join-Path $cmakeDir.FullName "bin\cmake.exe"))) {
    $script:CmakePath = $cmakeDir.FullName
}

# --- step 7: MinGW-w64 GCC/G++ (TUNA msys2 mirror) -----------------------------
# native C/C++ toolchain for the c-base / cpp-base templates. gcc's cc1 backend
# needs gmp/mpc/mpfr/isl/winpthread/iconv/zlib runtime DLLs, plus binutils
# (as/ld/ar/...) to assemble/link and the MinGW-w64 CRT + headers
# (crt-git: crt2.o / libmingw32 / libmingwex / libmsvcrt; headers-git: windows.h)
# so we pull them all into one mingw64 tree (same layout the SDCC step uses).
$mingwPath = Join-Path $ToolsRoot "mingw64"
if (Test-Path (Join-Path $mingwPath "bin\gcc.exe")) {
    Write-Host "[7/10] MinGW-w64 already installed."
} elseif ($NoDownload) {
    Write-Host "[7/10] SKIP download (-NoDownload): MinGW-w64 missing!" -ForegroundColor Yellow
} else {
    Write-Host "[7/10] Installing MinGW-w64 GCC/G++ (C/C++ toolchain) ..."
    try {
        $deps = @(
            # pin gcc to the 14.2.0 stable series: gcc 16.x on the mirror was
            # built against mpfr 6.x which is not published there yet, so its
            # cc1 fails to load libmpfr-6. 14.2.0 matches the gmp/mpc/mpfr/isl
            # SONAMEs currently on the mirror.
            'mingw-w64-x86_64-gcc-14\.2\.0-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-gcc-libs-14\.2\.0-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-binutils-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            # pin the mingw-w64 core runtime to the 12.0.0.r747 series so it
            # matches gcc 14.2.0 and stays on the "merged" layout (no symlinks
            # that Windows' bsdtar would silently drop, which would otherwise
            # wipe x86_64-w64-mingw32/lib and leave crt objects unresolvable).
            'mingw-w64-x86_64-crt-git-12\.0\.0\.r747[\w\.\-]*-1-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-headers-git-12\.0\.0\.r747[\w\.\-]*-1-any\.pkg\.tar\.zst',
            # winpthreads provides the pthread.h headers + libpthread.a import
            # lib (the separate libwinpthread-git below only ships the runtime
            # DLL libwinpthread-1.dll). Both are needed for C++ <thread>.
            'mingw-w64-x86_64-winpthreads-12\.0\.0\.r747[\w\.\-]*-1-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-libwinpthread-git-12\.0\.0\.r747[\w\.\-]*-1-any\.pkg\.tar\.zst',
            # CMake's "MinGW Makefiles" generator needs mingw32-make.exe, which
            # lives in its own make package (not in binutils).
            'mingw-w64-x86_64-make-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            # libintl-8.dll is linked by binutils' as/ld and by mingw32-make,
            # so it must be on PATH or linking/build fails with a silent DLL error.
            'mingw-w64-x86_64-gettext-runtime-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            # default-manifest.o (the UAC manifest object) is required by ld at
            # link time but ships in its own package, NOT in crt-git.
            'mingw-w64-x86_64-windows-default-manifest-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-libiconv-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-zlib-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-gmp-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-mpc-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-mpfr-[\d\.]+-\d+-any\.pkg\.tar\.zst',
            'mingw-w64-x86_64-isl-[\d\.]+-\d+-any\.pkg\.tar\.zst'
        )
        $idx = Invoke-WebRequest -UseBasicParsing "https://mirrors.tuna.tsinghua.edu.cn/msys2/mingw/mingw64/"
        $pkgs = @()
        foreach ($p in $deps) {
            $f = Resolve-Msys2Pkg $idx.Content $p
            if (-not $f) { throw "could not find package matching $p on TUNA mirror" }
            $pkgs += $f
        }
        $tar = Join-Path $env:SystemRoot "System32\tar.exe"
        $tmpMingw = Join-Path $env:TEMP "dw-mingw-extract"
        if (Test-Path $tmpMingw) { Remove-Item $tmpMingw -Recurse -Force }
        New-Item -ItemType Directory -Force -Path $tmpMingw | Out-Null
        foreach ($f in $pkgs) {
            Write-Host ("      fetching {0}" -f $f) -ForegroundColor DarkGray
            $pkg = Join-Path $env:TEMP $f
            Fetch "https://mirrors.tuna.tsinghua.edu.cn/msys2/mingw/mingw64/$f" $pkg
            & $tar --zstd -xf $pkg -C $tmpMingw
            if ($LASTEXITCODE -ne 0) { throw "解压失败：$f。若提示 .zst 不支持，见 README 故障排查，用 7-Zip 手动解压后重跑 setup.ps1。" }
            Remove-Item $pkg -Force
        }
        if (Test-Path $mingwPath) { Remove-Item $mingwPath -Recurse -Force }
        Move-Item (Join-Path $tmpMingw "mingw64") $mingwPath
    } catch {
        Write-Host ("      MinGW-w64 failed: " + $_.Exception.Message) -ForegroundColor Red
        Write-Host "      skipped - re-run setup later to retry" -ForegroundColor Yellow
    }
}
if (Test-Path (Join-Path $mingwPath "bin\gcc.exe")) { $script:MingwPath = $mingwPath }

# --- step 8: materialize templates (patch path tokens) -------------------------
Write-Host "[8/10] Generating template library ..."
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
Write-Host "[9/10] Installing VS Code extensions ..."
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
Write-Host "[10/10] Writing VS Code user settings ..."
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
if ($script:CmakePath) { Set-Kv $settings "cmake.cmakePath" (Join-Path $script:CmakePath "bin\cmake.exe") }
Set-Kv $settings "devWizard.templatesRoot" $TemplatesRoot
Set-Kv $settings "devWizard.projectsRoot" $ProjectsRoot

$jsonOut = $settings | ConvertTo-Json -Depth 10
Set-Content -Path $settingsPath -Value $jsonOut -Encoding UTF8
Write-Host "      settings written (backup: settings.json.bak-setup)"

# --- step 8b: put python/sdcc on the user PATH -------------------------------
# EIDE spawns bare "stcgal" (needs Scripts dir) and users expect python/sdcc
# to work in any terminal. Idempotent; skipped when the user PATH uses
# REG_EXPAND_SZ variables (we would rewrite it as plain REG_SZ).
function Add-UserPath($dir) {
    if (-not (Test-Path $dir)) { return }
    try {
        $raw = (Get-ItemProperty "HKCU:\Environment" -Name Path -ErrorAction SilentlyContinue).Path
        if ($raw -and $raw.Contains('%')) {
            Write-Host ("      user PATH contains %variables%, add manually: {0}" -f $dir) -ForegroundColor Yellow
            return
        }
        $parts = @()
        if ($raw) { $parts = @($raw -split ';' | Where-Object { $_ }) }
        if ($parts -notcontains $dir) {
            $new = if ($parts.Count) { ($parts + $dir) -join ';' } else { $dir }
            [Environment]::SetEnvironmentVariable("Path", $new, "User")
            Write-Host ("      PATH added: {0}" -f $dir)
        }
    } catch {
        Write-Host ("      could not update user PATH: " + $_.Exception.Message) -ForegroundColor Yellow
    }
}
Write-Host "[10/10] Updating user PATH (python / sdcc / mingw / cmake) ..."
Add-UserPath $pyDir
Add-UserPath (Join-Path $pyDir "Scripts")
Add-UserPath (Join-Path $sdccPath "bin")
if (Test-Path (Join-Path $mingwPath "bin\gcc.exe")) { Add-UserPath (Join-Path $mingwPath "bin") }
if ($script:CmakePath) { Add-UserPath (Join-Path $script:CmakePath "bin") }

Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green
Write-Host "Restart VS Code (so it picks up the new settings/PATH), the wizard pops up,"
Write-Host "STC51/STM32 projects compile with F7, STC51 flashing uses stcgal,"
Write-Host "C/C++ projects build with CMake Tools (MinGW gcc/g++ + CMake auto-detected)."
if (-not $script:ArmPath -or -not $script:OcdPath) {
    Write-Host "NOTE: some downloads were skipped (-NoDownload); STM32 debug config not written." -ForegroundColor Yellow
}
