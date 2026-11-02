// =============================================================================
// 무기 그림. 원점(손잡이)에서 +x 방향으로 그린다. y 는 위쪽이 + (캐릭터 로컬 좌표).
// =============================================================================

const STEEL = '#e8edf5';
const STEEL_DARK = '#9aa6b8';
const WOOD = '#8a5a36';
const GRIP = '#3b2a20';

function blade(ctx, x0, x1, w, color = STEEL) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x0, w / 2);
  ctx.lineTo(x1 - w, w / 2);
  ctx.lineTo(x1, 0);
  ctx.lineTo(x1 - w, -w / 2);
  ctx.lineTo(x0, -w / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = STEEL_DARK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x0 + 2, 0); ctx.lineTo(x1 - w * 1.2, 0);
  ctx.stroke();
}

function bar(ctx, x0, x1, w, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x0, -w / 2, x1 - x0, w);
}

/** @param accent 무기 고유 색 (빛나는 테두리 등에 사용) */
export function drawWeapon(ctx, id, accent = '#fff', scale = 1) {
  ctx.save();
  ctx.scale(scale, scale);
  switch (id) {
    case 'longsword':
      bar(ctx, -14, 0, 5, GRIP);
      bar(ctx, -2, 2, 18, accent);
      blade(ctx, 2, 84, 7);
      break;
    case 'greatsword':
      bar(ctx, -20, 0, 6, GRIP);
      bar(ctx, -3, 3, 26, accent);
      blade(ctx, 3, 112, 15);
      ctx.fillStyle = accent;
      ctx.fillRect(10, -2, 40, 4);
      break;
    case 'dagger':
      bar(ctx, -9, 0, 5, GRIP);
      bar(ctx, -1.5, 1.5, 12, accent);
      blade(ctx, 1.5, 36, 6);
      break;
    case 'axe':
      bar(ctx, -22, 70, 5, WOOD);
      ctx.fillStyle = STEEL;
      ctx.beginPath();
      ctx.moveTo(52, 2);
      ctx.quadraticCurveTo(58, 30, 78, 34);
      ctx.quadraticCurveTo(86, 12, 80, -6);
      ctx.quadraticCurveTo(66, -2, 62, -2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(78, 33); ctx.quadraticCurveTo(86, 12, 80, -6);
      ctx.stroke();
      break;
    case 'spear':
      bar(ctx, -50, 122, 4.5, WOOD);
      bar(ctx, 116, 122, 9, accent);
      ctx.fillStyle = STEEL;
      ctx.beginPath();
      ctx.moveTo(120, 0);
      ctx.quadraticCurveTo(134, 9, 152, 0);
      ctx.quadraticCurveTo(134, -9, 120, 0);
      ctx.fill();
      break;
    case 'knuckle':
      drawFist(ctx, accent, 1.25);
      break;
    default:
      blade(ctx, 0, 70, 6);
  }
  ctx.restore();
}

/** 너클 장착 주먹 */
export function drawFist(ctx, accent, s = 1) {
  ctx.save();
  ctx.scale(s, s);
  ctx.fillStyle = '#596274';
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = accent;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(6, i * 5 - 2); ctx.lineTo(12, i * 5); ctx.lineTo(6, i * 5 + 2);
    ctx.fill();
  }
  ctx.restore();
}

/** 무기 선택 카드용 아이콘 */
export function drawWeaponIcon(canvas, id, accent) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.save();
  const len = { longsword: 100, greatsword: 132, dagger: 46, axe: 108, spear: 202, knuckle: 30 }[id] ?? 100;
  const start = { longsword: -14, greatsword: -20, dagger: -9, axe: -22, spear: -50, knuckle: -12 }[id] ?? 0;
  const s = Math.min(1.6, (W * 0.9) / len);
  if (id === 'knuckle') {
    ctx.translate(W / 2, H / 2);
    ctx.scale(1, -1);
    ctx.save(); ctx.translate(-14, 4); drawFist(ctx, accent, 1.6); ctx.restore();
    ctx.save(); ctx.translate(14, -4); drawFist(ctx, accent, 1.6); ctx.restore();
  } else {
    ctx.translate(W / 2, H / 2);
    ctx.scale(1, -1);
    ctx.rotate(0.35);
    ctx.translate(-(start + len / 2) * s, 0);
    drawWeapon(ctx, id, accent, s);
  }
  ctx.restore();
}
