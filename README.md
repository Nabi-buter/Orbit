# Orbit Duel

2D 횡스크롤 1대1 무기 격투 게임 (브라우저, 외부 의존성 없음).

## 실행

```bash
npm start                          # http://localhost:8080
npm test                           # 전투 규칙 자동 테스트 (Node 18+)
node scripts/e2e.cjs               # 브라우저 종단 테스트 (Playwright 필요)
node scripts/simulate.js 40 hard   # AI 대 AI 무기 상성 시뮬레이션
node scripts/balance-check.js      # 단순 전략 봇 / 거리별 판정 점검
```

## 조작

| 동작 | P1 | P2 |
| --- | --- | --- |
| 이동 | A / D | ← / → |
| 점프 | W | ↑ |
| 가드 · 패링 | S | ↓ |
| 약공격 | J | Num1 또는 `,` |
| 강공격 (가드 브레이크된 상대 → 특수강공) | K | Num2 또는 `.` |
| 대시 (+방향, 또는 방향키 두 번) | L | Num3 또는 `/` |
| 궁극기 (게이지 100%) | I | Num5 또는 `;` |

Esc/P 일시정지 · F2 판정 박스 · M 소리 켜기/끄기. 키 배치는 `src/config/controls.js` 에서 바꿀 수 있다.

## 모드 / 무기

- **PvP**: 한 키보드 2인 로컬 대전 · **PvE**: AI 상대 (쉬움/보통/어려움)
- 무기 6종: 장검 · 대검 · 단검 · 도끼 · 창 · 너클

## 구조

| 경로 | 역할 |
| --- | --- |
| `src/config/balance.js` | **모든 공통 밸런스 수치** (`[TEMP]` = 임시값) |
| `src/config/weapons.js` | 무기별 공격 데이터 (프레임/판정/피해/보정) |
| `src/config/controls.js` | 키 배치 |
| `src/core/fighter.js` | 플레이어 상태 데이터 |
| `src/core/actions.js` | 입력 → 행동 전환 |
| `src/core/physics.js` | 이동·중력·충돌·타이머·게이지 회복 |
| `src/core/combat.js` | 공격 판정, 피격/패링/완벽패링/가드 브레이크/특수강공 |
| `src/core/match.js` | 1프레임 시뮬레이션 (`step(inputs)`), 승패 |
| `src/core/ultimates.js` | 궁극기 타입 등록 구조 (무기별 궁극기 확장용) |
| `src/ai/ai.js` | PvE AI (지연 인지·난이도 수치) |
| `src/input/` | 키보드 → 프레임 입력 |
| `src/game/app.js` | 화면 전환, 게임 루프, 히트스톱, 시작 연출 |
| `src/render/` | 캔버스 렌더링·이펙트·효과음 (상태 읽기 전용) |
| `src/ui/` | 메뉴 화면 (DOM) |
| `docs/BALANCE.md` | 밸런스 점검 기록과 수치 변경 이유 |

전투 로직(`src/core`)은 DOM·입력 장치·네트워크를 전혀 모른다. 양쪽 플레이어의 프레임 입력만 받아
결정론적으로 진행되므로(테스트로 검증), 온라인 대전은 입력 동기화(롤백/딜레이) 계층만 추가하면 된다.
