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
  fighter: {
    maxHp: 1000,          // [TEMP]
    maxStamina: 100,
    maxGuard: 100,
    maxUlt: 100,
    width: 50,            // 피격 판정(허트박스) 폭
    height: 120,          // 피격 판정 높이
    walkSpeed: 4.2,       // [TEMP] 전진 속도(px/프레임)
    backWalkSpeed: 3.4,   // [TEMP] 후퇴 속도
  },

  input: {
    bufferFrames: 6,      // [TEMP] 선입력 유지 시간
  },

  stamina: {
    regenDelay: 36,       // [TEMP] 마지막 소모 후 회복 시작까지
    regenPerFrame: 0.45,  // [TEMP] 초당 27 회복
  },

  dash: {
    cost: 30,             // [TEMP] 스태미나 소모
    duration: 12,         // [TEMP] 대시 지속 프레임 (무적 없음)
    speed: 12,            // [TEMP] 12 * 12 = 약 144px 이동
    cooldown: 26,         // [TEMP] 대시 시작 후 재사용 대기
    allowDoubleTap: true, // 방향키 두 번 입력으로도 대시
    doubleTapWindow: 12,  // [TEMP]
  },

  jump: {
    cost: 22,             // [TEMP] 스태미나 소모
    velocity: 15,         // [TEMP] 초기 상승 속도
    gravity: 0.8,         // [TEMP] → 최고점 약 140px, 체공 약 38프레임
    airSpeed: 4,          // [TEMP] 점프 중 수평 속도(이륙 시 방향으로 고정)
    landingLag: 4,        // [TEMP] 일반 착지 후 짧은 경직
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
    perfectWindow: 7,             // [TEMP] 가드 입력 후 이 프레임 이내 피격 → 완벽패링
    perfectRearm: 22,             // [TEMP] 연타 방지: 직전 가드 입력과 최소 간격
    perfectDamageRatio: 1 / 50,   // [TEMP] 완벽패링 피해 = 최대 체력의 1/50
    perfectGuardCost: 6,          // [TEMP] 완벽패링 시 가드 게이지 소모
    perfectStun: 28,              // [TEMP] 완벽패링당한 공격자의 행동 불가 시간
    regenDelay: 80,               // [TEMP] 마지막 패링 후 회복 시작까지
    regenPerFrame: 1.2,           // [TEMP] 초당 72 회복 (비교적 빠름)
  },

  guardBreak: {
    stun: 80,             // [TEMP] 가드 브레이크 행동 불가 시간
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
    dealHit: 7,           // [TEMP] 공격 적중
    dealGuarded: 3,       // [TEMP] 상대가 일반 패링
    takeHit: 5,           // [TEMP] 피격
    guard: 4,             // [TEMP] 일반 패링 성공
    perfectParry: 9,      // [TEMP] 완벽패링 성공
    perfectParried: 0,    // [TEMP] 완벽패링당함
  },

  round: {
    timeSeconds: 99,      // [TEMP]
    koDelay: 90,          // KO 후 결과까지 대기
  },
};
