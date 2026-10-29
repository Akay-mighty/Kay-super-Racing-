/* Kay Super Racing — DRIVERS: pick a racer with a signature perk.
   · two free drivers (KAY, AMINA), the rest are bought with race cash
   · the equipped driver's perk applies to YOUR car only (display + physics agree)
   · perks are passive — no buttons, no menus mid-race, just a different feel */

export const DRIVERS = [
  { id: 'kay',    name: 'KAY',     title: 'THE WHEELMAN', desc: '+8% TOP SPEED ON EVERY CAR',        price: 0,     perk: { top: 1.08 } },
  { id: 'amina',  name: 'AMINA',   title: 'MONEY MAGNET', desc: '+15% COINS & GEMS PAYOUT',          price: 0,     perk: { cash: 1.15 } },
  { id: 'tunde',  name: 'TUNDE',   title: 'BRAKMAN',      desc: '+12% GRIP · SHARPER STEERING',      price: 9000,  perk: { steer: 1.12 } },
  { id: 'zainab', name: 'ZAINAB',  title: 'NITRO QUEEN',  desc: 'NITRO REFILLS 30% FASTER · BURNS 25% SLOWER', price: 16000, perk: { niBurn: 0.75, niRef: 1.3 } },
  { id: 'emeka',  name: 'EMEKA',   title: 'THE TANK',     desc: 'ROCKETS & OIL SPIN YOU HALF AS LONG', price: 24000, perk: { spin: 0.5 } },
  { id: 'haja',   name: 'HAJA',    title: 'DRIFT LORD',   desc: '+20% DRIFT POINTS',                 price: 32000, perk: { drift: 1.2 } },
  { id: 'kingkay',name: 'KING KAY',title: 'THE DON',      desc: '+12% TOP SPEED · +10% CASH · THE FINAL BOSS', price: 50000, perk: { top: 1.12, cash: 1.10 } }
];

/* price → perk tier shown in the garage: the more cash a driver costs, the harder the perk hits */
export const drvTier = price => price <= 0 ? { lab: 'ROOKIE', cls: 't0' } : price <= 16000 ? { lab: 'PRO', cls: 't1' } : price <= 32000 ? { lab: 'ELITE', cls: 't2' } : { lab: 'LEGEND', cls: 't3' };

/* flat defaults so call sites can just do drv().top without undefined checks */
export const NO_PERK = {};
export const driverById = id => DRIVERS.find(d => d.id === id) || DRIVERS[0];
