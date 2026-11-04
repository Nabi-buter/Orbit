// =============================================================================
// 온라인 대전 — 일반 웹 주소(GitHub Pages 등)용: 브라우저끼리 직접 연결(WebRTC, PeerJS)
// -----------------------------------------------------------------------------
// PeerJS 의 공개 중개 서버는 두 브라우저를 "소개"만 하고, 경기 데이터는 브라우저끼리 직접 오간다
// (막힌 네트워크에서는 PeerJS 기본 TURN 서버를 거쳐 중계).
// 이 파일은 PeerJS 를 RoomNet 이 쓰는 "방" 모양(join → emit / on / peers / onPeers / leave)으로 감싼다.
// 그래서 방 코드·로비·준비·시작·입력·동기화 검사 로직은 claude.ai 방 기능과 같은 RoomNet 을 그대로 쓴다.
//
//   방 이름(duel-<코드>) → PeerJS ID "orbitduel-<코드>"
//   join(이름): 그 ID 를 먼저 차지해 본다
//     - 차지됨  → 내가 방장(호스트), 들어오는 연결을 받는다
//     - 이미 있음 → 방장이 있다는 뜻 → 임의 ID 로 접속해 방장에게 연결
//   (없는 코드로 참가하면 빈 방의 방장이 되고, RoomNet 이 "방을 찾을 수 없습니다" 후 나간다)
// =============================================================================

const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
const ID_PREFIX = 'orbitduel-';
const OPEN_TIMEOUT = 10000;

/** PeerJS 스크립트를 한 번만 불러온다 (전역 Peer) */
let loading = null;
export function loadPeerJS() {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.async = true;
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS 를 불러오지 못했습니다.')));
      s.onerror = () => { loading = null; reject(new Error('온라인 모듈을 불러오지 못했습니다. 인터넷 연결을 확인하세요.')); };
      document.head.append(s);
    });
  }
  return loading;
}

/** 사용자에게 보여 줄 오류 (RoomNet 이 message 를 그대로 띄운다) */
function userError(msg) { const e = new Error(msg); e.userMessage = msg; return e; }

/** 방 하나 (RoomNet 의 NamedRoom 과 같은 모양) */
class PeerRoom {
  constructor(name, peer) {
    this.name = name;
    this.peer = peer;
    this.conns = new Map();   // 상대 peer id → DataConnection
    this.handlers = new Map();
    this.peerFns = [];
  }

  attach(conn) {
    const id = conn.peer;
    conn.on('data', (raw) => {
      let msg = raw;
      if (typeof raw === 'string') { try { msg = JSON.parse(raw); } catch { return; } }
      if (!msg || typeof msg.topic !== 'string') return;
      const m = { topic: msg.topic, data: msg.data, peer: id, isMe: false, sameTab: false, kind: 'viewer', guest: false, by: null };
      for (const fn of this.handlers.get(msg.topic) ?? []) fn(m);
    });
    const gone = () => {
      if (!this.conns.has(id)) return;
      this.conns.delete(id);
      const left = [{ peer: id, final: true }]; // 직접 연결이 닫힘 = 확실히 나감 (재연결 아님)
      for (const fn of this.peerFns) fn({ peers: this.peers(), joined: [], left, updated: [] });
    };
    conn.on('close', gone);
    conn.on('error', gone);
    this.conns.set(id, conn);
  }

  async emit(topic, data) {
    const text = JSON.stringify({ topic, data: data ?? {} });
    for (const c of this.conns.values()) { if (c.open) { try { c.send(text); } catch { /* 연결이 끊기는 중 */ } } }
  }

  on(topic, fn) {
    const list = this.handlers.get(topic) ?? [];
    list.push(fn);
    this.handlers.set(topic, list);
    return () => { const l = this.handlers.get(topic) ?? []; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
  }

  onPeers(fn) { this.peerFns.push(fn); return () => { const i = this.peerFns.indexOf(fn); if (i >= 0) this.peerFns.splice(i, 1); }; }

  peers() {
    return [{ peer: this.peer.id, sameTab: true, isMe: true }, ...[...this.conns.keys()].map((id) => ({ peer: id, sameTab: false, isMe: false }))];
  }

  connected() { return !this.peer.destroyed; }

  async leave() {
    for (const c of this.conns.values()) { try { c.close(); } catch { /* ignore */ } }
    this.conns.clear();
    this.handlers.clear();
    this.peerFns = [];
    try { this.peer.destroy(); } catch { /* ignore */ }
  }
}

/** RoomNet 에 넘기는 "로비" — join(이름) 만 실제로 일한다 */
export class PeerLobby {
  /** @param {Function} PeerClass  PeerJS 의 Peer (테스트에서는 가짜) */
  constructor(PeerClass, options = {}) {
    this.Peer = PeerClass;
    this.options = options; // PeerJS 옵션 (중개 서버·ICE 서버 등)
  }

  connected() { return true; }
  onConnection(fn) { Promise.resolve().then(() => fn(true)); return () => {}; }

  /** 이름 붙은 방에 들어간다: 방장 ID 를 차지하거나, 이미 있으면 그 방장에게 연결 */
  async join(name) {
    const hostId = ID_PREFIX + name.replace(/^duel-/, '');
    const host = await this.open(hostId).catch((e) => (e.type === 'unavailable-id' ? null : Promise.reject(e)));
    if (host) {
      const room = new PeerRoom(name, host);
      host.on('connection', (conn) => conn.on('open', () => room.attach(conn)));
      return room;
    }
    // 방장이 이미 있음 → 손님으로 연결
    const me = await this.open(undefined);
    const room = new PeerRoom(name, me);
    await new Promise((resolve, reject) => {
      const conn = me.connect(hostId, { reliable: true, serialization: 'json' });
      const timer = setTimeout(() => { me.destroy(); reject(userError('상대와 연결하지 못했습니다. 네트워크 환경(회사·학교 망 등)을 확인하거나 다시 시도하세요.')); }, OPEN_TIMEOUT);
      conn.on('open', () => { clearTimeout(timer); room.attach(conn); resolve(); });
      me.on('error', (e) => { clearTimeout(timer); me.destroy(); reject(userError(e?.type === 'peer-unavailable' ? '방을 찾을 수 없습니다.' : '상대와 연결하지 못했습니다.')); });
    });
    return room;
  }

  /** PeerJS 접속 (id 없으면 임의 id). 실패하면 PeerJS 오류(type 포함)로 거부 */
  open(id) {
    return new Promise((resolve, reject) => {
      const p = id ? new this.Peer(id, this.options) : new this.Peer(this.options);
      const timer = setTimeout(() => { p.destroy(); reject(userError('온라인 중개 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요.')); }, OPEN_TIMEOUT);
      p.on('open', () => { clearTimeout(timer); resolve(p); });
      p.on('error', (e) => {
        clearTimeout(timer);
        p.destroy();
        if (e?.type === 'unavailable-id') { const err = new Error('id taken'); err.type = 'unavailable-id'; reject(err); }
        else reject(userError('온라인 중개 서버에 연결하지 못했습니다. 잠시 뒤 다시 시도하세요.'));
      });
    });
  }
}
