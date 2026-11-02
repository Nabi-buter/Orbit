// =============================================================================
// 도트 UI 화면들 (모두 아트 캔버스에 직접 그린다)
// 각 화면: draw(ctx), onKey(e) → bool, onClick(x,y), onMove(x,y)
// =============================================================================

import { PW, PH, rect, px, text, textW, panel, createArtCanvas, line } from '../render/pixel.js';
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

// -----------------------------------------------------------------------------
// 공통 위젯
// -----------------------------------------------------------------------------
function hit(b, x, y) { return x >= b.x && y >= b.y && x < b.x + b.w && y < b.y + b.h; }

export function drawButton(ctx, b, focused) {
  const dis = b.disabled;
  const fill = dis ? '#1d1729' : focused ? '#3b2d55' : UI.panel;
  const border = dis ? '#4a4060' : focused ? UI.gold : b.primary ? UI.gold : '#7d7397';
  panel(ctx, b.x, b.y, b.w, b.h, { fill, border, shadow: UI.ink });
  const c = dis ? '#5d5470' : focused ? UI.gold : UI.paper;
  const ty = b.y + Math.floor((b.h - (b.sub ? 22 : 10)) / 2) + 1;
  text(ctx, b.label, b.x + b.w / 2, ty, c, { size: b.size ?? 11, align: 'center' });
  if (b.sub) text(ctx, b.sub, b.x + b.w / 2, ty + 12, dis ? '#5d5470' : UI.dim, { size: 9, align: 'center' });
  if (focused && !dis) {
    // 선택 화살표
    const ay = b.y + Math.floor(b.h / 2);
    for (let i = 0; i < 3; i++) rect(ctx, b.x - 5 + i, ay - 2 + i, 1, 5 - i * 2, UI.gold);
  }
}

