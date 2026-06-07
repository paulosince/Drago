// ─────────────────────────────────────────
//  DRAGO — app.js
// ─────────────────────────────────────────

// ── CONSTANTS ──────────────────────────────
const STAGES = [
  { name: 'Filhote',     daysNeeded: 0  },
  { name: 'Criança',     daysNeeded: 7  },
  { name: 'Adolescente', daysNeeded: 14 },
  { name: 'Jovem',       daysNeeded: 21 },
  { name: 'Adulto',      daysNeeded: 28 },
];

const MOODS = ['Feliz', 'Normal', 'Cansado', 'Exausto'];

const MOOD_MESSAGES = {
  'Feliz':   'Drago está radiante! Continue assim.',
  'Normal':  'Drago está te esperando. Bora treinar!',
  'Cansado': 'Drago precisa da sua ajuda hoje.',
  'Exausto': 'Drago está exausto. Ele precisa de você!',
};

const DRAGON_IMG = 'dragon_transparent.png';
// When you have the 20 sprites, replace with:
// sprites[stage][mood] = 'img/filhote_feliz.png', etc.

const DAYS_IN_MONTH = 30; // liquid days target per dragon
const MAX_FREEZES   = 3;

// ── STATE ──────────────────────────────────
let state = {
  trainings:    [],   // [{emoji, text}]
  days:         {},   // { 'YYYY-MM-DD': { checks: [bool], frozen: bool } }
  totalLiquid:  0,    // liquid 🔥 days (completed days, all time)
  streak:       0,    // current consecutive liquid days
  freezesLeft:  MAX_FREEZES,
  freezesUsed:  0,    // total (= cicatrizes)
  monthStart:   null, // ISO date when current dragon started
  monthLiquid:  0,    // liquid days this month
};

let currentDayKey = null; // which day is open in detail screen

// ── PERSISTENCE ────────────────────────────
function saveState() {
  localStorage.setItem('drago_state', JSON.stringify(state));
}

function loadState() {
  const raw = localStorage.getItem('drago_state');
  if (raw) {
    state = { ...state, ...JSON.parse(raw) };
  }
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

function weeksInMonth(year, month) {
  // month: 1-12
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();
  return Math.ceil((firstDay + daysInMonth) / 7);
}

// ── STAGE LOGIC ────────────────────────────
function getStageForLiquidDays(liquidDays) {
  // within the current dragon month
  const weeks = weeksInThisMonth();
  const stagesForMonth = getStagesForMonth(weeks);
  let stage = stagesForMonth[0];
  for (const s of stagesForMonth) {
    if (liquidDays >= s.daysNeeded) stage = s;
    else break;
  }
  return stage;
}

function weeksInThisMonth() {
  const now = new Date();
  return weeksInMonth(now.getFullYear(), now.getMonth() + 1);
}

function getStagesForMonth(weeks) {
  if (weeks >= 5) {
    // 5 stages: Filhote, Criança, Adolescente, Jovem, Adulto
    return [
      { name: 'Filhote',     daysNeeded: 0  },
      { name: 'Criança',     daysNeeded: 6  },
      { name: 'Adolescente', daysNeeded: 12 },
      { name: 'Jovem',       daysNeeded: 18 },
      { name: 'Adulto',      daysNeeded: 24 },
    ];
  } else {
    // 4 stages: Filhote, Criança, Jovem, Adulto
    return [
      { name: 'Filhote', daysNeeded: 0  },
      { name: 'Criança', daysNeeded: 7  },
      { name: 'Jovem',   daysNeeded: 15 },
      { name: 'Adulto',  daysNeeded: 22 },
    ];
  }
}

function getNextStageDays(liquidDays) {
  const weeks = weeksInThisMonth();
  const stages = getStagesForMonth(weeks);
  for (const s of stages) {
    if (s.daysNeeded > liquidDays) return s.daysNeeded;
  }
  return DAYS_IN_MONTH;
}

// ── MOOD LOGIC ─────────────────────────────
function computeMood(dayKey) {
  const dayData = state.days[dayKey];
  if (!dayData) return 'Exausto';

  const total = state.trainings.length;
  if (total === 0) return 'Feliz';

  const done = dayData.checks.filter(Boolean).length;
  const ratio = done / total;

  const now = new Date();
  const hour = now.getHours();

  if (ratio === 1) return 'Feliz';

  // Time pressure: later in day = worse base mood
  let timePenalty = 0;
  if (hour >= 21) timePenalty = 2;
  else if (hour >= 17) timePenalty = 1;
  else if (hour >= 12) timePenalty = 0;

  const base = ratio >= 0.75 ? 0
             : ratio >= 0.5  ? 1
             : ratio >= 0.25 ? 2
             : 3;

  const idx = Math.min(base + timePenalty, MOODS.length - 1);
  return MOODS[idx];
}

// ── DAY COMPLETION ─────────────────────────
function isDayComplete(dayKey) {
  const d = state.days[dayKey];
  if (!d || state.trainings.length === 0) return false;
  return d.checks.every(Boolean);
}

function isDayFrozen(dayKey) {
  return state.days[dayKey]?.frozen === true;
}

// ── JOURNEY GRID ───────────────────────────
function buildJourneyGrid() {
  const grid = document.getElementById('journey-grid');
  grid.innerHTML = '';

  const t = today();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Build array of day keys for this month
  const allDays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, '0');
    const mm = String(month + 1).padStart(2, '0');
    allDays.push(`${year}-${mm}-${dd}`);
  }

  // Split into rows of 5
  const chunkSize = 5;
  for (let i = 0; i < allDays.length; i += chunkSize) {
    const chunk = allDays.slice(i, i + chunkSize);
    const row = document.createElement('div');
    row.className = 'journey-row';

    for (const dayKey of chunk) {
      const dayEl = buildDayCoin(dayKey, t);
      row.appendChild(dayEl);
    }

    grid.appendChild(row);
  }
}

