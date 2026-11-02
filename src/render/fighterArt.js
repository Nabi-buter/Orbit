// =============================================================================
// 캐릭터 포즈 계산 + 그리기
// 로컬 좌표: 발밑 중심 원점, 바라보는 방향 +x, 위쪽 +y.
// 상태와 공격 진행도(준비/판정/후딜레이)에 따라 포즈를 계산해 상태가 눈에 보이게 한다.
// =============================================================================

import { S } from '../core/fighter.js';
import { drawWeapon, drawFist } from './weaponArt.js';

const SWING = {
  slash: [1.9, -0.6], 'slash-wide': [1.7, -0.9], overhead: [2.4, -0.9], 'overhead-big': [2.7, -1.15],
  chop: [2.0, -0.7], 'overhead-chop': [2.6, -1.05], sweep: [0.9, -0.3],
  'special-cleave': [2.8, -1.2], 'special-crush': [2.8, -1.2],
};
const THRUST = new Set(['stab', 'double-stab', 'thrust', 'special-thrust', 'special-pierce', 'special-flurry']);
const PUNCH = new Set(['jab-jab', 'rush', 'special-uppercut']);

const ease = (t) => 1 - (1 - t) * (1 - t);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

/** 공격 진행 단계: phase 'windup' | 'strike' | 'recover', t 0~1, hitIndex */
export function attackPhase(attack) {
  const { def, frame } = attack;
  const hits = def.hits;
  if (!hits.length) return { phase: 'strike', t: 1, hitIndex: 0 };
  const first = hits[0].from;
  const last = hits.at(-1).to;
  if (frame < first) return { phase: 'windup', t: first ? frame / first : 1, hitIndex: 0 };
  if (frame <= last + 2) {
    let idx = 0;
    hits.forEach((h, i) => { if (frame >= h.from - 2) idx = i; });
    const h = hits[idx];
    return { phase: 'strike', t: clamp01((frame - h.from + 2) / (h.to - h.from + 4)), hitIndex: idx };
  }
  return { phase: 'recover', t: clamp01((frame - last - 2) / Math.max(1, def.duration - last - 2)), hitIndex: hits.length - 1 };
}

/**
 * 포즈 계산
 * @returns {{lean, crouch, legs, wAngle, hand, hand2, spin, tuck, flash}}
 */
export function computePose(f, frame) {
  const p = {
    lean: 0, crouch: 0, legSpread: 10, stride: 0, tuck: 0,
    wAngle: 0.75, hand: [20, 82], hand2: [8, 78], spin: 0, extraFist: null,
  };
  const breathe = Math.sin(frame * 0.08) * 1.5;
  p.crouch = breathe;
  const weaponId = f.weapon.id;

  switch (f.state) {
    case S.WALK:
      p.stride = Math.sin(f.x * 0.09) * 14;
      break;
    case S.GUARD:
    case S.BLOCKSTUN:
      p.crouch = 8;
      p.lean = -0.05;
      p.wAngle = 1.45;
      p.hand = [26, 76];
      p.hand2 = [20, 70];
      break;
    case S.DASH: {
      const back = f.dash && f.dash.dir !== f.facing;
      p.lean = back ? -0.25 : 0.32;
      p.crouch = 10;
      p.stride = back ? -10 : 16;
      p.wAngle = back ? 1.0 : 0.1;
      p.hand = back ? [14, 80] : [24, 70];
      break;
    }
    case S.JUMP:
      p.tuck = 1;
      p.wAngle = 1.1;
      p.hand = [18, 90];
      break;
    case S.PLUNGE:
      p.tuck = 0.6;
      p.wAngle = -1.5;
      p.hand = [14, 60];
      p.hand2 = [8, 62];
      break;
    case S.LANDING:
      p.crouch = 16;
      p.wAngle = f.attack ? -1.3 : 0.4;
      p.hand = [24, 58];
      break;
    case S.HITSTUN:
      p.lean = -0.3;
      p.wAngle = -0.2;
      p.hand = [6, 78];
      break;
    case S.PARRIED:
      p.lean = -0.38;
      p.crouch = 4;
      p.wAngle = 2.5;
      p.hand = [-6, 96];
      p.hand2 = [-12, 84];
      break;
    case S.GUARD_BREAK:
      p.lean = 0.35;
      p.crouch = 24;
      p.wAngle = -0.35;
      p.hand = [20, 52];
      p.hand2 = [8, 54];
      break;
    case S.KNOCKBACK:
      p.lean = -0.55;
      p.crouch = 6;
      p.wAngle = 2.0;
      p.hand = [-4, 88];
      break;
    case S.KO:
      p.spin = Math.PI / 2; // 뒤로 쓰러짐
      p.wAngle = Math.PI / 2; // 쓰러진 몸과 나란히
      p.hand = [12, 70];
      break;
    case S.ATTACK:
    case S.SPECIAL:
    case S.ULTIMATE:
      attackPose(p, f, weaponId);
      break;
    default:
      break;
  }
  return p;
}