function wrap(str, maxW, size) {
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

/** 버튼 목록 + 포커스를 가진 기본 화면 */
class Screen {
  constructor() { this.buttons = []; this.focus = 0; this.hover = -1; this.t = 0; }
  get focusable() { return this.buttons.filter((b) => !b.disabled && !b.noFocus); }
  focused(b) { return this.focusable[this.focus] === b || this.buttons[this.hover] === b; }
  drawButtons(ctx) { for (const b of this.buttons) drawButton(ctx, b, this.focused(b)); }
  moveFocus(d) { const n = this.focusable.length; if (n) this.focus = (this.focus + d + n) % n; this.hover = -1; }
  onKey(e) {
    const c = e.code;
    if (['ArrowDown', 'KeyS', 'ArrowRight', 'KeyD'].includes(c)) { this.moveFocus(1); return true; }
    if (['ArrowUp', 'KeyW', 'ArrowLeft', 'KeyA'].includes(c)) { this.moveFocus(-1); return true; }
    if (CONFIRM.includes(c)) { this.focusable[this.focus]?.onClick(); return true; }
    if (BACK.includes(c) && this.onBack) { this.onBack(); return true; }
    return false;
  }
  onClick(x, y) { const b = this.buttons.find((b) => !b.disabled && hit(b, x, y)); if (b) { b.onClick(); return true; } return false; }
  onMove(x, y) { this.hover = this.buttons.findIndex((b) => !b.disabled && hit(b, x, y)); }
}

let bgCache = null;
function background(ctx, dim = 0.45) {
  if (!bgCache) bgCache = buildBackground();
  ctx.drawImage(bgCache, 0, 0);
  ctx.globalAlpha = dim; rect(ctx, 0, 0, PW, PH, UI.ink); ctx.globalAlpha = 1;
}

/** 캐릭터 미리보기용 가짜 파이터 (로직 없이 포즈만) */
class Puppet {
  constructor(weaponId, team = 0, facing = 1) { this.team = team; this.facing = facing; this.setWeapon(weaponId); this.t = 0; }
  setWeapon(id) { this.f = createFighter({ id: this.team, x: 0, facing: this.facing, weapon: WEAPONS[id] }); this.t = 0; }
  tick() {
    const f = this.f;
    this.t++;
    // 대기 → 약공 → 대기 → 강공 반복으로 무기 모션 보여주기
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
export class TitleScreen extends Screen {
  constructor({ onPlay, onOnline, onHelp }) {
    super();
    const bx = PW / 2 - 55;
    this.buttons = [
      { x: bx, y: 118, w: 110, h: 20, label: '플레이', primary: true, onClick: onPlay },
      { x: bx, y: 143, w: 110, h: 20, label: '온라인 대전', onClick: onOnline },
      { x: bx, y: 168, w: 110, h: 20, label: '조작법', onClick: onHelp },
    ];
    this.left = new Puppet('longsword', 0, 1);
    this.right = new Puppet('axe', 1, -1);
    this.right.t = 120;
  }
  draw(ctx) {
    this.t++;
    background(ctx, 0.25);
    this.left.tick(); this.right.tick();
    this.left.draw(ctx, 70, 203);
    this.right.draw(ctx, PW - 70, 203);
    // 로고
    text(ctx, 'ORBIT', PW / 2, 34, UI.ink, { scale: 6, align: 'center' });
    text(ctx, 'ORBIT', PW / 2 - 2, 32, UI.gold, { scale: 6, align: 'center' });
    text(ctx, 'DUEL', PW / 2, 78, UI.ink, { scale: 3, align: 'center' });
    text(ctx, 'DUEL', PW / 2 - 1, 77, UI.paper, { scale: 3, align: 'center' });
    rect(ctx, PW / 2 - 70, 103, 140, 1, '#7d7397');
    this.drawButtons(ctx);
    text(ctx, '방향키 이동 · ENTER 선택', PW / 2, PH - 13, UI.dim, { size: 9, align: 'center' });
  }
}

// -----------------------------------------------------------------------------
// 로드아웃: 가운데 캐릭터(커스터마이즈 자리), 하단 1열 무기
// -----------------------------------------------------------------------------
const MODES = [
  { id: 'pve', label: 'AI 대전' },
  { id: 'local', label: '로컬 2인' },
  { id: 'online', label: '온라인' },
];
const CUSTOM = ['헤어', '피부', '의상', '머리띠', '신발'];

export class LoadoutScreen {
  /**
   * o: {player:0|1, weapon, mode, difficulty, cpuWeapon, lockMode, title, onStart({weapon,mode,difficulty,cpuWeapon}), onBack}
   */
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
    const cw = 64, gap = 4, x0 = Math.round((PW - (cw * 6 + gap * 5)) / 2);
    this.cards = WEAPON_ORDER.map((id, i) => ({ id, x: x0 + i * (cw + gap), y: 174, w: cw, h: 38 }));
    this.modeTabs = this.o.lockMode ? [] : MODES.map((m, i) => ({ ...m, x: 196 + i * 58, y: 5, w: 55, h: 15 }));
    this.diffBtns = Object.keys(DIFFICULTY).map((d, i) => ({ id: d, x: 310 + i * 36, y: 151, w: 33, h: 13 }));
    this.cpuBtn = { x: 310, y: 137, w: 105, h: 13 };
    this.start = { x: PW - 92, y: 219, w: 84, h: 17, label: this.o.startLabel ?? '대전 시작', primary: true, onClick: () => this.confirm() };
    this.back = { x: 8, y: 219, w: 50, h: 17, label: '뒤로', onClick: () => this.o.onBack() };
  }

  setWeapon(id) { this.weapon = id; this.puppet.setWeapon(id); }
  cycleWeapon(d) { const i = WEAPON_ORDER.indexOf(this.weapon); this.setWeapon(WEAPON_ORDER[(i + d + 6) % 6]); }
  confirm() { this.o.onStart({ weapon: this.weapon, mode: this.mode, difficulty: this.difficulty, cpuWeapon: this.cpuWeapon }); }

  keys() {
    // 로컬 2인의 P2 선택 화면은 P2 키 배치도 받는다
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
      for (const d of this.diffBtns) if (hit(d, x, y)) { this.difficulty = d.id; return true; }
      if (hit(this.cpuBtn, x, y)) {
        const list = ['random', ...WEAPON_ORDER];
        this.cpuWeapon = list[(list.indexOf(this.cpuWeapon) + 1) % list.length];
        return true;
      }
    }
    if (hit(this.start, x, y)) { this.start.onClick(); return true; }
    if (hit(this.back, x, y)) { this.back.onClick(); return true; }
    return false;
  }

  onMove(x, y) {
    this.hover = [...this.cards, ...this.modeTabs, ...this.diffBtns, this.cpuBtn, this.start, this.back].find((b) => hit(b, x, y)) ?? null;
  }

  draw(ctx) {
    this.t++;
    background(ctx, 0.55);
    const w = WEAPONS[this.weapon];
    const team = TEAM[this.player];

    // 헤더
    text(ctx, this.o.title ?? `P${this.player + 1} 준비`, 10, 8, team.ui, { size: 12, shadow: UI.ink });
    for (const m of this.modeTabs) {
      const on = m.id === this.mode;
      panel(ctx, m.x, m.y, m.w, m.h, { fill: on ? '#3b2d55' : UI.panel, border: on ? UI.gold : this.hover === m ? UI.paper : '#5d5470', shadow: UI.ink });
      text(ctx, m.label, m.x + m.w / 2, m.y + 3, on ? UI.gold : UI.dim, { size: 10, align: 'center' });
    }
    rect(ctx, 8, 23, PW - 16, 1, '#4a4060');

    // 왼쪽: 캐릭터 커스터마이즈 (준비 중)
    panel(ctx, 8, 30, 104, 136, { fill: '#1b1529', border: '#4a4060', shadow: UI.ink });
    text(ctx, '커스터마이즈', 60, 35, UI.paper, { size: 10, align: 'center' });
    CUSTOM.forEach((label, i) => {
      const y = 52 + i * 20;
      text(ctx, label, 16, y, '#6f6688', { size: 10 });
      text(ctx, '<', 64, y + 1, '#4a4060');
      rect(ctx, 72, y + 1, 22, 7, '#2b223d');
      text(ctx, '>', 98, y + 1, '#4a4060');
    });
    text(ctx, '준비 중', 60, 152, UI.dim, { size: 9, align: 'center' });

    // 가운데: 캐릭터 (2배)
    this.puppet.tick();
    const cx = 208;
    rect(ctx, cx - 44, 160, 88, 2, '#3a3150');
    rect(ctx, cx - 36, 162, 72, 1, '#2a233c');
    this.puppet.draw(ctx, cx, 160, 2);

    // 오른쪽: 무기 정보
    panel(ctx, 304, 30, 115, 136, { fill: '#1b1529', border: '#4a4060', shadow: UI.ink });
    text(ctx, w.name, 311, 35, w.color, { size: 13 });
    wrap(w.desc, 102, 11).slice(0, 4).forEach((l, i) => text(ctx, l, 311, 49 + i * 11, UI.dim, { size: 11, forceRaster: true }));
    const stats = [
      ['SPD', 1 - (w.light.hits[0].from - 4) / 14],
      ['RNG', reachOf(w.heavy) / 220],
      ['PWR', w.heavy.hits.reduce((s, h) => s + h.damage, 0) / 170],
      ['CMB', w.combo.maxTotal / 7],
    ];
    stats.forEach(([label, v], i) => {
      const y = 95 + i * 8;
      text(ctx, label, 311, y, UI.dim);
      const n = Math.max(1, Math.min(5, Math.round(v * 5)));
      for (let k = 0; k < 5; k++) rect(ctx, 340 + k * 14, y + 1, 12, 5, k < n ? UI.gold : '#3a3050');
    });
    if (this.mode === 'pve') {
      const cpu = this.cpuWeapon === 'random' ? '랜덤' : WEAPONS[this.cpuWeapon].name;
      panel(ctx, this.cpuBtn.x, this.cpuBtn.y, this.cpuBtn.w, this.cpuBtn.h, { fill: UI.panel, border: this.hover === this.cpuBtn ? UI.gold : '#5d5470', shadow: UI.ink });
      text(ctx, `상대: ${cpu}`, this.cpuBtn.x + 5, this.cpuBtn.y + 1, UI.paper, { size: 11 });
      for (const d of this.diffBtns) {
        const on = d.id === this.difficulty;
        panel(ctx, d.x, d.y, d.w, d.h, { fill: on ? '#3b2d55' : UI.panel, border: on ? UI.gold : '#5d5470', shadow: UI.ink });
        text(ctx, DIFFICULTY[d.id].label, d.x + d.w / 2, d.y + 1, on ? UI.gold : UI.dim, { size: 11, align: 'center' });
      }
    } else if (this.mode === 'local') {
      text(ctx, '다음: P2 무기 선택', 311, 145, UI.dim, { size: 11 });
    } else {
      text(ctx, '다음: 방 만들기/참가', 311, 145, UI.dim, { size: 11 });
    }
    text(ctx, `L${w.combo.lightMax} H${w.combo.heavyMax} MAX${w.combo.maxTotal} COMBO`, 311, 127, UI.gold);

    // 하단 1열: 무기
    for (const c of this.cards) {
      const on = c.id === this.weapon;
      const hov = this.hover === c;
      const wc = WEAPONS[c.id];
      panel(ctx, c.x, c.y - (on ? 2 : 0), c.w, c.h, { fill: on ? '#33284a' : UI.panel, border: on ? wc.color : hov ? UI.paper : '#4a4060', shadow: UI.ink });
      drawWeaponIcon(ctx, c.id, wc.color, c.x + c.w / 2, c.y + 14 - (on ? 2 : 0));
      text(ctx, wc.name, c.x + c.w / 2, c.y + 26 - (on ? 2 : 0), on ? UI.paper : UI.dim, { size: 9, align: 'center' });
      if (on) { rect(ctx, c.x + c.w / 2 - 2, c.y + c.h, 5, 1, wc.color); rect(ctx, c.x + c.w / 2 - 1, c.y + c.h + 1, 3, 1, wc.color); }
    }

    drawButton(ctx, this.back, this.hover === this.back);
    drawButton(ctx, this.start, true);
    const keys = this.player === 1 ? '←→ 무기 · NUM1 확정' : 'A D 무기 · W 모드 · ENTER 시작';
    text(ctx, keys, PW / 2, 223, UI.dim, { size: 9, align: 'center' });
  }
}

// -----------------------------------------------------------------------------
// 조작법
// -----------------------------------------------------------------------------
export class HelpScreen extends Screen {
  constructor({ onBack }) {
    super();
    this.onBack = onBack;
    this.buttons = [{ x: PW / 2 - 40, y: 216, w: 80, h: 18, label: '돌아가기', primary: true, onClick: onBack }];
  }
  draw(ctx) {
    background(ctx, 0.7);
    panel(ctx, 10, 8, PW - 20, 202, { fill: '#1b1529', border: '#5d5470', shadow: UI.ink });
    text(ctx, '조작법', PW / 2, 13, UI.gold, { size: 12, align: 'center' });
    const rows = [['이동', 'left', 'right'], ['점프', 'up'], ['가드', 'guard'], ['약공', 'light'], ['강공', 'heavy'], ['대시', 'dash'], ['궁극기', 'ult']];
    text(ctx, 'P1', 92, 32, TEAM[0].ui); text(ctx, 'P2', 150, 32, TEAM[1].ui);
    rows.forEach(([label, ...acts], i) => {
      const y = 44 + i * 13;
      text(ctx, label, 22, y, UI.paper, { size: 10 });
      [0, 1].forEach((p) => {
        const keys = acts.map((a) => (KEY_LABELS[CONTROLS[p][a][0]] ?? CONTROLS[p][a][0])).join(' ');
        text(ctx, keys.replace('←', '<').replace('→', '>').replace('↑', 'UP').replace('↓', 'DN'), p === 0 ? 92 : 150, y + 1, UI.dim);
      });
    });
    const tips = [
      '맞거나 막히면 다음 공격으로 연결',
      '콤보 상한을 넘기면 숨 고르기',
      '약공·강공을 섞으면 더 길게 잇는다',
      '가드로 막기: 피해 절반, 게이지 소모',
      '맞기 직전 가드: 완벽패링 → 반격',
      '가드 게이지 0: 기절, 강공 = 특수강공',
      '궁극기는 완벽패링으로만 막는다',
      '하강 중 공격: 낙하 공격',
    ];
    tips.forEach((t, i) => text(ctx, t, 212, 32 + i * 20, i % 2 ? UI.dim : UI.paper, { size: 11, forceRaster: true }));
    text(ctx, 'ESC 일시정지  F2 판정  M 소리', 22, 144, UI.dim);
    text(ctx, '방향키 두 번: 대시', 22, 158, UI.dim, { size: 11 });
    text(ctx, '온라인: 두 키 배치 모두 가능', 22, 174, UI.dim, { size: 11 });
    this.drawButtons(ctx);
  }
}

// -----------------------------------------------------------------------------
// 오버레이 메뉴 (일시정지 / 결과 / 온라인 메뉴)
// -----------------------------------------------------------------------------
export class MenuOverlay extends Screen {
  /** o: {title, titleColor, subtitle, lines:[[text,color]], items:[[label, fn, primary]], onBack} */
  constructor(o) {
    super();
    this.o = o;
    this.onBack = o.onBack;
    const n = o.items.length;
    const bw = 110, bh = 18, gap = 5;
    const top = o.lines?.length ? 140 : 110;
    this.buttons = o.items.map(([label, fn, primary], i) => ({
      x: PW / 2 - bw / 2, y: top + i * (bh + gap) - (n > 3 ? 18 : 0), w: bw, h: bh, label, onClick: fn, primary,
    }));
  }
  draw(ctx) {
    ctx.globalAlpha = 0.72; rect(ctx, 0, 0, PW, PH, UI.ink); ctx.globalAlpha = 1;
    const o = this.o;
    const korean = /[^\x00-\x7f]/.test(o.title);
    if (korean) text(ctx, o.title, PW / 2, 40, o.titleColor ?? UI.paper, { size: 22, align: 'center', shadow: '#000' });
    else text(ctx, o.title, PW / 2, 40, o.titleColor ?? UI.paper, { scale: 4, align: 'center', shadow: '#000' });
    if (o.subtitle) text(ctx, o.subtitle, PW / 2, 76, UI.dim, { size: 10, align: 'center' });
    (o.lines ?? []).forEach(([t, c], i) => text(ctx, t, PW / 2, 96 + i * 13, c ?? UI.paper, { size: 10, align: 'center' }));
    this.drawButtons(ctx);
  }
}

// -----------------------------------------------------------------------------
// 온라인 로비
// -----------------------------------------------------------------------------
export class OnlineScreen extends Screen {
  /** cb: {onCreate, onJoin(code), onSelect(w), onReady(bool), onLeave, onBack} */
  constructor(cb) {
    super();
    this.cb = cb;
    this.code = '';
    this.state = { phase: 'connecting' };
  }
  setState(st) {
    this.state = st;
    this.build();
  }
  build() {
    const st = this.state;
    this.onBack = this.cb.onBack;
    if (st.phase === 'connect') {
      this.buttons = [
        { x: PW / 2 - 70, y: 70, w: 140, h: 24, label: '방 만들기', sub: '코드를 상대에게 알려 주세요', primary: true, onClick: this.cb.onCreate },
        { x: PW / 2 + 22, y: 120, w: 48, h: 20, label: '참가', onClick: () => this.code.length === 4 && this.cb.onJoin(this.code) },
        { x: PW / 2 - 40, y: 170, w: 80, h: 18, label: '뒤로', onClick: this.cb.onBack },
      ];
    } else if (st.phase === 'room') {
      const me = st.slot, op = 1 - me;
      this.buttons = [
        { x: PW / 2 - 50, y: 186, w: 100, h: 20, label: st.ready?.[me] ? '준비 취소' : '준비', primary: true, disabled: !st.connected?.[op], onClick: () => this.cb.onReady(!st.ready[me]) },
        { x: 8, y: 216, w: 64, h: 17, label: '방 나가기', onClick: this.cb.onLeave },
      ];
    } else {
      this.buttons = [{ x: PW / 2 - 40, y: 170, w: 80, h: 18, label: '뒤로', onClick: this.cb.onBack }];
    }
    this.focus = 0;
  }
  onKey(e) {
    const st = this.state;
    if (st.phase === 'connect') {
      if (/^Key[A-Z]$|^Digit\d$/.test(e.code) && this.code.length < 4) {
        this.code += e.code.at(-1); return true;
      }
      if (e.code === 'Backspace') { this.code = this.code.slice(0, -1); return true; }
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.code.length === 4) { this.cb.onJoin(this.code); return true; }
      if (e.code === 'Escape') { this.cb.onBack(); return true; }
      if (['ArrowDown', 'ArrowUp'].includes(e.code)) return super.onKey(e);
      if (e.code === 'Enter') return super.onKey(e);
      return false;
    }
    if (st.phase === 'room') {
      const me = st.slot;
      const i = WEAPON_ORDER.indexOf(st.weapons[me]);
      if (['KeyA', 'ArrowLeft'].includes(e.code)) { this.cb.onSelect(WEAPON_ORDER[(i + 5) % 6]); return true; }
      if (['KeyD', 'ArrowRight'].includes(e.code)) { this.cb.onSelect(WEAPON_ORDER[(i + 1) % 6]); return true; }
      if (CONFIRM.includes(e.code)) { if (st.connected?.[1 - me]) this.cb.onReady(!st.ready[me]); return true; }
      if (e.code === 'Escape') { this.cb.onLeave(); return true; }
      return false;
    }
    return super.onKey(e);
  }
  draw(ctx) {
    this.t++;
    background(ctx, 0.6);
    const st = this.state;
    text(ctx, '온라인 대전', PW / 2, 12, UI.gold, { size: 14, align: 'center', shadow: UI.ink });
    if (st.error) wrap(st.error, PW - 60, 9).forEach((l, i) => text(ctx, l, PW / 2, 34 + i * 11, UI.red, { size: 9, align: 'center', forceRaster: true }));
    if (st.phase === 'connecting' && !st.error) text(ctx, '서버에 연결 중…', PW / 2, 90, UI.dim, { size: 11, align: 'center' });
    if (st.phase === 'connect') {
      text(ctx, '방 코드 입력', PW / 2 - 70, 108, UI.dim, { size: 9 });
      panel(ctx, PW / 2 - 70, 120, 86, 20, { fill: '#120d1c', border: UI.paper, shadow: UI.ink });
      const shown = this.code.padEnd(4, '_');
      text(ctx, shown.split('').join(' '), PW / 2 - 27, 126, UI.gold, { scale: 1, align: 'center' });
      if (this.t % 40 < 20 && this.code.length < 4) rect(ctx, PW / 2 - 27 - 21 + this.code.length * 12, 134, 5, 1, UI.gold);
      text(ctx, '키보드로 코드를 입력하고 ENTER', PW / 2, 148, UI.dim, { size: 9, align: 'center' });
    }
    if (st.phase === 'room') {
      const me = st.slot, op = 1 - me;
      text(ctx, '방 코드', PW / 2 - 8, 33, UI.dim, { size: 11, align: 'right' });
      text(ctx, st.code ?? '', PW / 2, 32, UI.gold, { scale: 2 });
      const pingTxt = st.rtt != null ? `핑 ${st.rtt}ms` : '';
      text(ctx, st.connected?.[op] ? `상대 접속됨 ${pingTxt}` : `상대를 기다리는 중… ${pingTxt}`, PW / 2, 52, UI.dim, { size: 9, align: 'center' });
      const slot = (p, x) => {
        const wid = st.weapons?.[p];
        const on = st.connected?.[p];
        panel(ctx, x, 66, 130, 112, { fill: '#1b1529', border: st.ready?.[p] ? UI.gold : TEAM[p].main, shadow: UI.ink });
        text(ctx, p === me ? `나 P${p + 1}` : `상대 P${p + 1}`, x + 6, 71, TEAM[p].ui, { size: 10 });
        if (on && wid) {
          if (!this.puppets) this.puppets = {};
          const key = `${p}:${wid}`;
          if (!this.puppets[p] || this.puppets[p].key !== key) { this.puppets[p] = new Puppet(wid, p, p === 0 ? 1 : -1); this.puppets[p].key = key; }
          this.puppets[p].tick();
          this.puppets[p].draw(ctx, x + 65, 140);
          text(ctx, WEAPONS[wid].name, x + 65, 146, WEAPONS[wid].color, { size: 10, align: 'center' });
          text(ctx, st.ready?.[p] ? '준비 완료' : p === me ? 'A D 무기 변경' : '선택 중…', x + 65, 160, st.ready?.[p] ? UI.gold : UI.dim, { size: 11, align: 'center' });
        } else text(ctx, '미접속', x + 65, 115, '#5d5470', { size: 10, align: 'center' });
      };
      slot(0, PW / 2 - 140);
      slot(1, PW / 2 + 10);
      text(ctx, 'VS', PW / 2, 114, UI.paper, { scale: 1, align: 'center' });
    }
    this.drawButtons(ctx);
  }
}
