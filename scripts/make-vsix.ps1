# 打包 dev-wizard.vsix —— 无需 npm/vsce，纯 PowerShell
# 用法: powershell -ExecutionPolicy Bypass -File scripts/make-vsix.ps1
# 注意: 所有路径都以仓库根解析，因此从任意目录调用都会输出到仓库根（不会误写到当前目录）
$ErrorActionPreference = "Stop"

$root  = Split-Path -Parent $PSScriptRoot          # 仓库根（scripts 的上一级）
$meta  = Get-Content (Join-Path $root "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$ver   = $meta.version
$out   = Join-Path $root "dev-wizard-$ver.vsix"
$tmp   = Join-Path $env:TEMP "devwizard-pack"

if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path "$tmp/extension" | Out-Null

Copy-Item (Join-Path $root "package.json"), (Join-Path $root "extension.js"), (Join-Path $root "README.md"), (Join-Path $root "CHANGELOG.md"), (Join-Path $root "LICENSE") "$tmp/extension/"

@'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>
'@ | Out-File -LiteralPath "$tmp/[Content_Types].xml" -Encoding utf8

@'
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
'@.Replace("__VER__", $ver) | Out-File -LiteralPath "$tmp/extension.vsixmanifest" -Encoding utf8

if (Test-Path $out) { Remove-Item $out -Force }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($out, [System.IO.Compression.ZipArchiveMode]::Create)
foreach ($f in @("[Content_Types].xml", "extension.vsixmanifest")) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$tmp/$f", $f) | Out-Null
}
foreach ($f in @("package.json", "extension.js", "README.md", "CHANGELOG.md", "LICENSE")) {
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, "$tmp/extension/$f", "extension/$f") | Out-Null
}
$zip.Dispose()

Remove-Item $tmp -Recurse -Force
Write-Host "OK -> $((Resolve-Path $out).Path)"
