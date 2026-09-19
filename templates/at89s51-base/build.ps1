<#
    AT89S51 独立构建脚本 —— 只用 SDCC，不依赖 EIDE，也不需要 make。

    用法（在本工程根目录）：
        .\build.ps1                      编译，产物在 build\Debug\<工程名>.hex
        .\build.ps1 -Clean               先删掉上次的产物再编译
        .\build.ps1 -Flash               编译后用 USBasp + avrdude 下载
        .\build.ps1 -CodeSize 8192       换 AT89S52（8 KB Flash）时用
        .\build.ps1 -SdccRoot D:\SDCC    手动指定 SDCC 安装目录

    产物路径与 EIDE（F7）完全一致：build\Debug\<工程名>.hex，
    所以两种编译方式可以混用，EIDE 的烧录按钮也能直接用。

    SDCC 的查找顺序：-SdccRoot 参数 > 环境变量 SDCC_ROOT > PATH 里的 sdcc
                     > E:\vscode\tools\sdcc > C:\SDCC / D:\SDCC / E:\sdcc
#>
[CmdletBinding()]
param(
    [int]$CodeSize = 4096,          # AT89S51 = 4096，AT89S52 = 8192
    [switch]$Clean,
    [switch]$Flash,
    [string]$Programmer = 'usbasp',
    [string]$Part = 'at89s51',
    [string]$SdccRoot = ''
)

$ErrorActionPreference = 'Stop'

$root     = $PSScriptRoot
$srcDir   = Join-Path $root 'src'
$buildDir = Join-Path $root 'build\Debug'

# 工程名：优先读 .eide/eide.yml 的 name（向导建工程时会写进真实的工程名），
# 读不到就退化成文件夹名。EIDE 的产物也是按这个名字命名的。
$prjName = Split-Path -Leaf $root
$eideYml = Join-Path $root '.eide\eide.yml'
if (Test-Path $eideYml) {
    $m = Select-String -Path $eideYml -Pattern '^name:\s*(\S+)' | Select-Object -First 1
    if ($m) { $prjName = $m.Matches[0].Groups[1].Value.Trim() }
}

$ihxPath  = Join-Path $buildDir "$prjName.ihx"
$hexPath  = Join-Path $buildDir "$prjName.hex"
$memPath  = Join-Path $buildDir "$prjName.mem"

function Write-Step { param([string]$Text) Write-Host "[build] $Text" -ForegroundColor Cyan }
function Write-Bad { param([string]$Text) Write-Host "[build] $Text" -ForegroundColor Red }

function Find-SdccRoot {
    param([string]$Hint)
    $cands = @()
    if ($Hint) { $cands += $Hint }
    if ($env:SDCC_ROOT) { $cands += $env:SDCC_ROOT }

    $cmd = Get-Command sdcc -ErrorAction SilentlyContinue
    if ($cmd) {
        # 形如 [SDCC安装目录]\bin\sdcc.exe，往上退两级得到安装目录
        $cands += (Split-Path -Parent (Split-Path -Parent $cmd.Source))
    }
    $cands += 'E:\vscode\tools\sdcc'
    $cands += 'C:\SDCC', 'D:\SDCC', 'E:\sdcc'

    foreach ($c in $cands) {
        if (-not $c) { continue }
        if (Test-Path (Join-Path $c 'bin\sdcc.exe')) { return (Resolve-Path $c).Path }
    }
    return $null
}

# ---------------------------------------------------------------- 找工具链
$sdccRoot = Find-SdccRoot -Hint $SdccRoot
if (-not $sdccRoot) {
    Write-Bad '找不到 SDCC。'
    Write-Bad '请设置环境变量 SDCC_ROOT，或用 -SdccRoot 指定安装目录，例如：'
    Write-Bad '    .\build.ps1 -SdccRoot "E:\vscode\tools\sdcc"'
    exit 1
}

$sdcc    = Join-Path $sdccRoot 'bin\sdcc.exe'
$packihx = Join-Path $sdccRoot 'bin\packihx.exe'
$incDir  = Join-Path $sdccRoot 'share\sdcc\include'
$libDir  = Join-Path $sdccRoot 'share\sdcc\lib\small'

Write-Step "SDCC: $sdccRoot"

if (-not (Test-Path $packihx)) {
    Write-Bad "编译器目录里没有 packihx.exe（$packihx），SDCC 安装可能不完整"
    exit 1
}

# ---------------------------------------------------------------- 准备目录
# 只删本脚本自己的产物；build\Debug 下 EIDE 的 .obj / ref.json 留着，
# 这样交替使用 F7 和本脚本时 EIDE 的增量编译不会失效。
if ($Clean) {
    Write-Step "清理 $prjName.ihx / .hex / .map / .mem"
    foreach ($f in @($ihxPath, $hexPath, $memPath, (Join-Path $buildDir "$prjName.map"))) {
        Remove-Item $f -Force -ErrorAction SilentlyContinue
    }
}
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null

