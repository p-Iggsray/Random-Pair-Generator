// Capture the splash boot time as early as possible so we can honor a
// minimum visible duration regardless of how fast state loads.
const splashStartTime = Date.now();
const SPLASH_MIN_MS   = 4000; // ~4s "boot screen" feel
const SPLASH_FADE_MS  = 500;

// True when the inline head script tagged this load as a repeat-in-session
// (e.g. a service-worker controllerchange reload). The splash is already
// hidden by CSS in that case so we only need to remove the stale element.
const splashSkipped = document.documentElement.classList.contains('splash-skip');

function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  if (splashSkipped) { splash.remove(); return; }
  splash.classList.add('hidden');
  // Remove from the DOM once the fade has finished so it stops capturing
  // taps and stops painting a full-bleed layer behind the app.
  setTimeout(() => splash.remove(), SPLASH_FADE_MS + 100);
}

// Register a network-first service worker so the home-screen PWA
// picks up new deploys automatically instead of running cached files.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('./service-worker.js').then(reg => {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch(() => {});

  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloaded) return;
    reloaded = true;
    location.reload();
  });
}

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

const state = {
  exp:        [],
  inexp:      [],
  fixedPairs: [],     // [{ id, aName, bName, name? }] — set teams entered by hand
  pairs:      [],     // [{ aId, bId, kind: 'mixed'|'exp'|'inexp', name? }]
  hasPaired:  false,
  mode:       'full', // 'full' = exp+inexp pairs; 'split' = exp+exp and inexp+inexp pairs
  uid:        0
};

// ---- persistence ----

const STORAGE_KEY = 'tp_v2';
const PRESETS_KEY = 'tp_presets';

let presets = [];

// In-progress swap selection on the Results screen. Null when no player is selected.
// Shape: { type: 'exp'|'inexp', pairIdx: number, playerId: number }
let swapSelection = null;

async function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    flashDot();
  } catch(e) {}
}

async function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch(e) {}
  if (!Array.isArray(state.fixedPairs)) state.fixedPairs = [];
  if (state.mode !== 'split') state.mode = 'full';
  // Migrate legacy random pairs ({ expId, inexpId } -> { aId, bId, kind: 'mixed' }).
  if (Array.isArray(state.pairs)) {
    state.pairs = state.pairs.map(p => {
      if (p && p.kind) return p;
      if (p && p.expId !== undefined && p.inexpId !== undefined) {
        return { aId: p.expId, bId: p.inexpId, kind: 'mixed', name: p.name };
      }
      return p;
    });
  }
}

function savePresets() {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    flashDot();
  } catch(e) {}
}

function loadPresetsFromStorage() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) presets = JSON.parse(raw);
  } catch(e) {}
}

function flashDot() {
  const dot = document.getElementById('save-dot');
  dot.classList.add('flash');
  clearTimeout(dot._t);
  dot._t = setTimeout(() => dot.classList.remove('flash'), 900);
}

// ---- helpers ----

function nextId()   { return state.uid++; }

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function unpairedExp() {
  const used = new Set();
  state.pairs.forEach(p => {
    if (p.kind === 'mixed') used.add(p.aId);          // aId is the exp slot in mixed pairs
    else if (p.kind === 'exp') { used.add(p.aId); used.add(p.bId); }
  });
  return state.exp.filter(p => !used.has(p.id));
}

function unpairedInexp() {
  const used = new Set();
  state.pairs.forEach(p => {
    if (p.kind === 'mixed') used.add(p.bId);          // bId is the inexp slot in mixed pairs
    else if (p.kind === 'inexp') { used.add(p.aId); used.add(p.bId); }
  });
  return state.inexp.filter(p => !used.has(p.id));
}

// ---- actions ----

function addPlayer(type, inputId) {
  const input = document.getElementById(inputId || (type + '-input'));
  const name  = input.value.trim();
  if (!name) return;
  state[type].push({ id: nextId(), name });
  input.value = '';
  input.focus();
  saveState();
  render();
}

