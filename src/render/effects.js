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

  /** 가드 임팩트: 피격자 앞의 방패 호. color/ size, perfect 이면 십자 섬광 추가 */
  guardImpact(x, y, facing, color, size = 1, perfect = false) {
    this.impacts.push({ type: 'arc', x: x - facing * 4, y, facing, r: 9 + size * 3, color, life: 12 + size * 2, max: 12 + size * 2 });
    if (perfect) this.impacts.push({ type: 'cross', x, y, len: 26, color, life: 14, max: 14 });
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
    for (const m of this.impacts) m.life -= k;
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
