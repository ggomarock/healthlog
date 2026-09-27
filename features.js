'use strict';
/* =========================================================
   v4~v5 기능 모음
   ========================================================= */

/* ---------- 헬스장 기구 / 대체 종목 ---------- */
function hasEquip(id) { return !Array.isArray(db.equip) || db.equip.includes(id); }
function canDo(ex) { const r = EX_REQ[ex]; return !r || r.every(hasEquip); }   // 직접 추가한 종목은 항상 가능
function exCat(ex) { return Object.keys(EXERCISES).find(c => EXERCISES[c].includes(ex)); }
function substitute(ex, taken = []) {
  if (canDo(ex)) return ex;
  const mp = MUSCLE_MAP[ex]; if (!mp) return ex;
  let best = null, bs = -1;
  Object.values(EXERCISES).flat().forEach(c => {
    if (c === ex || !canDo(c) || taken.includes(c)) return;
    const m = MUSCLE_MAP[c]; if (!m) return;
    const sc = m[0].filter(x => mp[0].includes(x)).length * 3 + m[1].filter(x => mp[1].includes(x)).length + (exCat(c) === exCat(ex) ? 1 : 0)
      - m[0].filter(x => !mp[0].includes(x)).length;
    if (m[0].some(x => mp[0].includes(x)) && sc > bs) { bs = sc; best = c; }
  });
  return best || ex;
}
function subList(names) {   // 여러 종목 한 번에 대체 (중복 방지)
  const out = []; names.forEach(n => out.push(substitute(n, out.concat(names.filter(x => x !== n && canDo(x)))))); return out;
}
VIEWS.equip = () => {
  const all = !Array.isArray(db.equip), exs = Object.values(EXERCISES).flat();
  return `${topbar('내 헬스장 기구', '없는 기구는 꺼줘 → 대체 종목으로 자동 교체')}
  <div class="card" style="--i:0"><div class="row"><span class="f"><b>모든 기구 있음</b><div class="dim">끄면 아래에서 직접 고를 수 있어</div></span>
    <button class="tgl ${all ? 'on' : ''}" onclick="db.equip=${all ? 'EQUIP.map(e=>e[0])' : 'null'};save();render()" aria-label="모든 기구 있음"></button></div></div>
  <div class="eqgrid" style="--i:1">${EQUIP.map(([id, n], i) => `<button class="eq ${hasEquip(id) ? 'on' : ''}" ${all ? 'disabled' : ''} style="animation-delay:${i * 30}ms" onclick="toggleEquip('${id}')">
    <b>${n}</b><i class="tgl ${hasEquip(id) ? 'on' : ''}"></i></button>`).join('')}</div>
  <div class="card" style="--i:2"><h2>할 수 있는 종목 <span class="dim">${exs.filter(canDo).length} / ${exs.length}</span></h2>
    <div class="dim" style="line-height:1.8">${exs.filter(e => !canDo(e)).map(e => `<s>${e}</s> ${ic('arrow-right', 12)} ${substitute(e)}`).join('<br>') || `${ic('circle-check', 14)} 모든 종목 가능`}</div></div>`;
};
function toggleEquip(id) { if (!Array.isArray(db.equip)) return; db.equip = db.equip.includes(id) ? db.equip.filter(x => x !== id) : [...db.equip, id]; save(); render(); }

