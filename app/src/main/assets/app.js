const $ = (s) => document.querySelector(s), $$ = (s) => [...document.querySelectorAll(s)];
const ACCENTS = ['#ff2d4d', '#ff6a2d', '#ffc83d', '#3ddc97', '#38bdf8', '#a78bfa', '#ff5fb0', '#f2eef0'];
const SHAPES = { squircle: '30%', round: '50%', square: '9px' };
const DEF = { dock: null, home: null, hidden: [], accent: ACCENTS[0], cols: 4, rows: 5, dim: 55, glow: 50, shape: 'squircle', isize: 52, labels: true, h24: false, hap: true, pets: 0, fdone: { d: '', n: 0 }, wx: true, units: 'imperial', wxloc: null, wxc: null, shift: { on: true, days: [3, 4, 5, 6], s: '07:30', e: '18:00' }, ww: true, wf: true, wn: true, fmin: 25, note: '' };
let apps = [], prefs = { ...DEF, hidden: [] }, query = '', pages = 1, fl = 0, fr = false, fi = null;
const find = (id) => apps.find((a) => a.id === id);
const iconUrl = (id) => 'https://odium.icon/?id=' + encodeURIComponent(id);
const savePrefs = () => { try { Odium.setPrefs(JSON.stringify(prefs)); } catch (e) {} };
const body = document.body;

function applyPrefs() {
  const r = document.documentElement.style, p = prefs;
  r.setProperty('--accent', p.accent); r.setProperty('--cols', p.cols); r.setProperty('--scrim', p.dim / 100);
  r.setProperty('--glow', p.glow / 100); r.setProperty('--ir', SHAPES[p.shape] || '30%'); r.setProperty('--is', p.isize + 'px');
  body.classList.toggle('nolabels', !p.labels);
  $('#w-week').hidden = !p.ww; $('#w-focus').hidden = !p.wf; $('#w-note').hidden = !p.wn; $('#w-wx').hidden = !p.wx;
}

// ---------- apps ----------
function refreshApps() {
  apps = JSON.parse(Odium.apps()).sort((a, b) => a.n.localeCompare(b.n, undefined, { sensitivity: 'base' }));
  if (!prefs.dock) { prefs.dock = JSON.parse(Odium.defaultDock()); savePrefs(); }
  if (!prefs.home) { prefs.home = apps.filter((a) => !prefs.dock.includes(a.id)).slice(0, prefs.cols * prefs.rows).map((a) => a.id); savePrefs(); }
  tick(); renderAll();
  if (!prefs.wxc || Date.now() - prefs.wxc.t > 9e5) loadWx(); else renderWx();
}
window.odiumApps = refreshApps;
function renderAll() { renderDock(); renderGrid(); renderHome(); renderTiles(); if (body.classList.contains('set-open')) renderSettings(); }

function appEl(a) {
  const d = document.createElement('div');
  d.className = 'app'; d.dataset.id = a.id;
  d.innerHTML = '<img loading="lazy" alt=""><span></span>';
  d.firstChild.src = iconUrl(a.id); d.lastChild.textContent = a.n;
  return d;
}
function renderDock() { $('#dock').replaceChildren(...prefs.dock.map(find).filter(Boolean).map(appEl)); }
function renderGrid() {
  const q = query.trim().toLowerCase();
  const list = apps.filter((a) => !prefs.hidden.includes(a.id) && (!q || a.n.toLowerCase().includes(q)));
  $('#app-count').textContent = `${list.length} app${list.length === 1 ? '' : 's'}`;
  if (!list.length) { $('#grid').innerHTML = '<div id="empty">No apps match. Try another search.</div>'; return; }
  $('#grid').replaceChildren(...list.map(appEl));
}
function renderHome() {
  const per = prefs.cols * prefs.rows, list = prefs.home.map(find).filter((a) => a && !prefs.hidden.includes(a.id));
  const n = Math.max(1, Math.ceil(list.length / per));
  $$('#pager .apps').forEach((e) => e.remove());
  for (let i = 0; i < n; i++) {
    const s = document.createElement('section'), g = document.createElement('div'), part = list.slice(i * per, (i + 1) * per);
    s.className = 'page apps'; g.className = 'pg';
    if (part.length) g.append(...part.map(appEl));
    else g.innerHTML = '<p class="none">Nothing on this page yet.<br>Hold an app in All apps and choose Add to home.</p>';
    s.append(g); $('#pager').append(s);
  }
  pages = n + 2; renderDots();
}
function renderDots() {
  const p = $('#pager'), d = $('#dots'), i = Math.round(p.scrollLeft / (p.clientWidth || 1));
  if (d.children.length !== pages) d.innerHTML = '<i></i>'.repeat(pages);
  [...d.children].forEach((e, k) => e.classList.toggle('on', k === i));
}
$('#pager').addEventListener('scroll', () => requestAnimationFrame(renderDots));

