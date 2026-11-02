// =============================================================================
// 화면 UI (도트 캔버스에 직접 그림)
// 디자인 원칙: 박스 버튼 대신 텍스트 메뉴, 왼쪽 정렬, 훈련장 톤(콘크리트·안전 노랑·청록),
//             수치는 실제 게임 값(초/콤보 수)으로 보여 준다.
// 각 화면: draw(ctx), onKey(e) → bool, onClick(x,y), onMove(x,y)
// =============================================================================

import { PW, PH, rect, px, text, textW, createArtCanvas } from '../render/pixel.js';
import { UI, TEAM, buildBackground } from '../render/renderer.js';
import { drawFighter } from '../render/fighterArt.js';
import { drawWeaponIcon } from '../render/weaponArt.js';
import { WEAPONS, WEAPON_ORDER } from '../config/weapons.js';
import { CONTROLS, KEY_LABELS } from '../config/controls.js';
import { DIFFICULTY } from '../ai/ai.js';
import { createFighter, S } from '../core/fighter.js';
import { reachOf } from '../core/attackDef.js';

const CONFIRM = ['Enter', 'NumpadEnter', 'Space', 'KeyJ'];
const BACK = ['Escape', 'Backspace'];
const VERSION = 'v0.10 테스트 빌드';

function hit(b, x, y) { return x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h; }