function pairUnpaired() {
  if (!state.hasPaired) return;
  let added = 0;

  if (state.mode === 'split') {
    const sExp = shuffle(unpairedExp());
    for (let i = 0; i + 1 < sExp.length; i += 2) {
      state.pairs.push({ aId: sExp[i].id, bId: sExp[i + 1].id, kind: 'exp' });
      added++;
    }
    const sInexp = shuffle(unpairedInexp());
    for (let i = 0; i + 1 < sInexp.length; i += 2) {
      state.pairs.push({ aId: sInexp[i].id, bId: sInexp[i + 1].id, kind: 'inexp' });
      added++;
    }
  } else {
    const sExp   = shuffle(unpairedExp());
    const sInexp = shuffle(unpairedInexp());
    const count  = Math.min(sExp.length, sInexp.length);
    for (let i = 0; i < count; i++) {
      state.pairs.push({ aId: sExp[i].id, bId: sInexp[i].id, kind: 'mixed' });
      added++;
    }
  }

  if (!added) return;
  swapSelection = null;
  saveState();
  render();
}

function removePlayer(type, id) {
  state[type] = state[type].filter(p => p.id !== id);
  saveState();
  render();
}

function addFixedPair() {
  const aInput = document.getElementById('fp-a');
  const bInput = document.getElementById('fp-b');
  const a = aInput.value.trim();
  const b = bInput.value.trim();
  if (!a && !b) return;
  if (!a) { aInput.focus(); return; }
  if (!b) { bInput.focus(); return; }
  state.fixedPairs.push({ id: nextId(), aName: a, bName: b });
  aInput.value = '';
  bInput.value = '';
  aInput.focus();
  saveState();
  render();
}

function removeFixedPair(id) {
  state.fixedPairs = state.fixedPairs.filter(fp => fp.id !== id);
  saveState();
  render();
}

function renameFixedPairPlayer(id, slot, value) {
  const fp = state.fixedPairs.find(f => f.id === id);
  if (!fp) return;
  const name = value.trim();
  const key  = slot === 'a' ? 'aName' : 'bName';
  if (!name) { render(); return; }
  if (name === fp[key]) return;
  fp[key] = name;
  saveState();
}

function setFixedTeamName(id, value) {
  const fp = state.fixedPairs.find(f => f.id === id);
  if (!fp) return;
  const name = value.trim();
  if (name) fp.name = name;
  else delete fp.name;
  saveState();
}

function setTeamName(idx, value) {
  const pair = state.pairs[idx];
  if (!pair) return;
  const name = value.trim();
  if (name) pair.name = name;
  else delete pair.name;
  saveState();
}

function renamePlayer(type, id, value) {
  const player = state[type].find(p => p.id === id);
  if (!player) return;
  const name = value.trim();
  if (!name) { render(); return; }
  if (name === player.name) return;
  player.name = name;
  saveState();
}

// Tap a player on the Results screen to start a swap, then tap another player
// of the same category AND in a pair of the same kind to complete the swap.
// Tapping the same player cancels. Tapping a player from an incompatible pair
// (different category or different pair kind, e.g. mixed vs exp-only) moves
// the selection to the new player instead of swapping.
function selectForSwap(category, pairIdx, playerId) {
  if (!state.hasPaired) return;
  const pair = state.pairs[pairIdx];
  if (!pair) return;
  const sel = swapSelection;

  if (sel && sel.playerId === playerId) {
    swapSelection = null;
    renderResults();
    return;
  }

  if (!sel || sel.category !== category || sel.pairKind !== pair.kind) {
    swapSelection = { category, pairKind: pair.kind, pairIdx, playerId };
    renderResults();
    return;
  }

  const other = state.pairs[sel.pairIdx];
  if (!other || sel.pairIdx === pairIdx) {
    swapSelection = null;
    renderResults();
    return;
  }
  // Find which slot (aId / bId) holds each player, then exchange those slots.
  const selSlot    = other.aId === sel.playerId ? 'aId' : 'bId';
  const targetSlot = pair.aId  === playerId      ? 'aId' : 'bId';
  const tmp = other[selSlot];
  other[selSlot] = pair[targetSlot];
  pair[targetSlot] = tmp;

  swapSelection = null;
  saveState();
  renderResults();
}

