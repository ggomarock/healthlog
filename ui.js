'use strict';
/* =========================================================
   UI 기반
   - 부분 갱신(morph): 같은 화면 안에서는 바뀐 노드만 고침
   - 되돌리기 토스트(snack)
   - 확인 / 입력 / 길게 누르기 시트 (브라우저 기본 팝업 대체)
   ========================================================= */

/* ---------- 부분 갱신 ----------
   · 같은 자리 · 같은 태그 · 같은 data-key 이면 기존 노드를 유지하고 속성/텍스트만 바꿈
     → 이미 보이는 카드는 등장 애니메이션이 다시 재생되지 않음
   · 새로 생긴 노드만 삽입 → 그 노드만 등장 애니메이션
   · data-w / data-l / data-off / data-da 값은 이전 값에서 새 값으로 부드럽게 전환
   · data-own 요소의 자식은 JS(차트 등)가 관리하므로 건드리지 않음
   · data-count 숫자는 이전 숫자에서 새 숫자로 카운트 */
const KEPT = new Set();
const keyOf = n => (n.nodeType === 1 ? n.getAttribute('data-key') : null);
function sameNode(a, b) {
  if (a.nodeType !== b.nodeType) return false;
  if (a.nodeType !== 1) return true;
  return a.tagName === b.tagName && keyOf(a) === keyOf(b);
}
function keyAhead(n, k) { for (; n; n = n.nextSibling) if (keyOf(n) === k) return true; return false; }
function morphAttrs(a, b) {
  if (b.hasAttribute('data-count')) {
    const was = a.getAttribute('data-count'), now = b.getAttribute('data-count');
    if (was === now) a._same = true;
    else { const shown = parseFloat((a.textContent || '').replace(/,/g, '')); a._from = isNaN(shown) ? (parseFloat(was) || 0) : shown; }
  }
  const thumb = a.classList && a.classList.contains('thumb') ? [a.style.left, a.style.width] : null;
  for (const at of Array.from(b.attributes)) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
  for (const at of Array.from(a.attributes)) {
    const n = at.name;
    if (b.hasAttribute(n) || n === 'style' || n === 'open' || n === 'data-sig') continue;   // JS가 넣은 값은 유지
    a.removeAttribute(n);
  }
  if (thumb) { a.style.left = thumb[0]; a.style.width = thumb[1]; }
}
function morphEl(a, b) {
  morphAttrs(a, b); KEPT.add(a);
  if (b.hasAttribute('data-own') || b.hasAttribute('data-count')) return;
  morphChildren(a, b);
}
function morphChildren(from, to) {
  let a = from.firstChild, b = to.firstChild;
  while (b) {
    const nb = b.nextSibling;
    if (a && sameNode(a, b)) {
      if (a.nodeType === 1) morphEl(a, b); else if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue;
      a = a.nextSibling; b = nb; continue;
    }
    const kb = keyOf(b);
    if (kb) {                                   // 같은 키를 가진 기존 노드가 뒤에 있으면 재사용
      let m = null;
      for (let c = a; c; c = c.nextSibling) if (keyOf(c) === kb && c.tagName === b.tagName) { m = c; break; }
      if (m) { from.insertBefore(m, a); morphEl(m, b); b = nb; continue; }
    }
    if (a && keyOf(a) && !keyAhead(b, keyOf(a))) { const na = a.nextSibling; from.removeChild(a); a = na; continue; }   // 사라진 항목
    from.insertBefore(b, a); b = nb;            // 새 항목
  }
  while (a) { const na = a.nextSibling; from.removeChild(a); a = na; }
}
function finalizeKept() {
  KEPT.forEach(el => {
    const d = el.dataset; if (!d) return;
    if (d.w != null) el.style.width = d.w + '%';
    if (d.l != null) el.style.left = d.l + '%';
    if (d.off != null) el.style.strokeDashoffset = d.off;
    if (d.da != null) el.setAttribute('stroke-dasharray', d.da);
  });
  KEPT.clear();
}
function patchView(view, html) {
  const t = document.createElement('div'); t.innerHTML = html;
  morphChildren(view, t); finalizeKept();
}
/* 차트: 같은 데이터면 다시 그리지 않음 (true = 그대로 둠) */
function chartSame(box, sig) {
  if (box.dataset.sig === sig && box.firstElementChild) return true;
  box.dataset.sig = sig; return false;
}