/* ---------- 자동 무게 추천 (점진적 과부하 + RPE) ---------- */
const r25 = v => Math.round(v / 2.5) * 2.5;
function deloadOn() { return db.cfg.deloadUntil && db.cfg.deloadUntil >= ymd(); }
function suggest(ex, target) {
  const prev = lastSets(ex); if (!prev.length) return null;
  const top = Math.max(...prev.map(s => s.kg)), work = prev.filter(s => s.kg === top);
  const tgt = target || Math.max(...work.map(s => s.reps));
  const rp = work.filter(s => s.rpe != null), rpe = rp.length ? rp.reduce((a, s) => a + s.rpe, 0) / rp.length : null;
  const hit = work.every(s => s.reps >= tgt), last = `${fmtN(top, 1)}kg×${work.map(s => s.reps).join('/')}`;
  if (top === 0) return { kg: 0, reps: hit ? tgt + 1 : tgt, type: hit ? 'up' : 'keep', msg: hit ? '맨몸 · 지난번 성공 → 횟수 +1' : '맨몸 · 같은 횟수 재도전' };
  const inc = INC5.includes(ex) ? 5 : 2.5;
  if (hit && (rpe == null || rpe <= 8.5)) return { kg: top + inc, reps: tgt, type: 'up', msg: `+${inc}kg · 지난번 ${last}${rpe != null ? ` RPE ${fmtN(rpe, 1)}` : ''} 성공` };
  if (hit) return { kg: top, reps: tgt, type: 'keep', msg: `유지 · 성공했지만 RPE ${fmtN(rpe, 1)}로 힘들었어` };
  const miss = work.some(s => s.reps <= tgt - 3);
  return miss ? { kg: r25(top * 0.9), reps: tgt, type: 'down', msg: `−10% · 지난번 ${last}, 목표 ${tgt}회에서 많이 부족` }
    : { kg: top, reps: tgt, type: 'keep', msg: `유지 · 지난번 ${last}, 목표 ${tgt}회 재도전` };
}
function newItem(ex, n = 3, reps = null) {
  const sg = suggest(ex, reps), dl = deloadOn();
  let kg = sg ? sg.kg : 0; const rp = sg ? sg.reps : (reps || 10);
  if (dl && kg) kg = r25(kg * 0.6);
  const cnt = dl ? Math.max(2, n - 1) : n;
  const work = [...Array(cnt)].map(() => ({ kg, reps: rp, done: false, id: uid() }));
  const warm = db.cfg.autoWarm !== false && kg > 0 ? makeWarmups(ex, kg) : [];
  return { id: uid(), ex, target: rp, sug: sg ? { ...sg, deload: dl } : null, sets: warm.concat(work) };
}
function sugChip(it) {
  if (!it.sug) return `<span class="sug new">${ic('sparkles', 13)}첫 기록 · 가볍게 시작해서 무게를 찾아봐</span>`;
  const s = it.sug, icn = { up: 'arrow-up', keep: 'equal', down: 'arrow-down' }[s.type];
  return `<span class="sug ${s.type}">${ic(icn, 13)}${esc(s.msg)}</span>${s.deload ? `<span class="sug dl">${ic('leaf', 13)}디로드 60%</span>` : ''}`;
}
async function editRpe(ii, si) {
  const it = db.active.items[ii], s = it.sets[si];
  const v = await openRuler({ title: `${it.ex} · RPE`, unit: '', min: 5, max: 10, step: 0.5, px: 34, major: 2, value: s.rpe ?? 8, quick: [7, 8, 9, 10], theme: 't-work' });
  if (v == null || !db.active) return; s.rpe = v; syncSet(it, s); save(); render();
  toast(`RPE ${fmtN(v, 1)} · ${rpeText(v)}`, 'gauge');
}
function rpeText(v) { return v >= 10 ? '한계' : v >= 9.5 ? '1개도 어려움' : v >= 9 ? '1개 더 가능' : v >= 8 ? '2개 더 가능' : v >= 7 ? '3개 더 가능' : '여유 있음'; }

/* ---------- 운동 메모 + 자세 가이드 ---------- */
function formSheet(ex) {
  const f = FORM[ex], mp = MUSCLE_MAP[ex], rq = EX_REQ[ex] || [], best = bestE1RM(ex), note = (db.notes || {})[ex] || '';
  const s = sheet(`<div class="sh-title">${esc(ex)}</div>
    ${mp ? `<div class="chips" style="justify-content:center;flex-wrap:wrap">${mp[0].map(m => `<span class="chip on" style="padding:5px 11px;font-size:13px">${m}</span>`).join('')}${mp[1].map(m => `<span class="chip" style="padding:5px 11px;font-size:13px">${m}</span>`).join('')}</div>` : ''}
    ${rq.length ? `<div class="dim center mt">필요 기구 · ${rq.map(id => EQUIP.find(e => e[0] === id)[1]).join(', ')}${canDo(ex) ? '' : ' <b style="color:var(--danger)">(내 헬스장에 없음)</b>'}</div>` : ''}
    ${f ? `<div class="card" style="margin:14px 0 0"><h2>자세 포인트</h2>${f.map((t, i) => `<div class="fp" style="animation-delay:${i * 90}ms"><b>${i + 1}</b><span>${t}</span></div>`).join('')}</div>` : ''}
    <a class="btn mt yt" href="https://www.youtube.com/results?search_query=${encodeURIComponent(ex + ' 자세')}" target="_blank" rel="noopener">${ic('circle-play', 18)}유튜브에서 자세 영상 보기</a>
    <div class="card" style="margin:12px 0 0"><h2>내 메모 ${best ? `<span class="dim">최고 1RM ${best.toFixed(1)}kg</span>` : ''}</h2>
      <textarea id="fnote" rows="3" placeholder="예: 시트 높이 4, 그립 넓게">${esc(note)}</textarea></div>
    <button class="btn pri mt" id="fsave">저장</button>`, { theme: 't-work' });
  s.el.querySelector('#fsave').onclick = () => {
    db.notes = db.notes || {}; const v = s.el.querySelector('#fnote').value.trim();
    if (v) db.notes[ex] = v; else delete db.notes[ex];
    save(); s.close(); toast('메모 저장', 'notebook-pen'); if (cur.v === 'session') render();
  };
}

