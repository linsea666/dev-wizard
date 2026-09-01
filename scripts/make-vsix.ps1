# 打包 dev-wizard.vsix —— 无需 npm/vsce，纯 PowerShell
# 用法: powershell -ExecutionPolicy Bypass -File scripts/make-vsix.ps1
#
# 可复现性约束（同版本、同源码 => 字节级一致）:
#   - 所有文本文件统一规范为 LF 行尾，不受调用方 core.autocrlf 影响；
#   - 生成的 XML 不含 BOM；
#   - 所有 zip 条目的修改时间固定为 1980-01-01，避免"每次打包字节都不同"；
#   - 打包到 .tmp 后再原子覆盖，构建失败不会留下半截 vsix。
# 注意: 所有路径都以仓库根解析，因此从任意目录调用都输出到仓库根。
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot          # 仓库根（scripts 的上一级）
$meta = Get-Content (Join-Path $root "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$ver  = $meta.version
$out  = Join-Path $root "dev-wizard-$ver.vsix"
$tmp  = Join-Path $env:TEMP ("devwizard-pack-" + [guid]::NewGuid().ToString("N"))
$tmpOut = $out + ".tmp"

# 固定时间戳：本地时区、未指定 Kind，避开 .NET ZipArchive 在 UTC 上的偏移 bug，
# 且每次构建写入同一常量，因此压缩后字节稳定。
$fixedTime = [datetime]::new(1980, 1, 1, 0, 0, 0)

# 写字符串为 UTF-8 无 BOM、LF 行尾（PS5.1 的 Out-File -Encoding utf8 会写 BOM，故用字节写入）
function Write-NormalizedText {
    param([string]$Path, [string]$Content)
    $lf = $Content -replace "`r`n", "`n" -replace "`r", "`n"
    [System.IO.File]::WriteAllBytes($Path, [System.Text.Encoding]::UTF8.GetBytes($lf))
}

# 把源文件规范为 UTF-8 无 BOM、LF 行尾后写入目标
function Copy-Normalized {
    param([string]$Src, [string]$Dst)
    $t = [System.IO.File]::ReadAllText($Src)
    $t = $t -replace "`r`n", "`n" -replace "`r", "`n"
    [System.IO.File]::WriteAllBytes($Dst, [System.Text.Encoding]::UTF8.GetBytes($t))
}

if (Test-Path $tmp)    { Remove-Item $tmp    -Recurse -Force }
if (Test-Path $tmpOut) { Remove-Item $tmpOut -Force }
New-Item -ItemType Directory -Path "$tmp/extension" | Out-Null

# 复制扩展文件，统一 LF / 无 BOM
foreach ($f in @("package.json", "extension.js", "README.md", "CHANGELOG.md", "LICENSE")) {
    Copy-Normalized (Join-Path $root $f) (Join-Path (Join-Path $tmp "extension") $f)
}

# [Content_Types].xml（无 BOM、LF）
Write-NormalizedText "$tmp/[Content_Types].xml" @'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>
'@

# extension.vsixmanifest（无 BOM、LF，版本号替换）
$manifest = @'
<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="dev-wizard" Version="__VER__" Publisher="sea"/>
    <DisplayName>dev-wizard</DisplayName>
    <Description xml:space="preserve">Startup wizard: continue last work or scaffold new projects from your own templates</Description>
    <Categories>Other</Categories>
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/>
  </Assets>
</PackageManifest>
'@.Replace("__VER__", $ver)
Write-NormalizedText "$tmp/extension.vsixmanifest" $manifest

# 打包前先把所有临时文件的修改时间固定为常量（CreateEntryFromFile 会沿用源文件时间）。
# 注意: 不能在 Create 模式下直接改条目的 LastWriteTime，只能从源文件带入。
$fixedFiles = @(
    (Join-Path $tmp "[Content_Types].xml"),
    (Join-Path $tmp "extension.vsixmanifest"),
    (Join-Path (Join-Path $tmp "extension") "package.json"),
    (Join-Path (Join-Path $tmp "extension") "extension.js"),
    (Join-Path (Join-Path $tmp "extension") "README.md"),
    (Join-Path (Join-Path $tmp "extension") "CHANGELOG.md"),
    (Join-Path (Join-Path $tmp "extension") "LICENSE")
)
foreach ($p in $fixedFiles) { [System.IO.File]::SetLastWriteTime($p, $fixedTime) }

# 打包（先写 .tmp，成功后再覆盖 $out）
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($tmpOut, [System.IO.Compression.ZipArchiveMode]::Create)
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $tmp "[Content_Types].xml"), "[Content_Types].xml") | Out-Null
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path $tmp "extension.vsixmanifest"), "extension.vsixmanifest") | Out-Null
foreach ($f in @("package.json", "extension.js", "README.md", "CHANGELOG.md", "LICENSE")) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, (Join-Path (Join-Path $tmp "extension") $f), "extension/$f") | Out-Null
}
$zip.Dispose()

if (Test-Path $out) { Remove-Item $out -Force }
Move-Item $tmpOut $out
Remove-Item $tmp -Recurse -Force
Write-Host "OK -> $((Resolve-Path $out).Path)"
