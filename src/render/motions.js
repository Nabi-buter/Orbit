// =============================================================================
// 무기별 공격 모션 (키프레임 데이터)
// -----------------------------------------------------------------------------
// 이 파일만 고치면 모션을 바꿀 수 있다. 판정/수치(weapons.js)와 완전히 분리되어 있다.
//
// 좌표계: 캐릭터 발밑 기준 로컬 좌표(월드 px), 바라보는 방향 +x, 위쪽 +y. 어깨 높이 ≈ 96.
// 포즈 필드:
//   a      무기 각도(라디안). 0 = 정면 수평, +π/2 = 위, -π/2 = 아래, π = 뒤
//   h      앞손(무기 쥔 손) 위치 [x, y]
//   h2     뒷손 위치 (생략하면 양손 무기는 자루 위 GRIP 거리, 한손 무기는 몸 옆)
//   lean   상체 기울기(+ 앞으로), stride 보폭, crouch 웅크림(+ 낮게)
//
// 공격 하나 = beats 배열. 판정(hits) 하나마다 beat 하나 {from, to}:
//   준비 동작: 기본 자세 → beats[0].from
//   판정 구간: beat.from → beat.to (빠르게, 휘두르는 방향 = 각도 a 가 바뀌는 방향)
//   판정 사이: 이전 beat.to → 다음 beat.from
//   후딜레이: 마지막 beat.to 에서 잠시 멈췄다가 기본 자세로 복귀
// 키는 콤보 단계 이름(weapons.js 의 FIRST_NAMES / lightSteps / heavySteps 의 name).
// =============================================================================

/** 기본(대기) 자세: 무기마다 다르게 든다 */
export const STANCE = {
  longsword: { a: 0.9, h: [18, 84] },              // 중단 자세
  greatsword: { a: 1.95, h: [8, 92] },             // 어깨에 둘러멘 자세
  dagger: { a: -0.35, h: [22, 78] },               // 낮게 앞으로
  axe: { a: 2.25, h: [6, 94] },                    // 어깨에 올린 자세
  spear: { a: 0.12, h: [18, 80] },                 // 창끝을 상대에게 겨눔
  knuckle: { a: 0, h: [20, 94], h2: [12, 90] },    // 주먹을 올린 가드
};

/** 양손 무기: 뒷손이 자루를 잡는 거리 */
export const GRIP = { greatsword: 9, axe: 13, spear: 26 };

const P = (a, hx, hy, extra = {}) => ({ a, h: [hx, hy], ...extra });