/* ---------- 피로도 기반 오늘의 추천 루틴 ---------- */
const REC_GROUPS = [
  { name: '가슴·삼두', main: ['가슴'], sub: ['삼두'] }, { name: '등·이두', main: ['등'], sub: ['이두'] },
  { name: '하체', main: ['대퇴사두', '둔근', '햄스트링'], sub: ['종아리'] }, { name: '어깨', main: ['어깨'], sub: ['승모'] },
];
function lastTrained(mu) { let d = null; db.sets.forEach(s => { const m = MUSCLE_MAP[s.ex]; if (m && m[0].includes(mu) && (!d || s.date > d)) d = s.date; }); return d; }
function recommend() {
  const RC = recovery(), MS = muscleSetsSince(addDays(ymd(), -6)).m, today = ymd();
  const cnt = {}; db.sets.forEach(s => cnt[s.ex] = (cnt[s.ex] || 0) + 1);
  const g = REC_GROUPS.map(G => {
    const ready = Math.min(...G.main.map(m => RC.out[m].rec));
    const deficit = G.main.reduce((a, m) => a + Math.max(0, 10 - MS[m]), 0) / G.main.length;
    const since = Math.min(...G.main.map(m => { const d = lastTrained(m); return d ? dnum(today) - dnum(d) : 14; }));
    return { ...G, ready, deficit, since, score: deficit + Math.min(since, 7) * 3 };
  });
  const ok = g.filter(x => x.ready >= 80).sort((a, b) => b.score - a.score);
  if (!ok.length) return { rest: true, RC };
  const pick = ok[0].name === '하체' ? [ok[0]] : [ok[0], ok.slice(1).find(x => x.name !== '하체')].filter(Boolean);
  const tired = MUSCLES.filter(m => RC.out[m].rec < 70);
  const items = [], used = [];
  const choose = (mu, k) => {
    const c = Object.values(EXERCISES).flat().filter(e => { const m = MUSCLE_MAP[e]; return m && m[0].includes(mu) && canDo(e) && !used.includes(e) && !m[0].some(x => tired.includes(x)); })
      .sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0));
    c.slice(0, k).forEach(e => { used.push(e); items.push(e); });
  };
  pick.forEach(G => { G.main.forEach(m => choose(m, G.main.length > 1 ? 1 : 2)); G.sub.forEach(m => choose(m, 1)); });
  if (RC.score >= 60 && !items.some(e => MUSCLE_MAP[e][0].includes('복근'))) choose('복근', 1);
  const light = RC.score < 60;
  const list = items.slice(0, 6).map((e, i) => ({ ex: e, sets: light ? 2 : i === 0 ? 4 : 3, reps: i === 0 ? 8 : 12 }));
  const why = pick.map(G => `${G.name}: 회복 ${G.ready}% · ${G.since >= 14 ? '2주 넘게 안 함' : G.since + '일 전'} · 주간 ${fmtN(G.main.reduce((a, m) => a + MS[m], 0) / G.main.length, 1)}세트`);
  return { title: pick.map(G => G.name).join(' + '), list, why, light, RC };
}
function recCard() {
  const R = recommend();
  if (R.rest) return `<div class="card rec" data-key="rec" style="--i:0"><h2><span class="h2i">${ic('sparkles', 16)}오늘의 추천</span></h2><div class="row"><span class="bigic">${ic('bed', 26)}</span>
    <div class="f"><b>오늘은 휴식 추천</b><div class="muted">주요 부위가 아직 회복 중이야 (회복 점수 ${R.RC.score})</div></div></div></div>`;
  return `<div class="card rec" data-key="rec" style="--i:0"><h2><span class="h2i">${ic('sparkles', 16)}오늘의 추천 루틴</span><span class="dim">회복 점수 ${R.RC.score}</span></h2>
    <b style="font-size:19px" class="gtext">${R.title}${R.light ? ' · 가볍게' : ''}</b>
    <div class="dim" style="margin:4px 0 8px;line-height:1.5">${R.why.join('<br>')}</div>
    ${R.list.map((x, i) => `<div class="li" data-key="${esc(x.ex)}" style="padding:8px 0"><button class="f t" style="text-align:left" onclick="formSheet(${jsArg(x.ex)})">${x.ex} ${ic('info', 14, 'info')}</button><b class="num">${x.sets}×${x.reps}</b></div>`).join('')}
    <button class="btn pri mt" onclick="startRec()">${ic('play', 17)}추천 루틴 시작</button></div>`;
}
function startRec() { const R = recommend(); if (R.rest) return; startSession(`추천 · ${R.title}`, R.list.map(x => newItem(x.ex, x.sets, x.reps))); }