function wrap(str, maxW, size = 11) {
  const words = str.split(' ');
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (textW(t, { size, forceRaster: true }) > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  return lines;
}

let bgCache = null;
function background(ctx, dim = 0.5) {
  if (!bgCache) bgCache = buildBackground();
  ctx.drawImage(bgCache, 0, 0);
  ctx.globalAlpha = dim; rect(ctx, 0, 0, PW, PH, UI.ink); ctx.globalAlpha = 1;
}

/** 키 모양 표시: [ENTER] */
function keycap(ctx, label, x, y, color = UI.paper) {
  const w = textW(label) + 6;
  rect(ctx, x, y, w, 11, '#2f3440');
  rect(ctx, x, y + 10, w, 1, '#0d0f13');
  text(ctx, label, x + 3, y + 2, color);
  return w;
}

/**
 * 텍스트 메뉴: 선택 항목은 노랑 + 왼쪽 막대. 박스 없음.
 * items: [{label, sub?, onClick, disabled?}]
 */
class TextMenu {
  constructor(items, x, y, { gap = 17, size = 13, width = 150 } = {}) {
    this.items = items; this.x = x; this.y = y; this.gap = gap; this.size = size; this.width = width;
    this.focus = 0; this.hover = -1;
  }
  rows() { return this.items.map((it, i) => ({ ...it, x: this.x - 6, y: this.y + i * this.gap - 3, w: this.width, h: this.gap - 2 })); }
  draw(ctx) {
    this.items.forEach((it, i) => {
      const y = this.y + i * this.gap;
      const on = (this.hover >= 0 ? this.hover : this.focus) === i;
      const c = it.disabled ? '#565c69' : on ? UI.gold : UI.paper;
      if (on && !it.disabled) rect(ctx, this.x - 6, y - 1, 2, this.size, UI.gold);
      const w = text(ctx, it.label, this.x + (on ? 2 : 0), y, c, { size: this.size, shadow: UI.ink });
      if (it.sub) text(ctx, it.sub, this.x + (on ? 2 : 0) + w + 6, y + 2, UI.dim, { size: 11 });
    });
  }
  move(d) {
    const n = this.items.length;
    let i = this.focus;
    for (let k = 0; k < n; k++) { i = (i + d + n) % n; if (!this.items[i].disabled) break; }
    this.focus = i; this.hover = -1;
  }
  activate() { const it = this.items[this.hover >= 0 ? this.hover : this.focus]; if (it && !it.disabled) it.onClick(); }
  onKey(e) {
    if (['ArrowDown', 'KeyS'].includes(e.code)) { this.move(1); return true; }
    if (['ArrowUp', 'KeyW'].includes(e.code)) { this.move(-1); return true; }
    if (CONFIRM.includes(e.code)) { this.activate(); return true; }
    return false;
  }
  onClick(x, y) { const i = this.rows().findIndex((r) => hit(r, x, y)); if (i >= 0 && !this.items[i].disabled) { this.focus = i; this.items[i].onClick(); return true; } return false; }
  onMove(x, y) { this.hover = this.rows().findIndex((r) => hit(r, x, y)); }
}

/** 미리보기용 가짜 파이터 (로직 없이 포즈만) */
class Puppet {
  constructor(weaponId, team = 0, facing = 1, offset = 0) { this.team = team; this.facing = facing; this.setWeapon(weaponId); this.t = offset; }
  setWeapon(id) { this.f = createFighter({ id: this.team, x: 0, facing: this.facing, weapon: WEAPONS[id] }); this.t = 0; }
  tick() {
    const f = this.f;
    this.t++;
    const cycle = this.t % 260;
    if (cycle === 70) { f.state = S.ATTACK; f.attack = { def: f.weapon.lights[0], frame: 0 }; }
    else if (cycle === 170) { f.state = S.ATTACK; f.attack = { def: f.weapon.heavies[0], frame: 0 }; }
    if (f.state === S.ATTACK) {
      f.attack.frame++;
      if (f.attack.frame >= f.attack.def.duration) { f.state = S.IDLE; f.attack = null; }
    }
  }
  draw(ctx, x, y, scale = 1) {
    const pal = { ...TEAM[this.team], weapon: this.f.weapon.color };
    if (scale === 1) { drawFighter(ctx, this.f, x, y, pal, this.t); return; }
    const W = 120, H = 80;
    if (!this.buf) this.buf = createArtCanvas(W, H);
    this.buf.ctx.clearRect(0, 0, W, H);
    drawFighter(this.buf.ctx, this.f, W / 2, H - 6, pal, this.t);
    ctx.drawImage(this.buf.canvas, Math.round(x - (W / 2) * scale), Math.round(y - (H - 6) * scale), W * scale, H * scale);
  }
}

// -----------------------------------------------------------------------------
// 타이틀
// -----------------------------------------------------------------------------
export class TitleScreen {
  constructor({ onPlay, onOnline, onHelp }) {
    this.menu = new TextMenu([
      { label: '플레이', onClick: onPlay },
      { label: '온라인 대전', onClick: onOnline },
      { label: '조작법', onClick: onHelp },
    ], 30, 128);
    this.left = new Puppet('longsword', 0, 1);
    this.right = new Puppet('spear', 1, -1, 120);
    this.t = 0;
  }
  get buttons() { return this.menu.rows(); }
  draw(ctx) {
    this.t++;
    background(ctx, 0.15);
    // 오른쪽: 훈련봇 두 대의 대련
    this.left.tick(); this.right.tick();
    this.left.draw(ctx, 290, 203);
    this.right.draw(ctx, 352, 203);
    // 왼쪽: 어두운 띠 + 로고
    ctx.globalAlpha = 0.86; rect(ctx, 0, 0, 200, PH, UI.ink); ctx.globalAlpha = 1;
    rect(ctx, 200, 0, 1, PH, '#2a2e38');
    text(ctx, 'ORBIT', 28, 40, UI.paper, { scale: 4, shadow: '#000' });
    text(ctx, 'DUEL', 30, 72, UI.gold, { scale: 4, shadow: '#000' });
    rect(ctx, 30, 108, 24, 2, UI.gold);
    text(ctx, '훈련장 1:1 무기 대결', 60, 103, UI.dim, { size: 11 });
    this.menu.draw(ctx);
    text(ctx, VERSION, 30, PH - 16, '#565c69', { size: 11 });
  }
  onKey(e) { return this.menu.onKey(e); }
  onClick(x, y) { return this.menu.onClick(x, y); }
  onMove(x, y) { this.menu.onMove(x, y); }
}

// -----------------------------------------------------------------------------
// 로드아웃: 가운데 캐릭터, 하단 무기 거치대(1열)
// -----------------------------------------------------------------------------
const MODES = [
  { id: 'pve', label: 'AI 대전' },
  { id: 'local', label: '로컬 2인' },
  { id: 'online', label: '온라인' },
];
const CUSTOM = ['머리', '몸통', '어깨', '색상'];

const secs = (f) => `${(f / 60).toFixed(2)}초`;
function reachWord(w) {
  const r = reachOf(w.heavy);
  return r < 140 ? '짧음' : r < 185 ? '보통' : '긺';
}

export class LoadoutScreen {
  /** o: {player, weapon, mode, difficulty, cpuWeapon, lockMode, title, onStart, onBack} */
  constructor(o) {
    this.o = o;
    this.player = o.player ?? 0;
    this.weapon = o.weapon ?? 'longsword';
    this.mode = o.mode ?? 'pve';
    this.difficulty = o.difficulty ?? 'normal';
    this.cpuWeapon = o.cpuWeapon ?? 'random';
    this.puppet = new Puppet(this.weapon, this.player, 1);
    this.hover = null;
    this.t = 0;
    this.layout();
  }

  layout() {
    const slot = 58, x0 = Math.round((PW - slot * 6) / 2);
    this.cards = WEAPON_ORDER.map((id, i) => ({ id, x: x0 + i * slot, y: 168, w: slot, h: 40 }));
    let tx = PW - 12;
    this.modeTabs = this.o.lockMode ? [] : [...MODES].reverse().map((m) => {
      const w = textW(m.label, { size: 11 });
      tx -= w;
      const tab = { ...m, x: tx - 2, y: 6, w: w + 4, h: 14 };
      tx -= 12;
      return tab;
    }).reverse();
    this.diffRow = { x: 312, y: 128, w: 104, h: 13 };
    this.cpuRow = { x: 312, y: 144, w: 104, h: 13 };
    this.start = { x: PW - 96, y: 220, w: 88, h: 14, onClick: () => this.confirm() };
    this.back = { x: 10, y: 220, w: 60, h: 14, onClick: () => this.o.onBack() };
  }

  get buttons() { return [this.start, this.back]; }
  setWeapon(id) { this.weapon = id; this.puppet.setWeapon(id); }
  cycleWeapon(d) { const i = WEAPON_ORDER.indexOf(this.weapon); this.setWeapon(WEAPON_ORDER[(i + d + 6) % 6]); }
  cycleDiff(d) { const k = Object.keys(DIFFICULTY); this.difficulty = k[(k.indexOf(this.difficulty) + d + k.length) % k.length]; }
  cycleCpu(d) { const list = ['random', ...WEAPON_ORDER]; this.cpuWeapon = list[(list.indexOf(this.cpuWeapon) + d + list.length) % list.length]; }
  confirm() { this.o.onStart({ weapon: this.weapon, mode: this.mode, difficulty: this.difficulty, cpuWeapon: this.cpuWeapon }); }

  keys() {
    return this.player === 1
      ? { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], ok: ['Numpad1', 'Comma', ...CONFIRM] }
      : { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], ok: CONFIRM };
  }

  onKey(e) {
    const k = this.keys();
    if (k.left.includes(e.code)) { this.cycleWeapon(-1); return true; }
    if (k.right.includes(e.code)) { this.cycleWeapon(1); return true; }
    if (k.ok.includes(e.code)) { this.confirm(); return true; }
    if (!this.o.lockMode && (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'Tab')) {
      const i = MODES.findIndex((m) => m.id === this.mode);
      this.mode = MODES[(i + 1) % MODES.length].id;
      e.preventDefault?.();
      return true;
    }
    if (this.mode === 'pve' && /^Digit[123]$/.test(e.code)) { this.difficulty = Object.keys(DIFFICULTY)[Number(e.code.slice(5)) - 1]; return true; }
    if (BACK.includes(e.code)) { this.o.onBack(); return true; }
    return false;
  }

  onClick(x, y) {
    for (const c of this.cards) if (hit(c, x, y)) { this.setWeapon(c.id); return true; }
    for (const m of this.modeTabs) if (hit(m, x, y)) { this.mode = m.id; return true; }
    if (this.mode === 'pve') {
      if (hit(this.diffRow, x, y)) { this.cycleDiff(1); return true; }
      if (hit(this.cpuRow, x, y)) { this.cycleCpu(1); return true; }
    }
    if (hit(this.start, x, y)) { this.start.onClick(); return true; }
    if (hit(this.back, x, y)) { this.back.onClick(); return true; }
    return false;
  }

  onMove(x, y) {
    this.hover = [...this.cards, ...this.modeTabs, this.diffRow, this.cpuRow, this.start, this.back].find((b) => hit(b, x, y)) ?? null;
  }

  draw(ctx) {
    this.t++;
    background(ctx, 0.35);
    const w = WEAPONS[this.weapon];
    const team = TEAM[this.player];

    // 상단: 제목 + 모드 탭 (텍스트, 선택은 밑줄)
    ctx.globalAlpha = 0.75; rect(ctx, 0, 0, PW, 24, UI.ink); ctx.globalAlpha = 1;
    text(ctx, this.o.title ?? '무기 선택', 12, 6, UI.paper, { size: 12 });
    text(ctx, `P${this.player + 1}`, 12 + textW(this.o.title ?? '무기 선택', { size: 12 }) + 8, 8, team.ui);
    for (const m of this.modeTabs) {
      const on = m.id === this.mode;
      text(ctx, m.label, m.x + 2, m.y + 1, on ? UI.paper : this.hover === m ? '#c4c8d2' : UI.dim, { size: 11 });
      if (on) rect(ctx, m.x + 2, m.y + 14, m.w - 4, 2, UI.gold);
    }

    // 가운데: 캐릭터 + 바닥 조명
    const cx = 208;
    ctx.globalAlpha = 0.12; rect(ctx, cx - 40, 40, 80, 122, '#dfe8f0'); ctx.globalAlpha = 1;
    rect(ctx, cx - 46, 161, 92, 2, '#8a909e');
    ctx.globalAlpha = 0.35; rect(ctx, cx - 30, 163, 60, 2, '#000'); ctx.globalAlpha = 1;
    this.puppet.tick();
    this.puppet.draw(ctx, cx, 161, 2);

    // 왼쪽: 무기 정보 (실제 수치)
    const L = w.light, H = w.heavy;
    text(ctx, w.name, 14, 36, UI.paper, { size: 16, shadow: UI.ink });
    rect(ctx, 14, 56, 18, 2, UI.gold);
    wrap(w.desc, 100).slice(0, 3).forEach((l, i) => text(ctx, l, 14, 63 + i * 12, UI.dim, { size: 11, forceRaster: true }));
    const rows = [
      ['약공', secs(L.hits[0].from)],
      ['강공', secs(H.hits[0].from)],
      ['사거리', reachWord(w)],
      ['콤보', `약 ${w.combo.lightMax} · 강 ${w.combo.heavyMax}`],
    ];
    rows.forEach(([k, v], i) => {
      const y = 106 + i * 13;
      text(ctx, k, 14, y, UI.dim, { size: 11 });
      text(ctx, v, 58, y, UI.paper, { size: 11 });
    });

    // 오른쪽: 외형(준비 중) + 대전 설정
    text(ctx, '외형', 312, 36, UI.dim, { size: 11 });
    text(ctx, '준비 중', PW - 12, 36, '#565c69', { size: 11, align: 'right' });
    CUSTOM.forEach((label, i) => {
      const y = 52 + i * 13;
      text(ctx, label, 312, y, '#5d636f', { size: 11 });
      text(ctx, '<   >', PW - 12, y + 2, '#3f4450', { align: 'right' });
    });
    if (this.mode === 'pve') {
      const dh = this.hover === this.diffRow, ch = this.hover === this.cpuRow;
      text(ctx, '난이도', 312, 128, UI.dim, { size: 11 });
      text(ctx, `< ${DIFFICULTY[this.difficulty].label} >`, PW - 12, 128, dh ? UI.gold : UI.paper, { size: 11, align: 'right' });
      text(ctx, '상대', 312, 144, UI.dim, { size: 11 });
      text(ctx, `< ${this.cpuWeapon === 'random' ? '무작위' : WEAPONS[this.cpuWeapon].name} >`, PW - 12, 144, ch ? UI.gold : UI.paper, { size: 11, align: 'right' });
    } else {
      text(ctx, this.mode === 'local' ? '다음: P2 선택' : '다음: 방 만들기·참가', 312, 136, UI.dim, { size: 11 });
    }

    // 하단: 어두운 띠 + 무기 거치대
    ctx.globalAlpha = 0.82; rect(ctx, 0, 166, PW, PH - 166, UI.ink); ctx.globalAlpha = 1;
    rect(ctx, 14, 170, PW - 28, 2, '#5b616e');
    rect(ctx, 14, 172, PW - 28, 1, '#0d0f13');
    for (const c of this.cards) {
      const on = c.id === this.weapon;
      const hov = this.hover === c;
      const cxx = c.x + c.w / 2;
      rect(ctx, cxx, 170, 1, 4, '#3f4450'); // 거치 고리
      if (!on && !hov) ctx.globalAlpha = 0.5;
      drawWeaponIcon(ctx, c.id, WEAPONS[c.id].color, cxx, 186 - (on ? 2 : 0));
      ctx.globalAlpha = 1;
      text(ctx, WEAPONS[c.id].name, cxx, 199, on ? UI.paper : '#5d636f', { size: 11, align: 'center' });
      if (on) rect(ctx, cxx - 10, 212, 20, 2, UI.gold);
    }

    // 하단 안내
    const sb = this.start;
    const kw = keycap(ctx, 'ENTER', sb.x, sb.y + 1, UI.gold);
    text(ctx, '대전 시작', sb.x + kw + 5, sb.y, this.hover === sb ? UI.gold : UI.paper, { size: 11 });
    const bw = keycap(ctx, 'ESC', this.back.x, this.back.y + 1);
    text(ctx, '뒤로', this.back.x + bw + 5, this.back.y, UI.dim, { size: 11 });
    text(ctx, this.player === 1 ? '← → 무기' : 'A D 무기 · W 모드', PW / 2, 221, '#5d636f', { size: 11, align: 'center' });
  }
}