function setMode(mode) {
  if (mode !== 'full' && mode !== 'split') return;
  if (state.mode === mode) return;
  if (state.hasPaired) return; // menu button is hidden while paired anyway
  state.mode = mode;
  saveState();
  renderMenu();
  renderGenBtn();
}

function generatePairs() {
  if (state.hasPaired) return;
  const hasFixed = state.fixedPairs.length > 0;
  const pairs    = [];

  if (state.mode === 'split') {
    // Pair experienced with experienced and inexperienced with inexperienced
    // separately. Odd counts leave a leftover in the matching unpaired bucket.
    if (state.exp.length >= 2) {
      const sExp = shuffle(state.exp);
      for (let i = 0; i + 1 < sExp.length; i += 2) {
        pairs.push({ aId: sExp[i].id, bId: sExp[i + 1].id, kind: 'exp' });
      }
    }
    if (state.inexp.length >= 2) {
      const sInexp = shuffle(state.inexp);
      for (let i = 0; i + 1 < sInexp.length; i += 2) {
        pairs.push({ aId: sInexp[i].id, bId: sInexp[i + 1].id, kind: 'inexp' });
      }
    }
    if (!hasFixed && pairs.length === 0) return;
  } else {
    // Full 2v2: pair experienced with inexperienced across categories.
    const hasRandom = state.exp.length > 0 && state.inexp.length > 0;
    if (!hasFixed && !hasRandom) return;
    if (hasRandom) {
      const sExp   = shuffle(state.exp);
      const sInexp = shuffle(state.inexp);
      const count  = Math.min(sExp.length, sInexp.length);
      for (let i = 0; i < count; i++) {
        pairs.push({ aId: sExp[i].id, bId: sInexp[i].id, kind: 'mixed' });
      }
    }
  }

  state.pairs     = pairs;
  state.hasPaired = true;
  saveState();
  render();
  fireConfetti();
}

// One-shot celebratory confetti burst on Generate. Lightweight CSS-only
// particles: ~40 small absolutely-positioned divs drop from above the
// viewport with randomized x position, horizontal drift, rotation, size
// and duration so the burst feels chaotic rather than rigid. The container
// is removed from the DOM ~2.5s after creation. Skips entirely under
// prefers-reduced-motion.
const CONFETTI_COLORS = ['#e8442e', '#ffc94d', '#4d9fff', '#2ee8a0', '#fffcef'];

function fireConfetti() {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const container = document.createElement('div');
  container.className = 'confetti-burst';
  for (let i = 0; i < 40; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.setProperty('--c',        CONFETTI_COLORS[i % CONFETTI_COLORS.length]);
    piece.style.setProperty('--x',        (Math.random() * 100).toFixed(2) + 'vw');
    piece.style.setProperty('--dx',       ((Math.random() - 0.5) * 200).toFixed(0) + 'px');
    piece.style.setProperty('--rot',      Math.floor(Math.random() * 720) + 'deg');
    piece.style.setProperty('--size',     (4 + Math.random() * 6).toFixed(1) + 'px');
    piece.style.setProperty('--delay',    (Math.random() * 0.3).toFixed(2) + 's');
    piece.style.setProperty('--duration', (1.2 + Math.random() * 0.6).toFixed(2) + 's');
    container.appendChild(piece);
  }
  document.body.appendChild(container);
  setTimeout(() => container.remove(), 2500);
}

// Two-tap reset. First tap arms the button (red styling + "Tap again to confirm").
// A second tap within 3s clears pairings and team names. Players stay in their lists.
let resetArmTimer = null;

function disarmReset() {
  const btn = document.getElementById('btn-back');
  if (!btn) return;
  btn.classList.remove('armed');
  btn.textContent = 'Reset Teams';
  clearTimeout(resetArmTimer);
  resetArmTimer = null;
}

function resetTeams() {
  const btn = document.getElementById('btn-back');
  if (btn.classList.contains('armed')) {
    disarmReset();
    swapSelection  = null;
    state.pairs     = [];
    state.hasPaired = false;
    saveState();
    render();
    return;
  }
  btn.classList.add('armed');
  btn.textContent = 'Tap again to confirm';
  clearTimeout(resetArmTimer);
  resetArmTimer = setTimeout(disarmReset, 3000);
}

