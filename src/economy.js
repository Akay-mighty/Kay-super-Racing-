// Kay Super Racing — economy: cash, garage ownership, stats, daily bonus (localStorage).
const K = { money: 'ksr.money', owned: 'ksr.owned', sel: 'ksr.sel', missions: 'ksr.missions', daily: 'ksr.daily', stats: 'ksr.stats' };
const read = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
const emit = () => { try { window.dispatchEvent(new Event('ksr-money')); } catch (e) { } };

export const economy = {
  money: 0, owned: [], sel: 'cruiser', stats: { earned: 0, races: 0, wins: 0 },

  init() {
    this.money = read(K.money, 5000);
    this.owned = read(K.owned, ['cruiser']);
    if (!this.owned.includes('cruiser')) this.owned.unshift('cruiser');
    this.sel = read(K.sel, 'cruiser');
    if (!this.owned.includes(this.sel)) this.sel = this.owned[0];
    this.stats = Object.assign({ earned: 0, races: 0, wins: 0 }, read(K.stats, {}));
    this.save();
  },
  save() { write(K.money, this.money); write(K.owned, this.owned); write(K.sel, this.sel); write(K.stats, this.stats); },

  add(n) { n = Math.round(n); if (!(n > 0)) return; this.money += n; this.stats.earned += n; this.save(); emit(); },
  spend(n) { n = Math.round(n); if (!(n > 0) || this.money < n) return false; this.money -= n; this.save(); emit(); return true; },

  has(id) { return this.owned.includes(id); },
  buy(id, price) {
    if (this.has(id)) { this.select(id); return true; }
    if (!this.spend(price)) return false;
    this.owned.push(id); this.save(); this.select(id); return true;
  },
  select(id) { this.sel = id; this.save(); emit(); },
  selected() { return this.sel; },
  ownedCount() { return this.owned.length; },

  getMissions() { return read(K.missions, {}); },
  setMissions(m) { write(K.missions, m); },

  getDaily() { return read(K.daily, null); },
  setDaily(d) { write(K.daily, d); },

  saveStats() { write(K.stats, this.stats); },

  /* admin tools (used by admin.html) */
  setMoney(n) { this.money = Math.max(0, Math.round(n)); this.save(); emit(); },
  unlockAll(ids) { this.owned = [...new Set([...this.owned, ...ids])]; this.save(); emit(); },
  resetAll() {
    this.money = 5000; this.owned = ['cruiser']; this.sel = 'cruiser';
    this.stats = { earned: 0, races: 0, wins: 0 };
    [K.money, K.owned, K.sel, K.missions, K.daily, K.stats].forEach(k => write(k, null));
    this.save(); emit();
  }
};
