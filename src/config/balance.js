// =============================================================================
// 전투 밸런스 설정 (한곳에서 관리)
// -----------------------------------------------------------------------------
// - 모든 시간 단위는 "프레임"(60fps 기준, 60프레임 = 1초)이다.
// - 모든 거리 단위는 px(논리 해상도 1280x720 기준)이다.
// - 주석에 [TEMP] 가 붙은 값은 아직 확정되지 않은 "임시값"이다.
//   밸런스 테스트 후 조정 대상이며, 규칙 자체가 아니라 수치만 바꾸면 된다.
// - 무기별 공격 수치는 src/config/weapons.js 에서 관리한다.
// =============================================================================

export const FPS = 60;

export const STAGE = {
  width: 1280,
  height: 720,
  groundY: 610,        // 화면상 지면 높이(렌더링용)
  leftWall: 70,        // 캐릭터 중심 x 최소값
  rightWall: 1210,     // 캐릭터 중심 x 최대값
  startDistance: 360,  // [TEMP] 라운드 시작 시 두 플레이어 거리
};

export const BALANCE = {
  // 공격 리듬 (모든 무기 공통): 예비 동작 ×windup, 후딜 ×recovery (무기별 공격 시간 배율과 곱해짐)
  // 모티브처럼 "읽히는 예비 동작 + 짧은 후딜" → 연타보다 읽기·패링 중심의 흐름
  timing: { windup: 1.45, recovery: 0.8 },   // [TEMP]

  fighter: {
    maxHp: 1200,          // [TEMP] 밸런스: 1000→1200 (경기 시간 확보, 가드/궁극기 활용 기회 증가)
    maxStamina: 100,
    maxGuard: 100,
    maxUlt: 100,
    width: 50,            // 피격 판정(허트박스) 폭
    height: 120,          // 피격 판정 높이
    walkSpeed: 4.2,       // [TEMP] 전진 속도(px/프레임)
    backWalkSpeed: 3.4,   // [TEMP] 후퇴 속도
  },

  input: {
    bufferFrames: 8,      // [TEMP] 선입력 유지 시간 (느려진 템포에 맞춰 6→8)
  },

  stamina: {
    regenDelay: 36,       // [TEMP] 마지막 소모 후 회복 시작까지
    regenPerFrame: 0.45,  // [TEMP] 초당 27 회복
  },

  dash: {
    cost: 30,             // [TEMP] 스태미나 소모
    duration: 12,         // [TEMP] 대시 지속 프레임 (무적 없음)
    speed: 12,            // [TEMP] 12 * 12 = 약 144px 이동
    cooldown: 34,         // [TEMP] 대시 시작 후 재사용 대기
    allowDoubleTap: true, // 방향키 두 번 입력으로도 대시
    doubleTapWindow: 12,  // [TEMP]
  },

  jump: {
    cost: 22,             // [TEMP] 스태미나 소모
    velocity: 15,         // [TEMP] 초기 상승 속도
    gravity: 0.8,         // [TEMP] → 최고점 약 140px, 체공 약 38프레임
    airSpeed: 4,          // [TEMP] 점프 중 수평 속도(이륙 시 방향으로 고정)
    landingLag: 6,        // [TEMP] 일반 착지 후 짧은 경직
  },

  hit: {
    // "긴 경직" 대신 짧은 경직만 사용한다. 연계 사이 틈에서 피격자가 가드/대시/
    // 빠른 공격으로 대응할 수 있도록 각 무기의 cancelFrom 과 함께 조정한다.
    airHitstunBonus: 6,   // [TEMP] 공중 피격 시 추가 경직(낙하까지)
    pushFriction: 0.72,   // 넉백 감쇠
  },

  guard: {
    // 가드 버튼을 누르고 있는 것만으로는 게이지가 소모되지 않는다.
    normalParryDamageRate: 0.5,   // 일반 패링: 원래 피해의 50%
    // 완벽패링 (모티브: Dueling Grounds 의 패링 단계)
    // 가드를 누른 순간부터 window[단계] 프레임 안에 맞으면 완벽패링.
    // chainFrames 안에 다시 누르면 단계가 올라가 판정이 짧아지고(14→10→8),
    // 판정 안에 맞지 않았는데 버튼을 떼고 있으면(=막기로 넘어가지 않음) 헛패링 경직 recovery[단계](6→12→18) 동안 아무것도 못 한다.
    parry: { window: [14, 10, 8], recovery: [6, 12, 18], chainFrames: 60 },
    parryPostureDamage: 18,       // [TEMP] 완벽패링 성공 시 공격자의 가드(자세) 게이지 감소 → 0이면 가드 브레이크
    perfectDamageRatio: 1 / 50,   // [TEMP] 완벽패링 피해 = 최대 체력의 1/50
    perfectGuardCost: 6,          // [TEMP] 완벽패링 시 가드 게이지 소모
    perfectStun: 38,              // [TEMP] 완벽패링당한 공격자의 행동 불가 시간 (느려진 반격에 맞춰 28→42)
    regenDelay: 100,              // [TEMP] 마지막 패링 후 회복 시작까지 (밸런스: 80→100)
    regenPerFrame: 1.0,           // [TEMP] 초당 60 회복 (비교적 빠름, 밸런스: 72→60)
  },

  guardBreak: {
    stun: 100,            // [TEMP] 가드 브레이크 행동 불가 시간 (80→100)
  },

  special: {
    // 특수강공: 가드 브레이크된 상대에게만 사용 가능. 피해량은 모든 무기 동일.
    damage: 140,          // [TEMP] 모든 무기 공통
    triggerRange: 230,    // [TEMP] 이 거리 이내에서 강공격 입력 시 특수강공으로 변환
    neutralDistance: 380, // [TEMP] 특수강공 후 두 플레이어가 재대치하는 거리
    knockbackFrames: 34,  // [TEMP] 밀려나는 연출 시간
  },

  ultimate: {
    // 궁극기는 즉시 시전, 일반 공격으로 취소 불가, 일반 패링 불가, 완벽패링으로만 끊김.
    cost: 100,
  },

  ultGain: {
    // 궁극기 게이지 충전량 (공격별 ultGainScale 을 곱한다)
    // 밸런스: 전체 약 55% 하향 (AI 시뮬레이션에서 20초 경기당 궁극기 2회 → 너무 잦음)
    dealHit: 3,           // [TEMP] 공격 적중
    dealGuarded: 1.5,     // [TEMP] 상대가 일반 패링
    takeHit: 2.5,         // [TEMP] 피격
    guard: 2.5,           // [TEMP] 일반 패링 성공
    perfectParry: 8,      // [TEMP] 완벽패링 성공 (상대적으로 보상 유지)
    perfectParried: 0,    // [TEMP] 완벽패링당함
  },

  combo: {
    // 콤보가 끝난 뒤 이 시간 안에 다시 공격하면 같은 콤보로 계속 센다 (빠졌다 다시 몰아치기 방지)
    window: 36,           // [TEMP] (26→36)
    whiffDelay: 12,       // [TEMP] 헛친 약공은 cancelFrom + 이 프레임부터 다음 단계 (헛친 연타 너프)
    heavyWhiffDelay: 20,  // [TEMP] 헛친 강공은 약공보다 더 늦게 이어진다 (강공 = 느리고 강한 기술)
    // 콤보 단계 사이: 가장 늦게 맞아도 피격자가 이만큼 먼저 움직일 수 있다 (가드/완벽패링/대시 틈)
    minGap: 4,            // [TEMP] (기존 데이터 최소 2 → 4)
    // 콤보가 끝나면(상한 도달) 공격권은 상대에게 넘어간다:
    // 어떤 무기의 상대라도 "가장 느린 약공"으로 먼저 공격할 수 있는 여유 프레임.
    // 무기별 콤보 종료 딜레이(fullLag/mixedLag)는 이 값에서 자동 계산된다 (weapons.js finalizeTiming)
    turnAdvantage: { mixed: 18, full: 34 },   // [TEMP] 섞어서 끝냄 / 한 종류만 연타
    // 무기별 상한(lightMax/heavyMax/maxTotal)과 딜레이(fullLag/mixedLag)는 weapons.js 의 combo 항목
  },

  round: {
    timeSeconds: 99,      // [TEMP]
    koDelay: 90,          // KO 후 결과까지 대기
  },
};
