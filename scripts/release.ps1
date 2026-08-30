<#
.SYNOPSIS
  One command from a clean working tree to a signed Android artifact (and, once
  Play credentials exist, an uploaded release).

.DESCRIPTION
  Chains the steps that were previously done by hand:

    verify -> bump version -> commit -> push -> sync to C:\rfb -> prebuild ->
    Gradle bundle/assemble -> copy artifacts to the repo root -> upload to Play

  Why C:\rfb: building inside the repo path fails with "ninja: error: manifest
  'build.ninja' still dirty after 100 tries" because object paths in
  expo-modules-core / react-native-reanimated blow past CMake's 250-char limit on
  Windows. A junction does not help; Gradle canonicalizes it away. See AGENTS.md.

  Secrets never enter the repo. The upload keystore and the Play service-account
  key are read from -SigningProperties / -PlayCredentials, both of which default
  to %USERPROFILE%\.rozakos-release\.

.EXAMPLE
  .\scripts\release.ps1 -Version 1.9.0
  Build and push, no Play upload (the default).

.EXAMPLE
  .\scripts\release.ps1 -Version 1.9.0 -Track internal
  Same, then upload the .aab to the internal testing track.
#>
[CmdletBinding()]
param(
  # Marketing version, e.g. 1.9.0. versionCode is bumped automatically.
  [Parameter(Mandatory = $true)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Version,

  # Play track to publish to. 'none' stops after the artifacts are built.
  [ValidateSet('none', 'internal', 'alpha', 'beta', 'production')][string]$Track = 'none',

  [string]$SigningProperties = "$env:USERPROFILE\.rozakos-release\signing.properties",
  [string]$PlayCredentials = "$env:USERPROFILE\.rozakos-release\play-service-account.json",

  [string]$BuildDir = 'C:\rfb',

  # Skip the test/lint gate. For re-running a build you already verified.
  [switch]$SkipVerify,
  # Build and bump, but leave the commit unpushed.
  [switch]$NoPush,
  # Reuse the existing android/ instead of regenerating it. Only safe when
  # neither the version nor app.json changed since the last prebuild.
  [switch]$NoPrebuild
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$mobile = Join-Path $repo 'mobile'

function Step($message) { Write-Host "`n=== $message" -ForegroundColor Cyan }
function Fail($message) { Write-Host "`nFAILED: $message" -ForegroundColor Red; exit 1 }

# robocopy uses exit codes 0-7 for success; 8+ is a real failure.
function Invoke-Robocopy($source, $dest, $extra) {
  $rcArgs = @($source, $dest) + $extra
  & robocopy.exe @rcArgs | Out-Null
  if ($LASTEXITCODE -ge 8) { Fail "robocopy $source -> $dest returned $LASTEXITCODE" }
}

# ---------------------------------------------------------------- environment
Step 'Checking the build environment'

if ($env:JAVA_HOME -and -not (Test-Path $env:JAVA_HOME)) {
  # A stale JAVA_HOME is worse than an unset one: Gradle fails late with
  # "JAVA_HOME is set to an invalid directory" instead of falling back.
  Write-Host "JAVA_HOME points at a missing directory ($env:JAVA_HOME); re-detecting." -ForegroundColor Yellow
  $env:JAVA_HOME = $null
}
if (-not $env:JAVA_HOME) {
  # Whichever JDK this machine currently has. Both Adoptium 17 and Android
  # Studio's bundled JBR 21 build fine with AGP 8.x; which one is installed here
  # has flipped back and forth, so probe rather than hard-code.
  $jdks = @(Get-ChildItem 'C:\Program Files\Eclipse Adoptium' -Directory -Filter 'jdk-*' -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -ExpandProperty FullName)
  $jdks += 'C:\Program Files\Android\Android Studio\jbr'
  $found = $jdks | Where-Object { Test-Path (Join-Path $_ 'bin\java.exe') } | Select-Object -First 1
  if ($found) { $env:JAVA_HOME = $found; Write-Host "JAVA_HOME -> $found" }
  else { Fail 'JAVA_HOME is unset and no JDK was found (looked for Adoptium and the Android Studio JBR).' }
}
if (-not $env:ANDROID_HOME) {
  $sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (Test-Path $sdk) { $env:ANDROID_HOME = $sdk; Write-Host "ANDROID_HOME -> $sdk" }
  else { Fail 'ANDROID_HOME is unset and no SDK was found at %LOCALAPPDATA%\Android\Sdk.' }
}

Push-Location $repo
try {
  if ((git status --porcelain) -and -not $SkipVerify) {
    Fail 'Working tree is dirty. Commit or stash first, or pass -SkipVerify.'
  }

  # A second environment also pushes to origin/main, so never build on a stale base.
  Step 'Fetching origin'
  git fetch origin
  if ($LASTEXITCODE -ne 0) { Fail 'git fetch failed.' }
  $behind = git rev-list --count 'HEAD..origin/main'
  if ([int]$behind -gt 0) { Fail "Local main is $behind commit(s) behind origin/main. Pull first." }

  # -------------------------------------------------------------------- verify
  if (-not $SkipVerify) {
    Step 'Backend tests'
    Push-Location (Join-Path $repo 'backend')
    python -m pytest tests -q
    $backendOk = $LASTEXITCODE
    Pop-Location
    if ($backendOk -ne 0) { Fail 'Backend tests failed.' }

    Step 'Mobile typecheck and lint'
    Push-Location $mobile
    npx tsc --noEmit
    $tsc = $LASTEXITCODE
    if ($tsc -eq 0) { npx expo lint; $lint = $LASTEXITCODE } else { $lint = 1 }
    Pop-Location
    if ($tsc -ne 0) { Fail 'tsc --noEmit failed.' }
    if ($lint -ne 0) { Fail 'expo lint failed.' }
  }

  # ---------------------------------------------------------------- bump version
  Step "Setting version $Version"
  $appJsonPath = Join-Path $mobile 'app.json'
  $appJsonText = Get-Content $appJsonPath -Raw
  $previousCode = [int](Get-Content $appJsonPath -Raw | ConvertFrom-Json).expo.android.versionCode
  $newCode = $previousCode + 1

  # Edited as text, not round-tripped through ConvertTo-Json: PowerShell 5.1
  # reformats the whole document and escapes non-ASCII, which would bury the one
  # meaningful line in a full-file diff every release.
  $versionPattern = '(?m)^(\s*"version"\s*:\s*)"[^"]*"'
  $codePattern = '(?m)^(\s*"versionCode"\s*:\s*)\d+'
  foreach ($pair in @(@($versionPattern, 'version'), @($codePattern, 'versionCode'))) {
    if (([regex]::Matches($appJsonText, $pair[0])).Count -ne 1) {
      Fail "Expected exactly one '$($pair[1])' line in app.json. Bump it by hand and re-run with -SkipVerify."
    }
  }
  $appJsonText = [regex]::Replace($appJsonText, $versionPattern, "`${1}""$Version""")
  $appJsonText = [regex]::Replace($appJsonText, $codePattern, "`${1}$newCode")
  [IO.File]::WriteAllText($appJsonPath, $appJsonText)
  Write-Host "version $Version, versionCode $previousCode -> $newCode"

  Step 'Committing the version bump'
  git add mobile/app.json
  git commit -m "Release v$Version (versionCode $newCode)"
  if ($LASTEXITCODE -ne 0) { Fail 'git commit failed.' }
  git tag -a "v$Version" -m "v$Version"

  if (-not $NoPush) {
    Step 'Pushing'
    git push origin main
    if ($LASTEXITCODE -ne 0) { Fail 'git push failed.' }
    git push origin "v$Version"
    if ($LASTEXITCODE -ne 0) { Fail 'pushing the tag failed.' }
  }

  # ------------------------------------------------------------------ sync copy
  Step "Syncing to $BuildDir"
  if (-not (Test-Path $BuildDir)) {
    Fail "$BuildDir does not exist. Create it with a full copy of mobile/ plus 'npm ci' (see AGENTS.md)."
  }
  $mirror = @('/MIR', '/NFL', '/NDL', '/NJH', '/NJS')
  Invoke-Robocopy (Join-Path $mobile 'src') (Join-Path $BuildDir 'src') $mirror
  Invoke-Robocopy (Join-Path $mobile 'plugins') (Join-Path $BuildDir 'plugins') $mirror
  Invoke-Robocopy (Join-Path $mobile 'assets') (Join-Path $BuildDir 'assets') $mirror
  Copy-Item $appJsonPath (Join-Path $BuildDir 'app.json') -Force
  Copy-Item (Join-Path $mobile 'package.json') (Join-Path $BuildDir 'package.json') -Force

  # ------------------------------------------------------------------- prebuild
  # version, versionCode and the signing config are all baked into
  # android/app/build.gradle at prebuild time, so a version bump means a regen.
  $buildGradle = Join-Path $BuildDir 'android\app\build.gradle'
  $needsPrebuild = -not $NoPrebuild
  if ($NoPrebuild -and (Test-Path $buildGradle)) {
    if (-not (Select-String -Path $buildGradle -Pattern 'ROZAKOS_UPLOAD_STORE_FILE' -Quiet)) {
      Write-Host 'Signing config missing from the generated Gradle file; prebuilding anyway.'
      $needsPrebuild = $true
    }
  }
  if ($needsPrebuild) {
    Step 'Prebuilding android/ (the slow one, ~10 min from clean)'
    Push-Location $BuildDir
    npx expo prebuild --platform android --no-install --clean
    $pre = $LASTEXITCODE
    Pop-Location
    if ($pre -ne 0) { Fail 'expo prebuild failed.' }
  }

  if (-not (Select-String -Path $buildGradle -Pattern 'ROZAKOS_UPLOAD_STORE_FILE' -Quiet)) {
    Fail 'The signing plugin did not apply. Check mobile/plugins/with-upload-signing.js against the Expo build.gradle template.'
  }

  # -------------------------------------------------------------------- signing
  $gradleArgs = @('--no-daemon')
  $signed = $false
  if (Test-Path $SigningProperties) {
    Step "Reading the upload key from $SigningProperties"
    # storeFile / storePassword / keyAlias / keyPassword, one key=value per line
    $props = @{}
    foreach ($line in Get-Content $SigningProperties) {
      if ($line -match '^\s*([A-Za-z]+)\s*=\s*(.+?)\s*$') { $props[$Matches[1]] = $Matches[2] }
    }
    foreach ($required in @('storeFile', 'storePassword', 'keyAlias', 'keyPassword')) {
      if (-not $props.ContainsKey($required)) { Fail "$SigningProperties is missing '$required'." }
    }
    if (-not (Test-Path $props['storeFile'])) { Fail "Keystore not found at $($props['storeFile'])." }
    $gradleArgs += "-PROZAKOS_UPLOAD_STORE_FILE=$($props['storeFile'])"
    $gradleArgs += "-PROZAKOS_UPLOAD_STORE_PASSWORD=$($props['storePassword'])"
    $gradleArgs += "-PROZAKOS_UPLOAD_KEY_ALIAS=$($props['keyAlias'])"
    $gradleArgs += "-PROZAKOS_UPLOAD_KEY_PASSWORD=$($props['keyPassword'])"
    $signed = $true
  }
  else {
    Write-Host "`nNo signing properties at $SigningProperties." -ForegroundColor Yellow
    Write-Host 'Falling back to DEBUG signing: fine for sideloading, rejected by Play.' -ForegroundColor Yellow
    if ($Track -ne 'none') { Fail "-Track $Track needs a real upload key. See docs/release.md." }
  }

  # ---------------------------------------------------------------------- build
  # Invoke by full path: a bare gradlew.bat is not found even with the working
  # directory set.
  $gradlew = Join-Path $BuildDir 'android\gradlew.bat'
  Push-Location (Join-Path $BuildDir 'android')
  try {
    Step 'Gradle bundleRelease (.aab, the Play artifact)'
    & cmd /c $gradlew bundleRelease @gradleArgs
    if ($LASTEXITCODE -ne 0) { Fail 'bundleRelease failed.' }

    Step 'Gradle assembleRelease (.apk, the sideload artifact)'
    & cmd /c $gradlew assembleRelease @gradleArgs
    if ($LASTEXITCODE -ne 0) { Fail 'assembleRelease failed.' }
  }
  finally { Pop-Location }

  $aab = Join-Path $BuildDir 'android\app\build\outputs\bundle\release\app-release.aab'
  $apk = Join-Path $BuildDir 'android\app\build\outputs\apk\release\app-release.apk'
  foreach ($artifact in @($aab, $apk)) {
    if (-not (Test-Path $artifact)) { Fail "Expected artifact missing: $artifact" }
  }

  # Release artifacts are gitignored at the repo root, same as previous versions.
  $localAab = Join-Path $repo "rozakos-fitness-v$Version.aab"
  $localApk = Join-Path $repo "rozakos-fitness-v$Version.apk"
  Copy-Item $aab $localAab -Force
  Copy-Item $apk $localApk -Force
  Step 'Artifacts'
  Write-Host "  $localAab"
  Write-Host "  $localApk"
  if (-not $signed) { Write-Host '  (debug-signed)' -ForegroundColor Yellow }

  # --------------------------------------------------------------------- upload
  if ($Track -eq 'none') {
    Write-Host "`nDone. No -Track given, so nothing was uploaded." -ForegroundColor Green
    Write-Host "Sideload with: adb install -r ""$localApk"""
    exit 0
  }

  if (-not (Test-Path $PlayCredentials)) {
    Fail "No Play service-account key at $PlayCredentials. See docs/release.md."
  }

  Step "Uploading to the '$Track' track"
  Push-Location (Join-Path $repo 'tools\play-upload')
  try {
    if (-not (Test-Path 'node_modules')) {
      Write-Host 'Installing the uploader dependencies (first run only)'
      npm install --silent
      if ($LASTEXITCODE -ne 0) { Fail 'npm install failed in tools/play-upload.' }
    }
    node upload.js --aab $localAab --track $Track --credentials $PlayCredentials --package com.rozakos.fitness
    if ($LASTEXITCODE -ne 0) { Fail 'Play upload failed.' }
  }
  finally { Pop-Location }

  Write-Host "`nReleased v$Version (versionCode $newCode) to '$Track'." -ForegroundColor Green
}
finally { Pop-Location }
