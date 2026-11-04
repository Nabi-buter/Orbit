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

/** 화면 버튼 표시 설정 (기기에 저장) — 설정 화면과 대전 중 버튼이 같은 값을 쓴다 */
const PREF = 'orbit.touchControls';
export function getTouchControls() {
  try { return localStorage.getItem(PREF) !== 'off'; } catch { return true; }
}
export function setTouchControls(on) {
  try { if (on) localStorage.removeItem(PREF); else localStorage.setItem(PREF, 'off'); } catch { /* 이번 접속에만 */ }
  window.dispatchEvent(new CustomEvent('orbit-touch-pref', { detail: on }));
}

export function isTouchDevice() {
  return (typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches) || (navigator.maxTouchPoints ?? 0) > 0;
}

/** 버튼 → 지금 P1 배치의 대표 키 (설정에서 바꾸면 바로 따라감) */
const CODE = new Proxy({}, { get: (_, action) => CONTROLS[0][action]?.[0] });

const CSS = `
#touch { position: fixed; inset: 0; pointer-events: none; display: none; font-family: system-ui, sans-serif; z-index: 5; }
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
/* 세로 화면: 게임 화면은 위, 버튼은 그 아래 빈 곳에 크게 */
/* 묶음: 가로에서는 상자 없이(버튼은 위 절대 위치 그대로), 세로에서는 격자로 */
.ttop, .tright { display: contents; }
.tpad .zd { display: none; left: 30%; width: 40%; }

/* ---------------------------------------------------------------------------
   세로 화면: 게임 화면 아래 남은 공간을 격자로 나눠 버튼을 배치 → 어떤 화면 비율에서도 겹치지 않음
   위 줄: 일시정지 · 버튼 끄기 / 아래: 왼쪽 방향 패드, 오른쪽 2×2 (대시 궁 / 강 약)
   크기는 남은 높이와 폭 중 작은 쪽 기준
   --------------------------------------------------------------------------- */
@media (orientation: portrait) {
  #touch.on {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto 1fr;
    column-gap: 4vw;
    padding: calc(56.25vw + 20px + env(safe-area-inset-top)) 4vw calc(4vh + env(safe-area-inset-bottom));
    box-sizing: border-box;
  }
  #touch .tpad, #touch .tbtn { position: relative; inset: auto; left: auto; right: auto; top: auto; bottom: auto; transform: none; }
  .ttop { display: flex; grid-column: 1 / 3; grid-row: 1; justify-content: flex-end; gap: 3vw; }
  .ttop .tbtn { width: min(14vw, 8vh); height: min(14vw, 8vh); aspect-ratio: auto; border-radius: 10px; font-size: min(3.4vw, 2vh); }
  .ttop .tbtn.toggle { width: min(20vw, 11vh); }
  .tpad { grid-column: 1; grid-row: 2; align-self: end; justify-self: start; width: min(44vw, 30vh); aspect-ratio: 1; }
  .tpad .z { font-size: min(6vw, 3.6vh); border-radius: 12px; }
  .tpad .zu { left: 31%; top: 0; width: 38%; height: 30%; }
  .tpad .zl { left: 0; top: 35%; width: 36%; height: 30%; bottom: auto; }
  .tpad .zr { right: 0; top: 35%; width: 36%; height: 30%; bottom: auto; }
  .tpad .zd { display: grid; left: 31%; top: 70%; width: 38%; height: 30%; bottom: auto; }
  .tright {
    display: grid; grid-column: 2; grid-row: 2; align-self: end; justify-self: end;
    grid-template-columns: repeat(2, min(20vw, 13vh)); grid-auto-rows: min(20vw, 13vh); gap: min(3vw, 2vh);
    grid-template-areas: "dash ult" "heavy light";
  }
  .tright .tbtn { width: 100%; height: 100%; aspect-ratio: auto; font-size: min(4.6vw, 2.8vh); }
  .tright .tbtn.light { grid-area: light; font-size: min(5.6vw, 3.4vh); border-width: 3px; }
  .tright .tbtn.heavy { grid-area: heavy; }
  .tright .tbtn.dash { grid-area: dash; }
  .tright .tbtn.ult { grid-area: ult; }
  .tright .tbtn.guard { display: none; } /* 세로에서는 방향 패드 아래칸이 가드 */
}
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
    <div class="tpad"><div class="z zu">▲</div><div class="z zl">◀</div><div class="z zr">▶</div><div class="z zd">가드</div></div>
    <div class="tright">
      <div class="tbtn light" data-k="light">약<small>공격</small></div>
      <div class="tbtn heavy" data-k="heavy">강<small>공격</small></div>
      <div class="tbtn guard" data-k="guard">가드</div>
      <div class="tbtn dash" data-k="dash">대시</div>
      <div class="tbtn ult" data-k="ult">궁</div>
    </div>
    <div class="ttop">
      <div class="tbtn pause" data-tap="Escape">II</div>
      <div class="tbtn toggle" data-toggle="1" aria-label="화면 버튼 끄기/켜기"></div>
    </div>`;
  // 화면 전체 위에 깐다 (세로 화면에서는 게임 화면 아래 빈 곳에 버튼이 놓인다)
  document.body.append(root);

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
  let controlsOn = getTouchControls();
  const toggleBtn = root.querySelector('.toggle');
  const applyToggle = () => {
    root.classList.toggle('off', !controlsOn);
    toggleBtn.innerHTML = controlsOn ? '⌨<small>버튼 끄기</small>' : '🎮<small>버튼 켜기</small>';
  };
  applyToggle();
  toggleBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    setTouchControls(!controlsOn); // → 아래 이벤트로 적용
  });
  window.addEventListener('orbit-touch-pref', (e) => {
    controlsOn = !!e.detail;
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
  const zones = { left: pad.querySelector('.zl'), right: pad.querySelector('.zr'), up: pad.querySelector('.zu'), guard: pad.querySelector('.zd') };
  const portrait = () => innerHeight > innerWidth;
  const fingers = new Map();
  const padKeys = (e) => {
    const r = pad.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    const keys = [];
    if (portrait()) {
      // 세로: 위 = 점프, 가운데 = 좌우, 아래 = 가드 (위·아래 줄에서도 끝쪽이면 좌우 같이)
      if (y < 0.3) keys.push('up');
      else if (y > 0.69) keys.push('guard');
      const edge = y < 0.3 || y > 0.69 ? 0.25 : 0.45;
      if (x < edge) keys.push('left'); else if (x > 1 - edge) keys.push('right');
      return keys;
    }
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
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.addEventListener('blur', releaseAll);
  return root;
}
