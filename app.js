// DRAGO — app.js v3

// ── DEBUG VISUAL ──────────────────────────
function showDebug(msg) {
  var el = document.getElementById('debug-msg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'debug-msg';
    el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:red;color:white;padding:12px;font-size:12px;z-index:9999;white-space:pre-wrap;word-break:break-all;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
}

window.onerror = function(msg, src, line, col, err) {
  showDebug('JS ERROR: ' + msg + '\nLinha: ' + line + '\n' + (err ? err.stack : ''));
};

// ── CONSTANTS ─────────────────────────────
var MOODS = ['Feliz', 'Normal', 'Cansado', 'Exausto'];

var MOOD_MESSAGES = {
  'Feliz':   'Drago está radiante! Continue assim.',
  'Normal':  'Drago está te esperando. Bora treinar!',
  'Cansado': 'Drago precisa da sua ajuda hoje.',
  'Exausto': 'Drago está exausto. Ele precisa de você!'
};

var DRAGON_IMG  = 'dragon_transparent.png';
var COIN_GOLD   = 'coin_gold.png';
var COIN_SILVER = 'coin_silver.png';
var COIN_FROZEN = 'coin_frozen.png';
var BADGE_FIRE  = 'badge_fire.png';
var BADGE_ICE   = 'badge_ice.png';
var CASTLE_IMG  = 'castle.png';
var STATE_VERSION = 3;

var TRAIL_IMAGES = [
  { src: DRAGON_IMG, label: 'Drago' },
  { src: CASTLE_IMG, label: 'Castelo' },
  { src: DRAGON_IMG, label: 'Drago' },
  { src: CASTLE_IMG, label: 'Castelo' }
];

// ── STATE ─────────────────────────────────
var state = {
  trainings:   [],
  days:        {},
  streak:      0,
  monthLiquid: 0,
  monthFrozen: 0,
  monthStart:  null,
  version:     STATE_VERSION
};

var currentDayKey = null;

// ── PERSISTENCE ───────────────────────────
function saveState() {
  try {
    state.version = STATE_VERSION;
    localStorage.setItem('drago_v3', JSON.stringify(state));
  } catch(e) { showDebug('saveState error: ' + e.message); }
}

function loadState() {
  try {
    var raw = localStorage.getItem('drago_v3');
    if (!raw) return;
    var parsed = JSON.parse(raw);
    state = Object.assign({}, state, parsed);
  } catch(e) {
    showDebug('loadState error: ' + e.message);
    localStorage.removeItem('drago_v3');
  }
}

// ── DATE HELPERS ──────────────────────────
function today() {
  var d = new Date();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return d.getFullYear() + '-' + mm + '-' + dd;
}

// padStart polyfill
if (!String.prototype.padStart) {
  String.prototype.padStart = function(len, fill) {
    var s = String(this);
    while (s.length < len) s = fill + s;
    return s;
  };
}

function formatDate(iso) {
  var parts = iso.split('-');
  var date = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  var days = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  return days[date.getDay()] + ' ' + parts[2] + '/' + parts[1];
}

function isWeekend(iso) {
  var parts = iso.split('-');
  var day = new Date(+parts[0], +parts[1] - 1, +parts[2]).getDay();
  return day === 0 || day === 6;
}

function weeksInMonth(year, month) {
  var firstDay = new Date(year, month - 1, 1).getDay();
  var dim = new Date(year, month, 0).getDate();
  return Math.ceil((firstDay + dim) / 7);
}

function weeksInThisMonth() {
  var now = new Date();
  return weeksInMonth(now.getFullYear(), now.getMonth() + 1);
}

// ── STAGE LOGIC ───────────────────────────
function getStagesForMonth(weeks) {
  if (weeks >= 5) {
    return [
      { name: 'Filhote',     daysNeeded: 0  },
      { name: 'Criança',     daysNeeded: 6  },
      { name: 'Adolescente', daysNeeded: 12 },
      { name: 'Jovem',       daysNeeded: 18 },
      { name: 'Adulto',      daysNeeded: 24 }
    ];
  }
  return [
    { name: 'Filhote', daysNeeded: 0  },
    { name: 'Criança', daysNeeded: 7  },
    { name: 'Jovem',   daysNeeded: 15 },
    { name: 'Adulto',  daysNeeded: 22 }
  ];
}

function getCurrentStage() {
  var stages = getStagesForMonth(weeksInThisMonth());
  var liquid = state.monthLiquid;
  var stage = stages[0];
  for (var i = 0; i < stages.length; i++) {
    if (liquid >= stages[i].daysNeeded) stage = stages[i];
  }
  return stage;
}

function getNextTarget() {
  return 30;
}

// ── MOOD ──────────────────────────────────
function computeMood(dayKey) {
  var d = state.days[dayKey];
  if (!d) return 'Exausto';
  var total = state.trainings.length;
  if (total === 0) return 'Feliz';
  var done = d.checks.filter(function(c) { return c; }).length;
  var ratio = done / total;
  if (ratio === 1) return 'Feliz';
  var hour = new Date().getHours();
  var timePenalty = hour >= 21 ? 2 : hour >= 17 ? 1 : 0;
  var base = ratio >= 0.75 ? 0 : ratio >= 0.5 ? 1 : ratio >= 0.25 ? 2 : 3;
  return MOODS[Math.min(base + timePenalty, MOODS.length - 1)];
}

// ── DAY STATUS ────────────────────────────
function isDayComplete(dayKey) {
  var d = state.days[dayKey];
  if (!d || state.trainings.length === 0) return false;
  return d.checks.every(function(c) { return c; });
}

function isDayFrozen(dayKey) {
  return state.days[dayKey] && state.days[dayKey].frozen === true;
}

// ── AUTO-FREEZE ───────────────────────────
function autoFreezePastDays() {
  var t = today();
  var changed = false;
  var keys = Object.keys(state.days);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key >= t) continue;
    var d = state.days[key];
    if (!d.frozen && !isDayComplete(key)) {
      d.frozen = true;
      changed = true;
    }
  }
  if (changed) saveState();
}