export const MOTIONS = {
  longsword: {
    '베기': { beats: [{ from: P(2.0, 2, 100, { lean: -0.1 }), to: P(-0.75, 32, 72, { lean: 0.22, stride: 14 }) }] },
    '되베기': { beats: [{ from: P(-0.9, 28, 68, { lean: 0.15, stride: 8 }), to: P(1.7, 20, 106, { lean: 0.05, stride: 12 }) }] },
    '찔러 마무리': { beats: [{ from: P(0.05, -2, 86, { lean: -0.12 }), to: P(0, 48, 86, { lean: 0.32, stride: 22 }) }] },
    '내려베기': { beats: [{ from: P(2.65, -2, 110, { lean: -0.18, crouch: -3 }), to: P(-1.05, 32, 64, { lean: 0.32, stride: 16, crouch: 8 }) }] },
    '올려베기': { beats: [{ from: P(-1.35, 26, 58, { lean: 0.22, crouch: 10 }), to: P(2.25, 18, 110, { lean: -0.05, stride: 8, crouch: -2 }) }] },
  },
  greatsword: {
    '좌상단 베기': { beats: [{ from: P(2.6, -8, 106, { lean: -0.15 }), to: P(-0.95, 34, 64, { lean: 0.3, stride: 18, crouch: 6 }) }] },
    '횡베기': { beats: [{ from: P(1.1, -14, 92, { lean: -0.22 }), to: P(-0.15, 40, 82, { lean: 0.34, stride: 18 }) }] },
    '우상단 베기': { beats: [{ from: P(-1.25, 24, 60, { lean: 0.3, crouch: 8, stride: 12 }), to: P(2.0, 12, 110, { lean: -0.08, stride: 6 }) }] },
    '대검 내려찍기': { beats: [{ from: P(3.0, -6, 114, { lean: -0.28, crouch: -4 }), to: P(-1.3, 34, 56, { lean: 0.42, stride: 20, crouch: 16 }) }] },
    '대검 올려베기': { beats: [{ from: P(-1.35, 30, 54, { lean: 0.4, crouch: 16, stride: 18 }), to: P(2.3, 10, 116, { lean: -0.12, stride: 8, crouch: -4 }) }] },
  },
  dagger: {
    '찌르기': { beats: [{ from: P(-0.1, 6, 80), to: P(-0.05, 44, 84, { lean: 0.25, stride: 16 }) }] },
    '가르기': { beats: [{ from: P(1.4, 16, 98, { lean: 0.05 }), to: P(-1.05, 34, 70, { lean: 0.22, stride: 12 }) }] },
    '깊게 찌르기': { beats: [{ from: P(0, -4, 78, { crouch: 6, lean: -0.05 }), to: P(0.08, 52, 88, { lean: 0.38, stride: 24 }) }] },
    '이연 찌르기': {
      beats: [
        { from: P(0, 4, 80), to: P(0, 44, 84, { lean: 0.25, stride: 16 }) },
        { from: P(0.2, 12, 88, { lean: 0.1, stride: 10 }), to: P(-0.15, 50, 80, { lean: 0.36, stride: 22 }) },
      ],
    },
    '돌려 베기': { beats: [{ from: P(2.5, -10, 96, { lean: -0.2 }), to: P(-0.65, 40, 76, { lean: 0.32, stride: 18 }) }] },
  },
  axe: {
    '내려찍기': { beats: [{ from: P(2.35, 0, 108, { lean: -0.12 }), to: P(-0.95, 30, 66, { lean: 0.26, stride: 12, crouch: 6 }) }] },
    '올려치기': { beats: [{ from: P(-1.0, 28, 62, { lean: 0.22, crouch: 8, stride: 10 }), to: P(1.9, 16, 108, { lean: 0.02, stride: 10 }) }] },
    '옆치기': { beats: [{ from: P(0.95, -18, 88, { lean: -0.25 }), to: P(0.05, 38, 84, { lean: 0.3, stride: 16 }) }] },
    '도끼 찍기': { beats: [{ from: P(3.05, -6, 116, { lean: -0.28, crouch: -3 }), to: P(-1.25, 30, 56, { lean: 0.42, stride: 16, crouch: 14 }) }] },
    '휘둘러 찍기': { beats: [{ from: P(0.4, -20, 74, { lean: -0.2, crouch: 4 }), to: P(-0.55, 42, 70, { lean: 0.36, stride: 18 }) }] },
  },
  spear: {
    '찌르기': { beats: [{ from: P(0.05, -4, 84, { lean: -0.08 }), to: P(0, 44, 84, { lean: 0.26, stride: 18 }) }] },
    '재찌르기': { beats: [{ from: P(0.18, 0, 92, { lean: 0.02 }), to: P(0.1, 46, 94, { lean: 0.26, stride: 18 }) }] },
    '밀어 찌르기': { beats: [{ from: P(-0.05, -12, 80, { crouch: 5, lean: -0.1 }), to: P(0, 50, 82, { lean: 0.42, stride: 26 }) }] },
    '휘두르기': { beats: [{ from: P(1.45, -6, 100, { lean: -0.12 }), to: P(-0.3, 36, 74, { lean: 0.3, stride: 14 }) }] },
    '회전 베기': { beats: [{ from: P(2.7, -14, 104, { lean: -0.2 }), to: P(-0.6, 40, 78, { lean: 0.36, stride: 18 }) }] },
  },
  knuckle: {
    // 너클: h = 앞 주먹, h2 = 뒷 주먹
    '잽': { beats: [{ from: P(0, 18, 92, { h2: [10, 88] }), to: P(0, 48, 92, { h2: [10, 88], lean: 0.15, stride: 10 }) }] },
    '훅': { beats: [{ from: P(0, 18, 92, { h2: [6, 94], lean: -0.1 }), to: P(0, 20, 92, { h2: [42, 96], lean: 0.24, stride: 12 }) }] },
    '바디 블로': { beats: [{ from: P(0, 16, 90, { h2: [8, 84], crouch: 6 }), to: P(0, 46, 66, { h2: [10, 86], lean: 0.3, stride: 14, crouch: 12 }) }] },
    '어퍼컷': { beats: [{ from: P(0, 14, 62, { h2: [10, 88], crouch: 14, lean: 0.1 }), to: P(0, 30, 122, { h2: [8, 86], crouch: -6, lean: -0.05, stride: 8 }) }] },
    '돌진 연타': {
      beats: [
        { from: P(0, 20, 92, { h2: [10, 88] }), to: P(0, 46, 92, { h2: [10, 88], lean: 0.2, stride: 12 }) },
        { from: P(0, 16, 90, { h2: [12, 90] }), to: P(0, 16, 90, { h2: [46, 92], lean: 0.22, stride: 14 }) },
        { from: P(0, 12, 86, { h2: [10, 88], lean: 0.05 }), to: P(0, 52, 90, { h2: [8, 88], lean: 0.34, stride: 20 }) },
      ],
    },
    '러시': {
      beats: [
        { from: P(0, 16, 92, { h2: [12, 88] }), to: P(0, 16, 92, { h2: [46, 90], lean: 0.2, stride: 12 }) },
        { from: P(0, 18, 92, { h2: [12, 88] }), to: P(0, 48, 94, { h2: [10, 88], lean: 0.22, stride: 14 }) },
        { from: P(0, 12, 84, { h2: [10, 90], crouch: 8 }), to: P(0, 44, 70, { h2: [10, 88], lean: 0.3, stride: 16, crouch: 10 }) },
      ],
    },
    '스트레이트': { beats: [{ from: P(0, 8, 90, { h2: [6, 92], lean: -0.15 }), to: P(0, 56, 90, { h2: [8, 88], lean: 0.38, stride: 24 }) }] },
  },
};

