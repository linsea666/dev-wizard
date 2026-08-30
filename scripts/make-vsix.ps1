# 打包 dev-wizard.vsix —— 无需 npm/vsce，纯 PowerShell
# 用法: powershell -ExecutionPolicy Bypass -File scripts/make-vsix.ps1
$ErrorActionPreference = "Stop"

$meta  = Get-Content package.json -Raw | ConvertFrom-Json
$ver   = $meta.version
$out   = "dev-wizard-$ver.vsix"
$tmp   = Join-Path $env:TEMP "devwizard-pack"

if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
New-Item -ItemType Directory -Path "$tmp/extension" | Out-Null

Copy-Item package.json, extension.js, README.md, CHANGELOG.md, LICENSE "$tmp/extension/"

@'
<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="json" ContentType="application/json"/>
  <Default Extension="js" ContentType="application/javascript"/>
  <Default Extension="md" ContentType="text/markdown"/>
  <Default Extension="xml" ContentType="application/xml"/>
</Types>
'@ | Out-File "$tmp/[Content_Types].xml" -Encoding utf8

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
'@.Replace("__VER__", $ver) | Out-File "$tmp/extension.vsixmanifest" -Encoding utf8

if (Test-Path $out) { Remove-Item $out -Force }

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