// ── RECOMPUTE STATS ───────────────────────
function recomputeStats() {
  var t = today();
  var now = new Date();
  var mm = String(now.getMonth() + 1).padStart(2, '0');
  var thisMonth = now.getFullYear() + '-' + mm;

  var streak = 0;
  var monthLiquid = 0;
  var monthFrozen = 0;

  var keys = Object.keys(state.days);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    if (key.indexOf(thisMonth) !== 0) continue;
    var d = state.days[key];
    if (d.frozen) monthFrozen++;
    else if (isDayComplete(key)) monthLiquid++;
  }

  // Streak: walk backwards
  var cur = new Date(t);
  while (true) {
    var kk = cur.toISOString().slice(0, 10);
    var dd = state.days[kk];
    if (!dd) break;
    if (dd.frozen) { cur.setDate(cur.getDate() - 1); continue; }
    if (isDayComplete(kk)) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      if (kk < t) break;
      cur.setDate(cur.getDate() - 1);
    }
  }

  state.streak = streak;
  state.monthLiquid = monthLiquid;
  state.monthFrozen = monthFrozen;
}

// ── TRAIL ─────────────────────────────────
function buildJourneyTrail() {
  var trail = document.getElementById('journey-trail');
  if (!trail) return;
  trail.innerHTML = '';

  var t = today();
  var now = new Date();
  var year = now.getFullYear();
  var month = now.getMonth();
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  var allDays = [];
  for (var d = 1; d <= daysInMonth; d++) {
    var dd = String(d).padStart(2, '0');
    var mm = String(month + 1).padStart(2, '0');
    allDays.push(year + '-' + mm + '-' + dd);
  }

  // S-curve positions: cada grupo de 6 forma uma curva
  // left, center-left, center-right, right, center-right, center-left
  var positions = ['left', 'center', 'right', 'right', 'center', 'left'];

  // Imagens temáticas aparecem a cada 5 dias, no lado OPOSTO ao brasão
  var imgIndex = 0;
  var imgEvery = 5; // a cada 5 brasões

  for (var i = 0; i < allDays.length; i++) {
    var pos = positions[i % 6];
    var isPast = allDays[i] <= t;

    // A cada `imgEvery` dias, mostra imagem no lado oposto
    var showImg = (i > 0 && i % imgEvery === 0);
    var imgData = showImg ? TRAIL_IMAGES[imgIndex % TRAIL_IMAGES.length] : null;
    if (showImg) imgIndex++;

    trail.appendChild(buildTrailRow(allDays[i], t, pos, imgData, isPast));
  }
}

