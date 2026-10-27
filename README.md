# KAY SUPER RACING 🏁✈️☁

A three.js arcade racing game built with Vite — city circuit, drift arena, tournament,
a full **economy** (earn cash → buy 8 increasingly expensive cars), **missions**,
**daily bonuses**, **flying Tesla supercars**, and now a **Firebase backend**:
cloud saves, a **global leaderboard**, **ghost-rival races**, and a **Firebase-secured
admin panel**.

## Features

### Game modes
- **Quick Race** — 1/3/5 laps vs 5 AI rivals (Easy/Normal/Hard), 4 times of day
- **Tournament** — 5-round championship with points
- **Drift Arena** — open lot, combo multipliers, cones, containers, beat the clock
- **Time Trial** — beat your best time (your best run replays as a **ghost car**)

### ☁ Online (new in V3 — powered by Firebase)
- **Cloud profile** — set a **Driver Name** in Settings and your cash, cars, missions
  and daily streak sync to Firestore. Play on another device, enter the same name,
  and your progress merges automatically (best of both devices — you can never lose cash).
- **Global leaderboards** — every new best time / arena score is submitted to a world
  board (RACE 3L · TT 3L · TT 1L · ARENA 90S). Top 20 kept per board.
- **Ghost rivals** — your best runs are uploaded as ghosts. Open **ONLINE RIVALS**,
  hit *RACE THE #1 GHOST*, and the #1 player's run downloads and races you as a
  translucent hologram car with their name tag. Beat it to take the crown.
- **Graceful offline mode** — if Firebase is unreachable the game plays 100% from
  localStorage and the badge shows CLOUD OFFLINE. Nothing ever breaks.
- **Admin grants** — the owner can add cash to any player's cloud profile from the
  admin panel; players receive it on next launch (or by clicking the cash badge to sync).

### Economy & progression
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

### Flying cars (Tesla Spark / Ghost X)
- Press **F** (or **Y** on gamepad / **FLY** touch button) above ~95 km/h to take off
- **W** throttle, hold **S** to descend, **A/D** to steer in the air
- Walls are ignored while airborne — cut over the city, but thrusters **burn nitro**
- Press **F** again to land. Flight time earns bonus cash and feeds the WINGS UP mission

### Extras
- Nitro (charged by drifting, overtaking, drafting behind rivals, and glowing **boost pads**)
- Drift scoring with combo multiplier in every race
- Minimap (with ghost dot), skid marks, smoke, speed streaks, F1-style countdown lights, confetti
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

## ☁ Firebase setup (one time)
The Firebase project **kay-super-racing** is configured in `src/cloud.js` and `public/admin.html`.

1. **Authentication → Sign-in method**: enable **Email/Password** (players + owner) and
   **Google** (one-click sign-in for players). Anonymous is no longer used by the game.
2. **Authentication → Users → Add user**: create the owner account yourself
   (`admin@kayracing.com` + a long, unique password). The admin page never creates accounts.
3. Copy that user's **User UID**. Paste it in two places:
   `ADMIN_UID` in `public/admin.html` and `PASTE_OWNER_UID_HERE` in `firestore.rules`.
4. **Firestore Database → Rules**: paste the contents of `firestore.rules` and **Publish**
   (test it first in the *Rules Playground*). Do not leave the database in test mode.
5. **Authentication → Settings → Authorized domains**: make sure your production domain
   (e.g. `y-super-racing.vercel.app`) is listed, or Google sign-in will refuse it.
6. Redeploy. The HUD badge shows **CLOUD ONLINE** when connected.

## 👤 Player accounts (V5)
On first launch the game plays the animated **KSR logo splash**, then asks the player to
**Sign in / Create account (email + password) / Continue with Google**. Progress (cash, cars,
missions) syncs to the signed-in player's driver name, so switching devices keeps everything.
A *Skip · play offline* link keeps the game fully playable without an account (local save only).
Players can switch identity in **Settings → Sign out**. Driver name still defaults from the
email prefix once, and can be changed in Settings.

> This is a client-side game, so Firestore rules are the real security boundary. Rules stop outsiders from
> touching the grants log or admin-only actions and reject absurd values, but they cannot prove a score or
> cash amount is honest. Player profiles are keyed by driver name (that is what makes cross-device sync work),
> so a determined player can still edit another driver's profile. Fixing that needs real accounts or a server.

## Admin panel
Not linked from the game. Open **`/admin.html`** directly and sign in with the owner account.
To remove it from the public site entirely, delete `public/admin.html`.
Load a player by driver name, add/set cash, unlock all cars or reset them. Every grant is logged to `grants`.

## Tech
- three.js 0.170 (procedural lofted car bodies, city, track, arena — zero model assets)
- Firebase 11 (Auth + Firestore, lazy-loaded code-split chunk)
- Vite 5 · deploys to Vercel as a static site (admin.html included automatically)
- Data model: `players/{NAME}` profiles · `boards/{cat}` top-20 entries ·
  `ghosts/{id}` replay samples · `grants/{id}` admin audit log