/* ---------- 디로드 ---------- */
function weekVol(mon) { return [...Array(7)].map((_, i) => dayVolume(addDays(mon, i))).reduce((a, b) => a + b, 0); }
function deloadCheck() {
  if (deloadOn()) return { active: true };
  const mon = monday(), wk = [...Array(7)].map((_, i) => weekVol(addDays(mon, -7 * (7 - i))));   // 지난 7주 (완료된 주)
  let inc = 0; for (let i = wk.length - 1; i > 0 && wk[i] > wk[i - 1] && wk[i - 1] > 0; i--) inc++;
  let trainWeeks = 0;
  for (let i = wk.length - 1; i >= 0; i--) {
    const days = new Set(db.sets.filter(s => s.date >= addDays(mon, -7 * (7 - i)) && s.date < addDays(mon, -7 * (6 - i))).map(s => s.date)).size;
    if (days >= 2) trainWeeks++; else break;
  }
  const log = db.recLog || {}, recent = Object.keys(log).filter(d => d > addDays(ymd(), -7)).sort().slice(-5);
  const lowRec = recent.length >= 4 && recent.reduce((a, d) => a + log[d], 0) / recent.length < 50;
  const reason = inc >= 4 ? `${inc}주 연속 볼륨이 늘었어` : lowRec ? '최근 회복 점수가 계속 50 미만이야' : trainWeeks >= 6 ? `${trainWeeks}주 연속 쉬지 않고 운동했어` : null;
  return { reason, inc, lowRec, trainWeeks, dismissed: db.cfg.deloadDismiss === mon };
}
function deloadBanner() {
  const D = deloadCheck();
  if (D.active) return `<div class="banner dl" data-key="deload"><span class="bi">${ic('leaf', 22)}</span><div class="f"><b>디로드 주간 진행 중</b><div class="dim">~${md(db.cfg.deloadUntil)} · 무게 60%, 세트 −1</div></div><button class="chip" onclick="db.cfg.deloadUntil=null;save();render()">끝내기</button></div>`;
  if (!D.reason || D.dismissed) return '';
  return `<div class="banner warn" data-key="deload"><span class="bi">${ic('battery-low', 22)}</span><div class="f"><b>디로드 주간 추천</b><div class="dim">${D.reason}. 이번 주는 강도 60%로 회복하자</div>
    <div class="row mt" style="gap:8px"><button class="btn pri sm" onclick="startDeload()">이번 주 디로드</button><button class="btn sm" onclick="db.cfg.deloadDismiss=monday();save();render()">괜찮아</button></div></div></div>`;
}
function startDeload() { db.cfg.deloadUntil = addDays(monday(), 6); save(); render(); toast('이번 주 디로드 모드 ON', 'leaf'); }
function logRecovery() {
  if (!db.sets.some(s => s.date > addDays(ymd(), -7))) return;
  db.recLog = db.recLog || {}; db.recLog[ymd()] = recovery().score;
  Object.keys(db.recLog).forEach(d => { if (d < addDays(ymd(), -30)) delete db.recLog[d]; });
}