function buildDayCoin(dayKey, todayKey) {
  const wrap = document.createElement('div');
  wrap.className = 'journey-day';

  const coin = document.createElement('div');
  coin.className = 'day-coin';

  const isToday   = dayKey === todayKey;
  const isPast    = dayKey < todayKey;
  const complete  = isDayComplete(dayKey);
  const frozen    = isDayFrozen(dayKey);

  // Date label
  const [, m, d] = dayKey.split('-');
  const dateLabel = document.createElement('span');
  dateLabel.className = 'day-date';

  if (isToday) {
    const tag = document.createElement('span');
    tag.className = 'today-tag';
    tag.textContent = 'hoje';
    wrap.insertBefore(tag, wrap.firstChild);
    coin.classList.add('today');
    dateLabel.textContent = `${d}/${m}`;
  } else {
    dateLabel.textContent = `${d}/${m}`;
  }

  if (frozen) {
    coin.classList.add('frozen');
    coin.innerHTML = `<span class="coin-icon">❄️</span>`;
  } else if (complete) {
    coin.classList.add('complete');
    const img = document.createElement('img');
    img.src = DRAGON_IMG;
    img.className = 'coin-dragon';
    img.alt = 'Drago';
    coin.appendChild(img);
  } else if (isToday) {
    coin.classList.add('complete'); // highlight today even if incomplete
    const img = document.createElement('img');
    img.src = DRAGON_IMG;
    img.className = 'coin-dragon';
    img.alt = 'Drago';
    coin.appendChild(img);
  } else {
    coin.classList.add('empty');
    coin.innerHTML = `<span style="font-size:20px;opacity:0.25">🐉</span>`;
  }

  // Only past + today are clickable
  if (isPast || isToday) {
    wrap.addEventListener('click', () => openDay(dayKey));
    wrap.style.cursor = 'pointer';
  }

  wrap.appendChild(coin);
  wrap.appendChild(dateLabel);
  return wrap;
}

// ── OPEN DAY ───────────────────────────────
function openDay(dayKey) {
  currentDayKey = dayKey;

  // Ensure day data exists
  if (!state.days[dayKey]) {
    state.days[dayKey] = {
      checks: state.trainings.map(() => false),
      frozen: false,
    };
    saveState();
  }

  // Pad checks if trainings changed
  const d = state.days[dayKey];
  while (d.checks.length < state.trainings.length) d.checks.push(false);

  const t = today();
  const isPast = dayKey < t;
  const isToday = dayKey === t;

  // Title
  const [, m, day] = dayKey.split('-');
  document.getElementById('day-title').textContent =
    isToday ? 'Hoje' : formatDate(dayKey);

  // Trainings
  renderDayTrainings(dayKey, isToday);

  // Footer
  renderDayFooter(dayKey, isToday);

  showScreen('screen-day');
}

function renderDayTrainings(dayKey, editable) {
  const container = document.getElementById('day-trainings');
  container.innerHTML = '';
  const d = state.days[dayKey];

  state.trainings.forEach((tr, i) => {
    const item = document.createElement('div');
    item.className = 'training-check' + (d.checks[i] ? ' done' : '');
    item.dataset.index = i;

    item.innerHTML = `
      <span class="tc-emoji">${tr.emoji}</span>
      <span class="tc-text">${tr.text}</span>
      <div class="tc-checkbox">${d.checks[i] ? '✓' : ''}</div>
    `;

    if (editable) {
      item.addEventListener('click', () => toggleCheck(dayKey, i));
    }

    container.appendChild(item);
  });
}