// -----------------------------------------------------------------------------
// 키프레임 평가
// -----------------------------------------------------------------------------
// 실제 무기처럼 보이도록:
//   1) 준비: 기본 자세 → 시작 자세까지 들어 올린 뒤, 무게만큼 더 젖혀(코일) 잠깐 버틴다
//   2) 휘두름: 판정 몇 프레임 전부터 출발해 가속하며 판정 구간을 통과
//   3) 따라가기: 판정이 끝나도 무게만큼 더 흘러간 뒤(오버슈트) 멈춘다
//   4) 회수: 무거울수록 늦게, 천천히 기본 자세로
// 판정 프레임(weapons.js)은 그대로이고, 보이는 궤적만 바뀐다.

/** 무기 무게감 0(가벼움) ~ 1(무거움) */
export const WEIGHT = { knuckle: 0.1, dagger: 0.2, spear: 0.45, longsword: 0.5, axe: 0.8, greatsword: 1 };

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const easeOutCubic = (t) => { t = clamp01(t); return 1 - (1 - t) ** 3; };
/** 휘두름: 처음엔 느리게 출발해 판정 근처에서 가장 빠름 */
const swingEase = (t) => { t = clamp01(t); return t < 0.6 ? 0.5 * (t / 0.6) ** 2 : 0.5 + 0.5 * easeOutCubic((t - 0.6) / 0.4); };

function mix(p, q, t) {
  return {
    a: lerp(p.a, q.a, t),
    h: [lerp(p.h[0], q.h[0], t), lerp(p.h[1], q.h[1], t)],
    h2: p.h2 && q.h2 ? [lerp(p.h2[0], q.h2[0], t), lerp(p.h2[1], q.h2[1], t)] : t < 0.5 ? p.h2 : q.h2,
    lean: lerp(p.lean ?? 0, q.lean ?? 0, t),
    stride: lerp(p.stride ?? 0, q.stride ?? 0, t),
    crouch: lerp(p.crouch ?? 0, q.crouch ?? 0, t),
  };
}

