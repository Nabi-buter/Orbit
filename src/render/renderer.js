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
  { team: 0, body: '#c9cad6', light: '#eeeef6', shade: '#8e90a6', joint: '#545670', pad: '#4b5d8f', visor: '#8fbcff', outline: '#16121f', main: '#5d93d9', ui: '#78a6dd' },
  { team: 1, body: '#d0c8c8', light: '#f4eeee', shade: '#9a8c90', joint: '#5e4f58', pad: '#8f4e4b', visor: '#ff9a86', outline: '#16121f', main: '#d9655b', ui: '#e07f6a' },
];

export const UI = {
  // 훈련장 팔레트: 콘크리트 회색 + 안전 노랑 + 홀로그램 청록
  ink: '#12141a',
  paper: '#eceef2',
  dim: '#8a909e',
  panel: '#1b1f28',
  panel2: '#262b36',
  gold: '#f2c14e',
  red: '#e0564b',
  green: '#7fc47a',
  cyan: '#4fd1c1',
  purple: '#a77bdc',
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
    this.hitCount = [{ n: 0, last: -999 }, { n: 0, last: -999 }];
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
          // 연속 적중 수: 상대가 경직에서 풀리기 전에 이어지면 누적
          const hc = this.hitCount[e.attacker];
          if (hc) {
            const frame = match?.frame ?? 0;
            const D2 = match?.fighters[e.defender];
            hc.n = frame - hc.last < 45 && D2 && (D2.state === S.HITSTUN || frame - hc.last < 30) ? hc.n + 1 : 1;
            hc.last = frame;
          }
          const big = e.kind === 'heavy' || e.kind === 'plunge' || e.kind === 'ultimate';
          // 베기 자국 + 별 섬광 + 공격 방향으로 튀는 파편 (원형 링은 제거)
          fx.hitImpact(x, y, dir, e.kind === 'ultimate' ? 3 : big ? 2 : 1, '#f08a3c');
          fx.sparks(x, y, '#ffd08a', big ? 7 : 4, big ? 2.4 : 1.7, { dir: dir > 0 ? 0 : Math.PI, spread: 1.2, life: 10 });
          fx.addShake(big ? 1 : 0);
          if (e.kind === 'ultimate') { fx.text('궁극기 적중', x, y - 22, UI.gold, 3); fx.screenFlash('#f08a3c', 0.18); }
          break;
        }
        case 'parry': {
          // 일반 가드: 방패 호 + 뒤로 튕기는 불꽃 (글자 없음)
          const face = D ? D.facing : -dir;
          fx.guardImpact(x, y, face, UI.cyan, 1);
          fx.sparks(x, y, '#bfe0ea', 5, 1.5, { dir: dir > 0 ? Math.PI : 0, spread: 1.4, life: 10, gravity: 0.15 });
          break;
        }
        case 'perfect': {
          const face = D ? D.facing : -dir;
          fx.guardImpact(x, y, face, UI.gold, 2, true);
          fx.sparks(x, y, UI.gold, 12, 2.4, { life: 18 });
          fx.text('완벽패링', x, y - 26, UI.gold, 2, 45);
          fx.screenFlash('#f6e2a0', 0.16);
          fx.addShake(1);
          break;
        }
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
        case 'round':
          // 다음 라운드: 남은 효과 정리
          fx.particles = []; fx.rings = []; fx.texts = []; fx.impacts = []; fx.flash = null;
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
      const fresh = !f.parry.resolved && match.frame - f.parry.start < f.parry.window;
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
    // 천장 조명 미세한 깜빡임 + 홀로그램 표지 스캔선
    if (this.time % 180 < 3) { ctx.globalAlpha = 0.25; rect(ctx, 96, 30, 22, 1, '#000'); ctx.globalAlpha = 1; }
    const scan = (this.time >> 1) % 18;
    ctx.globalAlpha = 0.5; rect(ctx, 178, 70 + scan, 72, 1, UI.cyan); ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------------------
  // HUD (도트)
  // ---------------------------------------------------------------------------
  drawHud(ctx, match, opts) {
    match.fighters.forEach((f, i) => {
      if (f.hp < this.hpTrail[i]) {
        if (this.hpTrailDelay[i] > 0) this.hpTrailDelay[i]--;
        else this.hpTrail[i] = Math.max(f.hp, this.hpTrail[i] - 8);
      } else { this.hpTrail[i] = f.hp; this.hpTrailDelay[i] = 30; }
      if (f.flash && match.frame - f.flash.frame === 0) this.hpTrailDelay[i] = 30;

      const left = i === 0;
      const X = left ? 10 : PW - 10;
      const s = left ? 1 : -1;
      const al = left ? 'left' : 'right';
      const name = opts.names?.[i] ?? `P${i + 1}`;
      // 이름 · 무기
      const nw = text(ctx, name, X, 7, UI.paper, { size: 11, align: al, shadow: UI.ink });
      text(ctx, f.weapon.name, X + s * (nw + 6), 7, TEAM[i].ui, { size: 11, align: al, shadow: UI.ink });
      // 목숨: 체력 막대 끝 위에 작은 칸 (남은 목숨 = 채움)
      const lives = match.lives?.[i] ?? 1, maxLives = BALANCE.round.lives;
      for (let k = 0; k < maxLives; k++) {
        const lx = left ? X + 150 - 6 - k * 9 : X - 150 + k * 9;
        const on = k < lives;
        rect(ctx, lx - 1, 9, 8, 8, UI.ink);
        rect(ctx, lx, 10, 6, 6, on ? TEAM[i].main : '#30343f');
        if (on) { ctx.globalAlpha = 0.4; rect(ctx, lx, 10, 6, 1, '#fff'); ctx.globalAlpha = 1; }
      }
      // 체력: 10% 눈금
      const W = 150;
      const x0 = left ? X : X - W;
      rect(ctx, x0 - 1, 20, W + 2, 8, UI.ink);
      rect(ctx, x0, 21, W, 6, '#30343f');
      const tr = Math.round(Math.min(1, this.hpTrail[i] / f.maxHp) * W);
      const hp = Math.round(Math.max(0, f.hp / f.maxHp) * W);
      rect(ctx, left ? x0 : x0 + W - tr, 21, tr, 6, '#d9d2c3');
      rect(ctx, left ? x0 : x0 + W - hp, 21, hp, 6, f.hp / f.maxHp < 0.25 ? UI.red : TEAM[i].main);
      ctx.globalAlpha = 0.35; rect(ctx, left ? x0 : x0 + W - hp, 21, hp, 1, '#fff'); ctx.globalAlpha = 1;
      for (let k = 1; k < 10; k++) rect(ctx, x0 + Math.round((W * k) / 10), 21, 1, 6, 'rgba(18,20,26,0.55)');
      // 자세(가드) 게이지: 노랑, 낮으면 빨강, 무너지면 BREAK
      const broken = f.state === S.GUARD_BREAK || f.state === S.KNOCKBACK;
      const g = broken ? 0 : f.guard / BALANCE.fighter.maxGuard;
      const GW = 100, gx = left ? X : X - GW;
      rect(ctx, gx - 1, 30, GW + 2, 4, UI.ink);
      rect(ctx, gx, 31, GW, 2, '#30343f');
      const gl = Math.round(g * GW);
      rect(ctx, left ? gx : gx + GW - gl, 31, gl, 2, g < 0.3 ? (this.time % 20 < 10 ? UI.red : '#f08a3c') : UI.gold);
      if (broken) text(ctx, 'BREAK', X + s * (GW + 6), 29, UI.red, { align: al });
      // 스태미나: 아주 얇게
      const sw = Math.round((f.stamina / BALANCE.fighter.maxStamina) * 60);
      rect(ctx, left ? X : X - 60, 36, 60, 1, '#30343f');
      rect(ctx, left ? X : X - sw, 36, sw, 1, f.stamina < 22 ? '#8a7a40' : '#c9cdd6');
      // 궁극기: 마름모 4칸 (25%씩)
      const u = f.ult / BALANCE.fighter.maxUlt;
      for (let k = 0; k < 4; k++) {
        const cx = (left ? X + 156 + k * 7 : X - 156 - k * 7);
        const fill = u >= (k + 1) / 4;
        const c = fill ? (u >= 1 && this.time % 16 < 8 ? '#fff4c8' : UI.gold) : '#3a3f4b';
        rect(ctx, cx - 1, 22, 3, 1, c); rect(ctx, cx - 2, 23, 5, 2, c); rect(ctx, cx - 1, 25, 3, 1, c);
      }
      // 연속 적중 (격투 게임식 HIT 카운터) — 기술 이름 같은 디버그 정보는 띄우지 않는다
      const hc = this.hitCount[i];
      if (hc.n >= 2 && match.frame - hc.last < 70) {
        const pop = match.frame - hc.last < 4 ? 1 : 0;
        const nx = X + s * 2;
        const w = text(ctx, String(hc.n), nx, 44 - pop, UI.gold, { scale: 2, align: al, shadow: UI.ink });
        text(ctx, 'HIT', nx + s * (w + 3), 49, UI.paper, { align: al, shadow: UI.ink });
      } else if (f.parry.lock > 0) {
        text(ctx, '헛패링', X, 41, UI.dim, { size: 11, align: al, shadow: UI.ink });
      }
      if (opts.ai && i === 1 && this.showBoxes) {
        text(ctx, `AI 분석: ${opts.ai.style}${opts.ai.predict ? ` · 예상 ${opts.ai.predict}` : ''}`, X, 54, UI.dim, { size: 11, align: al, shadow: UI.ink });
      }
    });

    // 시간
    const t = Math.ceil(match.timeLeft / 60);
    text(ctx, String(t).padStart(2, '0'), PW / 2, 12, t <= 10 ? UI.red : UI.paper, { scale: 2, align: 'center', shadow: UI.ink });
    if (opts.net) {
      text(ctx, opts.net.text, PW / 2, 31, UI.cyan, { size: 11, align: 'center', shadow: UI.ink });
      if (opts.net.waiting) text(ctx, '상대 입력을 기다리는 중…', PW / 2, 70, UI.gold, { size: 12, align: 'center', shadow: UI.ink });
      if (opts.net.desync) text(ctx, '동기화 오류 감지', PW / 2, 44, UI.red, { size: 11, align: 'center', shadow: UI.ink });
    }
  }

  drawIntro(ctx, intro) {
    const str = intro.text;
    const fight = str === 'FIGHT!';
    ctx.globalAlpha = 0.6; rect(ctx, 0, 104, PW, 22, UI.ink); ctx.globalAlpha = 1;
    rect(ctx, PW / 2 - 60, 104, 120, 1, fight ? UI.gold : UI.dim);
    rect(ctx, PW / 2 - 60, 125, 120, 1, fight ? UI.gold : UI.dim);
    text(ctx, fight ? 'FIGHT' : str, PW / 2, 108, fight ? UI.gold : UI.paper, { scale: 2, align: 'center', shadow: UI.ink });
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
  // 천장
  rect(g, 0, 0, PW, 26, '#181b23');
  for (let x = 0; x < PW; x += 32) rect(g, x, 0, 2, 26, '#20242e');
  // 매달린 조명 (가로 형광등)
  for (const lx of [40, 96, 170, 250, 330, 390]) {
    rect(g, lx + 10, 18, 1, 12, '#2a2f3a');
    rect(g, lx, 30, 22, 2, '#dfe8f0');
    g.globalAlpha = 0.08; rect(g, lx - 10, 32, 42, 40, '#dfe8f0'); g.globalAlpha = 1;
  }
  // 벽 패널
  rect(g, 0, 26, PW, GROUND - 26, '#3a404d');
  for (let y = 26; y < GROUND; y += 38) rect(g, 0, y, PW, 1, '#2d323d');
  for (let x = 0; x < PW; x += 48) { rect(g, x, 26, 1, GROUND - 26, '#2d323d'); rect(g, x + 1, 26, 1, GROUND - 26, '#454c5a'); }
  // 패널 디테일 (볼트, 환기구)
  for (let x = 0; x < PW; x += 48) for (let y = 26; y < GROUND - 30; y += 38) { g.fillStyle = '#525a69'; g.fillRect(x + 4, y + 4, 1, 1); g.fillRect(x + 43, y + 4, 1, 1); }
  for (const vx of [20, 340]) { rect(g, vx, 120, 30, 14, '#2b303a'); for (let k = 0; k < 5; k++) rect(g, vx + 2, 122 + k * 2, 26, 1, '#3f4552'); }
  // 홀로그램 표지 (훈련장 번호)
  rect(g, 176, 68, 76, 22, '#162a2c');
  g.globalAlpha = 0.9; rect(g, 176, 68, 76, 1, '#4fd1c1'); rect(g, 176, 89, 76, 1, '#4fd1c1'); g.globalAlpha = 1;
  bitTextBg(g, 'RANGE 01', 214, 72, '#4fd1c1');
  bitTextBg(g, 'DUEL ZONE', 214, 81, '#2f8f86');
  // 벽 아래 안전 줄무늬
  for (let x = 0; x < PW; x += 1) rect(g, x, GROUND - 8, 1, 6, Math.floor((x + 3) / 6) % 2 ? '#e7b93c' : '#1d1f25');
  rect(g, 0, GROUND - 9, PW, 1, '#22252d');
  rect(g, 0, GROUND - 2, PW, 2, '#2a2e37');
  // 경기장 경계 기둥
  for (const wx of [STAGE.leftWall - 40, STAGE.rightWall + 40]) {
    const x = Math.round(wx / PX);
    rect(g, x - 4, 26, 9, GROUND - 26, '#2a2f3a');
    rect(g, x - 4, 26, 1, GROUND - 26, '#4a5261');
    for (let y = 40; y < GROUND - 10; y += 12) rect(g, x - 3, y, 7, 2, '#e7b93c');
  }
  // 바닥 (콘크리트) + 레인 표시
  rect(g, 0, GROUND, PW, PH - GROUND, '#565c68');
  rect(g, 0, GROUND, PW, 1, '#8a909e');
  for (let x = 0; x < PW; x += 3) for (let y = GROUND + 2; y < PH; y += 4) if ((x * 7 + y * 13) % 11 === 0) rect(g, x, y, 1, 1, '#4c525d');
  for (let x = 8; x < PW; x += 20) rect(g, x, GROUND + 14, 10, 1, '#e7b93c');
  for (const [mx, label] of [[PW / 2, '0M'], [PW / 2 - 100, '10M'], [PW / 2 + 100, '10M']]) {
    rect(g, Math.round(mx), GROUND + 2, 1, 8, '#c9ccd4');
    bitTextBg(g, label, mx, GROUND + 18, '#7d838f');
  }
  rect(g, 0, PH - 10, PW, 10, '#3f444e');
  return canvas;
}

function bitTextBg(g, str, cx, y, color) { text(g, str, cx, y, color, { align: 'center' }); }
