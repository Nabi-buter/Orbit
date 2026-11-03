// =============================================================================
// 픽셀 이펙트 (렌더 전용, 전투 로직에 영향 없음)
// 좌표는 아트 좌표(저해상도). 화면 흔들림은 최대 1아트픽셀(=3px)로 제한.
// =============================================================================

import { ring, text, rect } from './pixel.js';

export const MAX_SHAKE = 1;

/** 중심(cx,cy)에서 각도 a 방향으로 from~to 거리 구간의 픽셀 선 */
function line(ctx, cx, cy, a, from, to, color) {
  const dx = Math.cos(a), dy = Math.sin(a);
  ctx.fillStyle = color;
  for (let d = from; d <= to; d += 0.7) ctx.fillRect(Math.round(cx + dx * d), Math.round(cy + dy * d), 1, 1);
}

const easeOut = (t) => 1 - (1 - t) * (1 - t);

/** 채운 마름모 */
function diamond(ctx, cx, cy, r, color) {
  cx = Math.round(cx); cy = Math.round(cy);
  ctx.fillStyle = color;
  for (let y = -r; y <= r; y++) { const w = r - Math.abs(y); ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
}

export class Effects {
  constructor() { this.reset(); }

  reset() {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.impacts = [];
    this.flash = null;
    this.shake = 0;
    this.shakeEnabled = true;
  }

  sparks(x, y, color, n, speed = 2, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.dir != null ? opts.dir + (Math.random() - 0.5) * (opts.spread ?? 1.6) : Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: opts.life ?? 14 + Math.random() * 8,
        color, size: opts.size ?? (Math.random() < 0.3 ? 2 : 1), gravity: opts.gravity ?? 0.08,
      });
    }
  }

  ring(x, y, color, maxR = 14, life = 14) { this.rings.push({ x, y, color, r: 1, maxR, life, max: life }); }

  /**
   * 타격 임팩트: 별 모양 섬광 + 공격 방향 베기 자국.
   * dir: 공격 진행 방향(1 오른쪽, -1 왼쪽), size: 1(약) ~ 3(강)
   */
  hitImpact(x, y, dir, size, color) {
    const rays = [];
    const n = 6 + size * 2;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      // 공격 방향 쪽 광선이 더 길다
      const along = Math.cos(a) * dir;
      rays.push({ a, len: (5 + size * 3) * (0.6 + Math.random() * 0.5) * (along > 0.3 ? 1.5 : 1) });
    }
    this.impacts.push({ type: 'star', x, y, rays, size, color, life: 8 + size * 2, max: 8 + size * 2 });
    const tilt = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.3);
    this.impacts.push({ type: 'slash', x, y, a: (dir > 0 ? 0 : Math.PI) + tilt, len: 10 + size * 6, color, life: 7, max: 7 });
  }

  /** 선 하나 (그어지며 나타났다가 가늘어짐). delay 프레임 뒤 시작 */
  slashLine(x, y, a, len, color, { life = 12, width = 3, delay = 0, grow = 3 } = {}) {
    this.impacts.push({ type: 'line', x, y, a, len, color, width, grow, delay, life, max: life });
  }
  /** 타원 고리 (rx, ry 까지 커짐) */
  ellipse(x, y, rx, ry, color, { life = 14, delay = 0, thick = 2 } = {}) {
    this.impacts.push({ type: 'ellipse', x, y, rx, ry, color, thick, delay, life, max: life });
  }
  /** 바닥 균열: 좌우로 지그재그 */
  crack(x, y, len, color, life = 50) {
    const pts = [];
    for (const side of [-1, 1]) {
      let cx = x, cy = y;
      const seg = [[cx, cy]];
      while (Math.abs(cx - x) < len) { cx += side * (3 + Math.random() * 4); cy = y + Math.round((Math.random() - 0.5) * 3); seg.push([cx, cy]); }
      pts.push(seg);
    }
    this.impacts.push({ type: 'crack', pts, color, delay: 0, life, max: life });
  }

  /**
   * 무기별 궁극기 적중 효과
   * id: 공격자 무기, (x,y): 적중 지점, dir: 공격 방향(±1), gy: 바닥 y(아트 좌표)
   */
  ultImpact(id, x, y, dir, gy, color) {
    const W = '#ffffff';
    switch (id) {
      case 'longsword': // 십자 베기: 두 줄이 차례로 그어짐
        this.slashLine(x, y, -0.7 * dir + (dir < 0 ? Math.PI : 0), 34, color, { life: 18, width: 3 });
        this.slashLine(x, y, 0.7 * dir + (dir < 0 ? Math.PI : 0), 34, color, { life: 18, width: 3, delay: 5 });
        this.hitImpact(x, y, dir, 2, color);
        this.sparks(x, y, W, 16, 2.8, { life: 18 });
        break;
      case 'greatsword': // 내려찍는 거대한 일격 + 바닥 충격파
        this.slashLine(x, y - 18, Math.PI / 2 - 0.15 * dir, 46, color, { life: 16, width: 5, grow: 2 });
        this.ellipse(x, gy, 46, 6, color, { life: 22, delay: 3, thick: 2 });
        this.ellipse(x, gy, 28, 4, W, { life: 14, delay: 3, thick: 1 });
        this.sparks(x, gy - 1, '#b9bcc8', 22, 2.6, { dir: -Math.PI / 2, spread: 2.4, gravity: 0.18, life: 26, size: 2 });
        this.hitImpact(x, y, dir, 3, color);
        break;
      case 'dagger': // 난도질: 짧은 베기 자국이 사방에서 연달아
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2;
          const ox = Math.cos(a + 1.3) * 6, oy = Math.sin(a + 1.3) * 8;
          this.slashLine(x + ox, y + oy, a, 12 + Math.random() * 6, i % 2 ? W : color, { life: 8, width: 2, delay: i * 3, grow: 1 });
        }
        this.hitImpact(x, y, dir, 1, color);
        break;
      case 'axe': // 쪼개기: 위에서 아래로 내려친 자국 + 바닥이 갈라지고 파편
        this.slashLine(x + 4 * dir, y - 10, Math.PI / 2 + 0.35 * dir, 40, color, { life: 14, width: 4, grow: 2 });
        this.crack(x + 6 * dir, gy, 44, '#0b0c10');
        this.sparks(x + 6 * dir, gy - 2, '#7d6a50', 18, 2.4, { dir: -Math.PI / 2, spread: 1.8, gravity: 0.22, life: 28, size: 2 });
        this.ellipse(x + 6 * dir, gy, 30, 4, color, { life: 16, delay: 2 });
        this.hitImpact(x, y, dir, 3, color);
        break;
      case 'spear': // 관통: 상대를 뚫고 나가는 긴 선 + 바람 고리
        this.slashLine(x + 30 * dir, y, dir > 0 ? 0 : Math.PI, 70, W, { life: 14, width: 3, grow: 2 });
        this.slashLine(x + 30 * dir, y, dir > 0 ? 0 : Math.PI, 60, color, { life: 18, width: 1, delay: 1, grow: 2 });
        for (let i = 0; i < 3; i++) this.ellipse(x + dir * (10 + i * 16), y, 4, 12 - i * 2, i ? color : W, { life: 14, delay: i * 2, thick: 1 });
        this.sparks(x, y, color, 12, 3.2, { dir: dir > 0 ? 0 : Math.PI, spread: 0.5, life: 16 });
        break;
      case 'knuckle': // 충격파: 겹친 고리 + 사방으로 뻗는 속도선
        for (let i = 0; i < 3; i++) this.ellipse(x, y, 14 + i * 10, 12 + i * 8, i ? color : W, { life: 16, delay: i * 3, thick: i ? 1 : 2 });
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          this.slashLine(x + Math.cos(a) * 16, y + Math.sin(a) * 14, a, 14, i % 2 ? W : color, { life: 10, width: 1, delay: 2 });
        }
        this.hitImpact(x, y, dir, 3, color);
        break;
      default:
        this.hitImpact(x, y, dir, 3, color);
    }
  }

  /**
   * 가드 충돌: 막은 무기 위치에서 쇳소리 불꽃. 불꽃은 공격자 반대(피격자 뒤쪽) 위로 튄다.
   * wa: 막는 무기의 화면 각도(라디안) — 날을 따라 번쩍임이 지나간다
   */
  guardClang(x, y, dir, wa, perfect, color) {
    const n = perfect ? 14 : 7;
    this.sparks(x, y, perfect ? '#fff4c8' : '#ffe3a3', n, perfect ? 2.6 : 1.9, { dir: dir > 0 ? -2.2 : -0.9, spread: 1.4, gravity: 0.16, life: perfect ? 18 : 12 });
    this.impacts.push({ type: 'star', x, y, rays: Array.from({ length: perfect ? 8 : 5 }, (_, i) => ({ a: (i / (perfect ? 8 : 5)) * Math.PI * 2 + Math.random() * 0.4, len: perfect ? 10 : 5 + Math.random() * 3 })), size: perfect ? 2 : 1, color, delay: 0, life: perfect ? 12 : 7, max: perfect ? 12 : 7 });
    // 날을 따라 지나가는 번쩍임
    this.slashLine(x, y, wa, perfect ? 14 : 9, '#ffffff', { life: 6, width: 1, grow: 1 });
    if (perfect) this.impacts.push({ type: 'cross', x, y, len: 24, color, delay: 0, life: 14, max: 14 });
  }

  /** size: 큰 정도(1~4) */
  text(str, x, y, color, size = 1, life = 50) { this.texts.push({ str, x, y, color, size, life, max: life }); }

  screenFlash(color, alpha = 0.25) { this.flash = { color, alpha }; }
  addShake(n) { if (this.shakeEnabled) this.shake = Math.min(MAX_SHAKE, Math.max(this.shake, n)); }

  update(k = 1) {
    for (const p of this.particles) { p.x += p.vx * k; p.y += p.vy * k; p.vy += p.gravity * k; p.vx *= 0.94; p.life -= k; }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) { r.life -= k; r.r += (r.maxR - r.r) * 0.3 * k; }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) { t.life -= k; if (t.max - t.life > 6) t.y -= 0.25 * k; }
    this.texts = this.texts.filter((t) => t.life > 0);
    for (const m of this.impacts) { if (m.delay > 0) m.delay -= k; else m.life -= k; }
    this.impacts = this.impacts.filter((m) => m.life > 0);
    if (this.flash) { this.flash.alpha -= 0.03 * k; if (this.flash.alpha <= 0) this.flash = null; }
    this.shakeTime = (this.shakeTime ?? 0) + k;
    if (this.shakeTime > 6) { this.shake = 0; this.shakeTime = 0; }
  }

  shakeOffset() {
    if (!this.shake) return [0, 0];
    return [Math.random() < 0.5 ? -1 : 1, Math.random() < 0.5 ? -1 : 0];
  }

  drawImpacts(ctx) {
    for (const m of this.impacts) {
      if (m.delay > 0) continue;
      const t = 1 - m.life / m.max; // 0 → 1
      if (m.type === 'star') {
        // 처음 2프레임: 흰 중심 덩어리, 이후 광선이 뻗었다가 끝에서부터 사라짐
        const core = Math.max(0, Math.round((1 - t * 2.2) * (2 + m.size)));
        if (core > 0) diamond(ctx, m.x, m.y, core, '#ffffff');
        for (const r of m.rays) {
          const out = r.len * Math.min(1, t * 3);
          const inn = r.len * Math.max(0, t * 1.6 - 0.4);
          line(ctx, m.x, m.y, r.a, inn, out, t < 0.35 ? '#ffffff' : m.color);
        }
      } else if (m.type === 'slash') {
        const w = Math.max(1, Math.round((1 - t) * 3));
        const half = m.len * (0.5 + t * 0.5);
        for (let o = -Math.floor(w / 2); o <= Math.floor(w / 2); o++) {
          const ox = -Math.sin(m.a) * o, oy = Math.cos(m.a) * o;
          line(ctx, m.x + ox, m.y + oy, m.a, -half, half, o === 0 ? '#ffffff' : m.color);
        }
      } else if (m.type === 'arc') {
        const r = m.r + t * 4;
        const span = 1.1;
        const steps = Math.ceil(r * span * 2);
        const thick = t < 0.5 ? 2 : 1;
        if (t > 0.7 && (m.life | 0) % 2 === 0) continue;
        for (let i = 0; i <= steps; i++) {
          const a = -span + (2 * span * i) / steps;
          // 피격자 정면(공격자 쪽)을 향해 볼록
          const px = Math.round(m.x + m.facing * Math.cos(a) * r);
          const py = Math.round(m.y + Math.sin(a) * r * 1.3);
          rect(ctx, px, py, thick, thick, Math.abs(a) < 0.35 && t < 0.4 ? '#ffffff' : m.color);
        }
      } else if (m.type === 'line') {
        // 그어지는 동안(grow 프레임) 길이가 늘고, 이후 굵기가 줄며 사라짐
        const el = m.max - m.life;
        const L = m.len * Math.min(1, (el + 1) / m.grow);
        const w = Math.max(1, Math.round(m.width * (1 - t)));
        const half = L / 2;
        for (let o = -Math.floor(w / 2); o <= Math.floor((w - 1) / 2); o++) {
          const ox = -Math.sin(m.a) * o, oy = Math.cos(m.a) * o;
          line(ctx, m.x + ox, m.y + oy, m.a, -half, half, o === 0 && t < 0.5 ? '#ffffff' : m.color);
        }
      } else if (m.type === 'ellipse') {
        const k = easeOut(t);
        const rx = Math.max(1, m.rx * k), ry = Math.max(1, m.ry * k);
        if (t > 0.6 && (m.life | 0) % 2 === 0) continue;
        ctx.fillStyle = m.color;
        const steps = Math.ceil((rx + ry) * 2);
        const th = t < 0.5 ? m.thick : 1;
        for (let i = 0; i < steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          ctx.fillRect(Math.round(m.x + Math.cos(a) * rx), Math.round(m.y + Math.sin(a) * ry), th, th);
        }
      } else if (m.type === 'crack') {
        const show = Math.min(1, t * 6);
        for (const seg of m.pts) {
          const n = Math.max(2, Math.round(seg.length * show));
          for (let i = 1; i < n; i++) {
            const [x0, y0] = seg[i - 1], [x1, y1] = seg[i];
            const d = Math.hypot(x1 - x0, y1 - y0);
            for (let u = 0; u <= d; u += 0.7) {
              const px = Math.round(x0 + (x1 - x0) * (u / d)), py = Math.round(y0 + (y1 - y0) * (u / d));
              ctx.fillStyle = m.color; ctx.fillRect(px, py, 1, 1);
              if (t < 0.3) { ctx.fillStyle = '#f2c14e'; ctx.fillRect(px, py - 1, 1, 1); }
            }
          }
        }
      } else if (m.type === 'cross') {
        const L = m.len * Math.min(1, t * 4) * (1 - t * 0.5);
        const c = t < 0.3 ? '#ffffff' : m.color;
        rect(ctx, Math.round(m.x - L), Math.round(m.y), Math.round(L * 2), 1, c);
        rect(ctx, Math.round(m.x), Math.round(m.y - L * 0.8), 1, Math.round(L * 1.6), c);
        if (t < 0.4) diamond(ctx, m.x, m.y, 3, '#ffffff');
      }
    }
  }

  drawWorld(ctx) {
    this.drawImpacts(ctx);
    for (const r of this.rings) {
      ctx.globalAlpha = r.life / r.max > 0.4 ? 1 : 0.5;
      ring(ctx, r.x, r.y, r.r, r.color);
    }
    ctx.globalAlpha = 1;
    for (const p of this.particles) {
      if (p.life < 4 && (p.life | 0) % 2 === 0) continue; // 사라질 때 깜빡임
      rect(ctx, Math.round(p.x), Math.round(p.y), p.size, p.size, p.color);
    }
    for (const t of this.texts) {
      if (t.life < 10 && (t.life | 0) % 2 === 0) continue;
      const korean = /[^\x00-\x7f]/.test(t.str);
      text(ctx, t.str, Math.round(t.x), Math.round(t.y), t.color,
        korean ? { size: 10 + t.size * 2, align: 'center', shadow: '#140f1e' } : { scale: t.size, align: 'center', shadow: '#140f1e' });
    }
  }

  drawScreen(ctx, W, H) {
    if (!this.flash) return;
    ctx.globalAlpha = Math.max(0, Math.min(1, this.flash.alpha));
    ctx.fillStyle = this.flash.color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}
