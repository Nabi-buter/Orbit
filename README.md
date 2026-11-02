# Orbit Duel

2D 횡스크롤 1대1 무기 격투 게임 (브라우저).

## 실행

```bash
npm start          # http://localhost:8080
npm test           # 전투 규칙 자동 테스트
```

외부 의존성이 없다. (Node 18+ 필요: 정적 서버와 테스트 실행용)

## 구조

| 경로 | 역할 |
| --- | --- |
| `src/config/balance.js` | **모든 공통 밸런스 수치** (`[TEMP]` = 임시값) |
| `src/config/weapons.js` | 무기별 공격 데이터 (프레임/판정/피해) |
| `src/config/controls.js` | 키 배치 |
| `src/core/fighter.js` | 플레이어 상태 데이터 |
| `src/core/actions.js` | 입력 → 행동 전환 |
| `src/core/physics.js` | 이동·중력·충돌·타이머·게이지 회복 |
| `src/core/combat.js` | 공격 판정, 피격/패링/완벽패링/가드 브레이크/특수강공 |
| `src/core/match.js` | 1프레임 시뮬레이션 (`step(inputs)`), 승패 |
| `src/input/` | 키보드 → 프레임 입력 (전투 로직과 분리) |
| `src/render/` | 캔버스 렌더링 (상태 읽기 전용) |

전투 로직(`src/core`)은 DOM·입력 장치·네트워크를 전혀 모른다. 양쪽 플레이어의 프레임 입력만 받아
결정론적으로 진행되므로, 온라인 대전은 입력 동기화(롤백/딜레이 방식) 계층만 추가하면 된다.
