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
  width: 2400,         // 경기장 전체 폭 (화면은 1281px 만큼 보이고 카메라가 따라간다)
  height: 720,
  groundY: 610,        // 화면상 지면 높이(렌더링용)
  leftWall: 70,        // 캐릭터 중심 x 최소값
  rightWall: 2330,     // 캐릭터 중심 x 최대값
  maxSeparation: 1100, // 두 캐릭터 최대 거리: 둘 다 항상 한 화면 안에 (격투 게임 화면 끝 규칙)
  startDistance: 360,  // [TEMP] 라운드 시작 시 두 플레이어 거리
};

export const BALANCE = {
  // 공격 리듬 (모든 무기 공통): 예비 동작 ×windup, 후딜 ×recovery (무기별 공격 시간 배율과 곱해짐)
  // 모티브처럼 "읽히는 예비 동작 + 짧은 후딜" → 연타보다 읽기·패링 중심의 흐름
  timing: { windup: 1.45, recovery: 0.8 },   // [TEMP]

  fighter: {
    maxHp: 1000,          // [TEMP] 1200→600(목숨 2개)→800→1000: 경기를 길게, 궁극기 비중 ↑
    maxStamina: 100,
    maxGuard: 70,         // [TEMP] 100→70: 자세가 더 빨리 무너진다
    maxUlt: 45,           // [TEMP] 100→70→55→45: 궁극기가 더 자주 나온다 (충전량은 그대로)
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
    cooldown: 60,         // [TEMP] 대시 시작 후 재사용 대기 (34→60: 연속 대시로 거리를 좁히는 플레이 억제)
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
    regenDelay: 150,              // [TEMP] 마지막 막기 후 회복 시작까지 (80→100→150: 더 오래 기다려야 회복이 시작됨, 2.5초)
    regenPerFrame: 70 / 150,      // [TEMP] 0 → 가득(70) 2.5초 (초당 28)
    blockGuardScale: 1.5,         // [TEMP] 막을 때 줄어드는 가드 게이지 배율 (공격별 가드 피해 × 이 값 × 무기별 guardTaken)
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
    cost: 45,             // = fighter.maxUlt
    damageScale: 1.45,    // [TEMP] 궁극기 피해 배율 (무기별 궁극기 수치에 곱함) 1.3→1.45
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
    minGap: 3,            // [TEMP] 콤보 사이 피격자 자유 시간 (정확히 이 값으로 맞춤: 가드·대시 가능, 약공 역공 불가)
    // 콤보가 끝나면(상한 도달) 공격권은 상대에게 넘어간다:
    // 어떤 무기의 상대라도 "가장 느린 약공"으로 먼저 공격할 수 있는 여유 프레임.
    // 무기별 콤보 종료 딜레이(fullLag/mixedLag)는 이 값에서 자동 계산된다 (weapons.js finalizeTiming)
    turnAdvantage: { mixed: 18, full: 34 },   // [TEMP] 섞어서 끝냄 / 한 종류만 연타
    // 무기별 상한(lightMax/heavyMax/maxTotal)과 딜레이(fullLag/mixedLag)는 weapons.js 의 combo 항목
  },

  round: {
    timeSeconds: 99,      // [TEMP]
    timeOptions: [60, 90, 120, 0], // 온라인 방장이 고르는 시간 제한 (0 = 무제한). AI 대전·로컬 2인은 timeSeconds
    onlineDefault: 90,    // 온라인 방의 처음 시간 제한
    // 라운드 시간이 다 되면 연장전: 경기를 끝내지 않고 양쪽 모두 초당 최대 체력의 이 비율만큼 피해 → 누군가 쓰러질 때까지 싸운다
    overtimeRate: 0.06,   // [TEMP] 초당 6% (가득 찬 체력도 약 17초)
    koDelay: 90,          // KO 후 다음 라운드(또는 결과)까지 대기
    lives: 2,             // 목숨 수
    introFrames: 75,      // 라운드 사이 정지 (ROUND 2 / FIGHT 표시)
  },
};
