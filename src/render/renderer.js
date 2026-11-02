// =============================================================================
// 렌더러: Match 상태를 읽어 그리기만 한다 (로직 변경 없음).
// 논리 해상도 1280x720 → 화면 크기/픽셀 밀도에 맞게 자동 스케일.
// =============================================================================

import { BALANCE, STAGE } from '../config/balance.js';
import { S, worldBox } from '../core/fighter.js';
import { drawFighter } from './fighterArt.js';
import { drawWeaponIcon } from './weaponArt.js';
import { Effects } from './effects.js';
import { playEvent } from './sfx.js';
import { WEAPONS } from '../config/weapons.js';

const W = STAGE.width;
const H = STAGE.height;
const GY = STAGE.groundY;

export const TEAM = [
  { main: '#4aa3ff', body: '#2f6fb8', limb: '#1f4a7d', accent: '#9fd0ff', eye: '#e8f4ff', glow: '#4aa3ff' },
  { main: '#ff5a5a', body: '#b83a3a', limb: '#7d2626', accent: '#ffb0a0', eye: '#fff0ec', glow: '#ff5a5a' },
];

/** 이벤트별 히트스톱(프레임). 전투 전체를 잠깐 멈춰 타격감을 준다 (양쪽 동일 → 공정) */
export const HITSTOP = { hit: 4, parry: 3, perfect: 10, guardBreak: 9, special: 12, armored: 2, ko: 18 };

