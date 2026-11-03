// =============================================================================
// 훈련봇 캐릭터 렌더러 (첨부 캐릭터 시트 기반 스프라이트)
// -----------------------------------------------------------------------------
// - 대기 / 걷기 / 앞 대시 / 점프 : 시트 프레임을 그대로 재생 (생김새·움직임 모두 원본)
// - 공격 / 가드 / 피격 등 시트에 없는 동작 : 컷아웃 리그
//     대기 프레임을 몸통(core) · 앞팔 · 뒷팔로 나눠, 몸통은 골반 기준으로 기울이고
//     팔은 어깨 기준으로 회전시킨다. 무기는 실제 손끝에 쥔다.
// 포즈 목표값(손 위치, 무기 각도, 기울기)은 fighterArt.computePose / motions.js 를 그대로 쓴다.
// =============================================================================

import { S } from '../core/fighter.js';
import { makeSprite, sset, blit, PX } from './pixel.js';
import { BOT_FRAMES, BOT_RIG } from './botSprites.js';
import { drawWeapon, drawFist } from './weaponArt.js';
import { computePose } from './fighterArt.js';
import { STANCE, GRIP, backHand } from './motions.js';

/** 팀별 팔레트 (같은 그림, 색만 다름) */
export const BOT_PALETTES = [
  { '#': '#16141f', d: '#46506e', m: '#8a8fa8', b: '#b8bbcc', l: '#dadce8', w: '#f3f4f9' }, // P1 차가운 회색 + 푸른 관절
  { '#': '#1a1416', d: '#6e4348', m: '#9d8d91', b: '#c5b9bb', l: '#e3dbdc', w: '#f8f3f3' }, // P2 따뜻한 회색 + 붉은 관절
];

const cache = new Map();
function toSprite(rows, palette, pivot, key) {
  if (cache.has(key)) return cache.get(key);
  const h = rows.length, w = Math.max(...rows.map((r) => r.length));
  const s = makeSprite(w, h, pivot);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') sset(s, x, y, palette[ch] ?? palette.b); }));
  cache.set(key, s);
  return s;
}

const FRAME_ID = new Map();
for (const [name, list] of Object.entries(BOT_FRAMES)) list.forEach((fr, i) => FRAME_ID.set(fr, `${name}${i}`));

/** 프레임 기준점: 발밑 = 맨 아래 줄, 가로 = 불투명 픽셀 무게중심 */
const anchorCache = new Map();
function anchorOf(rows) {
  if (anchorCache.has(rows)) return anchorCache.get(rows);
  let sx = 0, n = 0;
  rows.forEach((r) => [...r].forEach((ch, x) => { if (ch !== '.') { sx += x; n++; } }));
  const a = [Math.round(sx / n), rows.length - 1];
  anchorCache.set(rows, a);
  return a;
}

function paletteFor(team, tint) {
  if (!tint) return { pal: BOT_PALETTES[team] ?? BOT_PALETTES[0], key: `t${team}` };
  const p = {};
  for (const k of '#dmblw') p[k] = tint;
  return { pal: p, key: `tint${tint}` };
}

/** 로컬(오른쪽을 보는 기준, y 아래 +) 좌표 → 화면 */
function toScreen(ax, ay, facing, lx, ly) { return [ax + facing * lx, ay + ly]; }

/** 회전된 스프라이트 그리기 (좌우 반전 포함). angle: 로컬(오른쪽 기준) 화면 회전, 시계 방향 + */
function drawPart(ctx, sprite, sx, sy, angle, facing) {
  if (facing > 0) blit(ctx, sprite, sx, sy, angle, false);
  else blit(ctx, sprite, sx, sy, Math.PI - angle, true);
}

function rot([x, y], a) { const c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; }