// ---- render ----

function render() {
  document.getElementById('home').style.display     = state.hasPaired ? 'none' : 'block';
  document.getElementById('menu-btn').style.display = state.hasPaired ? 'none' : 'flex';
  renderMenu();
  renderPanel('exp');
  renderPanel('inexp');
  renderFixedList();
  renderGenBtn();
  renderResults();
}

function renderFixedList() {
  document.getElementById('fixed-count').textContent = state.fixedPairs.length;
  const list = document.getElementById('fixed-list');
  if (!state.fixedPairs.length) {
    list.innerHTML = '<div class="list-empty">Empty</div>';
    return;
  }
  list.innerHTML = state.fixedPairs.map(fp => `
    <div class="fixed-pair-row">
      <input class="name-edit" type="text" maxlength="40" value="${esc(fp.aName)}"
             autocomplete="off" autocorrect="off" spellcheck="false"
             onchange="renameFixedPairPlayer(${fp.id}, 'a', this.value)"
             onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
      <span class="fp-amp">&amp;</span>
      <input class="name-edit" type="text" maxlength="40" value="${esc(fp.bName)}"
             autocomplete="off" autocorrect="off" spellcheck="false"
             onchange="renameFixedPairPlayer(${fp.id}, 'b', this.value)"
             onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
      <button class="btn-remove" onclick="removeFixedPair(${fp.id})">×</button>
    </div>
  `).join('');
}

function renderPanel(type) {
  const players = state[type];
  document.getElementById(type + '-count').textContent = players.length;
  const list = document.getElementById(type + '-list');

  if (!players.length) {
    list.innerHTML = '<div class="list-empty">Empty</div>';
    return;
  }

  list.innerHTML = players.map(p => `
    <div class="name-tag">
      ${!state.hasPaired
        ? `<input class="name-edit" type="text" maxlength="40" value="${esc(p.name)}"
                  autocomplete="off" autocorrect="off" spellcheck="false"
                  onchange="renamePlayer('${type}', ${p.id}, this.value)"
                  onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">
           <button class="btn-remove" onclick="removePlayer('${type}', ${p.id})">×</button>`
        : `<span>${esc(p.name)}</span>`}
    </div>
  `).join('');
}

function renderGenBtn() {
  const btn      = document.getElementById('btn-generate');
  const hasFixed = state.fixedPairs.length > 0;
  let hasRandom;
  if (state.mode === 'split') {
    hasRandom = state.exp.length >= 2 || state.inexp.length >= 2;
  } else {
    hasRandom = state.exp.length > 0 && state.inexp.length > 0;
  }
  const ready     = hasFixed || hasRandom;
  btn.className   = ready ? 'btn-generate active' : 'btn-generate';
  btn.textContent = 'Generate Teams';
}

function renderMenu() {
  const fullBtn  = document.getElementById('menu-mode-full');
  const splitBtn = document.getElementById('menu-mode-split');
  if (!fullBtn || !splitBtn) return;
  fullBtn.classList.toggle('active',  state.mode === 'full');
  splitBtn.classList.toggle('active', state.mode === 'split');
}

function openMenu() {
  if (state.hasPaired) return; // safety: menu-btn is hidden in this state anyway
  renderMenu();
  document.getElementById('menu-modal').classList.add('open');
}

function hideMenu() {
  document.getElementById('menu-modal').classList.remove('open');
}

function handleMenuBackdropClick(e) {
  if (e.target === document.getElementById('menu-modal')) hideMenu();
}

// Wrapper used by the menu option buttons so picking a mode auto-closes
// the sheet, matching the mobile "tap to choose" pattern.
function selectMode(mode) {
  setMode(mode);
  hideMenu();
}

