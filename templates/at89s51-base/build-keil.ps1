<#
    AT89S51 独立构建脚本（Keil C51 版）—— 用本机安装的 Keil C51 编译，
    支持 Keil 语法（sfr / sbit / data / code / interrupt using / reg51.h）。

    用法（在本工程根目录）：
        .\build-keil.ps1                      编译，产物在 build\Debug\<工程名>.hex
        .\build-keil.ps1 -Clean               先删掉上次的产物再编译
        .\build-keil.ps1 -Flash               编译后用 USBasp + avrdude 下载
        .\build-keil.ps1 -KeilRoot E:\keilc51v957   手动指定 Keil 安装目录

    产物路径与 build.ps1（SDCC 版）/ EIDE（F7）一致：build\Debug\<工程名>.hex。
    注意：Keil 语法（sfr/sbit/...）SDCC 编不了；SDCC 语法（__sbit __at/...）
    Keil 也编不了。两种语法二选一，别混用。

    Keil 的查找顺序：-KeilRoot 参数 > 环境变量 KEIL_ROOT
                     > E:\keilc51v957 > C:\Keil_v5 > C:\Keil
#>
[CmdletBinding()]
param(
    [switch]$Clean,
    [switch]$Flash,
    [string]$Programmer = 'usbasp',
    [string]$Part = 'at89s51',
    [string]$KeilRoot = ''
)

$ErrorActionPreference = 'Stop'

$root     = $PSScriptRoot
$srcDir   = Join-Path $root 'src'
$buildDir = Join-Path $root 'build\Debug'

# 工程名：优先读 .eide/eide.yml 的 name（与 build.ps1 / EIDE 保持一致）
$prjName = Split-Path -Leaf $root
$eideYml = Join-Path $root '.eide\eide.yml'
if (Test-Path $eideYml) {
    $m = Select-String -Path $eideYml -Pattern '^name:\s*(\S+)' | Select-Object -First 1
    if ($m) { $prjName = $m.Matches[0].Groups[1].Value.Trim() }
}

$objDir  = $buildDir
$omfPath = Join-Path $buildDir "$prjName.omf"
$hexPath = Join-Path $buildDir "$prjName.hex"

function Write-Step { param([string]$Text) Write-Host "[keil-build] $Text" -ForegroundColor Cyan }
function Write-Bad { param([string]$Text) Write-Host "[keil-build] $Text" -ForegroundColor Red }

function Find-KeilRoot {
    param([string]$Hint)
    $cands = @()
    if ($Hint) { $cands += $Hint }
    if ($env:KEIL_ROOT) { $cands += $env:KEIL_ROOT }
    $cands += 'E:\keilc51v957', 'C:\Keil_v5', 'C:\Keil'
    foreach ($c in $cands) {
        if (-not $c) { continue }
        if (Test-Path (Join-Path $c 'C51\BIN\C51.exe')) { return (Resolve-Path $c).Path }
    }
    return $null
}

# ---------------------------------------------------------------- 找工具链
$keilRoot = Find-KeilRoot -Hint $KeilRoot
if (-not $keilRoot) {
    Write-Bad '找不到 Keil C51。'
    Write-Bad '请设置环境变量 KEIL_ROOT，或用 -KeilRoot 指定安装目录，例如：'
    Write-Bad '    .\build-keil.ps1 -KeilRoot "E:\keilc51v957"'
    exit 1
}

$keilBin = Join-Path $keilRoot 'C51\BIN'
$keilInc = Join-Path $keilRoot 'C51\INC'
$c51  = Join-Path $keilBin 'C51.exe'
$bl51 = Join-Path $keilBin 'BL51.exe'
$oh51 = Join-Path $keilBin 'OH51.exe'
Write-Step "Keil C51: $keilRoot"

# ---------------------------------------------------------------- 准备目录
# 只删本脚本自己的产物，不影响 F7（SDCC/EIDE）的增量编译
if ($Clean) {
    Write-Step "清理 $prjName.omf / .hex / .lst / .obj"
    Get-ChildItem -Path $buildDir -Filter '*.obj' -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
    foreach ($f in @($omfPath, $hexPath)) {
        Remove-Item $f -Force -ErrorAction SilentlyContinue
    }
    Get-ChildItem -Path $buildDir -Filter '*.lst' -ErrorAction SilentlyContinue |
        Remove-Item -Force -ErrorAction SilentlyContinue
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

# ---------------------------------------------------------------- 编译
# 注意：C51 出错时退出码仍是 0，必须解析输出里的 "N ERROR(S)" 判断成败。
Write-Step "编译 $($srcs.Count) 个源文件（C51，Keil 语法）"

$ErrorActionPreference = 'Continue'
$keilCode = 0
$objs = @()
foreach ($src in $srcs) {
    $base = [IO.Path]::GetFileNameWithoutExtension($src)
    $obj  = Join-Path $objDir "$base.obj"
    # INCDIR 多路径用分号分隔：工程 src 目录优先，Keil 自带头文件库（reg51.h 等）兜底
    $incArg = 'INCDIR(' + (($srcDir, $keilInc) -join ';') + ')'
    $out = & $c51 $src "OBJECT($obj)" $incArg 'SMALL' 'DEBUG' 'OBJECTEXTEND' 2>&1
    $code = $LASTEXITCODE
    # C51 的汇总行是 "N WARNING(S), N ERROR(S)"：只有 N>0 的 ERROR / FATAL 才算失败
    $errLines = @($out | Where-Object { $_ -match '[1-9]\d* ERROR|FATAL' })
    if ($code -ne 0 -or $errLines.Count -gt 0) {
        $out | Select-Object -Last 25 | Write-Host
        Write-Bad "编译失败：$src"
        $keilCode = 1
        break
    }
    $objs += $obj
}
$ErrorActionPreference = 'Stop'
if ($keilCode -ne 0) { exit 1 }

# ---------------------------------------------------------------- 链接
Write-Step "链接 -> build\Debug\$prjName.omf"
$ErrorActionPreference = 'Continue'
$linkArgs = @()
$linkArgs += (($objs | ForEach-Object { $_ -replace '\\', '/' }) -join ',')
$linkArgs += 'TO'
$linkArgs += ($omfPath -replace '\\', '/')
$linkOut = & $bl51 @linkArgs 2>&1
$ErrorActionPreference = 'Stop'
$linkErrs = @($linkOut | Where-Object { $_ -match '[1-9]\d* ERROR|FATAL' })
if ($linkErrs.Count -gt 0) {
    $linkOut | Select-Object -Last 25 | Write-Host
    Write-Bad "链接失败"
    exit 1
}
$linkOut | Where-Object { $_ -match 'Program Size' } | ForEach-Object { Write-Host "        $_" }

# ---------------------------------------------------------------- omf -> hex
$ErrorActionPreference = 'Continue'
$hexOut = & $oh51 ($omfPath -replace '\\', '/') 2>&1
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $hexPath)) {
    $hexOut | Select-Object -Last 10 | Write-Host
    Write-Bad 'hex 转换失败（OH51 没有生成 hex 文件）'
    exit 1
}

$hexSize = (Get-Item $hexPath).Length
Write-Step "OK -> build\Debug\$prjName.hex（$hexSize 字节）"

# ---------------------------------------------------------------- 下载
if ($Flash) {
    $avrdude = Get-Command avrdude -ErrorAction SilentlyContinue
    if (-not $avrdude) {
        Write-Bad '找不到 avrdude，无法用 USBasp 下载。'
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
