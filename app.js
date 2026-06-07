// ─────────────────────────────────────────
//  DRAGO — app.js
// ─────────────────────────────────────────

const MOODS = ['Feliz', 'Normal', 'Cansado', 'Exausto'];

const MOOD_MESSAGES = {
  'Feliz':   'Drago está radiante! Continue assim.',
  'Normal':  'Drago está te esperando. Bora treinar!',
  'Cansado': 'Drago precisa da sua ajuda hoje.',
  'Exausto': 'Drago está exausto. Ele precisa de você!',
};

const DRAGON_IMG  = 'dragon_transparent.png';
const COIN_GOLD   = 'coin_gold.png';
const COIN_SILVER = 'coin_silver.jpg';
const COIN_FROZEN = 'coin_frozen.jpg';
const BADGE_FIRE  = 'badge_fire.jpg';
const BADGE_ICE   = 'badge_ice.jpg';
const CASTLE_IMG  = 'castle.jpg';

// Imagens temáticas que aparecem na trilha
const TRAIL_IMAGES = [
  { src: DRAGON_IMG,  label: 'Drago' },
  { src: CASTLE_IMG,  label: 'Castelo' },
  { src: DRAGON_IMG,  label: 'Drago' },
  { src: CASTLE_IMG,  label: 'Castelo' },
];

// ── STATE ──────────────────────────────────
let state = {
  trainings:   [],
  days:        {},
  streak:      0,
  monthLiquid: 0,
  monthFrozen: 0,
  monthStart:  null,
};

let currentDayKey = null;

// ── PERSISTENCE ────────────────────────────
function saveState() {
  localStorage.setItem('drago_state', JSON.stringify(state));
}
function loadState() {
  const raw = localStorage.getItem('drago_state');
  if (raw) state = { ...state, ...JSON.parse(raw) };
}

// ── DATE HELPERS ───────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10);
}
function formatDate(iso) {
  const [y, m, d] = iso.split('-');
  const date = new Date(+y, +m - 1, +d);
  const days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return `${days[date.getDay()]} ${d}/${m}`;
}
function isWeekend(iso) {
  const [y, m, d] = iso.split('-');
  const day = new Date(+y, +m - 1, +d).getDay();
  return day === 0 || day === 6;
}
function weeksInMonth(year, month) {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const dim = new Date(year, month, 0).getDate();
  return Math.ceil((firstDay + dim) / 7);
}
function weeksInThisMonth() {
  const now = new Date();
  return weeksInMonth(now.getFullYear(), now.getMonth() + 1);
}

// ── STAGE LOGIC ────────────────────────────
function getStagesForMonth(weeks) {
  if (weeks >= 5) {
    return [
      { name: 'Filhote',     daysNeeded: 0  },
      { name: 'Criança',     daysNeeded: 6  },
      { name: 'Adolescente', daysNeeded: 12 },
      { name: 'Jovem',       daysNeeded: 18 },
      { name: 'Adulto',      daysNeeded: 24 },
    ];
  }
  return [
    { name: 'Filhote', daysNeeded: 0  },
    { name: 'Criança', daysNeeded: 7  },
    { name: 'Jovem',   daysNeeded: 15 },
    { name: 'Adulto',  daysNeeded: 22 },
  ];
}
function getCurrentStage() {
  const stages = getStagesForMonth(weeksInThisMonth());
  const liquid = state.monthLiquid;
  let stage = stages[0];
  for (const s of stages) { if (liquid >= s.daysNeeded) stage = s; }
  return stage;
}
function getNextTarget() {
  const stages = getStagesForMonth(weeksInThisMonth());
  const liquid = state.monthLiquid;
  for (const s of stages) { if (s.daysNeeded > liquid) return s.daysNeeded; }
  return 30;
}

