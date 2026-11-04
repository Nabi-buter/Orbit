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
const VERSION = 'v0.11';

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
  ctx.drawImage(bgCache, -Math.round((bgCache.width - PW) / 2), 0); // 넓은 경기장 배경의 가운데
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

/** 메뉴 커서: 작은 칼 모양, 살짝 앞뒤로 흔들림 */
function cursor(ctx, x, y, t) {
  x += Math.round(Math.sin(t * 0.15) * 1.2);
  // 자루 → 코등이 → 칼날 → 칼끝 (오른쪽을 가리킴)
  rect(ctx, x, y + 3, 2, 1, '#8a6a2c');
  rect(ctx, x + 2, y + 2, 1, 3, UI.gold);
  rect(ctx, x + 3, y + 2, 5, 1, '#fff4c8');
  rect(ctx, x + 3, y + 3, 5, 1, '#d8dbe4');
  rect(ctx, x + 3, y + 4, 4, 1, '#8a909e');
  rect(ctx, x + 8, y + 3, 1, 1, '#fff4c8');
}

/** 손으로 그린 듯한 테두리 상자: 모서리 깎임 + 위쪽 밝은 줄 + 리벳 두 개 */
export function frameBox(ctx, x, y, w, h) {
  ctx.globalAlpha = 0.94;
  rect(ctx, x + 1, y + 1, w - 2, h - 2, '#16181f');
  ctx.globalAlpha = 1;
  rect(ctx, x + 2, y, w - 4, 1, '#4a505e');
  rect(ctx, x + 2, y + h - 1, w - 4, 1, '#0b0c10');
  rect(ctx, x, y + 2, 1, h - 4, '#3a3f4b');
  rect(ctx, x + w - 1, y + 2, 1, h - 4, '#0b0c10');
  rect(ctx, x + 1, y + 1, 1, 1, '#3a3f4b'); rect(ctx, x + w - 2, y + 1, 1, 1, '#3a3f4b');
  rect(ctx, x + 1, y + h - 2, 1, 1, '#0b0c10'); rect(ctx, x + w - 2, y + h - 2, 1, 1, '#0b0c10');
  rect(ctx, x + 2, y + 1, w - 4, 1, '#232733');
  rect(ctx, x + 4, y + 4, 2, 2, '#2c303b'); rect(ctx, x + w - 6, y + 4, 2, 2, '#2c303b');
}

/**
 * 텍스트 메뉴: 선택 항목은 칼 모양 커서 + 노랑. 박스 없음.
 * items: [{label, sub?, onClick, disabled?}]
 */
