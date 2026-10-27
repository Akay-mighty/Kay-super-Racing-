# KAY SUPER RACING 🏁✈️

A three.js arcade racing game built with Vite — city circuit, drift arena, tournament,
a full **economy** (earn cash → buy 8 increasingly expensive cars), **missions**,
**daily bonuses**, and **flying Tesla** supercars.

Play: **kay-super-racing.vercel.app**

## Features

### Game modes
- **Quick Race** — 1/3/5 laps vs 5 AI rivals (Easy/Normal/Hard), 4 times of day
- **Tournament** — 5-round championship with points
- **Drift Arena** — open lot, combo multipliers, cones, containers, beat the clock
- **Time Trial** — beat your best lap

### Economy & progression (new)
- **Cash** earned from race positions, drift scores, new best times and flight time
- **Car shop with 8 cars** — from the free Kay Cruiser to the $1,000,000 Ghost X Proto:

| Car | Price | Top speed | Special |
|-----|------:|----------:|---------|
| KAY CRUISER | free | 324 km/h | starter |
| MIDNIGHT CAB | $8,000 | 331 km/h | drift taxi |
| TITAN X | $18,000 | 342 km/h | heavy & stable |
| STREET BLAZE | $35,000 | 364 km/h | quick |
| NOVA GT | $65,000 | 389 km/h | fast + easy control |
| **TESLA SPARK** | $150,000 | 418 km/h | **FLIES** ✈ |
| HYPER PHANTOM | $400,000 | 446 km/h | fastest ground car |
| **GHOST X PROTO** | $1,000,000 | 475 km/h | **FLIES + fastest** |

- **9 missions** with cash rewards (podiums, drift scores, boost pads, flight time…)
- **Daily bonus** with streaks ($1,000 → $5,000/day)
- Progress saved in your browser (localStorage)

### Flying cars (Tesla Spark / Ghost X)
- Press **F** (or **Y** on gamepad / **FLY** touch button) above ~95 km/h to take off
- **W** throttle, hold **S** to descend, **A/D** to steer in the air
- Walls are ignored while airborne — cut over the city, but thrusters **burn nitro**
- Press **F** again to land. Flight time earns bonus cash and feeds the WINGS UP mission

### Extras
- Nitro (charged by drifting, overtaking, drafting behind rivals, and glowing **boost pads**)
- Drift scoring with combo multiplier in every race
- Minimap, skid marks, smoke, speed streaks, F1-style countdown lights, confetti
- WebAudio engine/skid/nitro/coin sounds (no assets needed)
- Gamepad support + full touch controls with FLY button on mobile

## Controls (keyboard)
`W/↑` gas · `S/↓` brake (hold in air = descend) · `A D / ← →` steer ·
`Shift` nitro · `Space` drift · `F` take off / land · `Esc/P` pause · `R` restart · `T` respawn · `M` mute

## Run locally
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

## Admin panel
Open **`/admin.html`** (e.g. `https://your-site.vercel.app/admin.html`) — default
password **`KAY2025`**. You can add/set cash, unlock all cars, or reset progress.
Change the password in the `ADMIN_PASSWORD` constant at the top of `admin.html`.
(This is a client-side game, so the panel is for your own convenience — don't ship
the password publicly if you care about leaderboards.)

## Tech
- three.js 0.170 (procedural lofted car bodies, city, track, arena — zero model assets)
- Vite 5 · deploys to Vercel as a static site (admin.html included automatically)
