// =============================================================================
// 관절 리그 (공격 · 가드 · 피격 등 시트에 없는 동작)
// -----------------------------------------------------------------------------
// 몸통·머리는 첨부 캐릭터 시트의 그림을 그대로 쓰고, 팔과 다리는 관절 두 개(어깨→팔꿈치→손,
// 엉덩이→무릎→발)를 역운동학(IK)으로 풀어 시트와 같은 팔레트·외곽선으로 그린다.
//   - 손은 모션이 정한 위치에 실제로 닿는다 → 무기를 손에 쥔 채로 휘두른다
//   - 양손 무기는 뒷손이 자루를 잡는다 (장검도 양손 반검식)
//   - 발은 땅에 붙어 있고, 웅크리면 무릎이 굽고, 내딛으면 앞발이 나가며 체중이 앞으로 실린다
// 좌표: 로컬 아트 픽셀(오른쪽을 보는 기준, x 앞 +, y 아래 +), 원점 = 발밑 기준점.
// =============================================================================

import { BOT_RIG } from './botSprites.js';
import { drawWeapon, drawFist } from './weaponArt.js';
import { makeSprite, sset, blit } from './pixel.js';
import { GRIP, GUARD_POSE } from './motions.js';
import { S } from '../core/fighter.js';

const R = BOT_RIG;
const FOOT = R.foot;          // 시트 좌표의 발밑 기준점
const CUT = 22;               // 이 줄 위까지가 몸통(머리·가슴·골반), 아래는 다리로 다시 그린다
const HIP = { back: [7.5, 22], front: [12, 22] };
const FEET = { back: [3, 39], front: [14.5, 39] };
const LEG = { thigh: 7.9, shin: 7.9 };
const ARM = { upper: 5.5, fore: 5.5 };
/** 모션 좌표(월드 px, 어깨 높이 96 기준) → 어깨 기준 아트 픽셀 */
const PX_PER = 3.4;
const HAND_DROP = 4;          // 시트 캐릭터는 팔이 낮게 달려 있어 손 높이를 조금 내린다
/** 장검은 한손 반 자루: 뒷손이 폼멜 쪽을 함께 잡는다 */
const GRIP_ART = { ...Object.fromEntries(Object.entries(GRIP).map(([k, v]) => [k, v / PX_PER])), longsword: 2.5 };

const PELVIS = [10, CUT];     // 상체가 기우는 축 (골반 가운데)

/** 몸통 위쪽(머리·가슴·골반)만 잘라 낸 스프라이트 — 기울일 때 통째로 회전 (픽셀을 밀지 않아 목이 늘어나지 않음) */
const upperCache = new WeakMap();
function upperOf(core) {
  let s = upperCache.get(core);
  if (s) return s;
  s = makeSprite(core.w, CUT + 1, PELVIS);
  for (let y = 0; y <= CUT; y++) for (let x = 0; x < core.w; x++) { const c = core.px[y * core.w + x]; if (c) sset(s, x, y, c); }
  upperCache.set(core, s);
  return s;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (v) => Math.hypot(v[0], v[1]);

/**
 * 2관절 IK: 시작점 s 에서 길이 a, b 로 목표 t 에 닿게. pick(관절 후보 두 개) 으로 굽는 방향 선택.
 * @returns {joint, end} (닿지 않으면 쭉 편 채 목표 방향으로)
 */
function ik(s, t, a, b, pick) {
  const v = sub(t, s);
  const d = Math.max(Math.abs(a - b) + 0.01, Math.min(a + b - 0.01, len(v)));
  const ang = Math.atan2(v[1], v[0]);
  const end = [s[0] + Math.cos(ang) * d, s[1] + Math.sin(ang) * d];
  const cosA = (a * a + d * d - b * b) / (2 * a * d);
  const off = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const j1 = [s[0] + Math.cos(ang + off) * a, s[1] + Math.sin(ang + off) * a];
  const j2 = [s[0] + Math.cos(ang - off) * a, s[1] + Math.sin(ang - off) * a];
  return { joint: pick(j1, j2), end };
}

/**
 * 굵은 픽셀 팔다리. segs: [{a, b, r}] 이어진 선분들.
 * 외곽선을 먼저 모두 칠하고 안쪽을 칠해 관절에서 외곽선이 끊기지 않게 한다.
 * 진행 방향의 오른쪽(앞·위)은 밝게, 반대쪽은 어둡게.
 */
function drawLimb(put, segs, col, joints = []) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of segs) for (const p of [s.a, s.b]) {
    x0 = Math.min(x0, p[0] - s.r - 2); y0 = Math.min(y0, p[1] - s.r - 2);
    x1 = Math.max(x1, p[0] + s.r + 2); y1 = Math.max(y1, p[1] + s.r + 2);
  }
  const near = (x, y) => {
    let best = { d: Infinity };
    for (const s of segs) {
      const ab = sub(s.b, s.a), L2 = ab[0] * ab[0] + ab[1] * ab[1] || 1;
      const t = Math.max(0, Math.min(1, ((x - s.a[0]) * ab[0] + (y - s.a[1]) * ab[1]) / L2));
      const q = [s.a[0] + ab[0] * t, s.a[1] + ab[1] * t];
      const d = Math.hypot(x - q[0], y - q[1]);
      const side = ab[0] * (y - s.a[1]) - ab[1] * (x - s.a[0]);
      if (d - s.r < best.d - (best.r ?? 0)) best = { d, r: s.r, side };
    }
    return best;
  };
  const cells = [];
  for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) {
    const n = near(x + 0.5, y + 0.5);
    if (n.d <= n.r + 1) cells.push([x, y, n]);
  }
  for (const [x, y, n] of cells) if (n.d > n.r) put(x, y, col.line);
  for (const [x, y, n] of cells) {
    if (n.d > n.r) continue;
    const edge = n.d > n.r - 0.9;
    put(x, y, edge && n.side < 0 ? col.hi : edge && n.side > 0 ? col.lo : col.fill);
  }
  for (const j of joints) put(Math.floor(j[0]), Math.floor(j[1]), col.joint);
}

