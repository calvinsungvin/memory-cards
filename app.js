const $ = (sel, el = document) => el.querySelector(sel);
const app = $('#app');
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COLORS = { problem: 'var(--c-problem)', hypothesis: 'var(--c-hypothesis)', goal: 'var(--c-goal)', why: 'var(--c-why)', how: 'var(--c-how)', result: 'var(--c-result)', background: 'var(--c-background)' };
const colorOf = (name) => COLORS[(name || '').split(' ')[0].toLowerCase()] || 'var(--muted)';

let DATA = null;
const state = { route: 'home' };

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// ---------- crypto ----------
async function decrypt(pkg, password) {
  const b = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const enc = new TextEncoder();
  const keyMat = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b(pkg.salt), iterations: 250000, hash: 'SHA-256' }, keyMat, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b(pkg.iv) }, key, b(pkg.ct));
  return JSON.parse(new TextDecoder().decode(pt));
}

async function loadData(password) {
  const res = await fetch('data.enc', { cache: 'no-cache' });
  const pkg = await res.json();
  return decrypt(pkg, password);
}

// ---------- gate ----------
function renderGate(err = '') {
  app.innerHTML = `<div class="gate">
    <h2>Memory Cards</h2>
    <p class="muted small">Enter passphrase to unlock.</p>
    <input id="pw" type="password" autocomplete="current-password" placeholder="Passphrase">
    <div class="err">${esc(err)}</div>
    <button class="btn primary" id="go">Unlock</button>
  </div>`;
  const tryUnlock = async () => {
    const pw = $('#pw').value;
    try { DATA = await loadData(pw); localStorage.setItem('mc_pw', pw); render(); }
    catch { renderGate('Wrong passphrase.'); }
  };
  $('#go').onclick = tryUnlock;
  $('#pw').onkeydown = (e) => { if (e.key === 'Enter') tryUnlock(); };
  $('#pw').focus();
}

// ---------- home ----------
function renderHome() {
  app.innerHTML = `<div class="topbar"><h1>Memory Cards</h1><span class="pill">${DATA.stories.length} stories</span><button class="back" id="lock">Lock</button></div>
  <div class="screen">
    <div class="list">${DATA.stories.map(s => `<button class="story" data-id="${s.id}"><h2>${esc(s.short)}</h2><p>${esc(s.throughLine)}</p></button>`).join('')}</div>
    <div class="row"><button class="btn primary" id="random">Random cell drill</button></div>
    <p class="pad muted small">Swipe sideways through a story. Tap a cell card to reveal its content. Built ${esc(new Date(DATA.built).toLocaleString())}.</p>
  </div>`;
  app.querySelectorAll('.story').forEach(b => b.onclick = () => go({ route: 'story', id: b.dataset.id, tab: 'cards' }));
  $('#random').onclick = () => go({ route: 'random' });
  $('#lock').onclick = () => { localStorage.removeItem('mc_pw'); DATA = null; renderGate(); };
}

// ---------- deck building ----------
function buildMainSlides(story) {
  const slides = [];
  slides.push({ kind: 'cover', title: story.short, text: story.throughLine, sub: story.mainTitle, accent: 'var(--fg)', seg: 'cover' });
  story.main.forEach((cell, ci) => {
    const accent = colorOf(cell.name);
    slides.push({ kind: 'cell', cell, index: ci + 1, total: story.main.length, accent, seg: cell.name });
    cell.cards.forEach((c, i) => slides.push({ kind: c.kind, cell, text: c.text, n: i + 1, of: cell.cards.length, accent, seg: cell.name }));
  });
  if (story.protocol) slides.push({ kind: 'protocol', text: story.protocol, accent: 'var(--muted)', seg: 'protocol' });
  return slides;
}

function buildVariantSlides(v) {
  const slides = [{ kind: 'cover', title: v.title, text: v.intro.join('\n\n'), accent: 'var(--fg)', seg: 'cover' }];
  v.cells.forEach((cell, ci) => {
    const accent = colorOf(cell.name);
    slides.push({ kind: 'cell', cell, index: ci + 1, total: v.cells.length, accent, seg: cell.name });
    cell.cards.forEach((c, i) => slides.push({ kind: c.kind, cell, text: c.text, n: i + 1, of: cell.cards.length, accent, seg: cell.name }));
  });
  v.defenses.forEach((d, i) => slides.push({ kind: 'defense', text: d, n: i + 1, of: v.defenses.length, accent: 'var(--c-qa)', seg: 'defense' }));
  return slides;
}

