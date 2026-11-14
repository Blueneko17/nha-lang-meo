'use strict';
/**
 * Nhà xem phim chung — Nhà Làng Mèo — máy chủ đồng bộ online
 * Express phục vụ client tĩnh ở /public + WebSocket (thư viện ws) trên cùng 1 cổng.
 *
 * CHỈ 1 NHÀ CHUNG DUY NHẤT: không có khái niệm nhiều phòng / mã phòng.
 * Mọi client kết nối đều vào cùng một nhà; server BỎ QUA trường `room`
 * nếu client (bản cũ) còn gửi. Giới hạn nhà: biến môi trường ROOM_CAP
 * (mặc định 30).
 *
 * Giao thức JSON qua WebSocket — xem README.md mục "Giao thức".
 * Nhân vật 3D: `join` kèm `appearance`; tin `move {x,y,z,rotY,sitting}` cập
 * nhật vị trí (server kẹp biên biệt thự x∈[-18,18], z∈[-12,48], độ cao
 * y∈[0,6.5]) và relay cho cả nhà trừ người gửi.
 * Tương tác: tin `action {kind,toId}` (punch/kick/wave/hug/highfive — chỉ là
 * hiệu ứng đùa nhau, không sát thương/điểm) broadcast cho cả nhà.
 * Voice: tin `voice-signal {toId,data}` — tín hiệu WebRTC (offer/answer/ice),
 * server CHỈ chuyển tiếp tới đúng người nhận, không broadcast, không lưu.
 * Kênh đồng bộ mở: tin `sync {kind,data}` — kind bắt đầu bằng `vl-`
 * (vl-dj, vl-bar, vl-state, vl-slide…), server broadcast nguyên trạng cho
 * cả nhà trừ người gửi (cùng quy ước relay của `game`).
 */
const path = require('path');
const http = require('http');
const express = require('express');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;
const ROOM_CAP = parseInt(process.env.ROOM_CAP || '30', 10);
const HOUSE_NAME = 'Nhà Làng Mèo';
const MAX_NAME = 40;
const MAX_CHAT = 500;
// Biên khu đất Biệt thự Làng Mèo (client đã mở rộng: nhà chính + sân lửa trại +
// vườn + hồ bơi + dãy phòng + sân thượng Sky Bar): x ∈ [-18, 18], z ∈ [-12, 48]
// (z MIN/MAX lệch nhau vì vườn kéo dài về phía sau nhà), vượt biên là bị kẹp.
const BOUND_X = 18;
const BOUND_Z_MIN = -12;
const BOUND_Z_MAX = 48;
// Độ cao nhân vật (tầng lửng ~3.2, sân thượng Sky Bar 4.0, chóp cầu tụt ~5.2): y ∈ [0, 6.5]
const BOUND_Y_MAX = 6.5;
// Kênh đồng bộ mở `sync`: kind phải bắt đầu bằng tiền tố này, tối đa 40 ký tự,
// data sau khi JSON hoá tối đa 16KB — tránh lạm dụng băng thông nhà chung
const SYNC_PREFIX = 'vl-';
const SYNC_KIND_MAX = 40;
const SYNC_DATA_MAX = 16 * 1024;
const APPEARANCE_KEYS = ['skin', 'hair', 'shirt', 'hairStyle', 'accessory'];
// Động tác tương tác giữa người chơi — chỉ các kind này mới được chấp nhận
const ACTION_KINDS = ['punch', 'kick', 'wave', 'hug', 'highfive'];

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function num(v, fallback = 0) { const n = Number(v); return Number.isFinite(n) ? n : fallback; }

/** Chuẩn hoá ngoại hình nhân vật 3D gửi lúc join — chỉ giữ các trường đã biết, dạng chuỗi ngắn. */
function sanitizeAppearance(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const k of APPEARANCE_KEYS) {
    if (raw[k] != null) out[k] = String(raw[k]).slice(0, 32);
  }
  return Object.keys(out).length ? out : null;
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

