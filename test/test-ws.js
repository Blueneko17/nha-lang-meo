'use strict';
/**
 * Test tự động giao thức WebSocket — MÔ HÌNH 1 NHÀ CHUNG DUY NHẤT.
 * Chạy:  npm test   (yêu cầu server đang chạy ở WS_URL, mặc định ws://localhost:3100)
 *
 * Kiểm chứng:
 *  - join KHÔNG gửi trường room vẫn vào được nhà chung;
 *  - 2 client tự khai room KHÁC nhau vẫn ở chung một nhà và thấy nhau
 *    (server bỏ qua trường room);
 *  - seat, video relay, chat, game relay;
 *  - appearance + move (kẹp biên biệt thự x∈[-18,18], z∈[-12,48], độ cao
 *    y∈[0,6.5] — thiếu y thì mặc định 0; lưu pos kèm y vào presence);
 *  - action {kind, toId}: cả nhà nhận; kind lạ / toId không tồn tại bị từ chối;
 *  - voice-signal {toId, data}: CHỈ người nhận nhận được, người thứ ba và
 *    người gửi đều không nhận; toId không tồn tại → lỗi nhẹ cho người gửi;
 *  - sync {kind, data}: kind tiền tố vl- broadcast cả nhà trừ người gửi;
 *    kind sai tiền tố / quá dài / data >16KB bị từ chối, không broadcast;
 *  - chặn người vượt cap (chạy server test với ROOM_CAP=3: A, B, C ở trong
 *    nhà để kiểm chứng voice, client thứ 4 bị chặn ROOM_FULL).
 */
const WebSocket = require('ws');
const URL = process.env.WS_URL || 'ws://localhost:3100';

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`); }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`); }
}

