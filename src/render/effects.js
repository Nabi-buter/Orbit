// =============================================================================
// 시각 효과 (렌더 전용, 전투 로직에 영향 없음)
// 화면 흔들림은 최대 4px 로 제한해 전투 상황이 가려지지 않게 한다.
// =============================================================================

export const MAX_SHAKE = 4;

export class Effects {
  constructor() { this.reset(); }

  reset() {
    this.particles = [];
    this.rings = [];
    this.texts = [];
    this.flash = null;   // {color, alpha, decay}
    this.shake = 0;
    this.shakeEnabled = true;
  }

  sparks(x, y, color, n, speed = 6, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.dir != null ? opts.dir + (Math.random() - 0.5) * (opts.spread ?? 1.6) : Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      this.particles.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: opts.life ?? 18 + Math.random() * 10, max: 28,
        color, size: opts.size ?? 2 + Math.random() * 2, gravity: opts.gravity ?? 0.25, shard: opts.shard,
      });
    }
  }

  ring(x, y, color, maxR = 60, life = 18, width = 4) {
    this.rings.push({ x, y, color, r: 4, maxR, life, max: life, width });
  }

  text(str, x, y, color, size = 28, life = 50) {
    this.texts.push({ str, x, y, color, size, life, max: life });
  }

  screenFlash(color, alpha = 0.25) { this.flash = { color, alpha }; }
  addShake(px) { if (this.shakeEnabled) this.shake = Math.min(MAX_SHAKE, Math.max(this.shake, px)); }

  /** 렌더 프레임마다 (k = dt/16.67) */
  update(k = 1) {
    for (const p of this.particles) {
      p.x += p.vx * k; p.y += p.vy * k; p.vy += p.gravity * k; p.vx *= 0.96; p.life -= k;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) { r.life -= k; r.r += (r.maxR - r.r) * 0.25 * k; }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const t of this.texts) { t.life -= k; t.y -= 0.6 * k; }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.flash) { this.flash.alpha -= 0.025 * k; if (this.flash.alpha <= 0) this.flash = null; }
    this.shake = Math.max(0, this.shake - 0.5 * k);
  }

  shakeOffset() {
    if (!this.shake) return [0, 0];
    return [(Math.random() * 2 - 1) * this.shake, (Math.random() * 2 - 1) * this.shake];
  }

  drawWorld(ctx) {
    for (const r of this.rings) {
      ctx.globalAlpha = r.life / r.max;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    for (const p of this.particles) {
      ctx.globalAlpha = Math.min(1, p.life / 12);
      ctx.fillStyle = p.color;
      if (p.shard) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 0.3);
        ctx.fillRect(-p.size, -p.size / 3, p.size * 2, p.size * 0.7); ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = k > 0.85 ? 1 + (k - 0.85) * 3 : 1;
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.font = `900 ${Math.round(t.size * pop)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 6;
      ctx.strokeStyle = '#000c';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  drawScreen(ctx, W, H) {
    if (!this.flash) return;
    ctx.globalAlpha = Math.max(0, this.flash.alpha);
    ctx.fillStyle = this.flash.color;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}
