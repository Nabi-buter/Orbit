// =============================================================================
// 캐릭터 포즈 계산 + 그리기
// 로컬 좌표: 발밑 중심 원점, 바라보는 방향 +x, 위쪽 +y.
// 상태와 공격 진행도(준비/판정/후딜레이)에 따라 포즈를 계산해 상태가 눈에 보이게 한다.
// =============================================================================

import { S } from '../core/fighter.js';
import { drawWeapon, drawFist, weaponSprite } from './weaponArt.js';
import { line, disc, px, rect, PX } from './pixel.js';
import { evalMotion, backHand, STANCE, GUARD_POSE, DEFLECT_FRAMES, WEIGHT } from './motions.js';
import { drawBot } from './botRig.js';

const SWING = {
  slash: [1.9, -0.6], 'slash-wide': [1.7, -0.9], overhead: [2.4, -0.9], 'overhead-big': [2.7, -1.15],
  chop: [2.0, -0.7], 'overhead-chop': [2.6, -1.05], sweep: [0.9, -0.3],
  'special-cleave': [2.8, -1.2], 'special-crush': [2.8, -1.2],
  'slash-rev': [-0.9, 1.7], rising: [-1.1, 2.1],
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
    lean: 0, crouch: 0, legSpread: 16, stride: 0, tuck: 0,
    wAngle: 0.75, hand: [20, 82], hand2: [8, 78], spin: 0, extraFist: null,
  };
  const breathe = Math.sin(frame * 0.08) * 1.5;
  p.crouch = breathe;
  const weaponId = f.weapon.id;
  // 무기별 기본 자세
  const st = STANCE[weaponId];
  if (st) { p.wAngle = st.a; p.hand = [...st.h]; p.hand2 = backHand(weaponId, st); }

  // 가만히 서 있어도 숨에 맞춰 무기가 아주 조금 오르내린다 (무거울수록 덜)
  const W = WEIGHT[weaponId] ?? 0.5;
  if (st && f.state === S.IDLE) { p.wAngle += Math.sin(frame * 0.08) * 0.03 * (1 - W * 0.6); p.hand[1] += breathe * 0.4; }

  switch (f.state) {
    case S.WALK: {
      p.stride = Math.sin(f.x * 0.09) * 14;
      // 걸음에 맞춰 손이 흔들리고 무기 끝이 살짝 까딱인다 (리그의 걸음 주기와 같은 위상)
      const ph = f.x * 0.075;
      p.hand = [p.hand[0] + Math.sin(ph) * 1.2, p.hand[1] - Math.abs(Math.cos(ph)) * 1.6];
      p.wAngle += Math.sin(ph) * (0.07 - W * 0.04);
      if (weaponId !== 'knuckle' && !st?.h2) p.hand2 = backHand(weaponId, { a: p.wAngle, h: p.hand });
      break;
    }
    case S.GUARD:
    case S.BLOCKSTUN: {
      // 무기별 가드 자세 (motions.js GUARD_POSE)
      const g = GUARD_POSE[weaponId] ?? GUARD_POSE.longsword;
      p.crouch = 7;
      p.lean = -0.06;
      p.wAngle = g.a;
      p.hand = [...g.h];
      p.hand2 = g.h2 ? [...g.h2] : backHand(weaponId, g);
      // 막은 직후: 충격으로 밀렸다가 돌아옴
      if (f.state === S.BLOCKSTUN) {
        const k = Math.min(1, f.timer / 10);
        p.hand[0] += g.recoil.dx * k; p.hand2[0] += g.recoil.dx * k;
        p.wAngle += g.recoil.da * k;
        p.lean -= 0.18 * k; p.crouch += 3 * k;
      }
      // 완벽패링: 무기를 바깥 위로 쳐냈다가 가드로 돌아옴
      const since = f.flash?.type === 'perfect' ? frame - f.flash.frame : Infinity;
      if (since >= 0 && since < DEFLECT_FRAMES) {
        const t = since / DEFLECT_FRAMES;
        const k = t < 0.3 ? t / 0.3 : 1 - (t - 0.3) / 0.7;
        p.hand[0] += 10 * k; p.hand[1] += 6 * k;
        p.wAngle += (weaponId === 'axe' ? 0.9 : 0.7) * k;
        p.lean += 0.2 * k;
        if (weaponId === 'knuckle') { p.hand2 = [p.hand2[0] + 14 * k, p.hand2[1] + 4 * k]; }
        else if (!GUARD_POSE[weaponId]?.h2) p.hand2 = backHand(weaponId, { a: p.wAngle, h: p.hand });
      }
      break;
    }
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
  // 공격이 아닌 상태에서 시작한 공격은 기본 자세에서 출발
  if (f.state !== S.ATTACK && f.state !== S.SPECIAL && f.state !== S.ULTIMATE) { const m = chain.get(f); if (m) { m.last = null; m.atk = null; } }
  if (weaponId === 'knuckle' && !p.extraFist) p.extraFist = p.hand2;
  return p;
}