$srcs = @()
if (Test-Path $srcDir) {
    $srcs = @(Get-ChildItem -Path $srcDir -Filter '*.c' -Recurse -File |
        Sort-Object FullName | ForEach-Object { $_.FullName })
}
if ($srcs.Count -eq 0) {
    Write-Bad 'src\ 下没有找到 .c 文件'
    exit 1
}

# ---------------------------------------------------------------- 编译参数
# 与 .eide/eide.yml 里的参数保持一致，两种编译方式产物相同
$flags = @(
    '-mmcs51',
    '--model-small',
    '--iram-size', '128',
    '--xram-size', '0',
    '--code-size', "$CodeSize"
)
# 注意：这里不手动传 -I/-L —— sdcc.exe 内部已写死头文件和库的搜索路径
# （4.x 官方 Windows 包里头文件在 share\sdcc\include，而 EIDE 只会加 [SDCC 安装根目录]\include）。
$flags += @('-o', "$prjName.ihx")

# ---------------------------------------------------------------- 编译
Write-Step "编译 $($srcs.Count) 个源文件 -> build\Debug\$prjName.ihx"

# 注意：SDCC 把警告写在 stderr 上，而 PS 5.1 在 EAP=Stop 时会把外部程序的
# stderr 当成致命错误。所以调外部程序前后要临时放宽 EAP，改用退出码判断。
$ErrorActionPreference = 'Continue'
Push-Location $buildDir
$sdccCode = 1
$packCode = 1
$hexLines = @()
try {
    & $sdcc @flags $srcs
    $sdccCode = $LASTEXITCODE

    if ($sdccCode -eq 0) {
        # packihx 的提示信息走 stderr，hex 正文走 stdout，所以只收 stdout
        $hexLines = @(& $packihx "$prjName.ihx" 2>$null)
        $packCode = $LASTEXITCODE
    }
} finally {
    Pop-Location
    $ErrorActionPreference = 'Stop'
}

if ($sdccCode -ne 0) {
    Write-Bad "编译失败（sdcc 退出码 $sdccCode）"
    exit $sdccCode
}

# ---------------------------------------------------------------- ihx -> hex
if ($packCode -ne 0 -or $hexLines.Count -eq 0) {
    Write-Bad "packihx 转换失败（退出码 $packCode）"
    exit 1
}
# 注意：PS 5.1 的 ">" 重定向默认写 UTF-16，这里必须显式指定 ASCII
Set-Content -Path $hexPath -Value $hexLines -Encoding ASCII

# ---------------------------------------------------------------- 容量报告
$used = 0
$max = $CodeSize
$memFile = $memPath
if (Test-Path $memFile) {
    Get-Content $memFile |
        Where-Object { $_ -match 'Stack starts|ROM/EPROM/FLASH|EXTERNAL RAM' } |
        ForEach-Object { Write-Host "        $_" }

    $romLine = Get-Content $memFile | Where-Object { $_ -match 'ROM/EPROM/FLASH' } | Select-Object -First 1
    if ($romLine) {
        $nums = @(($romLine -split '\s+') | Where-Object { $_ -match '^\d+$' })
        if ($nums.Count -ge 2) {
            $used = [int]$nums[0]
            $max = [int]$nums[1]
        }
    }
}

if ($max -gt 0) {
    $pct = [math]::Round(100.0 * $used / $max, 1)
    if ($used -gt $max) {
        Write-Bad "Flash 占用 $used / $max 字节（$pct%）—— 超出容量，换更大的型号或改 -CodeSize"
    } else {
        Write-Step "Flash 占用 $used / $max 字节（$pct%）"
    }
}

$hexSize = (Get-Item $hexPath).Length
Write-Step "OK -> build\Debug\$prjName.hex（$hexSize 字节）"

# ---------------------------------------------------------------- 下载
if ($Flash) {
    $avrdude = Get-Command avrdude -ErrorAction SilentlyContinue
    if (-not $avrdude) {
        Write-Bad '找不到 avrdude，无法用 USBasp 下载。'
        Write-Bad '装好 avrdude（并加进 PATH）后重试，或者手动执行：'
        Write-Bad "    avrdude -c $Programmer -p $Part -U flash:w:`"$hexPath`":i"
        exit 1
    }

    Write-Step "下载 build\Debug\$prjName.hex -> $Part（编程器 $Programmer）"
    $ErrorActionPreference = 'Continue'
    & $avrdude.Source -c $Programmer -p $Part -U "flash:w:${hexPath}:i"
    $avrCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'

    if ($avrCode -ne 0) {
        Write-Bad "下载失败（avrdude 退出码 $avrCode）：检查 USBasp 驱动、接线和芯片供电"
        exit $avrCode
    }
    Write-Step '下载完成'
}
