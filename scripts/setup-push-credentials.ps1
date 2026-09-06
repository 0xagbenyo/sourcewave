# SOURCEWAVE - configure Android FCM + iOS APNs push credentials for EAS builds.
# Run from project root in a real terminal (interactive EAS prompts required):
#   powershell -ExecutionPolicy Bypass -File .\scripts\setup-push-credentials.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Package = "com.sourcewave.sourcewaveapp"
$BundleId = "com.sourcewave.sourcewaveapp"
$FirebaseDir = Join-Path $Root "credentials\firebase"
$GoogleServices = Join-Path $Root "google-services.json"

Write-Host ""
Write-Host "=== SOURCEWAVE push credentials setup ===" -ForegroundColor Cyan
Write-Host "Package (Android): $Package"
Write-Host "Bundle ID (iOS):   $BundleId"
Write-Host ""

if (-not (Test-Path $FirebaseDir)) {
  New-Item -ItemType Directory -Path $FirebaseDir | Out-Null
}

Write-Host "--- Step 1: Firebase (Android) ---" -ForegroundColor Yellow
Write-Host "1. Open https://console.firebase.google.com/ and create or open a project."
Write-Host "2. Add an Android app with package name: $Package"
Write-Host "3. Download google-services.json and save it here:"
Write-Host "   $GoogleServices"
Write-Host "4. In Firebase: Project settings - Service accounts - Generate new private key"
Write-Host "5. Save the JSON file under:"
Write-Host "   $FirebaseDir"
Write-Host "   (e.g. sourcewave-firebase-adminsdk-xxxxx.json)"

if (Test-Path $GoogleServices) {
  Write-Host "[OK] google-services.json found" -ForegroundColor Green
} else {
  Write-Host "[!!] google-services.json NOT found yet - add it before building Android" -ForegroundColor Red
}

$fcmFiles = @(Get-ChildItem -Path $FirebaseDir -Filter "*.json" -ErrorAction SilentlyContinue)
if ($fcmFiles.Count -gt 0) {
  Write-Host "[OK] FCM service account JSON found in credentials/firebase/" -ForegroundColor Green
} else {
  Write-Host "[!!] No FCM service account JSON in credentials/firebase/ yet" -ForegroundColor Red
}

Write-Host ""
Write-Host "--- Step 2: Apple Developer (iOS) ---" -ForegroundColor Yellow
Write-Host "1. Open https://developer.apple.com/account/resources/identifiers/list"
Write-Host "2. Select App ID $BundleId (or create it)."
Write-Host "3. Enable capability: Push Notifications"
Write-Host "4. Keys: create an APNs Auth Key (.p8) if you do not have one yet."
Write-Host "   (App Store Connect API key at credentials/apple/ may differ from APNs key.)"

Write-Host ""
Write-Host "--- Step 3: Upload to Expo (interactive) ---" -ForegroundColor Yellow
Write-Host "You will run EAS credentials twice. Choose production profile when asked."
Write-Host ""

$runAndroid = Read-Host "Configure Android FCM in EAS now? (y/n)"
if ($runAndroid -eq "y" -or $runAndroid -eq "Y") {
  Write-Host ""
  Write-Host "In the menu choose:" -ForegroundColor Cyan
  Write-Host '  production -> Google Service Account -> Push Notifications (FCM V1) -> Upload new key'
  Write-Host "  Point to your JSON in credentials/firebase/"
  Write-Host ""
  npx eas-cli credentials -p android
}

$runIos = Read-Host "Configure iOS APNs in EAS now? (y/n)"
if ($runIos -eq "y" -or $runIos -eq "Y") {
  Write-Host ""
  Write-Host "In the menu choose:" -ForegroundColor Cyan
  Write-Host '  production -> Push Notifications -> Set up / Upload APNs key'
  Write-Host "  Or let EAS generate a new Apple Push Notifications service key."
  Write-Host ""
  npx eas-cli credentials -p ios
}

Write-Host ""
Write-Host "--- Step 4: Build and install ---" -ForegroundColor Yellow
Write-Host "After credentials are saved on Expo:"
Write-Host ""
Write-Host "  npx eas-cli build --platform android --profile production"
Write-Host "  npx eas-cli build --platform ios --profile production"
Write-Host ""
Write-Host "Then install, log in, allow notifications, and send a test Raven message."
Write-Host "Verify on ERPNext: Raven Push Token (or Frappe relay) has your device token."

Write-Host ""
Write-Host "Dashboard alternative:" -ForegroundColor Cyan
Write-Host "https://expo.dev/accounts/agbenyo/projects/SourcewaveApp/credentials"
Write-Host ""