export function hitstopFor(events) {
  let n = 0;
  for (const e of events) {
    let h = HITSTOP[e.type] ?? 0;
    if (e.type === 'hit' && (e.kind === 'heavy' || e.kind === 'plunge')) h = 7;
    if (e.type === 'hit' && e.kind === 'ultimate') h = 12;
    n = Math.max(n, h);
  }
  return n;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showBoxes = false;
    this.fx = new Effects();
    this.bg = null;
    this.time = 0;
    this.reset();
  }

  reset() {
    this.fx.reset();
    this.trails = [[], []];
    this.prevState = [null, null];
    this.hpTrail = [BALANCE.fighter.maxHp, BALANCE.fighter.maxHp];
    this.hpTrailDelay = [0, 0];
  }

  /** 화면 크기 × devicePixelRatio 에 맞춰 캔버스 해상도 조정 */
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = Math.round(this.canvas.clientWidth * dpr) || W;
    const ch = Math.round(this.canvas.clientHeight * dpr) || H;
    if (this.canvas.width !== cw || this.canvas.height !== ch) {
      this.canvas.width = cw;
      this.canvas.height = ch;
    }
    this.scale = cw / W;
  }

  base() { this.ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0); }

  // ---------------------------------------------------------------------------
  // 이벤트 → 효과
  // ---------------------------------------------------------------------------
  pushEvents(events, match) {
    const fx = this.fx;
    for (const e of events) {
      playEvent(e.type, e.kind);
      const x = e.x ?? W / 2;
      const y = GY - (e.y ?? 80);
      const D = match?.fighters[e.defender];
      const dir = D && match ? Math.sign(D.x - match.fighters[e.attacker].x) || 1 : 1;
      switch (e.type) {
        case 'hit': {
          const big = e.kind === 'heavy' || e.kind === 'plunge' || e.kind === 'ultimate';
          fx.sparks(x, y, '#fff3c4', big ? 18 : 10, big ? 9 : 6, { dir: dir > 0 ? 0 : Math.PI, spread: 1.8 });
          fx.sparks(x, y, '#ff9c3a', big ? 10 : 5, big ? 7 : 5);
          fx.ring(x, y, '#ffffffcc', big ? 46 : 30, 12, big ? 5 : 3);
          fx.addShake(big ? 4 : 2);
          if (e.kind === 'ultimate') { fx.text('궁극기 적중!', x, y - 70, '#ff9c2a', 34); fx.screenFlash('#ff9c2a', 0.18); }
          break;
        }
        case 'parry':
          fx.sparks(x, y, '#bfe3ff', 10, 5, { dir: dir > 0 ? Math.PI : 0, spread: 2 });
          fx.ring(x, y, '#7dd3ff', 34, 14, 3);
          fx.text('패링', x, y - 50, '#9fdcff', 22, 34);
          break;
        case 'perfect':
          fx.sparks(x, y, '#ffe680', 26, 9, { life: 26 });
          fx.ring(x, y, '#ffd34a', 90, 22, 6);
          fx.ring(x, y, '#ffffff', 50, 14, 3);
          fx.text('완벽패링!', x, y - 70, '#ffd34a', 40, 60);
          fx.screenFlash('#ffe9a0', 0.22);
          fx.addShake(2);
          break;
        case 'guardBreak':
          fx.sparks(x, y, '#c77dff', 24, 9, { shard: true, size: 5, life: 30 });
          fx.ring(x, y, '#b45cff', 80, 22, 6);
          fx.text('가드 브레이크!', x, y - 80, '#d39cff', 40, 70);
          fx.screenFlash('#7a2bd9', 0.2);
          fx.addShake(4);
          break;
        case 'special':
          fx.sparks(x, y, '#ffffff', 30, 12, { dir: dir > 0 ? 0 : Math.PI, spread: 1.2, life: 28 });
          fx.sparks(x, y, '#c77dff', 18, 8);
          fx.ring(x, y, '#ffffff', 110, 24, 7);
          fx.text('특수강공!', x, y - 80, '#ffffff', 42, 60);
          fx.addShake(4);
          break;
        case 'armored':
          fx.ring(x, y, '#ff9c2a', 30, 10, 3);
          fx.text('버팀', x, y - 40, '#ffb35a', 18, 26);
          break;
        case 'ko':
          fx.text('K.O.', W / 2, 300, '#ffffff', 96, 90);
          fx.screenFlash('#ffffff', 0.35);
          break;
        default:
          break;
      }
    }
  }

  /** 상태 전환으로 생기는 효과 (대시 잔상, 궁극기 발동, 착지 먼지 등) */
  watchStates(match) {
    match.fighters.forEach((f, i) => {
      const prev = this.prevState[i];
      const sx = f.x, sy = GY - f.y;
      if (prev !== f.state) {
        if (f.state === S.ULTIMATE) {
          this.fx.text('궁극기!', sx, sy - 170, TEAM[i].main, 38, 50);
          this.fx.ring(sx, sy - 60, '#ff9c2a', 120, 20, 6);
          this.fx.screenFlash('#000000', 0.35);
          playEvent('ult');
        }
        if (f.state === S.DASH) {
          this.fx.sparks(sx, GY - 4, '#9aa3b5', 6, 3, { dir: f.dash?.dir > 0 ? Math.PI : 0, spread: 0.8, gravity: -0.05 });
          playEvent('dash');
        }
        if (f.state === S.JUMP) this.fx.sparks(sx, GY - 2, '#9aa3b5', 6, 2.5, { dir: -Math.PI / 2, spread: 2.5, gravity: 0 });
        if (prev === S.JUMP || prev === S.PLUNGE) {
          this.fx.sparks(sx, GY - 2, '#aab', prev === S.PLUNGE ? 14 : 6, prev === S.PLUNGE ? 5 : 2.5, { dir: -Math.PI / 2, spread: 3, gravity: 0.1 });
        }
        if (f.state === S.PARRIED) this.fx.text('!', sx, sy - 150, '#ffd34a', 46, 30);
        this.prevState[i] = f.state;
      }
      // 잔상
      const trailing = f.state === S.DASH || f.state === S.ULTIMATE || f.state === S.KNOCKBACK || f.state === S.PLUNGE;
      if (trailing && this.time % 2 === 0) {
        this.trails[i].push({ snapshot: snapshotFighter(f), life: 12 });
      }
      for (const t of this.trails[i]) t.life--;
      this.trails[i] = this.trails[i].filter((t) => t.life > 0).slice(-8);
    });
  }

  // ---------------------------------------------------------------------------
  // 그리기
  // ---------------------------------------------------------------------------
  draw(match, opts = {}) {
    this.resize();
    const ctx = this.ctx;
    const k = (opts.dt ?? 16.67) / 16.67;
    this.time++;
    if (!opts.frozen) this.watchStates(match);
    this.fx.update(k);

    this.base();
    this.drawBackground(ctx);

    const [ox, oy] = this.fx.shakeOffset();
    ctx.save();
    ctx.translate(ox, oy);

    // 궁극기 시전 중 배경 어둡게
    if (match.fighters.some((f) => f.state === S.ULTIMATE)) {
      ctx.fillStyle = '#00000055';
      ctx.fillRect(-10, -10, W + 20, H + 20);
    }

    match.fighters.forEach((f) => this.drawShadow(ctx, f));
    match.fighters.forEach((f, i) => this.trails[i].forEach((t) => {
      ctx.globalAlpha = t.life / 12 * 0.35;
      drawFighter(ctx, t.snapshot, t.snapshot.x, GY - t.snapshot.y, TEAM[i], match.frame, { tint: TEAM[i].main });
      ctx.globalAlpha = 1;
    }));

    // 공격 중인 쪽을 위에 그린다
    const order = [0, 1].sort((a, b) => (match.fighters[a].attack ? 1 : 0) - (match.fighters[b].attack ? 1 : 0));
    for (const i of order) this.drawOneFighter(ctx, match, match.fighters[i], i);
    for (const i of order) this.drawStatusMarks(ctx, match, match.fighters[i], i);

    if (this.showBoxes) match.fighters.forEach((f) => this.drawBoxes(ctx, f));
    this.fx.drawWorld(ctx);
    ctx.restore();

    this.fx.drawScreen(ctx, W, H);
    this.drawHud(ctx, match, opts);
    if (opts.intro) this.drawIntro(ctx, opts.intro);
    if (opts.paused) { ctx.fillStyle = '#0008'; ctx.fillRect(0, 0, W, H); }
  }

  /** 메뉴 화면 뒤 배경 */
  drawBackdrop() {
    this.resize();
    this.base();
    this.time++;
    this.drawBackground(this.ctx);
    this.ctx.fillStyle = '#0006';
    this.ctx.fillRect(0, 0, W, H);
  }

  drawBackground(ctx) {
    if (!this.bg) this.bg = buildBackground();
    ctx.drawImage(this.bg, 0, 0, W, H);
  }

  drawShadow(ctx, f) {
    const s = Math.max(0.35, 1 - f.y / 260);
    ctx.fillStyle = `rgba(0,0,0,${0.45 * s})`;
    ctx.beginPath();
    ctx.ellipse(f.x, GY + 4, 34 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawOneFighter(ctx, match, f, i) {
    const team = { ...TEAM[i], weapon: f.weapon.color };
    const sx = f.x, sy = GY - f.y;
    const recent = f.flash && match.frame - f.flash.frame < 6;
    let tint;
    if (f.state === S.HITSTUN && recent) tint = '#ffffff';
    if (f.state === S.GUARD_BREAK) tint = match.frame % 16 < 8 ? '#9b59d0' : team.body;
    if (f.state === S.KO) tint = '#555b66';

    // 궁극기 오라
    if (f.state === S.ULTIMATE) {
      const r = 70 + Math.sin(this.time * 0.5) * 6;
      const g = ctx.createRadialGradient(sx, sy - 60, 10, sx, sy - 60, r);
      g.addColorStop(0, '#ffb34a88'); g.addColorStop(1, '#ff6a0000');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy - 60, r, 0, Math.PI * 2); ctx.fill();
    }
    // 궁극기 준비 완료: 은은한 발광
    if (f.ult >= BALANCE.fighter.maxUlt && f.state !== S.ULTIMATE) {
      ctx.save();
      ctx.shadowColor = '#ff9c2a';
      ctx.shadowBlur = 18 + Math.sin(this.time * 0.15) * 6;
    }
    const strike = f.attack && f.attack.def.hits.some((h) => f.attack.frame >= h.from && f.attack.frame <= h.to);
    drawFighter(ctx, f, sx, sy, team, match.frame, { tint, trail: strike || f.state === S.ULTIMATE || f.state === S.SPECIAL });
    if (f.ult >= BALANCE.fighter.maxUlt && f.state !== S.ULTIMATE) ctx.restore();

    // 가드: 전방 방패 호
    if (f.state === S.GUARD || f.state === S.BLOCKSTUN) {
      const fresh = match.frame - f.guardPress <= BALANCE.guard.perfectWindow &&
        f.guardPress - f.prevGuardPress >= BALANCE.guard.perfectRearm;
      const low = f.guard / BALANCE.fighter.maxGuard;
      ctx.strokeStyle = fresh ? '#ffe680' : low < 0.3 ? '#ff7070' : '#7dd3ff';
      ctx.globalAlpha = f.state === S.BLOCKSTUN ? 0.95 : fresh ? 0.9 : 0.55;
      ctx.lineWidth = fresh ? 6 : 4;
      ctx.beginPath();
      const cx = sx + f.facing * 14;
      ctx.arc(cx, sy - 62, 52, f.facing > 0 ? -1.1 : Math.PI - 1.1 + 0.0, f.facing > 0 ? 1.1 : Math.PI + 1.1);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  drawStatusMarks(ctx, match, f, i) {
    const sx = f.x, sy = GY - f.y;
    if (f.state === S.GUARD_BREAK) {
      // 머리 위 회전하는 별 + 남은 기절 시간
      for (let k = 0; k < 3; k++) {
        const a = this.time * 0.12 + (k * Math.PI * 2) / 3;
        drawStar(ctx, sx + Math.cos(a) * 26, sy - 150 + Math.sin(a) * 7, 7, '#ffd34a');
      }
      const t = f.timer / BALANCE.guardBreak.stun;
      ctx.fillStyle = '#000a';
      ctx.fillRect(sx - 40, sy - 180, 80, 8);
      ctx.fillStyle = '#c77dff';
      ctx.fillRect(sx - 40, sy - 180, 80 * t, 8);
      ctx.font = '900 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#000';
      ctx.strokeText('GUARD BREAK', sx, sy - 188);
      ctx.fillStyle = '#e2b8ff';
      ctx.fillText('GUARD BREAK', sx, sy - 188);
    }
    if (f.state === S.PARRIED) {
      ctx.fillStyle = '#ffd34a';
      ctx.font = '900 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('흐트러짐', sx, sy - 160);
    }
    // 콤보 단계 / 숨 고르기 표시
    const c = f.combo;
    if (f.state === S.ATTACK && c.total > 0) {
      const max = f.weapon.combo[c.lastType === 'heavy' ? 'heavyMax' : 'lightMax'];
      const n = c[c.lastType];
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = '#000';
      const label = `${f.attack.def.name ?? ''} ${n}/${max}`;
      ctx.strokeText(label, sx, sy - 162);
      ctx.fillStyle = n >= max ? '#ffb35a' : '#ffffff';
      ctx.fillText(label, sx, sy - 162);
    }
    if (c.lock > 0 && f.state !== S.KO) {
      const t = c.lock / c.lockMax;
      ctx.fillStyle = '#000a';
      ctx.fillRect(sx - 30, sy - 172, 60, 6);
      ctx.fillStyle = '#9aa3b5';
      ctx.fillRect(sx - 30, sy - 172, 60 * t, 6);
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#c8cfdc';
      ctx.fillText('숨 고르기', sx, sy - 177);
    }
    // 플레이어 표시 (머리 위 작은 삼각형)
    if (f.state !== S.KO) {
      ctx.fillStyle = TEAM[i].main;
      ctx.beginPath();
      ctx.moveTo(sx - 7, sy - 146); ctx.lineTo(sx + 7, sy - 146); ctx.lineTo(sx, sy - 137);
      ctx.fill();
    }
  }

  drawBoxes(ctx, f) {
    const F = BALANCE.fighter;
    ctx.strokeStyle = '#7dffb0';
    ctx.lineWidth = 1;
    ctx.strokeRect(f.x - F.width / 2, GY - f.y - F.height, F.width, F.height);
    const a = f.attack;
    if (!a) return;
    const hits = f.state === S.PLUNGE ? [f.weapon.plunge.hit] : a.def.hits.filter((h) => a.frame >= h.from && a.frame <= h.to);
    for (const h of hits) {
      const b = worldBox(f, h.box);
      ctx.fillStyle = 'rgba(255,60,60,0.3)';
      ctx.fillRect(b.x, GY - b.y - b.h, b.w, b.h);
      ctx.strokeStyle = '#ff4040';
      ctx.strokeRect(b.x, GY - b.y - b.h, b.w, b.h);
    }
  }

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  drawHud(ctx, match, opts) {
    const F = BALANCE.fighter;
    match.fighters.forEach((f, i) => {
      // 체력 감소 잔상
      if (f.hp < this.hpTrail[i]) {
        if (this.hpTrailDelay[i] > 0) this.hpTrailDelay[i]--;
        else this.hpTrail[i] = Math.max(f.hp, this.hpTrail[i] - 6);
      } else { this.hpTrail[i] = f.hp; this.hpTrailDelay[i] = 30; }
      if (f.flash && match.frame - f.flash.frame === 0) this.hpTrailDelay[i] = 30;

      const left = i === 0;
      const X = left ? 28 : W - 28;
      const s = left ? 1 : -1;
      const BW = 470;
      const name = opts.names?.[i] ?? `P${i + 1}`;

      ctx.textAlign = left ? 'left' : 'right';
      ctx.font = '800 18px system-ui, sans-serif';
      ctx.fillStyle = TEAM[i].main;
      ctx.fillText(name, X, 30);
      const nw = ctx.measureText(name).width;
      ctx.font = '600 15px system-ui, sans-serif';
      ctx.fillStyle = f.weapon.color;
      ctx.fillText(f.weapon.name, X + s * (nw + 10), 30);

      // 체력
      slantBar(ctx, X, 38, BW, 26, s, [
        { v: this.hpTrail[i] / F.maxHp, c: '#ffffffcc' },
        { v: f.hp / F.maxHp, c: f.hp / F.maxHp < 0.25 ? '#ff4d4d' : TEAM[i].main },
      ]);
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = left ? 'right' : 'left';
      ctx.fillText(String(Math.ceil(f.hp)), X + s * (BW - 8), 57);

      // 스태미나
      const staLow = f.stamina < 22;
      gaugeRow(ctx, X, 72, 300, 9, s, f.stamina / F.maxStamina, staLow ? '#b8962c' : '#ffd84a', '스태미나');
      // 가드 게이지 (낮으면 깜빡임)
      const g = f.guard / F.maxGuard;
      const broken = f.state === S.GUARD_BREAK || f.state === S.KNOCKBACK;
      const lowPulse = g < 0.3 && this.time % 20 < 10;
      gaugeRow(ctx, X, 87, 300, 9, s, broken ? 0 : g, broken ? '#b45cff' : lowPulse ? '#ff6060' : '#5fd6ff', broken ? '가드 브레이크' : '가드', 4);
      // 궁극기
      const u = f.ult / F.maxUlt;
      const ready = u >= 1;
      const ucol = ready ? (this.time % 30 < 15 ? '#ffb347' : '#ff8a1f') : '#b06cff';
      gaugeRow(ctx, X, 102, 380, 12, s, u, ucol, ready ? '궁극기 준비 완료!' : `궁극기 ${Math.floor(u * 100)}%`, 4, ready);
    });

    // 타이머
    const t = Math.ceil(match.timeLeft / 60);
    ctx.fillStyle = '#0d1018dd';
    ctx.strokeStyle = '#3a4050';
    ctx.lineWidth = 2;
    roundRect(ctx, W / 2 - 42, 22, 84, 56, 10);
    ctx.fill(); ctx.stroke();
    ctx.font = '900 38px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = t <= 10 ? '#ff6060' : '#ffffff';
    ctx.fillText(String(t), W / 2, 64);

    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffffff70';
    ctx.textAlign = 'center';
    ctx.fillText('Esc 일시정지 · F2 판정 · M 소리', W / 2, H - 14);
  }

  drawIntro(ctx, intro) {
    const { text, t } = intro;
    ctx.fillStyle = '#0006';
    ctx.fillRect(0, 250, W, 140);
    ctx.font = `900 ${Math.round(80 + (1 - t) * 20)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 8; ctx.strokeStyle = '#000';
    ctx.strokeText(text, W / 2, 350);
    ctx.fillStyle = text === 'FIGHT!' ? '#ffd34a' : '#ffffff';
    ctx.fillText(text, W / 2, 350);
  }

  /** 무기 선택 카드에 무기 아이콘 그리기 */
  drawWeaponIcons(grids) {
    for (const grid of grids) {
      for (const card of grid.children) {
        const c = card.querySelector('canvas');
        if (c && !c.dataset.drawn) {
          drawWeaponIcon(c, card.dataset.id, WEAPONS[card.dataset.id].color);
          c.dataset.drawn = '1';
        }
      }
    }
  }
}

// -----------------------------------------------------------------------------
function snapshotFighter(f) {
  return {
    ...f,
    attack: f.attack ? { ...f.attack } : null,
    dash: f.dash ? { ...f.dash } : null,
  };
}

function slantBar(ctx, X, y, w, h, s, layers) {
  const sk = 10;
  const path = (len) => {
    ctx.beginPath();
    ctx.moveTo(X, y);
    ctx.lineTo(X + s * len, y);
    ctx.lineTo(X + s * (len - sk), y + h);
    ctx.lineTo(X + s * Math.min(len, 0) , y + h);
    ctx.closePath();
  };
  ctx.fillStyle = '#0b0d14dd';
  path(w); ctx.fill();
  for (const l of layers) {
    const len = Math.max(0, Math.min(1, l.v)) * w;
    if (len <= 0) continue;
    ctx.fillStyle = l.c;
    path(len); ctx.fill();
  }
  ctx.strokeStyle = '#ffffff40';
  ctx.lineWidth = 1.5;
  path(w); ctx.stroke();
}

function gaugeRow(ctx, X, y, w, h, s, v, color, label, segments = 0, glow = false) {
  ctx.fillStyle = '#0b0d14cc';
  ctx.fillRect(s > 0 ? X : X - w, y, w, h);
  const len = Math.max(0, Math.min(1, v)) * w;
  if (glow) { ctx.save(); ctx.shadowColor = color; ctx.shadowBlur = 14; }
  ctx.fillStyle = color;
  ctx.fillRect(s > 0 ? X : X - len, y, len, h);
  if (glow) ctx.restore();
  if (segments) {
    ctx.fillStyle = '#0b0d14';
    for (let i = 1; i < segments; i++) ctx.fillRect((s > 0 ? X : X - w) + (w * i) / segments - 1, y, 2, h);
  }
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = s > 0 ? 'left' : 'right';
  ctx.fillStyle = '#e8eaf0';
  ctx.fillText(label, X + s * (w + 8), y + h - 1);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStar(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.fill();
}

function buildBackground() {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // 하늘
  const sky = g.createLinearGradient(0, 0, 0, GY);
  sky.addColorStop(0, '#0f1424');
  sky.addColorStop(0.6, '#1d2340');
  sky.addColorStop(1, '#3a2f4a');
  g.fillStyle = sky;
  g.fillRect(0, 0, W, GY);
  // 달
  g.fillStyle = '#f3e9d2';
  g.globalAlpha = 0.85;
  g.beginPath(); g.arc(980, 170, 46, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 0.12;
  g.beginPath(); g.arc(980, 170, 90, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  // 별
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 70; i++) { g.globalAlpha = 0.2 + rnd() * 0.5; g.fillRect(rnd() * W, rnd() * 330, 1.5, 1.5); }
  g.globalAlpha = 1;
  // 원경 산
  const mountains = (y0, amp, color, step) => {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(0, GY);
    for (let x = 0; x <= W; x += step) g.lineTo(x, y0 - Math.abs(Math.sin(x * 0.006 + y0)) * amp - rnd() * amp * 0.25);
    g.lineTo(W, GY); g.closePath(); g.fill();
  };
  mountains(440, 120, '#232a45', 40);
  mountains(500, 80, '#1a1f35', 30);
  // 기둥 (경기장 경계)
  for (const x of [STAGE.leftWall - 40, STAGE.rightWall + 40]) {
    g.fillStyle = '#141826';
    g.fillRect(x - 16, 300, 32, GY - 300);
    g.fillStyle = '#2a3150';
    g.fillRect(x - 22, 292, 44, 14);
    g.fillStyle = '#ffb34a';
    g.globalAlpha = 0.6;
    g.beginPath(); g.arc(x, 280, 7, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.15;
    g.beginPath(); g.arc(x, 280, 30, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
  }
  // 바닥
  const floor = g.createLinearGradient(0, GY, 0, H);
  floor.addColorStop(0, '#2d3046');
  floor.addColorStop(1, '#14161f');
  g.fillStyle = floor;
  g.fillRect(0, GY, W, H - GY);
  g.strokeStyle = '#ffffff14';
  g.lineWidth = 1;
  for (let i = -12; i <= 12; i++) {
    g.beginPath(); g.moveTo(W / 2 + i * 60, GY); g.lineTo(W / 2 + i * 160, H); g.stroke();
  }
  g.strokeStyle = '#ffffff30';
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, GY + 1); g.lineTo(W, GY + 1); g.stroke();
  return c;
}

