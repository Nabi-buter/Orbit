// =============================================================================
// 렌더러 (1단계: 판정 확인용 단순 도형)
// Match 상태를 읽기만 한다. 로직을 변경하지 않는다.
// =============================================================================

import { BALANCE, STAGE } from '../config/balance.js';
import { S, hurtbox, worldBox } from '../core/fighter.js';

const COLORS = ['#4aa3ff', '#ff5a5a'];
const STATE_COLORS = {
  [S.HITSTUN]: '#ffffff', [S.GUARD]: '#7dffb0', [S.BLOCKSTUN]: '#7dffb0',
  [S.PARRIED]: '#ffd34a', [S.GUARD_BREAK]: '#b45cff', [S.KNOCKBACK]: '#b45cff',
  [S.ULTIMATE]: '#ff9c2a', [S.DASH]: '#9be7ff', [S.KO]: '#555',
};
const RESULT_TEXT = {
  hit: null, armored: '버팀!', parry: '패링', perfect: '완벽패링!',
  guardBreak: '가드 브레이크!', special: '특수강공!', ko: 'K.O.',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.showBoxes = true;
    this.popups = [];
  }

  toScreen(x, y) { return [x, STAGE.groundY - y]; }

  pushEvents(events) {
    for (const e of events) {
      const text = RESULT_TEXT[e.type];
      if (text) this.popups.push({ text, x: e.x ?? STAGE.width / 2, y: (e.y ?? 120) + 60, life: 50, type: e.type });
    }
  }

  draw(match) {
    const { ctx } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#14161c';
    ctx.fillRect(0, 0, STAGE.width, STAGE.height);
    ctx.fillStyle = '#262a35';
    ctx.fillRect(0, STAGE.groundY, STAGE.width, STAGE.height - STAGE.groundY);
    ctx.strokeStyle = '#3a4050';
    ctx.beginPath();
    ctx.moveTo(STAGE.leftWall - 25, 0); ctx.lineTo(STAGE.leftWall - 25, STAGE.groundY);
    ctx.moveTo(STAGE.rightWall + 25, 0); ctx.lineTo(STAGE.rightWall + 25, STAGE.groundY);
    ctx.stroke();

    match.fighters.forEach((f, i) => this.drawFighter(f, i));
    if (this.showBoxes) match.fighters.forEach((f) => this.drawBoxes(f));
    this.drawHud(match);
    this.drawPopups();
  }

  drawFighter(f, i) {
    const { ctx } = this;
    const hb = hurtbox(f);
    const [sx, sy] = this.toScreen(hb.x, hb.y + hb.h);
    ctx.fillStyle = STATE_COLORS[f.state] ?? COLORS[i];
    ctx.globalAlpha = f.state === S.HITSTUN ? 0.85 : 1;
    ctx.fillRect(sx, sy, hb.w, hb.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS[i];
    ctx.lineWidth = 3;
    ctx.strokeRect(sx, sy, hb.w, hb.h);
    // 바라보는 방향 표시
    const [hx, hy] = this.toScreen(f.x, f.y + 95);
    ctx.beginPath();
    ctx.moveTo(hx, hy); ctx.lineTo(hx + f.facing * 40, hy);
    ctx.stroke();
    // 상태 텍스트
    ctx.fillStyle = '#ddd';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    const extra = f.attack ? ` ${f.attack.def.id}:${f.attack.frame}` : f.timer ? ` ${f.timer}` : '';
    ctx.fillText(`P${i + 1} ${f.state}${extra}`, f.x, sy - 10);
  }

  drawBoxes(f) {
    const { ctx } = this;
    const a = f.attack;
    if (!a) return;
    const hits = f.state === S.PLUNGE ? [f.weapon.plunge.hit]
      : a.def.hits.filter((h) => a.frame >= h.from && a.frame <= h.to);
    for (const h of hits) {
      const b = worldBox(f, h.box);
      const [x, y] = this.toScreen(b.x, b.y + b.h);
      ctx.fillStyle = 'rgba(255,60,60,0.35)';
      ctx.fillRect(x, y, b.w, b.h);
      ctx.strokeStyle = '#ff4040';
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, b.w, b.h);
    }
  }

  drawHud(match) {
    const { ctx } = this;
    const F = BALANCE.fighter;
    match.fighters.forEach((f, i) => {
      const left = i === 0;
      const x0 = left ? 30 : STAGE.width - 30 - 500;
      const bar = (y, h, value, max, color, label) => {
        ctx.fillStyle = '#000a';
        ctx.fillRect(x0, y, 500, h);
        const w = 500 * Math.max(0, value) / max;
        ctx.fillStyle = color;
        ctx.fillRect(left ? x0 : x0 + 500 - w, y, w, h);
        ctx.fillStyle = '#fff';
        ctx.font = '12px sans-serif';
        ctx.textAlign = left ? 'left' : 'right';
        ctx.fillText(`${label} ${Math.ceil(value)}`, left ? x0 + 4 : x0 + 496, y + h - 3);
      };
      bar(24, 22, f.hp, F.maxHp, COLORS[i], `P${i + 1} 체력`);
      bar(50, 12, f.stamina, F.maxStamina, '#ffe066', '스태미나');
      bar(66, 12, f.guard, F.maxGuard, '#7dffb0', '가드');
      bar(82, 12, f.ult, F.maxUlt, f.ult >= F.maxUlt ? '#ff9c2a' : '#c77dff', f.ult >= F.maxUlt ? '궁극기 준비!' : '궁극기');
    });
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(Math.ceil(match.timeLeft / 60)), STAGE.width / 2, 60);
  }

  drawPopups() {
    const { ctx } = this;
    this.popups = this.popups.filter((p) => p.life-- > 0);
    for (const p of this.popups) {
      const [x, y] = this.toScreen(p.x, p.y + (50 - p.life) * 0.8);
      ctx.globalAlpha = Math.min(1, p.life / 20);
      ctx.font = 'bold 26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.type === 'perfect' ? '#ffd34a' : p.type === 'guardBreak' ? '#c77dff' : '#fff';
      ctx.fillText(p.text, x, y);
      ctx.globalAlpha = 1;
    }
  }
}