// Kiểm tra sức khỏe — Render dùng đường này (healthCheckPath trong render.yaml)
app.get('/healthz', (req, res) => {
  res.json({ ok: true, house: HOUSE_NAME, users: house.size, cap: ROOM_CAP });
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

/**
 * house: Map<ws, user> — phòng toàn cục duy nhất
 * user = { id, name, seatId, appearance: {skin,hair,shirt,hairStyle,accessory}|null,
 *          pos: { x, y, z, rotY, sitting } }
 */
const house = new Map();
let nextId = 1;

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj, exceptWs) {
  for (const ws of house.keys()) {
    if (ws !== exceptWs) send(ws, obj);
  }
}

function presence() {
  const users = [...house.values()].map((u) => ({
    id: u.id, name: u.name, seatId: u.seatId,
    appearance: u.appearance,
    pos: { x: u.pos.x, y: u.pos.y, z: u.pos.z, rotY: u.pos.rotY, sitting: u.pos.sitting },
  }));
  return { type: 'presence', count: users.length, cap: ROOM_CAP, users };
}

function broadcastPresence() {
  broadcast(presence(), null);
}

/** Tìm cặp [ws, user] theo id số của người dùng trong nhà; không thấy → null. */
function findById(id) {
  const n = Number(id);
  if (!Number.isFinite(n)) return null;
  for (const [ws, u] of house.entries()) {
    if (u.id === n) return [ws, u];
  }
  return null;
}

function leaveHouse(ws) {
  if (!ws._user) return;
  house.delete(ws);
  ws._user = null;
  broadcastPresence();
}

wss.on('connection', (ws) => {
  ws._user = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    // ---- join {name, appearance} — trường `room` nếu có sẽ bị BỎ QUA: chỉ có 1 nhà chung ----
    if (msg.type === 'join') {
      const name = String(msg.name || '').trim().slice(0, MAX_NAME) || 'Khách';
      const appearance = sanitizeAppearance(msg.appearance);
      if (!ws._user && house.size >= ROOM_CAP) {
        // Người thứ CAP+1: từ chối, có thông báo rõ ràng
        send(ws, {
          type: 'error', code: 'ROOM_FULL',
          message: `${HOUSE_NAME} đã đủ ${ROOM_CAP} người. Vui lòng quay lại sau.`,
          count: house.size, cap: ROOM_CAP,
        });
        return;
      }
      if (ws._user) house.delete(ws); // join lại: gỡ bản ghi cũ trước
      const user = {
        id: nextId++, name, seatId: null, appearance,
        pos: { x: 0, y: 0, z: 0, rotY: 0, sitting: false }, // vị trí 3D hiện tại, cập nhật bởi tin `move`
      };
      ws._user = user;
      house.set(ws, user);
      send(ws, {
        type: 'joined', id: user.id, name: user.name, house: HOUSE_NAME, cap: ROOM_CAP,
        appearance: user.appearance, pos: { ...user.pos },
      });
      broadcastPresence();
      return;
    }

    // Các sự kiện còn lại yêu cầu đã join
    const user = ws._user;
    if (!user) {
      send(ws, { type: 'error', code: 'NOT_JOINED', message: 'Chưa vào nhà.' });
      return;
    }

    switch (msg.type) {
      // ---- move {x, y, z, rotY, sitting} — nhân vật 3D di chuyển tự do trong biệt thự ----
      // Server kẹp tọa độ trong biên khu đất (x, z) và độ cao y ∈ [0, 6.5]
      // (y thiếu → mặc định 0 = mặt đất; client cũ không gửi y vẫn chạy bình
      // thường), LƯU vào trạng thái user (người vào sau thấy qua presence),
      // rồi relay cho cả nhà TRỪ người gửi. Không lưu lịch sử.
      case 'move': {
        user.pos = {
          x: clamp(num(msg.x), -BOUND_X, BOUND_X),
          y: clamp(num(msg.y), 0, BOUND_Y_MAX),
          z: clamp(num(msg.z), BOUND_Z_MIN, BOUND_Z_MAX),
          rotY: num(msg.rotY),
          sitting: !!msg.sitting,
        };
        broadcast({
          type: 'move', userId: user.id, name: user.name,
          x: user.pos.x, y: user.pos.y, z: user.pos.z, rotY: user.pos.rotY, sitting: user.pos.sitting,
        }, ws); // không gửi lại chính người gửi
        break;
      }

      // ---- seat {seatId} — seatId = null nghĩa là trả ghế ----
      case 'seat': {
        const seatId = (msg.seatId === null || msg.seatId === undefined) ? null : String(msg.seatId);
        // Không cho 2 người giữ cùng 1 ghế
        if (seatId !== null) {
          for (const u of house.values()) {
            if (u !== user && u.seatId === seatId) {
              send(ws, { type: 'error', code: 'SEAT_TAKEN', message: `Ghế ${seatId} đã có người ngồi.`, seatId });
              return;
            }
          }
        }
        user.seatId = seatId;
        broadcast({ type: 'seat', userId: user.id, name: user.name, seatId }, null);
        broadcastPresence();
        break;
      }

      // ---- video {videoId, playing, currentTime, by} — đồng bộ cả nhà ----
      case 'video': {
        broadcast({
          type: 'video',
          videoId: msg.videoId != null ? String(msg.videoId) : null,
          playing: !!msg.playing,
          currentTime: Number(msg.currentTime) || 0,
          by: user.name,
        }, ws); // không gửi lại chính người gửi
        break;
      }

      // ---- chat {text} ----
      case 'chat': {
        const text = String(msg.text || '').trim().slice(0, MAX_CHAT);
        if (!text) return;
        broadcast({ type: 'chat', from: user.name, userId: user.id, text, ts: Date.now() }, null);
        break;
      }

      // ---- action {kind, toId} — tương tác đùa giữa người chơi (đấm/đá/vẫy/ôm/high-five) ----
      // Chỉ hiệu ứng hoạt cảnh, KHÔNG sát thương, KHÔNG điểm số. kind phải thuộc
      // ACTION_KINDS và toId phải là người đang có mặt trong nhà; hợp lệ thì
      // broadcast cho CẢ NHÀ (kể cả người gửi và người bị tác động) để mọi
      // client cùng chạy hoạt cảnh.
      case 'action': {
        const kind = String(msg.kind || '');
        if (!ACTION_KINDS.includes(kind)) {
          send(ws, { type: 'error', code: 'ACTION_INVALID', message: `Động tác không hợp lệ: ${kind || '(trống)'}`, kinds: ACTION_KINDS });
          return;
        }
        const target = findById(msg.toId);
        if (!target) {
          send(ws, { type: 'error', code: 'ACTION_TARGET_NOT_FOUND', message: 'Người được chọn không còn trong nhà.', toId: msg.toId });
          return;
        }
        broadcast({
          type: 'action', kind,
          fromId: user.id, fromName: user.name,
          toId: target[1].id, toName: target[1].name,
        }, null);
        break;
      }

      // ---- voice-signal {toId, data} — kênh tín hiệu WebRTC (offer/answer/ice) ----
      // Server KHÔNG hiểu nội dung data, chỉ chuyển tiếp NGUYÊN TRẠNG tới ĐÚNG
      // người nhận (mesh 1-1), tuyệt đối không broadcast. Người nhận không còn
      // trong nhà → báo lỗi nhẹ cho người gửi rồi bỏ qua.
      case 'voice-signal': {
        const target = findById(msg.toId);
        if (!target) {
          send(ws, { type: 'error', code: 'VOICE_TARGET_NOT_FOUND', message: 'Người nhận tín hiệu voice không còn trong nhà.', toId: msg.toId });
          return;
        }
        send(target[0], { type: 'voice-signal', fromId: user.id, fromName: user.name, data: msg.data });
        break;
      }

      // ---- game — relay NGUYÊN TRẠNG payload cho cờ cá ngựa / bi-a ----
      case 'game': {
        broadcast({ type: 'game', from: user.name, userId: user.id, payload: msg.payload }, ws);
        break;
      }

      // ---- sync {kind, data} — KÊNH ĐỒNG BỘ MỞ cho các tính năng biệt thự ----
      // kind là chuỗi tuỳ ý do client đặt nhưng BẮT BUỘC bắt đầu bằng tiền tố
      // `vl-` (vl-dj = bàn DJ, vl-bar = màn hình Sky Bar, vl-state, vl-slide…)
      // và dài tối đa SYNC_KIND_MAX ký tự; data giới hạn SYNC_DATA_MAX byte
      // sau khi JSON hoá. Hợp lệ → broadcast NGUYÊN TRẠNG
      // {type:'sync', kind, data, fromId, fromName} cho cả nhà TRỪ người gửi
      // (cùng quy ước relay của `game`). Sai tiền tố/quá dài/data quá lớn →
      // lỗi nhẹ chỉ cho người gửi, không broadcast.
      case 'sync': {
        const kind = typeof msg.kind === 'string' ? msg.kind : '';
        if (!kind.startsWith(SYNC_PREFIX) || kind.length > SYNC_KIND_MAX) {
          send(ws, {
            type: 'error', code: 'SYNC_KIND_INVALID',
            message: `Kênh sync phải bắt đầu bằng "${SYNC_PREFIX}" và tối đa ${SYNC_KIND_MAX} ký tự.`,
            kind: kind || null,
          });
          return;
        }
        const data = msg.data === undefined ? null : msg.data;
        let dataBytes = 0;
        try { dataBytes = Buffer.byteLength(JSON.stringify(data) || ''); } catch { dataBytes = Infinity; }
        if (dataBytes > SYNC_DATA_MAX) {
          send(ws, {
            type: 'error', code: 'SYNC_DATA_TOO_LARGE',
            message: `Dữ liệu sync vượt quá ${SYNC_DATA_MAX} byte sau khi JSON hoá.`,
            kind,
          });
          return;
        }
        broadcast({ type: 'sync', kind, data, fromId: user.id, fromName: user.name }, ws);
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => leaveHouse(ws));
  ws.on('error', () => leaveHouse(ws));
});

// Heartbeat: dọn kết nối chết mỗi 30 giây
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => {
  console.log(`[${HOUSE_NAME}] http://localhost:${PORT}  (ROOM_CAP=${ROOM_CAP}, 1 nhà chung duy nhất)`);
});