function renderResults() {
  const results = document.getElementById('results');
  if (!state.hasPaired) { results.classList.remove('show'); return; }
  results.classList.add('show');

  const expById   = Object.fromEntries(state.exp.map(p => [p.id, p]));
  const inexpById = Object.fromEntries(state.inexp.map(p => [p.id, p]));

  const cards = [];
  let teamNum = 0;

  state.fixedPairs.forEach(fp => {
    teamNum++;
    const num = String(teamNum).padStart(2, '0');
    const nm  = fp.name ? esc(fp.name) : '';
    cards.push(`
      <div class="team-card fixed">
        <span class="team-num">${num}</span>
        <div class="team-body">
          <input
            class="team-name-input"
            type="text"
            maxlength="40"
            placeholder="Team ${num} (tap to name)"
            value="${nm}"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            onchange="setFixedTeamName(${fp.id}, this.value)">
          <div class="team-member set">
            <span class="member-dot set"></span>
            <span class="member-name set">${esc(fp.aName)}</span>
          </div>
          <hr class="team-hr">
          <div class="team-member set">
            <span class="member-dot set"></span>
            <span class="member-name set">${esc(fp.bName)}</span>
          </div>
        </div>
      </div>`);
  });

  state.pairs.forEach((pair, i) => {
    let aPlayer, bPlayer, aClass, bClass;
    if (pair.kind === 'exp') {
      aPlayer = expById[pair.aId]; bPlayer = expById[pair.bId];
      aClass = bClass = 'exp';
    } else if (pair.kind === 'inexp') {
      aPlayer = inexpById[pair.aId]; bPlayer = inexpById[pair.bId];
      aClass = bClass = 'inexp';
    } else { // 'mixed'
      aPlayer = expById[pair.aId]; bPlayer = inexpById[pair.bId];
      aClass = 'exp'; bClass = 'inexp';
    }
    if (!aPlayer || !bPlayer) return;
    teamNum++;
    const num  = String(teamNum).padStart(2, '0');
    const nm   = pair.name ? esc(pair.name) : '';
    const sel  = swapSelection;
    const aSel = sel && sel.playerId === pair.aId ? ' selected' : '';
    const bSel = sel && sel.playerId === pair.bId ? ' selected' : '';
    cards.push(`
      <div class="team-card">
        <span class="team-num">${num}</span>
        <div class="team-body">
          <input
            class="team-name-input"
            type="text"
            maxlength="40"
            placeholder="Team ${num} (tap to name)"
            value="${nm}"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            onchange="setTeamName(${i}, this.value)">
          <div class="team-member ${aClass}${aSel}" onclick="selectForSwap('${aClass}', ${i}, ${aPlayer.id})">
            <span class="member-dot ${aClass}"></span>
            <span class="member-name ${aClass}">${esc(aPlayer.name)}</span>
          </div>
          <hr class="team-hr">
          <div class="team-member ${bClass}${bSel}" onclick="selectForSwap('${bClass}', ${i}, ${bPlayer.id})">
            <span class="member-dot ${bClass}"></span>
            <span class="member-name ${bClass}">${esc(bPlayer.name)}</span>
          </div>
        </div>
      </div>`);
  });

  document.getElementById('pairs-list').innerHTML = cards.length
    ? cards.join('')
    : '<div class="list-empty">No teams</div>';

  const hint = document.getElementById('swap-hint');
  if (swapSelection) {
    const cat = swapSelection.category === 'exp' ? 'experienced' : 'inexperienced';
    hint.textContent = `Tap another ${cat} player to swap, or tap the same one to cancel.`;
    hint.className   = `swap-hint show ${swapSelection.category}`;
  } else {
    hint.className   = 'swap-hint';
    hint.textContent = '';
  }

  const uExp      = unpairedExp();
  const uExpBlock = document.getElementById('unpaired-exp-block');
  if (uExp.length) {
    uExpBlock.style.display = 'block';
    document.getElementById('unpaired-exp-tags').innerHTML =
      uExp.map(p => `<span class="unpaired-tag exp">${esc(p.name)}</span>`).join('');
  } else {
    uExpBlock.style.display = 'none';
  }

  const uInexp      = unpairedInexp();
  const uInexpBlock = document.getElementById('unpaired-inexp-block');
  if (uInexp.length) {
    uInexpBlock.style.display = 'block';
    document.getElementById('unpaired-inexp-tags').innerHTML =
      uInexp.map(p => `<span class="unpaired-tag inexp">${esc(p.name)}</span>`).join('');
  } else {
    uInexpBlock.style.display = 'none';
  }

  const pairBtn = document.getElementById('btn-pair-unpaired');
  let pairCount;
  if (state.mode === 'split') {
    pairCount = Math.floor(uExp.length / 2) + Math.floor(uInexp.length / 2);
  } else {
    pairCount = Math.min(uExp.length, uInexp.length);
  }
  pairBtn.style.display = pairCount > 0 ? 'block' : 'none';
  pairBtn.textContent   = `Pair ${pairCount} Waiting`;
}

