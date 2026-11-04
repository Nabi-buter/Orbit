// =============================================================================
// 모바일 터치 조작
// -----------------------------------------------------------------------------
// 터치 화면에서 대전 중일 때만 화면 위에 버튼을 띄운다.
//   왼손: 방향 패드 (손가락을 미끄러뜨려도 됨) — ◀ ▶ 이동, 위로 밀면 점프
//   오른손: 약공 · 강공 · 가드 · 대시 · 궁극기 (게이지가 차면 빛남)
//   위: 일시정지
// 버튼은 키보드와 같은 키 이벤트(P1 배치)를 보낸다 → 게임 로직은 키보드와 구분하지 않는다.
// 메뉴는 원래 탭(클릭)으로 조작된다.
// =============================================================================

import { CONTROLS } from '../config/controls.js';
import { BALANCE } from '../config/balance.js';

export function isTouchDevice() {
  return (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints ?? 0) > 0;
}

const K = CONTROLS[0];
const CODE = { left: K.left[0], right: K.right[0], up: K.up[0], guard: K.guard[0], light: K.light[0], heavy: K.heavy[0], dash: K.dash[0], ult: K.ult[0] };

const CSS = `
#touch { position: absolute; inset: 0; pointer-events: none; display: none; font-family: system-ui, sans-serif; }
#touch.on { display: block; }
#touch * { -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: none; }
.tpad { position: absolute; left: 2.5%; bottom: 5%; width: 27%; aspect-ratio: 1.45; pointer-events: auto; }
.tpad .z { position: absolute; display: grid; place-items: center; color: #eceef2; font-size: min(4.2vh, 2.4vw);
  background: rgba(18,20,26,.42); border: 2px solid rgba(236,238,242,.35); border-radius: 8px; }
.tpad .z.on { background: rgba(242,193,78,.45); border-color: #f2c14e; }
.tpad .zl { left: 0; bottom: 0; width: 40%; height: 52%; }
.tpad .zr { right: 0; bottom: 0; width: 40%; height: 52%; }
.tpad .zu { left: 30%; top: 0; width: 40%; height: 42%; }
.tbtn { position: absolute; pointer-events: auto; display: grid; place-items: center; border-radius: 50%;
  color: #eceef2; font-weight: 700; font-size: min(3.4vh, 2vw); line-height: 1.05; text-align: center;
  background: rgba(18,20,26,.45); border: 2px solid rgba(236,238,242,.38); }
.tbtn small { display: block; font-size: .62em; font-weight: 500; opacity: .75; }
.tbtn.on { background: rgba(242,193,78,.5); border-color: #f2c14e; }
.tbtn.ready { border-color: #f2c14e; box-shadow: 0 0 12px rgba(242,193,78,.8); animation: tglow .6s ease-in-out infinite alternate; }
@keyframes tglow { to { box-shadow: 0 0 2px rgba(242,193,78,.3); } }
.tbtn.light { right: 13%; bottom: 7%; width: 11.5%; aspect-ratio: 1; font-size: min(4.2vh, 2.5vw); }
.tbtn.heavy { right: 2.5%; bottom: 25%; width: 10%; aspect-ratio: 1; }
.tbtn.guard { right: 25.5%; bottom: 5%; width: 9%; aspect-ratio: 1; }
.tbtn.dash { right: 14.5%; bottom: 34%; width: 8%; aspect-ratio: 1; }
.tbtn.ult { right: 3%; bottom: 49%; width: 7.5%; aspect-ratio: 1; }
.tbtn.pause { left: 50%; top: 12%; transform: translateX(-50%); width: 5%; aspect-ratio: 1; border-radius: 8px; font-size: min(2.6vh, 1.6vw); }
.tbtn.toggle { left: calc(50% + 3.5%); top: 12%; width: 5%; aspect-ratio: 1; border-radius: 8px; font-size: min(2.2vh, 1.3vw); }
/* 버튼 끔: 일시정지·켜기 버튼만 남김 (키보드를 연결해 할 때) */
#touch.off .tpad, #touch.off .tbtn[data-k] { display: none; }
#rotate { position: fixed; inset: 0; display: none; place-items: center; z-index: 10; background: #0c0912; color: #eceef2;
  font: 600 18px system-ui, sans-serif; text-align: center; line-height: 1.6; }
#rotate.on { display: grid; }
#rotate b { display: block; font-size: 40px; color: #f2c14e; }
`;

/**
 * @param {HTMLElement} stage  캔버스를 감싼 요소 (버튼이 캔버스 크기에 맞춰 붙는다)
 * @param {object} app         게임(App) — 장면·일시정지·궁극기 게이지를 읽는다
 */
