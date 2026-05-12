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

// Clears pairs only. Every player stays in their list and becomes editable again.
function resetTeams() {
  state.pairs     = [];
  state.hasPaired = false;
  saveState();
  render();
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
      <span>${esc(p.name)}</span>
      ${!state.hasPaired
        ? `<button class="btn-remove" onclick="removePlayer('${type}', ${p.id})">×</button>`
        : ''}
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
              <div class="team-member">
                <span class="member-dot exp"></span>
                <span class="member-name exp">${esc(e.name)}</span>
              </div>
              <hr class="team-hr">
              <div class="team-member">
                <span class="member-dot inexp"></span>
                <span class="member-name inexp">${esc(n.name)}</span>
              </div>
            </div>
          </div>`;
      }).join('')
    : '<div class="list-empty">No teams</div>';

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

(async () => { await loadState(); render(); })();
