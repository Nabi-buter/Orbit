// =============================================================================
// 키 배치 (KeyboardEvent.code 기준)
// -----------------------------------------------------------------------------
// DEFAULT_CONTROLS 가 기본값이고, 설정 화면에서 바꾼 배치는 이 기기에 저장된다(localStorage).
// CONTROLS 는 지금 쓰는 배치 — 키보드·도움말·터치 버튼이 매번 이 객체를 읽으므로 바꾸면 바로 적용된다.
// 각 동작에 여러 키를 둘 수 있다(첫 번째가 화면에 표시되는 대표 키).
// =============================================================================

export const ACTIONS = ['left', 'right', 'up', 'guard', 'light', 'heavy', 'dash', 'ult'];
export const ACTION_LABELS = {
  left: '왼쪽', right: '오른쪽', up: '점프', guard: '가드 · 패링',
  light: '약공격', heavy: '강공격', dash: '대시', ult: '궁극기',
};

export const DEFAULT_CONTROLS = Object.freeze([
  Object.freeze({
    // P1: 왼손 WASD(S 가드) + Shift(대시), 오른손 J K I
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], guard: ['KeyS'],
    light: ['KeyJ'], heavy: ['KeyK'], dash: ['ShiftLeft'], ult: ['KeyI'],
  }),
  Object.freeze({
    // P2: 방향키 + 숫자패드 (노트북은 / . , ; 대체키)
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], guard: ['ArrowDown'],
    light: ['Numpad1', 'Comma'], heavy: ['Numpad2', 'Period'],
    dash: ['ShiftRight', 'Numpad3', 'Slash'], ult: ['Numpad5', 'Semicolon'],
  }),
]);

/** 메뉴·일시정지에 쓰는 키는 바꿀 수 없다 */
export const RESERVED_KEYS = new Set(['Escape', 'F2', 'KeyM', 'KeyP', 'Tab', 'Enter', 'NumpadEnter']);

const STORE = 'orbit.controls';
const copyDefaults = () => DEFAULT_CONTROLS.map((m) => Object.fromEntries(ACTIONS.map((a) => [a, [...m[a]]])));

/** 저장된 배치가 올바른지 (동작마다 문자열 키 1개 이상) */
function valid(saved) {
  return Array.isArray(saved) && saved.length === 2 && saved.every((m) => m && ACTIONS.every((a) =>
    Array.isArray(m[a]) && m[a].length > 0 && m[a].every((c) => typeof c === 'string' && c.length < 40 && !RESERVED_KEYS.has(c))));
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (valid(saved)) return saved.map((m) => Object.fromEntries(ACTIONS.map((a) => [a, [...m[a]]])));
  } catch { /* 저장소 없음(테스트·비공개 창) → 기본값 */ }
  return copyDefaults();
}

/** 지금 쓰는 배치 (같은 객체를 계속 고쳐 쓴다 — 다른 모듈이 참조를 들고 있음) */
export const CONTROLS = load();

function save() {
  try { localStorage.setItem(STORE, JSON.stringify(CONTROLS)); } catch { /* 이번 접속에만 적용 */ }
}

/** 이 키를 쓰고 있는 곳 [플레이어, 동작] (없으면 null) */
export function findKey(code) {
  // 조작하는 사람은 한 명(P1)뿐 — 저장 형식은 예전(두 명)과 같게 두고 P1 만 본다
  for (const a of ACTIONS) if (CONTROLS[0][a].includes(code)) return [0, a];
  return null;
}

/**
 * 동작에 키를 지정한다. 다른 동작이 그 키를 쓰고 있었으면 서로 바꾼다(겹치는 키가 없게).
 * @returns {{ok:boolean, swapped?:[number,string]}}
 */
export function assignKey(player, action, code) {
  if (RESERVED_KEYS.has(code)) return { ok: false };
  const prev = CONTROLS[player][action][0];
  const owner = findKey(code);
  if (owner && owner[0] === player && owner[1] === action) {
    // 이미 이 동작의 키 → 대표 키로만 올림
    CONTROLS[player][action] = [code, ...CONTROLS[player][action].filter((c) => c !== code)];
    save();
    return { ok: true };
  }
  if (owner) {
    const [op, oa] = owner;
    const rest = CONTROLS[op][oa].filter((c) => c !== code);
    CONTROLS[op][oa] = rest.length ? rest : [prev];  // 그 동작에 남는 키가 없으면 내 이전 키를 넘겨줌
  }
  CONTROLS[player][action] = [code];
  save();
  return { ok: true, swapped: owner ?? undefined };
}

/** 기본값으로 되돌리기 */
export function resetControls() {
  const d = copyDefaults();
  for (let p = 0; p < 2; p++) for (const a of ACTIONS) CONTROLS[p][a] = d[p][a];
  try { localStorage.removeItem(STORE); } catch { /* ignore */ }
}

export function isDefaultControls() {
  return ACTIONS.every((a) => [0, 1].every((p) => CONTROLS[p][a].join() === DEFAULT_CONTROLS[p][a].join()));
}

export const KEY_LABELS = {
  ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'CTRL', ControlRight: 'R-CTRL', AltLeft: 'ALT', AltRight: 'R-ALT',
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', ArrowUp: 'UP', ArrowDown: 'DOWN', Space: 'SPACE', Backspace: 'BKSP', CapsLock: 'CAPS',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
};

/** 화면에 보일 키 이름 */
export function keyLabel(code) {
  if (!code) return '-';
  if (KEY_LABELS[code]) return KEY_LABELS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'Num' + code.slice(6).replace('Decimal', '.').replace('Add', '+').replace('Subtract', '-').replace('Multiply', '*').replace('Divide', '/');
  return code.length > 7 ? code.slice(0, 7) : code;
}