// -----------------------------------------------------------------------------
// 조작법
// -----------------------------------------------------------------------------
export class HelpScreen {
  constructor({ onBack }) { this.onBack = onBack; this.back = { x: 10, y: 220, w: 60, h: 14, onClick: onBack }; }
  get buttons() { return [this.back]; }
  draw(ctx) {
    background(ctx, 0.78);
    text(ctx, '조작법', 20, 12, UI.paper, { size: 14 });
    rect(ctx, 20, 30, 18, 2, UI.gold);
    const rows = [['이동', 'left', 'right'], ['점프', 'up'], ['가드·패링', 'guard'], ['약공', 'light'], ['강공', 'heavy'], ['대시', 'dash'], ['궁극기', 'ult']];
    text(ctx, 'P1', 104, 42, TEAM[0].ui); text(ctx, 'P2', 160, 42, TEAM[1].ui);
    rows.forEach(([label, ...acts], i) => {
      const y = 56 + i * 14;
      text(ctx, label, 20, y, UI.paper, { size: 11 });
      [0, 1].forEach((p) => {
        const keys = acts.map((a) => (KEY_LABELS[CONTROLS[p][a][0]] ?? CONTROLS[p][a][0])).join(' ');
        text(ctx, keys.replace('←', '<').replace('→', '>').replace('↑', 'UP').replace('↓', 'DN'), p === 0 ? 104 : 160, y + 2, UI.dim);
      });
    });
    const tips = [
      ['패링', '가드를 짧게: 맞기 직전이면 완벽패링.'],
      ['', '연달아 누르면 판정이 짧아지고 실패 경직이 길어진다.'],
      ['막기', '가드를 길게: 피해 절반, 자세 게이지 소모.'],
      ['자세', '0이 되면 무너짐 → 상대 강공이 피니셔.'],
      ['콤보', '약 → 약 → 약 → 강이 기본. 끝나면 상대 차례.'],
      ['궁극기', '즉시 발동. 막기 불가, 완벽패링만 통한다.'],
    ];
    tips.forEach(([k, v], i) => {
      const y = 56 + i * 16;
      if (k) text(ctx, k, 222, y, UI.gold, { size: 11 });
      text(ctx, v, 262, y, UI.paper, { size: 11, forceRaster: true });
    });
    text(ctx, 'ESC 일시정지 · F2 판정 표시 · M 소리', 20, 168, UI.dim, { size: 11 });
    text(ctx, '방향키 두 번: 대시 · 온라인에서는 두 키 배치 모두 사용', 20, 184, UI.dim, { size: 11 });
    const bw = keycap(ctx, 'ESC', this.back.x, this.back.y + 1);
    text(ctx, '돌아가기', this.back.x + bw + 5, this.back.y, UI.paper, { size: 11 });
  }
  onKey(e) { if (BACK.includes(e.code) || CONFIRM.includes(e.code)) { this.onBack(); return true; } return false; }
  onClick(x, y) { if (hit(this.back, x, y)) { this.onBack(); return true; } return false; }
  onMove() {}
}

