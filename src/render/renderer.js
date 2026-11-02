// =============================================================================
// 픽셀 렌더러: 저해상도 아트 캔버스(PW×PH)에 그린 뒤 화면 크기에 맞게 확대한다.
// Match 상태를 읽기만 한다 (로직 변경 없음).
// =============================================================================

import { BALANCE, STAGE } from '../config/balance.js';
import { S, worldBox } from '../core/fighter.js';
import { drawFighter, weaponTip } from './fighterArt.js';
import { Effects } from './effects.js';
import { playEvent } from './sfx.js';
import { PX, PW, PH, createArtCanvas, rect, line, px, disc, text, panel } from './pixel.js';

const GY = STAGE.groundY;
export const GROUND = Math.round(GY / PX);

/** 월드 → 아트 좌표 */
export const AX = (x) => Math.round(x / PX);
export const AY = (y) => Math.round((GY - y) / PX);

export const TEAM = [
  // 마네킹형 회색 몸 + 팀 색 어깨 패드/눈빛
  { body: '#c9cad6', light: '#eeeef6', shade: '#8e90a6', joint: '#545670', pad: '#4b5d8f', visor: '#8fbcff', outline: '#16121f', main: '#5d93d9', ui: '#78a6dd' },
  { body: '#d0c8c8', light: '#f4eeee', shade: '#9a8c90', joint: '#5e4f58', pad: '#8f4e4b', visor: '#ff9a86', outline: '#16121f', main: '#d9655b', ui: '#e07f6a' },
];

export const UI = {
  ink: '#140f1e',
  paper: '#efe3c4',
  dim: '#8f86a6',
  panel: '#221a33',
  panel2: '#2e2445',
  gold: '#f0c75e',
  red: '#d9554a',
  green: '#7fc47a',
  cyan: '#6fb7c9',
  purple: '#9b6bd3',
};

/** 이벤트별 히트스톱(프레임). 양쪽 동일하게 멈춤 → 공정 */
export const HITSTOP = { hit: 5, parry: 4, perfect: 12, guardBreak: 10, special: 14, armored: 2, ko: 20 };