// ── MOOD ───────────────────────────────────
function computeMood(dayKey) {
  const d = state.days[dayKey];
  if (!d) return 'Exausto';
  const total = state.trainings.length;
  if (total === 0) return 'Feliz';
  const done = d.checks.filter(Boolean).length;
  const ratio = done / total;
  if (ratio === 1) return 'Feliz';
  const hour = new Date().getHours();
  let timePenalty = hour >= 21 ? 2 : hour >= 17 ? 1 : 0;
  const base = ratio >= 0.75 ? 0 : ratio >= 0.5 ? 1 : ratio >= 0.25 ? 2 : 3;
  return MOODS[Math.min(base + timePenalty, MOODS.length - 1)];
}

// ── DAY STATUS ─────────────────────────────
function isDayComplete(dayKey) {
  const d = state.days[dayKey];
  if (!d || state.trainings.length === 0) return false;
  return d.checks.every(Boolean);
}
function isDayFrozen(dayKey) {
  return state.days[dayKey]?.frozen === true;
}

// ── AUTO-FREEZE PAST DAYS ──────────────────
function autoFreezePastDays() {
  const t = today();
  let changed = false;
  for (const key of Object.keys(state.days)) {
    if (key >= t) continue;
    const d = state.days[key];
    if (!d.frozen && !isDayComplete(key)) {
      d.frozen = true;
      changed = true;
    }
  }
  if (changed) {
    recomputeStats();
    saveState();
  }
}

// ── RECOMPUTE STATS ────────────────────────
function recomputeStats() {
  const t = today();
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  let streak = 0;
  let monthLiquid = 0;
  let monthFrozen = 0;

  // Count this month
  for (const [key, d] of Object.entries(state.days)) {
    if (!key.startsWith(thisMonth)) continue;
    if (d.frozen) monthFrozen++;
    else if (isDayComplete(key)) monthLiquid++;
  }

  // Streak: walk backwards from today
  let cur = new Date(t);
  while (true) {
    const key = cur.toISOString().slice(0, 10);
    const d = state.days[key];
    if (!d) break;
    if (d.frozen) { cur.setDate(cur.getDate() - 1); continue; }
    if (isDayComplete(key)) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      if (key < t) break;
      cur.setDate(cur.getDate() - 1);
    }
  }

  state.streak = streak;
  state.monthLiquid = monthLiquid;
  state.monthFrozen = monthFrozen;
}

// ── TRAIL / JOURNEY ────────────────────────
function buildJourneyTrail() {
  const trail = document.getElementById('journey-trail');
  trail.innerHTML = '';

  const t = today();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const allDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, '0');
    const mm = String(month + 1).padStart(2, '0');
    allDays.push(`${year}-${mm}-${dd}`);
  }

  // Insert a thematic image every 7 days
  const imageInterval = 7;
  let imgIndex = 0;

  for (let i = 0; i < allDays.length; i++) {
    // Insert trail image before every 7th day (except the first)
    if (i > 0 && i % imageInterval === 0) {
      const img = TRAIL_IMAGES[imgIndex % TRAIL_IMAGES.length];
      imgIndex++;
      const imgEl = buildTrailImage(img, allDays[i - 1] < t);
      trail.appendChild(imgEl);
    }

    const dayEl = buildTrailCoin(allDays[i], t, i);
    trail.appendChild(dayEl);
  }
}

function buildTrailImage(img, isPast) {
  const wrap = document.createElement('div');
  wrap.className = 'trail-image-wrap';
  const el = document.createElement('img');
  el.src = img.src;
  el.alt = img.label;
  el.className = 'trail-image' + (isPast ? ' trail-image-past' : ' trail-image-future');
  wrap.appendChild(el);
  return wrap;
}

