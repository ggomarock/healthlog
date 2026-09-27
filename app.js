'use strict';
/* =========================================================
   저장소
   ========================================================= */
const KEY = 'healthlog-v1';
const DEF_CFG = { kcalGoal: 2200, sleepGoal: 480, rest: 90, apiKey: '', model: 'gemini-flash-latest', sex: 'M', age: 0, height: 0,
  waterGoal: 8, cupMl: 250, goalW: 0, goalStart: null, lastBackup: null, firstUse: null,
  weekGoal: 4, autoWarm: true, barKg: 20, plates: [20, 15, 10, 5, 2.5, 1.25] };
const EMPTY = () => ({ v: 5, sets: [], weights: [], foods: [], sleeps: [], routines: [], customFoods: [], sessions: [], ach: {}, equip: null, water: {}, notes: {}, mealTpl: [], recLog: {}, active: null, cfg: { ...DEF_CFG } });
let db = EMPTY(), firstAchRun = false;

function load() {
  try {
    const s = localStorage.getItem(KEY);
    if (s) { const d = JSON.parse(s); db = { ...db, ...d, cfg: { ...DEF_CFG, ...(d.cfg || {}) } }; }
  } catch (e) {}
  ['sets', 'weights', 'foods', 'sleeps', 'routines', 'customFoods', 'sessions'].forEach(k => { if (!Array.isArray(db[k])) db[k] = []; });
  if (!db.ach || typeof db.ach !== 'object') { db.ach = {}; firstAchRun = true; }
  ['water', 'notes', 'recLog'].forEach(k => { if (!db[k] || typeof db[k] !== 'object') db[k] = {}; });
  if (!Array.isArray(db.mealTpl)) db.mealTpl = [];
  if (db.equip !== null && !Array.isArray(db.equip)) db.equip = null;
  if (!Array.isArray(db.cfg.plates)) db.cfg.plates = [...DEF_CFG.plates];
  if (!db.cfg.firstUse) { const ds = [...db.sets, ...db.foods, ...db.weights].map(x => x.date).filter(Boolean).sort(); db.cfg.firstUse = ds[0] || ymd(); }
  db.foods.forEach(f => { if (f.qty == null) f.qty = 1; });
  db.v = 5;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { toast('저장 실패: 저장공간 확인'); } }

/* =========================================================
   유틸
   ========================================================= */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const z2 = n => String(n).padStart(2, '0');
function ymd(d = new Date()) { return `${d.getFullYear()}-${z2(d.getMonth() + 1)}-${z2(d.getDate())}`; }
function addDays(s, n) { const d = new Date(s + 'T00:00'); d.setDate(d.getDate() + n); return ymd(d); }
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function md(s) { const d = new Date(s + 'T00:00'); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; }
function fmtN(v, dec = 0) { return Number(v).toFixed(dec).replace(/\.0+$/, ''); }
const fmtK = n => Math.round(n).toLocaleString();
function hm(min) { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return !h ? `${m}분` : m ? `${h}시간 ${m}분` : `${h}시간`; }
function clock(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return `${z2(Math.floor(min / 60))}:${z2(min % 60)}`; }
function jsArg(s) { return esc(JSON.stringify(s)); }

const EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
function toast(msg, icn) {
  const t = $('#toast'), text = String(msg).replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
  const err = !icn && /실패|없어|못 |못했|아니야|어려워|적어줘|입력해줘|골라줘|추가해줘|같아|넘었어|필요 없어/.test(text);
  const name = icn || (err ? 'circle-alert' : /업적/.test(text) ? 'trophy' : /삭제/.test(text) ? 'trash-2' : /백업/.test(text) ? 'hard-drive' : 'circle-check');
  t.className = err ? 'err' : '';
  t.innerHTML = `${ic(name, 17)}<span>${esc(text)}</span>`;
  void t.offsetWidth; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), 1900);
}
function confetti() {
  const cs = ['#6d7dff', '#9b6dff', '#ff9a3d', '#22d3a0', '#a07bff', '#ff5f6d'];
  for (let i = 0; i < 60; i++) {
    const e = document.createElement('i'); e.className = 'confetti';
    e.style.left = Math.random() * 100 + 'vw'; e.style.background = cs[i % cs.length];
    e.style.animationDuration = 1.8 + Math.random() * 1.6 + 's'; e.style.animationDelay = Math.random() * .4 + 's';
    document.body.appendChild(e); setTimeout(() => e.remove(), 4000);
  }
}
/* 숫자 카운트: 새 숫자는 0부터, 바뀐 숫자는 이전 값부터, 같은 숫자는 그대로 */
function countUp(root = document) {
  root.querySelectorAll('[data-count]').forEach(el => {
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0);
    const f = v => (dec ? v.toFixed(dec) : Math.round(v).toLocaleString());
    if (el._same) { el._same = false; if (!el._run) el.textContent = f(to); return; }
    const from = el._from ?? 0; el._from = undefined;
    const tok = (el._tok || 0) + 1, t0 = performance.now(), dur = from ? 600 : 900;
    el._tok = tok; el._run = true; el.textContent = f(from);
    const step = now => {
      if (el._tok !== tok) return;
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = f(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step); else el._run = false;
    };
    requestAnimationFrame(step);
  });
}
function ring(pct, size, stroke, color, inner) {
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, id = 'g' + uid(), p = clamp(pct || 0, 0, 1);
  return `<div class="ring" style="width:${size}px;height:${size}px">
    <svg width="${size}" height="${size}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${color[0]}"/><stop offset="1" stop-color="${color[1]}"/></linearGradient></defs>
      <circle class="trk" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="bar" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${stroke}"
        stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - p)}" ${p ? '' : 'opacity="0"'}/></svg>
    <div class="in">${inner}</div></div>`;
}
/* 애플 활동 링처럼 겹친 3중 링 (바깥 → 안쪽) */
function tripleRing(rs, size = 136, sw = 12, gap = 4) {
  const c = size / 2;
  return `<div class="ring3" style="width:${size}px;height:${size}px"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${rs.map((r, i) => {
      const R = c - sw / 2 - i * (sw + gap), C = 2 * Math.PI * R, p = clamp(r.p || 0, 0, 1), id = 'r3' + uid();
      return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${r.c[0]}"/><stop offset="1" stop-color="${r.c[1]}"/></linearGradient>
        <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="${r.c[0]}" stroke-opacity=".16" stroke-width="${sw}"/>
        <circle class="bar" cx="${c}" cy="${c}" r="${R}" fill="none" stroke="url(#${id})" stroke-width="${sw}" stroke-linecap="round"
          stroke-dasharray="${C}" stroke-dashoffset="${C}" data-off="${C * (1 - p)}" style="transition-delay:${i * 110}ms" ${p ? '' : 'opacity="0"'}/>`;
    }).join('')}</svg></div>`;
}
function animateRings(root = document) {
  requestAnimationFrame(() => requestAnimationFrame(() =>
    root.querySelectorAll('.ring .bar[data-off], .ring3 .bar[data-off]').forEach(c => c.style.strokeDashoffset = c.dataset.off)));
}
function segThumb(root = document) {
  root.querySelectorAll('.seg').forEach(s => {
    const on = s.querySelector('button.on'), th = s.querySelector('.thumb');
    if (on && th) { th.style.left = on.offsetLeft + 'px'; th.style.width = on.offsetWidth + 'px'; }
  });
}

/* =========================================================
   바텀시트
   ========================================================= */
function sheet(html, { cls = '', theme = '', onClose } = {}) {
  const ov = document.createElement('div'); ov.className = 'ov';
  const sh = document.createElement('div'); sh.className = `sh ${cls} ${theme}`;
  sh.innerHTML = `<div class="grab"></div><button class="shx" aria-label="닫기">${ic('x', 18)}</button>` + html;
  document.body.append(ov, sh);
  requestAnimationFrame(() => { ov.classList.add('show'); sh.classList.add('show'); });
  // 키보드가 올라오면 시트를 키보드 위로 올림 (iOS)
  const vv = window.visualViewport;
  const fit = () => {
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop), on = kb > 40;
    sh.style.bottom = on ? kb + 'px' : '';
    sh.style.maxHeight = on ? (vv.height - 8) + 'px' : '';
    if (sh.classList.contains('tall')) sh.style.height = on ? (vv.height - 8) + 'px' : '';
  };
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  let closed = false;
  const close = fromUser => {
    if (closed) return; closed = true;
    if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
    ov.classList.remove('show'); sh.classList.remove('show');
    setTimeout(() => { ov.remove(); sh.remove(); }, 380);
    if (fromUser && onClose) onClose();
  };
  ov.onclick = () => close(true);
  sh.querySelector('.shx').onclick = () => close(true);
  // 손잡이 아래로 끌어서 닫기
  const grab = sh.querySelector('.grab'); let y0 = null;
  grab.addEventListener('pointerdown', e => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); sh.style.transition = 'none'; });
  grab.addEventListener('pointermove', e => { if (y0 != null) sh.style.transform = `translateY(${Math.max(0, e.clientY - y0)}px)`; });
  grab.addEventListener('pointerup', e => {
    sh.style.transition = ''; sh.style.transform = '';
    if (y0 != null && e.clientY - y0 > 80) close(true); y0 = null;
  });
  return { el: sh, close };
}

/* ---------- 드래그 눈금자 ---------- */
function openRuler(o) {
  return new Promise(res => {
    const step = o.step || 1, dec = step < 1 ? (String(step).split('.')[1] || '').length : 0;
    const px = o.px || 12, major = o.major || 10, total = Math.round((o.max - o.min) / step);
    let v = clamp(o.value ?? o.min, o.min, o.max);
    const snap = x => +(clamp(Math.round((x - o.min) / step) * step + o.min, o.min, o.max)).toFixed(dec);
    v = snap(v);
    const quick = (o.quick || []).map(q => `<button class="chip" data-q="${q}">${q}${o.unit}</button>`).join('');
    const s = sheet(`<div class="sh-title">${o.title}</div>
      <div class="rv num"><span id="rv">${fmtN(v, dec)}</span><small>${o.unit}</small></div>
      <div class="ruler"><canvas></canvas><i class="needle"></i></div>
      <div class="row"><button class="stepbtn" data-d="-1" aria-label="빼기">${ic('minus', 22)}</button>
        <div class="f chips" style="justify-content:${quick ? 'flex-start' : 'center'}">${quick || '<span class="dim" style="margin:auto">좌우로 드래그</span>'}</div>
        <button class="stepbtn" data-d="1" aria-label="더하기">${ic('plus', 22)}</button></div>
      <button class="btn pri mt2" id="rok">확인</button>`, { theme: o.theme || '', onClose: () => res(null) });
    const el = s.el, cv = el.querySelector('canvas'), ctx = cv.getContext('2d'), out = el.querySelector('#rv');
    const dpr = window.devicePixelRatio || 1;
    function draw() {
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const cx = w / 2, half = cx / px + 2;
      const i0 = Math.max(0, Math.floor((v - o.min) / step - half)), i1 = Math.min(total, Math.ceil((v - o.min) / step + half));
      ctx.textAlign = 'center'; ctx.font = '600 12px "Pretendard Variable", Pretendard, -apple-system, sans-serif';
      for (let i = i0; i <= i1; i++) {
        const val = o.min + i * step, x = cx + (val - v) / step * px;
        const isMaj = i % major === 0, isMid = !isMaj && major % 2 === 0 && i % (major / 2) === 0;
        const d = Math.abs(x - cx) / cx;
        ctx.globalAlpha = 1 - d * .75;
        ctx.strokeStyle = isMaj ? '#eef1f6' : '#6b7383'; ctx.lineWidth = isMaj ? 2 : 1.2;
        const len = isMaj ? 34 : isMid ? 24 : 14;
        ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x, 6 + len); ctx.stroke();
        if (isMaj) { ctx.fillStyle = '#a3abb9'; ctx.fillText(fmtN(val, dec), x, h - 4); }
      }
      ctx.globalAlpha = 1;
      out.textContent = fmtN(snap(v), dec);
      el.querySelectorAll('[data-q]').forEach(b => b.classList.toggle('on', +b.dataset.q === snap(v)));
    }
    const ru = el.querySelector('.ruler');
    let drag = null, vel = 0, raf = 0;
    ru.addEventListener('pointerdown', e => { cancelAnimationFrame(raf); ru.setPointerCapture(e.pointerId); drag = { x: e.clientX, t: performance.now() }; vel = 0; });
    ru.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, now = performance.now();
      v = clamp(v - dx / px * step, o.min, o.max);
      vel = dx / Math.max(1, now - drag.t); drag = { x: e.clientX, t: now }; draw();
    });
    const release = () => {
      if (!drag) return; drag = null;
      const glide = () => {
        if (Math.abs(vel) > 0.02) { v = clamp(v - vel * 16 / px * step, o.min, o.max); vel *= 0.93; draw(); raf = requestAnimationFrame(glide); }
        else settle();
      };
      glide();
    };
    const settle = () => {
      const target = snap(v), from = v, t0 = performance.now();
      const an = now => { const p = Math.min(1, (now - t0) / 180); v = from + (target - from) * p; draw(); if (p < 1) raf = requestAnimationFrame(an); else v = target; };
      raf = requestAnimationFrame(an);
    };
    ru.addEventListener('pointerup', release); ru.addEventListener('pointercancel', release);
    ru.addEventListener('wheel', e => { e.preventDefault(); v = snap(clamp(v + Math.sign(e.deltaY || e.deltaX) * step, o.min, o.max)); draw(); }, { passive: false });
    el.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { cancelAnimationFrame(raf); v = snap(clamp(snap(v) + (+b.dataset.d) * step, o.min, o.max)); draw(); });
    el.querySelectorAll('[data-q]').forEach(b => b.onclick = () => { cancelAnimationFrame(raf); v = snap(+b.dataset.q); draw(); });
    el.querySelector('#rok').onclick = () => { cancelAnimationFrame(raf); s.close(); res(snap(v)); };
    setTimeout(draw, 30); draw();
  });
}

/* =========================================================
   라우터 + 렌더링
   - 화면 이동(nav): 새로 그리고 등장 애니메이션 재생
   - 같은 화면 갱신: 바뀐 부분만 고침 (ui.js patchView)
   ========================================================= */
let cur = { v: 'home', p: {} }, stack = [], lastView = '';
const TAB_OF = { home: 'home', workout: 'workout', session: 'workout', programs: 'workout', program: 'workout', routines: 'workout', routineEdit: 'workout', history: 'workout', diet: 'diet', body: 'body', sleep: 'home', settings: 'home', equip: 'home', analysis: 'analysis', manage: 'manage' };
const ROOTS = ['home', 'workout', 'diet', 'body', 'analysis', 'manage'];
const NAV_IC = { home: 'house', workout: 'dumbbell', diet: 'utensils', body: 'scale', analysis: 'chart-column', manage: 'trophy' };
function go(v, p = {}, push = true) {
  if (push && cur.v !== v) stack.push(cur);
  cur = { v, p };
  render(true);
  window.scrollTo(0, 0);
}
function tab(v) { stack = []; cur = { v: '', p: {} }; go(v, {}, false); }
function back() { cur = stack.pop() || { v: TAB_OF[cur.v] === cur.v ? 'home' : TAB_OF[cur.v], p: {} }; render(true); window.scrollTo(0, 0); }
function viewTheme() { return cur.v === 'sleep' ? 't-sleep' : ({ workout: 't-work', diet: 't-diet', body: 't-body', analysis: 't-anal', manage: 't-rank' }[TAB_OF[cur.v]] || 't-work'); }
function render(nav = false) {
  const view = $('#view'), html = VIEWS[cur.v](cur.p), cls = viewTheme();
  nav = nav || cur.v !== lastView; lastView = cur.v;
  if (nav) {
    KEPT.clear();
    view.style.animation = 'none'; void view.offsetHeight; view.style.animation = '';
    view.className = cls; view.innerHTML = html;
  } else {
    if (view.className !== cls) view.className = cls;
    patchView(view, html);
  }
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.t === TAB_OF[cur.v]));
  countUp(view); animateRings(view); segThumb(view);
  (AFTER[cur.v] || (() => {}))(cur.p);
  updateRestBar();
  if (cur.v !== 'session' && cur.v !== 'manage') checkAch();
}
const topbar = (title, sub = '', right = '') => `<div class="top" data-key="top">
  ${stack.length || !ROOTS.includes(cur.v) ? `<button class="iconbtn back" onclick="back()" aria-label="뒤로">${ic('chevron-left', 22)}</button>` : ''}
  <div style="flex:1;min-width:0"><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${right}</div>`;
function initChrome() {
  document.querySelectorAll('nav button').forEach(b => { const s = b.querySelector('span'); if (s) s.innerHTML = ic(NAV_IC[b.dataset.t], 22); });
  const x = $('#rest .rx'); if (x) x.innerHTML = ic('x', 16);
}

const VIEWS = {}, AFTER = {};

/* =========================================================
   홈
   ========================================================= */
function weekDates() { const t = new Date(); const s = new Date(t); s.setDate(t.getDate() - ((t.getDay() + 6) % 7)); return [...Array(7)].map((_, i) => { const d = new Date(s); d.setDate(s.getDate() + i); return ymd(d); }); }
const dayKcal = d => db.foods.filter(f => f.date === d).reduce((a, f) => a + f.kcal, 0);
const sortedW = () => [...db.weights].sort((a, b) => a.date < b.date ? -1 : 1);
const sortedS = () => [...db.sleeps].sort((a, b) => a.date < b.date ? -1 : 1);
const sleepDur = s => ((s.wake - s.bed) % 1440 + 1440) % 1440;
const RING_C = { work: ['#6d7dff', '#9b6dff'], diet: ['#ff9a3d', '#ff5f6d'], water: ['#38bdf8', '#22d3ee'] };

VIEWS.home = () => {
  const today = ymd(), h = new Date().getHours();
  const hi = h < 6 ? '늦은 밤이야' : h < 12 ? '좋은 아침이야' : h < 18 ? '오늘도 화이팅' : '오늘 하루 수고했어';
  const wk = weekDates(), workDays = new Set(db.sets.map(s => s.date)), wDone = wk.filter(d => workDays.has(d)).length, wGoal = db.cfg.weekGoal || 4;
  const kc = dayKcal(today), kGoal = db.cfg.kcalGoal, cups = db.water[today] || 0, cGoal = db.cfg.waterGoal, ml = db.cfg.cupMl;
  const ws = sortedW().filter(w => w.kg), lw = ws[ws.length - 1], pw = ws[ws.length - 2];
  const ss = sortedS(), ls = ss[ss.length - 1];
  const wDelta = db.cfg.goalW && lw ? db.cfg.goalW - lw.kg : null;
  return `<div class="top" data-key="top"><div style="flex:1"><div class="sub">${ic(h < 6 || h >= 18 ? 'moon-star' : 'sun', 14)}${md(today)}</div><div class="hello">${hi}</div></div>
    <button class="iconbtn" onclick="go('settings')" aria-label="설정">${ic('settings', 20)}</button></div>
  ${homeLevelChip()}
  ${db.active ? `<button class="resume grad t-work" data-key="resume" onclick="go('session')">${ic('flame', 22)}
     <div class="f"><b>운동 진행 중</b><div class="rs">${esc(db.active.title)} · 이어서 하기</div></div>${ic('chevron-right', 20)}</button>` : ''}
  ${homeStack()}
  <div class="card todaycard" data-key="today" style="--i:1">
    <div class="row" style="gap:18px">
      ${tripleRing([{ p: wDone / wGoal, c: RING_C.work }, { p: kc / kGoal, c: RING_C.diet }, { p: cups / cGoal, c: RING_C.water }])}
      <div class="f legend3">
        <button class="lg3" onclick="tab('workout')" style="--c0:${RING_C.work[0]};--c1:${RING_C.work[1]}"><i></i><div><span>운동 · 이번 주</span><b class="num">${wDone}<small>/${wGoal}일</small></b></div></button>
        <button class="lg3" onclick="tab('diet')" style="--c0:${RING_C.diet[0]};--c1:${RING_C.diet[1]}"><i></i><div><span>칼로리${kc > kGoal * 1.1 ? ' <em class="up">초과</em>' : ''}</span><b class="num"><span data-count="${kc}">0</span><small>/${fmtK(kGoal)}</small></b></div></button>
        <div class="lg3" style="--c0:${RING_C.water[0]};--c1:${RING_C.water[1]}"><i></i><div><span>물</span><b class="num">${fmtN(cups * ml / 1000, 2)}<small>/${fmtN(cGoal * ml / 1000, 2)}L</small></b></div>
          <button class="plus1" onclick="setWater('${today}',${Math.min(cups, 15)})" aria-label="물 한 컵 추가">${ic('plus', 13)}${ic('glass-water', 15)}</button></div>
      </div></div>
    <div class="week">${wk.map(d => `<div class="${d === today ? 'today' : ''}"><i class="${workDays.has(d) ? 'on' : ''}">${workDays.has(d) ? ic('check', 13) : ''}</i>${WD[new Date(d + 'T00:00').getDay()]}</div>`).join('')}</div></div>
  <div class="grid2" data-key="minis">
    <button class="mini t-body" onclick="tab('body')" style="--i:2"><span class="mi">${ic('scale', 18)}</span>
      <div class="f"><span class="dim">체중</span><div class="mv num">${lw ? `<span data-count="${lw.kg}" data-dec="1">0</span><small>kg</small>` : '—'}</div>
      <div class="dim">${wDelta != null ? `목표까지 ${(wDelta > 0 ? '+' : '') + wDelta.toFixed(1)}kg` : lw && pw ? `<span class="${lw.kg > pw.kg ? 'up' : 'down'}">${lw.kg > pw.kg ? '▲' : '▼'} ${Math.abs(lw.kg - pw.kg).toFixed(1)}</span> 지난 기록 대비` : '탭해서 기록'}</div></div></button>
    <button class="mini t-sleep" onclick="go('sleep')" style="--i:3"><span class="mi">${ic('moon', 18)}</span>
      <div class="f"><span class="dim">수면</span><div class="mv num">${ls ? `<span data-count="${(sleepDur(ls) / 60).toFixed(1)}" data-dec="1">0</span><small>시간</small>` : '—'}</div>
      <div class="dim">${ls ? `${ls.date === today ? '어젯밤' : ls.date.slice(5).replace('-', '/')} · ${clock(ls.bed)}~${clock(ls.wake)}` : '탭해서 기록'}</div></div></button>
  </div>`;
};
AFTER.home = () => { const r = document.querySelector('.stack-row'); if (r) stackDots(r); };

/* =========================================================
   운동 메인
   ========================================================= */
VIEWS.workout = () => {
  const today = ymd(), tSets = db.sets.filter(s => s.date === today);
  const month = today.slice(0, 7), mDays = new Set(db.sets.filter(s => s.date.startsWith(month)).map(s => s.date)).size;
  return `${topbar('운동', `이번 달 ${mDays}일 운동`)}
  ${db.active ? `<button class="resume grad" data-key="resume" onclick="go('session')">${ic('flame', 22)}
     <div class="f"><b>${esc(db.active.title)}</b><div class="rs">진행 중 · 이어서 하기</div></div>${ic('chevron-right', 20)}</button>` : ''}
  ${deloadBanner()}
  ${db.active ? '' : recCard()}
  <div class="grid2 mt" data-key="tiles">
    <button class="wtile" style="--i:0;--c:#ffc53d" onclick="startFree()"><span class="wi">${ic('zap', 22)}</span><div><b>자유 운동</b><br><span>원하는 종목 골라서 바로</span></div></button>
    <button class="wtile" style="--i:1;--c:#38bdf8" onclick="go('programs')"><span class="wi">${ic('clipboard-list', 22)}</span><div><b>운동 프로그램</b><br><span>검증된 루틴 ${PROGRAMS.length}종</span></div></button>
    <button class="wtile" style="--i:2;--c:#a07bff" onclick="go('routines')"><span class="wi">${ic('star', 22)}</span><div><b>내 루틴</b><br><span>${db.routines.length}개 저장됨</span></div></button>
    <button class="wtile" style="--i:3;--c:#22d3a0" onclick="go('history')"><span class="wi">${ic('calendar-days', 22)}</span><div><b>전체 운동기록</b><br><span>캘린더로 보기</span></div></button>
  </div>
  <div class="card" data-key="todaysets" style="--i:4"><h2>오늘 운동</h2>${tSets.length ? summarizeSets(tSets) : '<div class="empty">아직 오늘 운동 기록이 없어</div>'}</div>`;
};
function summarizeSets(sets, del = false) {
  const g = {}; sets.sort((a, b) => a.t - b.t).forEach(s => (g[s.ex] ||= []).push(s));
  return Object.entries(g).map(([ex, arr]) => {
    const vol = arr.reduce((a, s) => a + s.kg * s.reps, 0);
    return `<div class="li" data-key="${esc(ex)}" style="align-items:flex-start"><div class="f"><div class="t">${esc(ex)}</div>
      <div class="chips" style="flex-wrap:wrap;margin-top:6px">${arr.map(s => `<span class="chip sc" data-key="${s.id}">${fmtN(s.kg, 1)}×${s.reps}${del ? `<button class="cx" onclick="delSet('${s.id}')" aria-label="삭제">${ic('x', 12)}</button>` : ''}</span>`).join('')}</div></div>
      <div class="dim" style="white-space:nowrap">${fmtK(vol)}kg</div></div>`;
  }).join('');
}
function delSet(id) {
  const i = db.sets.findIndex(s => s.id === id); if (i < 0) return;
  const [s] = db.sets.splice(i, 1);
  const live = db.active && s.sid === db.active.id ? db.active.items.flatMap(it => it.sets).find(x => x.id === s.id) : null;
  if (live) live.done = false;
  save(); render();
  snack(`${s.ex} ${fmtN(s.kg, 1)}kg×${s.reps} 삭제`, () => { db.sets.splice(i, 0, s); if (live) live.done = true; });
}

/* =========================================================
   운동 세션
   ========================================================= */
function lastSets(ex) {
  const past = db.sets.filter(s => s.ex === ex && (!db.active || s.sid !== db.active.id));
  if (!past.length) return [];
  const d = past.reduce((a, s) => s.date > a ? s.date : a, '');
  return past.filter(s => s.date === d).sort((a, b) => a.t - b.t);
}
async function startSession(title, items) {
  if (db.active) {
    const n = db.active.items.flatMap(i => i.sets).filter(s => s.done && !s.warm).length;
    const r = await ask({ title: '진행 중인 운동이 있어', desc: `${esc(db.active.title)} · 완료 ${n}세트`, ok: '이어서 하기', alt: '저장하고 새로 시작', cancel: '취소', icon: 'dumbbell' });
    if (r === true) { go('session'); return; }
    if (r !== 'alt') return;
    finishSession(true);
  }
  db.active = { id: uid(), title, start: Date.now(), date: ymd(), items, focus: 0 };
  save(); stack = [{ v: 'workout', p: {} }]; cur = { v: 'session', p: {} }; render(true); window.scrollTo(0, 0);
}
function startFree() { if (db.active) return go('session'); startSession('자유 운동', []); setTimeout(() => pickExercises(), 350); }
function ensureIds(a) {
  a.items.forEach(it => {
    if (!it.id) it.id = uid();
    it.sets.forEach(s => { if (!s.id) s.id = uid(); });
    if (it.target == null) it.target = (it.sets.find(s => !s.warm) || {}).reps || 10;
  });
}
function curFocus(a = db.active) {
  if (!a || !a.items.length) return -1;
  if (a.focus != null && a.items[a.focus]) return a.focus;
  const i = a.items.findIndex(it => it.sets.some(s => !s.done));
  return i >= 0 ? i : 0;
}
function focusEx(ii) {
  const a = db.active; if (!a || !a.items[ii]) return;
  a.focus = ii; save(); render();
  const id = a.items[ii].id;
  requestAnimationFrame(() => { const el = document.querySelector(`[data-key="ex-${id}"]`); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}
const rpeVar = s => (s.rpe != null ? `--h:${Math.round(140 - (s.rpe - 5) * 28)}` : '');

VIEWS.session = () => {
  const a = db.active; if (!a) return VIEWS.workout();
  ensureIds(a);
  const all = a.items.flatMap(i => i.sets), done = all.filter(s => s.done).length, total = all.length;
  const vol = all.filter(s => s.done && !s.warm).reduce((x, s) => x + s.kg * s.reps, 0);
  const fi = curFocus(a), allDone = total > 0 && done === total;
  return `${topbar(esc(a.title), md(a.date), `<button class="btn pri sm ${allDone ? 'glow' : ''}" onclick="finishSession()">${ic('check', 16)}완료</button>`)}
  <div class="sprog" data-key="sprog">
    <div class="row"><div class="sp"><span>세트</span><b class="num">${done}<small>/${total}</small></b></div>
      <div class="sp"><span>시간</span><b class="num" id="elapsed">00:00</b></div>
      <div class="sp"><span>볼륨</span><b class="num">${fmtK(vol)}<small>kg</small></b></div></div>
    <div class="pbar"><i style="width:${total ? (done / total * 100).toFixed(1) : 0}%"></i></div></div>
  ${a.items.length ? a.items.map((it, ii) => (ii === fi ? exFocused(it, ii) : exCollapsed(it, ii))).join('')
    : `<div class="card" data-key="empty"><div class="empty">${ic('dumbbell', 30)}<br>아래에서 종목을 추가해서 시작해</div></div>`}
  <button class="btn mt" data-key="addex" onclick="pickExercises()">${ic('plus', 18)}운동 종목 추가</button>`;
};
function exCollapsed(it, ii) {
  const w = it.sets.filter(s => !s.warm), wd = w.filter(s => s.done), complete = it.sets.length > 0 && it.sets.every(s => s.done);
  const nx = w.find(s => !s.done) || w[0];
  return `<div class="exc mini ${complete ? 'complete' : ''}" data-key="ex-${it.id}" onclick="focusEx(${ii})" role="button">
    <div class="exrow" data-key="c"><span class="exmark">${complete ? ic('check', 16) : ii + 1}</span>
      <div class="f"><b>${esc(it.ex)}</b><div class="dim">${complete ? `완료 · ${wd.map(s => `${fmtN(s.kg, 1)}×${s.reps}`).join('  ')}`
        : `${wd.length}/${w.length}세트${nx ? ` · 다음 ${fmtN(nx.kg, 1)}kg × ${nx.reps}` : ''}`}</div></div>
      <span class="setdots">${w.map(s => `<i class="${s.done ? 'on' : ''}"></i>`).join('')}</span>${ic('chevron-right', 18, 'chev')}</div></div>`;
}
function exFocused(it, ii) {
  const a = db.active, note = db.notes[it.ex], cs = it.sets.findIndex(s => !s.done), bar = isBar(it.ex);
  const no = si => it.sets.slice(0, si + 1).filter(s => !s.warm).length;
  const rows = it.sets.map((s, si) => ({ s, si })), doneR = rows.filter(r => r.s.done), upR = rows.filter(r => !r.s.done && r.si !== cs);
  let nx = a.items.findIndex((x, j) => j > ii && x.sets.some(y => !y.done));
  if (nx < 0) nx = a.items.findIndex((x, j) => j !== ii && x.sets.some(y => !y.done));
  const nWork = it.sets.filter(s => !s.warm).length;
  return `<div class="exc focus" data-key="ex-${it.id}"><div class="exbody" data-key="f">
    <div class="hd"><button class="exname" onclick="formSheet(${jsArg(it.ex)})"><b>${esc(it.ex)}</b>${ic('info', 16, 'info')}</button>
      <button class="x" onclick="removeItem(${ii})" aria-label="종목 빼기">${ic('x', 18)}</button></div>
    <div class="sugs">${sugChip(it)}</div>
    ${note ? `<div class="note" data-key="note">${ic('notebook-pen', 14)}<span>${esc(note)}</span></div>` : ''}
    ${doneR.length ? `<div class="donelist" data-key="dl">${doneR.map(r => rowDone(it, ii, r.s, r.si, no(r.si))).join('')}</div>` : ''}
    ${cs >= 0 ? curSetCard(it, ii, cs, no(cs), nWork, bar)
      : `<div class="alldone" data-key="alldone">${ic('circle-check', 20)}<span class="f">${esc(it.ex)} 완료</span>
        ${nx >= 0 ? `<button class="btn sm pri" onclick="focusEx(${nx})">다음 종목${ic('arrow-right', 14)}</button>` : ''}</div>`}
    ${upR.length ? `<div class="uplist" data-key="ul"><div class="uph">남은 세트</div>${upR.map(r => rowUp(it, ii, r.s, r.si, no(r.si))).join('')}</div>` : ''}
    <div class="exacts" data-key="acts"><button class="addset" onclick="addSetRow(${ii})">${ic('plus', 15)}세트</button>
      ${nWork > 1 ? `<button class="addset" onclick="popSetRow(${ii})">${ic('minus', 15)}세트</button>` : ''}
      ${bar ? `<button class="addset" onclick="toggleWarm(${ii})">${ic('flame', 15)}${it.sets.some(s => s.warm) ? '워밍업 빼기' : '워밍업'}</button>` : ''}</div>
  </div></div>`;
}
function curSetCard(it, ii, si, no, nWork, bar) {
  const s = it.sets[si], P = bar && s.kg > 0 ? plates(s.kg) : null;
  const wl = it.sets.filter(x => x.warm), wi = wl.indexOf(s) + 1;
  return `<div class="cur ${s.warm ? 'warm' : ''}" data-key="cur-${s.id}">
    <div class="cur-h"><b>${s.warm ? `워밍업 ${wi}<span> / ${wl.length}</span>` : `${no}세트<span> / ${nWork}</span>`}</b>
      <span class="dim">${s.warm ? '가볍게 · 휴식 없이 진행' : `목표 ${it.target}회`}</span></div>
    <div class="cur-v"><button class="bigpill" onclick="editSet(${ii},${si},'kg')"><span class="num">${fmtN(s.kg, 1)}</span><small>kg</small></button>
      <span class="xmul">×</span><button class="bigpill" onclick="editSet(${ii},${si},'reps')"><span class="num">${s.reps}</span><small>회</small></button></div>
    ${P ? `<button class="plates" onclick="plateSheet(${s.kg})"><span class="dim">한쪽</span>${plateChips(P)}${P.rem > 0 ? `<span class="warnc">+${P.rem} 부족</span>` : ''}${ic('chevron-right', 14, 'chev')}</button>` : ''}
    <div class="cur-a">${s.warm ? '' : `<button class="rpe ${s.rpe != null ? 'on' : ''}" style="${rpeVar(s)}" onclick="editRpe(${ii},${si})"><small>RPE</small>${s.rpe != null ? fmtN(s.rpe, 1) : '—'}</button>`}
      <button class="btn pri donebtn" onclick="toggleSet(${ii},${si})">${ic('check', 20)}${s.warm ? '워밍업 완료' : '세트 완료'}</button></div></div>`;
}
function rowDone(it, ii, s, si, no) {
  return `<div class="srow done ${s.warm ? 'warm' : ''}" data-key="${s.id}"><span class="sn">${s.warm ? 'W' : no}</span>
    <span class="sv num">${fmtN(s.kg, 1)}<small>kg</small> × ${s.reps}</span>
    ${s.warm ? '<span></span>' : `<button class="rpe sm ${s.rpe != null ? 'on' : ''}" style="${rpeVar(s)}" onclick="editRpe(${ii},${si})">${s.rpe != null ? 'RPE ' + fmtN(s.rpe, 1) : 'RPE'}</button>`}
    <button class="chk sm on ${s.id === justChecked ? 'pop' : ''}" onclick="toggleSet(${ii},${si})" aria-label="완료 취소">${ic('check', 16)}</button></div>`;
}
function rowUp(it, ii, s, si, no) {
  return `<div class="srow todo ${s.warm ? 'warm' : ''}" data-key="${s.id}"><span class="sn">${s.warm ? 'W' : no}</span>
    <button class="pill sm num" onclick="editSet(${ii},${si},'kg')">${fmtN(s.kg, 1)}<small>kg</small></button>
    <button class="pill sm num" onclick="editSet(${ii},${si},'reps')">${s.reps}<small>회</small></button>
    <button class="chk sm" onclick="toggleSet(${ii},${si})" aria-label="완료">${ic('check', 16)}</button></div>`;
}
AFTER.session = () => { tickElapsed(); };
function tickElapsed() {
  clearInterval(tickElapsed.t);
  const f = () => { const el = $('#elapsed'); if (!el || !db.active) return clearInterval(tickElapsed.t); const s = Math.floor((Date.now() - db.active.start) / 1000); el.textContent = s >= 3600 ? `${Math.floor(s / 3600)}:${z2(Math.floor(s / 60) % 60)}:${z2(s % 60)}` : `${z2(Math.floor(s / 60))}:${z2(s % 60)}`; };
  f(); tickElapsed.t = setInterval(f, 1000);
}
function syncSet(it, s) {
  if (s.warm) return;   // 워밍업은 기록/통계에 넣지 않음
  const i = db.sets.findIndex(x => x.id === s.id);
  if (s.done) {
    const rec = { id: s.id, date: db.active.date, ex: it.ex, kg: s.kg, reps: s.reps, t: i >= 0 ? db.sets[i].t : Date.now(), sid: db.active.id, ...(s.rpe != null ? { rpe: s.rpe } : {}) };
    if (i >= 0) db.sets[i] = rec; else db.sets.push(rec);
  } else if (i >= 0) db.sets.splice(i, 1);
}
async function editSet(ii, si, f) {
  const it = db.active.items[ii], s = it.sets[si];
  const v = f === 'kg'
    ? await openRuler({ title: `${it.ex} · ${s.warm ? '워밍업 ' : ''}무게`, unit: 'kg', min: 0, max: 300, step: 0.5, px: 10, value: s.kg, theme: 't-work' })
    : await openRuler({ title: `${it.ex} · 횟수`, unit: '회', min: 1, max: 50, step: 1, px: 26, major: 5, value: s.reps, quick: [5, 8, 10, 12, 15], theme: 't-work' });
  if (v == null || !db.active) return;
  s[f] = v;
  if (!s.warm) it.sets.slice(si + 1).forEach(x => { if (!x.done && !x.warm) x[f] = v; });   // 뒤쪽 작업 세트에도 적용 (워밍업은 개별 수정)
  // 첫 작업 세트 무게가 바뀌면 (아직 안 한) 워밍업도 다시 계산
  if (f === 'kg' && !s.warm && it.sets.find(x => !x.warm) === s && it.sets.some(x => x.warm) && !it.sets.some(x => x.warm && x.done))
    it.sets = makeWarmups(it.ex, v).concat(it.sets.filter(x => !x.warm));
  syncSet(it, s); save(); render();
}
let justChecked = null;
function toggleSet(ii, si) {
  const a = db.active, it = a.items[ii], s = it.sets[si];
  s.done = !s.done; syncSet(it, s); a.focus = ii;
  if (s.done) {
    justChecked = s.id; setTimeout(() => { if (justChecked === s.id) justChecked = null; }, 900);
    if (!s.warm) { unlockAudio(); startRest(db.cfg.rest); }
    if (it.sets.every(x => x.done)) {
      let nn = a.items.findIndex((x, j) => j > ii && x.sets.some(y => !y.done));
      if (nn < 0) nn = a.items.findIndex(x => x.sets.some(y => !y.done));
      if (nn >= 0) setTimeout(() => { if (db.active === a && a.focus === ii) { focusEx(nn); toast(`다음 종목 · ${a.items[nn].ex}`, 'arrow-right'); } }, 650);
      else setTimeout(() => toast('모든 세트 완료! 위의 완료 버튼으로 저장해', 'trophy'), 300);
    }
  }
  save(); render();
}
function addSetRow(ii) {
  const it = db.active.items[ii], w = it.sets.filter(s => !s.warm), l = w[w.length - 1];
  it.sets.push({ kg: l?.kg ?? 0, reps: l?.reps ?? it.target ?? 10, done: false, id: uid() });
  db.active.focus = ii; save(); render();
}
function popSetRow(ii) {
  const it = db.active.items[ii]; let k = it.sets.length - 1;
  while (k >= 0 && it.sets[k].warm) k--;
  if (k < 0) return;
  const [s] = it.sets.splice(k, 1), ri = db.sets.findIndex(x => x.id === s.id), rec = ri >= 0 ? db.sets.splice(ri, 1)[0] : null;
  save(); render();
  if (s.done) snack(`${it.ex} ${fmtN(s.kg, 1)}kg×${s.reps} 삭제`, () => { it.sets.splice(k, 0, s); if (rec) db.sets.splice(ri, 0, rec); });
}
function removeItem(ii) {
  const a = db.active, [it] = a.items.splice(ii, 1);
  const ids = new Set(it.sets.map(s => s.id)), recs = db.sets.filter(s => ids.has(s.id));
  db.sets = db.sets.filter(s => !ids.has(s.id));
  if (a.focus != null) a.focus = a.focus === ii ? null : a.focus > ii ? a.focus - 1 : a.focus;
  save(); render();
  snack(`${it.ex} 종목을 뺐어`, () => { if (db.active !== a) return; a.items.splice(ii, 0, it); db.sets.push(...recs); a.focus = ii; }, { icon: 'x' });
}
function toggleWarm(ii) {
  const it = db.active.items[ii];
  if (it.sets.some(s => s.warm)) it.sets = it.sets.filter(s => !s.warm);
  else {
    const w = it.sets.find(s => !s.warm), ws = makeWarmups(it.ex, w ? w.kg : 0);
    if (!ws.length) return toast(`작업 무게가 ${barKg()}kg 이하라 워밍업이 필요 없어`);
    it.sets = ws.concat(it.sets);
  }
  db.active.focus = ii; save(); render();
}
async function finishSession(silent) {
  const a = db.active; if (!a) return;
  const done = a.items.flatMap(i => i.sets).filter(s => s.done && !s.warm);
  if (!silent && !done.length) {
    const ok = await ask({ title: '완료한 세트가 없어', desc: '기록 없이 운동을 끝낼까?', ok: '끝내기', cancel: '계속하기', icon: 'circle-alert' });
    if (!ok || db.active !== a) return;
  }
  const min = Math.round((Date.now() - a.start) / 60000), vol = done.reduce((x, s) => x + s.kg * s.reps, 0);
  // 이번 세션 신기록 (추정 1RM 기준)
  const prs = [...new Set(done.map(s => a.items.find(it => it.sets.includes(s)).ex))].filter(ex => {
    const now = Math.max(...db.sets.filter(s => s.sid === a.id && s.ex === ex).map(s => e1rm(s.kg, s.reps)), 0);
    const old = db.sets.filter(s => s.ex === ex && s.sid !== a.id).reduce((m, s) => Math.max(m, e1rm(s.kg, s.reps)), 0);
    return old > 0 && now > old;
  });
  if (done.length) db.sessions.push({ id: a.id, date: a.date, title: a.title, start: a.start, end: Date.now(), sets: done.length, vol });
  const allSets = db.sets; db.sets = allSets.filter(s => s.sid !== a.id); const lvBefore = levelInfo().lv; db.sets = allSets;
  db.active = null; justChecked = null; save(); stopRest();
  if (silent) return;
  stack = []; cur = { v: 'workout', p: {} }; render(true);
  if (done.length) {
    confetti();
    const s = sheet(`<div class="center t-work" style="padding:6px 0"><div class="trophy">${ic('trophy', 40)}</div>
      <div class="sh-title" style="font-size:22px;margin-top:12px">운동 완료!</div><div class="muted">${esc(a.title)}</div>
      <div class="grid3 mt2"><div class="card" style="margin:0"><div class="dim">시간</div><b class="big num" style="font-size:24px">${min}<span class="unit">분</span></b></div>
      <div class="card" style="margin:0"><div class="dim">세트</div><b class="big num" style="font-size:24px">${done.length}</b></div>
      <div class="card" style="margin:0"><div class="dim">볼륨</div><b class="big num" style="font-size:24px">${fmtK(vol)}</b></div></div>
      ${prs.length ? `<div class="prline">${ic('trending-up', 16)}신기록 ${prs.map(p => `<span class="tag">${esc(p)}</span>`).join('')}</div>` : ''}
      <button class="btn pri mt2" id="okfin">좋아!</button></div>`, { theme: 't-work' });
    s.el.querySelector('#okfin').onclick = () => { s.close(); setTimeout(() => afterWorkout(lvBefore), 400); };
  }
}
function nextSetText() {
  const a = db.active; if (!a) return '';
  const fi = curFocus(a), it = a.items[fi];
  const s = it && it.sets.find(x => !x.done);
  if (s) return `다음 ${s.warm ? '워밍업' : '세트'} · ${fmtN(s.kg, 1)}kg × ${s.reps}`;
  const nx = a.items.find(x => x.sets.some(y => !y.done)); if (!nx) return '모든 세트 완료';
  const t = nx.sets.find(y => !y.done); return `다음 · ${nx.ex} ${fmtN(t.kg, 1)}kg × ${t.reps}`;
}

/* ---------- 워밍업 · 원판 ---------- */
const PLATE_COL = { 25: '#e5484d', 20: '#3b82f6', 15: '#f5c518', 10: '#22c55e', 5: '#eceef2', 2.5: '#f87171', 1.25: '#a1a1aa' };
const PLATE_H = { 25: 92, 20: 92, 15: 80, 10: 68, 5: 50, 2.5: 40, 1.25: 32 };
const PLATE_W = { 25: 13, 20: 12, 15: 11, 10: 10, 5: 8, 2.5: 7, 1.25: 6 };
const ALL_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
function barKg() { return db.cfg.barKg || 20; }
function isBar(ex) { return (EX_REQ[ex] || []).includes('barbell'); }
/* 작업 무게 기준 워밍업: 빈 바 ×10 → 40% ×5 → 60% ×3 → 80% ×2 (2.5kg 단위) */
function makeWarmups(ex, work) {
  const bar = barKg();
  if (!isBar(ex) || work <= bar) return [];
  const out = ex === '데드리프트' ? [] : [{ kg: bar, reps: 10 }];
  if (work >= bar + 20) [[0.4, 5], [0.6, 3], [0.8, 2]].forEach(([p, r]) => {
    const kg = Math.max(bar, r25(work * p));
    if ((!out.length || kg > out[out.length - 1].kg) && kg < work) out.push({ kg, reps: r });
  });
  return out.map(w => ({ ...w, warm: true, done: false, id: uid() }));
}
/* 한쪽에 끼울 원판 (큰 원판부터) */
function plates(total) {
  const avail = (db.cfg.plates || DEF_CFG.plates).slice().sort((a, b) => b - a);
  let side = Math.round((total - barKg()) / 2 * 1000) / 1000;
  const list = [];
  if (side <= 0) return { list, rem: 0, under: side < 0 };
  for (const p of avail) while (side + 1e-9 >= p) { list.push(p); side = Math.round((side - p) * 1000) / 1000; }
  return { list, rem: side };
}
function plateChips(P) { return P.list.length ? P.list.map(p => `<i class="pl" style="--pc:${PLATE_COL[p]}">${p}</i>`).join('') : '<span class="dim">빈 바</span>'; }
function barbellSvg(P) {
  const cy = 56, room = 84, tw = P.list.reduce((a, p) => a + PLATE_W[p] + 2, 0), k = tw > room ? room / tw : 1;
  let xr = 226, xl = 94, out = '';
  P.list.forEach((p, i) => {
    const w = PLATE_W[p] * k, h = PLATE_H[p], d = `style="animation-delay:${i * 70}ms"`;
    out += `<rect class="plate" ${d} x="${xr}" y="${cy - h / 2}" width="${w}" height="${h}" rx="2.5" fill="${PLATE_COL[p]}"/>`;
    out += `<rect class="plate" ${d} x="${xl - w}" y="${cy - h / 2}" width="${w}" height="${h}" rx="2.5" fill="${PLATE_COL[p]}"/>`;
    xr += w + 2 * k; xl -= w + 2 * k;
  });
  return `<svg viewBox="0 0 320 112" class="barbell" role="img" aria-label="바벨 원판 배치">
    <rect x="100" y="${cy - 2.5}" width="120" height="5" rx="2.5" fill="#8a93a3"/>
    <rect x="6" y="${cy - 5}" width="92" height="10" rx="3" fill="#b8c0cc"/><rect x="222" y="${cy - 5}" width="92" height="10" rx="3" fill="#b8c0cc"/>
    <rect x="94" y="${cy - 11}" width="6" height="22" rx="2" fill="#d6dbe3"/><rect x="220" y="${cy - 11}" width="6" height="22" rx="2" fill="#d6dbe3"/>
    ${out}</svg>`;
}
function plateSheet(kg) {
  let k = kg;
  const s = sheet(`<div class="sh-title">원판 계산기</div><div id="pbody"></div>`, { theme: 't-work', onClose: () => { if (cur.v === 'session' || cur.v === 'settings') render(); } });
  const body = s.el.querySelector('#pbody');
  const draw = () => {
    const P = plates(k), made = barKg() + P.list.reduce((a, p) => a + p, 0) * 2;
    body.innerHTML = `<button class="rv num pk" id="pk">${+(+k).toFixed(2)}<small>kg</small></button>
      ${barbellSvg(P)}
      <div class="center plsum">${P.list.length ? `<span class="dim">한쪽</span> ${plateChips(P)}` : `<span class="muted">${P.under ? `바(${barKg()}kg)보다 가벼워` : '빈 바만'}</span>`}</div>
      ${P.rem > 0 ? `<div class="warnline">${ic('circle-alert', 15)}<span>있는 원판으로는 ${+made.toFixed(2)}kg까지만 돼 (한쪽 ${P.rem}kg 부족)</span></div>` : ''}
      <div class="card" style="margin:14px 0 0"><h2>바 무게</h2><div class="seg"><i class="thumb"></i>${[20, 15, 10].map(b => `<button class="${barKg() === b ? 'on' : ''}" data-bar="${b}">${b}kg</button>`).join('')}</div>
        <h2 class="mt">헬스장에 있는 원판</h2><div class="chips" style="flex-wrap:wrap">${ALL_PLATES.map(p => `<button class="chip plchip ${(db.cfg.plates || []).includes(p) ? 'on' : ''}" data-pl="${p}" style="--pc:${PLATE_COL[p]}"><i></i>${p}kg</button>`).join('')}</div></div>`;
    segThumb(body);
    body.querySelector('#pk').onclick = async () => { const v = await openRuler({ title: '목표 무게', unit: 'kg', min: 0, max: 300, step: 0.5, px: 10, value: k, theme: 't-work' }); if (v != null) { k = v; draw(); } };
    body.querySelectorAll('[data-bar]').forEach(b => b.onclick = () => { db.cfg.barKg = +b.dataset.bar; save(); draw(); });
    body.querySelectorAll('[data-pl]').forEach(b => b.onclick = () => {
      const p = +b.dataset.pl, c0 = db.cfg.plates || [];
      db.cfg.plates = c0.includes(p) ? c0.filter(x => x !== p) : [...c0, p].sort((x, y) => y - x); save(); draw();
    });
  };
  draw();
}

/* ---------- 종목 선택 시트 ---------- */
function pickExercises(onPick) {
  return new Promise(res => {
    const sel = new Set(); let cat = Object.keys(EXERCISES)[0];
    const custom = [...new Set(db.sets.map(s => s.ex))].filter(e => !Object.values(EXERCISES).flat().includes(e));
    const cats = () => ({ ...EXERCISES, ...(custom.length ? { '내 종목': custom } : {}) });
    const s = sheet(`<div class="sh-title">종목 선택</div><div class="chips mt" id="pc"></div><div class="exgrid" id="pg"></div>
      <button class="btn mt" id="pnew">${ic('pencil', 17)}목록에 없는 종목 직접 추가</button>
      <button class="btn pri mt" id="pok" disabled>추가하기</button>`, { cls: 'tall', theme: 't-work', onClose: () => res(null) });
    const el = s.el;
    const draw = () => {
      el.querySelector('#pc').innerHTML = Object.keys(cats()).map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('');
      el.querySelector('#pg').innerHTML = cats()[cat].map(e => `<button class="${sel.has(e) ? 'on' : ''} ${canDo(e) ? '' : 'noeq'}" data-e="${esc(e)}">${esc(e)}${canDo(e) ? '' : '<small>기구 없음</small>'}</button>`).join('');
      const b = el.querySelector('#pok'); b.disabled = !sel.size; b.textContent = sel.size ? `${sel.size}개 추가하기` : '종목을 골라줘';
      el.querySelectorAll('[data-c]').forEach(x => x.onclick = () => { cat = x.dataset.c; draw(); });
      el.querySelectorAll('[data-e]').forEach(x => x.onclick = () => { const e = x.dataset.e; sel.has(e) ? sel.delete(e) : sel.add(e); draw(); });
    };
    el.querySelector('#pnew').onclick = async () => {
      const n = await askText({ title: '종목 직접 추가', placeholder: '예: 스미스머신 스쿼트', ok: '추가', icon: 'dumbbell' });
      if (!n) return;
      if (!custom.includes(n)) custom.push(n); sel.add(n); cat = '내 종목'; draw();
    };
    el.querySelector('#pok').onclick = () => {
      s.close(); const list = [...sel];
      if (onPick) return res(onPick(list));
      if (db.active) {
        list.forEach(e => db.active.items.push(newItem(e)));
        if (db.active.items.length === list.length) db.active.focus = 0;
        save(); render();
        if (list.some(e => !canDo(e))) toast('내 헬스장에 없는 기구 종목이 포함됐어', 'circle-alert');
      }
      res(list);
    };
    draw();
  });
}

/* ---------- 프로그램 ---------- */
VIEWS.programs = () => `${topbar('운동 프로그램', '골라서 바로 시작')}
  ${PROGRAMS.map((p, i) => `<button class="prog" style="--i:${i};background:linear-gradient(135deg,${p.color[0]},${p.color[1]})" onclick="go('program',{id:'${p.id}'})">
    <b>${p.name}</b><span style="opacity:.85;font-size:14px">${p.desc}</span>
    <div class="tags">${p.days.map(d => `<span>${d.name} · ${d.items.length}종목</span>`).join('')}</div></button>`).join('')}`;
VIEWS.program = ({ id, day = 0 }) => {
  const p = PROGRAMS.find(x => x.id === id), d = p.days[day], subs = subList(d.items.map(x => x[0]));
  return `${topbar(p.name, p.desc)}
  ${p.days.length > 1 ? `<div class="seg"><i class="thumb" style="background:linear-gradient(135deg,${p.color[0]},${p.color[1]})"></i>${p.days.map((x, i) => `<button class="${i === day ? 'on' : ''}" onclick="cur.p.day=${i};render()">${x.name}</button>`).join('')}</div>` : ''}
  <div class="card"><h2>${d.name} 루틴 <span class="dim">${d.items.reduce((a, x) => a + x[1], 0)}세트</span></h2>
  ${d.items.map(([ex0, s, r], i) => {
    const ex = subs[i], l = lastSets(ex), sg = suggest(ex, r);
    return `<div class="li" data-key="${esc(ex0)}"><span class="nbox">${i + 1}</span>
    <button class="f" style="text-align:left" onclick="formSheet(${jsArg(ex)})"><div class="t">${ex} ${ic('info', 14, 'info')}</div>
      <div class="dim">${ex !== ex0 ? `<span class="swap">${ic('repeat', 12)} ${ex0} 대체</span> · ` : ''}${sg ? `추천 ${fmtN(deloadOn() ? r25(sg.kg * .6) : sg.kg, 1)}kg` : l.length ? `최근 ${fmtN(l[l.length - 1].kg, 1)}kg` : '첫 기록'}</div></button><b class="num">${s}×${r}</b></div>`;
  }).join('')}</div>
  <button class="btn pri" style="--c1:${p.color[0]};--c2:${p.color[1]}" onclick="startProgram('${id}',${day})">${ic('play', 17)}${d.name} 시작하기</button>`;
};
function startProgram(id, day) {
  const p = PROGRAMS.find(x => x.id === id), d = p.days[day], subs = subList(d.items.map(x => x[0]));
  startSession(`${p.name}${p.days.length > 1 ? ' · ' + d.name : ''}`, d.items.map(([ex, s, r], i) => newItem(subs[i], s, r)));
}

/* ---------- 내 루틴 ---------- */
VIEWS.routines = () => `${topbar('내 루틴', '자주 하는 운동을 저장')}
  ${db.routines.length ? db.routines.map((r, i) => `<div class="card" data-key="${r.id}" style="--i:${i}"><div class="row"><div class="f"><b style="font-size:17px">${esc(r.name)}</b>
    <div class="dim" style="margin-top:4px">${r.items.map(x => esc(x.ex)).join(' · ')}</div></div>
    <button class="iconbtn" onclick="go('routineEdit',{id:'${r.id}'})" aria-label="수정">${ic('pencil', 18)}</button></div>
    <button class="btn pri mt" onclick="startRoutine('${r.id}')">${ic('play', 16)}시작</button></div>`).join('')
    : `<div class="card" data-key="empty"><div class="empty">${ic('star', 28)}<br>아직 저장된 루틴이 없어<br>아래 버튼으로 만들어봐</div></div>`}
  <button class="btn mt" data-key="new" onclick="go('routineEdit',{})">${ic('plus', 18)}새 루틴 만들기</button>`;
function startRoutine(id) {
  const r = db.routines.find(x => x.id === id), subs = subList(r.items.map(x => x.ex));
  startSession(r.name, r.items.map((x, i) => newItem(subs[i], x.sets, x.reps)));
  if (subs.some((e, i) => e !== r.items[i].ex)) toast('없는 기구 종목을 대체했어', 'repeat');
}
let draftR = null;
VIEWS.routineEdit = ({ id }) => {
  if (!draftR || draftR._for !== (id || 'new')) {
    const r = db.routines.find(x => x.id === id);
    draftR = r ? JSON.parse(JSON.stringify(r)) : { id: uid(), name: '', items: [] }; draftR._for = id || 'new';
  }
  return `${topbar(id ? '루틴 수정' : '새 루틴')}
  <div class="card"><h2>루틴 이름</h2><input id="rname" value="${esc(draftR.name)}" placeholder="예: 가슴·삼두 데이" oninput="draftR.name=this.value"></div>
  <div class="card"><h2>종목 <span class="dim">세트 × 횟수</span></h2>
  ${draftR.items.length ? draftR.items.map((x, i) => `<div class="li" data-key="${esc(x.ex)}"><button class="f t" style="text-align:left" onclick="formSheet(${jsArg(x.ex)})">${esc(x.ex)}${canDo(x.ex) ? '' : ` <span class="swap">→ ${esc(substitute(x.ex))}</span>`}</button>
    <div class="cnt"><button onclick="rAdj(${i},'sets',-1)" aria-label="세트 빼기">${ic('minus', 14)}</button><b class="num">${x.sets}</b><button onclick="rAdj(${i},'sets',1)" aria-label="세트 더하기">${ic('plus', 14)}</button></div>
    <button class="pill num" style="padding:6px 10px;font-size:15px" onclick="rReps(${i})">${x.reps}<small>회</small></button>
    <button class="x" onclick="draftR.items.splice(${i},1);render()" aria-label="빼기">${ic('x', 16)}</button></div>`).join('') : '<div class="empty">종목을 추가해줘</div>'}
  <button class="addset" onclick="rAddEx()">${ic('plus', 15)}종목 추가</button></div>
  <button class="btn pri" onclick="rSave()">저장</button>
  ${id ? `<button class="btn danger mt" onclick="rDel('${id}')">${ic('trash-2', 17)}루틴 삭제</button>` : ''}`;
};
function rAdj(i, f, d) { draftR.items[i][f] = clamp(draftR.items[i][f] + d, 1, 10); render(); }
async function rReps(i) { const v = await openRuler({ title: '목표 횟수', unit: '회', min: 1, max: 50, step: 1, px: 26, major: 5, value: draftR.items[i].reps, quick: [5, 8, 10, 12, 15], theme: 't-work' }); if (v != null) { draftR.items[i].reps = v; render(); } }
function rAddEx() { pickExercises(list => { list.forEach(e => draftR.items.push({ ex: e, sets: 3, reps: 10 })); render(); }); }
function rSave() {
  if (!draftR.name.trim()) return toast('루틴 이름을 적어줘');
  if (!draftR.items.length) return toast('종목을 하나 이상 추가해줘');
  const { _for, ...r } = draftR; r.name = r.name.trim();
  const i = db.routines.findIndex(x => x.id === r.id); i >= 0 ? db.routines[i] = r : db.routines.push(r);
  save(); draftR = null; toast('루틴 저장됨'); back();
}
function rDel(id) {
  const i = db.routines.findIndex(x => x.id === id); if (i < 0) return;
  const [r] = db.routines.splice(i, 1); save(); draftR = null; back();
  snack(`"${r.name}" 루틴 삭제`, () => db.routines.splice(i, 0, r));
}

/* ---------- 전체 기록 (캘린더) ---------- */
VIEWS.history = ({ m, sel }) => {
  const today = ymd(); m = m || today.slice(0, 7); sel = sel || today;
  const [Y, M] = m.split('-').map(Number), first = new Date(Y, M - 1, 1), days = new Date(Y, M, 0).getDate();
  const vol = {}; db.sets.filter(s => s.date.startsWith(m)).forEach(s => vol[s.date] = (vol[s.date] || 0) + s.kg * s.reps + 1);
  const mx = Math.max(1, ...Object.values(vol));
  const mSets = db.sets.filter(s => s.date.startsWith(m));
  const cells = [...Array(first.getDay())].map(() => '<span></span>').join('') + [...Array(days)].map((_, i) => {
    const d = `${m}-${z2(i + 1)}`, v = vol[d];
    return `<button class="${v ? 'has' : ''} ${d === sel ? 'sel' : ''} ${d === today ? 'td' : ''}" style="${v ? `background:rgba(109,125,255,${(0.35 + 0.65 * v / mx).toFixed(2)})` : 'background:var(--card2)'}"
      onclick="cur.p.sel='${d}';cur.p.m='${m}';render()">${i + 1}</button>`;
  }).join('');
  const pm = ymd(new Date(Y, M - 2, 1)).slice(0, 7), nm = ymd(new Date(Y, M, 1)).slice(0, 7);
  const daySets = db.sets.filter(s => s.date === sel);
  return `${topbar('전체 운동기록')}
  <div class="grid3"><div class="card" style="margin:0;--i:0"><div class="dim">운동일</div><b class="big" style="font-size:24px"><span data-count="${Object.keys(vol).length}">0</span></b></div>
    <div class="card" style="margin:0;--i:1"><div class="dim">세트</div><b class="big" style="font-size:24px"><span data-count="${mSets.length}">0</span></b></div>
    <div class="card" style="margin:0;--i:2"><div class="dim">볼륨(kg)</div><b class="big" style="font-size:24px"><span data-count="${Math.round(mSets.reduce((a, s) => a + s.kg * s.reps, 0))}">0</span></b></div></div>
  <div class="card" style="--i:3"><div class="row" style="margin-bottom:12px"><button class="iconbtn" onclick="cur.p.m='${pm}';render()" aria-label="이전 달">${ic('chevron-left', 20)}</button>
    <b class="f center" style="font-size:17px">${Y}년 ${M}월</b><button class="iconbtn" onclick="cur.p.m='${nm}';render()" aria-label="다음 달">${ic('chevron-right', 20)}</button></div>
    <div class="cal">${WD.map(w => `<span class="h">${w}</span>`).join('')}${cells}</div>
    <div class="dim mt center">색이 진할수록 볼륨이 커</div></div>
  <div class="card" style="--i:4"><h2>${md(sel)}</h2>${daySets.length ? summarizeSets(daySets, true) : '<div class="empty">운동 기록 없음</div>'}</div>`;
};

/* =========================================================
   휴식 타이머
   ========================================================= */
let rest = { end: 0, total: 0, t: null }, actx = null;
function unlockAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) {} }
function beep() {
  if (!actx) return;
  [0, .3, .6].forEach(t => {
    const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
    const s = actx.currentTime + t; g.gain.setValueAtTime(.0001, s); g.gain.exponentialRampToValueAtTime(.5, s + .02); g.gain.exponentialRampToValueAtTime(.0001, s + .25);
    o.start(s); o.stop(s + .3);
  });
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) {}
}
function startRest(sec) { rest.fin = false; rest.total = sec; rest.end = Date.now() + sec * 1000; $('#rest').classList.remove('fin'); clearInterval(rest.t); rest.t = setInterval(restTick, 200); restTick(); updateRestBar(); }
function stopRest() { rest.end = 0; rest.fin = false; $('#rest').classList.remove('fin'); clearInterval(rest.t); updateRestBar(); }
function adjRest(d) { if (!rest.end) return; rest.end = Math.max(Date.now() + 1000, rest.end + d * 1000); rest.total = Math.max(rest.total + d, 1); restTick(); }
function restTick() {
  if (!rest.end) return;
  const left = (rest.end - Date.now()) / 1000;
  const r = $('#rest'), C = 2 * Math.PI * 20;
  if (left <= 0) {
    clearInterval(rest.t); rest.end = 0; beep();
    r.querySelector('.tm').innerHTML = `휴식 끝!<small>${esc(nextSetText() || '다음 세트 가자')}</small>`; r.querySelector('.rbar').style.strokeDashoffset = 0;
    r.classList.add('fin'); rest.fin = true;
    setTimeout(() => { rest.fin = false; if (!rest.end) updateRestBar(); }, 3000);
    return;
  }
  const s = Math.ceil(left);
  r.querySelector('.tm').innerHTML = `${z2(Math.floor(s / 60))}:${z2(s % 60)}<small>${esc(nextSetText() || '휴식 중')}</small>`;
  r.querySelector('.rbar').style.strokeDashoffset = C * (1 - left / rest.total);
}
function updateRestBar() {
  const show = !!rest.end || !!rest.fin;
  $('#rest').classList.toggle('show', show); document.body.classList.toggle('resting', show);
}
async function setRestDefault() {
  const v = await openRuler({ title: '기본 휴식 시간', unit: '초', min: 15, max: 300, step: 15, px: 30, major: 4, value: db.cfg.rest, quick: [60, 90, 120, 180], theme: 't-work' });
  if (v != null) { db.cfg.rest = v; save(); toast(`휴식 ${v}초로 설정`); if (cur.v === 'settings') render(); }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) restTick(); });

/* =========================================================
   날짜 스트립
   ========================================================= */
function dstrip(sel, has, fn) {
  const today = ymd();
  return `<div class="dstrip" id="dstrip">${[...Array(21)].map((_, i) => {
    const d = addDays(today, i - 20), dt = new Date(d + 'T00:00');
    return `<button class="${d === sel ? 'on' : ''}" onclick="${fn}('${d}')"><small>${d === today ? '오늘' : WD[dt.getDay()]}</small><b>${dt.getDate()}</b><i class="${has(d) ? '' : 'no'}"></i></button>`;
  }).join('')}</div>`;
}
function scrollStrip() { const s = $('#dstrip'), on = s && s.querySelector('.on'); if (s) s.scrollLeft = on ? on.offsetLeft - s.clientWidth + on.offsetWidth + 8 : s.scrollWidth; }

/* =========================================================
   식단
   ========================================================= */
const MEALS = [['아침', 'sunrise'], ['점심', 'sun'], ['저녁', 'moon'], ['간식', 'cookie']];
let dietDate = ymd();
VIEWS.diet = () => {
  const list = db.foods.filter(f => f.date === dietDate), kc = list.reduce((a, f) => a + f.kcal, 0), goal = db.cfg.kcalGoal;
  const left = goal - kc, mealK = MEALS.map(([m]) => list.filter(f => f.meal === m).reduce((a, f) => a + f.kcal, 0));
  const mcol = ['#ffd166', '#ff9a3d', '#ff5f6d', '#c77dff'];
  return `${topbar('식단', md(dietDate))}
  ${dstrip(dietDate, d => db.foods.some(f => f.date === d), 'setDietDate')}
  <div class="card" style="--i:0"><div class="row" style="gap:18px">
    ${ring(kc / goal, 128, 13, ['#ff9a3d', '#ff5f6d'], `<div class="big num" style="font-size:26px" data-count="${kc}">0</div><div class="dim">/ ${fmtK(goal)} kcal</div>`)}
    <div class="f">${left >= 0 ? `<div class="dim">남은 칼로리</div><div class="big gtext num" style="font-size:30px">${fmtK(left)}</div>`
      : `<div class="dim">목표 초과</div><div class="big num" style="font-size:30px;color:var(--danger)">+${fmtK(-left)}</div>`}
      <button class="chip mt" onclick="setKcalGoal()">${ic('target', 15)}목표 변경</button></div></div>
    <div class="macro">${mealK.map((k, i) => k ? `<i style="width:0;background:${mcol[i]}" data-w="${k / Math.max(kc, goal) * 100}"></i>` : '').join('')}</div>
    <div class="row mt" style="justify-content:space-between">${MEALS.map(([m], i) => `<span class="dim"><b style="color:${mcol[i]}">●</b> ${m} ${fmtK(mealK[i])}</span>`).join('')}</div></div>
  ${macroCard(list, kc)}
  ${waterCard(dietDate, 1)}
  ${MEALS.map(([m, e], i) => {
    const arr = list.filter(f => f.meal === m);
    return `<div class="meal" data-key="meal-${m}" style="--i:${i + 2}"><div class="hd"><span class="mic" style="--mc:${mcol[i]}">${ic(e, 18)}</span><b>${m}</b><span class="muted num">${fmtK(mealK[i])} kcal</span>
      ${arr.length ? `<button class="tplbtn" onclick="saveMealTpl('${m}')" aria-label="세트로 저장">${ic('package', 17)}</button>` : ''}<button class="add grad" onclick="addFoodSheet('${m}')" aria-label="${m} 음식 추가">${ic('plus', 20)}</button></div>
      ${arr.map(f => `<div class="fitem" data-key="${f.id}"><div class="f"><div>${esc(f.name)}</div><div class="dim">${f.qty !== 1 ? `×${fmtN(f.qty, 1)} · ` : ''}${esc(f.unit || '')}${f.prot != null ? ` · <span class="mc">탄${Math.round(f.carb)}</span> <span class="mp">단${Math.round(f.prot)}</span> <span class="mf">지${Math.round(f.fat)}</span>` : ''}</div></div>
        <b class="num">${fmtK(f.kcal)}</b><button class="x" onclick="delFood('${f.id}')" aria-label="삭제">${ic('x', 16)}</button></div>`).join('')}</div>`;
  }).join('')}`;
};
/* ---------- 탄단지 분석 ---------- */
const MACRO = [{ k: 'carb', n: '탄수화물', col: '#c08a1e', kc: 4 }, { k: 'prot', n: '단백질', col: '#3f7fe0', kc: 4 }, { k: 'fat', n: '지방', col: '#e0506e', kc: 9 }];
function latestWeight() { const w = sortedW().filter(x => x.kg); return w.length ? w[w.length - 1].kg : 0; }
function macroTargets() {
  const goal = db.cfg.kcalGoal, bw = latestWeight();
  const prot = bw ? Math.round(bw * 1.8) : Math.round(goal * 0.25 / 4);   // 체중 1kg당 1.8g
  const fat = Math.round(goal * 0.25 / 9);                               // 총열량의 25%
  const carb = Math.max(0, Math.round((goal - prot * 4 - fat * 9) / 4)); // 나머지
  return { carb, prot, fat, bw };
}
function macroCard(list, kc) {
  const withM = list.filter(f => f.prot != null), noM = list.filter(f => f.prot == null);
  const g = { carb: 0, prot: 0, fat: 0 }; withM.forEach(f => MACRO.forEach(m => g[m.k] += f[m.k] || 0));
  const mk = MACRO.map(m => g[m.k] * m.kc), tot = mk.reduce((a, b) => a + b, 0), T = macroTargets();
  if (!list.length) return `<div class="card" data-key="macro" style="--i:1"><h2>탄단지 분석</h2><div class="empty">음식을 추가하면 탄단지 비율이 나와</div></div>`;
  const R = 44, C = 2 * Math.PI * R; let acc = 0;
  const arcs = tot ? mk.map((v, i) => { const len = v / tot * C, gap = mk.filter(x => x).length > 1 ? 3 : 0;
    const el = v ? `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${MACRO[i].col}" stroke-width="16" stroke-dasharray="0 ${C}" data-da="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-acc}" style="transition:stroke-dasharray 1s ${i * .15}s var(--ease),stroke-dashoffset 1s var(--ease)"/>` : '';
    acc += len; return el; }).join('') : '';
  const pct = i => tot ? Math.round(mk[i] / tot * 100) : 0;
  return `<div class="card" data-key="macro" style="--i:1"><h2>탄단지 분석 <span class="dim">목표 탄${T.carb}·단${T.prot}·지${T.fat}g</span></h2>
    <div class="row" style="gap:16px">
      <div class="donut"><svg viewBox="0 0 120 120" width="120" height="120" style="transform:rotate(-90deg)"><circle cx="60" cy="60" r="${R}" fill="none" stroke="var(--card2)" stroke-width="16"/>${arcs}</svg>
        <div class="in"><b class="num" style="font-size:20px">${tot ? Math.round(g.prot) : '—'}<small class="unit">g</small></b><div class="dim">단백질</div></div></div>
      <div class="f">${MACRO.map((m, i) => { const t = T[m.k], v = g[m.k], w = t ? Math.min(100, v / t * 100) : 0;
        return `<div class="mrow"><div class="row" style="justify-content:space-between"><span class="lg"><i style="background:${m.col}"></i>${m.n} <span class="dim">${pct(i)}%</span></span>
          <span class="num"><b>${Math.round(v)}</b><span class="dim">/${t}g</span></span></div>
          <div class="mbar"><i style="width:0;background:${m.col}" data-w="${w}"></i></div></div>`; }).join('')}</div></div>
    <div class="dim mt">${T.bw ? `단백질 목표 = 체중 ${T.bw.toFixed(1)}kg × 1.8g · ` : '체중을 기록하면 단백질 목표가 체중 기준으로 바뀌어 · '}지방 25% · 나머지 탄수화물
      ${noM.length ? `<div class="warnline" style="margin-top:8px">${ic('circle-alert', 14)}<span>탄단지 정보 없는 음식 ${noM.length}개(${fmtK(noM.reduce((a, f) => a + f.kcal, 0))}kcal)는 제외</span></div>` : ''}</div></div>`;
}
AFTER.diet = () => {
  scrollStrip();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    document.querySelectorAll('.donut [data-da]').forEach(c => c.setAttribute('stroke-dasharray', c.dataset.da));
    document.querySelectorAll('.macro i, .mbar i').forEach(i => i.style.width = i.dataset.w + '%');
  }));
};
function setDietDate(d) { dietDate = d; render(); }
function delFood(id) {
  const i = db.foods.findIndex(f => f.id === id); if (i < 0) return;
  const [f] = db.foods.splice(i, 1); save(); render();
  snack(`${f.name} 삭제`, () => db.foods.splice(i, 0, f));
}
async function setKcalGoal() {
  const v = await openRuler({ title: '하루 목표 칼로리', unit: 'kcal', min: 1000, max: 4500, step: 50, px: 14, major: 10, value: db.cfg.kcalGoal, quick: [1800, 2000, 2200, 2500], theme: 't-diet' });
  if (v != null) { db.cfg.kcalGoal = v; save(); render(); }
}
function addFood(meal, name, unit, kcalPer, qty, mac) {
  const r1 = v => Math.round(v * 10) / 10;
  const rec = { id: uid(), date: dietDate, meal, name, unit, qty, kcal: Math.round(kcalPer * qty) };
  if (mac && mac.some(x => x != null)) { rec.carb = r1((mac[0] || 0) * qty); rec.prot = r1((mac[1] || 0) * qty); rec.fat = r1((mac[2] || 0) * qty); }
  db.foods.push(rec);
  save();
}
function allFoods() {
  const out = [];
  Object.entries(FOODS).forEach(([c, arr]) => arr.forEach(([n, u, k, C, P, F]) => out.push({ n, u, k, c, m: [C, P, F] })));
  db.customFoods.forEach(f => out.push({ n: f.name, u: f.unit, k: f.kcal, c: '내 음식', m: f.m || null }));
  return out;
}
function freqFoods() {
  const m = {};
  db.foods.forEach(f => { const k = f.name, q = f.qty || 1; m[k] = m[k] || { n: f.name, u: f.unit, k: Math.round(f.kcal / q), m: f.prot != null ? [f.carb / q, f.prot / q, f.fat / q] : null, cnt: 0 }; m[k].cnt++; });
  return Object.values(m).sort((a, b) => b.cnt - a.cnt).slice(0, 20);
}
function addFoodSheet(meal) {
  let mode = 'search', cat = '전체', q = '', open = -1, qty = 1, added = 0, results = [];
  const s = sheet(`<div class="sh-title">음식 추가</div>
    <div class="chips" id="fm" style="justify-content:center"></div>
    <div class="seg mt" id="fmode"><i class="thumb"></i><button data-m="search">${ic('search', 15)}검색</button><button data-m="photo">${ic('camera', 15)}사진</button><button data-m="freq">${ic('star', 15)}자주</button><button data-m="tpl">${ic('package', 15)}세트</button><button data-m="self">${ic('pencil', 15)}직접</button></div>
    <div id="fbody" class="mt"></div>`, { cls: 'tall', theme: 't-diet', onClose: () => { if (added) render(); } });
  const el = s.el;
  const drawMeals = () => {
    el.querySelector('#fm').innerHTML = MEALS.map(([m, e]) => `<button class="chip ${m === meal ? 'on' : ''}" data-meal="${m}">${ic(e, 15)}${m}</button>`).join('');
    el.querySelectorAll('[data-meal]').forEach(b => b.onclick = () => { meal = b.dataset.meal; drawMeals(); });
  };
  const qtyBar = () => `<div class="qty">${[0.5, 1, 1.5, 2, 3].map(x => `<button class="${x === qty ? 'on' : ''}" data-qty="${x}">×${x}</button>`).join('')}</div>`;
  const resultList = arr => arr.length ? arr.map((f, i) => `<button class="fres ${i === open ? 'open' : ''}" data-i="${i}"><div class="f"><div style="font-weight:600">${esc(f.n)}</div><div class="dim">${esc(f.u)}${f.c && cat === '전체' && q ? ` · ${esc(f.c)}` : ''}${f.m ? ` · <span class="mc">탄${fmtN(f.m[0], 0)}</span> <span class="mp">단${fmtN(f.m[1], 0)}</span> <span class="mf">지${fmtN(f.m[2], 0)}</span>` : ''}</div></div><span class="k num">${fmtK(f.k)}<span class="unit">kcal</span></span></button>
      ${i === open ? `<div style="padding:4px 2px 8px;animation:rise .3s both">${qtyBar()}<button class="btn pri mt" data-add="${i}">${meal}에 추가 · ${fmtK(f.k * qty)} kcal</button></div>` : ''}`).join('')
    : '<div class="empty">결과 없음 · 「직접」 탭에서 추가할 수 있어</div>';
  const bindResults = () => {
    el.querySelectorAll('[data-i]').forEach(b => b.onclick = () => { const i = +b.dataset.i; open = open === i ? -1 : i; qty = 1; drawBody(false); });
    el.querySelectorAll('[data-qty]').forEach(b => b.onclick = () => { qty = +b.dataset.qty; drawBody(false); });
    el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const f = results[+b.dataset.add]; addFood(meal, f.n, f.u, f.k, qty, f.m); added++;
      toast(`${meal}에 ${f.n} 추가`); open = -1; drawBody(false);
    });
  };
  const drawBody = (full = true) => {
    el.querySelectorAll('#fmode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode)); segThumb(el);
    const body = el.querySelector('#fbody');
    if (mode === 'search') {
      if (full) body.innerHTML = `<div class="sbox">${ic('search', 17)}<input id="fq" type="search" placeholder="음식 이름 검색 (예: 김치찌개)" value="${esc(q)}" autocomplete="off"></div>
        <div class="chips mt" id="fcat"></div><div id="fres"></div>`;
      const cats = ['전체', ...Object.keys(FOODS), ...(db.customFoods.length ? ['내 음식'] : [])];
      body.querySelector('#fcat').innerHTML = cats.map(c => `<button class="chip ${c === cat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
      body.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { cat = b.dataset.cat; open = -1; drawBody(false); });
      const all = allFoods(), qq = q.replace(/\s/g, '');
      results = all.filter(f => (cat === '전체' || f.c === cat) && (!qq || f.n.replace(/\s/g, '').includes(qq)));
      if (cat === '전체' && !qq) results = results.slice(0, 30);
      body.querySelector('#fres').innerHTML = resultList(results) + '<p class="dim center mt">칼로리는 일반적인 1인분 기준 대략값이야</p>';
      if (full) body.querySelector('#fq').oninput = e => { q = e.target.value; open = -1; drawBody(false); };
      bindResults();
    } else if (mode === 'freq') {
      results = freqFoods();
      body.innerHTML = results.length ? resultList(results) : '<div class="empty">아직 기록이 없어. 먹은 음식을 추가하면 여기 모여</div>';
      bindResults();
    } else if (mode === 'self') {
      let kcal = 300; const mac = [null, null, null], ML = ['탄수화물', '단백질', '지방'];
      body.innerHTML = `<div class="card" style="margin:0"><h2>음식 이름</h2><input id="sn" placeholder="예: 엄마표 김치볶음밥">
        <h2 class="mt2">칼로리</h2><button class="pill num" id="sk" style="width:100%;font-size:24px;padding:14px">${kcal}<small>kcal</small></button>
        <h2 class="mt2">탄단지 <span class="dim">선택 · 모르면 비워둬</span></h2>
        <div class="grid3">${ML.map((l, i) => `<button class="pill num" data-mac="${i}" style="font-size:15px"><span class="dim" style="display:block;font-size:11px">${l}</span><b>—</b><small>g</small></button>`).join('')}</div>
        <div class="row mt"><span class="f muted">내 음식에 저장 (다음에 검색됨)</span><button class="tgl on" id="ssv" aria-label="내 음식에 저장"></button></div></div>
        <button class="btn pri mt" id="sadd">${meal}에 추가</button>`;
      body.querySelector('#sk').onclick = async () => {
        const v = await openRuler({ title: '칼로리', unit: 'kcal', min: 0, max: 2500, step: 10, px: 12, major: 10, value: kcal, theme: 't-diet' });
        if (v != null) { kcal = v; body.querySelector('#sk').innerHTML = `${v}<small>kcal</small>`; }
      };
      body.querySelectorAll('[data-mac]').forEach(b => b.onclick = async () => {
        const i = +b.dataset.mac;
        const v = await openRuler({ title: ML[i], unit: 'g', min: 0, max: 200, step: 1, px: 14, major: 10, value: mac[i] ?? 20, theme: 't-diet' });
        if (v != null) { mac[i] = v; b.querySelector('b').textContent = v; }
      });
      body.querySelector('#ssv').onclick = e => e.currentTarget.classList.toggle('on');
      body.querySelector('#sadd').onclick = () => {
        const n = body.querySelector('#sn').value.trim(); if (!n) return toast('음식 이름을 적어줘');
        const mm = mac.some(x => x != null) ? mac.map(x => x || 0) : null;
        if (body.querySelector('#ssv').classList.contains('on') && !db.customFoods.some(f => f.name === n)) db.customFoods.push({ name: n, kcal, unit: '1인분', m: mm });
        addFood(meal, n, '1인분', kcal, 1, mm); added++; toast(`${meal}에 ${n} 추가`); body.querySelector('#sn').value = '';
      };
    } else if (mode === 'photo') photoMode(body, () => meal, () => added++);
    else if (mode === 'tpl') tplMode(body, () => meal, () => added++);
  };
  el.querySelectorAll('#fmode button').forEach(b => b.onclick = () => { mode = b.dataset.m; open = -1; drawBody(); });
  drawMeals(); drawBody();
}

/* ---------- 사진 AI 인식 (Gemini) ---------- */
function photoMode(body, getMeal, onAdd) {
  if (!db.cfg.apiKey) {
    body.innerHTML = `<div class="card center" style="margin:0"><div class="bigic">${ic('key-round', 30)}</div><b>Gemini API 키가 필요해</b>
      <p class="muted">설정 → AI 사진 인식에서 키를 넣으면 사진으로 음식·칼로리를 추정할 수 있어 (무료)</p>
      <button class="btn pri" onclick="document.querySelector('.sh .shx').click();setTimeout(()=>go('settings'),350)">설정으로 가기</button></div>`;
    return;
  }
  body.innerHTML = `<label class="btn pri" style="cursor:pointer">${ic('camera', 18)}사진 찍기 / 고르기<input type="file" accept="image/*" id="pf" hidden></label>
    <div id="pout" class="mt"><p class="dim center">음식이 잘 보이게 위에서 찍어줘. 결과는 대략적인 추정치야</p></div>`;
  body.querySelector('#pf').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const out = body.querySelector('#pout');
    let b64;
    try { b64 = await shrink(f); } catch (err) { out.innerHTML = '<div class="empty">사진을 읽지 못했어</div>'; return; }
    out.innerHTML = `<div class="scanning" style="border-radius:16px;overflow:hidden"><img class="shot" src="data:image/jpeg;base64,${b64}"></div>
      <div class="center mt muted"><span class="spin" style="border-top-color:var(--diet);vertical-align:middle"></span> AI가 음식을 분석 중…</div>`;
    try {
      const foods = await geminiFoods(b64);
      if (!foods.length) { out.innerHTML = `<img class="shot" src="data:image/jpeg;base64,${b64}"><div class="empty">음식을 찾지 못했어. 다른 각도로 찍어봐</div>`; return; }
      const st = foods.map(() => ({ on: true, qty: 1 }));
      const draw = () => {
        const tot = foods.reduce((a, x, i) => a + (st[i].on ? x.kcal * st[i].qty : 0), 0);
        out.innerHTML = `<img class="shot" src="data:image/jpeg;base64,${b64}" style="aspect-ratio:16/9">
          ${foods.map((x, i) => `<div class="fres" style="flex-wrap:wrap;animation:rise .4s ${i * 80}ms both"><div class="f"><div style="font-weight:600">${esc(x.name)}</div><div class="dim">${esc(x.amount || '')}${x.m ? ` · <span class="mc">탄${Math.round(x.m[0] * st[i].qty)}</span> <span class="mp">단${Math.round(x.m[1] * st[i].qty)}</span> <span class="mf">지${Math.round(x.m[2] * st[i].qty)}</span>` : ''}</div></div>
            <span class="k num">${fmtK(x.kcal * st[i].qty)}<span class="unit">kcal</span></span><button class="tgl ${st[i].on ? 'on' : ''}" data-t="${i}" aria-label="포함"></button>
            ${st[i].on ? `<div class="qty" style="width:100%">${[0.5, 1, 1.5, 2].map(q => `<button class="${q === st[i].qty ? 'on' : ''}" data-pq="${i}:${q}">×${q}</button>`).join('')}</div>` : ''}</div>`).join('')}
          <button class="btn pri mt" id="padd" ${tot ? '' : 'disabled'}>${getMeal()}에 추가 · ${fmtK(tot)} kcal</button>`;
        out.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { st[+b.dataset.t].on = !st[+b.dataset.t].on; draw(); });
        out.querySelectorAll('[data-pq]').forEach(b => b.onclick = () => { const [i, q] = b.dataset.pq.split(':'); st[+i].qty = +q; draw(); });
        out.querySelector('#padd').onclick = () => {
          let n = 0; foods.forEach((x, i) => { if (st[i].on) { addFood(getMeal(), x.name, x.amount || '사진 인식', x.kcal, st[i].qty, x.m); n++; onAdd(); } });
          toast(`${n}개 추가`); out.innerHTML = '<div class="empty">추가 완료! 다른 사진도 찍어봐</div>';
        };
      };
      draw();
    } catch (err) { out.innerHTML = `<div class="card" style="margin:0"><b style="color:var(--danger)">분석 실패</b><p class="muted">${esc(err.message)}</p></div>`; }
    e.target.value = '';
  };
}
function shrink(file, max = 1024) {
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = rej; img.src = url;
  });
}
async function geminiFoods(b64) {
  const prompt = `이 사진 속 음식을 모두 찾아서 사진에 보이는 양 기준으로 칼로리를 추정해줘. 한국 음식은 한국 기준으로.
반드시 JSON만 출력: {"foods":[{"name":"음식 이름(한국어)","amount":"양 설명(예: 1공기, 약 200g)","kcal":정수,"carbs":탄수화물g,"protein":단백질g,"fat":지방g}]}
음식이 없으면 {"foods":[]}`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(db.cfg.model || 'gemini-flash-latest')}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': db.cfg.apiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: b64 } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } })
  }).catch(() => { throw new Error('인터넷 연결을 확인해줘'); });
  if (!r.ok) {
    let m = ''; try { m = (await r.json()).error.message; } catch (e) {}
    if (r.status === 400 || r.status === 403) throw new Error('API 키가 올바르지 않아. 설정에서 확인해줘. ' + m);
    if (r.status === 404) throw new Error('모델 이름을 찾을 수 없어. 설정에서 모델을 바꿔봐. ' + m);
    if (r.status === 429) throw new Error('무료 사용 한도를 넘었어. 잠시 후 다시 해봐.');
    throw new Error(`오류 ${r.status} ${m}`);
  }
  const j = await r.json();
  let t = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  t = t.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  const d = JSON.parse(t);
  return (d.foods || []).filter(x => x && x.name).map(x => ({ name: String(x.name), amount: String(x.amount || ''), kcal: Math.max(0, Math.round(+x.kcal || 0)), m: x.protein != null ? [+x.carbs || 0, +x.protein || 0, +x.fat || 0] : null }));
}

/* =========================================================
   체중 · 체성분
   ========================================================= */
const METRICS = [
  { k: 'kg', name: '체중', unit: 'kg', min: 30, max: 200, step: 0.1, px: 12, def: 70 },
  { k: 'muscle', name: '골격근량', unit: 'kg', min: 10, max: 80, step: 0.1, px: 12, def: 30 },
  { k: 'fat', name: '체지방률', unit: '%', min: 3, max: 60, step: 0.1, px: 12, def: 20 },
];
let bodyDate = ymd(), bodyMetric = 'kg', bodyRange = 30;
function lastVal(k, before) { const a = sortedW().filter(w => w[k] != null && (!before || w.date < before)); return a[a.length - 1]; }
VIEWS.body = () => {
  const e = db.weights.find(w => w.date === bodyDate) || {};
  const tiles = METRICS.map((m, i) => {
    const v = e[m.k], prev = lastVal(m.k, bodyDate), d = v != null && prev ? v - prev[m.k] : null;
    return `<button class="mtile ${v == null ? 'unset' : ''}" style="--i:${i}" onclick="editBody('${m.k}')"><span class="edit">${ic('pencil', 13)}</span><div class="l">${m.name}</div>
      <div class="v num">${v != null ? `<span data-count="${v}" data-dec="1">0</span>` : '—'}<span class="unit">${m.unit}</span></div>
      <div class="d">${d == null ? `<span class="dim">${v == null ? '탭해서 기록' : '첫 기록'}</span>` : d === 0 ? '<span class="dim">변화 없음</span>' : `<span class="${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}</span>`}</div></button>`;
  }).join('');
  const all = sortedW().filter(w => w[bodyMetric] != null);
  const from = bodyRange ? addDays(ymd(), -bodyRange) : '0000';
  const pts = all.filter(w => w.date >= from);
  const M = METRICS.find(m => m.k === bodyMetric);
  return `${topbar('체중 · 체성분', md(bodyDate))}
  ${dstrip(bodyDate, d => db.weights.some(w => w.date === d), 'setBodyDate')}
  <div class="grid3" data-key="tiles">${tiles}</div>
  ${goalCard()}
  <div class="card" data-key="chart" style="--i:3"><div class="seg"><i class="thumb"></i>${METRICS.map(m => `<button class="${m.k === bodyMetric ? 'on' : ''}" onclick="bodyMetric='${m.k}';render()">${m.name}</button>`).join('')}</div>
    <div class="chips mt" style="justify-content:flex-end">${[[30, '1개월'], [90, '3개월'], [365, '1년'], [0, '전체']].map(([r, l]) => `<button class="chip ${r === bodyRange ? 'on' : ''}" style="padding:6px 12px;font-size:13px" onclick="bodyRange=${r};render()">${l}</button>`).join('')}</div>
    <div class="chart mt" id="bchart" data-own></div>
    ${pts.length >= 2 ? `<div class="row mt" style="justify-content:space-around;text-align:center">
      <div><div class="dim">시작</div><b class="num">${pts[0][bodyMetric].toFixed(1)}${M.unit}</b></div>
      <div><div class="dim">현재</div><b class="num">${pts[pts.length - 1][bodyMetric].toFixed(1)}${M.unit}</b></div>
      <div><div class="dim">변화</div><b class="num ${pts[pts.length - 1][bodyMetric] - pts[0][bodyMetric] > 0 ? 'up' : 'down'}">${(pts[pts.length - 1][bodyMetric] - pts[0][bodyMetric] > 0 ? '+' : '') + (pts[pts.length - 1][bodyMetric] - pts[0][bodyMetric]).toFixed(1)}</b></div></div>` : ''}</div>
  <div class="card" data-key="list" style="--i:4"><h2>기록</h2>${sortedW().reverse().slice(0, 30).map(w => `<div class="li" data-key="${w.date}"><div class="f"><div class="t">${md(w.date)}</div>
    <div class="dim">${METRICS.map(m => w[m.k] != null ? `${m.name} ${w[m.k].toFixed(1)}${m.unit}` : '').filter(Boolean).join(' · ')}</div></div>
    <button class="x" onclick="delBody('${w.date}')" aria-label="삭제">${ic('x', 16)}</button></div>`).join('') || '<div class="empty">아직 기록이 없어. 위 카드를 탭해봐</div>'}</div>`;
};
AFTER.body = () => {
  scrollStrip();
  const M = METRICS.find(m => m.k === bodyMetric), from = bodyRange ? addDays(ymd(), -bodyRange) : '0000';
  const pts = sortedW().filter(w => w[bodyMetric] != null && w.date >= from).map(w => ({ x: w.date, v: w[bodyMetric] }));
  lineChart($('#bchart'), pts, { color: ['#22d3a0', '#18b4d6'], unit: M.unit, dec: 1 });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const i = document.querySelector('.gbar i'), m = document.querySelector('.gbar .gme');
    if (i) i.style.width = i.dataset.w + '%'; if (m) m.style.left = m.dataset.l + '%';
  }));
};
function setBodyDate(d) { bodyDate = d; render(); }
async function editBody(k) {
  const m = METRICS.find(x => x.k === k), e = db.weights.find(w => w.date === bodyDate);
  const start = e?.[k] ?? lastVal(k)?.[k] ?? m.def;
  const v = await openRuler({ title: `${m.name} · ${md(bodyDate)}`, unit: m.unit, min: m.min, max: m.max, step: m.step, px: m.px, value: start, theme: 't-body' });
  if (v == null) return;
  let w = db.weights.find(x => x.date === bodyDate);
  if (!w) { w = { date: bodyDate }; db.weights.push(w); }
  w[k] = v; save(); render(); toast(`${m.name} ${v.toFixed(1)}${m.unit} 저장`);
}
function delBody(d) {
  const i = db.weights.findIndex(w => w.date === d); if (i < 0) return;
  const [w] = db.weights.splice(i, 1); save(); render();
  snack(`${md(d)} 체성분 기록 삭제`, () => db.weights.splice(i, 0, w));
}

/* ---------- 라인 차트 ---------- */
function lineChart(box, pts, o) {
  if (!box) return;
  if (chartSame(box, JSON.stringify(pts) + o.unit + o.color)) return;
  if (pts.length < 2) { box.innerHTML = `<div class="empty">${ic('chart-line', 26)}<br>기록이 2개 이상이면 그래프가 나와</div>`; return; }
  const W = 340, H = 170, L = 34, R = 12, T = 14, B = 22, id = 'lg' + uid();
  let mn = Math.min(...pts.map(p => p.v)), mx = Math.max(...pts.map(p => p.v));
  if (mx - mn < 1) { const c = (mx + mn) / 2; mn = c - .5; mx = c + .5; }
  const pad = (mx - mn) * .15; mn -= pad; mx += pad;
  const t0 = +new Date(pts[0].x), t1 = +new Date(pts[pts.length - 1].x);
  const x = p => L + (W - L - R) * ((+new Date(p.x) - t0) / Math.max(1, t1 - t0));
  const y = v => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(x(pts[i]) - x(pts[i - 1]), y(pts[i].v) - y(pts[i - 1].v));
  const ticks = [0, 1, 2, 3].map(k => mn + (mx - mn) * k / 3);
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.color[0]}" stop-opacity=".35"/><stop offset="1" stop-color="${o.color[0]}" stop-opacity="0"/></linearGradient>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${o.color[0]}"/><stop offset="1" stop-color="${o.color[1]}"/></linearGradient></defs>
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#2a2f3b" stroke-width="1"/><text x="${L - 6}" y="${y(t) + 4}" fill="#6b7383" font-size="10" text-anchor="end">${t.toFixed(o.dec)}</text>`).join('')}
    <text x="${L}" y="${H - 4}" fill="#6b7383" font-size="10">${pts[0].x.slice(5).replace('-', '/')}</text>
    <text x="${W - R}" y="${H - 4}" fill="#6b7383" font-size="10" text-anchor="end">${pts[pts.length - 1].x.slice(5).replace('-', '/')}</text>
    <path class="area" d="${d}L${x(pts[pts.length - 1])},${H - B}L${x(pts[0])},${H - B}Z" fill="url(#${id})"/>
    <path class="ln" style="--len:${len}" d="${d}" fill="none" stroke="url(#${id}s)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.length <= 40 ? pts.map(p => `<circle cx="${x(p)}" cy="${y(p.v)}" r="4" fill="${o.color[1]}" stroke="#171a22" stroke-width="2" class="area"/>`).join('') : ''}
    <line class="cx" y1="${T}" y2="${H - B}" stroke="#a3abb9" stroke-dasharray="3 3" style="display:none"/>
    <circle class="cd" r="6" fill="#fff" stroke="${o.color[0]}" stroke-width="3" style="display:none"/></svg><div class="tip"></div>`;
  const svg = box.querySelector('svg'), tip = box.querySelector('.tip'), cx = box.querySelector('.cx'), cd = box.querySelector('.cd');
  const mv = e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width;
    let bi = 0, bd = 1e9; pts.forEach((p, i) => { const dd = Math.abs(x(p) - px); if (dd < bd) { bd = dd; bi = i; } });
    const p = pts[bi];
    cx.setAttribute('x1', x(p)); cx.setAttribute('x2', x(p)); cx.style.display = ''; cd.setAttribute('cx', x(p)); cd.setAttribute('cy', y(p.v)); cd.style.display = '';
    tip.style.display = 'block'; tip.style.left = x(p) * r.width / W + 'px'; tip.style.top = y(p.v) * r.height / H + 'px';
    tip.textContent = `${p.x.slice(5).replace('-', '/')} · ${p.v.toFixed(o.dec)}${o.unit}`;
  };
  svg.addEventListener('pointermove', mv); svg.addEventListener('pointerdown', mv);
  svg.addEventListener('pointerleave', () => { tip.style.display = 'none'; cx.style.display = 'none'; cd.style.display = 'none'; });
}

/* =========================================================
   수면
   ========================================================= */
let sleepDate = ymd(), sleepDraft = null;
const QUAL = [['frown', '#ff6b6b', '최악'], ['annoyed', '#ff9a3d', '별로'], ['meh', '#ffc53d', '보통'], ['smile', '#7dd3fc', '좋음'], ['laugh', '#2fd27a', '최고']];
VIEWS.sleep = () => {
  const e = db.sleeps.find(s => s.date === sleepDate), last = sortedS().slice(-1)[0];
  if (!sleepDraft || sleepDraft._d !== sleepDate) sleepDraft = e ? { ...e, _d: sleepDate } : { bed: last?.bed ?? 23 * 60 + 30, wake: last?.wake ?? 7 * 60, q: 0, _d: sleepDate };
  const last7 = [...Array(7)].map((_, i) => addDays(ymd(), i - 6)), got = last7.map(d => db.sleeps.find(s => s.date === d)).filter(Boolean);
  const avg = got.length ? got.reduce((a, s) => a + sleepDur(s), 0) / got.length : 0;
  return `${topbar('수면', `${md(sleepDate)} 아침에 일어남`)}
  ${dstrip(sleepDate, d => db.sleeps.some(s => s.date === d), 'setSleepDate')}
  <div class="card" data-key="dialc" style="--i:0"><div class="dial" id="dial" data-own></div>
    <div class="times"><div><span class="dim">${ic('moon', 13)} 취침</span><b class="num" id="tbed"></b></div><div><span class="dim">${ic('sun', 13)} 기상</span><b class="num" id="twake"></b></div></div>
    <div class="dim center mt">달·해 손잡이를 드래그해서 맞춰줘</div></div>
  <div class="card" data-key="qual" style="--i:1"><h2>수면 만족도</h2><div class="qual">${QUAL.map(([n, c, l], i) => `<button class="${sleepDraft.q === i + 1 ? 'on' : ''}" style="--qc:${c}" onclick="sleepDraft.q=${i + 1};document.querySelectorAll('.qual button').forEach((b,j)=>b.classList.toggle('on',j===${i}))">${ic(n, 26)}<small>${l}</small></button>`).join('')}</div></div>
  <button class="btn pri" data-key="save" onclick="saveSleep()">${e ? '수정 저장' : '기록 저장'}</button>
  ${e ? `<button class="btn danger mt" data-key="del" onclick="delSleep()">${ic('trash-2', 17)}이 날 기록 삭제</button>` : ''}
  <div class="card mt2" data-key="week" style="--i:2"><h2>최근 7일 <span class="dim">평균 ${got.length ? hm(avg) : '—'} · 목표 ${hm(db.cfg.sleepGoal)}</span></h2><div class="chart" id="schart" data-own></div>
    <button class="chip mt" onclick="setSleepGoal()">${ic('target', 15)}목표 변경</button></div>`;
};
AFTER.sleep = () => { scrollStrip(); drawDial(); sleepChart(); };
function setSleepDate(d) { sleepDate = d; render(); }
function drawDial() {
  const box = $('#dial'); if (!box) return;
  const S = 290, c = S / 2, R = 112, C = 2 * Math.PI * R;
  const ang = m => m / 1440 * 360, pos = (m, r = R) => { const a = (ang(m) - 90) * Math.PI / 180; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const ticks = [...Array(48)].map((_, i) => { const m = i * 30, maj = i % 12 === 0, [x1, y1] = pos(m, R - 21), [x2, y2] = pos(m, R - (maj ? 29 : 25)); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${maj ? '#a3abb9' : '#3a4050'}" stroke-width="${maj ? 2 : 1}"/>`; }).join('');
  const labels = [[0, '0'], [360, '6'], [720, '12'], [1080, '18']].map(([m, l]) => { const [x, y] = pos(m, R - 38); return `<text x="${x}" y="${y + 4}" fill="#6b7383" font-size="12" font-weight="700" text-anchor="middle">${l}</text>`; }).join('');
  const hdl = (id, name, col) => `<g class="hdl" id="${id}"><circle r="19" fill="#12151c" stroke="${col}" stroke-width="2"/>
    <g transform="translate(-10,-10) scale(.8333)" fill="none" stroke="${col}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g></g>`;
  box.innerHTML = `<svg viewBox="0 0 ${S} ${S}"><defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a07bff"/><stop offset="1" stop-color="#5b6cff"/></linearGradient></defs>
    <circle cx="${c}" cy="${c}" r="${R}" fill="none" stroke="#1e222c" stroke-width="34"/>${ticks}${labels}
    <circle id="sarc" cx="${c}" cy="${c}" r="${R}" fill="none" stroke="url(#sg)" stroke-width="34" stroke-linecap="round" style="transition:stroke-dasharray .1s"/>
    ${hdl('hbed', 'moon', '#c4b5fd')}${hdl('hwake', 'sun', '#fcd34d')}</svg>
    <div class="mid"><div><div class="dim">총 수면</div><div class="big num" id="sdur" style="font-size:24px"></div><div class="dim" id="sgoal"></div></div></div>`;
  const svg = box.querySelector('svg'), arc = svg.querySelector('#sarc');
  const upd = () => {
    const dur = sleepDur(sleepDraft);
    arc.setAttribute('stroke-dasharray', `${C * dur / 1440} ${C}`);
    arc.setAttribute('transform', `rotate(${ang(sleepDraft.bed) - 90} ${c} ${c})`);
    [['hbed', sleepDraft.bed], ['hwake', sleepDraft.wake]].forEach(([id, m]) => { const [x, y] = pos(m); svg.querySelector('#' + id).setAttribute('transform', `translate(${x},${y})`); });
    $('#sdur').textContent = hm(dur); $('#tbed').textContent = clock(sleepDraft.bed); $('#twake').textContent = clock(sleepDraft.wake);
    const g = dur - db.cfg.sleepGoal; $('#sgoal').innerHTML = g >= 0 ? `<span class="down">목표 달성</span>` : `목표까지 ${hm(-g)}`;
  };
  let dragging = null;
  const toMin = e => { const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) * S / r.width - c, y = (e.clientY - r.top) * S / r.height - c; let a = Math.atan2(x, -y) * 180 / Math.PI; if (a < 0) a += 360; return Math.round(a / 360 * 1440 / 5) * 5 % 1440; };
  ['hbed', 'hwake'].forEach(id => svg.querySelector('#' + id).addEventListener('pointerdown', e => { dragging = id === 'hbed' ? 'bed' : 'wake'; svg.setPointerCapture(e.pointerId); e.preventDefault(); }));
  svg.addEventListener('pointermove', e => { if (!dragging) return; sleepDraft[dragging] = toMin(e); upd(); });
  svg.addEventListener('pointerup', () => dragging = null); svg.addEventListener('pointercancel', () => dragging = null);
  upd();
}
function saveSleep() {
  const { _d, ...s } = sleepDraft; s.date = sleepDate;
  if (sleepDur(s) === 0) return toast('취침·기상 시간이 같아');
  db.sleeps = db.sleeps.filter(x => x.date !== sleepDate); db.sleeps.push(s); save();
  sleepDraft = null; render(); toast(`${hm(sleepDur(s))} 수면 저장`);
}
function delSleep() {
  const i = db.sleeps.findIndex(x => x.date === sleepDate); if (i < 0) return;
  const [s] = db.sleeps.splice(i, 1); sleepDraft = null; save(); render();
  snack(`${md(s.date)} 수면 기록 삭제`, () => { db.sleeps.splice(i, 0, s); sleepDraft = null; });
}
async function setSleepGoal() {
  const v = await openRuler({ title: '수면 목표', unit: '시간', min: 4, max: 12, step: 0.5, px: 30, major: 2, value: db.cfg.sleepGoal / 60, quick: [6, 7, 7.5, 8], theme: 't-sleep' });
  if (v != null) { db.cfg.sleepGoal = v * 60; save(); render(); }
}
function sleepChart() {
  const box = $('#schart'); if (!box) return;
  const days = [...Array(7)].map((_, i) => addDays(ymd(), i - 6));
  const vals = days.map(d => { const s = db.sleeps.find(x => x.date === d); return s ? sleepDur(s) / 60 : 0; });
  const goal = db.cfg.sleepGoal / 60;
  if (chartSame(box, JSON.stringify([days, vals, goal]))) return;
  const W = 340, H = 160, L = 26, B = 22, T = 16, mx = Math.max(10, goal + 1, ...vals);
  const bw = (W - L) / 7, y = v => T + (H - T - B) * (1 - v / mx);
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="bg1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a07bff"/><stop offset="1" stop-color="#5b6cff"/></linearGradient></defs>
    ${[0, 4, 8].map(t => `<line x1="${L}" x2="${W}" y1="${y(t)}" y2="${y(t)}" stroke="#2a2f3b"/><text x="${L - 6}" y="${y(t) + 4}" fill="#6b7383" font-size="10" text-anchor="end">${t}h</text>`).join('')}
    ${vals.map((v, i) => { const x = L + i * bw + bw * .22, w = bw * .56; return v ? `<rect class="bar" style="animation-delay:${i * 60}ms" x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="6" fill="url(#bg1)" opacity="${v >= goal ? 1 : .55}"><title>${v.toFixed(1)}h</title></rect>
      <text x="${x + w / 2}" y="${y(v) - 5}" fill="#eef1f6" font-size="10" font-weight="700" text-anchor="middle">${v.toFixed(1)}</text>` : ''; }).join('')}
    <line x1="${L}" x2="${W}" y1="${y(goal)}" y2="${y(goal)}" stroke="#eef1f6" stroke-dasharray="4 4" opacity=".6"/>
    <text x="${W}" y="${y(goal) - 5}" fill="#a3abb9" font-size="10" text-anchor="end">목표</text>
    ${days.map((d, i) => `<text x="${L + i * bw + bw / 2}" y="${H - 5}" fill="${d === ymd() ? '#eef1f6' : '#6b7383'}" font-size="11" text-anchor="middle">${WD[new Date(d + 'T00:00').getDay()]}</text>`).join('')}</svg>`;
}

/* =========================================================
   설정
   ========================================================= */
const srow = (icon, label, ctl, sub = '') => `<div class="li"><span class="lic">${ic(icon, 17)}</span><div class="f t">${label}${sub ? `<div class="dim">${sub}</div>` : ''}</div>${ctl}</div>`;
VIEWS.settings = () => `${topbar('설정')}
  <div class="card" style="--i:0"><h2>목표</h2>
    ${srow('utensils', '하루 칼로리', `<button class="chip" onclick="setKcalGoal()">${fmtK(db.cfg.kcalGoal)} kcal</button>`)}
    ${srow('calendar-days', '주간 운동 목표', `<button class="chip" onclick="setWeekGoal()">주 ${db.cfg.weekGoal}일</button>`)}
    ${srow('moon', '수면', `<button class="chip" onclick="setSleepGoal()">${hm(db.cfg.sleepGoal)}</button>`)}
    ${srow('timer', '휴식 시간', `<button class="chip" onclick="setRestDefault()">${db.cfg.rest}초</button>`)}</div>
  <div class="card" style="--i:1"><h2>운동 · 생활</h2>
    ${srow('building-2', '내 헬스장 기구', `<button class="chip" onclick="go('equip')">${Array.isArray(db.equip) ? `${db.equip.length}/${EQUIP.length}개` : '전부 있음'}</button>`)}
    ${srow('flame', '워밍업 자동 추가', `<button class="tgl ${db.cfg.autoWarm ? 'on' : ''}" onclick="db.cfg.autoWarm=!db.cfg.autoWarm;save();render()" aria-label="워밍업 자동 추가"></button>`, '바벨 종목 · 작업 무게 기준')}
    ${srow('calculator', '바 · 원판 구성', `<button class="chip" onclick="plateSheet(60)">바 ${barKg()}kg</button>`)}
    ${srow('glass-water', '물 목표', `<button class="chip" onclick="setWaterGoal()">${db.cfg.waterGoal}컵 (${fmtN(db.cfg.waterGoal * db.cfg.cupMl / 1000, 2)}L)</button>`)}
    ${srow('cup-soda', '1컵 용량', `<button class="chip" onclick="setCupMl()">${db.cfg.cupMl}ml</button>`)}
    ${srow('leaf', '디로드 주간', `<button class="chip" onclick="${deloadOn() ? 'db.cfg.deloadUntil=null;save();render()' : 'startDeload()'}">${deloadOn() ? '진행 중 · 끝내기' : '지금 시작'}</button>`)}</div>
  <div class="card" style="--i:2"><h2>내 정보 <span class="dim">활동대사량 계산용</span></h2>
    ${srow('user', '성별', `<div class="seg" style="width:140px"><i class="thumb"></i><button class="${db.cfg.sex === 'M' ? 'on' : ''}" onclick="db.cfg.sex='M';save();render()">남</button><button class="${db.cfg.sex === 'F' ? 'on' : ''}" onclick="db.cfg.sex='F';save();render()">여</button></div>`)}
    ${srow('cake', '나이', `<button class="chip" onclick="setProfile('age')">${db.cfg.age ? db.cfg.age + '세' : '입력'}</button>`)}
    ${srow('ruler', '키', `<button class="chip" onclick="setProfile('height')">${db.cfg.height ? db.cfg.height + 'cm' : '입력'}</button>`)}</div>
  <div class="card" style="--i:3"><h2>AI 사진 인식 (Gemini)</h2>
    <p class="muted" style="margin-top:0">aistudio.google.com 에서 무료 API 키를 받아 붙여넣어줘. 키는 이 폰에만 저장돼.</p>
    <input id="akey" type="password" placeholder="API 키 붙여넣기" value="${esc(db.cfg.apiKey)}" autocomplete="off">
    <input id="amodel" class="mt" placeholder="모델" value="${esc(db.cfg.model)}" autocomplete="off">
    <button class="btn pri mt" onclick="db.cfg.apiKey=$('#akey').value.trim();db.cfg.model=$('#amodel').value.trim()||'gemini-flash-latest';save();toast('저장됨')">저장</button></div>
  <div class="card" style="--i:4"><h2>백업 <span class="dim">${db.cfg.lastBackup ? `마지막 ${backupAge()}일 전` : '백업 기록 없음'}</span></h2><p class="muted" style="margin-top:0">데이터는 이 폰에만 있어. 공유창에서 "파일에 저장 → iCloud Drive"를 고르면 안전해. 7일마다 홈 알림에 떠.</p>
    <button class="btn pri" onclick="exportData()">${ic('upload', 18)}백업 파일 내보내기</button>
    <label class="btn mt" style="cursor:pointer">${ic('download', 18)}백업 불러오기<input type="file" accept="application/json,.json" hidden onchange="importData(this)"></label></div>
  <div class="card" style="--i:5"><button class="btn danger" onclick="wipe()">${ic('trash-2', 17)}모든 데이터 삭제</button></div>
  <p class="dim center">헬스로그 v5 · 아이콘 Lucide (ISC)</p>`;
async function setProfile(k) {
  const o = k === 'age' ? { title: '나이', unit: '세', min: 14, max: 80, step: 1, px: 20, major: 5, value: db.cfg.age || 23 }
    : { title: '키', unit: 'cm', min: 140, max: 210, step: 1, px: 16, major: 10, value: db.cfg.height || 173 };
  const v = await openRuler(o); if (v != null) { db.cfg[k] = v; save(); render(); }
}
async function setWeekGoal() { const v = await openRuler({ title: '주간 운동 목표', unit: '일', min: 1, max: 7, step: 1, px: 44, major: 1, value: db.cfg.weekGoal, quick: [3, 4, 5, 6], theme: 't-work' }); if (v != null) { db.cfg.weekGoal = v; save(); render(); } }
async function setWaterGoal() { const v = await openRuler({ title: '하루 물 목표', unit: '컵', min: 4, max: 16, step: 1, px: 30, major: 2, value: db.cfg.waterGoal, quick: [6, 8, 10, 12] }); if (v != null) { db.cfg.waterGoal = v; save(); render(); } }
async function setCupMl() { const v = await openRuler({ title: '1컵 용량', unit: 'ml', min: 100, max: 1000, step: 50, px: 24, major: 2, value: db.cfg.cupMl, quick: [200, 250, 300, 500] }); if (v != null) { db.cfg.cupMl = v; save(); render(); } }
async function exportData() {
  const name = `healthlog-${ymd()}.json`;
  const { cfg, ...rest } = db; const data = { ...rest, cfg: { ...cfg, apiKey: '' } };
  const file = new File([JSON.stringify(data)], name, { type: 'application/json' });
  const done = () => { db.cfg.lastBackup = ymd(); save(); toast('백업 완료', 'hard-drive'); render(); };
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); done(); return; } }
  catch (e) { if (e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click(); done();
}
function importData(input) {
  const f = input.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = async () => {
    input.value = '';
    let d; try { d = JSON.parse(r.result); if (!Array.isArray(d.sets)) throw 0; } catch (e) { toast('올바른 백업 파일이 아니야'); return; }
    const ok = await ask({ title: '백업을 불러올까?', desc: `운동 ${d.sets.length}세트 · 체중 ${(d.weights || []).length} · 식단 ${(d.foods || []).length} · 수면 ${(d.sleeps || []).length}개<br>지금 데이터는 이 파일 내용으로 바뀌어`, ok: '불러오기', danger: true, icon: 'download' });
    if (!ok) return;
    const before = localStorage.getItem(KEY), key = db.cfg.apiKey;
    localStorage.setItem(KEY, JSON.stringify(d)); load(); if (!db.cfg.apiKey) db.cfg.apiKey = key; save(); render(true);
    snack('백업을 불러왔어', () => { if (before) { localStorage.setItem(KEY, before); load(); } }, { icon: 'download', ms: 8000 });
  };
  r.readAsText(f);
}
async function wipe() {
  const ok = await holdAsk({ title: '모든 데이터 삭제', desc: '운동·식단·체중·수면 기록이 전부 지워져.<br>버튼을 꾹 누르고 있으면 삭제돼.', label: '길게 눌러서 전부 삭제' });
  if (!ok) return;
  const snap = JSON.stringify(db), cfg = db.cfg; db = EMPTY(); db.cfg = cfg; save(); render(true);
  snack('모든 데이터를 삭제했어', () => { db = JSON.parse(snap); }, { ms: 8000 });
}

/* =========================================================
   시작
   ========================================================= */
initChrome();
window.addEventListener('DOMContentLoaded', () => {
  load();
  checkAch(false);          // 기존 기록으로 이미 달성한 업적은 조용히 등록
  logRecovery(); save();
  render(true);
});
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
