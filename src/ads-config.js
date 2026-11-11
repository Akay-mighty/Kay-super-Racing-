/* AD SETTINGS — only used inside the real Android app (Capacitor). The website/PWA never shows ads.
   While TESTING is true the game uses Google's official TEST ads (safe — no ban risk).
   When the app is on Google Play and you are ready: paste your REAL ids below and set TESTING = false.
   NEVER tap your own real ads. */
export const ADS = {
  TESTING: true,
  rewardedId: 'ca-app-pub-2680005969220412/1869690173',     // your Rewarded ad unit id
  interstitialId: 'ca-app-pub-XXXXXXXXXXXXXXXX/ZZZZZZZZZZ', // your Interstitial ad unit id (optional)
  interstitialEvery: 3, // show one full-screen ad every N finished races (0 = never)
};
/* Google's public test ids */
export const TEST_IDS = { rewarded: 'ca-app-pub-3940256099942544/5224354917', interstitial: 'ca-app-pub-3940256099942544/1033173712' };