function launch(id) { Odium.launch(id); setTimeout(closeDrawer, 250); }

// ---------- tap / long-press ----------
function pressable(root) {
  let timer = null, sx = 0, sy = 0, long = false;
  const moved = (e) => Math.hypot(e.clientX - sx, e.clientY - sy) > 10;
  root.addEventListener('pointerdown', (e) => {
    const a = e.target.closest('.app'); if (!a) return;
    sx = e.clientX; sy = e.clientY; long = false; clearTimeout(timer);
    timer = setTimeout(() => { long = true; appMenu(a.dataset.id); }, 450);
  });
  root.addEventListener('pointermove', (e) => { if (moved(e)) clearTimeout(timer); });
  root.addEventListener('pointercancel', () => clearTimeout(timer));
  root.addEventListener('pointerup', (e) => {
    clearTimeout(timer);
    const a = e.target.closest('.app');
    if (a && !long && !moved(e)) launch(a.dataset.id);
  });
  root.addEventListener('contextmenu', (e) => e.preventDefault());
}
['#pager', '#grid', '#dock'].forEach((s) => pressable($(s)));

// ---------- app menu sheet ----------
function closeSheet() { body.classList.remove('sheet-open'); }
$('#sheet-bg').addEventListener('click', closeSheet);
function appMenu(id) {
  const a = find(id); if (!a) return;
  const pin = prefs.dock.includes(id), onHome = prefs.home.includes(id);
  const rows = [
    pin ? ['Remove from dock', () => { prefs.dock = prefs.dock.filter((x) => x !== id); }]
        : prefs.dock.length < 5 ? ['Add to dock', () => { prefs.dock = [...prefs.dock, id]; }] : 0,
    onHome ? ['Remove from home', () => { prefs.home = prefs.home.filter((x) => x !== id); }]
           : ['Add to home', () => { prefs.home = [...prefs.home, id]; }],
    ['Hide app', () => { prefs.hidden = [...prefs.hidden, id]; prefs.dock = prefs.dock.filter((x) => x !== id); }],
    ['App info', () => Odium.appInfo(id), 1],
    ['Uninstall', () => Odium.uninstall(id), 1, 'danger'],
  ].filter(Boolean);
  $('#sheet').innerHTML = `<div class="sht"><img src="${iconUrl(id)}" alt=""><b></b></div>` +
    rows.map((r, i) => `<div class="mr ${r[3] || ''}" data-i="${i}">${r[0]}</div>`).join('');
  $('.sht b').textContent = a.n;
  $('#sheet').onclick = (e) => {
    const row = e.target.closest('.mr'); if (!row) return;
    const r = rows[+row.dataset.i];
    r[1]();
    if (!r[2]) { savePrefs(); renderAll(); }
    closeSheet();
  };
  buzz(); body.classList.add('sheet-open');
}

