/* AdMob wrapper. Works ONLY inside the Capacitor Android app; on the web every call is a safe no-op. */
import { ADS, TEST_IDS } from './ads-config.js';
const cap = typeof window !== 'undefined' ? window.Capacitor : null;
const native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
let why = 'not started', A = null, rewardedReady = false, interReady = false, raceN = 0, started = false, onReward = null;
const rid = () => (ADS.TESTING ? TEST_IDS.rewarded : ADS.rewardedId);
const iid = () => (ADS.TESTING ? TEST_IDS.interstitial : ADS.interstitialId);
const safe = fn => { try { const r = fn(); if (r && r.catch) r.catch(e => { why = 'error ' + (e && e.message || e); console.warn('KSR ads:', e && e.message || e); }); return r; } catch (e) { why = 'error ' + (e && e.message || e); console.warn('KSR ads:', e); } };
function prepRewarded() { rewardedReady = false; why = 'loading'; safe(() => A.prepareRewardVideoAd({ adId: rid(), isTesting: !!ADS.TESTING })); }
function prepInter() { interReady = false; if (ADS.interstitialEvery > 0) safe(() => A.prepareInterstitial({ adId: iid(), isTesting: !!ADS.TESTING })); }
export const ads = {
  native,
  async init() {
    if (!native || started) return; started = true;
    try {
      A = cap.registerPlugin('AdMob');
      await A.initialize({ initializeForTesting: !!ADS.TESTING });
      A.addListener('onRewardedVideoAdLoaded', () => { rewardedReady = true; why = 'ready'; });
      A.addListener('onRewardedVideoAdFailedToLoad', (e) => { rewardedReady = false; why = 'load failed ' + ((e && (e.message || e.code)) || '');  setTimeout(prepRewarded, 30000); });
      A.addListener('onRewardedVideoAdReward', () => { const f = onReward; onReward = null; if (f) f(); });
      A.addListener('onRewardedVideoAdDismissed', () => { prepRewarded(); });
      A.addListener('onInterstitialAdLoaded', () => { interReady = true; });
      A.addListener('onInterstitialAdFailedToLoad', () => { interReady = false; setTimeout(prepInter, 30000); });
      A.addListener('onInterstitialAdDismissed', () => { prepInter(); });
      why = 'loading'; prepRewarded(); prepInter();
    } catch (e) { console.warn('KSR ads init failed', e); why = 'init failed ' + ((e && e.message) || e); A = null; }
  },
  status() { return !native ? 'web' : why; },
  rewardedReady() { return !!(A && rewardedReady); },
  /* shows the rewarded video; calls done() ONLY if the player watched it to the end */
  showRewarded(done) { if (!A || !rewardedReady) return false; onReward = done; rewardedReady = false; safe(() => A.showRewardVideoAd()); return true; },
  /* call when the player leaves the results screen: shows a full-screen ad every N races */
  tickInterstitial() {
    if (!A || !(ADS.interstitialEvery > 0)) return;
    raceN++;
    if (raceN % ADS.interstitialEvery === 0 && interReady) { interReady = false; safe(() => A.showInterstitial()); }
  },
};