export function hitstopFor(events) {
  let n = 0;
  for (const e of events) {
    let h = HITSTOP[e.type] ?? 0;
    if (e.type === 'hit' && (e.kind === 'heavy' || e.kind === 'plunge')) h = 9;
    if (e.type === 'hit' && e.kind === 'ultimate') h = 14;
    n = Math.max(n, h);
  }
  return n;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    const a = createArtCanvas();
    this.art = a.canvas;
    this.actx = a.ctx;
    this.showBoxes = false;
    this.fx = new Effects();
    this.bg = null;
    this.time = 0;
    this.reset();
  }

  reset() {
    this.fx.reset();
    this.trails = [[], []];
    this.swings = [[], []];
    this.prevState = [null, null];
    this.hpTrail = [Infinity, Infinity];
    this.hpTrailDelay = [0, 0];
  }

  /** 프레임 시작: 화면 크기 맞춤, 아트 캔버스 반환 */
  begin() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(this.canvas.clientWidth * dpr) || PW * 3;
    const ch = Math.round(this.canvas.clientHeight * dpr) || PH * 3;
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    this.time++;
    return this.actx;
  }

  /** 아트 캔버스를 최근접 보간으로 확대 출력 */
  present() {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    c.fillStyle = UI.ink;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    c.drawImage(this.art, 0, 0, PW, PH, 0, 0, this.canvas.width, this.canvas.height);
  }

  /** 화면 좌표 → 아트 좌표 (마우스) */
  toArt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    return [Math.floor(((clientX - r.left) / r.width) * PW), Math.floor(((clientY - r.top) / r.height) * PH)];
  }

  // ---------------------------------------------------------------------------
  // 이벤트 → 효과
  // ---------------------------------------------------------------------------
  pushEvents(events, match) {
    const fx = this.fx;
    for (const e of events) {
      playEvent(e.type, e.kind);
      const x = AX(e.x ?? STAGE.width / 2);
      const y = AY(e.y ?? 80);
      const D = match?.fighters[e.defender];
      const dir = D && match ? Math.sign(D.x - match.fighters[e.attacker].x) || 1 : 1;
      switch (e.type) {
        case 'hit': {
          const big = e.kind === 'heavy' || e.kind === 'plunge' || e.kind === 'ultimate';
          fx.sparks(x, y, UI.paper, big ? 14 : 8, big ? 2.6 : 1.8, { dir: dir > 0 ? 0 : Math.PI, spread: 1.8 });
          fx.sparks(x, y, '#f08a3c', big ? 8 : 4, big ? 2 : 1.4);
          fx.ring(x, y, UI.paper, big ? 12 : 7, 8);
          fx.addShake(big ? 1 : 0);
          if (e.kind === 'ultimate') { fx.text('궁극기 적중', x, y - 22, UI.gold, 3); fx.screenFlash('#f08a3c', 0.18); }
          break;
        }
        case 'parry':
          fx.sparks(x, y, '#bfe0ea', 8, 1.6, { dir: dir > 0 ? Math.PI : 0, spread: 2 });
          fx.ring(x, y, UI.cyan, 9, 10);
          fx.text('패링', x, y - 16, '#bfe0ea', 1, 32);
          break;
        case 'perfect':
          fx.sparks(x, y, UI.gold, 20, 2.6, { life: 22 });
          fx.ring(x, y, UI.gold, 24, 18);
          fx.ring(x, y, UI.paper, 13, 12);
          fx.text('완벽패링!', x, y - 24, UI.gold, 3, 60);
          fx.screenFlash('#f6e2a0', 0.22);
          fx.addShake(1);
          break;
        case 'guardBreak':
          fx.sparks(x, y, UI.purple, 20, 2.6, { size: 2, life: 26 });
          fx.ring(x, y, UI.purple, 22, 18);
          fx.text('가드 브레이크!', x, y - 26, '#cfa8f2', 3, 70);
          fx.screenFlash('#5b2a99', 0.2);
          fx.addShake(1);
          break;
        case 'special':
          fx.sparks(x, y, UI.paper, 24, 3.2, { dir: dir > 0 ? 0 : Math.PI, spread: 1.2, life: 24 });
          fx.sparks(x, y, UI.purple, 14, 2.2);
          fx.ring(x, y, UI.paper, 30, 20);
          fx.text('특수강공!', x, y - 26, UI.paper, 3, 60);
          fx.addShake(1);
          break;
        case 'armored':
          fx.ring(x, y, '#f08a3c', 8, 8);
          fx.text('버팀', x, y - 14, '#f6b26b', 1, 24);
          break;
        case 'ko':
          fx.text('K.O.', PW / 2, 80, UI.paper, 5, 90);
          fx.screenFlash('#ffffff', 0.35);
          break;
        default:
          break;
      }
    }
  }

  watchStates(match) {
    match.fighters.forEach((f, i) => {
      const prev = this.prevState[i];
      const x = AX(f.x), y = AY(f.y);
      if (prev !== f.state) {
        if (f.state === S.ULTIMATE) {
          this.fx.text('궁극기!', x, y - 56, TEAM[i].ui, 3, 50);
          this.fx.ring(x, y - 20, '#f08a3c', 32, 18);
          this.fx.screenFlash('#000000', 0.35);
          playEvent('ult');
        }
        if (f.state === S.DASH) {
          this.fx.sparks(x, GROUND - 1, UI.dim, 5, 1, { dir: f.dash?.dir > 0 ? Math.PI : 0, spread: 0.6, gravity: -0.02 });
          playEvent('dash');
        }
        if (f.state === S.JUMP) this.fx.sparks(x, GROUND - 1, UI.dim, 5, 0.9, { dir: -Math.PI / 2, spread: 2.5, gravity: 0 });
        if (prev === S.JUMP || prev === S.PLUNGE) this.fx.sparks(x, GROUND - 1, UI.dim, prev === S.PLUNGE ? 12 : 5, prev === S.PLUNGE ? 1.8 : 0.9, { dir: -Math.PI / 2, spread: 3, gravity: 0.05 });
        if (f.state === S.PARRIED) this.fx.text('!', x, y - 52, UI.gold, 3, 30);
        this.prevState[i] = f.state;
      }
      const trailing = f.state === S.DASH || f.state === S.ULTIMATE || f.state === S.KNOCKBACK || f.state === S.PLUNGE;
      if (trailing && this.time % 3 === 0) this.trails[i].push({ snap: { ...f, attack: f.attack ? { ...f.attack } : null, dash: f.dash ? { ...f.dash } : null }, life: 12 });
      for (const t of this.trails[i]) t.life--;
      this.trails[i] = this.trails[i].filter((t) => t.life > 0).slice(-5);
    });
  }

  // ---------------------------------------------------------------------------
  // 대전 화면
  // ---------------------------------------------------------------------------
  drawBattle(match, opts = {}) {
    const ctx = this.actx;
    const k = (opts.dt ?? 16.67) / 16.67;
    if (!opts.frozen) this.watchStates(match);
    this.fx.update(k);

    this.drawBackground(ctx);
    const [ox, oy] = this.fx.shakeOffset();
    ctx.save();
    ctx.translate(ox, oy);

    if (match.fighters.some((f) => f.state === S.ULTIMATE)) {
      ctx.globalAlpha = 0.35; rect(ctx, 0, 0, PW, PH, '#000'); ctx.globalAlpha = 1;
    }
    match.fighters.forEach((f) => this.drawShadow(ctx, f));
    match.fighters.forEach((f, i) => this.trails[i].forEach((t) => {
      ctx.globalAlpha = 0.35 * (t.life / 12);
      drawFighter(ctx, t.snap, AX(t.snap.x), AY(t.snap.y), TEAM[i], match.frame, { tint: TEAM[i].main, silhouette: true });
      ctx.globalAlpha = 1;
    }));
    const order = [0, 1].sort((a, b) => (match.fighters[a].attack ? 1 : 0) - (match.fighters[b].attack ? 1 : 0));
    for (const i of order) this.drawOneFighter(ctx, match, match.fighters[i], i, opts.frozen);
    for (const i of order) this.drawStatusMarks(ctx, match, match.fighters[i], i);
    if (this.showBoxes) match.fighters.forEach((f) => this.drawBoxes(ctx, f));
    this.fx.drawWorld(ctx);
    ctx.restore();

    this.fx.drawScreen(ctx, PW, PH);
    this.drawHud(ctx, match, opts);
    if (opts.intro) this.drawIntro(ctx, opts.intro);
  }

  drawShadow(ctx, f) {
    const s = Math.max(0.4, 1 - f.y / 260);
    const w = Math.round(11 * s);
    ctx.globalAlpha = 0.45 * s;
    rect(ctx, AX(f.x) - w, GROUND + 1, w * 2 + 1, 1, '#000');
    rect(ctx, AX(f.x) - w + 2, GROUND + 2, w * 2 - 3, 1, '#000');
    ctx.globalAlpha = 1;
  }

  drawOneFighter(ctx, match, f, i, frozen) {
    const pal = { ...TEAM[i], weapon: f.weapon.color };
    const x = AX(f.x), y = AY(f.y);
    const recent = f.flash && match.frame - f.flash.frame < 5;
    let tint;
    if (f.state === S.HITSTUN && recent) tint = '#ffffff';
    if (f.state === S.GUARD_BREAK && match.frame % 16 < 8) tint = '#9b6bd3';
    if (f.state === S.KO) tint = '#5a5468';

    if (f.state === S.ULTIMATE) {
      const r = 18 + (this.time % 6 < 3 ? 1 : 0);
      ctx.globalAlpha = 0.3; disc(ctx, x, y - 20, r, '#f08a3c'); ctx.globalAlpha = 0.25; disc(ctx, x, y - 20, r - 5, '#f6d36b'); ctx.globalAlpha = 1;
    }
    if (f.ult >= BALANCE.fighter.maxUlt && f.state !== S.ULTIMATE && this.time % 20 < 10) {
      px(ctx, x - 6 + (this.time % 13), GROUND - 1, UI.gold);
    }

    const r = drawFighter(ctx, f, x, y, pal, match.frame, { tint });

    // 무기 휘두르기 궤적
    const sw = this.swings[i];
    const strike = f.attack && f.attack.def.hits.some((h) => f.attack.frame >= h.from - 1 && f.attack.frame <= h.to + 1);
    if (!frozen) {
      if (strike && f.weapon.id !== 'knuckle') sw.push({ p: weaponTip(f, r.hand, r.wAngle), life: 8 });
      for (const s of sw) s.life--;
      this.swings[i] = sw.filter((s) => s.life > 0).slice(-6);
    }
    const pts = this.swings[i];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1].p, b = pts[k].p;
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 16) continue; // 끊긴 궤적은 잇지 않음
      line(ctx, a[0], a[1], b[0], b[1], k === pts.length - 1 ? UI.paper : f.weapon.color, 1);
    }

    // 가드: 전방 방패 호
    if (f.state === S.GUARD || f.state === S.BLOCKSTUN) {
      const fresh = match.frame - f.guardPress <= BALANCE.guard.perfectWindow && f.guardPress - f.prevGuardPress >= BALANCE.guard.perfectRearm;
      const low = f.guard / BALANCE.fighter.maxGuard < 0.3;
      const c = fresh ? UI.gold : low ? UI.red : UI.cyan;
      const cx = x + f.facing * 5, cy = y - 20;
      for (let a = -1.0; a <= 1.0; a += 0.12) {
        const ang = f.facing > 0 ? a : Math.PI - a;
        px(ctx, Math.round(cx + Math.cos(ang) * 17), Math.round(cy + Math.sin(ang) * 17), c);
        if (fresh || f.state === S.BLOCKSTUN) px(ctx, Math.round(cx + Math.cos(ang) * 16), Math.round(cy + Math.sin(ang) * 16), c);
      }
    }
  }

  drawStatusMarks(ctx, match, f, i) {
    const x = AX(f.x), y = AY(f.y);
    if (f.state === S.GUARD_BREAK) {
      for (let k = 0; k < 3; k++) {
        const a = this.time * 0.12 + (k * Math.PI * 2) / 3;
        const sx = Math.round(x + Math.cos(a) * 8), sy = Math.round(y - 50 + Math.sin(a) * 2);
        px(ctx, sx, sy - 1, UI.gold); px(ctx, sx - 1, sy, UI.gold); px(ctx, sx, sy, UI.gold); px(ctx, sx + 1, sy, UI.gold); px(ctx, sx, sy + 1, UI.gold);
      }
      const t = f.timer / BALANCE.guardBreak.stun;
      rect(ctx, x - 14, y - 60, 28, 3, UI.ink);
      rect(ctx, x - 13, y - 59, Math.round(26 * t), 1, UI.purple);
      text(ctx, 'GUARD BREAK', x, y - 69, '#cfa8f2', { align: 'center', shadow: UI.ink });
    }
    if (f.state === S.PARRIED) text(ctx, '!', x, y - 60, UI.gold, { scale: 2, align: 'center', shadow: UI.ink });
    // 숨 고르기: 머리 위 작은 막대 (글자는 HUD 에 표시)
    const c = f.combo;
    if (c.lock > 0 && f.state !== S.KO) {
      const t = c.lock / c.lockMax;
      rect(ctx, x - 11, y - 55, 22, 3, UI.ink);
      rect(ctx, x - 10, y - 54, Math.round(20 * t), 1, '#c9c1dc');
    }
    if (f.state !== S.KO) {
      const c2 = TEAM[i].main;
      rect(ctx, x - 2, y - 49, 5, 1, c2); rect(ctx, x - 1, y - 48, 3, 1, c2); px(ctx, x, y - 47, c2);
    }
  }

  drawBoxes(ctx, f) {
    const F = BALANCE.fighter;
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = UI.green; ctx.lineWidth = 1;
    ctx.strokeRect(AX(f.x - F.width / 2) + 0.5, AY(f.y + F.height) + 0.5, Math.round(F.width / PX), Math.round(F.height / PX));
    const a = f.attack;
    if (a) {
      const hits = f.state === S.PLUNGE ? [f.weapon.plunge.hit] : a.def.hits.filter((h) => a.frame >= h.from && a.frame <= h.to);
      for (const h of hits) {
        const b = worldBox(f, h.box);
        ctx.globalAlpha = 0.35; rect(ctx, AX(b.x), AY(b.y + b.h), b.w / PX, b.h / PX, UI.red); ctx.globalAlpha = 0.8;
      }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // 배경 (도트)
  // ---------------------------------------------------------------------------
  drawBackground(ctx) {
    if (!this.bg) this.bg = buildBackground();
    ctx.drawImage(this.bg, 0, 0);
    for (const wx of [STAGE.leftWall - 40, STAGE.rightWall + 40]) {
      const x = AX(wx), y = 92;
      const f = (this.time >> 2) % 3;
      rect(ctx, x - 1, y - 2 - f, 3, 3 + f, '#f08a3c');
      rect(ctx, x, y - 4 - f, 1, 2, '#f6d36b');
      px(ctx, x + (f === 1 ? 1 : -1), y - 5 - f, '#f6d36b');
    }
    if (this.time % 40 < 20) { px(ctx, 88, 30, UI.paper); px(ctx, 300, 18, UI.paper); }
  }

  // ---------------------------------------------------------------------------
  // HUD (도트)
  // ---------------------------------------------------------------------------
  drawHud(ctx, match, opts) {
    const F = BALANCE.fighter;
    match.fighters.forEach((f, i) => {
      if (f.hp < this.hpTrail[i]) {
        if (this.hpTrailDelay[i] > 0) this.hpTrailDelay[i]--;
        else this.hpTrail[i] = Math.max(f.hp, this.hpTrail[i] - 8);
      } else { this.hpTrail[i] = f.hp; this.hpTrailDelay[i] = 30; }
      if (f.flash && match.frame - f.flash.frame === 0) this.hpTrailDelay[i] = 30;

      const left = i === 0;
      const X = left ? 8 : PW - 8;
      const s = left ? 1 : -1;
      const name = opts.names?.[i] ?? `P${i + 1}`;
      const nw = text(ctx, name, X, 6, TEAM[i].ui, { size: 11, align: left ? 'left' : 'right', shadow: UI.ink });
      text(ctx, f.weapon.name, X + s * (nw + 5), 6, f.weapon.color, { size: 10, align: left ? 'left' : 'right', shadow: UI.ink });

      bar(ctx, X, 19, 150, 7, s, [
        { v: Math.min(this.hpTrail[i], f.maxHp) / f.maxHp, c: UI.paper },
        { v: f.hp / f.maxHp, c: f.hp / f.maxHp < 0.25 ? UI.red : TEAM[i].main },
      ]);
      const sta = f.stamina / F.maxStamina;
      const al = left ? 'left' : 'right';
      bar(ctx, X, 31, 90, 3, s, [{ v: sta, c: sta < 0.22 ? '#a58a3a' : UI.gold }]);
      text(ctx, 'ST', X + s * 95, 29, UI.dim, { align: al });
      const broken = f.state === S.GUARD_BREAK || f.state === S.KNOCKBACK;
      const g = f.guard / F.maxGuard;
      bar(ctx, X, 40, 90, 3, s, [{ v: broken ? 0 : g, c: broken ? UI.purple : g < 0.3 && this.time % 20 < 10 ? UI.red : UI.cyan }], 4);
      text(ctx, broken ? 'BREAK' : 'GD', X + s * 95, 38, broken ? UI.purple : UI.dim, { align: al });
      const u = f.ult / F.maxUlt;
      bar(ctx, X, 49, 110, 4, s, [{ v: u, c: u >= 1 ? (this.time % 16 < 8 ? '#f6b26b' : UI.gold) : UI.purple }], 4);
      text(ctx, u >= 1 ? 'ULT READY' : `ULT ${Math.floor(u * 100)}%`, X + s * 115, 48, u >= 1 ? UI.gold : UI.dim, { align: al });
      // PvE: AI 분석 표시 (CPU 쪽)
      if (opts.ai && i === 1) {
        text(ctx, `분석: ${opts.ai.style}${opts.ai.predict ? ` · 예상: ${opts.ai.predict}` : ''}`, X, 70, UI.dim, { size: 11, align: al, shadow: UI.ink });
      }
      // 콤보 단계 / 숨 고르기 (HUD 아래)
      const c = f.combo;
      if (f.state === S.ATTACK && c.total > 0 && f.attack.def.name) {
        const max = f.weapon.combo[c.lastType === 'heavy' ? 'heavyMax' : 'lightMax'];
        const n = c[c.lastType];
        text(ctx, `${f.attack.def.name} ${n}/${max}`, X, 58, n >= max ? '#f6b26b' : UI.paper, { size: 11, align: al, shadow: UI.ink });
      } else if (c.lock > 0 && f.state !== S.KO) {
        text(ctx, '숨 고르기', X, 58, '#c9c1dc', { size: 11, align: al, shadow: UI.ink });
      }
    });

    const t = Math.ceil(match.timeLeft / 60);
    panel(ctx, PW / 2 - 14, 5, 28, 20, { fill: UI.panel, border: UI.paper, shadow: UI.ink });
    text(ctx, String(t).padStart(2, '0'), PW / 2, 9, t <= 10 ? UI.red : UI.paper, { scale: 2, align: 'center' });

    text(ctx, opts.net ? 'ESC 메뉴 · M 소리' : 'ESC 일시정지 · F2 판정 · M 소리', PW / 2, PH - 11, UI.dim, { size: 9, align: 'center' });
    if (opts.net) {
      text(ctx, opts.net.text, PW / 2, 29, UI.cyan, { size: 9, align: 'center', shadow: UI.ink });
      if (opts.net.waiting) text(ctx, '상대 입력을 기다리는 중…', PW / 2, 70, UI.gold, { size: 12, align: 'center', shadow: UI.ink });
      if (opts.net.desync) text(ctx, '동기화 오류 감지', PW / 2, 40, UI.red, { size: 10, align: 'center', shadow: UI.ink });
    }
  }

  drawIntro(ctx, intro) {
    const str = intro.text;
    rect(ctx, 0, 96, PW, 34, UI.ink);
    rect(ctx, 0, 97, PW, 1, UI.paper);
    rect(ctx, 0, 128, PW, 1, UI.paper);
    text(ctx, str, PW / 2, 103, str === 'FIGHT!' ? UI.gold : UI.paper, { scale: 3, align: 'center' });
  }
}

/** 도트 게이지 */
function bar(ctx, X, y, w, h, s, layers, segments = 0) {
  const x0 = s > 0 ? X : X - w;
  rect(ctx, x0 - 1, y - 1, w + 2, h + 2, UI.ink);
  rect(ctx, x0, y, w, h, '#3a3050');
  for (const l of layers) {
    const len = Math.round(Math.max(0, Math.min(1, l.v)) * w);
    if (len <= 0) continue;
    rect(ctx, s > 0 ? x0 : x0 + w - len, y, len, h, l.c);
    if (h >= 4) { ctx.globalAlpha = 0.35; rect(ctx, s > 0 ? x0 : x0 + w - len, y, len, 1, '#ffffff'); ctx.globalAlpha = 1; }
  }
  for (let i = 1; i < segments; i++) rect(ctx, x0 + Math.round((w * i) / segments), y, 1, h, UI.ink);
}

export function buildBackground() {
  const { canvas, ctx: g } = createArtCanvas();
  const bands = ['#1d1830', '#251d3d', '#2f2349', '#3b2a55', '#4d335f', '#5f3d66'];
  const bandH = 22;
  for (let i = 0; i < bands.length; i++) {
    rect(g, 0, i * bandH, PW, bandH, bands[i]);
    if (i > 0) for (let x = 0; x < PW; x += 2) { px(g, x + (i % 2), i * bandH, bands[i - 1]); px(g, x + 1 - (i % 2), i * bandH + 1, bands[i - 1]); }
  }
  rect(g, 0, bands.length * bandH, PW, PH, bands.at(-1));
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 60; i++) px(g, Math.floor(rnd() * PW), Math.floor(rnd() * 90), rnd() < 0.3 ? '#efe3c4' : '#8f86a6');
  disc(g, 330, 48, 14, '#efe3c4');
  disc(g, 335, 44, 3, '#d8c9a6'); disc(g, 326, 54, 2, '#d8c9a6'); disc(g, 338, 55, 1, '#d8c9a6');
  const mountain = (base, amp, color, step, phase) => {
    for (let x = 0; x < PW; x += step) {
      const h = Math.round((Math.abs(Math.sin(x * 0.013 + phase)) * amp + Math.abs(Math.sin(x * 0.041 + phase)) * amp * 0.35) / 2) * 2;
      rect(g, x, base - h, step, PH, color);
    }
  };
  mountain(150, 46, '#2a2142', 3, 1.2);
  mountain(172, 28, '#211a35', 2, 4.1);
  for (let x = 0; x < PW; x += 1) {
    const top = 180 - ((Math.floor(x / 8) % 2) * 3);
    rect(g, x, top, 1, GROUND - top, '#1a1429');
  }
  for (let x = 4; x < PW; x += 24) rect(g, x, 186, 2, 4, '#f0c75e');
  for (const wx of [STAGE.leftWall - 40, STAGE.rightWall + 40]) {
    const x = Math.round(wx / PX);
    rect(g, x - 5, 96, 11, GROUND - 96, '#2c2340');
    rect(g, x - 5, 96, 1, GROUND - 96, '#4a3d63');
    rect(g, x + 5, 96, 1, GROUND - 96, '#140f1e');
    for (let y = 104; y < GROUND; y += 10) rect(g, x - 5, y, 11, 1, '#1d1630');
    rect(g, x - 7, 93, 15, 3, '#4a3d63');
    rect(g, x - 2, 90, 5, 3, '#6a5a86');
  }
  rect(g, 0, GROUND, PW, PH - GROUND, '#3a3150');
  rect(g, 0, GROUND, PW, 1, '#8a7aa8');
  rect(g, 0, GROUND + 1, PW, 1, '#5b4d78');
  for (let row = 0; row < 6; row++) {
    const y = GROUND + 3 + row * 6;
    rect(g, 0, y + 5, PW, 1, '#2a233c');
    const off = (row % 2) * 10;
    for (let x = -20 + off; x < PW; x += 20) rect(g, x, y, 1, 5, '#2a233c');
  }
  rect(g, 0, PH - 14, PW, 14, '#1d1830');
  return canvas;
}