// ---- Challonge export ----

function buildExportText() {
  const expById   = Object.fromEntries(state.exp.map(p => [p.id, p]));
  const inexpById = Object.fromEntries(state.inexp.map(p => [p.id, p]));

  const lines = [];

  state.fixedPairs.forEach(fp => {
    lines.push(fp.name || `${fp.aName} & ${fp.bName}`);
  });

  state.pairs.forEach(pair => {
    let a, b;
    if (pair.kind === 'exp')        { a = expById[pair.aId];   b = expById[pair.bId];   }
    else if (pair.kind === 'inexp') { a = inexpById[pair.aId]; b = inexpById[pair.bId]; }
    else                            { a = expById[pair.aId];   b = inexpById[pair.bId]; }
    if (a && b) lines.push(pair.name || `${a.name} & ${b.name}`);
  });

  const uExp   = unpairedExp();
  const uInexp = unpairedInexp();

  if (uExp.length || uInexp.length) {
    if (lines.length) lines.push('');
    uExp.forEach(p   => lines.push(`${p.name} & N/A`));
    uInexp.forEach(p => lines.push(`N/A & ${p.name}`));
  }

  return lines.join('\n');
}

// ---- roster presets ----

function openPresets() {
  document.getElementById('preset-save-name').value = '';
  renderPresetsList();
  document.getElementById('presets-modal').classList.add('open');
}

function hidePresets() {
  document.getElementById('presets-modal').classList.remove('open');
}

function handlePresetsBackdropClick(e) {
  if (e.target === document.getElementById('presets-modal')) hidePresets();
}

function renderPresetsList() {
  const list = document.getElementById('preset-list');
  if (!presets.length) {
    list.innerHTML = '<div class="preset-empty">No presets yet. Save the current roster below.</div>';
    return;
  }
  list.innerHTML = presets.map(p => `
    <div class="preset-row">
      <div class="preset-info">
        <span class="preset-name">${esc(p.name)}</span>
        <span class="preset-counts">${p.exp.length} exp &middot; ${p.inexp.length} inexp${(p.fixedPairs && p.fixedPairs.length) ? ` &middot; ${p.fixedPairs.length} set` : ''}</span>
      </div>
      <div class="preset-actions">
        <button class="btn-preset-load"   onclick="loadPreset(${p.id})">Load</button>
        <button class="btn-preset-rename" onclick="renamePreset(${p.id})">Rename</button>
        <button class="btn-preset-delete" onclick="deletePreset(${p.id})">Delete</button>
      </div>
    </div>
  `).join('');
}

function saveCurrentAsPreset() {
  const input = document.getElementById('preset-save-name');
  const name  = input.value.trim();
  if (!name) return;
  if (!state.exp.length && !state.inexp.length && !state.fixedPairs.length) {
    alert('Add some players to the roster first.');
    return;
  }
  const expNames   = state.exp.map(p => p.name);
  const inexpNames = state.inexp.map(p => p.name);
  const fixedSaved = state.fixedPairs.map(fp => ({ aName: fp.aName, bName: fp.bName }));
  const existing   = presets.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (!confirm(`Preset "${existing.name}" already exists. Overwrite it?`)) return;
    existing.name  = name;
    existing.exp   = expNames;
    existing.inexp = inexpNames;
    existing.fixedPairs = fixedSaved;
  } else {
    presets.push({ id: Date.now(), name, exp: expNames, inexp: inexpNames, fixedPairs: fixedSaved });
  }
  savePresets();
  input.value = '';
  renderPresetsList();
}