function buildDrawerSlides(story) {
  return story.drawer.map((q, i) => ({ kind: 'qa', q: q.q, a: q.a, where: q.where, n: i + 1, of: story.drawer.length, accent: 'var(--c-qa)', seg: 'qa' }));
}

function slideHTML(s, i) {
  const style = `style="--accent:${s.accent}"`;
  const head = (chip, meta) => `<div class="head"><span class="chip">${esc(chip)}</span>${meta ? `<span class="meta">${esc(meta)}</span>` : ''}</div>`;
  const paras = (t) => t.split(/\n\n+/).map(p => `<p>${esc(p)}</p>`).join('');
  switch (s.kind) {
    case 'cover':
      return `<div class="card" ${style}>${head('Through-line')}<h2>${esc(s.title)}</h2>${s.sub ? `<p class="muted small">${esc(s.sub)}</p>` : ''}<div class="body hidden-body">${paras(s.text)}</div><button class="reveal" data-i="${i}">Tap to reveal</button></div>`;
    case 'cell':
      return `<div class="card cell-header" ${style}>${head(`${s.index} / ${s.total}`, s.cell.seconds)}<h2>${esc(s.cell.name)}</h2>${s.cell.subtitle ? `<p>${esc(s.cell.subtitle)}</p>` : ''}<p class="count">${s.cell.cards.length} card${s.cell.cards.length === 1 ? '' : 's'}. Say it, then swipe to check.</p></div>`;
    case 'para':
    case 'point':
      return `<div class="card" ${style}>${head(s.cell.name, `${s.n} / ${s.of}`)}<div class="body">${paras(s.text)}</div></div>`;
    case 'pause':
      return `<div class="card pause" ${style}>${head('Pause point')}<h3>Stop. Check in.</h3>${paras(s.text)}</div>`;
    case 'stop':
      return `<div class="card stop" ${style}><h2>Stop here.</h2><p class="muted">Everything else lives in the drawer.</p></div>`;
    case 'protocol':
      return `<div class="card" ${style}>${head('When interrupted')}${paras(s.text)}</div>`;
    case 'defense':
      return `<div class="card" ${style}>${head('Follow-up defense', `${s.n} / ${s.of}`)}${paras(s.text)}</div>`;
    case 'qa':
      return `<div class="card" ${style}>${head('Q&A drawer', `${s.n} / ${s.of}`)}<h3>${esc(s.q)}</h3><div class="body hidden-body flip-back"><p>${esc(s.a)}</p>${s.where ? `<p class="muted small">${esc(s.where)}</p>` : ''}</div><button class="reveal" data-i="${i}">Tap to reveal</button></div>`;
  }
  return '';
}

function renderDeck(container, slides, key) {
  const deck = document.createElement('div');
  deck.className = 'deck';
  deck.innerHTML = slides.map((s, i) => `<div class="slide">${slideHTML(s, i)}</div>`).join('');
  const prog = document.createElement('div');
  prog.className = 'progress';
  prog.innerHTML = slides.map(s => `<i style="--seg:${s.accent}"></i>`).join('');
  container.append(deck, prog);
  deck.querySelectorAll('.reveal').forEach(b => b.onclick = (e) => { const card = e.target.closest('.card'); card.querySelector('.hidden-body')?.classList.remove('hidden-body'); e.target.remove(); });
  deck.querySelectorAll('.card').forEach(c => c.onclick = (e) => { if (e.target.classList.contains('reveal')) return; const hb = c.querySelector('.hidden-body'); if (hb) { hb.classList.remove('hidden-body'); c.querySelector('.reveal')?.remove(); } });
  const saved = +sessionStorage.getItem(key) || 0;
  const update = () => { const i = Math.round(deck.scrollLeft / deck.clientWidth); prog.querySelectorAll('i').forEach((el, j) => el.classList.toggle('on', j <= i)); sessionStorage.setItem(key, i); };
  deck.addEventListener('scroll', update, { passive: true });
  requestAnimationFrame(() => { deck.scrollTo({ left: saved * deck.clientWidth, behavior: 'instant' }); update(); });
}

