// =============================================================================
// 키 배치 (KeyboardEvent.code 기준). 한 키보드 로컬 대전용 임시 배치.
// 각 동작에 여러 키를 지정할 수 있다.
// =============================================================================

export const CONTROLS = [
  {
    // P1: 왼손 WASD + F(가드) + Shift(대시), 오른손 J K I
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], guard: ['KeyF'],
    light: ['KeyJ'], heavy: ['KeyK'], dash: ['ShiftLeft'], ult: ['KeyI'],
  },
  {
    // P2: 방향키 + 숫자패드 (노트북은 / . , ; 대체키)
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], guard: ['ArrowDown'],
    light: ['Numpad1', 'Comma'], heavy: ['Numpad2', 'Period'],
    dash: ['ShiftRight', 'Numpad3', 'Slash'], ult: ['Numpad5', 'Semicolon'],
  },
];

export const KEY_LABELS = {
  KeyA: 'A', KeyD: 'D', KeyW: 'W', KeyS: 'S', KeyF: 'F', KeyJ: 'J', KeyK: 'K', KeyL: 'L', ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', KeyI: 'I',
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Numpad1: 'Num1', Numpad2: 'Num2', Numpad3: 'Num3', Numpad5: 'Num5',
  Comma: ',', Period: '.', Slash: '/', Semicolon: ';',
};