class TextMenu {
  constructor(items, x, y, { gap = 17, size = 13, width = 150 } = {}) {
    this.items = items; this.x = x; this.y = y; this.gap = gap; this.size = size; this.width = width;
    this.focus = 0; this.hover = -1; this.t = 0;
  }
  rows() { return this.items.map((it, i) => ({ ...it, x: this.x - 12, y: this.y + i * this.gap - 3, w: this.width, h: this.gap - 2 })); }
  draw(ctx) {
    this.t++;
    this.items.forEach((it, i) => {
      const y = this.y + i * this.gap;
      const on = (this.hover >= 0 ? this.hover : this.focus) === i;
      const c = it.disabled ? '#565c69' : on ? UI.gold : '#c9ccd4';
      if (on && !it.disabled) cursor(ctx, this.x - 12, y + Math.round(this.size / 2) - 4, this.t);
      const w = text(ctx, it.label, this.x, y, c, { size: this.size, shadow: UI.ink });
      if (it.sub && on) text(ctx, it.sub, this.x + w + 6, y + 2, UI.dim, { size: 11 });
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
    ], 40, 126);
    this.left = new Puppet('longsword', 0, 1);
    this.right = new Puppet('spear', 1, -1, 120);
    this.t = 0;
  }
  get buttons() { return this.menu.rows(); }
  draw(ctx) {
    this.t++;
    background(ctx, 0.25);
    // 가운데 오른쪽: 훈련봇 두 대의 대련 (배경처럼)
    this.left.tick(); this.right.tick();
    this.left.draw(ctx, 262, 203);
    this.right.draw(ctx, 324, 203);
    // 왼쪽 아래로 갈수록 어둡게 (글자 읽히게, 띠 없이)
    for (let i = 0; i < 12; i++) { ctx.globalAlpha = 0.07; rect(ctx, 0, 0, 200 - i * 12, PH, UI.ink); }
    ctx.globalAlpha = 1;
    // 로고: 살짝 엇갈린 두 줄, 그림자
    text(ctx, 'ORBIT', 24, 34, UI.paper, { scale: 4, shadow: '#000' });
    text(ctx, 'DUEL', 46, 64, UI.gold, { scale: 4, shadow: '#000' });
    this.menu.draw(ctx);
    text(ctx, VERSION, PW - 8, PH - 12, '#3f4450', { align: 'right' });
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
function speedWord(startup) {
  return startup <= 8 ? '빠름' : startup <= 13 ? '보통' : '느림';
}
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
    let tx = PW - 24; // 오른쪽 끝에 E 키 자리
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
    // 모드 선택: Q 이전 · E 다음 (W·↑·Tab 도 다음)
    const modeStep = e.code === 'KeyQ' ? -1 : ['KeyE', 'KeyW', 'ArrowUp', 'Tab'].includes(e.code) ? 1 : 0;
    if (!this.o.lockMode && modeStep) {
      const i = MODES.findIndex((m) => m.id === this.mode);
      this.mode = MODES[(i + modeStep + MODES.length) % MODES.length].id;
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
    background(ctx, 0.62);
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
    if (this.modeTabs.length) {
      // 모드 전환 키 안내: Q ← 탭들 → E
      keycap(ctx, 'Q', this.modeTabs[0].x - 13, 7, UI.dim);
      keycap(ctx, 'E', this.modeTabs.at(-1).x + this.modeTabs.at(-1).w + 3, 7, UI.dim);
    }

    // 가운데: 캐릭터 + 바닥 조명
    const cx = 208;
    ctx.globalAlpha = 0.35; rect(ctx, cx - 30, 161, 60, 2, '#000'); ctx.globalAlpha = 1;
    this.puppet.tick();
    this.puppet.draw(ctx, cx, 161, 2);

    // 왼쪽: 무기 정보 (실제 수치)
    const L = w.light;
    text(ctx, w.name, 14, 36, UI.paper, { size: 16, shadow: UI.ink });
    wrap(w.desc, 110).slice(0, 3).forEach((l, i) => text(ctx, l, 14, 63 + i * 12, UI.dim, { size: 11, forceRaster: true }));
    const rows = [
      ['속도', speedWord(L.hits[0].from)],
      ['사거리', reachWord(w)],
      ['콤보', `약 ${w.combo.lightMax} · 강 ${w.combo.heavyMax}`],
    ];
    rows.forEach(([k, v], i) => {
      const y = 112 + i * 13;
      text(ctx, k, 14, y, UI.dim, { size: 11 });
      text(ctx, v, 58, y, UI.paper, { size: 11 });
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
    for (const c of this.cards) {
      const on = c.id === this.weapon;
      const hov = this.hover === c;
      const cxx = c.x + c.w / 2;
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
    text(ctx, this.player === 1 ? '← → 무기' : 'A D 무기 · Q E 모드', PW / 2, 221, '#5d636f', { size: 11, align: 'center' });
  }
}

// -----------------------------------------------------------------------------
// 조작법
// -----------------------------------------------------------------------------
export class HelpScreen {
  constructor({ onBack }) { this.onBack = onBack; this.back = { x: 10, y: 220, w: 60, h: 14, onClick: onBack }; }
  get buttons() { return [this.back]; }
  draw(ctx) {
    background(ctx, 0.9);
    text(ctx, '조작법', 20, 12, UI.paper, { size: 14 });
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
    // 오른쪽: 짧은 요령 (화면 폭 안에서 줄바꿈)
    const tx = 220, tw = PW - tx - 14;
    rect(ctx, tx - 12, 42, 1, 150, '#2a2e38');
    const tips = [
      ['패링', '맞기 직전에 가드를 짧게. 연달아 누르면 잘 안 된다.'],
      ['막기', '가드를 길게. 피해 절반, 자세가 깎인다.'],
      ['자세', '0이 되면 무너진다. 그때 강공이 마무리.'],
      ['콤보', '끝나면 상대 차례. 욕심내지 말 것.'],
      ['궁극기', '막기 불가. 완벽패링만 통한다.'],
    ];
    let ty = 42;
    for (const [k, v] of tips) {
      text(ctx, k, tx, ty, UI.gold, { size: 11 });
      for (const line of wrap(v, tw - 40)) { text(ctx, line, tx + 40, ty, UI.paper, { size: 11, forceRaster: true }); ty += 13; }
      ty += 5;
    }
    text(ctx, 'ESC 일시정지 · M 소리 · F2 판정', 20, 168, UI.dim, { size: 11 });
    text(ctx, '방향키 두 번 = 대시', 20, 182, UI.dim, { size: 11 });
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
    const korean = /[^\x00-\x7f]/.test(o.title);
    this.titleH = korean ? 22 : 30;
    const linesH = (o.lines?.length ?? 0) * 12 + (o.subtitle ? 14 : 0);
    this.box = { w: 176, h: 20 + this.titleH + linesH + o.items.length * 15 + 10 };
    this.box.x = Math.round((PW - this.box.w) / 2);
    this.box.y = Math.round((PH - this.box.h) / 2) - 6;
    const top = this.box.y + 14 + this.titleH + linesH + 4;
    this.menu = new TextMenu(o.items.map(([label, fn]) => ({ label, onClick: fn })), this.box.x + Math.round(this.box.w / 2) - 32, top, { size: 12, gap: 15, width: 90 });
  }
  get buttons() { return this.menu.rows(); }
  draw(ctx) {
    ctx.globalAlpha = 0.5; rect(ctx, 0, 0, PW, PH, UI.ink); ctx.globalAlpha = 1;
    const o = this.o, b = this.box;
    frameBox(ctx, b.x, b.y, b.w, b.h);
    const korean = /[^\x00-\x7f]/.test(o.title);
    const cx = b.x + b.w / 2;
    if (korean) text(ctx, o.title, cx, b.y + 12, o.titleColor ?? UI.paper, { size: 16, align: 'center', shadow: '#000' });
    else text(ctx, o.title, cx, b.y + 12, o.titleColor ?? UI.paper, { scale: 3, align: 'center', shadow: '#000' });
    let y = b.y + 14 + this.titleH;
    if (o.subtitle) { text(ctx, o.subtitle, cx, y, UI.dim, { size: 11, align: 'center' }); y += 14; }
    (o.lines ?? []).forEach(([t, c]) => { text(ctx, t, cx, y, c ?? UI.paper, { size: 11, align: 'center' }); y += 12; });
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
    if (st.phase === 'connecting' && !st.error) text(ctx, '연결 중…', 34, 74, UI.dim, { size: 11 });
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