// room: undefined = không gửi trường room; còn lại gửi kèm để kiểm chứng server bỏ qua
// appearance: object ngoại hình 3D gửi kèm lúc join (tuỳ chọn)
function connect(name, room, appearance) {
  return new Promise((resolve) => {
    const ws = new WebSocket(URL);
    const client = { ws, name, inbox: [], waiters: [] };
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      client.inbox.push(msg);
      client.waiters = client.waiters.filter((w) => !w(msg));
    });
    ws.on('open', () => {
      const hello = { type: 'join', name };
      if (room !== undefined) hello.room = room;
      if (appearance !== undefined) hello.appearance = appearance;
      ws.send(JSON.stringify(hello));
      resolve(client);
    });
  });
}
function waitFor(client, type, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const found = client.inbox.find((m) => m.type === type);
    if (found) return resolve(found);
    const w = (msg) => { if (msg.type === type) { clearTimeout(t); resolve(msg); return true; } return false; };
    const t = setTimeout(() => reject(new Error(`timeout chờ '${type}' của ${client.name}`)), timeout);
    client.waiters.push(w);
  });
}
function waitForWhere(client, pred, label, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const found = client.inbox.find(pred);
    if (found) return resolve(found);
    const w = (msg) => { if (pred(msg)) { clearTimeout(t); resolve(msg); return true; } return false; };
    const t = setTimeout(() => reject(new Error(`timeout chờ ${label} của ${client.name}`)), timeout);
    client.waiters.push(w);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`Test nối tới ${URL} — mô hình 1 nhà chung duy nhất`);
  // 1) A join KHÔNG gửi room, CÓ gửi appearance 3D -> vẫn vào được
  const appearanceA = { skin: 'sang', hair: 'nau', shirt: 'xanh', hairStyle: 'dai', accessory: 'tai-meo' };
  const a = await connect('An', undefined, appearanceA); // không có trường room
  const joinedA = await waitFor(a, 'joined');
  check('A join không gửi room vẫn vào được, nhận joined + id', !!joinedA.id, `house=${joinedA.house}`);
  let presA = await waitFor(a, 'presence');
  check('presence sau khi A vào: 1 người', presA.count === 1, `count=${presA.count}/${presA.cap}`);

  // 2) B join tự khai room KHÁC hẳn ('phong-rieng-cua-b') -> vẫn chung nhà với A
  const b = await connect('Bình', 'phong-rieng-cua-b');
  const joinedB = await waitFor(b, 'joined');
  check('B join có khai room lạ vẫn vào được nhà chung', !!joinedB.id);
  presA = await waitForWhere(a, (m) => m.type === 'presence' && m.count === 2, 'presence 2 người');
  const names = presA.users.map((u) => u.name).sort().join(',');
  check('B khác "room" tự khai vẫn chung nhà: A thấy đủ 2 người', presA.count === 2 && presA.users.length === 2 && names === 'An,Bình',
    `users=${presA.users.map((u) => u.name).join(',')}`);
  const presB = await waitForWhere(b, (m) => m.type === 'presence' && m.count === 2 && m.users.some((u) => u.name === 'An'), 'presence của B có An');
  check('B cũng thấy An trong cùng nhà chung', !!presB);

  // 2b) C join (người thứ 3) — cần có mặt trong nhà để kiểm chứng voice-signal
  // không lọt sang người ngoài cuộc
  const c = await connect('Chi', undefined);
  const joinedC = await waitFor(c, 'joined');
  check('C join vào được nhà chung (người thứ 3)', !!joinedC.id);
  const pres3 = await waitForWhere(a, (m) => m.type === 'presence' && m.count === 3, 'presence 3 người');
  check('presence sau khi C vào: đủ 3 người trong nhà', pres3.users.length === 3 && pres3.users.some((u) => u.name === 'Chi'));

  // 3) seat: A chiếm ghế sofa-1 -> presence của B phải thấy
  a.ws.send(JSON.stringify({ type: 'seat', seatId: 'sofa-1' }));
  const presSeat = await waitForWhere(b, (m) => m.type === 'presence' && m.users.some((u) => u.name === 'An' && u.seatId === 'sofa-1'), 'presence có ghế của An');
  check('seat: B thấy An ngồi sofa-1', !!presSeat);

  // 4) video relay: A đặt video -> B nhận đúng videoId/playing/currentTime/by
  a.ws.send(JSON.stringify({ type: 'video', videoId: 'dQw4w9WgXcQ', playing: true, currentTime: 42, by: 'An' }));
  const vidB = await waitFor(b, 'video');
  check('video: B nhận đồng bộ từ A', vidB.videoId === 'dQw4w9WgXcQ' && vidB.playing === true && vidB.currentTime === 42 && vidB.by === 'An',
    `videoId=${vidB.videoId} t=${vidB.currentTime}`);

  // 5) chat: B nhắn -> A nhận
  b.ws.send(JSON.stringify({ type: 'chat', text: 'chào cả nhà' }));
  const chatA = await waitForWhere(a, (m) => m.type === 'chat' && m.text === 'chào cả nhà', 'chat tới A');
  check('chat: A nhận tin của Bình', chatA.from === 'Bình');

  // 6) game relay nguyên trạng
  const payload = { game: 'ca-ngua', action: 'roll', dice: 6, token: 'do-1' };
  a.ws.send(JSON.stringify({ type: 'game', payload }));
  const gameB = await waitFor(b, 'game');
  check('game: payload relay nguyên trạng tới B', JSON.stringify(gameB.payload) === JSON.stringify(payload));

  // 6b) appearance: presence mà B thấy phải chứa đúng ngoại hình A gửi lúc join
  const presApp = b.inbox.filter((m) => m.type === 'presence').pop();
  const userAinB = presApp.users.find((u) => u.name === 'An');
  check('appearance: B thấy đúng appearance của An trong presence',
    !!userAinB && JSON.stringify(userAinB.appearance) === JSON.stringify(appearanceA),
    userAinB ? JSON.stringify(userAinB.appearance) : 'không có');

  // 6c) move trong biên: A gửi move -> B nhận đúng tọa độ + userId của A
  a.ws.send(JSON.stringify({ type: 'move', x: 3.5, z: -2, rotY: 1.25, sitting: false }));
  const moveB = await waitForWhere(b, (m) => m.type === 'move' && m.userId === joinedA.id, 'move thường tới B');
  check('move: B nhận đúng tọa độ A gửi (trong biên)',
    moveB.x === 3.5 && moveB.z === -2 && moveB.rotY === 1.25 && moveB.sitting === false,
    `x=${moveB.x} z=${moveB.z} rotY=${moveB.rotY}`);

  // 6d) move trong biên rộng (14, -11) — ngoài biên gốc (9, -7) nhưng trong
  // biên biệt thự hiện tại: phải đi NGUYÊN VẸN, không bị kẹp
  a.ws.send(JSON.stringify({ type: 'move', x: 14, z: -11, rotY: 0.5, sitting: false }));
  const moveWide = await waitForWhere(b, (m) => m.type === 'move' && m.x === 14, 'move biên rộng tới B');
  check('move trong biên mới cực rộng đi nguyên vẹn: x=14, z=-11',
    moveWide.x === 14 && moveWide.z === -11 && moveWide.sitting === false,
    `x=${moveWide.x} z=${moveWide.z}`);

  // 6e) move VƯỢT biên biệt thự: server phải kẹp về x=18, z=-12 khi relay cho B
  a.ws.send(JSON.stringify({ type: 'move', x: 99, z: -99, rotY: 0, sitting: true }));
  const moveClamp = await waitForWhere(b, (m) => m.type === 'move' && m.sitting === true, 'move kẹp biên tới B');
  check('move vượt biên bị kẹp khi relay: x=18, z=-12',
    moveClamp.x === 18 && moveClamp.z === -12 && moveClamp.sitting === true,
    `x=${moveClamp.x} z=${moveClamp.z}`);

  // 6f) vị trí đã kẹp được LƯU vào trạng thái: B đổi ghế để kích presence mới,
  // presence phải cho thấy pos hiện tại của An là (18, -12, đang ngồi)
  b.ws.send(JSON.stringify({ type: 'seat', seatId: 'sofa-2' }));
  const presPos = await waitForWhere(b, (m) => m.type === 'presence' &&
    m.users.some((u) => u.name === 'An' && u.pos && u.pos.x === 18 && u.pos.z === -12 && u.pos.sitting === true),
    'presence có pos đã kẹp của An');
  check('move: pos đã kẹp được lưu trong presence', !!presPos);

  // 6f2) move CÓ ĐỘ CAO y ở vùng xa mới (sân thượng cuối vườn): A gửi
  // {x:17, y:4, z:47} — z=47 ngoài mọi biên cũ (z tối đa từng là 12), y=4 là
  // cao độ sân thượng Sky Bar → B nhận NGUYÊN VẸN cả x/y/z
  a.ws.send(JSON.stringify({ type: 'move', x: 17, y: 4, z: 47, rotY: 2.5, sitting: false }));
  const moveHigh = await waitForWhere(b, (m) => m.type === 'move' && m.z === 47, 'move sân thượng tới B');
  check('move có y=4 ở sân thượng (x=17, z=47) đi nguyên vẹn cả 3 trục',
    moveHigh.x === 17 && moveHigh.y === 4 && moveHigh.z === 47 && moveHigh.rotY === 2.5,
    `x=${moveHigh.x} y=${moveHigh.y} z=${moveHigh.z}`);

  // 6f3) pos kèm y được LƯU vào presence: B đổi ghế kích presence mới,
  // An phải hiện đúng (17, y=4, 47) cho người vào sau dựng đúng tầng
  b.ws.send(JSON.stringify({ type: 'seat', seatId: 'sofa-3' }));
  const presHigh = await waitForWhere(b, (m) => m.type === 'presence' &&
    m.users.some((u) => u.name === 'An' && u.pos && u.pos.x === 17 && u.pos.y === 4 && u.pos.z === 47),
    'presence có pos sân thượng của An');
  check('move: pos kèm y=4 được lưu trong presence', !!presHigh);

  // 6f4) move vượt biên CẢ 3 trục (99, 99, 99) → kẹp về (18, 6.5, 48)
  a.ws.send(JSON.stringify({ type: 'move', x: 99, y: 99, z: 99, rotY: 0, sitting: false }));
  const moveClamp3 = await waitForWhere(b, (m) => m.type === 'move' && m.x === 18 && m.z === 48, 'move kẹp 3 trục tới B');
  check('move vượt biên bị kẹp cả 3 trục: x=18, y=6.5, z=48',
    moveClamp3.x === 18 && moveClamp3.y === 6.5 && moveClamp3.z === 48,
    `x=${moveClamp3.x} y=${moveClamp3.y} z=${moveClamp3.z}`);

  // 6f5) move KHÔNG gửi y (client cũ) → y mặc định 0 trong bản relay
  a.ws.send(JSON.stringify({ type: 'move', x: 1, z: 1, rotY: 0, sitting: false }));
  const moveNoY = await waitForWhere(b, (m) => m.type === 'move' && m.x === 1 && m.z === 1, 'move không có y tới B');
  check('move thiếu y: relay có y=0 mặc định', moveNoY.y === 0, `y=${moveNoY.y}`);

  // 6g) action: A đấm (punch) B -> CẢ NHÀ nhận đúng action (kể cả A và C)
  a.ws.send(JSON.stringify({ type: 'action', kind: 'punch', toId: joinedB.id }));
  const actB = await waitForWhere(b, (m) => m.type === 'action' && m.kind === 'punch', 'action punch tới B');
  check('action: B nhận đúng action punch từ A',
    actB.fromId === joinedA.id && actB.fromName === 'An' && actB.toId === joinedB.id,
    `from=${actB.fromName} toId=${actB.toId}`);
  const actA = await waitForWhere(a, (m) => m.type === 'action' && m.kind === 'punch', 'action punch vọng về A');
  const actC = await waitForWhere(c, (m) => m.type === 'action' && m.kind === 'punch', 'action punch tới C');
  check('action: cả nhà nhận (A và C cũng nhận được)', actA.toId === joinedB.id && actC.fromId === joinedA.id);

  // 6h) action kind KHÔNG hợp lệ -> chỉ A nhận lỗi, không broadcast
  a.ws.send(JSON.stringify({ type: 'action', kind: 'le-luoi', toId: joinedB.id }));
  const errKind = await waitForWhere(a, (m) => m.type === 'error' && m.code === 'ACTION_INVALID', 'lỗi ACTION_INVALID cho A');
  await sleep(300);
  check('action: kind lạ bị từ chối ACTION_INVALID và không broadcast',
    !!errKind && !b.inbox.some((m) => m.type === 'action' && m.kind === 'le-luoi') && !c.inbox.some((m) => m.type === 'action' && m.kind === 'le-luoi'));

  // 6i) action tới toId KHÔNG tồn tại -> lỗi nhẹ cho A, không broadcast
  a.ws.send(JSON.stringify({ type: 'action', kind: 'hug', toId: 999999 }));
  const errTgt = await waitForWhere(a, (m) => m.type === 'error' && m.code === 'ACTION_TARGET_NOT_FOUND', 'lỗi ACTION_TARGET_NOT_FOUND cho A');
  await sleep(300);
  check('action: toId không tồn tại bị báo lỗi nhẹ và không broadcast',
    !!errTgt && !b.inbox.some((m) => m.type === 'action' && m.kind === 'hug') && !c.inbox.some((m) => m.type === 'action' && m.kind === 'hug'));

  // 6j) voice-signal: A gửi tín hiệu WebRTC cho B -> CHỈ B nhận, nguyên trạng data
  const sigData = { sdpType: 'offer', sdp: 'v=0-test-sdp', candidates: ['c1', 'c2'] };
  a.ws.send(JSON.stringify({ type: 'voice-signal', toId: joinedB.id, data: sigData }));
  const sigB = await waitForWhere(b, (m) => m.type === 'voice-signal', 'voice-signal tới B');
  check('voice-signal: B nhận đúng từ A, data nguyên trạng',
    sigB.fromId === joinedA.id && JSON.stringify(sigB.data) === JSON.stringify(sigData),
    `fromId=${sigB.fromId}`);
  await sleep(400);
  check('voice-signal: C (người thứ 3) và A đều KHÔNG nhận — không broadcast, không vọng lại',
    !c.inbox.some((m) => m.type === 'voice-signal') && !a.inbox.some((m) => m.type === 'voice-signal'));

  // 6k) voice-signal tới toId KHÔNG tồn tại -> lỗi nhẹ cho người gửi, bỏ qua
  a.ws.send(JSON.stringify({ type: 'voice-signal', toId: 999999, data: { sdpType: 'offer' } }));
  const errVoice = await waitForWhere(a, (m) => m.type === 'error' && m.code === 'VOICE_TARGET_NOT_FOUND', 'lỗi VOICE_TARGET_NOT_FOUND cho A');
  check('voice-signal: toId không tồn tại được báo lỗi nhẹ cho người gửi', !!errVoice);

  // 6l) sync kênh mở: A gửi vl-dj -> B và C nhận NGUYÊN TRẠNG kind/data kèm fromId/fromName
  const djData = { track: 'bai-hat-meo', playing: true, pos: 12.5 };
  a.ws.send(JSON.stringify({ type: 'sync', kind: 'vl-dj', data: djData }));
  const syncB = await waitForWhere(b, (m) => m.type === 'sync' && m.kind === 'vl-dj', 'sync vl-dj tới B');
  const syncC = await waitForWhere(c, (m) => m.type === 'sync' && m.kind === 'vl-dj', 'sync vl-dj tới C');
  check('sync vl-dj: B và C nhận đúng kind/data/fromId',
    syncB.fromId === joinedA.id && syncB.fromName === 'An' &&
    JSON.stringify(syncB.data) === JSON.stringify(djData) &&
    syncC.fromId === joinedA.id && JSON.stringify(syncC.data) === JSON.stringify(djData),
    `from=${syncB.fromName} kind=${syncB.kind}`);
  await sleep(300);
  check('sync: người gửi KHÔNG nhận lại tin của mình (quy ước giống game)',
    !a.inbox.some((m) => m.type === 'sync' && m.kind === 'vl-dj'));

  // 6m) sync kind SAI tiền tố (không có vl-) -> lỗi nhẹ cho A, không broadcast
  a.ws.send(JSON.stringify({ type: 'sync', kind: 'dj-live', data: { x: 1 } }));
  const errSyncKind = await waitForWhere(a, (m) => m.type === 'error' && m.code === 'SYNC_KIND_INVALID', 'lỗi SYNC_KIND_INVALID cho A');
  await sleep(300);
  check('sync: kind sai tiền tố bị từ chối SYNC_KIND_INVALID và không broadcast',
    !!errSyncKind && !b.inbox.some((m) => m.type === 'sync' && m.kind === 'dj-live') &&
    !c.inbox.some((m) => m.type === 'sync' && m.kind === 'dj-live'));

  // 6n) sync kind QUÁ DÀI (>40 ký tự dù có tiền tố vl-) -> cũng bị từ chối
  const longKind = 'vl-' + 'x'.repeat(50);
  a.ws.send(JSON.stringify({ type: 'sync', kind: longKind, data: { x: 1 } }));
  const errSyncLong = await waitForWhere(a, (m) => m.type === 'error' && m.code === 'SYNC_KIND_INVALID' && m.kind === longKind,
    'lỗi SYNC_KIND_INVALID (kind dài) cho A');
  await sleep(300);
  check('sync: kind quá 40 ký tự bị từ chối và không broadcast',
    !!errSyncLong && !b.inbox.some((m) => m.type === 'sync' && m.kind === longKind));

  // 6o) sync data QUÁ LỚN (>16KB sau JSON hoá) -> lỗi nhẹ SYNC_DATA_TOO_LARGE, không broadcast
  a.ws.send(JSON.stringify({ type: 'sync', kind: 'vl-state', data: 'x'.repeat(20000) }));
  const errSyncBig = await waitForWhere(a, (m) => m.type === 'error' && m.code === 'SYNC_DATA_TOO_LARGE', 'lỗi SYNC_DATA_TOO_LARGE cho A');
  await sleep(300);
  check('sync: data >16KB bị từ chối SYNC_DATA_TOO_LARGE và không broadcast',
    !!errSyncBig && !b.inbox.some((m) => m.type === 'sync' && m.kind === 'vl-state') &&
    !c.inbox.some((m) => m.type === 'sync' && m.kind === 'vl-state'));

  // 7) chặn vượt cap (chỉ có ý nghĩa khi server chạy ROOM_CAP=3: nhà đã có A, B, C)
  const cap = presA.cap;
  if (cap === 3) {
    const d = await connect('Dung', 'mot-phong-khac-nua'); // khai room khác cũng không thoát cap của nhà chung
    const err = await waitFor(d, 'error');
    check('cap: người thứ 4 (cap=3) bị từ chối ROOM_FULL dù khai room khác', err.code === 'ROOM_FULL', err.message);
    await sleep(300);
    const stillThree = a.inbox.filter((m) => m.type === 'presence').pop();
    check('cap: nhà vẫn đúng 3 người sau khi từ chối', stillThree.count === 3);
    d.ws.close();
  } else {
    console.log(`  SKIP  kiểm chứng chặn cap (server đang cap=${cap}; chạy ROOM_CAP=3 để test mục này)`);
  }

  a.ws.close(); b.ws.close(); c.ws.close();
  await sleep(200);
  console.log(`\nKết quả: ${pass} PASS, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('TEST LỖI:', e.message); process.exit(1); });
