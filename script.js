/* NovaTab — vanilla JS. All state lives in localStorage; no external dependencies. */
(() => {
  'use strict';

  /* ---------- Helpers ---------- */
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const dateKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const cleanStr = (v, fallback, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : fallback);
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);

  const KEYS = {
    prefs: 'novatab.prefs',
    shortcuts: 'novatab.shortcuts',
    tasks: 'novatab.tasks',
    notes: 'novatab.notes'
  };

  /** Safe JSON read: returns fallback on missing/corrupt/invalid data. */
  function readJSON(key, fallback, isValid) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const value = JSON.parse(raw);
      return isValid(value) ? value : fallback;
    } catch (e) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { toast('Couldn’t save — browser storage may be full or blocked.'); return false; }
  }

  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    $('#toasts').append(el);
    setTimeout(() => el.remove(), 3800);
  }

  function openExternal(url) { window.open(url, '_blank', 'noopener,noreferrer'); }

  /** Returns a normalized http(s) URL string, or null if input isn't a valid web address. */
  function toHttpUrl(input) {
    let s = String(input).trim();
    if (!s || /\s/.test(s)) return null;
    if (!/^https?:\/\//i.test(s)) {
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(javascript|data|vbscript|file|mailto|blob|about):/i.test(s)) return null;
      s = 'https://' + s;
    }
    try {
      const u = new URL(s);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      if (!/^([a-z0-9-]+\.)+[a-z0-9-]{2,}$/i.test(u.hostname)) return null;
      return u.href;
    } catch (e) { return null; }
  }

  /** Promise-based confirmation dialog. */
  function confirmAction(message, okLabel) {
    return new Promise((resolve) => {
      const dlg = $('#confirmDlg');
      $('#confirmMsg').textContent = message;
      $('#confirmOk').textContent = okLabel || 'Confirm';
      dlg.returnValue = '';
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
      dlg.showModal();
    });
  }

  /* Close dialogs on backdrop click or [data-close] buttons (Escape is native). */
  $$('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
    dlg.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => dlg.close()));
  });

  /* ---------- Preferences ---------- */
  const THEMES = ['violet', 'cyan', 'rose', 'amber'];
  const ENGINES = {
    google:     { label: 'Google',     url: 'https://www.google.com/search?q=' },
    bing:       { label: 'Bing',       url: 'https://www.bing.com/search?q=' },
    duckduckgo: { label: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
    youtube:    { label: 'YouTube',    url: 'https://www.youtube.com/results?search_query=' }
  };
  const DEFAULT_PREFS = { name: 'Friend', subtitle: 'A little focus goes a long way', engine: 'google', city: 'London', theme: 'violet' };

  function loadPrefs() {
    const p = readJSON(KEYS.prefs, {}, isObj);
    return {
      name: cleanStr(p.name, DEFAULT_PREFS.name, 30),
      subtitle: typeof p.subtitle === 'string' ? p.subtitle.trim().slice(0, 60) : DEFAULT_PREFS.subtitle,
      engine: ENGINES[p.engine] ? p.engine : DEFAULT_PREFS.engine,
      city: cleanStr(p.city, DEFAULT_PREFS.city, 60),
      theme: THEMES.includes(p.theme) ? p.theme : DEFAULT_PREFS.theme
    };
  }
  let prefs = loadPrefs();
  const savePrefs = () => writeJSON(KEYS.prefs, prefs);

  function fillEngineSelect(sel) {
    sel.replaceChildren();
    Object.entries(ENGINES).forEach(([key, e]) => {
      const o = document.createElement('option');
      o.value = key; o.textContent = e.label;
      sel.append(o);
    });
  }
  fillEngineSelect($('#engine'));
  fillEngineSelect($('#setEngine'));

  function applyPrefs() {
    document.documentElement.dataset.theme = prefs.theme;
    $('#greetName').textContent = prefs.name;
    $('#subtitle').textContent = prefs.subtitle;
    $('#subtitle').hidden = !prefs.subtitle;
    $('#engine').value = prefs.engine;
    const initials = prefs.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => Array.from(w)[0].toUpperCase()).join('');
    $('#initials').textContent = initials || 'N';
  }

  $('#themeBtn').addEventListener('click', () => {
    prefs.theme = THEMES[(THEMES.indexOf(prefs.theme) + 1) % THEMES.length];
    savePrefs(); applyPrefs();
    toast(`Theme: ${prefs.theme[0].toUpperCase() + prefs.theme.slice(1)}`);
  });

  /* ---------- Clock & greeting ---------- */
  function greetingFor(h) {
    if (h >= 5 && h < 12) return 'Good morning,';
    if (h >= 12 && h < 17) return 'Good afternoon,';
    if (h >= 17 && h < 22) return 'Good evening,';
    return 'Burning the midnight oil,';
  }
  function tickClock() {
    const d = new Date();
    const h = d.getHours();
    $('#clockTime').textContent = `${pad(h % 12 || 12)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    $('#clockMeridiem').textContent = h < 12 ? 'AM' : 'PM';
    $('#date').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    $('#greetText').textContent = greetingFor(h);
    ensureToday(); // start a fresh task list when the local date changes
  }

  /* ---------- Search ---------- */
  $('#searchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('#query').value.trim();
    if (!q) { toast('Type something to search.'); $('#query').focus(); return; }
    const direct = toHttpUrl(q);
    openExternal(direct || ENGINES[$('#engine').value].url + encodeURIComponent(q));
    $('#query').value = '';
  });
  $('#engine').addEventListener('change', (e) => { prefs.engine = e.target.value; savePrefs(); });
  document.addEventListener('keydown', (e) => {
    const tag = document.activeElement && document.activeElement.tagName;
    if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) { e.preventDefault(); $('#query').focus(); }
  });

  /* ---------- Shortcuts ---------- */
  const MAX_SHORTCUTS = 18;
  const DEFAULT_SHORTCUTS = [
    { id: 'd-yt', name: 'YouTube', url: 'https://www.youtube.com/', color: '#e11d48' },
    { id: 'd-gm', name: 'Gmail', url: 'https://mail.google.com/', color: '#dc2626' },
    { id: 'd-dr', name: 'Google Drive', url: 'https://drive.google.com/', color: '#16a34a' },
    { id: 'd-gp', name: 'ChatGPT', url: 'https://chatgpt.com/', color: '#0f9d7a' },
    { id: 'd-gh', name: 'GitHub', url: 'https://github.com/', color: '#6e7681' },
    { id: 'd-wp', name: 'Wikipedia', url: 'https://en.wikipedia.org/', color: '#0284c7' }
  ];
  const colorFor = (name) => {
    let h = 0;
    for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
    return `hsl(${h} 60% 40%)`;
  };
  function loadShortcuts() {
    const list = readJSON(KEYS.shortcuts, null, Array.isArray);
    if (!list) return DEFAULT_SHORTCUTS.map((s) => ({ ...s }));
    return list.filter(isObj).map((s) => {
      const url = toHttpUrl(s.url || '');
      const name = cleanStr(s.name, '', 24);
      if (!url || !name) return null;
      const color = typeof s.color === 'string' && /^(#[0-9a-f]{3,8}|hsl\([\d\s%.,]+\))$/i.test(s.color) ? s.color : colorFor(name);
      return { id: cleanStr(s.id, uid(), 40), name, url, color };
    }).filter(Boolean).slice(0, MAX_SHORTCUTS);
  }
  let shortcuts = loadShortcuts();
  const saveShortcuts = () => writeJSON(KEYS.shortcuts, shortcuts);

  function renderShortcuts() {
    const grid = $('#shortcutGrid');
    grid.replaceChildren();
    shortcuts.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'shortcut';
      const a = document.createElement('a');
      a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      const icon = document.createElement('span');
      icon.className = 'sc-icon'; icon.style.background = s.color; icon.textContent = Array.from(s.name)[0].toUpperCase();
      icon.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'sc-name'; label.textContent = s.name;
      a.append(icon, label);
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'sc-remove'; rm.textContent = '×';
      rm.setAttribute('aria-label', `Remove ${s.name}`);
      rm.addEventListener('click', () => {
        shortcuts = shortcuts.filter((x) => x.id !== s.id);
        saveShortcuts(); renderShortcuts(); toast(`${s.name} removed`);
      });
      item.append(a, rm);
      grid.append(item);
    });
    const add = document.createElement('button');
    add.type = 'button'; add.className = 'sc-add';
    add.innerHTML = '<span class="sc-icon" aria-hidden="true"><svg class="ic"><use href="#i-plus"/></svg></span><span class="sc-name">Add shortcut</span>';
    add.addEventListener('click', () => {
      if (shortcuts.length >= MAX_SHORTCUTS) { toast(`You can have up to ${MAX_SHORTCUTS} shortcuts.`); return; }
      $('#shortcutForm').reset(); $('#scError').textContent = '';
      $('#shortcutDlg').showModal(); $('#scName').focus();
    });
    grid.append(add);
  }

  $('#shortcutForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#scName').value.trim();
    const url = toHttpUrl($('#scUrl').value);
    const err = $('#scError');
    if (!name) { err.textContent = 'Please enter a name.'; $('#scName').focus(); return; }
    if (!url) { err.textContent = 'Enter a valid http:// or https:// website address.'; $('#scUrl').focus(); return; }
    shortcuts.push({ id: uid(), name: name.slice(0, 24), url, color: colorFor(name) });
    saveShortcuts(); renderShortcuts();
    $('#shortcutDlg').close();
    toast(`${name} added`);
  });

  /* ---------- Focus timer ---------- */
  const MODES = {
    '25': { secs: 1500, type: 'focus' }, '45': { secs: 2700, type: 'focus' },
    '60': { secs: 3600, type: 'focus' }, 'break': { secs: 300, type: 'break' }
  };
  const CIRC = 2 * Math.PI * 52;
  const ring = $('#timerRing');
  ring.style.strokeDasharray = CIRC;
  let mode = '25', total = MODES[mode].secs, remaining = total, endAt = 0, timerId = null, finished = false;

  const fmt = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  function renderTimer() {
    const running = timerId !== null;
    $('#timerTime').textContent = fmt(remaining);
    ring.style.strokeDashoffset = CIRC * (1 - remaining / total);
    const label = MODES[mode].type === 'break' ? 'Break' : 'Focus';
    $('#timerStatus').textContent = finished ? 'Complete' : running ? `${label} · running` : remaining < total ? `${label} · paused` : `${label} · ready`;
    $('#timerToggle').textContent = running ? 'Pause' : (remaining < total && remaining > 0 ? 'Resume' : 'Start');
    document.title = running ? `${fmt(remaining)} · NovaTab` : 'NovaTab';
    $$('.mode').forEach((b) => {
      const on = b.dataset.mode === mode;
      b.classList.toggle('active', on); b.setAttribute('aria-pressed', String(on));
    });
  }
  function stopTimer() { if (timerId !== null) { clearInterval(timerId); timerId = null; } }
  function timerTick() {
    remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    if (remaining <= 0) { completeTimer(); return; }
    renderTimer();
  }
  function startTimer() {
    if (timerId !== null) return; // never run two intervals
    if (remaining <= 0) remaining = total;
    finished = false;
    endAt = Date.now() + remaining * 1000;
    timerId = setInterval(timerTick, 250);
    renderTimer();
  }
  function pauseTimer() {
    remaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    stopTimer(); renderTimer();
  }
  function resetTimer() { stopTimer(); finished = false; remaining = total; renderTimer(); }
  function setMode(m) { stopTimer(); finished = false; mode = m; total = remaining = MODES[m].secs; renderTimer(); }
  function completeTimer() {
    stopTimer(); remaining = 0; finished = true; renderTimer();
    const msg = MODES[mode].type === 'break' ? 'Break over — ready to focus?' : 'Focus session complete. Take a break!';
    toast(msg);
    if ('Notification' in window && Notification.permission === 'granted') {
      try { new Notification('NovaTab', { body: msg }); } catch (e) { /* ignore */ }
    }
  }
  $('#timerToggle').addEventListener('click', () => (timerId !== null ? pauseTimer() : startTimer()));
  $('#timerReset').addEventListener('click', resetTimer);
  $$('.mode').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  const notifyBtn = $('#notifyBtn');
  if ('Notification' in window && Notification.permission === 'default') {
    notifyBtn.hidden = false;
    notifyBtn.addEventListener('click', async () => {
      try {
        const res = await Notification.requestPermission();
        toast(res === 'granted' ? 'Notifications enabled.' : 'Notifications weren’t enabled.');
      } catch (e) { toast('Notifications aren’t available here.'); }
      notifyBtn.hidden = Notification.permission !== 'default';
    });
  }

  /* ---------- Daily tasks ---------- */
  const MAX_TASKS = 30;
  function freshTasks() { return { date: dateKey(), items: [] }; }
  function loadTasks() {
    const t = readJSON(KEYS.tasks, null, (v) => isObj(v) && typeof v.date === 'string' && Array.isArray(v.items));
    if (!t || t.date !== dateKey()) return freshTasks();
    return {
      date: t.date,
      items: t.items.filter((i) => isObj(i) && typeof i.text === 'string' && i.text.trim())
        .map((i) => ({ id: cleanStr(i.id, uid(), 40), text: i.text.trim().slice(0, 120), done: i.done === true }))
        .slice(0, MAX_TASKS)
    };
  }
  let tasks = loadTasks();
  const saveTasks = () => writeJSON(KEYS.tasks, tasks);

  function ensureToday() {
    if (tasks.date !== dateKey()) { tasks = freshTasks(); saveTasks(); renderTasks(); }
  }
  function renderTasks() {
    const list = $('#taskList');
    list.replaceChildren();
    tasks.items.forEach((t) => {
      const li = document.createElement('li');
      li.className = t.done ? 'done' : '';
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = t.done; cb.id = 'task-' + t.id;
      cb.addEventListener('change', () => { t.done = cb.checked; saveTasks(); renderTasks(); });
      const label = document.createElement('label');
      label.className = 't-text'; label.htmlFor = cb.id; label.textContent = t.text;
      const del = document.createElement('button');
      del.type = 'button'; del.className = 't-del'; del.textContent = '×';
      del.setAttribute('aria-label', `Delete task: ${t.text}`);
      del.addEventListener('click', () => { tasks.items = tasks.items.filter((x) => x.id !== t.id); saveTasks(); renderTasks(); });
      li.append(cb, label, del);
      list.append(li);
    });
    const total = tasks.items.length, done = tasks.items.filter((t) => t.done).length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    $('#taskStats').textContent = `${done} of ${total} · ${pct}%`;
    $('#taskBar').style.width = pct + '%';
    $('#taskProgress').setAttribute('aria-valuenow', String(pct));
    $('#taskEmpty').hidden = total > 0;
    $('#taskSuccess').hidden = !(total > 0 && done === total);
  }
  $('#taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    ensureToday();
    const input = $('#taskInput');
    const text = input.value.trim();
    if (!text) { toast('Write a task first.'); input.focus(); return; }
    if (tasks.items.length >= MAX_TASKS) { toast(`Limit reached: ${MAX_TASKS} tasks per day.`); return; }
    tasks.items.push({ id: uid(), text: text.slice(0, 120), done: false });
    saveTasks(); renderTasks(); input.value = ''; input.focus();
  });

  /* ---------- Quick notes ---------- */
  const notesEl = $('#notes');
  let noteTimer = null;
  function loadNotes() {
    try { const v = localStorage.getItem(KEYS.notes); return typeof v === 'string' ? v.slice(0, 2000) : ''; }
    catch (e) { return ''; }
  }
  function updateNoteCount() { $('#noteCount').textContent = notesEl.value.length; }
  notesEl.addEventListener('input', () => {
    updateNoteCount();
    $('#noteStatus').textContent = 'Saving…';
    clearTimeout(noteTimer);
    noteTimer = setTimeout(() => {
      try { localStorage.setItem(KEYS.notes, notesEl.value); $('#noteStatus').textContent = 'Saved'; }
      catch (e) { $('#noteStatus').textContent = 'Not saved'; toast('Couldn’t save notes.'); }
    }, 400);
  });
  window.addEventListener('beforeunload', () => { try { localStorage.setItem(KEYS.notes, notesEl.value); } catch (e) { /* ignore */ } });

  /* ---------- Weather (Open-Meteo) ---------- */
  const WX = {
    0: ['Clear sky', '☀️'], 1: ['Mainly clear', '🌤️'], 2: ['Partly cloudy', '⛅'], 3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'], 48: ['Freezing fog', '🌫️'],
    51: ['Light drizzle', '🌦️'], 53: ['Drizzle', '🌦️'], 55: ['Heavy drizzle', '🌧️'], 56: ['Freezing drizzle', '🌧️'], 57: ['Freezing drizzle', '🌧️'],
    61: ['Light rain', '🌧️'], 63: ['Rain', '🌧️'], 65: ['Heavy rain', '🌧️'], 66: ['Freezing rain', '🌧️'], 67: ['Freezing rain', '🌧️'],
    71: ['Light snow', '❄️'], 73: ['Snow', '❄️'], 75: ['Heavy snow', '❄️'], 77: ['Snow grains', '❄️'],
    80: ['Light showers', '🌦️'], 81: ['Showers', '🌧️'], 82: ['Heavy showers', '⛈️'], 85: ['Snow showers', '🌨️'], 86: ['Heavy snow showers', '🌨️'],
    95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm with hail', '⛈️'], 99: ['Severe thunderstorm', '⛈️']
  };
  async function fetchJson(url) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 10000);
    try {
      const res = await fetch(url, { signal: ctl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(t); }
  }
  function setWx(state, msg) {
    $('#wxLoading').hidden = state !== 'loading';
    $('#wxError').hidden = state !== 'error';
    $('#wxBody').hidden = state !== 'ok';
    if (state === 'error') $('#wxError').textContent = msg;
  }
  let wxRequest = 0;
  async function loadWeather() {
    const id = ++wxRequest;
    const city = prefs.city;
    setWx('loading');
    if (!navigator.onLine) { setWx('error', 'You appear to be offline. Weather needs an internet connection.'); return; }
    try {
      const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
      if (id !== wxRequest) return;
      const place = geo.results && geo.results[0];
      if (!place) { setWx('error', `Couldn’t find “${city}”. Check the spelling in Settings.`); return; }
      const w = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m&wind_speed_unit=kmh&timezone=auto`);
      if (id !== wxRequest) return;
      const c = w.current;
      if (!c) throw new Error('No data');
      const [desc, icon] = WX[c.weather_code] || ['Unknown conditions', '🌡️'];
      $('#wxIcon').textContent = icon;
      $('#wxTemp').textContent = `${Math.round(c.temperature_2m)}°C`;
      $('#wxDesc').textContent = desc;
      $('#wxPlace').textContent = [place.name, place.country].filter(Boolean).join(', ');
      $('#wxFeels').textContent = `${Math.round(c.apparent_temperature)}°C`;
      $('#wxHumidity').textContent = `${Math.round(c.relative_humidity_2m)}%`;
      $('#wxWind').textContent = `${Math.round(c.wind_speed_10m)} km/h`;
      setWx('ok');
    } catch (e) {
      if (id !== wxRequest) return;
      setWx('error', 'Weather is unavailable right now. Please check your connection and try again.');
    }
  }
  $('#wxRefresh').addEventListener('click', loadWeather);
  window.addEventListener('online', loadWeather);

  /* ---------- Quotes ---------- */
  const QUOTES = [
    ['Well begun is half done.', 'Aristotle'],
    ['The journey of a thousand miles begins with a single step.', 'Lao Tzu'],
    ['Do what you can, with what you have, where you are.', 'Theodore Roosevelt'],
    ['Quality is not an act, it is a habit.', 'Will Durant'],
    ['Small deeds done are better than great deeds planned.', 'Peter Marshall'],
    ['Energy and persistence conquer all things.', 'Benjamin Franklin'],
    ['The best way out is always through.', 'Robert Frost'],
    ['What we do every day matters more than what we do once in a while.', 'Gretchen Rubin'],
    ['Concentrate all your thoughts upon the work at hand.', 'Alexander Graham Bell'],
    ['You don’t have to see the whole staircase, just take the first step.', 'Martin Luther King Jr.']
  ];
  let lastQuote = -1;
  function showQuote() {
    let i;
    do { i = Math.floor(Math.random() * QUOTES.length); } while (i === lastQuote && QUOTES.length > 1);
    lastQuote = i;
    $('#quoteText').textContent = QUOTES[i][0];
    $('#quoteAuthor').textContent = QUOTES[i][1];
  }
  $('#quoteBtn').addEventListener('click', showQuote);

  /* ---------- Settings ---------- */
  const settingsDlg = $('#settingsDlg');
  function openSettings() {
    $('#setName').value = prefs.name;
    $('#setSubtitle').value = prefs.subtitle;
    $('#setEngine').value = prefs.engine;
    $('#setCity').value = prefs.city;
    $('#setError').textContent = '';
    settingsDlg.showModal();
    $('#setName').focus();
  }
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#profileBtn').addEventListener('click', openSettings);

  $('#settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#setName').value.trim();
    const city = $('#setCity').value.trim();
    const err = $('#setError');
    if (!name) { err.textContent = 'Please enter your name.'; $('#setName').focus(); return; }
    if (!city) { err.textContent = 'Please enter a city for the weather widget.'; $('#setCity').focus(); return; }
    const cityChanged = city.toLowerCase() !== prefs.city.toLowerCase();
    prefs = { ...prefs, name: name.slice(0, 30), subtitle: $('#setSubtitle').value.trim().slice(0, 60), engine: $('#setEngine').value, city: city.slice(0, 60) };
    savePrefs(); applyPrefs();
    settingsDlg.close();
    toast('Settings saved');
    if (cityChanged) loadWeather();
  });

  $('#resetBtn').addEventListener('click', async () => {
    const ok = await confirmAction('Delete all saved NovaTab data (settings, shortcuts, tasks and notes) from this browser? This can’t be undone.', 'Delete everything');
    if (!ok) return;
    Object.values(KEYS).forEach((k) => { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } });
    prefs = loadPrefs(); shortcuts = loadShortcuts(); tasks = loadTasks();
    notesEl.value = ''; updateNoteCount(); $('#noteStatus').textContent = 'Saved';
    applyPrefs(); renderShortcuts(); renderTasks(); loadWeather();
    settingsDlg.close();
    toast('All local data deleted');
  });

  /* ---------- Init ---------- */
  applyPrefs();
  renderShortcuts();
  renderTasks();
  notesEl.value = loadNotes();
  updateNoteCount();
  renderTimer();
  showQuote();
  tickClock();
  setInterval(tickClock, 1000);
  loadWeather();
})();