function attackPose(p, f, weaponId) {
  const a = f.attack;
  if (!a) return;
  const { phase, t, hitIndex } = attackPhase(a);
  const motion = a.def.motion;
  const isUlt = a.def.kind === 'ultimate';

  if (isUlt || THRUST.has(motion) || (weaponId === 'spear' && motion !== 'sweep')) {
    const reach = weaponId === 'spear' ? 46 : 42;
    if (phase === 'windup') { p.hand = [lerp(18, 0, ease(t)), 80]; p.lean = -0.08 * t; }
    else if (phase === 'strike') { p.hand = [lerp(4, reach, ease(Math.min(1, t * 1.6))), 80]; p.lean = 0.22; p.stride = 16; }
    else { p.hand = [lerp(reach, 20, ease(t)), 80]; p.lean = lerp(0.22, 0, t); p.stride = 16 * (1 - t); }
    p.wAngle = motion === 'stab' || motion === 'double-stab' ? -0.05 : 0;
    p.hand2 = weaponId === 'spear' ? [p.hand[0] - 30, 79] : [p.hand[0] - 26, 76];
    if (isUlt) { p.lean = 0.35; p.stride = 18; p.hand = [44, 82]; }
    return;
  }

  if (PUNCH.has(motion) || weaponId === 'knuckle') {
    const front = hitIndex % 2 === 0;
    const out = phase === 'strike' ? ease(Math.min(1, t * 1.8)) * (1 - Math.max(0, t - 0.7)) : phase === 'windup' ? -0.3 * t : 0;
    const upper = motion === 'special-uppercut' && phase !== 'windup';
    const ext = [lerp(16, 46, Math.max(0, out)), upper ? lerp(70, 112, Math.max(0, out)) : 84];
    const rest = [12, 76];
    p.hand = front ? ext : rest;
    p.extraFist = front ? rest : ext;
    p.lean = phase === 'strike' ? 0.18 : 0.05;
    p.stride = phase === 'strike' ? 12 : 4;
    p.crouch = upper ? -4 : 4;
    return;
  }

  const [from, to] = SWING[motion] ?? [2.0, -0.7];
  if (phase === 'windup') {
    p.wAngle = lerp(0.75, from, ease(t));
    p.lean = -0.1 * t;
  } else if (phase === 'strike') {
    p.wAngle = lerp(from, to, ease(Math.min(1, t * 1.5)));
    p.lean = 0.22;
    p.stride = 14;
  } else {
    p.wAngle = lerp(to, 0.75, ease(t));
    p.lean = lerp(0.22, 0, t);
    p.stride = 14 * (1 - t);
  }
  const ha = p.wAngle * 0.55;
  p.hand = [8 + Math.cos(ha) * 24, 86 + Math.sin(ha) * 22];
  p.hand2 = [p.hand[0] - 6, p.hand[1] - 4];
}

/**
 * 캐릭터 그리기 (ctx 는 화면 좌표계)
 */
