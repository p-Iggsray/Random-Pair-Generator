# Smash Pairing

[![Play Now](https://img.shields.io/badge/Play%20Now-Live%20Demo-e63946?style=for-the-badge)](https://p-iggsray.github.io/Smash-Pairing/)

A mobile-first random team generator for **Super Smash Bros** tournaments. Pair players into balanced 2v2 teams, name the teams, ship the bracket straight to Challonge.

Drop a player list in, hit Generate, name your teams, export. No accounts. No login. Works offline once installed.

---

## How it works

1. **Home screen** — add players into two columns: **Experienced** and **Inexperienced**.
2. **Generate Teams** — shuffles both columns and pairs them according to the active mode (see below).
3. **Results screen** — see every team in a card view. Tap the dashed label above any team to give it a custom name. Tap a player to swap them with another player on the roster.
4. **Export for Challonge** — opens a bottom sheet with one team per line, ready to paste into a Challonge bracket.

Need to add a late arrival? An add-player section sits right on the Results screen so you don't have to start over — newcomers drop into an unpaired bucket and a **Pair Waiting** button forms the next team(s) on demand.

### Modes

Pick a mode from the hamburger menu (top-right on the home screen):

- **Full 2v2** — every team is one experienced + one inexperienced player. Mixes skill levels for a balanced floor. Default.
- **Split 2v2** — same-skill teams: experienced + experienced, inexperienced + inexperienced. Useful when you want a clear skill tier in the bracket.

### Set Teams

Some pairs always play together. The **Set Teams** panel on the home screen locks named pairs that bypass the random shuffle — they appear on Results with the same team-card layout as the random pairs, just without the swap behavior.

---

## Features

### Core

- **Skill-balanced random pairing** — never two experienced or two inexperienced players on the same team (in Full 2v2 mode).
- **Split 2v2 mode** — alternative same-skill pairing for tiered brackets.
- **Set Teams** — lock specific pairs that always play together; they skip the shuffle.
- **Add players after generating** — late arrivals drop into an unpaired bucket; **Pair Waiting** forms new teams without redoing existing pairings.
- **Player swap** — tap two players on the Results screen to swap them between teams.
- **Custom team names** — tap to rename any team; the name flows through to the Challonge export.
- **Presets** — save and reload named rosters so recurring tournaments don't need re-entry.
- **Reset Teams** (two-tap confirm) — wipes the pairings, keeps both player lists intact.
- **Auto-saves locally** — your lists, teams, and team names survive force-quitting the app.

### Polish

- **Splash screen** — 2-second branded boot beat with a custom Smash-style icon.
- **Confetti on Generate** — celebratory burst when teams are formed (respects `prefers-reduced-motion`).
- **Pulse animations** — the Generate button breathes when ready, team-name underlines pulse when editable, and the swap-selected player breathes to mark the active pick.
- **Per-category accent glow** — Experienced and Inexperienced panels carry their own accent color through buttons, chips, and member dots.
- **Stencil team numbers** — large slanted team numerals on each Results card for at-a-glance reading.
- **Inline name editing** — tap a player or team name to rename it in place.

### Mobile-first

- **Installable as a Home Screen app** — proper PWA with a custom icon, full-bleed display, and offline support.
- **Auto-updates** — built-in service worker fetches the latest version every launch, no manual cache clear.
- **Built for iPhone** — safe-area insets for the Dynamic Island and home indicator, no iOS auto-zoom on inputs, no horizontal scroll.
- **Persistent state** — `localStorage`-backed so your roster survives reloads, app switching, and force-quits.

---

## Install on iPhone

1. Open **[smash-pairing.github.io](https://p-iggsray.github.io/Smash-Pairing/)** in Safari.
2. Tap the **Share** button.
3. Choose **Add to Home Screen**.
4. The icon will appear with the label **Smash Pairing**.

Open it from the Home Screen and it runs full-screen like a native app.

---

## Running locally

It's a handful of static files. `index.html`, `service-worker.js`, and `manifest.webmanifest` live at the root; everything else (JS, CSS, SVG) is in `assets/`. No build step.

```bash
# any static server works
python3 -m http.server 8000
# or
npx serve .
```

Then open `http://localhost:8000`.

---

## Tech

Plain HTML, CSS, and JavaScript. No frameworks, no bundler, no dependencies. State is persisted with `localStorage`. The service worker uses a network-first strategy so deploys reach installed PWAs within seconds.

Hosted on **GitHub Pages**.
