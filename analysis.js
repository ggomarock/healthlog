'use strict';
/* =========================================================
   공통 계산
   ========================================================= */
const DAY = 86400000;
const dnum = s => Math.round(new Date(s + 'T00:00').getTime() / DAY);   // 날짜 → 일 번호
const monday = (d = ymd()) => { const x = new Date(d + 'T00:00'); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return ymd(x); };
const e1rm = (kg, reps) => (!kg || !reps) ? 0 : reps === 1 ? kg : kg * (1 + reps / 30);   // Epley 공식
function workoutDays() { return [...new Set(db.sets.map(s => s.date))].sort(); }
function dayVolume(d) { return db.sets.filter(s => s.date === d).reduce((a, s) => a + s.kg * s.reps, 0); }
function bestE1RM(ex) { return db.sets.filter(s => s.ex === ex).reduce((m, s) => Math.max(m, e1rm(s.kg, s.reps)), 0); }

/* ---------- 연속 운동 (하루 휴식은 인정, 이틀 연속 쉬면 끊김) ---------- */
function streakInfo() {
  const days = workoutDays(); let run = 0, best = 0; const per = {};
  days.forEach((d, i) => { run = i && dnum(d) - dnum(days[i - 1]) <= 2 ? run + 1 : 1; per[d] = run; best = Math.max(best, run); });
  const last = days[days.length - 1];
  const cur = last && dnum(ymd()) - dnum(last) <= 2 ? per[last] : 0;
  return { cur, best, per, days };
}

