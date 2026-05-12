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
  exp:       [],
  inexp:     [],
  pairs:     [],   // [{ expId, inexpId }]
  hasPaired: false,
  uid:       0
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
  const used = new Set(state.pairs.map(p => p.expId));
  return state.exp.filter(p => !used.has(p.id));
}

function unpairedInexp() {
  const used = new Set(state.pairs.map(p => p.inexpId));
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
  const sExp   = shuffle(unpairedExp());
  const sInexp = shuffle(unpairedInexp());
  const count  = Math.min(sExp.length, sInexp.length);
  if (!count) return;
  for (let i = 0; i < count; i++) {
    state.pairs.push({ expId: sExp[i].id, inexpId: sInexp[i].id });
  }
  swapSelection = null;
  saveState();
  render();
}

function removePlayer(type, id) {
  state[type] = state[type].filter(p => p.id !== id);
  saveState();
  render();
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
// of the same category on a different team to complete the swap. Tapping the
// same player cancels. Cross-category taps move the selection to the new player.
function selectForSwap(type, pairIdx, playerId) {
  if (!state.hasPaired) return;
  const sel = swapSelection;

  if (sel && sel.type === type && sel.playerId === playerId) {
    swapSelection = null;
    renderResults();
    return;
  }

  if (!sel || sel.type !== type) {
    swapSelection = { type, pairIdx, playerId };
    renderResults();
    return;
  }

  const a = state.pairs[sel.pairIdx];
  const b = state.pairs[pairIdx];
  if (!a || !b || sel.pairIdx === pairIdx) {
    swapSelection = null;
    renderResults();
    return;
  }
  const key = type === 'exp' ? 'expId' : 'inexpId';
  const tmp = a[key];
  a[key]   = b[key];
  b[key]   = tmp;
  swapSelection = null;
  saveState();
  renderResults();
}

function generatePairs() {
  if (!state.exp.length || !state.inexp.length || state.hasPaired) return;
  const sExp   = shuffle(state.exp);
  const sInexp = shuffle(state.inexp);
  const count  = Math.min(sExp.length, sInexp.length);
  state.pairs     = Array.from({ length: count }, (_, i) => ({ expId: sExp[i].id, inexpId: sInexp[i].id }));
  state.hasPaired = true;
  saveState();
  render();
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
  document.getElementById('home').style.display = state.hasPaired ? 'none' : 'block';
  renderPanel('exp');
  renderPanel('inexp');
  renderGenBtn();
  renderResults();
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
  const btn   = document.getElementById('btn-generate');
  const ready = state.exp.length > 0 && state.inexp.length > 0;
  btn.className   = ready ? 'btn-generate active' : 'btn-generate';
  btn.textContent = 'Generate Teams';
}

function renderResults() {
  const results = document.getElementById('results');
  if (!state.hasPaired) { results.classList.remove('show'); return; }
  results.classList.add('show');

  const expById   = Object.fromEntries(state.exp.map(p => [p.id, p]));
  const inexpById = Object.fromEntries(state.inexp.map(p => [p.id, p]));

  document.getElementById('pairs-list').innerHTML = state.pairs.length
    ? state.pairs.map((pair, i) => {
        const e = expById[pair.expId];
        const n = inexpById[pair.inexpId];
        if (!e || !n) return '';
        const num  = String(i + 1).padStart(2, '0');
        const nm   = pair.name ? esc(pair.name) : '';
        const sel  = swapSelection;
        const eSel = sel && sel.type === 'exp'   && sel.pairIdx === i ? ' selected' : '';
        const nSel = sel && sel.type === 'inexp' && sel.pairIdx === i ? ' selected' : '';
        return `
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
              <div class="team-member exp${eSel}" onclick="selectForSwap('exp', ${i}, ${e.id})">
                <span class="member-dot exp"></span>
                <span class="member-name exp">${esc(e.name)}</span>
              </div>
              <hr class="team-hr">
              <div class="team-member inexp${nSel}" onclick="selectForSwap('inexp', ${i}, ${n.id})">
                <span class="member-dot inexp"></span>
                <span class="member-name inexp">${esc(n.name)}</span>
              </div>
            </div>
          </div>`;
      }).join('')
    : '<div class="list-empty">No teams</div>';

  const hint = document.getElementById('swap-hint');
  if (swapSelection) {
    const cat = swapSelection.type === 'exp' ? 'experienced' : 'inexperienced';
    hint.textContent = `Tap another ${cat} player to swap, or tap the same one to cancel.`;
    hint.className   = `swap-hint show ${swapSelection.type}`;
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

  const canPair = uExp.length > 0 && uInexp.length > 0;
  const pairBtn = document.getElementById('btn-pair-unpaired');
  pairBtn.style.display = canPair ? 'block' : 'none';
  pairBtn.textContent   = `Pair ${Math.min(uExp.length, uInexp.length)} Waiting`;
}

// ---- Challonge export ----

function buildExportText() {
  const expById   = Object.fromEntries(state.exp.map(p => [p.id, p]));
  const inexpById = Object.fromEntries(state.inexp.map(p => [p.id, p]));

  const lines = [];

  state.pairs.forEach(pair => {
    const e = expById[pair.expId];
    const n = inexpById[pair.inexpId];
    if (e && n) lines.push(pair.name || `${e.name} & ${n.name}`);
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
        <span class="preset-counts">${p.exp.length} exp &middot; ${p.inexp.length} inexp</span>
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
  if (!state.exp.length && !state.inexp.length) {
    alert('Add some players to the roster first.');
    return;
  }
  const expNames   = state.exp.map(p => p.name);
  const inexpNames = state.inexp.map(p => p.name);
  const existing   = presets.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (existing) {
    if (!confirm(`Preset "${existing.name}" already exists. Overwrite it?`)) return;
    existing.name  = name;
    existing.exp   = expNames;
    existing.inexp = inexpNames;
  } else {
    presets.push({ id: Date.now(), name, exp: expNames, inexp: inexpNames });
  }
  savePresets();
  input.value = '';
  renderPresetsList();
}

function loadPreset(id) {
  const preset = presets.find(p => p.id === id);
  if (!preset) return;
  if (state.exp.length || state.inexp.length) {
    if (!confirm(`Replace the current roster with "${preset.name}"?`)) return;
  }
  state.exp       = preset.exp.map(n => ({ id: nextId(), name: n }));
  state.inexp     = preset.inexp.map(n => ({ id: nextId(), name: n }));
  state.pairs     = [];
  state.hasPaired = false;
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

(async () => { await loadState(); loadPresetsFromStorage(); render(); })();