/* ---------- 주간 리포트 ---------- */
function weeklyReport(mon) {
  const days = [...Array(7)].map((_, i) => addDays(mon, i)), end = days[6], pm = addDays(mon, -7);
  const sets = db.sets.filter(s => s.date >= mon && s.date <= end), vol = sets.reduce((a, s) => a + s.kg * s.reps, 0), pvol = weekVol(pm);
  const wd = new Set(sets.map(s => s.date)).size, kd = days.filter(d => dayKcal(d) > 0), kc = kd.length ? kd.reduce((a, d) => a + dayKcal(d), 0) / kd.length : null;
  const W = sortedW().filter(w => w.kg), inW = W.filter(w => w.date >= mon && w.date <= end), before = W.filter(w => w.date < mon).pop();
  const wStart = before || inW[0], wEnd = inW[inW.length - 1], wchg = wStart && wEnd && wStart !== wEnd ? wEnd.kg - wStart.kg : null;
  const sl = db.sleeps.filter(s => s.date >= mon && s.date <= end), slAvg = sl.length ? sl.reduce((a, s) => a + sleepDur(s), 0) / sl.length : null;
  const ach = achList().filter(a => db.ach[a.id] && db.ach[a.id] >= mon && db.ach[a.id] <= end);
  const prs = [...new Set(sets.map(s => s.ex))].filter(ex => { const b = Math.max(...sets.filter(s => s.ex === ex).map(s => e1rm(s.kg, s.reps))); const old = db.sets.filter(s => s.ex === ex && s.date < mon).reduce((m, s) => Math.max(m, e1rm(s.kg, s.reps)), 0); return old && b > old; });
  const water = days.map(d => (db.water || {})[d] || 0), wg = days.filter((d, i) => water[i] >= db.cfg.waterGoal).length;
  return { mon, end, wd, sets: sets.length, vol, pvol, kc, kd: kd.length, wchg, slAvg, ach, prs, wg, has: sets.length || kd.length || inW.length || sl.length };
}
function reportHtml(R) {
  const vc = R.pvol ? Math.round((R.vol - R.pvol) / R.pvol * 100) : null;
  const row = (icn, l, v, sub = '') => `<div class="rrow"><span class="ic">${ic(icn, 16)}</span><span class="f">${l}</span><b class="num">${v}</b>${sub}</div>`;
  return `<div class="report">
    <div class="dim">${ic('mail', 13)} 주간 리포트</div><b style="font-size:19px">${md(R.mon).replace(/ \(.\)/, '')} ~ ${md(R.end).replace(/ \(.\)/, '')}</b>
    <div class="mt">${row('dumbbell', '운동일', `${R.wd}일`, ` <span class="dim">· ${R.sets}세트</span>`)}
    ${row('layers', '총 볼륨', `${fmtK(R.vol)}kg`, vc != null ? ` <span class="${vc >= 0 ? 'down' : 'up'}" style="font-size:12px">${vc >= 0 ? '▲' : '▼'}${Math.abs(vc)}%</span>` : '')}
    ${row('utensils', '평균 칼로리', R.kc != null ? `${fmtK(R.kc)}kcal` : '—', R.kc != null ? ` <span class="dim">· ${R.kd}일 기록</span>` : '')}
    ${row('scale', '체중 변화', R.wchg != null ? `${R.wchg > 0 ? '+' : ''}${R.wchg.toFixed(1)}kg` : '—')}
    ${row('moon', '평균 수면', R.slAvg != null ? hm(R.slAvg) : '—')}
    ${row('droplet', '물 목표 달성', `${R.wg}/7일`)}</div>
    ${R.prs.length ? `<div class="mt tagwrap"><span class="dim">${ic('trending-up', 13)} 신기록 ${R.prs.length}종목</span>${R.prs.map(p => `<span class="tag">${esc(p)}</span>`).join('')}</div>` : ''}
    ${R.ach.length ? `<div class="mt tagwrap"><span class="dim">${ic('trophy', 13)} 새 업적</span>${R.ach.map(a => `<span class="tag">${a.ic} ${a.name}</span>`).join('')}</div>` : ''}
    <div class="muted mt">${R.wd >= 4 ? '훌륭한 한 주였어! 이번 주도 이어가자' : R.wd >= 2 ? '괜찮은 한 주. 이번 주는 하루만 더 해보자' : '이번 주엔 다시 시작해보자'}</div></div>`;
}
function openReport(weeksAgo = 1) {
  const R = weeklyReport(addDays(monday(), -7 * weeksAgo));
  const s = sheet(`${reportHtml(R)}<div class="row mt"><button class="btn f" id="rp">${ic('chevron-left', 17)}이전 주</button><button class="btn f" id="rn" ${weeksAgo <= 1 ? 'disabled' : ''}>다음 주${ic('chevron-right', 17)}</button></div>`, { theme: 't-anal' });
  s.el.querySelector('#rp').onclick = () => { s.close(); setTimeout(() => openReport(weeksAgo + 1), 300); };
  s.el.querySelector('#rn').onclick = () => { s.close(); setTimeout(() => openReport(weeksAgo - 1), 300); };
  if (weeksAgo === 1 && db.cfg.reportSeen !== monday()) { db.cfg.reportSeen = monday(); save(); if (cur.v === 'home') setTimeout(render, 400); }
}