export function setupTouch(stage, app) {
  if (!isTouchDevice()) return null;
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const root = document.createElement('div');
  root.id = 'touch';
  root.innerHTML = `
    <div class="tpad"><div class="z zu">▲</div><div class="z zl">◀</div><div class="z zr">▶</div></div>
    <div class="tbtn light" data-k="light">약<small>공격</small></div>
    <div class="tbtn heavy" data-k="heavy">강<small>공격</small></div>
    <div class="tbtn guard" data-k="guard">가드</div>
    <div class="tbtn dash" data-k="dash">대시</div>
    <div class="tbtn ult" data-k="ult">궁</div>
    <div class="tbtn pause" data-tap="Escape">II</div>
    <div class="tbtn toggle" data-toggle="1" aria-label="화면 버튼 끄기/켜기"></div>`;
  stage.append(root);

  const rotate = document.createElement('div');
  rotate.id = 'rotate';
  rotate.innerHTML = '<div><b>⟳</b>화면을 가로로 돌려 주세요</div>';
  document.body.append(rotate);

  // --- 키 이벤트 보내기 (지금 누른 키 집합이 바뀔 때만) ----------------------------
  const held = new Set();
  const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code, bubbles: true }));
  const sources = new Map(); // 누른 주체(버튼 / 패드 손가락) → 키 목록
  const sync = () => {
    const want = new Set([...sources.values()].flat());
    for (const c of held) if (!want.has(c)) { held.delete(c); send('keyup', c); }
    for (const c of want) if (!held.has(c)) { held.add(c); send('keydown', c); }
  };
  const releaseAll = () => { sources.clear(); sync(); root.querySelectorAll('.on').forEach((e) => e.classList.remove('on')); };

  // --- 버튼 -----------------------------------------------------------------
  // --- 화면 버튼 끄기/켜기 (키보드를 연결한 경우), 기기에 기억 -------------------------
  const PREF = 'orbit.touchControls';
  let controlsOn = true;
  try { controlsOn = localStorage.getItem(PREF) !== 'off'; } catch { /* 저장소 없음: 기본 켜짐 */ }
  const toggleBtn = root.querySelector('.toggle');
  const applyToggle = () => {
    root.classList.toggle('off', !controlsOn);
    toggleBtn.innerHTML = controlsOn ? '⌨<small>버튼 끄기</small>' : '🎮<small>버튼 켜기</small>';
  };
  applyToggle();
  toggleBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    controlsOn = !controlsOn;
    try { localStorage.setItem(PREF, controlsOn ? 'on' : 'off'); } catch { /* 이번 접속에만 적용 */ }
    if (!controlsOn) releaseAll();
    applyToggle();
  });

  for (const el of root.querySelectorAll('.tbtn')) {
    const key = el.dataset.k, tap = el.dataset.tap;
    if (el.dataset.toggle) continue;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture?.(e.pointerId);
      el.classList.add('on');
      if (tap) { send('keydown', tap); send('keyup', tap); return; }
      sources.set(el, [CODE[key]]);
      sync();
    });
    const up = (e) => { e.preventDefault(); el.classList.remove('on'); sources.delete(el); sync(); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  // --- 방향 패드: 손가락 위치로 방향 결정 (미끄러뜨리기 가능) ---------------------
  const pad = root.querySelector('.tpad');
  const zones = { left: pad.querySelector('.zl'), right: pad.querySelector('.zr'), up: pad.querySelector('.zu') };
  const fingers = new Map();
  const padKeys = (e) => {
    const r = pad.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const keys = [];
    if (x < 0.42) keys.push('left'); else if (x > 0.58) keys.push('right');
    if (y < 0.45) keys.push('up');
    return keys;
  };
  const updatePad = () => {
    const all = new Set([...fingers.values()].flat());
    for (const [k, z] of Object.entries(zones)) z.classList.toggle('on', all.has(k));
    sources.set(pad, [...all].map((k) => CODE[k]));
    sync();
  };
  pad.addEventListener('pointerdown', (e) => { e.preventDefault(); pad.setPointerCapture?.(e.pointerId); fingers.set(e.pointerId, padKeys(e)); updatePad(); });
  pad.addEventListener('pointermove', (e) => { if (fingers.has(e.pointerId)) { fingers.set(e.pointerId, padKeys(e)); updatePad(); } });
  const padUp = (e) => { fingers.delete(e.pointerId); updatePad(); };
  pad.addEventListener('pointerup', padUp);
  pad.addEventListener('pointercancel', padUp);

  // 길게 눌러 메뉴/확대가 뜨지 않게
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  // --- 표시 여부: 대전 중(일시정지·결과 제외)에만, 세로면 회전 안내 -------------------
  const ultBtn = root.querySelector('.ult');
  let shown = false;
  const tick = () => {
    const battle = app.scene === 'battle' && !app.paused && !app.match?.over && !app.onlineMenuOpen;
    if (battle !== shown) { shown = battle; root.classList.toggle('on', battle); if (!battle) releaseAll(); }
    const me = app.match?.fighters[app.mode === 'online' ? (app.slot ?? 0) : 0];
    ultBtn.classList.toggle('ready', !!me && me.ult >= BALANCE.ultimate.cost);
    rotate.classList.toggle('on', innerHeight > innerWidth);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.addEventListener('blur', releaseAll);
  return root;
}
