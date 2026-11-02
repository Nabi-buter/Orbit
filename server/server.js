// =============================================================================
// 게임 서버: 정적 파일 + 온라인 대전용 WebSocket(/ws). 외부 의존성 없음.
//   node server/server.js [port]      (기본 8080, 환경변수 PORT / HOST)
// 다른 컴퓨터에서 접속하려면 이 서버를 양쪽이 접근 가능한 곳(같은 네트워크/공인 서버)에서 실행한다.
// =============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleUpgrade } from './ws.js';
import { attach } from './rooms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.md': 'text/plain; charset=utf-8',
};
const PUBLIC = ['index.html', 'src/'];

export function createServer() {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep) || !PUBLIC.some((p) => rel === p || rel.startsWith(p))) {
      res.writeHead(404); return res.end('not found');
    }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  server.on('upgrade', (req, socket) => {
    if (new URL(req.url, 'http://x').pathname !== '/ws') return socket.destroy();
    handleUpgrade(req, socket, (conn) => attach(conn));
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  createServer().listen(port, host, () => console.log(`Orbit Duel 서버: http://localhost:${port}  (온라인 대전: ws://<주소>:${port}/ws)`));
}