/**
 * 콤보 이어 그리기: 공격이 바뀌는 순간 직전 공격의 마지막 자세를 기억해 다음 공격의 준비 동작을 거기서 시작한다
 * (베기 → 되베기가 기본 자세로 돌아갔다 다시 휘두르지 않고, 내려간 칼이 그대로 올라오며 이어짐). 그리기 전용.
 */
const chain = new WeakMap();
function chainStart(f) {
  let m = chain.get(f);
  if (!m) { m = { atk: null, start: null, last: null }; chain.set(f, m); }
  if (m.atk !== f.attack) { m.start = m.last; m.atk = f.attack; }
  return m;
}

function attackPose(p, f, weaponId) {
  const a = f.attack;
  if (!a) return;
  // 무기별 키프레임 모션 (src/render/motions.js)
  const m = chainStart(f);
  const mp = evalMotion(weaponId, a.def, a.frame, m.start);
  m.last = mp;
  if (mp) {
    p.wAngle = mp.a;
    p.hand = mp.h;
    p.hand2 = backHand(weaponId, mp);
    p.lean = mp.lean; p.stride = mp.stride; p.crouch = mp.crouch;
    if (weaponId === 'knuckle') p.extraFist = p.hand2;
    return;
  }
  const { phase, t, hitIndex } = attackPhase(a);
  const motion = a.def.motion;
  const isUlt = a.def.kind === 'ultimate';

  if (isUlt || THRUST.has(motion) || (weaponId === 'spear' && !SWING[motion])) {
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
    const upper = motion.includes('uppercut') && phase !== 'windup';
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

/** 무릎/팔꿈치가 굽은 관절 위치 (로컬 좌표) */
function joint(a, b, bend) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const k = Math.max(0, 30 - len * 0.35) * (bend > 0 ? -0.6 : 0.9);
  const nx = -(b[1] - a[1]) / (len || 1), ny = (b[0] - a[0]) / (len || 1);
  const sgn = bend > 0 ? 1 : -1;
  return [mx + nx * k * sgn, my + ny * k * sgn];
}

/**
 * 픽셀 캐릭터 그리기 — 마네킹형 디자인 (큰 타원 머리 + 눈 띠, 어두운 어깨·관절, 밝은 가슴)
 * @param ctx 아트(저해상도) 캔버스 컨텍스트
 * @param ax, ay 발밑 위치 (아트 좌표)
 * @param pal {body, light, shade, joint, pad, visor, outline, weapon}
 * @returns {hand:[x,y], wAngle, pose} 무기 궤적 계산용
 */
export function drawFighterLegacy(ctx, f, ax, ay, pal, frame, opts = {}) {
  const pose = computePose(f, frame);
  const facing = f.facing;
  const spin = pose.spin || 0;
  const cs = Math.cos(spin), sn = Math.sin(spin);
  // 로컬(월드 단위, 위 +) → 아트 좌표
  const P = ([lx, ly]) => {
    let x = lx, y = ly;
    if (spin) { const rx = x * cs - y * sn, ry = x * sn + y * cs; x = rx + 30; y = ry + 12; }
    return [ax + (facing * x) / PX, ay - y / PX];
  };

  const hip = [0, 54 - pose.crouch];
  const shoulder = [hip[0] + Math.sin(pose.lean) * 40, hip[1] + Math.cos(pose.lean) * 40];
  const chest = [hip[0] + Math.sin(pose.lean) * 26, hip[1] + Math.cos(pose.lean) * 26];
  const head = [shoulder[0] + Math.sin(pose.lean) * 21, shoulder[1] + Math.cos(pose.lean) * 21];
  const dx = shoulder[0], dy = shoulder[1] - 96;
  const hand = [pose.hand[0] + dx, pose.hand[1] + dy];
  const hand2 = [pose.hand2[0] + dx, pose.hand2[1] + dy];
  const tuck = pose.tuck * 24;
  const footB = [-pose.legSpread - pose.stride * 0.5 - tuck * 0.3, tuck];
  const footF = [pose.legSpread + pose.stride * 0.5 + tuck * 0.2, tuck * 0.7];
  // 두 다리는 골반 양옆에서 시작 (겹쳐 보이지 않도록)
  const hipB = [hip[0] - 4, hip[1]], hipF = [hip[0] + 4, hip[1]];
  const kneeB = joint(hipB, footB, -1), kneeF = joint(hipF, footF, -1);
  const shB = [shoulder[0] - 5, shoulder[1] - 2];
  const elbB = joint(shB, hand2, 1), elbF = joint(shoulder, hand, 1);
  const extra = pose.extraFist ? [pose.extraFist[0] + dx, pose.extraFist[1] + dy] : null;
  const elbX = extra ? joint(shB, extra, 1) : null;

  const tint = opts.tint;
  const C = tint
    ? { body: tint, light: tint, shade: tint, joint: tint, pad: tint, visor: tint }
    : pal;
  const O = opts.silhouette ? null : pal.outline;

  const seg = (a, b, c, w) => { const p = P(a), q = P(b); line(ctx, p[0], p[1], q[0], q[1], c, w); };
  const sq = (pt, c, n = 2) => { const p = P(pt); rect(ctx, Math.round(p[0]) - (n >> 1), Math.round(p[1]) - (n >> 1), n, n, c); };
  /** 부위 하나: 외곽선(두께+2) → 채색. 뒤에서 앞 순서로 호출하면 겹친 곳에 경계선이 생긴다 */
  const part = (pts, c, w) => {
    if (O) for (let k = 1; k < pts.length; k++) seg(pts[k - 1], pts[k], O, w + 2);
    for (let k = 1; k < pts.length; k++) seg(pts[k - 1], pts[k], c, w);
  };
  const bootAt = (ft, c) => {
    const p = P(ft); const x0 = Math.round(p[0]) - (facing > 0 ? 1 : 3), y0 = Math.round(p[1]);
    if (O) rect(ctx, x0 - 1, y0 - 2, 6, 4, O);
    rect(ctx, x0, y0 - 1, 4, 1, c); rect(ctx, x0, y0, 4, 1, C.joint);
  };
  /** 둥근 어깨 패드 (외곽선 + 위쪽 하이라이트) */
  const pad = (pt, r) => {
    const p = P(pt);
    if (O) disc(ctx, p[0], p[1], r + 1, O);
    disc(ctx, p[0], p[1], r, C.pad);
    if (!tint) px(ctx, p[0] - facing, p[1] - r + 1, C.light);
  };
  const hd = P(head);

  // 뒷다리
  part([hipB, kneeB, footB], C.shade, 3);
  sq(kneeB, C.joint);
  bootAt(footB, C.shade);
  // 뒷팔
  part([shB, elbB, hand2], C.shade, 3);
  if (extra) part([shB, elbX, extra], C.shade, 3);
  pad(shB, 2);
  // 몸통: 복부(어둡게, 좁게) + 가슴(밝게, 넓게)
  part([hip, chest], C.shade, 5);
  part([chest, shoulder], C.body, 7);
  const ch = P(chest), sh = P(shoulder);
  line(ctx, ch[0] + facing * 2, ch[1] - 1, sh[0] + facing * 2, sh[1] + 1, C.light, 1);
  sq(hip, C.joint);
  // 목 + 머리 (달걀형, 위쪽 하이라이트, 얼굴 쪽 눈 띠)
  part([[shoulder[0], shoulder[1] + 2], [head[0], head[1] - 9]], C.shade, 3);
  drawHead(ctx, hd[0], hd[1], facing, C, O, !tint ? pal : null);
  // 앞다리
  part([hipF, kneeF, footF], C.body, 4);
  sq(kneeF, C.joint);
  bootAt(footF, C.body);

  // 무기 + 앞팔 + 앞 어깨 패드
  const hA = P(hand);
  if (f.weapon.id !== 'knuckle') {
    let ang = pose.wAngle;
    if (spin) ang += spin;
    if (!opts.silhouette) drawWeapon(ctx, f.weapon.id, pal.weapon, hA[0], hA[1], ang, facing);
  }
  part([shoulder, elbF, hand], C.body, 3);
  sq(elbF, C.joint, 1);
  pad(shoulder, 2);
  if (f.weapon.id === 'knuckle') {
    if (!opts.silhouette) {
      drawFist(ctx, pal.weapon, hA[0], hA[1], facing);
      if (extra) { const e = P(extra); drawFist(ctx, pal.weapon, e[0], e[1], facing); }
    }
  } else {
    if (O) rect(ctx, Math.round(hA[0]) - 2, Math.round(hA[1]) - 2, 4, 4, O);
    rect(ctx, Math.round(hA[0]) - 1, Math.round(hA[1]) - 1, 2, 2, C.body); // 주먹
  }
  return { hand: hA, wAngle: pose.wAngle + spin, pose };
}

/** 달걀형 머리 (폭 9 × 높이 10), 위쪽 하이라이트, 얼굴 쪽 눈 띠 */
const HEAD_ROWS = [3, 7, 9, 9, 9, 9, 9, 7, 7, 5];
function drawHead(ctx, cx, cy, facing, C, O, pal) {
  cx = Math.round(cx); cy = Math.round(cy) - 5;
  if (O) HEAD_ROWS.forEach((w, r) => { ctx.fillStyle = O; ctx.fillRect(cx - (w >> 1) - 1, cy + r - 1, w + 2, 3); });
  HEAD_ROWS.forEach((w, r) => { ctx.fillStyle = r >= 8 ? C.shade : C.body; ctx.fillRect(cx - (w >> 1), cy + r, w, 1); });
  // 하이라이트 (뒤통수 위쪽)
  ctx.fillStyle = C.light;
  ctx.fillRect(cx - facing * 2 - 1, cy + 1, 2, 1);
  ctx.fillRect(cx - facing * 3 - (facing > 0 ? 0 : 0), cy + 2, 1, 2);
  if (pal) {
    // 눈 띠: 얼굴 쪽, 가운데보다 조금 아래
    ctx.fillStyle = pal.outline;
    ctx.fillRect(facing > 0 ? cx + 1 : cx - 4, cy + 5, 4, 1);
    ctx.fillRect(facing > 0 ? cx + 2 : cx - 3, cy + 6, 2, 1);
    ctx.fillStyle = pal.visor;
    ctx.fillRect(cx + facing * 3, cy + 5, 1, 1);
  }
}

/** 채운 타원 */
function ellipse(ctx, cx, cy, rx, ry, c) {
  cx = Math.round(cx); cy = Math.round(cy);
  ctx.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    const hw = Math.floor(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.6))) + 0.35);
    ctx.fillRect(cx - hw, cy + y, hw * 2 + 1, 1);
  }
}

/** 무기 끝(칼끝) 아트 좌표 — 휘두르기 궤적용 */
export function weaponTip(f, hand, wAngle) {
  const s = weaponSprite(f.weapon.id, '#fff');
  const len = f.weapon.id === 'knuckle' ? 3 : s.w - s.pivot[0] - 2;
  return [hand[0] + f.facing * Math.cos(wAngle) * len, hand[1] - Math.sin(wAngle) * len];
}

/**
 * 캐릭터 그리기 — 첨부 캐릭터 시트 기반 스프라이트 (src/render/botRig.js).
 * 이전의 선·원으로 그리던 방식은 drawFighterLegacy 로 남겨 둔다.
 */
export function drawFighter(ctx, f, ax, ay, pal, frame, opts = {}) {
  return drawBot(ctx, f, ax, ay, pal, frame, opts);
}