function loadPreset(id) {
  const preset = presets.find(p => p.id === id);
  if (!preset) return;
  if (state.exp.length || state.inexp.length || state.fixedPairs.length) {
    if (!confirm(`Replace the current roster with "${preset.name}"?`)) return;
  }
  state.exp        = preset.exp.map(n => ({ id: nextId(), name: n }));
  state.inexp      = preset.inexp.map(n => ({ id: nextId(), name: n }));
  state.fixedPairs = (preset.fixedPairs || []).map(fp => ({ id: nextId(), aName: fp.aName, bName: fp.bName }));
  state.pairs      = [];
  state.hasPaired  = false;
  saveState();
  render();
  hidePresets();
}

function renamePreset(id) {
  const preset = presets.find(p => p.id === id);
  if (!preset) return;
  const newName = prompt('Rename preset:', preset.name);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) return;
  const clash = presets.find(p => p.id !== id && p.name.toLowerCase() === trimmed.toLowerCase());
  if (clash) {
    alert(`Another preset is already called "${clash.name}".`);
    return;
  }
  preset.name = trimmed;
  savePresets();
  renderPresetsList();
}

function deletePreset(id) {
  const preset = presets.find(p => p.id === id);
  if (!preset) return;
  if (!confirm(`Delete preset "${preset.name}"?`)) return;
  presets = presets.filter(p => p.id !== id);
  savePresets();
  renderPresetsList();
}

function openBulkAdd(type) {
  const modal = document.getElementById('bulk-modal');
  modal.dataset.type = type;
  document.getElementById('bulk-title').textContent =
    type === 'exp' ? 'Add Experienced' : 'Add Inexperienced';
  const ta = document.getElementById('bulk-text');
  ta.value = '';
  updateBulkCount();
  modal.classList.add('open');
  setTimeout(() => ta.focus(), 100);
}

function hideBulkAdd() {
  document.getElementById('bulk-modal').classList.remove('open');
}

function handleBulkBackdropClick(e) {
  if (e.target === document.getElementById('bulk-modal')) hideBulkAdd();
}

function parseBulkNames(text) {
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

function updateBulkCount() {
  const names = parseBulkNames(document.getElementById('bulk-text').value);
  const btn   = document.getElementById('btn-bulk-add');
  btn.textContent = `Add ${names.length} ${names.length === 1 ? 'Player' : 'Players'}`;
  btn.disabled    = names.length === 0;
}

function addBulkPlayers() {
  const modal = document.getElementById('bulk-modal');
  const type  = modal.dataset.type;
  const names = parseBulkNames(document.getElementById('bulk-text').value);
  if (!names.length || (type !== 'exp' && type !== 'inexp')) return;
  for (const name of names) {
    state[type].push({ id: nextId(), name });
  }
  saveState();
  render();
  hideBulkAdd();
}

function showExport() {
  document.getElementById('export-text').value = buildExportText();
  document.getElementById('export-modal').classList.add('open');
  const btn = document.getElementById('btn-copy');
  btn.textContent = 'Copy All';
  btn.classList.remove('copied');
}

function hideExport() {
  document.getElementById('export-modal').classList.remove('open');
}

function handleBackdropClick(e) {
  if (e.target === document.getElementById('export-modal')) hideExport();
}

function copyExport() {
  const text = document.getElementById('export-text').value;
  const btn  = document.getElementById('btn-copy');
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy All';
      btn.classList.remove('copied');
    }, 2000);
  }).catch(() => {
    // Fallback for clipboard API failures
    const ta = document.getElementById('export-text');
    ta.select();
    document.execCommand('copy');
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy All';
      btn.classList.remove('copied');
    }, 2000);
  });
}

document.getElementById('exp-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addPlayer('exp');
});
document.getElementById('inexp-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') addPlayer('inexp');
});
document.getElementById('exp-input-r').addEventListener('keydown', e => {
  if (e.key === 'Enter') addPlayer('exp', 'exp-input-r');
});
document.getElementById('inexp-input-r').addEventListener('keydown', e => {
  if (e.key === 'Enter') addPlayer('inexp', 'inexp-input-r');
});

(async () => {
  await loadState();
  loadPresetsFromStorage();
  render();
  if (splashSkipped) {
    hideSplash(); // remove the hidden splash element from the DOM immediately
  } else {
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashStartTime));
    setTimeout(hideSplash, wait);
  }
})();
