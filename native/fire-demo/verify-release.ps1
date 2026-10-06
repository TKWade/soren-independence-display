param(
 [Parameter(Mandatory=$true)][string]$Apk,
 [Parameter(Mandatory=$true)][string]$SdkDirectory,
 [switch]$Unsigned
)
$ErrorActionPreference = 'Stop'
$Apk = (Resolve-Path -LiteralPath $Apk).Path
$tools = Join-Path $SdkDirectory 'build-tools/35.0.0'
if (-not $Unsigned) {
 $signature = & "$tools/apksigner.bat" verify --verbose --print-certs $Apk
 if ($LASTEXITCODE -ne 0) { throw 'APK signature verification failed' }
 if (($signature -join '') -match 'CN=Android Debug') { throw 'Debug signing identity rejected' }
 Write-Output $signature
}
& "$tools/zipalign.exe" -c -P 16 4 $Apk
if ($LASTEXITCODE -ne 0) { throw 'APK alignment verification failed' }
$badging = (& "$tools/aapt.exe" dump badging $Apk) -join "`n"
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect APK' }
foreach ($expected in @("package: name='com.soren.display.demo' versionCode='2' versionName='1.0'", "application-label:'SOREN Demo'", "sdkVersion:'24'", "targetSdkVersion:'36'")) {
 if (-not $badging.Contains($expected)) { throw "Unexpected APK metadata: $expected" }
}
if ($badging.Contains('application-debuggable')) { throw 'Debuggable APK rejected' }
$permissions = @($badging.Split("`n") | Where-Object { $_ -match '^uses-permission' })
if ($permissions.Count -ne 1 -or $permissions[0] -notmatch "^uses-permission: name='com.soren.display.demo.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION'$") {
 throw 'Unexpected APK permissions'
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($Apk)
try {
 $www = Join-Path $PSScriptRoot 'www'
 $expectedAssets = @('assets/dexopt/baseline.prof','assets/dexopt/baseline.profm','assets/capacitor.config.json','assets/capacitor.plugins.json','assets/native-bridge.js','assets/public/cordova.js','assets/public/cordova_plugins.js')
 foreach ($file in Get-ChildItem -LiteralPath $www -File -Recurse) {
  $relative = [IO.Path]::GetRelativePath($www, $file.FullName).Replace('\','/')
  $name = 'assets/public/' + $relative
  $expectedAssets += $name
  $entry = $archive.GetEntry($name)
  if ($null -eq $entry) { throw 'Missing demo asset' }
  $stream = $entry.Open()
  try {
   $sha = [Security.Cryptography.SHA256]::Create()
   try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') } finally { $sha.Dispose() }
  } finally { $stream.Dispose() }
  if ($actual -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) { throw 'APK asset differs from demo build' }
 }
 foreach ($entry in $archive.Entries) {
  if ($entry.FullName -match '(?i)(^|/)\.env|\.(jks|keystore|p12|pfx)$') { throw 'Private file in APK' }
  if ($entry.FullName.StartsWith('assets/') -and -not $entry.FullName.EndsWith('/')) {
   if ($entry.FullName -notin $expectedAssets) { throw 'Unexpected APK asset' }
   if ($entry.FullName -match '\.(js|json|html|css)$') {
    $reader = [IO.StreamReader]::new($entry.Open())
    try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
    if ($content -match 'GOCSPX-|sb_secret_|BEGIN (RSA |EC )?PRIVATE KEY|https://[^\s"'']+\.supabase\.co|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}') { throw 'Credential pattern detected; value withheld' }
    if ($entry.FullName -eq 'assets/capacitor.plugins.json' -and $content.Trim() -ne '[]') { throw 'Unexpected native plugins' }
   }
  }
 }
} finally { $archive.Dispose() }
Get-FileHash -LiteralPath $Apk -Algorithm SHA256
if ($Unsigned) { Write-Output 'Unsigned release checks passed. NOT ready for LAT; signing and signed verification remain.' }
else { Write-Output 'Signed release package checks passed. No upload or installation performed.' }