// ---------- story screen ----------
function renderStory() {
  const story = DATA.stories.find(s => s.id === state.id);
  const tabs = [['cards', 'Cards'], ...story.variants.map((v, i) => [`v${i}`, shortVariant(v.title)]), ['qa', 'Q&A'], ['map', 'Mind map']];
  app.innerHTML = `<div class="topbar"><button class="back" id="back">‹ Back</button><h1>${esc(story.short)}</h1></div>
  <div class="deck-wrap" id="wrap"></div>
  <div class="tabs">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${state.tab === k ? 'active' : ''}">${esc(l)}</button>`).join('')}</div>`;
  $('#back').onclick = () => go({ route: 'home' });
  app.querySelectorAll('.tabs button').forEach(b => b.onclick = () => go({ ...state, tab: b.dataset.tab }));
  const wrap = $('#wrap');
  if (state.tab === 'cards') renderDeck(wrap, buildMainSlides(story), `${story.id}:cards`);
  else if (state.tab === 'qa') renderDeck(wrap, buildDrawerSlides(story), `${story.id}:qa`);
  else if (state.tab === 'map') renderMindmap(wrap, story);
  else if (/^v\d$/.test(state.tab)) { const v = story.variants[+state.tab.slice(1)]; renderDeck(wrap, buildVariantSlides(v), `${story.id}:${state.tab}`); }
}

function shortVariant(title) {
  if (/AI quality/i.test(title)) return 'AI quality';
  if (/measurement/i.test(title)) return 'Measurement';
  if (/hardest|conflict|data call/i.test(title)) return 'Hard call';
  return 'Variant';
}

// ---------- mindmap ----------
let markmapReady = null;
function loadMarkmap() {
  if (markmapReady) return markmapReady;
  markmapReady = new Promise((resolve, reject) => {
    const add = (src) => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
    add('https://cdn.jsdelivr.net/npm/d3@7').then(() => add('https://cdn.jsdelivr.net/npm/markmap-lib@0.17')).then(() => add('https://cdn.jsdelivr.net/npm/markmap-view@0.17')).then(resolve, reject);
  });
  return markmapReady;
}
async function renderMindmap(wrap, story) {
  wrap.innerHTML = `<div class="mm"><svg id="mmsvg"></svg></div>`;
  try {
    await loadMarkmap();
    const { Transformer } = window.markmap;
    const { Markmap } = window.markmap;
    const { root } = new Transformer().transform(story.mindmap);
    const mm = Markmap.create('#mmsvg', { colorFreezeLevel: 2, initialExpandLevel: 2, maxWidth: 220, duration: 200, paddingX: 12, spacingVertical: 8 }, root);
    setTimeout(() => mm.fit(), 50);
  } catch (e) {
    wrap.innerHTML = `<div class="pad muted">Mind map needs a network connection the first time (loads the renderer from a CDN).</div>`;
  }
}

// ---------- random drill ----------
function renderRandom() {
  const pool = [];
  DATA.stories.forEach(s => s.main.forEach(c => pool.push({ story: s, cell: c })));
  const pick = pool[Math.floor(Math.random() * pool.length)];
  let t = 10, timer;
  app.innerHTML = `<div class="topbar"><button class="back" id="back">‹ Back</button><h1>Random cell</h1></div>
  <div class="screen pad">
    <div class="card" style="--accent:${colorOf(pick.cell.name)}; min-height: 60vh">
      <div class="head"><span class="chip">${esc(pick.story.short)}</span><span class="meta">${esc(pick.cell.seconds)}</span></div>
      <h2>${esc(pick.cell.name)}</h2>
      <div class="timer" id="t">10</div>
      <p class="muted">Say this cell in one sentence. Then reveal.</p>
      <div class="body hidden-body" id="ans">${pick.cell.cards.filter(c => c.kind !== 'stop').map(c => `<p>${esc(c.text)}</p>`).join('')}</div>
      <button class="reveal" id="rev">Reveal</button>
    </div>
    <div class="row" style="padding:16px 0 0"><button class="btn primary" id="next">Next</button></div>
  </div>`;
  $('#back').onclick = () => { clearInterval(timer); go({ route: 'home' }); };
  $('#next').onclick = () => { clearInterval(timer); renderRandom(); };
  $('#rev').onclick = () => { clearInterval(timer); $('#ans').classList.remove('hidden-body'); $('#rev').remove(); };
  timer = setInterval(() => { t -= 1; $('#t').textContent = t; if (t <= 0) { clearInterval(timer); $('#t').textContent = 'Time'; } }, 1000);
}

// ---------- router ----------
function go(next) { Object.assign(state, next); render(); }
function render() {
  if (!DATA) return renderGate();
  if (state.route === 'story') return renderStory();
  if (state.route === 'random') return renderRandom();
  return renderHome();
}

(async () => {
  const pw = localStorage.getItem('mc_pw');
  if (pw) { try { DATA = await loadData(pw); } catch { localStorage.removeItem('mc_pw'); } }
  render();
})();