// ---------- settings ----------
const SET = [
  ['Appearance', [
    { k: 'accent', t: 'sw', l: 'Accent color' },
    { k: 'shape', t: 'seg', l: 'Icon shape', o: [['squircle', 'Squircle'], ['round', 'Circle'], ['square', 'Square']] },
    { k: 'isize', t: 'rng', l: 'Icon size', min: 40, max: 62, u: 'px' },
    { k: 'labels', t: 'tog', l: 'App labels', s: 'Show names under home icons' },
    { k: 'glow', t: 'rng', l: 'Accent glow', min: 0, max: 100, u: '%' },
    { k: 'dim', t: 'rng', l: 'Wallpaper dim', min: 0, max: 90, u: '%' }]],
  ['Home', [
    { k: 'cols', t: 'seg', l: 'Columns', o: [[4, '4'], [5, '5']] },
    { k: 'rows', t: 'seg', l: 'Rows', o: [[4, '4'], [5, '5'], [6, '6']] },
    { k: 'h24', t: 'tog', l: '24-hour clock' },
    { k: 'hap', t: 'tog', l: 'Haptic feedback', s: 'Buzz on long-press and pets' },
    { k: 'ww', t: 'tog', l: 'Week strip' },
    { k: 'wf', t: 'tog', l: 'Focus timer' },
    { k: 'fmin', t: 'seg', l: 'Focus length', o: [[15, '15m'], [25, '25m'], [45, '45m'], [60, '60m']] },
    { k: 'wn', t: 'tog', l: 'Quick note' }]],
  ['Weather', [{ k: 'wx', t: 'tog', l: 'Weather widget', s: 'Tap it to open Odium Weather' }, { t: 'loc' }, { k: 'units', t: 'seg', l: 'Units', o: [['imperial', '°F'], ['metric', '°C']] }]],
  ['Work', [{ k: 'shift.on', t: 'tog', l: 'Shift status', s: 'Countdown on the dashboard' }, { t: 'days', l: 'Work days' }, { t: 'time', l: 'Hours' }]],
  ['Apps', [{ t: 'hid' }, { t: 'act', id: 'rh', l: 'Reset home pages', s: 'Rebuild from your installed apps' }]],
  ['System', [
    { t: 'act', id: 'dl', l: 'Set as default launcher', s: 'Make Odium your Home app' },
    { t: 'act', id: 'ra', l: 'Reset all settings', danger: 1 }]],
];
const CHEV = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
function row(it) {
  const v = get(it.k), lab = `<div class="rl"><b>${it.l || ''}</b>${it.s ? `<small>${it.s}</small>` : ''}</div>`;
  if (it.t === 'tog') return `<div class="row" data-t="tog" data-k="${it.k}">${lab}<i class="tg ${v ? 'on' : ''}"></i></div>`;
  if (it.t === 'seg') return `<div class="row">${lab}<div class="seg">${it.o.map(([x, n]) => `<b class="${x == v ? 'on' : ''}" data-k="${it.k}" data-v="${x}">${n}</b>`).join('')}</div></div>`;
  if (it.t === 'rng') return `<div class="row col">${lab}<div class="rg"><input type="range" data-k="${it.k}" data-u="${it.u}" min="${it.min}" max="${it.max}" value="${v}"><output>${v}${it.u}</output></div></div>`;
  if (it.t === 'sw') return `<div class="row col">${lab}<div class="sws">${ACCENTS.map((c) => `<i class="sw ${c === v ? 'on' : ''}" data-k="accent" data-v="${c}" style="background:${c}"></i>`).join('')}</div></div>`;
  if (it.t === 'days') return `<div class="row col">${lab}<div class="seg days">${'SMTWTFS'.split('').map((n, i) => `<b class="${prefs.shift.days.includes(i) ? 'on' : ''}" data-d="${i}">${n}</b>`).join('')}</div></div>`;
  if (it.t === 'time') return `<div class="row col">${lab}<div class="tm"><input type="time" data-k="shift.s" value="${prefs.shift.s}"><span>to</span><input type="time" data-k="shift.e" value="${prefs.shift.e}"></div></div>`;
  if (it.t === 'loc') return `<div class="row col"><div class="rl"><b>Location</b><small>${prefs.wxloc ? esc(prefs.wxloc.n) : 'Not set'}</small></div><div class="lq"><input id="lq" type="text" placeholder="Search city" autocomplete="off" value="${esc(locQ)}"><button class="btn pri" data-act="ls">Search</button></div>${locRes.map((r, i) => `<div class="hid" data-loc="${i}"><span class="hn">${esc(r.name)}${r.admin1 ? ', ' + esc(r.admin1) : ''}${r.country ? ', ' + esc(r.country) : ''}</span><u>Use</u></div>`).join('')}</div>`;
  if (it.t === 'hid') {
    const h = prefs.hidden.map(find).filter(Boolean);
    return `<div class="row col"><div class="rl"><b>Hidden apps</b><small>${h.length ? h.length + ' hidden from All apps' : 'Nothing hidden'}</small></div>` +
      h.map((a) => `<div class="hid"><img src="${iconUrl(a.id)}" alt=""><span class="hn" data-n="${a.id}"></span><u data-unhide="${a.id}">Unhide</u></div>`).join('') + '</div>';
  }
  return `<div class="row act ${it.danger ? 'danger' : ''}" data-act="${it.id}">${lab}${CHEV}</div>`;
}
function renderSettings() {
  const b = $('#sbody'), y = b.scrollTop;
  b.innerHTML = `<div class="prev">${(prefs.dock || []).slice(0, 5).map((id) => `<img src="${iconUrl(id)}" alt="">`).join('')}</div>` +
    SET.map(([h, items]) => `<h4>${h}</h4><div class="grp">${items.map(row).join('')}</div>`).join('') + '<p class="ver">Odium Launcher 1.3</p>';
  $$('#sbody .hn').forEach((e) => (e.textContent = find(e.dataset.n).n));
  b.scrollTop = y;
}
const get = (k) => { if (!k) return undefined; const [a, b] = k.split('.'); return b ? (prefs[a] || {})[b] : prefs[k]; };
function set(k, v) {
  if (k.includes('.')) { const [a, b] = k.split('.'); prefs[a] = { ...prefs[a], [b]: v }; } else prefs[k] = v;
  if (k === 'units') { prefs.wxc = null; loadWx(); }
  if (k === 'fmin') { clearInterval(fi); fr = false; fl = v * 60; }
  applyPrefs(); savePrefs(); tick(); renderFocus(); renderAll();
}
$('#sbody').addEventListener('click', (e) => {
  const t = e.target, u = t.closest('[data-unhide]'), a = t.closest('[data-act]'), g = t.closest('[data-t="tog"]'), d = t.closest('[data-v]');
  if (u) { prefs.hidden = prefs.hidden.filter((x) => x !== u.dataset.unhide); savePrefs(); renderAll(); }
  else if (t.closest('[data-loc]')) pickLoc(+t.closest('[data-loc]').dataset.loc);
  else if (t.closest('[data-d]')) toggleDay(+t.closest('[data-d]').dataset.d);
  else if (a) {
    const id = a.dataset.act;
    if (id === 'dl') Odium.chooseLauncher();
    else if (id === 'ls') searchLoc();
    else if (id === 'rh') { prefs.home = null; savePrefs(); refreshApps(); }
    else if (!a.dataset.arm) { a.dataset.arm = 1; a.querySelector('b').textContent = 'Tap again to reset everything'; setTimeout(renderSettings, 3000); }
    else { prefs = { ...DEF, hidden: [] }; $('#note').value = ''; fl = prefs.fmin * 60; applyPrefs(); savePrefs(); refreshApps(); renderFocus(); }
  }
  else if (g) set(g.dataset.k, !get(g.dataset.k));
  else if (d) { const n = +d.dataset.v; set(d.dataset.k, d.dataset.v !== '' && !isNaN(n) ? n : d.dataset.v); }
});
$('#sbody').addEventListener('input', (e) => {
  const t = e.target; if (t.type !== 'range') return;
  prefs[t.dataset.k] = +t.value; applyPrefs();
  t.parentNode.querySelector('output').textContent = t.value + t.dataset.u;
});
$('#sbody').addEventListener('change', (e) => { const t = e.target; if (t.type === 'range') savePrefs(); else if (t.type === 'time' && t.value) set(t.dataset.k, t.value); });
$('#sbody').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'lq') { e.preventDefault(); searchLoc(); } });
function openSettings() { closeSheet(); renderSettings(); body.classList.add('set-open'); }
function closeSettings() { body.classList.remove('set-open'); }
$('#gear').addEventListener('click', openSettings);
$('#sback').addEventListener('click', closeSettings);

