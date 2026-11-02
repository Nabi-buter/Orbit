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
    '우상단 베기': { beats: [{ from: P(-1.25, 24, 60, { lean: 0.3, crouch: 8, stride: 12 }), to: P(2.0, 12, 110, { lean: -0.08, stride: 6 }) }] },
    '대검 내려찍기': { beats: [{ from: P(3.0, -6, 114, { lean: -0.28, crouch: -4 }), to: P(-1.3, 34, 56, { lean: 0.42, stride: 20, crouch: 16 }) }] },
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
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t));

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

/** 공격 진행 프레임에 맞는 포즈 (모션 데이터가 없으면 null) */
export function evalMotion(weaponId, def, frame) {
  const m = MOTIONS[weaponId]?.[def.name];
  if (!m) return null;
  const idle = { ...STANCE[weaponId], lean: 0, stride: 0, crouch: 0 };
  const hits = def.hits, beats = m.beats;
  const beat = (i) => beats[Math.min(i, beats.length - 1)];
  const f0 = hits[0].from - 1;
  if (frame < f0) return mix(idle, beat(0).from, easeInOut(Math.max(0, frame / Math.max(1, f0))));
  let prevEnd = f0;
  for (let i = 0; i < hits.length; i++) {
    const s0 = hits[i].from - 1, s1 = hits[i].to + 2;
    if (frame < s0) return mix(beat(i - 1).to, beat(i).from, easeInOut((frame - prevEnd) / Math.max(1, s0 - prevEnd)));
    if (frame <= s1) return mix(beat(i).from, beat(i).to, easeOut(Math.min(1, ((frame - s0) / Math.max(1, s1 - s0)) * 1.3)));
    prevEnd = s1;
  }
  // 후딜레이: 마지막 자세를 잠시 유지한 뒤 기본 자세로
  const t = (frame - prevEnd) / Math.max(1, def.duration - prevEnd);
  return mix(beat(hits.length - 1).to, idle, easeInOut(Math.max(0, (t - 0.3) / 0.7)));
}

/** 뒷손 위치: 지정값 > 양손 무기 자루 > 몸 옆 */
export function backHand(weaponId, pose) {
  if (pose.h2) return pose.h2;
  const g = GRIP[weaponId];
  if (g) return [pose.h[0] - Math.cos(pose.a) * g, pose.h[1] - Math.sin(pose.a) * g];
  return [pose.h[0] - 12, pose.h[1] - 6];
}