/* ---------- 레벨 / XP ---------- */
// XP = 볼륨 100kg당 1 + 운동한 날 30 + 연속 보너스(연속일 × 5, 최대 100)
const xpNeed = L => Math.round(100 * Math.pow(L - 1, 1.6));
function levelInfo() {
  const st = streakInfo(); let xp = 0;
  st.days.forEach(d => { xp += dayVolume(d) / 100 + 30 + 5 * Math.min(st.per[d], 20); });
  xp = Math.floor(xp);
  let lv = 1; while (lv < 100 && xp >= xpNeed(lv + 1)) lv++;
  const lo = xpNeed(lv), hi = lv < 100 ? xpNeed(lv + 1) : lo;
  return { xp, lv, lo, hi, pct: hi > lo ? (xp - lo) / (hi - lo) : 1, tier: tierOf(lv), streak: st };
}
function tierOf(lv) { let t = TIERS[0]; TIERS.forEach(x => { if (lv >= x.lv) t = x; }); return t; }
const TIER_ICON = { '브론즈': 'B', '실버': 'S', '골드': 'G', '플래티넘': 'P', '다이아몬드': 'D', '마스터': 'M', '그랜드마스터': 'GM', '챌린저': 'C' };
function badge(t, size = 64, { locked = false, anim = true } = {}) {
  const id = 'b' + uid(), top = TIERS.indexOf(t) >= 5;
  return `<svg class="badge ${locked ? 'locked' : ''} ${top && !locked ? 'glow' : ''}" viewBox="0 0 100 110" width="${size}" height="${size * 1.1}" style="--t0:${t.c[0]}" aria-label="${t.name}">
    <defs><linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.c[0]}"/><stop offset="1" stop-color="${t.c[1]}"/></linearGradient>
    <clipPath id="c${id}"><path d="M50 4L92 28V80L50 106L8 80V28Z"/></clipPath></defs>
    <path d="M50 4L92 28V80L50 106L8 80V28Z" fill="url(#g${id})" stroke="rgba(255,255,255,.55)" stroke-width="3"/>
    <path d="M50 15L83 34V75L50 95L17 75V34Z" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="2"/>
    ${anim && !locked ? `<g clip-path="url(#c${id})"><rect class="shine" x="-40" y="-10" width="22" height="140" fill="#fff" opacity=".35"/></g>` : ''}
    ${top ? `<path d="M30 20L38 8L50 18L62 8L70 20" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round" opacity=".9"/>` : ''}
    <text x="50" y="${TIER_ICON[t.name].length > 1 ? 67 : 70}" text-anchor="middle" font-size="${TIER_ICON[t.name].length > 1 ? 28 : 38}" font-weight="900" fill="#fff"
      stroke="rgba(0,0,0,.22)" stroke-width="3" paint-order="stroke" font-family="inherit">${TIER_ICON[t.name]}</text></svg>`;
}
function homeLevelChip() {
  const L = levelInfo();
  return `<button class="lvchip" onclick="tab('manage')">${badge(L.tier, 34, { anim: false })}
    <div class="f"><div class="row" style="justify-content:space-between"><b>${L.tier.name} · Lv ${L.lv}</b><span class="dim streak">${L.streak.cur ? `${ic('flame', 13)}${L.streak.cur}일 연속` : '오늘 운동하고 연속 시작'}</span></div>
    <div class="xpbar"><i style="width:${(L.pct * 100).toFixed(1)}%;background:linear-gradient(90deg,${L.tier.c[0]},${L.tier.c[1]})"></i></div></div></button>`;
}

/* ---------- 근육별 자극 / 피로 ---------- */
function muscleSetsSince(fromDate) {
  const m = Object.fromEntries(MUSCLES.map(x => [x, 0])); let unmapped = 0;
  db.sets.filter(s => s.date >= fromDate).forEach(s => {
    const mp = MUSCLE_MAP[s.ex]; if (!mp) { unmapped++; return; }
    mp[0].forEach(x => m[x] += 1); mp[1].forEach(x => m[x] += 0.5);
  });
  return { m, unmapped };
}
function setTime(s) { return s.t > 1e12 ? s.t : new Date(s.date + 'T19:00').getTime(); }
function recovery() {
  const now = Date.now(), from = addDays(ymd(), -6), out = {};
  MUSCLES.forEach(mu => out[mu] = { rec: 100, left: 0, last: null });
  const byDay = {};
  db.sets.filter(s => s.date >= from).forEach(s => {
    const mp = MUSCLE_MAP[s.ex]; if (!mp) return;
    const add = (mu, w) => { const k = s.date + '|' + mu; byDay[k] = byDay[k] || { mu, load: 0, t: 0, date: s.date }; byDay[k].load += w; byDay[k].t = Math.max(byDay[k].t, setTime(s)); };
    mp[0].forEach(x => add(x, 1)); mp[1].forEach(x => add(x, 0.5));
  });
  Object.values(byDay).forEach(({ mu, load, t, date }) => {
    const H = (BIG_MUSCLES.includes(mu) ? 72 : 48) * clamp(load / 6, 0.5, 1.5);   // 필요한 회복 시간
    const el = (now - t) / 3600000, fat = Math.max(0, 1 - el / H) * 100;
    const o = out[mu];
    if (100 - fat < o.rec) o.rec = Math.round(100 - fat);
    o.left = Math.max(o.left, Math.max(0, H - el));
    if (!o.last || date > o.last) o.last = date;
  });
  const tired = MUSCLES.filter(m => out[m].rec < 100);
  const muscleScore = tired.length ? tired.reduce((a, m) => a + out[m].rec, 0) / tired.length : 100;
  const sl = db.sleeps.find(s => s.date === ymd()) || db.sleeps.find(s => s.date === addDays(ymd(), -1));
  const sleepScore = sl ? Math.min(100, sleepDur(sl) / db.cfg.sleepGoal * 100) : null;
  const score = Math.round(sleepScore == null ? muscleScore : muscleScore * 0.75 + sleepScore * 0.25);
  return { out, score, muscleScore: Math.round(muscleScore), sleepScore: sleepScore == null ? null : Math.round(sleepScore), sl };
}

/* ---------- 대사량 ---------- */
function latestFat() { const a = sortedW().filter(w => w.fat != null); return a.length ? a[a.length - 1].fat : null; }
function metabolism() {
  const bw = latestWeight(), fat = latestFat(), c = db.cfg;
  if (!bw) return { need: 'weight' };
  let bmr, how;
  if (fat != null) { bmr = 370 + 21.6 * bw * (1 - fat / 100); how = `Katch-McArdle (제지방량 ${(bw * (1 - fat / 100)).toFixed(1)}kg)`; }
  else if (c.age && c.height) { bmr = 10 * bw + 6.25 * c.height - 5 * c.age + (c.sex === 'F' ? -161 : 5); how = 'Mifflin-St Jeor (체중·키·나이)'; }
  else return { need: 'profile', bw };
  const days7 = new Set(db.sets.filter(s => s.date > addDays(ymd(), -7)).map(s => s.date)).size;
  const [af, al] = days7 === 0 ? [1.2, '거의 안 함'] : days7 <= 2 ? [1.375, '가벼움 (주 1~2회)'] : days7 <= 4 ? [1.55, '보통 (주 3~4회)'] : days7 <= 6 ? [1.725, '많음 (주 5~6회)'] : [1.9, '매우 많음 (매일)'];
  const tdee = bmr * af;
  const logged = [...Array(7)].map((_, i) => addDays(ymd(), -i)).filter(d => db.foods.some(f => f.date === d));
  const intake = logged.length ? logged.reduce((a, d) => a + dayKcal(d), 0) / logged.length : null;
  return { bw, bmr, tdee, af, al, days7, how, intake, loggedDays: logged.length };
}

/* =========================================================
   차트
   ========================================================= */
function barChart(box, o) {
  if (!box) return;
  if (chartSame(box, JSON.stringify([o.vals, o.labels, o.hi, o.goal || 0]))) return;
  const W = 340, H = 170, L = 38, R = 8, T = 18, B = 22, n = o.vals.length;
  const mx = Math.max(1, o.goal || 0, ...o.vals) * 1.12, bw = (W - L - R) / n, y = v => T + (H - T - B) * (1 - v / mx), id = 'bc' + uid();
  const ticks = [0, mx / 2 / 1.12, mx / 1.12].map(v => o.nice ? o.nice(v) : v);
  const maxI = o.vals.indexOf(Math.max(...o.vals));
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${o.color[0]}"/><stop offset="1" stop-color="${o.color[1]}"/></linearGradient></defs>
    ${ticks.map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#2a2f3b"/><text x="${L - 6}" y="${y(t) + 4}" fill="#6b7383" font-size="10" text-anchor="end">${o.tick(t)}</text>`).join('')}
    ${o.vals.map((v, i) => { const x = L + i * bw + bw * .2, w = bw * .6, hl = i === o.hi;
      return `<rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent" data-i="${i}"/>
      ${v ? `<rect class="bar" style="animation-delay:${i * 50}ms" x="${x}" y="${y(v)}" width="${w}" height="${y(0) - y(v)}" rx="${Math.min(6, w / 2)}" fill="url(#${id})" opacity="${o.hi == null || hl || o.dimOthers === false ? 1 : .55}" pointer-events="none"/>` : ''}
      ${v && (i === maxI || hl) ? `<text x="${x + w / 2}" y="${y(v) - 5}" fill="#eef1f6" font-size="10" font-weight="700" text-anchor="middle" pointer-events="none">${o.short(v)}</text>` : ''}`; }).join('')}
    ${o.goal ? `<line x1="${L}" x2="${W - R}" y1="${y(o.goal)}" y2="${y(o.goal)}" stroke="#eef1f6" stroke-dasharray="4 4" opacity=".55" pointer-events="none"/>
      <text x="${W - R}" y="${y(o.goal) - 5}" fill="#a3abb9" font-size="10" text-anchor="end">목표</text>` : ''}
    ${o.labels.map((l, i) => `<text x="${L + i * bw + bw / 2}" y="${H - 5}" fill="${i === o.hi ? '#eef1f6' : '#6b7383'}" font-size="11" font-weight="${i === o.hi ? 700 : 400}" text-anchor="middle">${l}</text>`).join('')}
  </svg><div class="tip"></div>`;
  const svg = box.querySelector('svg'), tip = box.querySelector('.tip');
  const show = e => { const r = e.target.closest('[data-i]'); if (!r) return; const i = +r.dataset.i, br = svg.getBoundingClientRect();
    tip.style.display = 'block'; tip.style.left = (L + i * bw + bw / 2) * br.width / W + 'px'; tip.style.top = y(o.vals[i]) * br.height / H + 'px'; tip.textContent = o.tipf(i); };
  svg.addEventListener('pointerdown', show); svg.addEventListener('pointermove', show);
  svg.addEventListener('pointerleave', () => tip.style.display = 'none');
}
function trendChart(box, pts) {
  if (!box) return;
  if (chartSame(box, JSON.stringify(pts))) return;
  if (pts.length < 2) { box.innerHTML = `<div class="empty">${ic('chart-line', 26)}<br>체중 기록이 2개 이상이면 추세가 나와</div>`; return; }
  const W = 340, H = 180, L = 34, R = 12, T = 14, B = 22;
  const vs = pts.flatMap(p => [p.v, p.avg]); let mn = Math.min(...vs), mx = Math.max(...vs);
  if (mx - mn < 1) { const c = (mx + mn) / 2; mn = c - .5; mx = c + .5; } const pad = (mx - mn) * .15; mn -= pad; mx += pad;
  const t0 = dnum(pts[0].x), t1 = dnum(pts[pts.length - 1].x);
  const x = p => L + (W - L - R) * ((dnum(p.x) - t0) / Math.max(1, t1 - t0)), y = v => T + (H - T - B) * (1 - (v - mn) / (mx - mn));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p).toFixed(1)},${y(p.avg).toFixed(1)}`).join('');
  let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(x(pts[i]) - x(pts[i - 1]), y(pts[i].avg) - y(pts[i - 1].avg));
  box.innerHTML = `<div class="legend"><span><i class="dot" style="background:#8a93a3"></i>측정값</span><span><i class="ln" style="background:#22d3a0"></i>7일 평균</span></div>
    <svg viewBox="0 0 ${W} ${H}">
    ${[0, 1, 2, 3].map(k => mn + (mx - mn) * k / 3).map(t => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="#2a2f3b"/><text x="${L - 6}" y="${y(t) + 4}" fill="#6b7383" font-size="10" text-anchor="end">${t.toFixed(1)}</text>`).join('')}
    <text x="${L}" y="${H - 4}" fill="#6b7383" font-size="10">${pts[0].x.slice(5).replace('-', '/')}</text>
    <text x="${W - R}" y="${H - 4}" fill="#6b7383" font-size="10" text-anchor="end">${pts[pts.length - 1].x.slice(5).replace('-', '/')}</text>
    ${pts.map(p => `<circle class="area" cx="${x(p)}" cy="${y(p.v)}" r="3.5" fill="#8a93a3" stroke="#171a22" stroke-width="1.5"/>`).join('')}
    <path class="ln" style="--len:${len}" d="${d}" fill="none" stroke="#22d3a0" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    <line class="cx" y1="${T}" y2="${H - B}" stroke="#a3abb9" stroke-dasharray="3 3" style="display:none"/></svg><div class="tip"></div>`;
  const svg = box.querySelector('svg'), tip = box.querySelector('.tip'), cx = box.querySelector('.cx');
  const mv = e => { const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width;
    let bi = 0, bd = 1e9; pts.forEach((p, i) => { const dd = Math.abs(x(p) - px); if (dd < bd) { bd = dd; bi = i; } }); const p = pts[bi];
    cx.setAttribute('x1', x(p)); cx.setAttribute('x2', x(p)); cx.style.display = '';
    tip.style.display = 'block'; tip.style.left = x(p) * r.width / W + 'px'; tip.style.top = y(Math.max(p.v, p.avg)) * r.height / H + 'px';
    tip.textContent = `${p.x.slice(5).replace('-', '/')} · ${p.v.toFixed(1)}kg (평균 ${p.avg.toFixed(1)})`; };
  svg.addEventListener('pointermove', mv); svg.addEventListener('pointerdown', mv);
  svg.addEventListener('pointerleave', () => { tip.style.display = 'none'; cx.style.display = 'none'; });
}

/* ---------- 바디맵 ---------- */
const BODY_FRONT = [['어깨', 'e', 32, 54, 9, 8], ['어깨', 'e', 88, 54, 9, 8], ['가슴', 'e', 49, 66, 11, 9], ['가슴', 'e', 71, 66, 11, 9],
  ['이두', 'e', 26, 84, 6, 13], ['이두', 'e', 94, 84, 6, 13], ['복근', 'r', 51, 78, 18, 40], ['대퇴사두', 'e', 48, 164, 9, 25], ['대퇴사두', 'e', 72, 164, 9, 25]];
const BODY_BACK = [['승모', 'e', 60, 47, 17, 7], ['어깨', 'e', 32, 54, 9, 8], ['어깨', 'e', 88, 54, 9, 8], ['등', 'e', 48, 84, 11, 21], ['등', 'e', 72, 84, 11, 21],
  ['삼두', 'e', 26, 84, 6, 13], ['삼두', 'e', 94, 84, 6, 13], ['둔근', 'e', 49, 140, 11, 10], ['둔근', 'e', 71, 140, 11, 10],
  ['햄스트링', 'e', 48, 173, 9, 20], ['햄스트링', 'e', 72, 173, 9, 20], ['종아리', 'e', 48, 213, 7, 16], ['종아리', 'e', 72, 213, 7, 16]];
const HEAT = ['#262b36', 'rgba(255,107,74,.32)', 'rgba(255,107,74,.55)', 'rgba(255,107,74,.8)', '#ff6b4a'];
function bodyMap(val, lvl, fmt) {
  const sil = ox => `<g transform="translate(${ox},0)" fill="#1b1f28"><circle cx="60" cy="20" r="13"/><rect x="54" y="30" width="12" height="10" rx="3"/>
    <rect x="36" y="40" width="48" height="92" rx="16"/><rect x="19" y="46" width="14" height="80" rx="7"/><rect x="87" y="46" width="14" height="80" rx="7"/>
    <circle cx="26" cy="132" r="6"/><circle cx="94" cy="132" r="6"/><rect x="38" y="128" width="21" height="112" rx="10"/><rect x="61" y="128" width="21" height="112" rx="10"/></g>`;
  const shapes = (arr, ox) => arr.map(([m, t, a, b, c, d], i) => {
    const fill = HEAT[lvl(val[m])], common = `data-m="${m}" fill="${fill}" class="mus" style="animation-delay:${i * 40}ms"`;
    return t === 'e' ? `<ellipse ${common} cx="${ox + a}" cy="${b}" rx="${c}" ry="${d}"/>` : `<rect ${common} x="${ox + a}" y="${b}" width="${c}" height="${d}" rx="5"/>`;
  }).join('');
  return `<svg viewBox="0 0 260 256" class="bodymap">${sil(0)}${sil(140)}${shapes(BODY_FRONT, 0)}${shapes(BODY_BACK, 140)}
    <text x="60" y="254" fill="#6b7383" font-size="11" text-anchor="middle">앞</text><text x="200" y="254" fill="#6b7383" font-size="11" text-anchor="middle">뒤</text></svg>`;
}

/* =========================================================
   분석 탭
   ========================================================= */
let anMode = 'stim', anEx = null;
VIEWS.analysis = () => {
  const today = ymd(), mon = monday(), wkDays = [...Array(7)].map((_, i) => addDays(mon, i));
  const lastMon = addDays(mon, -7), lastDays = [...Array(7)].map((_, i) => addDays(lastMon, i));
  // 1. 자극도 / 피로도
  const MS = muscleSetsSince(addDays(today, -6)), RC = recovery();
  const stimLvl = v => v <= 0 ? 0 : v < 5 ? 1 : v < 10 ? 2 : v < 15 ? 3 : 4;
  const fatLvl = v => { const f = 100 - v; return f <= 0 ? 0 : f <= 25 ? 1 : f <= 50 ? 2 : f <= 75 ? 3 : 4; };
  const recVal = Object.fromEntries(MUSCLES.map(m => [m, RC.out[m].rec]));
  const stimSorted = [...MUSCLES].sort((a, b) => MS.m[b] - MS.m[a]);
  // 2. 이번 주 운동량
  const wv = wkDays.map(dayVolume), lwv = lastDays.map(dayVolume), tw = wv.reduce((a, b) => a + b, 0), tlw = lwv.reduce((a, b) => a + b, 0);
  const wSets = db.sets.filter(s => s.date >= mon && s.date <= wkDays[6]).length, wDays = wv.filter(v => v).length;
  const wMin = db.sessions.filter(s => s.date >= mon).reduce((a, s) => a + (s.end - s.start) / 60000, 0);
  const chg = tlw ? Math.round((tw - tlw) / tlw * 100) : null;
  // 3. 근력
  const cnt = {}; db.sets.forEach(s => { if (s.kg > 0) cnt[s.ex] = (cnt[s.ex] || 0) + 1; });
  const exs = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]).slice(0, 10);
  if (!anEx || !exs.includes(anEx)) anEx = exs[0] || null;
  // 5. 칼로리
  const wk = wkDays.map(dayKcal), goal = db.cfg.kcalGoal, logged = wkDays.filter((d, i) => wk[i] > 0);
  const avgK = logged.length ? wk.reduce((a, b) => a + b, 0) / logged.length : 0;
  // 6. 대사량
  const MB = metabolism();
  const hiIdx = wkDays.indexOf(today);
  const score = RC.score, sc = score >= 80 ? ['컨디션 최고', '고강도 운동도 OK', '#2fd27a'] : score >= 60 ? ['보통', '회복 덜 된 부위는 피하자', '#ffc53d'] : ['피로 누적', '휴식이나 가벼운 운동 추천', '#ff5d6c'];
  const ready = MUSCLES.filter(m => RC.out[m].rec === 100 && (!RC.out[m].last || RC.out[m].last <= addDays(today, -3)));
  return `${topbar('분석', '이번 주 ' + md(mon).replace(/ \(.\)/, '') + ' ~', `<button class="btn sm" onclick="openReport()">${ic('mail', 16)}리포트</button>`)}
  <div class="chips anav" data-key="anav">${[['a1', 'activity', '자극도'], ['a2', 'chart-column', '운동량'], ['a3', 'trending-up', '근력'], ['a4', 'battery-medium', '회복'], ['a5', 'utensils', '칼로리'], ['a6', 'flame', '대사량'], ['a7', 'scale', '체중']].map(([id, n, l]) => `<button class="chip" onclick="document.getElementById('${id}').scrollIntoView({behavior:'smooth',block:'start'})">${ic(n, 14)}${l}</button>`).join('')}</div>

  <div class="card" id="a1" style="--i:0"><h2>부위별 근육 자극도 <span class="dim">최근 7일</span></h2>
    <div class="seg"><i class="thumb"></i><button class="${anMode === 'stim' ? 'on' : ''}" onclick="anMode='stim';render()">주간 자극도</button><button class="${anMode === 'fat' ? 'on' : ''}" onclick="anMode='fat';render()">현재 피로도</button></div>
    <div class="mapwrap mt">${anMode === 'stim' ? bodyMap(MS.m, stimLvl) : bodyMap(recVal, fatLvl)}<div class="maptip" id="maptip">부위를 탭해봐</div></div>
    <div class="heatlg">${(anMode === 'stim' ? ['0', '1~4', '5~9', '10~14', '15+'] : ['0%', '~25', '~50', '~75', '~100%']).map((l, i) => `<span><i style="background:${HEAT[i]}"></i>${l}</span>`).join('')}<span class="dim">${anMode === 'stim' ? '세트' : '피로'}</span></div>
    ${anMode === 'stim' ? `<div class="mt">${stimSorted.map(m => `<div class="mrow"><div class="row" style="justify-content:space-between"><span class="lg">${m}</span>
      <span class="num"><b>${fmtN(MS.m[m], 1)}</b><span class="dim"> 세트</span></span></div><div class="mbar"><i data-w="${Math.min(100, MS.m[m] / 20 * 100)}" style="width:0;background:#ff6b4a"></i></div></div>`).join('')}
      <div class="dim">권장: 부위당 주 10~20세트 · 보조근은 0.5세트로 계산${MS.unmapped ? ` · 분류 없는 직접 추가 종목 ${MS.unmapped}세트 제외` : ''}</div></div>` : ''}</div>

  <div class="card" id="a2" style="--i:1"><h2>이번 주 운동량 ${chg != null ? `<span class="${chg >= 0 ? 'down' : 'up'}" style="font-size:13px">지난주 대비 ${chg >= 0 ? '▲' : '▼'} ${Math.abs(chg)}%</span>` : ''}</h2>
    <div class="grid4"><div><span class="dim">운동일</span><b class="num" data-count="${wDays}">0</b></div><div><span class="dim">세트</span><b class="num" data-count="${wSets}">0</b></div>
      <div><span class="dim">볼륨(kg)</span><b class="num" data-count="${Math.round(tw)}">0</b></div><div><span class="dim">시간(분)</span><b class="num" data-count="${Math.round(wMin)}">0</b></div></div>
    <div class="chart mt" id="c-vol" data-own></div><div class="dim center">지난주 총 볼륨 ${fmtK(tlw)}kg</div></div>

  <div class="card" id="a3" style="--i:2"><h2>근력 향상도 <span class="dim">추정 1RM</span></h2>
    ${exs.length ? `<div class="chips">${exs.map(e => `<button class="chip ${e === anEx ? 'on' : ''}" onclick="anEx=${jsArg(e)};render()">${esc(e)}</button>`).join('')}</div>
    <div id="c-str-stat" class="mt" data-own></div><div class="chart mt" id="c-str" data-own></div>
    <div class="dim">1RM = 무게 × (1 + 횟수/30) · 날짜별 최고값</div>` : '<div class="empty">무게를 넣은 운동 기록이 쌓이면 그래프가 나와</div>'}</div>

  <div class="card" id="a4" style="--i:3"><h2>근육 회복 점수</h2>
    <div class="row" style="gap:18px">${ring(score / 100, 128, 13, [sc[2], sc[2]], `<div class="big num" style="font-size:34px" data-count="${score}">0</div><div class="dim">/ 100</div>`)}
      <div class="f"><b style="font-size:18px;color:${sc[2]}">${sc[0]}</b><div class="muted" style="margin:4px 0 10px">${sc[1]}</div>
      <div class="dim">근육 회복 ${RC.muscleScore}${RC.sleepScore != null ? ` · 수면 ${RC.sleepScore}` : ' · 수면 기록 없음'}</div></div></div>
    ${ready.length ? `<div class="mt tagwrap"><span class="dim">오늘 추천 부위</span>${ready.slice(0, 5).map(m => `<span class="tag">${m}</span>`).join('')}</div>` : ''}
    <div class="mt">${MUSCLES.filter(m => RC.out[m].rec < 100).sort((a, b) => RC.out[a].rec - RC.out[b].rec).map(m => { const r = RC.out[m].rec, col = r >= 80 ? '#2fd27a' : r >= 50 ? '#ffc53d' : '#ff5d6c';
      return `<div class="mrow"><div class="row" style="justify-content:space-between"><span class="lg">${m}</span><span class="num"><b>${r}%</b><span class="dim"> · ${Math.ceil(RC.out[m].left)}시간 후 완전 회복</span></span></div>
      <div class="mbar"><i data-w="${r}" style="width:0;background:${col}"></i></div></div>`; }).join('') || '<div class="empty">모든 부위 100% 회복 상태야</div>'}</div>
    <div class="dim">큰 근육 72시간·작은 근육 48시간 기준, 세트 수에 따라 조정 · 수면 25% 반영</div></div>

  <div class="card" id="a5" style="--i:4"><h2>이번 주 칼로리 섭취</h2>
    <div class="grid3"><div><span class="dim">하루 평균</span><b class="num" data-count="${Math.round(avgK)}">0</b></div><div><span class="dim">주간 합계</span><b class="num" data-count="${wk.reduce((a, b) => a + b, 0)}">0</b></div>
      <div><span class="dim">목표 달성</span><b class="num">${logged.filter((d, i) => { const v = dayKcal(d); return v >= goal * .9 && v <= goal * 1.1; }).length}<small class="unit">/${logged.length}일</small></b></div></div>
    <div class="chart mt" id="c-kcal" data-own></div><div class="dim center">목표 ±10% 안이면 달성 · 기록한 날만 평균</div></div>

  <div class="card" id="a6" style="--i:5"><h2>체중 대비 활동대사량</h2>${metaHtml(MB)}</div>

  <div class="card" id="a7" style="--i:6"><h2>체중 추세 <span class="dim">최근 90일</span></h2><div id="w-rate" data-own></div><div class="chart mt" id="c-trend" data-own></div></div>`;
};
function metaHtml(M) {
  if (M.need === 'weight') return `<div class="empty">체중을 먼저 기록해줘</div><button class="btn pri" onclick="tab('body')">체중 기록하러 가기</button>`;
  if (M.need === 'profile') return `<div class="empty">키·나이를 입력하거나 체지방률을 기록하면 계산돼</div><button class="btn pri" onclick="go('settings')">내 정보 입력</button>`;
  const max = Math.max(M.tdee, M.intake || 0) * 1.1, p = v => (v / max * 100).toFixed(1);
  const bal = M.intake != null ? M.intake - M.tdee : null, wkChg = bal != null ? bal * 7 / 7700 : null;
  return `<div class="grid3"><div><span class="dim">기초대사량</span><b class="num" data-count="${Math.round(M.bmr)}">0</b></div>
    <div><span class="dim">활동대사량</span><b class="num gtext" data-count="${Math.round(M.tdee)}">0</b></div>
    <div><span class="dim">체중 1kg당</span><b class="num">${(M.tdee / M.bw).toFixed(1)}<small class="unit">kcal</small></b></div></div>
    <div class="tdee mt"><i class="bmr" data-w="${p(M.bmr)}" style="width:0"></i><i class="act" data-w="${p(M.tdee - M.bmr)}" style="width:0"></i>
      ${M.intake != null ? `<b class="mark" style="left:${p(M.intake)}%"><span>섭취 ${fmtK(M.intake)}</span></b>` : ''}</div>
    <div class="legend mt"><span><i class="dot" style="background:#6d7dff"></i>기초대사</span><span><i class="dot" style="background:#38bdf8"></i>활동 (×${M.af})</span>${M.intake != null ? '<span><i class="ln" style="background:#fff"></i>평균 섭취</span>' : ''}</div>
    ${bal != null ? `<div class="card" style="margin:12px 0 0;background:var(--card2)"><b class="h2i">${ic(bal < 0 ? 'trending-down' : 'trending-up', 17)}${bal < 0 ? '감량 페이스' : '증량 페이스'}</b>
      <div class="muted" style="margin-top:4px">하루 ${bal < 0 ? '' : '+'}${fmtK(bal)}kcal → 주당 약 <b class="${wkChg < 0 ? 'down' : 'up'}">${wkChg > 0 ? '+' : ''}${wkChg.toFixed(2)}kg</b> 예상</div></div>` : ''}
    <div class="dim mt">체중 ${M.bw.toFixed(1)}kg · ${M.how} · 활동 수준: ${M.al}(최근 7일 ${M.days7}일 운동)<br>권장 단백질 ${Math.round(M.bw * 1.6)}~${Math.round(M.bw * 2.2)}g/일 · 지방 7,700kcal ≈ 1kg 기준 추정</div>`;
}
AFTER.analysis = () => {
  const today = ymd(), mon = monday(), wkDays = [...Array(7)].map((_, i) => addDays(mon, i)), hi = wkDays.indexOf(today);
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('.mbar i, .tdee i').forEach(i => i.style.width = i.dataset.w + '%')));
  // 바디맵 탭
  const tipEl = $('#maptip'), RC = recovery(), MS = muscleSetsSince(addDays(today, -6));
  document.querySelectorAll('.bodymap .mus').forEach(sh => sh.onpointerdown = () => {
    const m = sh.dataset.m; document.querySelectorAll('.bodymap .mus').forEach(x => x.classList.toggle('sel', x.dataset.m === m));
    tipEl.innerHTML = anMode === 'stim' ? `<b>${m}</b> · 주간 ${fmtN(MS.m[m], 1)}세트` : `<b>${m}</b> · 회복 ${RC.out[m].rec}%${RC.out[m].left ? ` (${Math.ceil(RC.out[m].left)}시간 남음)` : ''}`;
  });
  const kfmt = v => v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 't' : Math.round(v) + '';
  barChart($('#c-vol'), { vals: wkDays.map(dayVolume), labels: WD.slice(1).concat(WD[0]), hi, color: ['#38bdf8', '#6d7dff'], tick: kfmt, short: kfmt, tipf: i => `${md(wkDays[i])} · ${fmtK(dayVolume(wkDays[i]))}kg` });
  barChart($('#c-kcal'), { vals: wkDays.map(dayKcal), labels: WD.slice(1).concat(WD[0]), hi, goal: db.cfg.kcalGoal, color: ['#ff9a3d', '#ff5f6d'], tick: v => fmtK(v), short: v => fmtK(v), tipf: i => `${md(wkDays[i])} · ${fmtK(dayKcal(wkDays[i]))}kcal` });
  // 근력
  if (anEx) {
    const by = {}; db.sets.filter(s => s.ex === anEx).forEach(s => { const v = e1rm(s.kg, s.reps); if (v > (by[s.date] || 0)) by[s.date] = v; });
    const pts = Object.keys(by).sort().map(d => ({ x: d, v: by[d] }));
    const first = pts[0], best = Math.max(...pts.map(p => p.v)), last = pts[pts.length - 1];
    const d = last.v - first.v, pc = first.v ? d / first.v * 100 : 0;
    $('#c-str-stat').innerHTML = `<div class="grid3"><div><span class="dim">최고 1RM</span><b class="num">${best.toFixed(1)}<small class="unit">kg</small></b></div>
      <div><span class="dim">최근</span><b class="num">${last.v.toFixed(1)}<small class="unit">kg</small></b></div>
      <div><span class="dim">첫 기록 대비</span><b class="num ${d >= 0 ? 'down' : 'up'}">${d >= 0 ? '+' : ''}${d.toFixed(1)}<small class="unit">(${pc >= 0 ? '+' : ''}${pc.toFixed(0)}%)</small></b></div></div>`;
    lineChart($('#c-str'), pts, { color: ['#38bdf8', '#6d7dff'], unit: 'kg', dec: 1 });
  }
  // 체중 추세
  const from = addDays(today, -90), W = sortedW().filter(w => w.kg && w.date >= from);
  const pts = W.map(w => { const win = W.filter(x => x.date <= w.date && x.date >= addDays(w.date, -6)); return { x: w.date, v: w.kg, avg: win.reduce((a, b) => a + b.kg, 0) / win.length }; });
  trendChart($('#c-trend'), pts);
  const r28 = W.filter(w => w.date >= addDays(today, -28));
  let rateHtml = '<div class="dim">최근 4주 기록이 3개 이상이면 주간 변화 속도가 나와</div>';
  if (r28.length >= 3 && dnum(r28[r28.length - 1].date) - dnum(r28[0].date) >= 7) {
    const xs = r28.map(w => dnum(w.date)), ys = r28.map(w => w.kg), n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0), wk = slope * 7, pct = wk / my * 100;
    rateHtml = `<div class="grid3"><div><span class="dim">주간 변화</span><b class="num ${wk <= 0 ? 'down' : 'up'}">${wk > 0 ? '+' : ''}${wk.toFixed(2)}<small class="unit">kg</small></b></div>
      <div><span class="dim">체중 대비</span><b class="num">${pct > 0 ? '+' : ''}${pct.toFixed(2)}<small class="unit">%/주</small></b></div>
      <div><span class="dim">판정</span><b style="font-size:15px">${Math.abs(pct) < 0.25 ? '유지 중' : wk < 0 ? (pct < -1 ? '빠른 감량 주의' : '적정 감량') : (pct > 0.5 ? '빠른 증량' : '린매스업')}</b></div></div>`;
  }
  $('#w-rate').innerHTML = rateHtml;
};

/* =========================================================
   업적
   ========================================================= */
function sumVolume() { return db.sets.reduce((a, s) => a + s.kg * s.reps, 0); }
function maxSessionVol() { const by = {}; db.sets.forEach(s => { const k = s.sid || s.date; by[k] = (by[k] || 0) + s.kg * s.reps; }); return Math.max(0, ...Object.values(by)); }
function consecutiveDays(dates) { const d = [...new Set(dates)].sort(); let r = 0, b = 0; d.forEach((x, i) => { r = i && dnum(x) - dnum(d[i - 1]) === 1 ? r + 1 : 1; b = Math.max(b, r); }); return b; }
function achList() {
  const L = levelInfo(), st = L.streak, days = st.days.length, vol = sumVolume() / 1000, bw = latestWeight();
  const b = bestE1RM('벤치프레스'), sq = bestE1RM('스쿼트'), dl = bestE1RM('데드리프트'), big3 = b + sq + dl;
  const T = macroTargets();
  const protDays = [...new Set(db.foods.map(f => f.date))].filter(d => db.foods.filter(f => f.date === d).reduce((a, f) => a + (f.prot || 0), 0) >= T.prot).length;
  const sleepOk = db.sleeps.filter(s => sleepDur(s) >= db.cfg.sleepGoal).length;
  const A = [];
  const add = (cat, id, ic, name, desc, cur, goal) => A.push({ cat, id, ic, name, desc, cur: Math.min(cur, goal), goal, done: cur >= goal });
  [[3, '🔥', '시작이 반'], [7, '🔥', '일주일 불꽃'], [14, '🔥', '2주 연속'], [30, '☄️', '한 달의 기적'], [60, '☄️', '습관 장착'], [100, '🌋', '백일 전설']]
    .forEach(([n, ic, nm]) => add('출석', 'st' + n, ic, nm, `연속 운동 ${n}일`, st.best, n));
  [[1, '👟', '첫 발걸음'], [10, '💪', '10일 출석'], [50, '🏅', '50일 출석'], [100, '🎖️', '100일 출석'], [365, '👑', '1년 출석']]
    .forEach(([n, ic, nm]) => add('출석', 'd' + n, ic, nm, `운동한 날 총 ${n}일`, days, n));
  [[5, '🌱', '새싹 리프터', '레벨 5 달성']].concat(TIERS.slice(1).map(t => [t.lv, '', `${t.name} 승급`, `레벨 ${t.lv} 달성`]))
    .forEach(([n, ic, nm, ds]) => add('레벨', 'lv' + n, ic || TIER_ICON[tierOf(n).name], nm, ds, L.lv, n));
  [[10, '🏋️', '10톤 클럽'], [100, '🏗️', '100톤 클럽'], [1000, '🚀', '1000톤 클럽']].forEach(([n, ic, nm]) => add('기록', 'v' + n, ic, nm, `누적 볼륨 ${n}톤`, vol, n));
  add('기록', 'sv10', '⚡', '폭풍 세션', '한 번에 볼륨 10톤', maxSessionVol() / 1000, 10);
  add('기록', 'bwb', '⚖️', '체중 벤치', '벤치 1RM ≥ 내 체중', bw ? b / bw : 0, 1);
  add('기록', 'b100', '🦍', '벤치 100', '벤치프레스 1RM 100kg', b, 100);
  add('기록', 's140', '🦵', '스쿼트 140', '스쿼트 1RM 140kg', sq, 140);
  add('기록', 'd180', '🐂', '데드 180', '데드리프트 1RM 180kg', dl, 180);
  [[300, '🥉'], [400, '🥈'], [500, '🥇']].forEach(([n, ic]) => add('기록', 't' + n, ic, `3대 ${n}`, `벤치+스쿼트+데드 1RM 합 ${n}kg`, big3, n));
  add('생활', 'f7', '🥗', '식단 일주일', '식단 7일 연속 기록', consecutiveDays(db.foods.map(f => f.date)), 7);
  add('생활', 'f30', '📒', '식단 마스터', '식단 기록한 날 30일', new Set(db.foods.map(f => f.date)).size, 30);
  add('생활', 'p7', '🍗', '단백질 러버', `단백질 목표(${T.prot}g) 달성 7일`, protDays, 7);
  add('생활', 'sl7', '😴', '꿀잠 일주일', '수면 목표 달성 7일', sleepOk, 7);
  add('생활', 'w10', '📏', '꾸준한 측정', '체성분 기록 10회', db.weights.length, 10);
  add('생활', 'r1', '⭐', '나만의 루틴', '루틴 1개 만들기', db.routines.length, 1);
  add('생활', 'wa7', '💧', '수분 충전', '물 목표 달성 7일', Object.values(db.water || {}).filter(n => n >= db.cfg.waterGoal).length, 7);
  add('생활', 'gw', '🎯', '목표 달성', '목표 체중 도달', typeof goalInfo === 'function' && goalInfo()?.done ? 1 : 0, 1);
  add('생활', 'bk', '💾', '안전 제일', '백업 1회 하기', db.cfg.lastBackup ? 1 : 0, 1);
  add('기록', 'rpe20', '🎚️', '강도 관리', 'RPE 기록 20세트', db.sets.filter(s => s.rpe != null).length, 20);
  return A;
}
function checkAch(announce = true) {
  const quiet = !announce || firstAchRun; firstAchRun = false;
  const fresh = achList().filter(a => a.done && !db.ach[a.id]);
  if (!fresh.length) return [];
  fresh.forEach(a => db.ach[a.id] = ymd()); save();
  if (!quiet) { confetti(); fresh.slice(0, 3).forEach((a, i) => setTimeout(() => toast(`🏆 업적 달성: ${a.name}`), i * 1900)); }
  return fresh;
}
function afterWorkout(lvBefore) {
  const L = levelInfo();
  if (L.lv > lvBefore) {
    const promoted = tierOf(lvBefore).name !== L.tier.name;
    confetti();
    const s = sheet(`<div class="center" style="padding:6px 0 4px"><div class="lvup">${badge(L.tier, 110)}</div>
      <div class="sh-title" style="font-size:24px;margin-top:8px">${promoted ? `${L.tier.name} 승급!` : 'LEVEL UP!'}</div>
      <div class="big num" style="font-size:40px">Lv ${lvBefore} → <span style="color:${L.tier.c[0]}">${L.lv}</span></div>
      <p class="muted">다음 레벨까지 ${fmtK(L.hi - L.xp)} XP</p><button class="btn pri t-rank" id="lvok">최고야!</button></div>`, { theme: 't-rank' });
    s.el.querySelector('#lvok').onclick = () => { s.close(); setTimeout(() => checkAch(), 400); };
  } else checkAch();
}

/* =========================================================
   관리 탭
   ========================================================= */
let achCat = '전체';
VIEWS.manage = () => {
  const L = levelInfo(), A = achList(), got = A.filter(a => db.ach[a.id] || a.done).length, bw = latestWeight();
  const cats = ['전체', '출석', '레벨', '기록', '생활'];
  const lifts = LIFT_STD.map(ls => {
    const rm = bestE1RM(ls.ex), r = bw ? rm / bw : 0; let ti = 0; ls.th.forEach((t, i) => { if (r >= t) ti = i + 1; });
    const nextKg = ti < ls.th.length && bw ? ls.th[ti] * bw - rm : 0, prevTh = ti ? ls.th[ti - 1] : 0, nextTh = ls.th[ti] || ls.th[ls.th.length - 1];
    const pct = ti >= ls.th.length ? 1 : (r - prevTh) / (nextTh - prevTh);
    return { ...ls, rm, r, t: TIERS[ti], ti, nextKg, pct: clamp(pct, 0, 1) };
  });
  return `${topbar('관리', '레벨 · 티어 · 업적')}
  <div class="hero" style="--i:0;--t0:${L.tier.c[0]};--t1:${L.tier.c[1]}">
    <div class="lvup">${badge(L.tier, 96)}</div>
    <div class="f"><div class="dim">${L.tier.name}</div><div class="big num" style="font-size:36px">Lv <span data-count="${L.lv}">0</span></div>
      <div class="xpbar big"><i data-w="${(L.pct * 100).toFixed(1)}" style="width:0;background:linear-gradient(90deg,${L.tier.c[0]},${L.tier.c[1]})"></i></div>
      <div class="dim num" style="margin-top:6px">${fmtK(L.xp - L.lo)} / ${fmtK(L.hi - L.lo)} XP ${L.lv < 100 ? `· 다음 레벨까지 ${fmtK(L.hi - L.xp)}` : '· MAX'}</div></div></div>
  <div class="grid3" style="--i:1"><div class="card stat" style="margin:0"><span class="dim">현재 연속</span><b class="num streakb">${ic('flame', 18)}${L.streak.cur}<small class="unit">일</small></b></div>
    <div class="card stat" style="margin:0"><span class="dim">최고 연속</span><b class="num">${L.streak.best}<small class="unit">일</small></b></div>
    <div class="card stat" style="margin:0"><span class="dim">총 XP</span><b class="num" data-count="${L.xp}">0</b></div></div>
  <details class="card" style="--i:2"><summary><b>XP 얻는 법</b></summary><div class="muted" style="margin-top:10px;line-height:1.7">
    · 들어올린 무게(볼륨) 100kg당 <b>1 XP</b><br>· 운동한 날마다 <b>30 XP</b><br>· 연속 운동 보너스: 연속 일수 × <b>5 XP</b> (최대 100)<br>
    · 연속 운동: 하루는 쉬어도 이어지고, <b>이틀 연속 쉬면 끊겨</b></div></details>

  <div class="card" style="--i:3"><h2>티어 리스트 <span class="dim">레벨 기준</span></h2>
    ${[...TIERS].reverse().map((t, i, arr) => { const nx = arr[i - 1], isCur = t === L.tier, done = L.lv >= t.lv;
      return `<div class="tierrow ${isCur ? 'cur' : ''} ${done ? '' : 'lock'}" style="--t0:${t.c[0]};--t1:${t.c[1]}">${badge(t, 40, { locked: !done, anim: isCur })}
        <div class="f"><b>${t.name}</b><div class="dim">Lv ${t.lv}${nx ? `~${nx.lv - 1}` : '+'} · ${fmtK(xpNeed(t.lv))} XP</div></div>
        ${isCur ? '<span class="you">YOU</span>' : done ? `<span class="dim">${ic('check', 14)} 달성</span>` : `<span class="dim">${fmtK(xpNeed(t.lv) - L.xp)} XP 남음</span>`}</div>`; }).join('')}</div>

  <div class="card" style="--i:4"><h2>종목별 티어 <span class="dim">1RM ÷ 체중</span></h2>
    ${!bw ? '<div class="empty">체중을 기록하면 종목별 티어가 나와</div>' : lifts.map(x => `<div class="liftrow">${badge(x.t, 44, { locked: !x.rm, anim: false })}
      <div class="f"><div class="row" style="justify-content:space-between"><b>${x.ex}</b><span class="num">${x.rm ? `<b>${x.rm.toFixed(1)}kg</b> <span class="dim">×${x.r.toFixed(2)}</span>` : '<span class="dim">기록 없음</span>'}</span></div>
        <div class="mbar"><i data-w="${(x.pct * 100).toFixed(1)}" style="width:0;background:linear-gradient(90deg,${x.t.c[0]},${x.t.c[1]})"></i></div>
        <div class="dim" style="margin-top:4px">${x.rm ? x.ti >= x.th.length ? `${ic('crown', 13)} 최고 티어 달성` : `${TIERS[x.ti + 1].name}까지 +${x.nextKg.toFixed(1)}kg (체중 ×${x.th[x.ti]})` : '무게를 기록해봐'}</div></div></div>`).join('')}
    ${bw ? `<div class="dim">3대 합계(추정 1RM) <b style="color:var(--ink)">${Math.round(lifts.slice(0, 3).reduce((a, x) => a + x.rm, 0))}kg</b> · 체중 ${bw.toFixed(1)}kg 기준</div>` : ''}</div>

  <div class="card" style="--i:5"><h2>업적 <span class="dim">${got} / ${A.length}</span></h2>
    <div class="xpbar" style="margin-bottom:12px"><i data-w="${(got / A.length * 100).toFixed(1)}" style="width:0;background:linear-gradient(90deg,#ffc53d,#ff8a3d)"></i></div>
    <div class="chips">${cats.map(c => `<button class="chip ${c === achCat ? 'on' : ''}" onclick="achCat='${c}';render()">${c}</button>`).join('')}</div>
    <div class="achgrid mt">${A.filter(a => achCat === '전체' || a.cat === achCat).sort((a, b) => (b.done - a.done) || (b.cur / b.goal - a.cur / a.goal))
      .map((a, i) => `<div class="ach ${a.done ? 'on' : ''}" style="animation-delay:${i * 30}ms"><div class="ic">${a.ic}</div><b>${a.name}</b><div class="dim">${a.desc}</div>
        ${a.done ? `<div class="when">${db.ach[a.id] ? db.ach[a.id].slice(2).replace(/-/g, '.') : '달성'}</div>`
          : `<div class="mbar" style="height:5px"><i data-w="${(a.cur / a.goal * 100).toFixed(1)}" style="width:0;background:#ffc53d"></i></div><div class="dim num" style="font-size:11px;margin-top:3px">${a.goal < 5 ? (Math.floor(a.cur * 100) / 100).toFixed(2) : Math.floor(a.cur).toLocaleString()}/${a.goal.toLocaleString()}</div>`}</div>`).join('')}</div></div>
  <button class="btn" onclick="go('sleep')" style="margin-bottom:12px">${ic('moon', 18)}수면 기록하기</button>`;
};
AFTER.manage = () => { checkAch(); requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('.xpbar i[data-w], .mbar i[data-w]').forEach(i => i.style.width = i.dataset.w + '%'))); };