// ---------- drawer ----------
function openDrawer() { body.classList.add('drawer-open'); }
function closeDrawer() {
  body.classList.remove('drawer-open'); $('#search').blur();
  if (query) { query = ''; $('#search').value = ''; renderGrid(); }
  $('#grid').scrollTop = 0;
}
$('#search').addEventListener('input', (e) => { query = e.target.value; renderGrid(); });
$('#search').addEventListener('keydown', (e) => { if (e.key === 'Enter') { const f = $('#grid .app'); if (f) launch(f.dataset.id); } });
$('#close-drawer').addEventListener('click', closeDrawer);

(() => { // swipe up on home opens the drawer; swipe down on the drawer closes it
  let x = 0, y = 0, on = false;
  const home = $('#home'), dr = $('#drawer');
  home.addEventListener('touchstart', (e) => { on = !e.target.closest('textarea'); x = e.touches[0].clientX; y = e.touches[0].clientY; }, { passive: true });
  home.addEventListener('touchmove', (e) => {
    if (!on) return;
    const dy = e.touches[0].clientY - y, dx = e.touches[0].clientX - x;
    if (dy < -70 && Math.abs(dx) < Math.abs(dy) * 0.6) { on = false; openDrawer(); }
  }, { passive: true });
  dr.addEventListener('touchstart', (e) => { on = $('#grid').scrollTop === 0 && !e.target.closest('#search'); y = e.touches[0].clientY; }, { passive: true });
  dr.addEventListener('touchmove', (e) => { if (on && e.touches[0].clientY - y > 90) { on = false; closeDrawer(); } }, { passive: true });
})();