export function drawFighter(ctx, f, sx, sy, colors, frame, opts = {}) {
  const pose = computePose(f, frame);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(f.facing, -1); // 로컬: 전방 +x, 위 +y
  if (pose.spin) { ctx.translate(30, 12); ctx.rotate(pose.spin); }

  const hip = [0, 56 - pose.crouch];
  const shoulder = [hip[0] + Math.sin(pose.lean) * 40, hip[1] + Math.cos(pose.lean) * 40];
  const head = [shoulder[0] + Math.sin(pose.lean) * 18, shoulder[1] + Math.cos(pose.lean) * 18];

  // 손 위치는 어깨 기준으로 보정 (기울기만큼 이동)
  const dx = shoulder[0], dy = shoulder[1] - 96;
  const hand = [pose.hand[0] + dx, pose.hand[1] + dy];
  const hand2 = [pose.hand2[0] + dx, pose.hand2[1] + dy];

  const body = opts.tint ?? colors.body;
  const limb = colors.limb;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // 뒷다리 / 뒷팔
  const legTuck = pose.tuck * 24;
  drawLimb(ctx, hip, [-pose.legSpread - pose.stride * 0.5 - legTuck * 0.3, legTuck], limb, 11, -1);
  drawLimb(ctx, shoulder, hand2, limb, 9, 1);
  if (pose.extraFist) {
    const ef = [pose.extraFist[0] + dx, pose.extraFist[1] + dy];
    drawLimb(ctx, shoulder, ef, limb, 9, 1);
    ctx.save(); ctx.translate(ef[0], ef[1]); drawFist(ctx, colors.weapon, 1); ctx.restore();
  }

  // 몸통
  ctx.strokeStyle = body;
  ctx.lineWidth = 20;
  ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(shoulder[0], shoulder[1]); ctx.stroke();
  // 허리띠 (팀 색)
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.moveTo(hip[0] - 10, hip[1] + 4); ctx.lineTo(hip[0] + 10, hip[1] + 4); ctx.stroke();

  // 앞다리
  drawLimb(ctx, hip, [pose.legSpread + pose.stride * 0.5 + legTuck * 0.2, legTuck * 0.7], body, 12, -1);

  // 머리
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.arc(head[0], head[1], 13, 0, Math.PI * 2); ctx.fill();
  // 머리띠 (팀 색, 뒤로 휘날림)
  ctx.strokeStyle = colors.accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(head[0] - 12, head[1] + 3); ctx.lineTo(head[0] + 12, head[1] + 3);
  const wave = Math.sin(frame * 0.25 + f.id) * 4;
  ctx.moveTo(head[0] - 11, head[1] + 3);
  ctx.quadraticCurveTo(head[0] - 22, head[1] + 6 + wave, head[0] - 30, head[1] + wave);
  ctx.stroke();
  // 눈 (방향 표시)
  ctx.fillStyle = colors.eye;
  ctx.fillRect(head[0] + 5, head[1] + 2, 5, 3);

  // 무기 + 앞팔
  if (f.weapon.id !== 'knuckle') {
    ctx.save();
    ctx.translate(hand[0], hand[1]);
    ctx.rotate(pose.wAngle);
    if (opts.trail) { ctx.shadowColor = colors.weapon; ctx.shadowBlur = 16; }
    drawWeapon(ctx, f.weapon.id, colors.weapon);
    ctx.restore();
  }
  drawLimb(ctx, shoulder, hand, body, 10, 1);
  if (f.weapon.id === 'knuckle') {
    ctx.save(); ctx.translate(hand[0], hand[1]); drawFist(ctx, colors.weapon, 1.15); ctx.restore();
  } else {
    ctx.fillStyle = limb;
    ctx.beginPath(); ctx.arc(hand[0], hand[1], 5, 0, Math.PI * 2); ctx.fill();
  }

  ctx.restore();
  return pose;
}

/** 관절 하나를 굽힌 팔/다리 (bend: 1 팔꿈치 아래, -1 무릎 앞) */
function drawLimb(ctx, a, b, color, width, bend) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k = Math.max(0, 30 - len * 0.35) * (bend > 0 ? -0.6 : 0.9);
  const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
  const jx = mx + nx * k * (bend > 0 ? 1 : -1), jy = my + ny * k * (bend > 0 ? 1 : -1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(jx, jy); ctx.lineTo(b[0], b[1]); ctx.stroke();
}