// -----------------------------------------------------------------------------
// 포즈 부드럽게: 상태가 바뀔 때(대기 ↔ 가드 ↔ 피격 ↔ 공격) 손·무기·몸을 몇 프레임에 걸쳐 따라가게 한다.
// 공격 중에는 모션 자체가 곡선이므로 거의 그대로, 피격은 빠르게(충격감), 그 외는 부드럽게.
// -----------------------------------------------------------------------------
const smoothState = new WeakMap();
const angLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
function followRate(f) {
  switch (f.state) {
    case S.ATTACK: case S.SPECIAL: case S.ULTIMATE: return 0.75;
    case S.HITSTUN: case S.PARRIED: case S.GUARD_BREAK: case S.KNOCKBACK: return 0.6;
    case S.KO: return 1;
    default: return 0.32;
  }
}
function smoothPose(f, frame, pose, wAngle) {
  let st = smoothState.get(f);
  const target = { a: wAngle, h: pose.hand, h2: pose.hand2, lean: pose.lean, crouch: pose.crouch };
  if (!st || frame - st.frame > 3 || frame < st.frame) {
    st = { frame, ...target, h: [...target.h], h2: [...target.h2] };
    smoothState.set(f, st);
    return st;
  }
  // 같은 프레임에 여러 번 그려도(일시정지 등) 한 번만 진행
  for (let n = st.frame; n < frame; n++) {
    const k = followRate(f);
    st.a = angLerp(st.a, target.a, k);
    st.h = [lerp(st.h[0], target.h[0], k), lerp(st.h[1], target.h[1], k)];
    st.h2 = [lerp(st.h2[0], target.h2[0], k), lerp(st.h2[1], target.h2[1], k)];
    st.lean = lerp(st.lean, target.lean, k);
    st.crouch = lerp(st.crouch, target.crouch, k);
  }
  st.frame = frame;
  return st;
}
const lerp = (a, b, t) => a + (b - a) * t;

/** 상태 → 시트 프레임 (없으면 null = 리그 사용) */
function sheetFrame(f, frame) {
  switch (f.state) {
    case S.IDLE: return BOT_FRAMES.idle[Math.floor(frame / 14) % 4];
    case S.WALK: {
      const back = Math.sign(f.vx) === -f.facing;
      let i = Math.floor(Math.abs(f.x) / 9) % 6;
      if (back) i = 5 - i;
      return BOT_FRAMES.walk[i];
    }
    case S.DASH:
      if (f.dash && f.dash.dir !== f.facing) return null; // 뒤 대시는 리그(뒤로 젖힌 자세)
      return BOT_FRAMES.dash[Math.min(3, Math.floor((f.dash?.frame ?? 0) / 3))];
    case S.JUMP: return f.vy > 2 ? BOT_FRAMES.run[1] : BOT_FRAMES.run[4];
    default: return null;
  }
}

/**
 * 캐릭터 그리기
 * @param pal {team, weapon, ...}  team: 0|1
 * @returns {hand:[x,y], wAngle, pose}
 */