(() => { // long-press empty home -> settings
  let t = null, sx = 0, sy = 0;
  const p = $('#pager');
  p.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.app,textarea,button,input')) return;
    sx = e.clientX; sy = e.clientY; t = setTimeout(openSettings, 550);
  });
  p.addEventListener('pointermove', (e) => { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 12) clearTimeout(t); });
  ['pointerup', 'pointercancel'].forEach((ev) => p.addEventListener(ev, () => clearTimeout(t)));
})();

// ---------- native hooks ----------
window.odiumInsets = (top, bottom) => {
  document.documentElement.style.setProperty('--top', top + 'px');
  document.documentElement.style.setProperty('--bottom', bottom + 'px');
};
window.odiumBack = () => {
  if (body.classList.contains('sheet-open')) closeSheet();
  else if (body.classList.contains('set-open')) closeSettings();
  else if (body.classList.contains('drawer-open')) closeDrawer();
  else $('#pager').scrollTo({ left: 0, behavior: 'smooth' });
};
window.odiumHome = () => { closeSheet(); closeSettings(); closeDrawer(); $('#pager').scrollTo({ left: 0, behavior: 'smooth' }); };

// ---------- clock + week ----------
function tick() {
  const d = new Date();
  let h = d.getHours();
  const ap = h < 12 ? 'am' : 'pm';
  if (!prefs.h24) h = h % 12 || 12;
  $('#hh').textContent = String(h).padStart(2, '0');
  $('#mm').textContent = String(d.getMinutes()).padStart(2, '0');
  $('#ap').textContent = prefs.h24 ? '' : ap;
  $('#wd').textContent = d.toLocaleDateString([], { weekday: 'long' });
  $('#dm').textContent = d.toLocaleDateString([], { day: 'numeric', month: 'long' });
  const y0 = new Date(d.getFullYear(), 0, 0), doy = Math.floor((d - y0) / 864e5), tot = Math.round((new Date(d.getFullYear(), 11, 31) - y0) / 864e5);
  $('#yr').style.width = (doy / tot) * 100 + '%'; $('#yl').textContent = `Day ${doy} of ${tot}`;
  moodStats(); renderShift();
  $('#week').innerHTML = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) + i);
    return `<div class="${x.getDate() === d.getDate() && x.getMonth() === d.getMonth() ? 'td' : ''}">${x.toLocaleDateString([], { weekday: 'narrow' })}<b>${x.getDate()}</b>${prefs.shift.on && prefs.shift.days.includes(x.getDay()) ? '<u></u>' : ''}</div>`;
  }).join('');
}

// ---------- focus + note ----------
function renderFocus() {
  const full = prefs.fmin * 60;
  $('#ft').innerHTML = `${String(Math.floor(fl / 60)).padStart(2, '0')}<span>:${String(fl % 60).padStart(2, '0')}</span>`;
  $('#fp').style.width = (1 - fl / full) * 100 + '%';
  $('#fgo').textContent = fr ? 'Pause' : fl === 0 ? 'Restart' : fl < full ? 'Resume' : 'Start';
  setMood();
}
$('#fgo').addEventListener('click', () => {
  if (fr) { clearInterval(fi); fr = false; }
  else {
    if (fl <= 0) fl = prefs.fmin * 60;
    fr = true;
    fi = setInterval(() => { fl--; if (fl <= 0) { fl = 0; fr = false; clearInterval(fi); done(); } renderFocus(); }, 1000);
  }
  renderFocus();
});
$('#fre').addEventListener('click', () => { clearInterval(fi); fr = false; fl = prefs.fmin * 60; renderFocus(); });
$('#note').addEventListener('input', (e) => {
  prefs.note = e.target.value; $('#nc').textContent = `${e.target.value.length} / 240`; savePrefs();
});

