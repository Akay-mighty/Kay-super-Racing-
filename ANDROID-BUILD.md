# Android app + ads (no computer tools needed)

1. Push this to GitHub, open the repo > **Actions** > **Android APK** > **Run workflow**.
2. When it finishes (about 8 min), open the run and download **KaySuperRacing-debug-apk**. Unzip it, install `app-debug.apk` on your phone.
3. Test ads show automatically (`TESTING = true` in `src/ads-config.js`). Finish a race: the gold "WATCH AD · DOUBLE CASH" button appears when an ad is ready.

## Going live
- AdMob > App settings: make sure the app's package name is `com.akaymighty.ksr` (same as `capacitor.config.json`).
- Repo > Settings > Secrets and variables > Actions > new secret `ADMOB_APP_ID` = your real App ID (`ca-app-pub-...~...`).
- Put your real ad unit ids in `src/ads-config.js` and set `TESTING = false`.
- Google Play needs a **signed release (AAB)**, not this debug APK. When you are ready, ask Claude to add the signing step.
- Never tap your own real ads.