// -----------------------------------------------------------------------------
// 오버레이 메뉴 (일시정지 / 결과 / 온라인 메뉴): 왼쪽 띠 + 텍스트 메뉴
// -----------------------------------------------------------------------------
export class MenuOverlay {
  /** o: {title, titleColor, subtitle, lines:[[text,color]], items:[[label, fn, primary]], onBack} */
  constructor(o) {
    this.o = o;
    this.onBack = o.onBack;
    const top = o.lines?.length ? 96 + o.lines.length * 12 + 10 : 100;
    this.menu = new TextMenu(o.items.map(([label, fn]) => ({ label, onClick: fn })), 34, top, { size: 12, gap: 16, width: 180 });
  }
  get buttons() { return this.menu.rows(); }
  draw(ctx) {
    ctx.globalAlpha = 0.55; rect(ctx, 0, 0, PW, PH, UI.ink); ctx.globalAlpha = 1;
    ctx.globalAlpha = 0.85; rect(ctx, 0, 0, 230, PH, UI.ink); ctx.globalAlpha = 1;
    rect(ctx, 230, 0, 1, PH, '#2a2e38');
    const o = this.o;
    const korean = /[^\x00-\x7f]/.test(o.title);
    if (korean) text(ctx, o.title, 32, 34, o.titleColor ?? UI.paper, { size: 20, shadow: '#000' });
    else text(ctx, o.title, 32, 34, o.titleColor ?? UI.paper, { scale: 4, shadow: '#000' });
    rect(ctx, 34, 68, 22, 2, o.titleColor ?? UI.gold);
    if (o.subtitle) text(ctx, o.subtitle, 34, 76, UI.dim, { size: 11 });
    (o.lines ?? []).forEach(([t, c], i) => text(ctx, t, 34, 94 + i * 12 + (i >> 1) * 4, c ?? UI.paper, { size: 11 }));
    this.menu.draw(ctx);
  }
  onKey(e) {
    if (BACK.includes(e.code) && this.onBack) { this.onBack(); return true; }
    return this.menu.onKey(e);
  }
  onClick(x, y) { return this.menu.onClick(x, y); }
  onMove(x, y) { this.menu.onMove(x, y); }
}