// ---------- cat + Odium page ----------
$('#hcat').innerHTML = $('#bigcat').innerHTML = '<img src="cat.png" alt=""><i class="ey l"><i class="pu"></i><i class="ld"></i></i><i class="ey r"><i class="pu"></i><i class="ld"></i></i>';
const buzz = () => { if (prefs.hap) try { Odium.haptic(); } catch (e) {} };
function setMood() {
  const h = new Date().getHours();
  const m = fr ? 'focus' : h >= 23 || h < 6 ? 'asleep' : h < 9 || h >= 21 ? 'drowsy' : 'awake';
  body.dataset.mood = m;
  if (!$('#bigcat').classList.contains('happy'))
    $('#cap').textContent = { focus: 'Locked in. Keep going.', asleep: 'Shh. Sleeping.', drowsy: h < 9 ? 'Still waking up.' : 'Getting sleepy.', awake: 'Watching your screen.' }[m];
}
function happy(t) {
  $$('.cat').forEach((c) => c.classList.add('happy')); $('#cap').textContent = t || 'Purr.';
  clearTimeout(happy.t); happy.t = setTimeout(() => { $$('.cat').forEach((c) => c.classList.remove('happy')); setMood(); }, 1800);
}
function done() {
  const day = new Date().toDateString();
  prefs.fdone = { d: day, n: (prefs.fdone.d === day ? prefs.fdone.n : 0) + 1 };
  savePrefs(); buzz(); happy('Session done. Nice.'); moodStats();
}
function moodStats() {
  setMood();
  $('#sf').textContent = prefs.fdone.d === new Date().toDateString() ? prefs.fdone.n : 0;
  $('#sp').textContent = prefs.pets;
  try { const b = JSON.parse(Odium.battery()); $('#sb').textContent = b.level + '%'; $('#sbl').textContent = b.charging ? 'Charging' : 'Battery'; } catch (e) {}
}
$('#bigcat').addEventListener('click', () => { prefs.pets++; savePrefs(); buzz(); happy(); moodStats(); });
let look = null;
addEventListener('pointermove', (e) => {
  const f = (d, s) => Math.max(-1, Math.min(1, Math.round(d / s * 2)));
  $$('.cat').forEach((c) => {
    const r = c.getBoundingClientRect(), s = Math.max(r.width, 60);
    c.style.setProperty('--ex', f(e.clientX - r.left - r.width / 2, s)); c.style.setProperty('--ey', f(e.clientY - r.top - r.height / 2, s));
  });
  clearTimeout(look); look = setTimeout(() => $$('.cat').forEach((c) => { c.style.setProperty('--ex', 0); c.style.setProperty('--ey', 0); }), 2500);
});
let tOn = false;
function renderTiles() {
  const mk = (pkg, name) => {
    const a = apps.find((x) => x.id.startsWith(pkg + '/'));
    return a ? `<button class="tile" data-id="${a.id}"><img src="${iconUrl(a.id)}" alt=""><b></b><small>Open</small></button>`
             : `<button class="tile off"><i class="ph">${name[0]}</i><b>${name}</b><small>Not installed</small></button>`;
  };
  $('#tiles').innerHTML = mk('com.odium.terminal', 'Terminal') + mk('com.odium.weather', 'Weather') +
    `<button class="tile ${tOn ? 'lit' : ''}" id="t-torch"><svg viewBox="0 0 24 24"><path d="M9 3h6v4l-1 3v11h-4V10L9 7z"/></svg><b>Flashlight</b><small>${tOn ? 'On' : 'Off'}</small></button>`;
  $$('#tiles .tile[data-id]').forEach((t) => { t.querySelector('b').textContent = find(t.dataset.id).n; });
}
$('#tiles').addEventListener('click', (e) => {
  const t = e.target.closest('.tile'); if (!t) return;
  if (t.dataset.id) launch(t.dataset.id);
  else if (t.id === 't-torch') { try { tOn = Odium.torch(!tOn); } catch (x) { tOn = false; } buzz(); renderTiles(); }
});

