// =============================================================================
// 키보드 → 프레임 입력 변환
// 전투 로직은 이 모듈을 모른다. sample() 결과(버튼 상태 객체)만 전달된다.
// =============================================================================

import { CONTROLS } from '../config/controls.js';
import { EMPTY_INPUT } from '../core/fighter.js';

export class Keyboard {
  constructor(target = window) {
    this.down = new Set();
    this.pressedOnce = new Set(); // 메뉴용 엣지 입력
    this.latched = new Set();     // 프레임 사이에 눌렸다 떼어진 짧은 입력도 놓치지 않도록
    this.onKeyDown = (e) => {
      if (!e.repeat) { this.pressedOnce.add(e.code); this.latched.add(e.code); }
      this.down.add(e.code);
      if (isGameKey(e.code)) e.preventDefault();
    };
    this.onKeyUp = (e) => this.down.delete(e.code);
    this.onBlur = () => this.down.clear();
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /** 플레이어 index 의 현재 버튼 상태 */
  sample(index) {
    const map = CONTROLS[index];
    const out = { ...EMPTY_INPUT };
    for (const action of Object.keys(out)) {
      out[action] = map[action].some((code) => this.down.has(code) || this.latched.has(code));
    }
    return out;
  }

  /** 이번 프레임에 새로 눌린 키인지 (한 번만 true) */
  consume(code) {
    if (this.pressedOnce.has(code)) { this.pressedOnce.delete(code); return true; }
    return false;
  }

  endFrame() { this.pressedOnce.clear(); this.latched.clear(); }
}

const GAME_KEYS = new Set(CONTROLS.flatMap((m) => Object.values(m).flat()).concat(['Space', 'Escape']));
function isGameKey(code) { return GAME_KEYS.has(code); }
