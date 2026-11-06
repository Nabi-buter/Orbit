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
import { CODE_CHARS, TIME_OPTIONS, buildVersion } from '../net/roomNet.js';
import { BALANCE } from '../config/balance.js';
import { getTouchControls, setTouchControls } from './touch.js';
import { WEAPONS, WEAPON_ORDER, randomWeapon } from '../config/weapons.js';

/** 무기 선택 목록: 7종 + 무작위 */
const PICKS = [...WEAPON_ORDER, 'random'];
import { CONTROLS, ACTIONS, ACTION_LABELS, keyLabel, assignKey, resetControls, isDefaultControls, RESERVED_KEYS } from '../config/controls.js';
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
  constructor({ onPlay, onOnline, onHelp, onSettings }) {
    this.menu = new TextMenu([
      { label: '플레이', onClick: onPlay },
      { label: '온라인 대전', onClick: onOnline },
      { label: '조작법', onClick: onHelp },
      { label: '설정', onClick: onSettings },
    ], 40, 120);
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
  { id: 'online', label: '온라인' },
  { id: 'training', label: '훈련장' },
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
    this.dummyWeapon = o.dummyWeapon ?? 'longsword';
    this.puppet = new Puppet(this.weapon === 'random' ? WEAPON_ORDER[0] : this.weapon, this.player, 1);
    this.hover = null;
    this.t = 0;
    this.layout();
  }

  layout() {
    const slot = 52, x0 = Math.round((PW - slot * PICKS.length) / 2);
    this.cards = PICKS.map((id, i) => ({ id, x: x0 + i * slot, y: 168, w: slot, h: 40 }));
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
  setWeapon(id) { this.weapon = id; if (id !== 'random') this.puppet.setWeapon(id); this.shuffleAt = 0; }
  cycleWeapon(d) { const i = PICKS.indexOf(this.weapon); this.setWeapon(PICKS[(i + d + PICKS.length) % PICKS.length]); }
  cycleDiff(d) { const k = Object.keys(DIFFICULTY); this.difficulty = k[(k.indexOf(this.difficulty) + d + k.length) % k.length]; }
  cycleCpu(d) { const list = ['random', ...WEAPON_ORDER]; this.cpuWeapon = list[(list.indexOf(this.cpuWeapon) + d + list.length) % list.length]; }
  cycleDummy(d) { const list = [...WEAPON_ORDER, 'random']; this.dummyWeapon = list[(list.indexOf(this.dummyWeapon) + d + list.length) % list.length]; }
  /** 무작위면 지금 하나를 뽑아 넘긴다 (pick 에는 고른 것 그대로 — 다시 대전할 때 새로 뽑도록) */
  confirm() { this.o.onStart({ weapon: this.weapon === 'random' ? randomWeapon() : this.weapon, pick: this.weapon, mode: this.mode, difficulty: this.difficulty, cpuWeapon: this.cpuWeapon, dummyWeapon: this.dummyWeapon }); }

  keys() {
    return this.player === 1
      ? { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], ok: ['Numpad1', 'Comma', ...CONFIRM] }
      : { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], ok: CONFIRM };
  }

  onKey(e) {
    const k = this.keys();
    // 훈련장: ← → 는 더미 무기 (내 무기는 A D)
    if (this.mode === 'training' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { this.cycleDummy(e.code === 'ArrowLeft' ? -1 : 1); return true; }
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
    if (this.mode === 'training' && hit(this.cpuRow, x, y)) { this.cycleDummy(1); return true; }
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
    const random = this.weapon === 'random';
    // 무작위: 가운데 캐릭터가 무기를 차례로 바꿔 든다
    if (random && this.t >= (this.shuffleAt ?? 0)) { this.shuffleAt = this.t + 36; const cur = this.puppet.f.weapon.id; this.puppet.setWeapon(WEAPON_ORDER[(WEAPON_ORDER.indexOf(cur) + 1) % WEAPON_ORDER.length]); }
    const w = random ? null : WEAPONS[this.weapon];
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
    if (random) {
      text(ctx, '무작위', 14, 36, UI.paper, { size: 16, shadow: UI.ink });
      wrap(`대전을 시작할 때 ${WEAPON_ORDER.length}종 중 하나를 고른다. 다시 대전하면 또 새로 뽑는다.`, 110).slice(0, 4).forEach((l, i) => text(ctx, l, 14, 63 + i * 12, UI.dim, { size: 11, forceRaster: true }));
    }
    const L = w?.light;
    if (w) text(ctx, w.name, 14, 36, UI.paper, { size: 16, shadow: UI.ink });
    if (w) wrap(w.desc, 110).slice(0, 3).forEach((l, i) => text(ctx, l, 14, 63 + i * 12, UI.dim, { size: 11, forceRaster: true }));
    const rows = random ? [] : [
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
    } else if (this.mode === 'training') {
      // 더미: 고른 무기를 든 채 가만히 서 있는 상대 (드는 자세와 무기 생김새 보기, 내 무기 시험)
      const ch = this.hover === this.cpuRow;
      text(ctx, '가만히 서 있는 상대', 312, 112, '#5d636f', { size: 11 });
      text(ctx, '더미', 312, 144, UI.dim, { size: 11 });
      text(ctx, `< ${this.dummyWeapon === 'random' ? '무작위' : WEAPONS[this.dummyWeapon].name} >`, PW - 12, 144, ch ? UI.gold : UI.paper, { size: 11, align: 'right' });
      if (!this.dummyPuppet || this.dummyPuppet.key !== this.dummyWeapon) {
        const id = this.dummyWeapon === 'random' ? WEAPON_ORDER[0] : this.dummyWeapon;
        this.dummyPuppet = new Puppet(id, 1, -1); this.dummyPuppet.key = this.dummyWeapon; this.dummyPuppet.idle = true;
      }
      if (this.dummyWeapon === 'random' && this.t % 36 === 0) { const cur = this.dummyPuppet.f.weapon.id; this.dummyPuppet.setWeapon(WEAPON_ORDER[(WEAPON_ORDER.indexOf(cur) + 1) % WEAPON_ORDER.length]); this.dummyPuppet.idle = true; }
      this.dummyPuppet.t++; // 숨쉬기만 (공격 시연 없음)
      this.dummyPuppet.draw(ctx, 372, 104);
    } else {
      text(ctx, '다음: 방 만들기·참가', 312, 136, UI.dim, { size: 11 });
    }

    // 하단: 어두운 띠 + 무기 거치대
    ctx.globalAlpha = 0.82; rect(ctx, 0, 166, PW, PH - 166, UI.ink); ctx.globalAlpha = 1;
    for (const c of this.cards) {
      const on = c.id === this.weapon;
      const hov = this.hover === c;
      const cxx = c.x + c.w / 2;
      if (!on && !hov) ctx.globalAlpha = 0.5;
      if (c.id === 'random') text(ctx, '?', cxx, 178 - (on ? 2 : 0), UI.gold, { scale: 2, align: 'center', shadow: UI.ink });
      else drawWeaponIcon(ctx, c.id, WEAPONS[c.id].color, cxx, 186 - (on ? 2 : 0));
      ctx.globalAlpha = 1;
      text(ctx, c.id === 'random' ? '무작위' : WEAPONS[c.id].name, cxx, 199, on ? UI.paper : '#5d636f', { size: 11, align: 'center' });
      if (on) rect(ctx, cxx - 10, 212, 20, 2, UI.gold);
    }

    // 하단 안내
    const sb = this.start;
    const kw = keycap(ctx, 'ENTER', sb.x, sb.y + 1, UI.gold);
    text(ctx, '대전 시작', sb.x + kw + 5, sb.y, this.hover === sb ? UI.gold : UI.paper, { size: 11 });
    const bw = keycap(ctx, 'ESC', this.back.x, this.back.y + 1);
    text(ctx, '뒤로', this.back.x + bw + 5, this.back.y, UI.dim, { size: 11 });
    text(ctx, this.mode === 'training' ? 'A D 내 무기 · ← → 더미 · Q E 모드' : 'A D 무기 · Q E 모드', PW / 2, 221, '#5d636f', { size: 11, align: 'center' });
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
    text(ctx, '키', 104, 42, UI.dim, { size: 11 });
    rows.forEach(([label, ...acts], i) => {
      const y = 56 + i * 14;
      text(ctx, label, 20, y, UI.paper, { size: 11 });
      const keys = acts.map((a) => keyLabel(CONTROLS[0][a][0])).join(' ');
      text(ctx, keys, 104, y + 2, UI.dim);
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
// 설정: 키 배치(P1 · P2), 화면 버튼, 기본값으로 되돌리기
// -----------------------------------------------------------------------------
export class SettingsScreen {
  constructor({ onBack }) {
    this.onBack = onBack;
    this.capture = null;   // 키를 기다리는 칸 {p, a}
    this.note = null;      // 바꾼 결과 안내 {text, color, until}
    this.t = 0;
    this.items = [];
    ACTIONS.forEach((a, row) => this.items.push({ kind: 'key', p: 0, a, row, x: 150, y: 46 + row * 15, w: 110, h: 13 }));
    this.items.push({ kind: 'touch', x: 312, y: 62, w: 104, h: 14 });
    this.items.push({ kind: 'reset', x: 312, y: 112, w: 104, h: 16 });
    this.items.push({ kind: 'back', x: 10, y: 220, w: 60, h: 14 });
    this.focus = 0;
    this.hover = null;
  }
  get capturing() { return !!this.capture; }
  get buttons() { return this.items; }

  activate(it) {
    if (it.kind === 'key') { this.capture = { p: it.p, a: it.a }; this.note = null; }
    else if (it.kind === 'touch') setTouchControls(!getTouchControls());
    else if (it.kind === 'reset') {
      resetControls();
      setTouchControls(true);
      this.say('모든 설정을 기본값으로 되돌렸습니다', UI.gold);
    } else if (it.kind === 'back') this.onBack();
  }
  say(text, color = UI.paper) { this.note = { text, color, until: this.t + 240 }; }

  onKey(e) {
    if (this.capture) {
      e.preventDefault?.();
      if (e.code === 'Escape') { this.capture = null; return true; }
      if (RESERVED_KEYS.has(e.code)) { this.say(`${keyLabel(e.code)} 키는 메뉴용이라 쓸 수 없습니다`, UI.red); return true; }
      const { p, a } = this.capture;
      const r = assignKey(p, a, e.code);
      this.capture = null;
      if (r.swapped) this.say(`${ACTION_LABELS[a]} ↔ ${ACTION_LABELS[r.swapped[1]]} 키를 서로 바꿨습니다`, UI.gold);
      else this.say(`${ACTION_LABELS[a]} = ${keyLabel(e.code)}`, UI.paper);
      return true;
    }
    const it = this.items[this.focus];
    const move = (to) => { if (to >= 0 && to < this.items.length) this.focus = to; return true; };
    if (BACK.includes(e.code)) { this.onBack(); return true; }
    if (CONFIRM.includes(e.code)) { this.activate(it); return true; }
    const base = ACTIONS.length; // 키 칸 다음부터 오른쪽 항목
    if (it.kind === 'key') {
      if (e.code === 'ArrowDown') return move(it.row + 1);
      if (e.code === 'ArrowUp') return move(Math.max(0, it.row - 1));
      if (e.code === 'ArrowRight') return move(base);
    } else {
      if (e.code === 'ArrowDown') return move(Math.min(this.items.length - 1, this.focus + 1));
      if (e.code === 'ArrowUp') return move(this.focus === base ? 0 : this.focus - 1);
      if (e.code === 'ArrowLeft') return move(0);
    }
    return false;
  }
  onClick(x, y) {
    const i = this.items.findIndex((b) => hit(b, x, y));
    if (i < 0) { this.capture = null; return false; }
    this.focus = i;
    this.activate(this.items[i]);
    return true;
  }
  onMove(x, y) { this.hover = this.items.find((b) => hit(b, x, y)) ?? null; }

  draw(ctx) {
    this.t++;
    background(ctx, 0.9);
    text(ctx, '설정', 20, 12, UI.paper, { size: 14 });
    // 키 배치 표
    text(ctx, '키 배치', 20, 32, UI.dim, { size: 11 });
    ACTIONS.forEach((a, row) => text(ctx, ACTION_LABELS[a], 20, 46 + row * 15, UI.paper, { size: 11 }));
    const focused = this.items[this.focus];
    for (const it of this.items) {
      const on = it === focused || it === this.hover;
      if (it.kind === 'key') {
        const cap = this.capture && this.capture.p === it.p && this.capture.a === it.a;
        rect(ctx, it.x, it.y - 1, it.w, it.h, cap ? '#3a3220' : on ? '#323745' : '#20242d');
        rect(ctx, it.x, it.y + it.h - 2, it.w, 1, cap ? UI.gold : on ? '#5b616e' : '#2c303b');
        const label = cap ? (this.t % 40 < 26 ? '키를 누르세요' : '') : keyLabel(CONTROLS[it.p][it.a][0]);
        const extra = !cap && CONTROLS[it.p][it.a].length > 1 ? ` +${CONTROLS[it.p][it.a].length - 1}` : '';
        if (label) text(ctx, label + extra, it.x + it.w / 2, it.y + (cap ? 0 : 2), cap ? UI.gold : UI.paper, cap ? { size: 11, align: 'center' } : { align: 'center' });
      }
    }
    // 오른쪽: 화면 버튼 · 되돌리기
    const touch = this.items.find((i) => i.kind === 'touch');
    text(ctx, '화면 버튼 (터치 화면)', 312, 46, UI.dim, { size: 11 });
    const tOn = getTouchControls();
    rect(ctx, touch.x, touch.y, touch.w, touch.h, focused === touch || this.hover === touch ? '#323745' : '#20242d');
    text(ctx, tOn ? '켜짐' : '꺼짐', touch.x + 8, touch.y + 1, tOn ? UI.gold : UI.dim, { size: 11 });
    text(ctx, '바꾸기', touch.x + touch.w - 8, touch.y + 1, UI.dim, { size: 11, align: 'right' });
    const reset = this.items.find((i) => i.kind === 'reset');
    const resetOn = focused === reset || this.hover === reset;
    rect(ctx, reset.x, reset.y, reset.w, reset.h, resetOn ? '#3a3220' : '#20242d');
    rect(ctx, reset.x, reset.y + reset.h - 1, reset.w, 1, resetOn ? UI.gold : '#2c303b');
    text(ctx, '기본값으로 되돌리기', reset.x + reset.w / 2, reset.y + 2, resetOn ? UI.gold : UI.paper, { size: 11, align: 'center' });
    text(ctx, isDefaultControls() && tOn ? '지금 기본값입니다' : '바뀐 설정이 있습니다', 312, 134, '#5d636f', { size: 11 });
    // 안내
    const help = this.capture ? '새 키를 누르세요 · ESC 취소 (이미 쓰는 키면 서로 바뀝니다)' : '칸을 누르거나 방향키로 고른 뒤 ENTER, 그다음 새 키를 누르세요';
    text(ctx, help, 20, 172, this.capture ? UI.gold : '#5d636f', { size: 11 });
    if (this.note && this.t < this.note.until) text(ctx, this.note.text, 20, 188, this.note.color, { size: 11 });
    text(ctx, '설정은 이 기기에 저장됩니다', PW - 12, 224, '#5d636f', { size: 11, align: 'right' });
    const back = this.items.find((i) => i.kind === 'back');
    const bw = keycap(ctx, 'ESC', back.x, back.y + 1);
    text(ctx, '돌아가기', back.x + bw + 5, back.y, focused === back || this.hover === back ? UI.gold : UI.paper, { size: 11 });
  }
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
/** 시간 제한 표시 (0 = 무제한) */
export function timeLabel(s) { return !s ? '무제한' : `${s}초`; }

export class OnlineScreen {
  /** cb: {onCreate, onJoin(code), onSelect(w), onReady(bool), onLeave, onBack} */
  constructor(cb) {
    this.cb = cb;
    this.code = '';
    this.state = { phase: 'connecting' };
    this.t = 0;
    this.build();
  }
  setState(st) {
    // 답(방에 들어감 · 오류 · 처음 화면으로)이 오면 진행 표시를 푼다
    if (st.phase !== this.state.phase || st.error) this.pending = null;
    this.state = st; this.build();
  }
  /** 방 만들기·참가를 누른 뒤 답을 기다리는 중 (여러 번 눌러도 한 번만) */
  busy() { return this.pending && Date.now() - this.pending.at < 12000; }
  start(kind, fn) {
    if (this.busy()) return;
    this.pending = { kind, at: Date.now() };
    this.state = { ...this.state, error: null };
    this.build();
    fn();
  }
  /** 왼쪽 띠 안에서 줄바꿈한 오류 문구 (띠 폭을 넘지 않게) */
  errorLines() { return this.state.error ? wrap(this.state.error, 165) : []; }
  build() {
    const st = this.state;
    this.keys = [];
    const below = 44 + this.errorLines().length * 12 + 12; // 오류 문구 아래부터
    if (st.phase === 'connect') {
      this.menu = new TextMenu([
        { label: this.busy() && this.pending.kind === 'create' ? '방 만드는 중…' : '방 만들기', disabled: this.busy(), onClick: () => this.start('create', this.cb.onCreate) },
        { label: this.busy() && this.pending.kind === 'join' ? '참가하는 중…' : '코드로 참가', disabled: this.busy(), onClick: () => this.join() },
        { label: '뒤로', onClick: this.cb.onBack },
      ], 34, Math.max(74, below));
      // 화면 코드 입력판 (터치·마우스): 코드 글자 32개 + 지우기 + 참가
      const cw = 23, ch = 19, x0 = 224, y0 = 62;
      [...CODE_CHARS].forEach((c, i) => this.keys.push({ label: c, x: x0 + (i % 8) * cw, y: y0 + Math.floor(i / 8) * ch, w: cw - 2, h: ch - 2, act: () => this.type(c) }));
      this.keys.push({ label: '지우기', x: x0, y: y0 + 4 * ch + 4, w: cw * 3 - 2, h: 16, act: () => { this.code = this.code.slice(0, -1); } });
      this.keys.push({ label: this.busy() ? '참가 중…' : '참가', x: x0 + cw * 5, y: y0 + 4 * ch + 4, w: cw * 3 - 2, h: 16, primary: true, act: () => this.join() });
    } else if (st.phase === 'room') {
      const me = st.slot, op = 1 - me;
      this.menu = new TextMenu([
        { label: st.ready?.[me] ? '준비 취소' : '준비', disabled: !st.connected?.[op], onClick: () => this.cb.onReady(!st.ready[me]) },
        { label: '방 나가기', onClick: this.cb.onLeave },
      ], 34, 190);
      // 시간 제한: 방장만 바꿈 (◀ ▶ 버튼 또는 Q / E)
      if (me === 0) {
        this.keys.push({ label: '<', x: 34, y: 103, w: 18, h: 16, act: () => this.cycleTime(-1) });
        this.keys.push({ label: '>', x: 124, y: 103, w: 18, h: 16, act: () => this.cycleTime(1) });
      }
    } else {
      this.menu = new TextMenu([{ label: '뒤로', onClick: this.cb.onBack }], 34, Math.max(190, below));
    }
  }
  cycleTime(d) {
    const st = this.state;
    if (st.phase !== 'room' || st.slot !== 0 || !this.cb.onTime) return;
    const opts = TIME_OPTIONS;
    const i = Math.max(0, opts.indexOf(st.time ?? BALANCE.round.onlineDefault));
    this.cb.onTime(opts[(i + d + opts.length) % opts.length]);
  }
  type(c) { if (this.code.length < 4) this.code += c; }
  join() { if (this.code.length === 4) this.start('join', () => this.cb.onJoin(this.code)); }
  get buttons() { return [...this.menu.rows(), ...this.keys]; }
  onKey(e) {
    const st = this.state;
    if (st.phase === 'connect') {
      if (/^Key[A-Z]$|^Digit\d$/.test(e.code) && this.code.length < 4) { this.code += e.code.at(-1); return true; }
      if (e.code === 'Backspace') { this.code = this.code.slice(0, -1); return true; }
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.code.length === 4) { this.join(); return true; }
      if (e.code === 'Escape') { this.cb.onBack(); return true; }
      if (['ArrowDown', 'ArrowUp', 'Enter', 'NumpadEnter'].includes(e.code)) return this.menu.onKey(e);
      return false;
    }
    if (st.phase === 'room') {
      const me = st.slot;
      const i = WEAPON_ORDER.indexOf(st.weapons?.[me] ?? 'longsword');
      if (['KeyA', 'ArrowLeft'].includes(e.code)) { this.cb.onSelect(WEAPON_ORDER[(i + WEAPON_ORDER.length - 1) % WEAPON_ORDER.length]); return true; }
      if (['KeyD', 'ArrowRight'].includes(e.code)) { this.cb.onSelect(WEAPON_ORDER[(i + 1) % WEAPON_ORDER.length]); return true; }
      if (e.code === 'KeyQ') { this.cycleTime(-1); return true; }
      if (e.code === 'KeyE') { this.cycleTime(1); return true; }
      if (CONFIRM.includes(e.code)) { if (st.connected?.[1 - me]) this.cb.onReady(!st.ready[me]); return true; }
      if (e.code === 'Escape') { this.cb.onLeave(); return true; }
      return this.menu.onKey(e);
    }
    if (BACK.includes(e.code)) { this.cb.onBack(); return true; }
    return this.menu.onKey(e);
  }
  onClick(x, y) {
    const k = this.keys.find((b) => hit(b, x, y));
    if (k) { k.act(); return true; }
    return this.menu.onClick(x, y);
  }
  onMove(x, y) { this.hoverKey = this.keys.find((b) => hit(b, x, y)) ?? null; this.menu.onMove(x, y); }
  draw(ctx) {
    this.t++;
    background(ctx, 0.4);
    ctx.globalAlpha = 0.86; rect(ctx, 0, 0, 210, PH, UI.ink); ctx.globalAlpha = 1;
    rect(ctx, 210, 0, 1, PH, '#2a2e38');
    const st = this.state;
    text(ctx, '온라인 대전', 34, 16, UI.paper, { size: 14 });
    rect(ctx, 34, 36, 18, 2, UI.gold);
    // 오류: 방 화면에서는 방 코드 아래 빈 곳에, 그 외에는 제목 아래
    const ey = st.phase === 'room' ? 150 : 44;
    this.errorLines().slice(0, st.phase === 'room' ? 3 : 9).forEach((l, i) => text(ctx, l, 34, ey + i * 12, UI.red, { size: 11, forceRaster: true }));
    // 게임 버전 (두 기기가 같은지 비교용)
    text(ctx, `v${buildVersion()}`, 204, 228, '#454a56', { size: 9, align: 'right' });
    if (st.phase === 'connecting' && !st.error) text(ctx, '연결 중…', 34, 74, UI.dim, { size: 11 });
    if (st.phase === 'connect') {
      // 오른쪽: 코드 입력판 (어두운 판 위)
      ctx.globalAlpha = 0.82; rect(ctx, 216, 16, 202, 168, UI.ink); ctx.globalAlpha = 1;
      text(ctx, '참가할 방 코드', 224, 26, UI.dim, { size: 11 });
      for (let k = 0; k < 4; k++) {
        const x = 318 + k * 18;
        rect(ctx, x, 40, 14, 1, k === this.code.length && this.t % 40 < 20 ? UI.gold : '#5b616e');
        if (this.code[k]) text(ctx, this.code[k], x + 7, 30, UI.gold, { scale: 1, align: 'center' });
      }
      for (const b of this.keys) {
        const hov = this.hoverKey === b;
        const off = b.primary && (this.code.length !== 4 || this.busy());
        rect(ctx, b.x, b.y, b.w, b.h, b.primary && !off ? '#3a3220' : hov ? '#323745' : '#232733');
        rect(ctx, b.x, b.y + b.h - 1, b.w, 1, '#0d0f13');
        rect(ctx, b.x, b.y, b.w, 1, hov ? '#5b616e' : '#363b48');
        const korean = /[^\x00-\x7f]/.test(b.label);
        text(ctx, b.label, b.x + b.w / 2, b.y + (korean ? 2 : 5), off ? '#565c69' : b.primary ? UI.gold : UI.paper, korean ? { size: 11, align: 'center' } : { align: 'center' });
      }
      text(ctx, '키보드로 입력해도 됩니다', 224, 166, '#5d636f', { size: 11 });
      // 왼쪽 메뉴 아래 안내
      text(ctx, '방을 만들면 4자리 코드가', 34, this.menu.y + 58, '#5d636f', { size: 11 });
      text(ctx, '나옵니다. 상대에게 알려 주세요.', 34, this.menu.y + 70, '#5d636f', { size: 11 });
    }
    if (st.phase === 'room') {
      const me = st.slot, op = 1 - me;
      text(ctx, '방 코드', 34, 50, UI.dim, { size: 11 });
      text(ctx, st.code ?? '', 80, 49, UI.gold, { scale: 2 });
      const pingTxt = st.rtt != null ? ` · 핑 ${st.rtt}ms` : '';
      text(ctx, (st.connected?.[op] ? '상대 접속됨' : '상대를 기다리는 중…') + pingTxt, 34, 70, UI.dim, { size: 11 });
      // 시간 제한
      const host = me === 0;
      text(ctx, '시간 제한', 34, 90, UI.dim, { size: 11 });
      text(ctx, timeLabel(st.time ?? BALANCE.round.onlineDefault), 88, 105, UI.gold, { size: 13, align: 'center', shadow: UI.ink });
      if (host) {
        for (const b of this.keys) {
          const hov = this.hoverKey === b;
          rect(ctx, b.x, b.y, b.w, b.h, hov ? '#323745' : '#232733');
          rect(ctx, b.x, b.y, b.w, 1, hov ? '#5b616e' : '#363b48');
          rect(ctx, b.x, b.y + b.h - 1, b.w, 1, '#0d0f13');
          text(ctx, b.label, b.x + b.w / 2, b.y + 5, UI.paper, { align: 'center' });
        }
        text(ctx, 'Q E 로 변경', 34, 124, '#5d636f', { size: 11 });
        text(ctx, '바꾸면 양쪽 준비가 풀립니다', 34, 136, '#5d636f', { size: 11 });
      } else text(ctx, '방장이 정합니다', 34, 124, '#5d636f', { size: 11 });
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