// ---------- weather, shift ----------
let locQ = '', locRes = [];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function dur(ms) { const m = Math.max(0, Math.round(ms / 6e4)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; }
function wmo(c) { return c === 0 ? ['☀️', 'Clear'] : c < 3 ? ['⛅', 'Partly cloudy'] : c === 3 ? ['☁️', 'Overcast'] : c < 50 ? ['🌫️', 'Fog'] : c < 60 ? ['🌦️', 'Drizzle'] : c < 70 ? ['🌧️', 'Rain'] : c < 80 ? ['🌨️', 'Snow'] : c < 90 ? ['🌦️', 'Showers'] : ['⛈️', 'Storm']; }
async function loadWx() {
  const L = prefs.wxloc; if (!L) { renderWx(); return; }
  try {
    const f = prefs.units === 'imperial';
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${L.lat}&longitude=${L.lon}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=2&temperature_unit=${f ? 'fahrenheit' : 'celsius'}`);
    if (!r.ok) throw 0;
    prefs.wxc = { t: Date.now(), u: prefs.units, d: await r.json() }; savePrefs();
  } catch (e) {}
  renderWx();
}
function renderWx() {
  const el = $('#wx'), L = prefs.wxloc, c = prefs.wxc;
  if (!L) { el.innerHTML = '<div class="wxe">Set your weather location in Settings</div>'; return; }
  if (!c || c.u !== prefs.units) { el.innerHTML = '<div class="wxe">Loading weather…</div>'; return; }
  const d = c.d, cur = d.current, [ic, tx] = wmo(cur.weather_code);
  const i = Math.max(0, d.hourly.time.findIndex((t) => t > cur.time));
  const hrs = d.hourly.time.slice(i, i + 4).map((t, k) => `<div>${new Date(t).toLocaleTimeString([], { hour: 'numeric' })}<span>${wmo(d.hourly.weather_code[i + k])[0]}</span><b>${Math.round(d.hourly.temperature_2m[i + k])}°</b></div>`).join('');
  el.innerHTML = `<div class="wx1"><div class="wxt">${ic} ${Math.round(cur.temperature_2m)}°</div><b>${tx}</b><small></small></div><div class="wxh">${hrs}</div>`;
  el.querySelector('small').textContent = `${L.n} · H ${Math.round(d.daily.temperature_2m_max[0])}° L ${Math.round(d.daily.temperature_2m_min[0])}°`;
}
$('#w-wx').addEventListener('click', () => {
  const a = apps.find((x) => x.id.startsWith('com.odium.weather/'));
  if (!prefs.wxloc || !a) openSettings(); else launch(a.id);
});
async function searchLoc() {
  locQ = ($('#lq') || { value: locQ }).value.trim(); if (!locQ) return;
  try { locRes = (await (await fetch('https://geocoding-api.open-meteo.com/v1/search?count=5&language=en&format=json&name=' + encodeURIComponent(locQ))).json()).results || []; } catch (e) { locRes = []; }
  renderSettings();
}
function pickLoc(i) {
  const r = locRes[i]; if (!r) return;
  prefs.wxloc = { n: r.name, lat: r.latitude, lon: r.longitude }; prefs.wxc = null; locRes = []; locQ = '';
  savePrefs(); loadWx(); renderSettings();
}
function toggleDay(i) { const d = prefs.shift.days; set('shift.days', d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort()); }
function renderShift() {
  const S = prefs.shift, el = $('#shift');
  el.hidden = !S.on || !S.days.length; if (el.hidden) return;
  const n = new Date(), [sh, sm] = S.s.split(':').map(Number), [eh, em] = S.e.split(':').map(Number);
  const at = (d, h, m) => new Date(n.getFullYear(), n.getMonth(), n.getDate() + d, h, m);
  const work = S.days.includes(n.getDay()), st = at(0, sh, sm), en = at(0, eh, em);
  let msg, pct = 0;
  if (work && n < st) msg = `Shift starts in ${dur(st - n)}`;
  else if (work && n < en) { pct = (n - st) / (en - st) * 100; msg = `On shift · ${dur(en - n)} left`; }
  else {
    let d = 1; while (d < 8 && !S.days.includes(at(d, 0, 0).getDay())) d++;
    const nx = at(d, sh, sm);
    msg = `${work ? 'Shift done · ' : ''}Next: ${d === 1 ? 'tomorrow' : nx.toLocaleDateString([], { weekday: 'long' })}, ${nx.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  }
  el.innerHTML = `<span>${msg}</span><i><u style="width:${pct}%"></u></i>`;
}
// ---------- boot ----------=
try { prefs = { ...DEF, hidden: [], ...JSON.parse(Odium.getPrefs()) }; } catch (e) {}
applyPrefs();
$('#note').value = prefs.note || ''; $('#nc').textContent = `${$('#note').value.length} / 240`;
fl = prefs.fmin * 60; renderFocus();
refreshApps();
setInterval(tick, 10000); setInterval(loadWx, 9e5);
