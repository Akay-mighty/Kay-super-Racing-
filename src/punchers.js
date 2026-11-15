// Kay Super Racing — SUMO PUNCHERS: pure data + stat maths (no DOM, no three.js).
// One place defines every puncher, what it costs and how each upgrade level changes the fight.
// economy.js stores what you own / equip, sumo.js reads punchStats() every time you swing,
// main.js draws the garage cards from the same numbers — so the card, the HUD and the hit always agree.

export const MAX_LV = 5;

/* force   = launch speed in m/s given to the victim (the basic punch is 21 — what the game shipped with)
   lift    = vertical launch speed: how HIGH they fly (gravity is 30, so air time = 2 * lift / 30)
   cd      = seconds between swings        range = reach in metres       dmg = POWER bar damage
   kind    = which fist the sumo arena draws (spring coil, steel ram piston, big glove, rocket) */
export const PUNCHERS = [
  { id: 'basic',     name: 'BASIC PUNCH',    short: 'BASIC',     price: 0,      kind: 'spring', col: 0xff7a1a, css: '#ff9a2f', force: 21, lift: 5.0,  cd: 1.20, range: 8.4,  dmg: 14,
    desc: 'The starter spring fist. Reliable, light, free.' },
  { id: 'spring',    name: 'SPRING FIST',    short: 'SPRING',    price: 30000,  kind: 'spring', col: 0x35d16a, css: '#35d16a', force: 25, lift: 6.8,  cd: 1.10, range: 9.0,  dmg: 15,
    desc: 'A tighter coil: faster swing, bouncier launch.' },
  { id: 'ram',       name: 'HEAVY RAM',      short: 'RAM',       price: 75000,  kind: 'ram',    col: 0xb8c4d4, css: '#b8c4d4', force: 31, lift: 4.2,  cd: 1.55, range: 7.8,  dmg: 21,
    desc: 'A steel piston. Slow, brutal, shoves rivals flat across the deck.' },
  { id: 'gauntlet',  name: 'POWER GAUNTLET', short: 'GAUNTLET',  price: 150000, kind: 'glove',  col: 0xffd166, css: '#ffd166', force: 35, lift: 9.0,  cd: 1.35, range: 9.4,  dmg: 23,
    desc: 'A giant golden glove. Heavy hits that throw cars high.' },
  { id: 'rocket',    name: 'ROCKET PUNCH',   short: 'ROCKET',    price: 320000, kind: 'rocket', col: 0xff3b3b, css: '#ff5c5c', force: 42, lift: 12.0, cd: 1.70, range: 11.5, dmg: 27,
    desc: 'Rocket-propelled fist. Sends rivals clean out of the arena.' }
];

export const getPuncher = id => PUNCHERS.find(p => p.id === id) || PUNCHERS[0];

/* every level adds: +17% force, +14% lift, -4.5% cooldown, +10% damage, +0.25 m reach */
export function punchStats(id, lv) {
  const p = getPuncher(id), L = Math.max(1, Math.min(MAX_LV, lv | 0 || 1)) - 1;
  return {
    id: p.id, name: p.name, short: p.short, kind: p.kind, col: p.col, css: p.css, lv: L + 1,
    force: p.force * (1 + 0.17 * L),
    lift: p.lift * (1 + 0.14 * L),
    cd: p.cd * (1 - 0.045 * L),
    dmg: p.dmg * (1 + 0.10 * L),
    range: p.range + 0.25 * L,
    power: p.force * (1 + 0.17 * L) / 21 /* 1.0 = the basic punch at level 1 */
  };
}

/* 0..1 bars for the garage card (rocket level 5 is the full bar) */
export function punchBars(id, lv) {
  const s = punchStats(id, lv);
  return { power: Math.min(1, s.force / 72), launch: Math.min(1, s.lift / 19), speed: Math.min(1, (1.75 - s.cd) / 1.0) };
}

/* cash for level lv -> lv+1 (null at max). Cheap puncher = cheap upgrades. */
export function upgradeCost(id, lv) {
  if (lv < 1 || lv >= MAX_LV) return null;
  const base = Math.max(getPuncher(id).price, 15000) * 0.35;
  const k = [0.5, 0.9, 1.5, 2.3][lv - 1];
  return Math.round(base * k / 500) * 500;
}

/* the top two levels also need RESPECT (the same level that unlocks the sky arenas).
   returns the respect index needed to reach level lv+1 (0 = no gate). Shown to players as LV(index+1). */
export function upgradeGate(lv) { return lv + 1 === 4 ? 1 : lv + 1 === 5 ? 2 : 0; }