function buildTrailRow(dayKey, todayKey, pos, imgData, isPast) {
  // Wrapper que contém brasão + imagem lateral na mesma linha
  var row = document.createElement('div');
  row.className = 'trail-row';

  // Lado oposto ao brasão para a imagem
  var oppositePos = pos === 'left' ? 'right' : pos === 'right' ? 'left' : null;

  // Imagem lateral (se houver e tiver lado oposto definido)
  if (imgData && oppositePos) {
    var imgWrap = document.createElement('div');
    imgWrap.className = 'trail-scenic trail-scenic-' + oppositePos;
    var img = document.createElement('img');
    img.src = imgData.src;
    img.alt = imgData.label;
    img.className = 'trail-scenic-img' + (isPast ? '' : ' trail-image-future');
    imgWrap.appendChild(img);
    row.appendChild(imgWrap);
  }

  row.appendChild(buildTrailCoin(dayKey, todayKey, pos));
  return row;
}

function buildTrailCoin(dayKey, todayKey, pos) {
  var isToday  = dayKey === todayKey;
  var isPast   = dayKey < todayKey;
  var isFuture = dayKey > todayKey;
  var complete = isDayComplete(dayKey);
  var frozen   = isDayFrozen(dayKey);
  var weekend  = isWeekend(dayKey);

  var wrap = document.createElement('div');
  wrap.className = 'trail-step trail-' + pos;

  if (isToday) {
    var tag = document.createElement('div');
    tag.className = 'trail-today-tag';
    tag.textContent = 'hoje';
    wrap.appendChild(tag);
  }

  var coinWrap = document.createElement('div');
  coinWrap.className = 'trail-coin-wrap' + (isToday ? ' trail-coin-today' : '');

  var coin = document.createElement('img');
  coin.className = 'trail-coin';

  if (frozen) {
    coin.src = COIN_FROZEN;
  } else if (complete) {
    coin.src = weekend ? COIN_GOLD : COIN_SILVER;
  } else if (isToday) {
    coin.src = weekend ? COIN_GOLD : COIN_SILVER;
  } else {
    coin.src = COIN_SILVER;
    coin.style.opacity = '0.4';
  }

  coinWrap.appendChild(coin);

  if (complete || frozen) {
    var badge = document.createElement('img');
    badge.className = 'trail-badge';
    badge.src = frozen ? BADGE_ICE : BADGE_FIRE;
    coinWrap.appendChild(badge);
  }

  if (isPast || isToday) {
    wrap.style.cursor = 'pointer';
    (function(dk) {
      wrap.addEventListener('click', function() { openDay(dk); });
    })(dayKey);
  }

  var dateLabel = document.createElement('span');
  dateLabel.className = 'trail-date';
  dateLabel.textContent = formatDate(dayKey);

  wrap.appendChild(coinWrap);
  wrap.appendChild(dateLabel);
  return wrap;
}

// ── OPEN DAY ──────────────────────────────
function openDay(dayKey) {
  currentDayKey = dayKey;

  if (!state.days[dayKey]) {
    state.days[dayKey] = { checks: state.trainings.map(function() { return false; }), frozen: false };
    saveState();
  }

  var d = state.days[dayKey];
  while (d.checks.length < state.trainings.length) d.checks.push(false);

  var isToday = dayKey === today();
  var frozen  = isDayFrozen(dayKey);

  document.getElementById('day-title').textContent = isToday ? 'Hoje' : formatDate(dayKey);

  var mood = isToday ? computeMood(dayKey) : (isDayComplete(dayKey) ? 'Feliz' : frozen ? 'Normal' : 'Cansado');
  document.getElementById('day-mood').textContent = mood;

  renderDayTrainings(dayKey, isToday && !frozen);
  renderDayFooter(dayKey, isToday, frozen);
  showScreen('screen-day');
}

function renderDayTrainings(dayKey, editable) {
  var container = document.getElementById('day-trainings');
  container.innerHTML = '';
  var d = state.days[dayKey];

  for (var i = 0; i < state.trainings.length; i++) {
    var tr = state.trainings[i];
    var done = d.checks[i];
    var item = document.createElement('div');
    item.className = 'training-check' + (done ? ' done' : '');

    var emoji = document.createElement('span');
    emoji.className = 'tc-emoji';
    emoji.textContent = tr.emoji;

    var text = document.createElement('span');
    text.className = 'tc-text';
    text.textContent = tr.text;

    var cb = document.createElement('div');
    cb.className = 'tc-checkbox';
    cb.textContent = done ? '✓' : '';

    item.appendChild(emoji);
    item.appendChild(text);
    item.appendChild(cb);

    if (editable) {
      (function(idx) {
        item.addEventListener('click', function() { toggleCheck(dayKey, idx); });
      })(i);
    }

    container.appendChild(item);
  }
}