function buildTrailCoin(dayKey, todayKey, index) {
  const isToday   = dayKey === todayKey;
  const isPast    = dayKey < todayKey;
  const isFuture  = dayKey > todayKey;
  const complete  = isDayComplete(dayKey);
  const frozen    = isDayFrozen(dayKey);
  const weekend   = isWeekend(dayKey);

  // Position: alternating S-curve pattern
  // Groups of 3: left, center, right — creating a zigzag
  const pos = index % 6;
  let align = 'center';
  if (pos === 0 || pos === 5) align = 'left';
  else if (pos === 1 || pos === 4) align = 'center';
  else if (pos === 2 || pos === 3) align = 'right';

  const wrap = document.createElement('div');
  wrap.className = `trail-step trail-${align}`;

  if (isToday) {
    const todayTag = document.createElement('div');
    todayTag.className = 'trail-today-tag';
    todayTag.textContent = 'hoje';
    wrap.appendChild(todayTag);
  }

  const coinWrap = document.createElement('div');
  coinWrap.className = 'trail-coin-wrap' + (isToday ? ' trail-coin-today' : '');

  const coin = document.createElement('img');
  coin.className = 'trail-coin';

  if (frozen) {
    coin.src = COIN_FROZEN;
    coin.alt = 'Congelado';
  } else if (complete) {
    coin.src = weekend ? COIN_GOLD : COIN_SILVER;
    coin.alt = 'Completo';
  } else if (isToday) {
    coin.src = weekend ? COIN_GOLD : COIN_SILVER;
    coin.alt = 'Hoje';
  } else if (isFuture) {
    coin.src = COIN_SILVER;
    coin.alt = 'Futuro';
    coin.style.opacity = '0.4';
  } else {
    // Past incomplete — should have been auto-frozen, but just in case
    coin.src = COIN_SILVER;
    coin.alt = 'Incompleto';
    coin.style.opacity = '0.4';
  }

  coinWrap.appendChild(coin);

  // Badge
  if (complete || frozen) {
    const badge = document.createElement('img');
    badge.className = 'trail-badge';
    badge.src = frozen ? BADGE_ICE : BADGE_FIRE;
    badge.alt = frozen ? 'Congelado' : 'Feito';
    coinWrap.appendChild(badge);
  }

  if (isPast || isToday) {
    wrap.style.cursor = 'pointer';
    wrap.addEventListener('click', () => openDay(dayKey));
  }

  const [, m, d] = dayKey.split('-');
  const dateLabel = document.createElement('span');
  dateLabel.className = 'trail-date';
  dateLabel.textContent = `${d}/${m}`;

  wrap.appendChild(coinWrap);
  wrap.appendChild(dateLabel);
  return wrap;
}

// ── OPEN DAY ───────────────────────────────
function openDay(dayKey) {
  currentDayKey = dayKey;

  if (!state.days[dayKey]) {
    state.days[dayKey] = { checks: state.trainings.map(() => false), frozen: false };
    saveState();
  }

  const d = state.days[dayKey];
  while (d.checks.length < state.trainings.length) d.checks.push(false);

  const isToday = dayKey === today();
  const frozen  = isDayFrozen(dayKey);

  // Header
  document.getElementById('day-title').textContent = isToday ? 'Hoje' : formatDate(dayKey);

  // Card mood label
  const mood = isToday ? computeMood(dayKey) : (isDayComplete(dayKey) ? 'Feliz' : frozen ? 'Normal' : 'Cansado');
  document.getElementById('day-mood').textContent = mood;

  // Trainings
  renderDayTrainings(dayKey, isToday && !frozen);

  // Footer message
  renderDayFooter(dayKey, isToday, frozen);

  showScreen('screen-day');
}

function renderDayTrainings(dayKey, editable) {
  const container = document.getElementById('day-trainings');
  container.innerHTML = '';
  const d = state.days[dayKey];

  state.trainings.forEach((tr, i) => {
    const item = document.createElement('div');
    item.className = 'training-check' + (d.checks[i] ? ' done' : '');

    item.innerHTML = `
      <span class="tc-emoji">${tr.emoji}</span>
      <span class="tc-text">${tr.text}</span>
      <div class="tc-checkbox">${d.checks[i] ? '✓' : ''}</div>
    `;

    if (editable) item.addEventListener('click', () => toggleCheck(dayKey, i));
    container.appendChild(item);
  });
}

