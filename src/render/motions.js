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
  rapier: { a: 0.22, h: [24, 88], h2: [-14, 116] }, // 펜싱 자세: 팔을 뻗어 칼끝으로 겨누고, 빈손은 뒤로 들어 균형
  greatsword: { a: 1.95, h: [8, 92] },             // 어깨에 둘러멘 자세
  dagger: { a: -0.35, h: [22, 78] },               // 낮게 앞으로
  axe: { a: 2.25, h: [6, 94] },                    // 어깨에 올린 자세
  spear: { a: 0.12, h: [18, 80] },                 // 창끝을 상대에게 겨눔
  knuckle: { a: 0, h: [20, 94], h2: [12, 90] },    // 주먹을 올린 가드
};

/**
 * 가드 자세: 무기마다 막는 방법이 다르다.
 *   장검  칼을 세워 비스듬히 앞으로 (칼등으로 받음)
 *   대검  넓은 칼면을 몸 앞에 세워 방패처럼
 *   단검  역수로 쥐고 팔뚝을 얼굴 앞에 대각선으로
 *   도끼  양손으로 자루를 가로로 들어 올려 받음
 *   창    자루를 대각선으로 세워 몸 앞을 가림
 *   너클  두 주먹을 얼굴 앞에 붙인 하이 가드
 * recoil: 막았을 때 밀리는 방향(손 x 이동, 각도 변화) — 무거운 무기일수록 덜 밀린다
 */
export const GUARD_POSE = {
  // support: 뒷손이 무기 위 어디를 잡는지 (앞손에서 칼끝 쪽 + / 자루 끝 쪽 -, 아트 px). 없으면 평소 양손 그립
  longsword: { a: 1.15, h: [22, 94], recoil: { dx: -6, da: 0.25 } },                    // 양손으로 칼을 비스듬히 세워 받음
  rapier: { a: 1.2, h: [24, 92], h2: [-12, 112], recoil: { dx: -8, da: 0.4 } },          // 손목을 돌려 칼을 세우고 칼 밑동(손잡이 쪽)으로 받아 흘림 — 가벼워 크게 밀림
  greatsword: { a: 1.6, h: [16, 82], support: 12, recoil: { dx: -3, da: 0.08 } },      // 칼을 세우고 뒷손 손바닥으로 칼면을 받쳐 방패처럼
  dagger: { a: 2.45, h: [20, 102], h2: [12, 98], recoil: { dx: -7, da: 0.35 } },       // 역수로 쥔 팔뚝을 얼굴 앞에, 빈손은 턱 옆
  axe: { a: 1.15, h: [18, 86], support: 8, recoil: { dx: -4, da: -0.15 } },           // 자루를 얼굴 앞에 비스듬히 세우고 두 손을 벌려 자루로 받음
  spear: { a: 1.3, h: [22, 104], support: -13, recoil: { dx: -5, da: 0.2 } },          // 자루를 대각선으로 세우고 두 손을 멀리 벌려 몸 앞을 가림
  knuckle: { a: 0, h: [20, 106], h2: [24, 98], recoil: { dx: -6, da: 0 } },            // 두 주먹을 얼굴 앞에 붙인 하이 가드
};

/** 완벽패링: 막는 순간 무기를 바깥으로 쳐내는 동작 (프레임 0~DEFLECT) */
export const DEFLECT_FRAMES = 12;

/** 양손 무기: 뒷손이 자루를 잡는 거리 */
export const GRIP = { greatsword: 9, axe: 13, spear: 26 };

const P = (a, hx, hy, extra = {}) => ({ a, h: [hx, hy], ...extra });
/** 레이피어: 빈손을 뒤로 든 채 (h2 생략 시 기본 위치) */
const R = (a, hx, hy, extra = {}, h2 = [-14, 116]) => ({ a, h: [hx, hy], h2, ...extra });

