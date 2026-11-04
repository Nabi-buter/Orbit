// 진입점
import { App } from './game/app.js';
import { setupTouch } from './ui/touch.js';

const app = new App({ canvas: document.getElementById('game') });
// 터치 화면이면 대전 중 조작 버튼 표시
setupTouch(document.getElementById('stage'), app);

// 디버그/자동 테스트용 노출
window.__game = app;