function renderDayFooter(dayKey, isToday, frozen) {
  const footer = document.getElementById('day-footer');
  footer.innerHTML = '';

  if (frozen) {
    footer.innerHTML = `<div class="day-status-msg day-status-frozen">❄️ Dia congelado. Drago carrega essa cicatriz.</div>`;
    return;
  }
  if (isDayComplete(dayKey)) {
    footer.innerHTML = `<div class="day-status-msg day-status-complete">🔥 Drago está mais preparado para o inverno!</div>`;
    return;
  }
  if (!isToday) {
    footer.innerHTML = `<div class="day-status-msg day-status-frozen">❄️ Dia congelado. Drago carrega essa cicatriz.</div>`;
  }
}

// ── TOGGLE CHECK ───────────────────────────
function toggleCheck(dayKey, index) {
  const d = state.days[dayKey];
  d.checks[index] = !d.checks[index];
  saveState();
  renderDayTrainings(dayKey, dayKey === today());
  renderDayFooter(dayKey, dayKey === today(), false);
  recomputeStats();
  saveState();
  updateHomeCard();
  buildJourneyTrail();
}

// ── HOME CARD ──────────────────────────────
function updateHomeCard() {
  const stage = getCurrentStage();
  const next  = getNextTarget();
  const liquid = state.monthLiquid;

  document.getElementById('card-stage').textContent = stage.name;
  document.getElementById('card-days').textContent  = `${liquid} / ${next} dias`;

  const pct = Math.min((liquid / next) * 100, 100);
  document.getElementById('progress-bar').style.width = pct + '%';

  document.getElementById('badge-streak').textContent  = `🔥 ${state.streak} dias`;
  document.getElementById('badge-freezes').textContent = `❄️ ${state.monthFrozen} congelamentos`;

  const mood = computeMood(today());
  document.getElementById('mood-message').textContent = MOOD_MESSAGES[mood] || '';
}

// ── SETUP ──────────────────────────────────
function renderSetupList() {
  const list = document.getElementById('training-list');
  list.innerHTML = '';
  state.trainings.forEach((tr, i) => {
    const item = document.createElement('div');
    item.className = 'training-item';
    item.innerHTML = `
      <span class="t-emoji">${tr.emoji}</span>
      <span class="t-text">${tr.text}</span>
      <button class="t-delete" onclick="deleteTraining(${i})">✕</button>
    `;
    list.appendChild(item);
  });
}

function addTraining() {
  document.getElementById('training-emoji').value = '';
  document.getElementById('training-text').value  = '';
  document.getElementById('modal-training').classList.remove('hidden');
  setTimeout(() => document.getElementById('training-emoji').focus(), 100);
}

function confirmAddTraining() {
  const emoji = document.getElementById('training-emoji').value.trim() || '🏃';
  const text  = document.getElementById('training-text').value.trim();
  if (!text) return;
  state.trainings.push({ emoji, text });
  saveState();
  renderSetupList();
  closeModal();
}

function deleteTraining(index) {
  state.trainings.splice(index, 1);
  saveState();
  renderSetupList();
}

function closeModal() {
  document.getElementById('modal-training').classList.add('hidden');
}

function saveSetup() {
  if (state.trainings.length === 0) { alert('Adicione pelo menos um treinamento!'); return; }
  if (!state.monthStart) state.monthStart = today();
  saveState();
  showHome();
}

function goToSetup() {
  renderSetupList();
  document.getElementById('setup-back').style.display = 'flex';
  showScreen('screen-setup');
}

function goBack() { showHome(); }
function goHome() { showHome(); }

// ── SCREENS ────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showHome() {
  autoFreezePastDays();
  recomputeStats();
  saveState();
  updateHomeCard();
  buildJourneyTrail();
  showScreen('screen-home');
}

function showSplash(callback) {
  showScreen('screen-splash');
  setTimeout(callback, 2200);
}

// ── INIT ───────────────────────────────────
function init() {
  loadState();

  const t = today();
  if (!state.days[t]) {
    state.days[t] = { checks: state.trainings.map(() => false), frozen: false };
    saveState();
  }

  const isFirstTime = state.trainings.length === 0;

  showSplash(() => {
    if (isFirstTime) {
      document.getElementById('setup-back').style.display = 'none';
      renderSetupList();
      showScreen('screen-setup');
    } else {
      showHome();
    }
  });
}

document.getElementById('modal-training').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

init();