/* ---------- 홈 알림 스택 ---------- */
function stackCards() {
  const C = [], today = ymd();
  if (db.cfg.reportSeen !== monday()) {
    const R = weeklyReport(addDays(monday(), -7));
    if (R.has) {
      const vc = R.pvol ? Math.round((R.vol - R.pvol) / R.pvol * 100) : null;
      C.push({ k: 'report', icon: 'mail', tone: 'anal', title: '지난주 리포트 도착',
        desc: `${R.wd}일 운동 · 볼륨 ${fmtK(R.vol)}kg${vc != null ? ` (${vc >= 0 ? '▲' : '▼'}${Math.abs(vc)}%)` : ''}${R.prs.length ? ` · 신기록 ${R.prs.length}` : ''}`,
        acts: [['리포트 보기', 'openReport()', 'pri']], dismiss: true });
    }
  }
  const D = deloadCheck();
  if (D.active) C.push({ k: 'deload-on', icon: 'leaf', tone: 'anal', title: '디로드 주간 진행 중', desc: `~${md(db.cfg.deloadUntil)} · 무게 60%, 세트 −1`, acts: [['끝내기', 'db.cfg.deloadUntil=null;save();render()']] });
  else if (D.reason && !D.dismissed) C.push({ k: 'deload', icon: 'battery-low', tone: 'warn', title: '디로드 주간 추천', desc: `${D.reason}. 이번 주는 강도 60%로 쉬어가자`,
    acts: [['이번 주 디로드', 'startDeload()', 'pri'], ['괜찮아', "dismissCard(this,'deload')"]] });
  const has = db.sets.length + db.foods.length + db.weights.length + db.sleeps.length;
  if (has && backupAge() >= 7 && db.cfg.backupSnooze !== today) C.push({ k: 'backup', icon: 'hard-drive', tone: 'warn',
    title: db.cfg.lastBackup ? `백업한 지 ${backupAge()}일 됐어` : '아직 백업을 안 했어', desc: '기록은 이 폰에만 있어. 공유 → 파일에 저장 → iCloud Drive',
    acts: [['지금 백업', 'exportData()', 'pri'], ['내일 다시', "dismissCard(this,'backup')"]] });
  if (!db.active && !db.sets.some(s => s.date === today) && db.cfg.recHide !== today) {
    const R = recommend();
    C.push(R.rest ? { k: 'rec', icon: 'bed', tone: 'sleep', title: '오늘은 휴식 추천', desc: `회복 점수 ${R.RC.score} · 주요 부위가 아직 회복 중이야`, dismiss: true }
      : { k: 'rec', icon: 'sparkles', tone: 'work', title: `오늘 추천 · ${R.title}`, desc: `${R.list.slice(0, 3).map(x => x.ex).join(' · ')}${R.list.length > 3 ? ` 외 ${R.list.length - 3}` : ''}`,
        acts: [['바로 시작', 'startRec()', 'pri'], ['자세히', "tab('workout')"]], dismiss: true });
  }
  return C;
}
function homeStack() {
  const C = stackCards(); if (!C.length) return '';
  return `<div class="stack" data-key="stack"><div class="stack-h"><b>알림 <span class="cnt">${C.length}</span></b>${C.length > 1 ? `<span class="sdots">${C.map((c, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</span>` : ''}</div>
    <div class="stack-row ${C.length === 1 ? 'one' : ''}" onscroll="stackDots(this)">${C.map(c => `<div class="scard tone-${c.tone}" data-key="s-${c.k}">
      <span class="sic">${ic(c.icon, 20)}</span>
      <div class="f"><b>${c.title}</b><div class="sd">${c.desc}</div>
        ${c.acts ? `<div class="sacts">${c.acts.map(([l, fn, k]) => `<button class="btn sm ${k || ''}" onclick="${fn}">${l}</button>`).join('')}</div>` : ''}</div>
      ${c.dismiss ? `<button class="x" onclick="dismissCard(this,'${c.k}')" aria-label="닫기">${ic('x', 16)}</button>` : ''}</div>`).join('')}</div></div>`;
}
function stackDots(el) {
  const f = el.firstElementChild; if (!f) return;
  const i = Math.round(el.scrollLeft / (f.offsetWidth + 10));
  el.parentNode.querySelectorAll('.sdots i').forEach((d, j) => d.classList.toggle('on', j === i));
}
function dismissCard(btn, k) {
  const card = btn.closest('.scard'); if (card) card.classList.add('bye');
  setTimeout(() => {
    ({ report: () => db.cfg.reportSeen = monday(), deload: () => db.cfg.deloadDismiss = monday(), backup: () => db.cfg.backupSnooze = ymd(), rec: () => db.cfg.recHide = ymd() })[k]?.();
    save(); render();
  }, 240);
}

/* ---------- 물 섭취 ---------- */
function waterCard(date, i = 1) {
  const n = (db.water || {})[date] || 0, g = db.cfg.waterGoal, ml = db.cfg.cupMl, cups = Math.max(g, Math.min(n + 1, 16));
  return `<div class="card water" data-key="water" style="--i:${i}"><h2><span class="h2i">${ic('droplet', 16)}물</span><span class="num">${fmtN(n * ml / 1000, 2)}L <span class="dim">/ ${fmtN(g * ml / 1000, 2)}L</span></span></h2>
    <div class="cups">${[...Array(cups)].map((_, k) => `<button class="cup ${k < n ? 'on' : ''} ${k >= g ? 'extra' : ''}" style="--d:${k * 25}ms" onclick="setWater('${date}',${k})" aria-label="${k + 1}컵">
      <svg viewBox="0 0 24 30"><defs><clipPath id="cp${k}"><path d="M3 3h18l-2.2 23a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z"/></clipPath></defs>
      <rect class="wf" clip-path="url(#cp${k})" x="0" y="${k < n ? 8 : 31}" width="24" height="24" fill="#38bdf8"/>
      <path d="M3 3h18l-2.2 23a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8z" fill="none" stroke="${k < n ? '#7dd3fc' : '#3a4050'}" stroke-width="1.6"/></svg></button>`).join('')}</div>
    <div class="dim mt">${n >= g ? '목표 달성!' : `${g - n}컵 더 · 1컵 ${ml}ml`} · 컵을 탭해서 기록</div></div>`;
}
function setWater(date, k) {
  db.water = db.water || {}; const n = db.water[date] || 0;
  db.water[date] = k + 1 === n ? k : k + 1; if (!db.water[date]) delete db.water[date];
  save(); const before = n >= db.cfg.waterGoal; render();
  if (!before && db.water[date] >= db.cfg.waterGoal) { confetti(); toast('오늘 물 목표 달성!', 'droplet'); }
}

/* ---------- 목표 체중 + 예상 달성일 ---------- */
function weightSlope(days = 28) {
  const r = sortedW().filter(w => w.kg && w.date >= addDays(ymd(), -days));
  if (r.length < 3 || dnum(r[r.length - 1].date) - dnum(r[0].date) < 7) return null;
  const xs = r.map(w => dnum(w.date)), ys = r.map(w => w.kg), n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  return xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);   // kg/일
}
function goalInfo() {
  const g = db.cfg.goalW; if (!g) return null;
  const cur = latestWeight(); if (!cur) return { g, noW: true };
  const st = db.cfg.goalStart || cur, rem = g - cur, tot = g - st, pct = tot ? clamp((cur - st) / tot, 0, 1) : 1;
  const sl = weightSlope(); let eta = null, msg;
  if (Math.abs(rem) < 0.1) msg = '목표 달성!';
  else if (sl == null) msg = '4주 안에 기록이 3개 이상(7일 이상 간격)이면 예상 날짜가 나와';
  else if (Math.sign(sl) !== Math.sign(rem) || Math.abs(sl) < 0.005) msg = `현재 추세(${sl > 0 ? '+' : ''}${(sl * 7).toFixed(2)}kg/주)로는 도달이 어려워`;
  else { const d = Math.ceil(rem / sl); eta = addDays(ymd(), d); msg = `현재 추세 ${(sl * 7) > 0 ? '+' : ''}${(sl * 7).toFixed(2)}kg/주 → 약 ${d}일 후`; }
  return { g, cur, st, rem, pct, eta, msg, done: Math.abs(rem) < 0.1 };
}
function goalCard() {
  const G = goalInfo();
  if (!G) return `<div class="card" data-key="goal" style="--i:3"><div class="row"><span class="bigic">${ic('target', 24)}</span><div class="f"><b>목표 체중을 정해봐</b><div class="dim">추세로 예상 달성일을 계산해줘</div></div>
    <button class="btn pri sm" onclick="setGoalW()">설정</button></div></div>`;
  if (G.noW) return `<div class="card" data-key="goal" style="--i:3"><b>${ic('target', 16)} 목표 ${G.g.toFixed(1)}kg</b><div class="dim">체중을 기록하면 진행률이 나와</div></div>`;
  return `<div class="card goal" data-key="goal" style="--i:3"><h2><span class="h2i">${ic('target', 16)}목표 체중</span><button class="chip" style="padding:5px 10px;font-size:12px" onclick="setGoalW()">변경</button></h2>
    <div class="row" style="justify-content:space-between;align-items:flex-end"><div><span class="dim">시작</span><div class="num"><b>${G.st.toFixed(1)}</b>kg</div></div>
      <div class="center"><span class="dim">남은 무게</span><div class="big num gtext" style="font-size:30px">${G.done ? '0' : (G.rem > 0 ? '+' : '') + G.rem.toFixed(1)}<small class="unit">kg</small></div></div>
      <div style="text-align:right"><span class="dim">목표</span><div class="num"><b>${G.g.toFixed(1)}</b>kg</div></div></div>
    <div class="gbar mt"><i data-w="${(G.pct * 100).toFixed(1)}" style="width:0"></i><b class="gme" data-l="${(G.pct * 100).toFixed(1)}" style="left:0">${G.cur.toFixed(1)}</b></div>
    <div class="row mt" style="justify-content:space-between"><span class="dim">${Math.round(G.pct * 100)}% 진행</span>${G.eta ? `<b style="font-size:14px">${ic('calendar-days', 14)} ${md(G.eta)}</b>` : ''}</div>
    <div class="muted" style="margin-top:6px;font-size:13px">${G.msg}</div></div>`;
}
async function setGoalW() {
  const cur = latestWeight() || 70;
  const v = await openRuler({ title: '목표 체중', unit: 'kg', min: 30, max: 200, step: 0.5, px: 14, value: db.cfg.goalW || Math.round(cur - 3), theme: 't-body' });
  if (v == null) return; db.cfg.goalW = v; db.cfg.goalStart = latestWeight() || null; save(); render(); toast(`목표 ${v}kg 설정`, 'target');
}

/* ---------- 백업 경과일 ---------- */
function backupAge() { const b = db.cfg.lastBackup || db.cfg.firstUse; return b ? dnum(ymd()) - dnum(b) : 0; }

/* ---------- 식단 세트(템플릿) ---------- */
async function saveMealTpl(meal) {
  const items = db.foods.filter(f => f.date === dietDate && f.meal === meal);
  if (!items.length) return toast('먼저 음식을 추가해줘');
  const name = await askText({ title: '세트로 저장', hint: `${items.map(f => f.name).join(' · ')}`, value: `나의 ${meal}`, ok: '저장', icon: 'package' });
  if (!name) return;
  db.mealTpl = db.mealTpl || [];
  db.mealTpl.push({ id: uid(), name, meal, items: items.map(({ name, unit, qty, kcal, carb, prot, fat }) => ({ name, unit, qty, kcal, carb, prot, fat })) });
  save(); toast(`"${name}" 세트 저장`, 'package');
}
function addTpl(id, meal) {
  const t = (db.mealTpl || []).find(x => x.id === id); if (!t) return 0;
  t.items.forEach(f => db.foods.push({ ...f, id: uid(), date: dietDate, meal })); save(); return t.items.length;
}
function tplMode(body, getMeal, onAdd) {
  const T = db.mealTpl || [];
  body.innerHTML = T.length ? T.map((t, i) => { const k = t.items.reduce((a, f) => a + f.kcal, 0);
    return `<div class="fres" style="flex-wrap:wrap;animation:rise .35s ${i * 50}ms both"><div class="f"><div style="font-weight:700">${ic('package', 15)} ${esc(t.name)}</div>
      <div class="dim">${t.items.map(f => esc(f.name)).join(' · ')}</div></div><span class="k num">${fmtK(k)}<span class="unit">kcal</span></span>
      <div class="row" style="width:100%;margin-top:8px"><button class="btn pri sm f" data-tadd="${t.id}">한 번에 추가</button><button class="btn sm danger" data-tdel="${t.id}" aria-label="삭제">${ic('trash-2', 16)}</button></div></div>`; }).join('')
    : `<div class="empty">${ic('package', 28)}<br>저장된 세트가 없어<br>식단 화면 끼니 카드의 상자 버튼을 누르면<br>그 끼니 구성을 세트로 저장할 수 있어</div>`;
  body.querySelectorAll('[data-tadd]').forEach(b => b.onclick = () => { const n = addTpl(b.dataset.tadd, getMeal()); onAdd(); toast(`${getMeal()}에 ${n}개 추가`); });
  body.querySelectorAll('[data-tdel]').forEach(b => b.onclick = () => {
    const i = db.mealTpl.findIndex(x => x.id === b.dataset.tdel); if (i < 0) return;
    const [t] = db.mealTpl.splice(i, 1); save(); tplMode(body, getMeal, onAdd);
    snack(`"${t.name}" 세트 삭제`, () => db.mealTpl.splice(i, 0, t), { after: () => tplMode(body, getMeal, onAdd) });
  });
}
