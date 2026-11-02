// =============================================================================
// 픽셀 이펙트 (렌더 전용, 전투 로직에 영향 없음)
// 좌표는 아트 좌표(저해상도). 화면 흔들림은 최대 1아트픽셀(=3px)로 제한.
// =============================================================================

import { ring, text, rect } from './pixel.js';

export const MAX_SHAKE = 1;

export class Effects {
  constructor() { this.reset(); }

  reset() {
    this.particles = [];
    this.rings = [];
    this.texts = [];
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
    if (this.flash) { this.flash.alpha -= 0.03 * k; if (this.flash.alpha <= 0) this.flash = null; }
    this.shakeTime = (this.shakeTime ?? 0) + k;
    if (this.shakeTime > 6) { this.shake = 0; this.shakeTime = 0; }
  }

  shakeOffset() {
    if (!this.shake) return [0, 0];
    return [Math.random() < 0.5 ? -1 : 1, Math.random() < 0.5 ? -1 : 0];
  }

  drawWorld(ctx) {
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