/* ---------- 되돌리기 토스트 ---------- */
function snack(msg, undo, { ms = 5000, icon = 'trash-2', after } = {}) {
  const el = $('#snack'), act = el.querySelector('.act');
  el.querySelector('.msg').innerHTML = `${ic(icon, 17)}<span>${esc(msg)}</span>`;
  el.style.setProperty('--ms', ms + 'ms');
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(snack.t);
  act.onclick = () => {
    clearTimeout(snack.t); el.classList.remove('show'); act.onclick = null;
    undo(); save(); render(); if (after) after();
    toast('되돌렸어', 'rotate-ccw');
  };
  snack.t = setTimeout(() => { el.classList.remove('show'); act.onclick = null; }, ms);
}

/* ---------- 확인 시트 ---------- */
// 반환: true(확인) · 'alt'(보조 버튼) · false(취소/닫기)
function ask({ title, desc = '', ok = '확인', cancel = '취소', alt = '', danger = false, icon = 'circle-alert' }) {
  return new Promise(res => {
    const s = sheet(`<div class="askbox"><div class="askic ${danger ? 'danger' : ''}">${ic(icon, 26)}</div>
      <div class="sh-title">${title}</div>${desc ? `<p class="muted center">${desc}</p>` : ''}
      <button class="btn ${danger ? 'dpri' : 'pri'}" data-a="ok">${ok}</button>
      ${alt ? `<button class="btn mt" data-a="alt">${alt}</button>` : ''}
      <button class="btn ghost mt" data-a="no">${cancel}</button></div>`, { onClose: () => res(false) });
    s.el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
      s.close(); res(b.dataset.a === 'ok' ? true : b.dataset.a === 'alt' ? 'alt' : false);
    });
  });
}

/* ---------- 입력 시트 ---------- */
function askText({ title, placeholder = '', value = '', ok = '저장', icon = 'pencil', hint = '' }) {
  return new Promise(res => {
    const s = sheet(`<div class="askbox"><div class="askic">${ic(icon, 24)}</div><div class="sh-title">${title}</div>
      ${hint ? `<p class="muted center" style="margin-top:0">${hint}</p>` : ''}
      <input id="askin" value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off" enterkeyhint="done" maxlength="40">
      <button class="btn pri mt" data-a="ok">${ok}</button></div>`, { onClose: () => res(null) });
    const inp = s.el.querySelector('#askin');
    const done = () => {
      const v = inp.value.trim();
      if (!v) { inp.classList.remove('shake'); void inp.offsetWidth; inp.classList.add('shake'); inp.focus(); return; }
      s.close(); res(v);
    };
    s.el.querySelector('[data-a="ok"]').onclick = done;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done(); } });
    try { inp.focus({ preventScroll: true }); if (value) inp.select(); } catch (e) {}
  });
}

/* ---------- 길게 눌러서 확인 (되돌리기 어려운 작업) ---------- */
function holdAsk({ title, desc = '', label = '길게 눌러서 삭제', ms = 1400, icon = 'trash-2' }) {
  return new Promise(res => {
    const s = sheet(`<div class="askbox"><div class="askic danger">${ic(icon, 26)}</div><div class="sh-title">${title}</div>
      ${desc ? `<p class="muted center">${desc}</p>` : ''}
      <button class="btn hold" id="hold" style="--ms:${ms}ms"><i></i><span>${label}</span></button>
      <button class="btn ghost mt" id="hno">취소</button></div>`, { onClose: () => res(false) });
    const b = s.el.querySelector('#hold'); let t = null;
    const start = e => { e.preventDefault(); b.classList.add('holding'); t = setTimeout(() => { s.close(); res(true); }, ms); };
    const stop = () => { b.classList.remove('holding'); clearTimeout(t); };
    b.addEventListener('pointerdown', start);
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, stop));
    b.addEventListener('contextmenu', e => e.preventDefault());
    s.el.querySelector('#hno').onclick = () => { s.close(); res(false); };
  });
}