// -----------------------------------------------------------------------------
// 온라인 로비
// -----------------------------------------------------------------------------
export class OnlineScreen {
  /** cb: {onCreate, onJoin(code), onSelect(w), onReady(bool), onLeave, onBack} */
  constructor(cb) {
    this.cb = cb;
    this.code = '';
    this.state = { phase: 'connecting' };
    this.t = 0;
    this.build();
  }
  setState(st) { this.state = st; this.build(); }
  build() {
    const st = this.state;
    if (st.phase === 'connect') {
      this.menu = new TextMenu([
        { label: '방 만들기', sub: '코드를 상대에게 알려 주세요', onClick: this.cb.onCreate },
        { label: '코드로 참가', onClick: () => this.code.length === 4 && this.cb.onJoin(this.code) },
        { label: '뒤로', onClick: this.cb.onBack },
      ], 34, 74);
    } else if (st.phase === 'room') {
      const me = st.slot, op = 1 - me;
      this.menu = new TextMenu([
        { label: st.ready?.[me] ? '준비 취소' : '준비', disabled: !st.connected?.[op], onClick: () => this.cb.onReady(!st.ready[me]) },
        { label: '방 나가기', onClick: this.cb.onLeave },
      ], 34, 190);
    } else {
      this.menu = new TextMenu([{ label: '뒤로', onClick: this.cb.onBack }], 34, 190);
    }
  }
  get buttons() { return this.menu.rows(); }
  onKey(e) {
    const st = this.state;
    if (st.phase === 'connect') {
      if (/^Key[A-Z]$|^Digit\d$/.test(e.code) && this.code.length < 4) { this.code += e.code.at(-1); return true; }
      if (e.code === 'Backspace') { this.code = this.code.slice(0, -1); return true; }
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.code.length === 4) { this.cb.onJoin(this.code); return true; }
      if (e.code === 'Escape') { this.cb.onBack(); return true; }
      if (['ArrowDown', 'ArrowUp', 'Enter', 'NumpadEnter'].includes(e.code)) return this.menu.onKey(e);
      return false;
    }
    if (st.phase === 'room') {
      const me = st.slot;
      const i = WEAPON_ORDER.indexOf(st.weapons?.[me] ?? 'longsword');
      if (['KeyA', 'ArrowLeft'].includes(e.code)) { this.cb.onSelect(WEAPON_ORDER[(i + 5) % 6]); return true; }
      if (['KeyD', 'ArrowRight'].includes(e.code)) { this.cb.onSelect(WEAPON_ORDER[(i + 1) % 6]); return true; }
      if (CONFIRM.includes(e.code)) { if (st.connected?.[1 - me]) this.cb.onReady(!st.ready[me]); return true; }
      if (e.code === 'Escape') { this.cb.onLeave(); return true; }
      return this.menu.onKey(e);
    }
    if (BACK.includes(e.code)) { this.cb.onBack(); return true; }
    return this.menu.onKey(e);
  }
  onClick(x, y) { return this.menu.onClick(x, y); }
  onMove(x, y) { this.menu.onMove(x, y); }
  draw(ctx) {
    this.t++;
    background(ctx, 0.4);
    ctx.globalAlpha = 0.86; rect(ctx, 0, 0, 210, PH, UI.ink); ctx.globalAlpha = 1;
    rect(ctx, 210, 0, 1, PH, '#2a2e38');
    const st = this.state;
    text(ctx, '온라인 대전', 34, 16, UI.paper, { size: 14 });
    rect(ctx, 34, 36, 18, 2, UI.gold);
    if (st.error) wrap(st.error, PW - 70).forEach((l, i) => text(ctx, l, 34, 44 + i * 12, UI.red, { size: 11, forceRaster: true }));
    if (st.phase === 'connecting' && !st.error) text(ctx, '서버에 연결 중…', 34, 74, UI.dim, { size: 11 });
    if (st.phase === 'connect') {
      text(ctx, '방 코드', 34, 130, UI.dim, { size: 11 });
      for (let k = 0; k < 4; k++) {
        const x = 84 + k * 16;
        rect(ctx, x, 142, 12, 1, k === this.code.length && this.t % 40 < 20 ? UI.gold : '#5b616e');
        if (this.code[k]) text(ctx, this.code[k], x + 6, 132, UI.gold, { scale: 1, align: 'center' });
      }
      text(ctx, '키보드로 입력 후 ENTER', 34, 150, '#5d636f', { size: 11 });
    }
    if (st.phase === 'room') {
      const me = st.slot, op = 1 - me;
      text(ctx, '방 코드', 34, 50, UI.dim, { size: 11 });
      text(ctx, st.code ?? '', 80, 49, UI.gold, { scale: 2 });
      const pingTxt = st.rtt != null ? ` · 핑 ${st.rtt}ms` : '';
      text(ctx, (st.connected?.[op] ? '상대 접속됨' : '상대를 기다리는 중…') + pingTxt, 34, 70, UI.dim, { size: 11 });
      const slot = (p, x) => {
        const wid = st.weapons?.[p];
        const on = st.connected?.[p];
        text(ctx, p === me ? `나 · P${p + 1}` : `상대 · P${p + 1}`, x, 92, TEAM[p].ui, { size: 11 });
        if (on && wid) {
          if (!this.puppets) this.puppets = {};
          const key = `${p}:${wid}`;
          if (!this.puppets[p] || this.puppets[p].key !== key) { this.puppets[p] = new Puppet(wid, p, p === 0 ? 1 : -1); this.puppets[p].key = key; }
          this.puppets[p].tick();
          this.puppets[p].draw(ctx, x + 30, 166);
          text(ctx, WEAPONS[wid].name, x, 170, UI.paper, { size: 11 });
          text(ctx, st.ready?.[p] ? '준비 완료' : p === me ? 'A D 무기 변경' : '고르는 중…', x, 182, st.ready?.[p] ? UI.gold : UI.dim, { size: 11 });
        } else text(ctx, '비어 있음', x, 130, '#5d636f', { size: 11 });
      };
      slot(0, 230);
      slot(1, 330);
    }
    this.menu.draw(ctx);
  }
}