export const MOTIONS = {
  longsword: {
    '베기': { beats: [{ from: P(2.0, 2, 100, { lean: -0.1 }), to: P(-0.75, 32, 72, { lean: 0.22, stride: 14 }) }] },
    '되베기': { beats: [{ from: P(-1.5, 12, 70, { lean: 0.1, stride: 4 }), to: P(1.7, 20, 106, { lean: 0.05, stride: 12 }) }] },
    '찔러 마무리': { beats: [{ from: P(0.3, -14, 90, { lean: -0.15 }), to: P(0, 48, 86, { lean: 0.32, stride: 22 }) }] },
    '내려베기': { beats: [{ from: P(2.65, -2, 110, { lean: -0.18, crouch: -3 }), to: P(-1.05, 32, 64, { lean: 0.32, stride: 16, crouch: 8 }) }] },
    '올려베기': { beats: [{ from: P(-1.55, 10, 60, { lean: 0.15, crouch: 10 }), to: P(2.25, 18, 110, { lean: -0.05, stride: 8, crouch: -2 }) }] },
  },
  rapier: {
    // 한손 펜싱: 앞발을 내디디며 팔을 곧게 뻗어 찌른다. 빈손(h2)은 뒤로 들어 균형을 잡음
    '찌르기': { beats: [{ from: R(0.16, 10, 90), to: R(0.02, 40, 88, { lean: 0.26, stride: 20 }, [-18, 112]) }] },
    '재찌르기': { beats: [{ from: R(0.3, 16, 98, { lean: 0.08, stride: 8 }), to: R(0.14, 42, 98, { lean: 0.26, stride: 20 }, [-18, 112]) }] },
    '런지': { beats: [{ from: R(0.06, 2, 86, { crouch: 4, lean: -0.05 }), to: R(-0.03, 54, 80, { lean: 0.46, stride: 32, crouch: 12 }, [-22, 92]) }] },
    // 플레시: 뒷발로 박차고 달려들며 한 줄로 찌름
    '플레시': { beats: [{ from: R(0.1, -6, 88, { lean: -0.12 }), to: R(-0.04, 56, 84, { lean: 0.52, stride: 30 }, [-20, 96]) }] },
    // 손목을 돌려 아래에서 위로 베어 올림 (가벼운 날이라 빠르게 휙)
    '베어 올리기': { beats: [{ from: R(-1.2, 14, 66, { lean: 0.12, crouch: 8 }), to: R(1.55, 24, 108, { lean: 0.04, stride: 10 }) }] },
  },
  greatsword: {
    '좌상단 베기': { beats: [{ from: P(2.6, -8, 106, { lean: -0.15 }), to: P(-0.95, 34, 64, { lean: 0.3, stride: 18, crouch: 6 }) }] },
    '횡베기': { beats: [{ from: P(1.1, -14, 92, { lean: -0.22 }), to: P(-0.15, 40, 82, { lean: 0.34, stride: 18 }) }] },
    '우상단 베기': { beats: [{ from: P(-1.6, 8, 62, { lean: 0.15, crouch: 8, stride: 4 }), to: P(2.0, 12, 110, { lean: -0.08, stride: 6 }) }] },
    '대검 내려찍기': { beats: [{ from: P(3.0, -6, 114, { lean: -0.28, crouch: -4 }), to: P(-1.3, 34, 56, { lean: 0.42, stride: 20, crouch: 16 }) }] },
    '대검 올려베기': { beats: [{ from: P(-1.65, 6, 58, { lean: 0.2, crouch: 14, stride: 6 }), to: P(2.3, 10, 116, { lean: -0.12, stride: 8, crouch: -4 }) }] },
  },
  dagger: {
    '찌르기': { beats: [{ from: P(-0.1, 4, 80), to: P(-0.05, 30, 84, { lean: 0.2, stride: 10 }) }] },
    '가르기': { beats: [{ from: P(1.4, 16, 98, { lean: 0.05 }), to: P(-1.05, 34, 70, { lean: 0.22, stride: 12 }) }] },
    '깊게 찌르기': { beats: [{ from: P(0, -4, 78, { crouch: 6, lean: -0.05 }), to: P(0.08, 36, 88, { lean: 0.3, stride: 14 }) }] },
    '이연 찌르기': {
      beats: [
        { from: P(0, 4, 80), to: P(0, 30, 84, { lean: 0.2, stride: 10 }) },
        { from: P(0.2, 10, 88, { lean: 0.1, stride: 8 }), to: P(-0.15, 36, 80, { lean: 0.3, stride: 14 }) },
      ],
    },
    '돌려 베기': { beats: [{ from: P(2.5, -10, 96, { lean: -0.2 }), to: P(-0.65, 40, 76, { lean: 0.32, stride: 18 }) }] },
  },
  axe: {
    '내려찍기': { beats: [{ from: P(2.35, 0, 108, { lean: -0.12 }), to: P(-0.95, 30, 66, { lean: 0.26, stride: 12, crouch: 6 }) }] },
    '올려치기': { beats: [{ from: P(-1.6, 10, 64, { lean: 0.12, crouch: 8, stride: 4 }), to: P(1.9, 16, 108, { lean: 0.02, stride: 10 }) }] },
    '옆치기': { beats: [{ from: P(1.45, -20, 96, { lean: -0.25 }), to: P(0.05, 38, 84, { lean: 0.3, stride: 16 }) }] },
    '도끼 찍기': { beats: [{ from: P(3.05, -6, 116, { lean: -0.28, crouch: -3 }), to: P(-1.25, 30, 56, { lean: 0.42, stride: 16, crouch: 14 }) }] },
    '휘둘러 찍기': { beats: [{ from: P(1.3, -18, 84, { lean: -0.2, crouch: 4 }), to: P(-0.55, 42, 70, { lean: 0.36, stride: 18 }) }] },
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
// 궁극기 모션 (판정 하나당 beat 하나, src/core/ultimates.js 와 짝)
// -----------------------------------------------------------------------------
const alt = (n, even, odd) => Array.from({ length: n }, (_, i) => (i % 2 ? odd : even));
Object.assign(MOTIONS.longsword, {
  // X 자: 오른쪽 위 → 왼쪽 아래, 이어서 왼쪽 아래 → 오른쪽 위로 크게
  '십자 베기': { beats: [
    { from: P(2.3, 4, 108, { lean: -0.1 }), to: P(-0.9, 36, 66, { lean: 0.3, stride: 16, crouch: 4 }) },
    { from: P(-1.25, 30, 58, { lean: 0.28, crouch: 8, stride: 16 }), to: P(2.0, 30, 116, { lean: 0.12, stride: 20, crouch: -4 }) },
  ] },
});
Object.assign(MOTIONS.rapier, {
  // 섬광 연격: 높이를 바꿔 가며 눈에 안 보일 만큼 빠르게 다섯 번 찌르고, 마지막에 깊게 런지
  '섬광 연격': { beats: [
    ...[96, 84, 102, 78, 92].map((y, i) => ({ from: R(0.1, 14, y + 2, { lean: 0.15, stride: 12 }), to: R(i % 2 ? -0.06 : 0.08, 48, y, { lean: 0.3, stride: 20 }, [-18, 112]) })),
    { from: R(0.06, 0, 86, { crouch: 6, lean: -0.05 }), to: R(-0.02, 60, 82, { lean: 0.55, stride: 34, crouch: 12 }, [-24, 90]) },
  ] },
});
Object.assign(MOTIONS.greatsword, {
  // 손잡이로 짧게 쳐 붙잡고 → 머리 위 끝까지 들어 올렸다가 바닥까지 내려찍기
  '대지 가르기': { beats: [
    { from: P(0.4, 8, 86), to: P(0.1, 32, 84, { lean: 0.22, stride: 10 }) },
    { from: P(3.0, -8, 120, { lean: -0.32, crouch: -4 }), to: P(-1.45, 34, 50, { lean: 0.5, stride: 24, crouch: 20 }) },
  ] },
});
Object.assign(MOTIONS.dagger, {
  // 좌우로 번갈아 베다가 마지막에 몸을 던져 깊게 찌름
  '그림자 난도': { beats: [
    ...alt(5,
      { from: P(1.1, 18, 98, { lean: 0.15 }), to: P(-0.9, 42, 74, { lean: 0.32, stride: 18 }) },
      { from: P(-0.9, 22, 70, { lean: 0.2, crouch: 4 }), to: P(1.0, 44, 100, { lean: 0.3, stride: 18 }) }),
    { from: P(0, 6, 84, { crouch: 8, lean: 0.05 }), to: P(0.05, 56, 86, { lean: 0.5, stride: 28 }) },
  ] },
});
Object.assign(MOTIONS.axe, {
  // 자루로 받아치고 → 뛰어올라 머리 위에서 두 손으로 내려찍기
  '도약 쪼개기': { beats: [
    { from: P(0.7, 12, 92), to: P(-0.2, 36, 80, { lean: 0.22, stride: 10 }) },
    { from: P(3.1, -4, 124, { lean: -0.3, crouch: -8, stride: 10 }), to: P(-1.35, 32, 50, { lean: 0.52, stride: 22, crouch: 20 }) },
  ] },
});
Object.assign(MOTIONS.spear, {
  // 뒤로 크게 당겼다가 온몸을 실어 한 줄로 꿰뚫기
  '관통': { beats: [
    { from: P(0.05, -16, 82, { crouch: 8, lean: -0.18 }), to: P(0, 58, 86, { lean: 0.52, stride: 32 }) },
  ] },
});
Object.assign(MOTIONS.knuckle, {
  // 양손 번갈아 몰아치기 8번 → 낮게 숙였다가 어퍼컷
  '폭풍 연타': { beats: [
    ...alt(8,
      { from: P(0, 16, 92, { h2: [10, 88] }), to: P(0, 48, 94, { h2: [10, 88], lean: 0.25, stride: 14 }) },
      { from: P(0, 16, 92, { h2: [12, 90] }), to: P(0, 16, 90, { h2: [48, 96], lean: 0.25, stride: 14 }) }),
    { from: P(0, 14, 60, { h2: [10, 88], crouch: 16, lean: 0.12 }), to: P(0, 30, 130, { h2: [8, 86], crouch: -6, lean: -0.05, stride: 10 }) },
  ] },
});

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
export const WEIGHT = { knuckle: 0.1, dagger: 0.2, rapier: 0.25, spear: 0.45, longsword: 0.5, axe: 0.8, greatsword: 1 };

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
function extend(p, q, k, handMax = 6) {
  const r = mix(p, q, 1 + k);
  r.h2 = q.h2; // 뒷손은 과장하지 않음
  // 큰 궤적(머리 위 → 아래)은 비율만큼 더하면 과해지므로 각도·손 이동량에 상한
  const da = r.a - q.a, maxA = 0.4;
  if (Math.abs(da) > maxA) r.a = q.a + Math.sign(da) * maxA;
  for (const i of [0, 1]) {
    const dh = r.h[i] - q.h[i];
    if (Math.abs(dh) > handMax) r.h[i] = q.h[i] + Math.sign(dh) * handMax;
  }
  // 따라가기에서 손이 판정 끝보다 더 앞으로 나가지 않게 (무기가 판정보다 멀리 보이면 '닿았는데 안 맞음')
  if (handMax < 6) r.h[0] = Math.min(r.h[0], q.h[0]);
  r.stride = Math.min(r.stride ?? 0, q.stride ?? 0);
  return r;
}

/**
 * 공격 진행 프레임에 맞는 포즈 (모션 데이터가 없으면 null)
 * start: 이 공격을 시작한 자세 (콤보로 이어질 때 앞 공격이 끝난 자세 — 기본 자세로 되돌아갔다 다시 휘두르지 않게).
 *        준비 동작에만 쓰이므로 판정 프레임은 그대로다.
 */
export function evalMotion(weaponId, def, frame, start = null) {
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
    if (t < 0.7) return mix(start ?? idle, first, smooth(t / 0.7));
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
    const over = extend(b.from, b.to, overK, 2);
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