export function drawBot(ctx, f, ax, ay, pal, frame, opts = {}) {
  const pose = computePose(f, frame);
  const facing = f.facing;
  const team = pal.team ?? f.id ?? 0;
  const tint = opts.tint;
  const { pal: P, key } = paletteFor(team, tint);
  ax = Math.round(ax); ay = Math.round(ay);
  const weaponId = f.weapon.id;
  const showWeapon = !opts.silhouette;

  // --- 1) 시트 프레임 그대로 ------------------------------------------------
  const fr = sheetFrame(f, frame);
  if (fr) {
    const a = anchorOf(fr.rows);
    const spr = toSprite(fr.rows, P, a, `${key}|${FRAME_ID.get(fr)}`);
    // 무기는 몸 뒤에 겹치지 않게 앞주먹에서
    const fist = fr.fist ?? [a[0] + 6, a[1] - 15];
    const hand = toScreen(ax, ay, facing, fist[0] - a[0], fist[1] - a[1]);
    let wAngle = STANCE[weaponId]?.a ?? 0.8;
    if (f.state === S.DASH || f.state === S.JUMP) wAngle = 0.2;
    if (opts.smooth !== false) wAngle = smoothPose(f, frame, pose, wAngle).a;
    drawPart(ctx, spr, ax, ay, 0, facing);
    if (showWeapon) {
      if (weaponId === 'knuckle') drawFist(ctx, pal.weapon, hand[0], hand[1], facing);
      else drawWeapon(ctx, weaponId, pal.weapon, hand[0], hand[1], wAngle, facing);
    }
    return { hand, wAngle, pose };
  }

  // --- 2) 컷아웃 리그 --------------------------------------------------------
  // 몸통은 회전하지 않는다(도트가 찢어짐). 대신 허리 위 줄을 높이에 비례해 밀어서 기울이고,
  // 웅크리면 상체를 내리고 다리 줄을 눌러 줄인다 → 발은 항상 땅에 붙어 있다.
  if (opts.smooth !== false) {
    const sm = smoothPose(f, frame, pose, pose.wAngle);
    // 양손 무기: 뒷손이 자루를 잡고 있던 자세면 부드럽게 한 뒤에도 자루 위에 붙인다
    const onGrip = GRIP[weaponId] && (() => { const g = backHand(weaponId, { a: pose.wAngle, h: pose.hand }); return Math.hypot(g[0] - pose.hand2[0], g[1] - pose.hand2[1]) < 1; })();
    pose.wAngle = sm.a; pose.hand = sm.h; pose.lean = sm.lean; pose.crouch = sm.crouch;
    pose.hand2 = onGrip ? backHand(weaponId, { a: sm.a, h: sm.h }) : sm.h2;
  }
  const R = BOT_RIG;
  const foot = R.foot, hip = R.hip;
  const ko = f.state === S.KO;
  const lean = Math.max(-0.5, Math.min(0.5, pose.lean));
  const tanL = Math.tan(lean);
  const drop = Math.max(0, Math.min(8, Math.round(pose.crouch / PX)));
  const footY = foot[1];
  /** 리그 원본 좌표 → 로컬(발밑 기준, 오른쪽 +, 아래 +) */
  const warp = (x, y) => {
    if (y < hip[1]) return [x - foot[0] + Math.round((hip[1] - y) * tanL), y - footY + drop];
    const k = (y - hip[1]) / Math.max(1, footY - hip[1]);
    return [x - foot[0], y - footY + Math.round(drop * (1 - k))];
  };

  const coreSpr = toSprite(R.core, P, hip, `${key}|core`);
  if (ko) {
    drawPart(ctx, coreSpr, ax - facing * 6, ay - 4, -Math.PI / 2, facing);
  } else {
    // 픽셀 단위로 직접 그림 (재샘플링 없음)
    for (let y = 0; y < coreSpr.h; y++) for (let x = 0; x < coreSpr.w; x++) {
      const c = coreSpr.px[y * coreSpr.w + x];
      if (!c) continue;
      const [lx, ly] = warp(x, y);
      ctx.fillStyle = c;
      ctx.fillRect(ax + facing * lx - (facing < 0 ? 0 : 0), ay + ly, 1, 1);
    }
  }

  const armTarget = (h) => {
    // pose 의 손 위치(월드, 위 +, 어깨 높이 96 기준) → 로컬 방향 각도 (y 아래 +)
    const vx = h[0], vy = -(h[1] - 96);
    return Math.atan2(vy + 2, vx + 1);
  };
  const shoulderAt = (sh) => (ko ? [-6, -4 - (sh[0] - foot[0]) * 0] : warp(sh[0], sh[1]));
  const armSprite = (part, sh) => toSprite(R[part], P, sh, `${key}|${part}`);
  /** 팔 회전 후 손 위치 계산 */
  const armHand = (sh, hd, target) => {
    const base = Math.atan2(hd[1] - sh[1], hd[0] - sh[0]);
    const delta = target - base;
    const sL = shoulderAt(sh);
    const v = rot([hd[0] - sh[0], hd[1] - sh[1]], delta);
    return { delta, sL, hand: toScreen(ax, ay, facing, sL[0] + v[0], sL[1] + v[1]) };
  };

  const back = armHand(R.backShoulder, R.backHand, armTarget(pose.hand2));
  const front = armHand(R.frontShoulder, R.frontHand, armTarget(pose.hand));
  // 뒷팔은 몸 뒤: 몸통보다 먼저 그려야 하지만 몸통을 이미 그렸으므로, 어두운 팔레트 그대로 덮지 않게 몸통 바깥만 보이도록 순서를 유지
  const backS = toScreen(ax, ay, facing, back.sL[0], back.sL[1]);
  const frontS = toScreen(ax, ay, facing, front.sL[0], front.sL[1]);
  return finishRig();

  function finishRig() {
    // 뒷팔
    drawPart(ctx, armSprite('back', R.backShoulder), backS[0], backS[1], back.delta, facing);
    const wAngle = pose.wAngle + (ko ? Math.PI / 2 : 0);
    if (showWeapon && weaponId !== 'knuckle') drawWeapon(ctx, weaponId, pal.weapon, front.hand[0], front.hand[1], wAngle, facing);
    drawPart(ctx, armSprite('front', R.frontShoulder), frontS[0], frontS[1], front.delta, facing);
    if (showWeapon && weaponId === 'knuckle') {
      drawFist(ctx, pal.weapon, front.hand[0], front.hand[1], facing);
      drawFist(ctx, pal.weapon, back.hand[0], back.hand[1], facing);
    }
    return { hand: front.hand, wAngle, pose };
  }
}
