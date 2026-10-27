// Kay Super Racing — missions: earn cash by completing challenges (retention loop).
import { economy } from './economy.js';

export const MISSIONS = [
  { id: 'finish',  name: 'FIRST RIDE',        desc: 'Finish any race',                    event: 'finish', target: 1,      reward: 2500 },
  { id: 'podium',  name: 'PODIUM FINISH',     desc: 'Finish a race in the top 3',         event: 'podium', target: 1,      reward: 6000 },
  { id: 'winner',  name: 'CHAMPION',          desc: 'Win any race',                       event: 'win',    target: 1,      reward: 12000 },
  { id: 'drift5',  name: 'DRIFT APPRENTICE',  desc: 'Score 5,000 drift pts in one race',  event: 'drift',  target: 5000,   reward: 8000 },
  { id: 'drift15', name: 'DRIFT MASTER',      desc: 'Score 15,000 drift pts in one race', event: 'drift',  target: 15000,  reward: 20000 },
  { id: 'pads8',   name: 'BOOST JUNKIE',      desc: 'Hit 8 boost pads in one race',       event: 'pads',   target: 8,      reward: 7000 },
  { id: 'fly60',   name: 'WINGS UP',          desc: 'Fly for 60 seconds (total)',         event: 'fly',    target: 60,     reward: 15000 },
  { id: 'garage4', name: 'GARAGE KING',       desc: 'Own 4 cars',                         event: 'own',    target: 4,      reward: 10000 },
  { id: 'rich',    name: 'TYCOON',            desc: 'Earn $250,000 in total',             event: 'earn',   target: 250000, reward: 25000 }
];

let prog = {}; // id -> { p, done }
const ACC = { fly: true, earn: true }; // event types that accumulate, others keep the max

export function missionsInit() {
  const saved = economy.getMissions() || {};
  prog = {};
  for (const m of MISSIONS) prog[m.id] = Object.assign({ p: 0, done: false }, saved[m.id] || {});
  missionsSave();
}
function missionsSave() { economy.setMissions(prog); }

/* returns array of missions completed by this event (for toasts) */
export function missionEvent(type, val = 1) {
  const done = [];
  for (const m of MISSIONS) {
    if (m.event !== type) continue;
    const s = prog[m.id]; if (!s || s.done) continue;
    s.p = ACC[type] ? s.p + val : Math.max(s.p, val);
    if (s.p >= m.target) { s.done = true; s.p = m.target; economy.add(m.reward); done.push(m); }
  }
  if (done.length) missionsSave();
  return done;
}

export function missionState() {
  return MISSIONS.map(m => ({ ...m, p: prog[m.id] ? prog[m.id].p : 0, done: prog[m.id] ? prog[m.id].done : false }));
}
export function missionsCompleted() { return MISSIONS.filter(m => prog[m.id] && prog[m.id].done).length; }
