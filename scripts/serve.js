// 호환용: 게임 서버 실행 (정적 파일 + 온라인 대전 WebSocket)
import { createServer } from '../server/server.js';

const port = Number(process.argv[2] || process.env.PORT || 8080);
createServer().listen(port, process.env.HOST || '0.0.0.0', () => console.log(`http://localhost:${port}`));