/**
 * 관절 리그로 캐릭터를 그린다.
 * @param core  몸통 스프라이트 (시트 그림, 팔 제외)
 * @param P     팔레트 {#, d, m, b, l, w}
 * @returns {hand, wAngle, pose}
 */
export function drawLimbRig(ctx, f, ax, ay, pal, P, core, pose, opts = {}) {
  const facing = f.facing;
  const weaponId = f.weapon.id;
  const showWeapon = !opts.silhouette;
  const put = (lx, ly, c) => { ctx.fillStyle = c; ctx.fillRect(ax + facing * lx, ay + ly, 1, 1); };
  const toScreen = (p) => [ax + facing * p[0], ay + p[1]];

  // --- 몸 자세: 기울기 · 웅크림 · 내딛기(체중 이동) --------------------------------
  const lean = Math.max(-0.5, Math.min(0.5, pose.lean ?? 0));
  const walking = f.state === S.WALK;
  // 걷기: 보폭 대신 걸음 주기 (발이 번갈아 앞뒤로, 몸이 살짝 오르내림)
  const phase = f.x * 0.075;
  const gait = walking ? Math.sin(phase) : 0;
  let drop = Math.max(-2, Math.min(9, (pose.crouch ?? 0) / 3));
  if (walking) drop += Math.abs(Math.cos(phase)) * 0.8;
  const stride = walking ? 0 : Math.max(-12, Math.min(34, pose.stride ?? 0)) / 3;   // 아트 px
  const hipShift = stride * 0.35;                                  // 앞발 쪽으로 실리는 체중
  const airborne = f.y > 0 || f.state === S.JUMP || f.state === S.PLUNGE;
  /** 상체는 골반을 축으로 통째로 회전 (기울기), 전체를 웅크림만큼 내림 */
  const pelvis = [PELVIS[0] - FOOT[0] + hipShift, PELVIS[1] - FOOT[1] + drop];
  const cosL = Math.cos(lean), sinL = Math.sin(lean);
  const body = (sx, sy) => {
    const vx = sx - PELVIS[0], vy = sy - PELVIS[1];
    return [pelvis[0] + vx * cosL - vy * sinL, pelvis[1] + vx * sinL + vy * cosL];
  };

  const hipB = body(...HIP.back), hipF = body(...HIP.front);
  const ANKLE = -2; // 발목은 바닥보다 2px 위, 발은 그 아래로 앞으로 뻗음
  let footB = [FEET.back[0] - FOOT[0] - stride * 0.15 - gait * 3.5, ANKLE - (walking ? Math.max(0, -Math.cos(phase)) * 2 : 0)];
  let footF = [FEET.front[0] - FOOT[0] + stride * 0.65 + gait * 3.5, ANKLE - (walking ? Math.max(0, Math.cos(phase)) * 2 : 0)];
  if (airborne) {
    // 공중: 무릎을 접어 발이 엉덩이 아래로
    footB = [hipB[0] - 2, hipB[1] + 13];
    footF = [hipF[0] + 3, hipF[1] + 12];
  }
  const kneeFwd = (a, b) => (a[0] > b[0] ? a : b);
  const legB = ik(hipB, footB, LEG.thigh, LEG.shin, kneeFwd);
  const legF = ik(hipF, footF, LEG.thigh, LEG.shin, kneeFwd);

  // --- 팔: 어깨 → 모션이 정한 손 위치 -----------------------------------------
  const shF = body(...R.frontShoulder), shB = body(...R.backShoulder);
  // 어깨보다 높은 손은 더 크게 올린다 (머리 위로 치켜든 준비 자세), 낮은 손은 시트처럼 조금 내려서
  const handTarget = (sh, h) => {
    const up = h[1] - 96;
    const dy = up > 0 ? -up / 2.2 - Math.max(0, up - 6) * 0.12 : -up / PX_PER + HAND_DROP;
    return [sh[0] + h[0] / 3.0, sh[1] + dy];
  };
  const elbowDown = (a, b) => (a[1] > b[1] ? a : b);
  const armF = ik(shF, handTarget(shF, pose.hand), ARM.upper, ARM.fore, elbowDown);
  const wa = pose.wAngle;
  const dir = [Math.cos(wa), -Math.sin(wa)];
  // 양손 무기: 뒷손은 실제 앞손 위치에서 자루를 따라 GRIP 만큼 뒤
  const grip = weaponId !== 'knuckle' ? GRIP_ART[weaponId] : null;
  const twoHanded = grip != null && f.state !== S.HITSTUN && f.state !== S.KNOCKBACK && f.state !== S.PARRIED;
  // 가드: 무기마다 뒷손이 잡는 곳이 다르다 (대검은 칼면을 받치고, 도끼·창은 자루를 넓게 잡음)
  const guarding = f.state === S.GUARD || f.state === S.BLOCKSTUN;
  const support = guarding ? GUARD_POSE[weaponId]?.support : undefined;
  const backTarget = support != null
    ? [armF.end[0] + dir[0] * support, armF.end[1] + dir[1] * support]
    : twoHanded
      ? [armF.end[0] - dir[0] * grip, armF.end[1] - dir[1] * grip]
      : handTarget(shB, pose.hand2 ?? [pose.hand[0] - 12, pose.hand[1] - 6]);
  // 뒷손을 앞으로 뻗을수록 상체가 돌아 뒷어깨가 앞으로 온다 (시트 그림은 약간 정면이라 어깨 사이가 넓다)
  const twist = Math.max(0, Math.min(0.75, (backTarget[0] - shB[0] - 4) / 12));
  const shB2 = [shB[0] + (shF[0] - shB[0]) * twist, shB[1] + (shF[1] - shB[1]) * twist];
  const armB = ik(shB2, backTarget, ARM.upper, ARM.fore, elbowDown);

  // --- 색 (앞쪽 팔다리는 밝게, 뒤쪽은 어둡게 → 깊이감) ---------------------------
  const front = { line: P['#'], fill: P.l, hi: P.w, lo: P.m, joint: P.d };
  const back = { line: P['#'], fill: P.m, hi: P.b, lo: P.d, joint: P.d };
  // 다리 + 발을 한 덩어리로 그려 발목에서 끊기지 않게
  const leg = (c, hip, L) => {
    const toe = airborne ? 2 : 3.5;
    const heel = [L.end[0] - 1, L.end[1] + 1.2], tip = [L.end[0] + toe, L.end[1] + 1.2];
    drawLimb(put, [
      { a: hip, b: L.joint, r: 2.0 },
      { a: L.joint, b: L.end, r: 1.55 },
      { a: L.end, b: heel, r: 1.2 },
      { a: heel, b: tip, r: 1.1 },
    ], c, [L.joint]);
  };
  const arm = (c, sh, A) => drawLimb(put, [{ a: sh, b: A.joint, r: 1.15 }, { a: A.joint, b: A.end, r: 1.0 }, { a: A.end, b: A.end, r: 1.35 }], c, [A.joint]);

  // --- 그리기 순서: 뒷팔 · 뒷다리 · 몸통 · 앞다리 · 무기 · 앞팔 ------------------
  // 가드에서 뒷손이 무기를 받치면 그 팔은 가슴 앞을 지나므로 몸 위에 그린다
  const backArmFront = support != null;
  if (!backArmFront) arm(back, shB2, armB);
  leg(back, hipB, legB);
  {
    // 상체: 골반 축 회전 (RotSprite 회전이라 윤곽이 깨지지 않음)
    const up = upperOf(core);
    const [px, py] = toScreen(pelvis);
    const ang = Math.abs(lean) < 0.03 ? 0 : lean;
    if (facing > 0) blit(ctx, up, px, py, ang, false);
    else blit(ctx, up, px, py, Math.PI - ang, true);
  }
  leg(front, hipF, legF);
  const hand = toScreen(armF.end);
  if (showWeapon && weaponId !== 'knuckle') drawWeapon(ctx, weaponId, pal.weapon, hand[0], hand[1], wa, facing);
  if (backArmFront) arm(back, shB2, armB);
  arm(front, shF, armF);
  if (showWeapon && weaponId === 'knuckle') {
    const hb = toScreen(armB.end);
    drawFist(ctx, pal.weapon, hb[0], hb[1], facing);
    drawFist(ctx, pal.weapon, hand[0], hand[1], facing);
  }
  return { hand, wAngle: wa, pose };
}