/** p 에서 q 방향의 반대쪽으로 k 만큼 더 (코일), 또는 같은 방향으로 더 (오버슈트) */
function extend(p, q, k) {
  const r = mix(p, q, 1 + k);
  r.h2 = q.h2; // 뒷손은 과장하지 않음
  // 큰 궤적(머리 위 → 아래)은 비율만큼 더하면 과해지므로 각도·손 이동량에 상한
  const da = r.a - q.a, maxA = 0.4;
  if (Math.abs(da) > maxA) r.a = q.a + Math.sign(da) * maxA;
  for (const i of [0, 1]) {
    const dh = r.h[i] - q.h[i];
    if (Math.abs(dh) > 6) r.h[i] = q.h[i] + Math.sign(dh) * 6;
  }
  return r;
}

/** 공격 진행 프레임에 맞는 포즈 (모션 데이터가 없으면 null) */
export function evalMotion(weaponId, def, frame) {
  const m = MOTIONS[weaponId]?.[def.name];
  if (!m) return null;
  const W = WEIGHT[weaponId] ?? 0.5;
  const idle = { ...STANCE[weaponId], lean: 0, stride: 0, crouch: 0 };
  const hits = def.hits, beats = m.beats;
  const beat = (i) => beats[Math.min(i, beats.length - 1)];
  const lead = Math.round(1 + W * 3);        // 판정 몇 프레임 전부터 휘두르기 시작
  const follow = Math.round(2 + W * 6);      // 판정 뒤 흘러가는 프레임
  const coilK = 0.06 + W * 0.12;             // 젖히는 정도
  const overK = 0.05 + W * 0.1;              // 지나치는 정도

  // 1) 준비
  const s0 = Math.max(1, hits[0].from - lead);
  if (frame < s0) {
    const t = frame / s0;
    const first = beat(0).from;
    const coil = extend(beat(0).to, first, coilK); // to → from 방향으로 더 = 뒤로 젖힘
    if (t < 0.7) return mix(idle, first, smooth(t / 0.7));
    return mix(first, coil, easeOutCubic((t - 0.7) / 0.3));
  }
  let prevEnd = s0, prevPose = extend(beat(0).to, beat(0).from, coilK);
  for (let i = 0; i < hits.length; i++) {
    const b = beat(i);
    const start = i === 0 ? s0 : Math.max(prevEnd, hits[i].from - lead);
    const contact = hits[i].to;
    const end = contact + follow;
    const nextFrom = i + 1 < hits.length ? hits[i + 1].from - lead : Infinity;
    // 판정 사이: 이전 자세 → 다음 시작 자세
    if (frame < start) return mix(prevPose, b.from, smooth((frame - prevEnd) / Math.max(1, start - prevEnd)));
    // 2) 휘두름 (시작 자세 또는 코일 → 끝 자세)
    const from = i === 0 ? prevPose : b.from;
    if (frame <= contact) return mix(from, b.to, swingEase((frame - start) / Math.max(1, contact - start)));
    // 3) 따라가기 (다단 히트는 다음 타 직전까지만)
    const over = extend(b.from, b.to, overK);
    const fEnd = Math.min(end, nextFrom);
    if (frame <= fEnd) return mix(b.to, over, easeOutCubic((frame - contact) / Math.max(1, fEnd - contact)));
    prevEnd = fEnd;
    prevPose = mix(b.to, over, easeOutCubic((fEnd - contact) / Math.max(1, end - contact)));
  }
  // 4) 회수: 무게만큼 버틴 뒤 기본 자세로
  const t = (frame - prevEnd) / Math.max(1, def.duration - prevEnd);
  const hold = 0.1 + W * 0.25;
  return mix(prevPose, idle, smooth((t - hold) / (1 - hold)));
}

/** 뒷손 위치: 지정값 > 양손 무기 자루 > 몸 옆 */
export function backHand(weaponId, pose) {
  if (pose.h2) return pose.h2;
  const g = GRIP[weaponId];
  if (g) return [pose.h[0] - Math.cos(pose.a) * g, pose.h[1] - Math.sin(pose.a) * g];
  return [pose.h[0] - 12, pose.h[1] - 6];
}
