// =============================================================================
// 온라인 대전 클라이언트 (브라우저/Node 공용: 전역 WebSocket 사용)
// 서버 메시지를 이벤트로 전달하고, 서버 핑(sping)에 자동 응답한다.
// =============================================================================

export class NetClient {
  constructor(url) {
    this.url = url;
    this.handlers = new Map();
    this.ws = null;
    this.rtt = null;
    this.peerRtt = null;
  }

  static defaultUrl() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  on(type, fn) { this.handlers.set(type, fn); return this; }
  emit(type, msg) { this.handlers.get(type)?.(msg); }

  connect() {
    return new Promise((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = () => { settled = true; resolve(this); };
      ws.onerror = () => { if (!settled) { settled = true; reject(new Error('서버에 연결할 수 없습니다.')); } };
      ws.onclose = () => this.emit('close', {});
      ws.onmessage = (ev) => {
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        if (msg.t === 'sping') { this.send({ t: 'spong', ts: msg.ts }); return; }
        if (msg.t === 'ping') { this.rtt = msg.rtt; this.peerRtt = msg.peerRtt; }
        this.emit(msg.t, msg);
      };
    });
  }

  get connected() { return this.ws && this.ws.readyState === 1; }

  send(msg) { if (this.connected) this.ws.send(JSON.stringify(msg)); }

  close() { try { this.ws?.close(); } catch { /* ignore */ } this.ws = null; }
}