function renderDayFooter(dayKey, isToday) {
  const footer = document.getElementById('day-footer');
  footer.innerHTML = '';

  if (isDayComplete(dayKey)) {
    const msg = document.createElement('div');
    msg.className = 'day-complete-msg';
    msg.textContent = '🔥 Drago está mais preparado para o inverno!';
    footer.appendChild(msg);
    return;
  }

  if (!isToday) return;

  // Today + incomplete: show freeze button if available
  if (state.freezesLeft > 0) {
    const btn = document.createElement('button');
    btn.className = 'freeze-btn';
    btn.textContent = `❄️ Usar congelamento (${state.freezesLeft} disponíveis)`;
    btn.onclick = () => useFreeze(dayKey);
    footer.appendChild(btn);
  }
}

// ── TOGGLE CHECK ───────────────────────────
function toggleCheck(dayKey, index) {
  const d = state.days[dayKey];
  d.checks[index] = !d.checks[index];
  saveState();
  renderDayTrainings(dayKey, dayKey === today());
  renderDayFooter(dayKey, dayKey === today());

  // Update streak / liquid days
  recomputeStreak();
  updateHomeCard();
  buildJourneyGrid();
}

// ── FREEZE ─────────────────────────────────
function useFreeze(dayKey) {
  if (state.freezesLeft <= 0) return;
  state.days[dayKey].frozen = true;
  state.freezesLeft--;
  state.freezesUsed++;
  saveState();

  renderDayFooter(dayKey, dayKey === today());
  renderDayTrainings(dayKey, false); // frozen day is read-only
  updateHomeCard();
  buildJourneyGrid();

  // Visual feedback
  const footer = document.getElementById('day-footer');
  footer.innerHTML = `<div class="day-complete-msg" style="background:linear-gradient(135deg,#a8d8f0,#6ab4f5)">❄️ Dia congelado. Drago carrega essa cicatriz.</div>`;
}

// ── STREAK & LIQUID DAYS ───────────────────
function recomputeStreak() {
  const t = today();
  let streak = 0;
  let liquid = 0;
  let monthLiquid = 0;

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Walk backwards from today
  let cur = new Date(t);
  while (true) {
    const key = cur.toISOString().slice(0, 10);
    const d = state.days[key];
    if (!d) break;

    if (d.frozen) {
      // frozen: counts in streak chain but not liquid
      cur.setDate(cur.getDate() - 1);
      continue;
    }

    if (isDayComplete(key)) {
      streak++;
      liquid++;
      if (key.startsWith(thisMonth)) monthLiquid++;
      cur.setDate(cur.getDate() - 1);
    } else {
      // incomplete past day breaks streak
      if (key < t) break;
      cur.setDate(cur.getDate() - 1);
    }
  }

  state.streak = streak;
  state.totalLiquid = liquid;
  state.monthLiquid = monthLiquid;
  saveState();
}

// ── HOME CARD ──────────────────────────────
function updateHomeCard() {
  const liquid = state.monthLiquid;
  const weeks  = weeksInThisMonth();
  const stages = getStagesForMonth(weeks);

  // Current stage
  let stage = stages[0];
  for (const s of stages) {
    if (liquid >= s.daysNeeded) stage = s;
  }

  // Next stage target
  let nextTarget = DAYS_IN_MONTH;
  for (const s of stages) {
    if (s.daysNeeded > liquid) { nextTarget = s.daysNeeded; break; }
  }

  document.getElementById('card-stage').textContent = stage.name;
  document.getElementById('card-days').textContent  = `${liquid} / ${nextTarget} dias`;

  const pct = Math.min((liquid / nextTarget) * 100, 100);
  document.getElementById('progress-bar').style.width = pct + '%';

  document.getElementById('badge-streak').textContent  = `🔥 ${state.streak} dias`;
  document.getElementById('badge-freezes').textContent = `❄️ ${state.freezesLeft} congelamentos`;

  // Mood
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
  if (state.trainings.length === 0) {
    alert('Adicione pelo menos um treinamento!');
    return;
  }
  state.monthStart = today();
  saveState();
  showHome();
}

function goToSetup() {
  renderSetupList();
  document.getElementById('setup-back').style.display = 'flex';
  showScreen('screen-setup');
}

function goBack() {
  showHome();
}

function goHome() {
  showHome();
}

// ── SCREENS ────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showHome() {
  recomputeStreak();
  updateHomeCard();
  buildJourneyGrid();
  showScreen('screen-home');
}

// ── SPLASH ─────────────────────────────────
function showSplash(callback) {
  showScreen('screen-splash');
  setTimeout(callback, 2200);
}

// ── INIT ───────────────────────────────────
function init() {
  loadState();

  // Ensure today's day record exists
  const t = today();
  if (!state.days[t]) {
    state.days[t] = {
      checks: state.trainings.map(() => false),
      frozen: false,
    };
    saveState();
  }

  const isFirstTime = state.trainings.length === 0;

  showSplash(() => {
    if (isFirstTime) {
      // First launch: show setup without back button
      document.getElementById('setup-back').style.display = 'none';
      renderSetupList();
      showScreen('screen-setup');
    } else {
      showHome();
    }
  });
}

// Close modal on overlay click
document.getElementById('modal-training').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

init();