function renderDayFooter(dayKey, isToday, frozen) {
  var footer = document.getElementById('day-footer');
  footer.innerHTML = '';
  if (frozen) {
    footer.innerHTML = '<div class="day-status-msg day-status-frozen">❄️ Dia congelado. Drago carrega essa cicatriz.</div>';
    return;
  }
  if (isDayComplete(dayKey)) {
    footer.innerHTML = '<div class="day-status-msg day-status-complete">🔥 Drago está mais preparado para o inverno!</div>';
    return;
  }
  if (!isToday) {
    footer.innerHTML = '<div class="day-status-msg day-status-frozen">❄️ Dia congelado. Drago carrega essa cicatriz.</div>';
  }
}

// ── TOGGLE CHECK ──────────────────────────
function toggleCheck(dayKey, index) {
  state.days[dayKey].checks[index] = !state.days[dayKey].checks[index];
  saveState();
  renderDayTrainings(dayKey, dayKey === today());
  renderDayFooter(dayKey, dayKey === today(), false);
  recomputeStats();
  saveState();
  updateHomeCard();
  buildJourneyTrail();
}

// ── HOME CARD ─────────────────────────────
function updateHomeCard() {
  var stage = getCurrentStage();
  var next  = getNextTarget();
  var liquid = state.monthLiquid;

  document.getElementById('card-stage').textContent = stage.name;
  document.getElementById('card-days').textContent  = liquid + ' / ' + next + ' dias';

  var pct = Math.min((liquid / next) * 100, 100);
  document.getElementById('progress-bar').style.width = pct + '%';

  document.getElementById('badge-streak').textContent  = '🔥 ' + state.streak + ' dias';
  document.getElementById('badge-freezes').textContent = '❄️ ' + state.monthFrozen + ' dias';

  var mood = computeMood(today());
  document.getElementById('mood-message').textContent = MOOD_MESSAGES[mood] || '';
}

// ── SETUP ─────────────────────────────────
function renderSetupList() {
  var list = document.getElementById('training-list');
  list.innerHTML = '';
  for (var i = 0; i < state.trainings.length; i++) {
    var tr = state.trainings[i];
    var item = document.createElement('div');
    item.className = 'training-item';
    item.innerHTML = '<span class="t-emoji">' + tr.emoji + '</span>'
      + '<span class="t-text">' + tr.text + '</span>'
      + '<button class="t-delete" onclick="deleteTraining(' + i + ')">✕</button>';
    list.appendChild(item);
  }
}

function addTraining() {
  document.getElementById('training-emoji').value = '';
  document.getElementById('training-text').value  = '';
  document.getElementById('modal-training').classList.remove('hidden');
  setTimeout(function() { document.getElementById('training-emoji').focus(); }, 100);
}

function confirmAddTraining() {
  var emoji = document.getElementById('training-emoji').value.trim() || '🏃';
  var text  = document.getElementById('training-text').value.trim();
  if (!text) return;
  state.trainings.push({ emoji: emoji, text: text });
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

// ── SCREENS ───────────────────────────────
function showScreen(id) {
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  document.getElementById(id).classList.add('active');
}

function showHome() {
  autoFreezePastDays();
  recomputeStats();
  saveState();
  updateHomeCard();
  buildJourneyTrail();
  scrollToToday();
  showScreen('screen-home');
}

function scrollToToday() {
  setTimeout(function() {
    var trail = document.getElementById('journey-trail');
    if (!trail) return;
    // Encontra o elemento "hoje" pelo tag
    var tags = trail.querySelectorAll('.trail-today-tag');
    if (!tags.length) return;
    var todayTag = tags[0];
    var row = todayTag.closest('.trail-row');
    if (!row) return;
    var screen = document.getElementById('screen-home');
    var screenHeight = screen.clientHeight;
    var rowTop = row.offsetTop;
    var rowHeight = row.offsetHeight;
    // Rola para colocar "hoje" no centro da tela
    screen.scrollTo({ top: rowTop - (screenHeight / 2) + (rowHeight / 2), behavior: 'smooth' });
  }, 100);
}

// ── INIT ──────────────────────────────────
function init() {
  loadState();

  var t = today();
  if (!state.days[t]) {
    state.days[t] = {
      checks: state.trainings.map(function() { return false; }),
      frozen: false
    };
    saveState();
  }

  var isFirstTime = state.trainings.length === 0;

  showScreen('screen-splash');
  setTimeout(function() {
    if (isFirstTime) {
      document.getElementById('setup-back').style.display = 'none';
      renderSetupList();
      showScreen('screen-setup');
    } else {
      showHome();
    }
  }, 2200);
}

document.getElementById('modal-training').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

init();
