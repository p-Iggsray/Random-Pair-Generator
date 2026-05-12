# Smash Pairing

[![Play Now](https://img.shields.io/badge/Play%20Now-Live%20Demo-e63946?style=for-the-badge)](https://p-iggsray.github.io/Smash-Pairing/)

A mobile-first random team generator for **Super Smash Bros** tournaments. Pair an experienced player with an inexperienced one so every team has a balanced skill floor, then ship the bracket straight to Challonge.

Drop a player list in, hit Generate, name your teams, export. No accounts. No login. Works offline once installed.

---

## How it works

1. **Home screen** — add players into two columns: **Experienced** and **Inexperienced**.
2. **Generate Teams** — shuffles each column and pairs them across categories. Every team is one experienced + one inexperienced player.
3. **Results screen** — see every team in a card view. Tap the dashed label above any team to give it a custom name.
4. **Export for Challonge** — opens a bottom sheet with one team per line, ready to paste into a Challonge bracket.

Need to add a late arrival? There's an add-player section right on the Results screen so you don't have to start over.

---

## Features

- **Skill-balanced random pairing** — never two experienced or two inexperienced players on the same team.
- **Custom team names** — tap to rename any team; the name flows through to the Challonge export.
- **Add players after generating** — late arrivals drop into an unpaired bucket and a "Pair Waiting" button forms the next team(s) on demand.
- **Reset Teams** without losing your players — wipes the pairings, keeps both lists intact.
- **Auto-saves locally** — your lists, teams, and team names survive force-quitting the app.
- **Installable as a Home Screen app** — proper PWA with a custom Smash-style icon, full-bleed display, and offline support.
- **Auto-updates** — built-in service worker fetches the latest version every launch, no manual cache clear.
- **Built for iPhone** — safe-area insets for the Dynamic Island and home indicator, no iOS auto-zoom on inputs, no horizontal scroll.

---

## Install on iPhone

1. Open **[smash-pairing.github.io](https://p-iggsray.github.io/Smash-Pairing/)** in Safari.
2. Tap the **Share** button.
3. Choose **Add to Home Screen**.
4. The icon will appear with the label **Smash Pairing**.

Open it from the Home Screen and it runs full-screen like a native app.

---

## Running locally

It's three static files (`index.html`, `app.js`, `styles.css`) plus a service worker, manifest, and icon. No build step.

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
