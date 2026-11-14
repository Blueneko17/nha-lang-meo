# Kết quả tự test ở local — mô hình 1 NHÀ CHUNG DUY NHẤT — 2026-11-14

## Cập nhật: BIỆT THỰ LÀNG MÈO — move có độ cao `y`, biên x ∈ [-18,18] / z ∈ [-12,48], kênh `sync` tiền tố `vl-` — 2026-11-14

Theo bản mở rộng phía client (vườn + hồ bơi + dãy phòng + sân thượng
Sky Bar; kế hoạch `KE-HOACH-CHAU-CHUOT-CHO-MUSE__1.md` đợt 2):

- Tin `move` nhận thêm trường độ cao `y` (số, **kẹp [0, 6.5]**; thiếu →
  mặc định 0): server lưu vào `pos` của người chơi, relay kèm `pos`, và
  `presence` cũng mang `y` — người vào sau thấy người khác đứng đúng tầng
  (mặt đất 0, tầng lửng ~3.2, sân thượng 4.0). Client cũ không gửi `y`
  vẫn chạy bình thường.
- Biên kẹp đổi từ x ∈ [-16,16], z ∈ [-12,12] thành **x ∈ [-18, 18],
  z ∈ [-12, 48]** — hằng `BOUND_X=18`, `BOUND_Z_MIN=-12`,
  `BOUND_Z_MAX=48`, `BOUND_Y_MAX=6.5` trong [server.js](server.js);
  README và client mẫu `public/index.html` (chú thích + hàm kẹp phía
  client) đã ghi biên mới. (Độ sâu hồ bơi −0.72 là độ cao LOCAL phía
  client; server chỉ giữ y ≥ 0 theo luật kẹp này.)
- Loại tin chung mới `sync {kind, data}` — KÊNH ĐỒNG BỘ MỞ: `kind` tuỳ ý
  bắt đầu bằng tiền tố **`vl-`** (client đang dùng `vl-dj`, `vl-bar`,
  `vl-state`, `vl-slide`…), tối đa 40 ký tự; `data` JSON ≤ 16KB. Hợp lệ
  → broadcast `{type:'sync', kind, data, fromId, fromName}` cho cả nhà
  **trừ người gửi** (đúng quy ước relay của `game` — trả lời điểm 1
  trong mục "Muse cần kiểm tra ngay" của kế hoạch: transport nay ĐÃ cho
  phép loại tin tuỳ ý tiền tố `vl-`). Kind sai tiền tố/quá dài → lỗi
  `SYNC_KIND_INVALID`; data quá lớn → lỗi `SYNC_DATA_TOO_LARGE`; cả hai
  chỉ báo cho người gửi, không broadcast.

Chạy lại **toàn bộ** test với server `ROOM_CAP=3 PORT=3100`:
**34 PASS / 0 FAIL** (25 kiểm của lượt trước chạy lại PASS toàn bộ — 2
kiểm kẹp biên được sửa kỳ vọng theo biên mới, x kẹp 16 → 18 — cộng 9
kiểm mới):

```
  PASS  move có y=4 ở sân thượng (x=17, z=47) đi nguyên vẹn cả 3 trục — x=17 y=4 z=47
  PASS  move: pos kèm y=4 được lưu trong presence
  PASS  move vượt biên bị kẹp cả 3 trục: x=18, y=6.5, z=48 — x=18 y=6.5 z=48
  PASS  move thiếu y: relay có y=0 mặc định — y=0
  PASS  sync vl-dj: B và C nhận đúng kind/data/fromId — from=An kind=vl-dj
  PASS  sync: người gửi KHÔNG nhận lại tin của mình (quy ước giống game)
  PASS  sync: kind sai tiền tố bị từ chối SYNC_KIND_INVALID và không broadcast
  PASS  sync: kind quá 40 ký tự bị từ chối và không broadcast
  PASS  sync: data >16KB bị từ chối SYNC_DATA_TOO_LARGE và không broadcast
```

Chi tiết các kiểm mới:
- `move {x:17, y:4, z:47}` (điểm sân thượng Sky Bar ở cuối vườn — z=47
  ngoài mọi biên cũ) → B nhận **nguyên vẹn cả 3 trục** kèm rotY; đổi ghế
  kích `presence` mới → `pos` của An trong presence đúng
  `{x:17, y:4, z:47}`.
- `move {x:99, y:99, z:99}` → relay đã kẹp về **(18, 6.5, 48)**.
- `move` không có trường `y` (client cũ) → bản relay có `y: 0`.
- `sync vl-dj`: A gửi `data {track, playing, pos}` → B và C đều nhận
  đúng `kind`/`data`/`fromId`/`fromName` (so sánh chuỗi JSON của data);
  sau 300 ms hộp thư của A **không có** tin `sync` nào — không vọng lại
  người gửi.
- Từ chối: kind `dj-live` (thiếu tiền tố) và kind `vl-` + 50 ký tự
  (dài 53 > 40) → A nhận `SYNC_KIND_INVALID`, B/C không nhận được gì;
  `data` là chuỗi 20.000 ký tự với kind `vl-state` → A nhận
  `SYNC_DATA_TOO_LARGE`, B/C không nhận được gì.

## Kiểm thêm
- Đã chạy lại lần 2 để xác nhận trạng thái cuối: vẫn **34 PASS / 0 FAIL**.
- `GET /healthz` lúc server test chạy → `{"ok":true,"house":"Nhà Làng Mèo","users":0,"cap":3}`;
  chạy mặc định (cổng 3102) → `cap:30`.
- Trang `/` hiện đúng chú thích biên mới `x∈[-18,18], z∈[-12,48]`, có nút
  gửi sync thử (`sendSyncTest`); JS nội tuyến của client mẫu trích ra
  kiểm cú pháp bằng `node --check`: OK.
- Mọi server test đã tắt sạch (kiểm lại: không còn tiến trình
  `server.js`, cổng 3100/3102 đều đóng).

## Cách chạy lại test
```bash
ROOM_CAP=3 PORT=3100 npm start   # terminal 1
WS_URL=ws://localhost:3100 npm test   # terminal 2
```

---

## Cập nhật: MỞ RỘNG BIÊN PHÒNG 3D CỰC RỘNG — x ∈ [-16,16], z ∈ [-12,12] — 2026-11-14

Biên kẹp tọa độ của tin `move` đổi từ x ∈ [-9,9], z ∈ [-7,7] thành
**x ∈ [-16,16], z ∈ [-12,12]** (`BOUND_X=16`, `BOUND_Z=12` trong
[server.js](server.js); README và client mẫu `public/index.html` — cả
chú thích lẫn hàm kẹp phía client — đã ghi biên mới).

Chạy lại **toàn bộ** test với server `ROOM_CAP=3 PORT=3100`:
**25 PASS / 0 FAIL** (24 kiểm cũ giữ nguyên và PASS lại toàn bộ + 1 kiểm mới):

```
  PASS  move trong biên mới cực rộng đi nguyên vẹn: x=14, z=-11 — x=14 z=-11
  PASS  move vượt biên mới bị kẹp khi relay: x=16, z=-12 — x=16 z=-12
  PASS  move: pos đã kẹp được lưu trong presence
```

- `move (14, -11)` — ngoài biên cũ nhưng trong biên mới → B nhận **nguyên vẹn**,
  không bị kẹp.
- `move (99, -99)` vượt biên mới → bị kẹp về **(16, -12)** khi relay, và vị trí
  đã kẹp được lưu vào `presence` như cũ.
- Kiểm phụ: chạy mặc định (không đặt ROOM_CAP, cổng 3102) → `/healthz` báo
  `cap:30`; trang `/` hiện đúng chú thích biên mới `x∈[-16,16], z∈[-12,12]`.
- Server test đã tắt sau khi đo (không còn tiến trình `server.js`).



## Môi trường
- Node trong máy này, dependencies cài bằng `npm install` (express + ws).
- Server test chạy với `ROOM_CAP=2 PORT=3100` để kiểm chứng được cả việc chặn vượt cap.
- Script test: `test/test-ws.js` (mở các kết nối WebSocket thật bằng thư viện `ws`).

## Kết quả đo được: 11 PASS / 0 FAIL

```
Test nối tới ws://localhost:3100 — mô hình 1 nhà chung duy nhất
  PASS  A join không gửi room vẫn vào được, nhận joined + id — house=Nhà Làng Mèo
  PASS  presence sau khi A vào: 1 người — count=1/2
  PASS  B join có khai room lạ vẫn vào được nhà chung
  PASS  B khác "room" tự khai vẫn chung nhà: A thấy đủ 2 người — users=An,Bình
  PASS  B cũng thấy An trong cùng nhà chung
  PASS  seat: B thấy An ngồi sofa-1
  PASS  video: B nhận đồng bộ từ A — videoId=dQw4w9WgXcQ t=42
  PASS  chat: A nhận tin của Bình
  PASS  game: payload relay nguyên trạng tới B
  PASS  cap: người thứ 3 (cap=2) bị từ chối ROOM_FULL dù khai room khác — Nhà Làng Mèo đã đủ 2 người. Vui lòng quay lại sau.
  PASS  cap: nhà vẫn đúng 2 người sau khi từ chối

Kết quả: 11 PASS, 0 FAIL
```

Các điểm mới so với bản nhiều phòng trước đây:
- Client A **không gửi trường `room`** trong tin `join` → vẫn vào được nhà chung.
- Client B tự khai `room: "phong-rieng-cua-b"` và client thứ 3 khai
  `room: "mot-phong-khac-nua"` → server **bỏ qua** trường `room`:
  B vẫn ở chung nhà với A (cả hai thấy nhau trong cùng `presence`),
  và client thứ 3 vẫn bị chặn bởi cap của nhà chung, không thoát bằng room khác.

## Kiểm thêm
- `GET /healthz` khi ROOM_CAP=2 → `{"ok":true,"house":"Nhà Làng Mèo","users":0,"cap":2}`
- `GET /` → phục vụ client mẫu mới: tiêu đề "Nhà Làng Mèo — phòng chung duy nhất",
  **không còn ô nhập mã phòng** (kiểm tra `id="room"` trong HTML: 0 kết quả).
- Chạy server không đặt ROOM_CAP (cổng 3102) → `/healthz` báo
  `{"ok":true,"house":"Nhà Làng Mèo","users":0,"cap":30}` (đúng mặc định 30 người).
- Các server test đã tắt hết sau khi đo.

## Cách chạy lại test
```bash
ROOM_CAP=2 PORT=3100 npm start   # terminal 1
WS_URL=ws://localhost:3100 npm test   # terminal 2
```

---

# Bổ sung giao thức di chuyển 3D — 2026-11-14

Theo cơ chế chủ nhân chốt (giống trang centerhcinema): mọi người là nhân vật
3D di chuyển tự do trong nhà.

## Đã cài
- `join` nhận thêm `appearance {skin, hair, shirt, hairStyle, accessory}` —
  server chuẩn hoá (chỉ giữ 5 trường này, dạng chuỗi ngắn), lưu vào trạng
  thái user và phát lại trong `presence` (mỗi user giờ kèm `appearance` + `pos`).
- Tin mới `move {x, z, rotY, sitting}`: server **kẹp** `x ∈ [-9, 9]`,
  `z ∈ [-7, 7]`, lưu vị trí vào trạng thái user, broadcast
  `{type:'move', userId, name, x, z, rotY, sitting}` cho cả nhà **trừ người
  gửi**. Relay nguyên trạng theo tần suất client gửi, không lưu lịch sử —
  người vào sau thấy vị trí hiện tại qua `presence`.
- Client mẫu `public/index.html`: thêm chọn ngoại hình lúc vào nhà, hiện
  tọa độ từng người trong danh sách, và cụm nút di chuyển thử (4 hướng +
  Ngồi/Đứng) gửi tin `move`; nhận `move` thì cập nhật tọa độ hiển thị.

## Kết quả đo được (chạy lại cùng bộ test cũ + 4 kiểm mới): 15 PASS / 0 FAIL

```
  PASS  appearance: B thấy đúng appearance của An trong presence — {"skin":"sang","hair":"nau","shirt":"xanh","hairStyle":"dai","accessory":"tai-meo"}
  PASS  move: B nhận đúng tọa độ A gửi (trong biên) — x=3.5 z=-2 rotY=1.25
  PASS  move vượt biên bị kẹp khi relay: x=9, z=-7 — x=9 z=-7
  PASS  move: pos đã kẹp được lưu trong presence
```
(11 kiểm cũ ở mục trên vẫn PASS nguyên vẹn trong cùng lượt chạy.)

Chi tiết 4 kiểm mới:
- A join gửi `appearance` đầy đủ 5 trường → `presence` mà B nhận được chứa
  đúng object đó ở user An.
- A gửi `move {x:3.5, z:-2, rotY:1.25, sitting:false}` → B nhận `move`
  đúng cả 4 giá trị, kèm `userId` của A.
- A gửi `move {x:99, z:-99, rotY:0, sitting:true}` (vượt biên) → B nhận
  bản đã kẹp `x=9, z=-7, sitting=true`.
- Kiểm lưu trạng thái: B đổi ghế để kích `presence` mới → `pos` của An
  trong presence là `{x:9, z:-7, rotY:0, sitting:true}` (bản đã kẹp).

## Kiểm thêm
- `GET /healthz` (chạy mặc định, cổng 3103) → `{"ok":true,"house":"Nhà Làng Mèo","users":0,"cap":30}`.
- Trang `/` phục vụ client mẫu mới: có đủ 5 nút `data-move`/Ngồi-Đứng và ô
  chọn phụ kiện `apAccessory`.
- Các server test đã tắt hết sau khi đo (kiểm lại: không còn tiến trình
  `server.js`, cổng 3100/3103 đều đóng).

---

# Bổ sung tương tác người chơi (`action`) + tín hiệu voice (`voice-signal`) — 2026-11-14

Theo yêu cầu mới của chủ nhân cho bản 3D: người chơi tương tác đùa được với
nhau (đấm/đá/…) và có kênh tín hiệu để nói chuyện voice trong phòng.

## Đã cài
- Tin mới `action {kind, toId}` — `kind` chỉ nhận `punch`, `kick`, `wave`,
  `hug`, `highfive`. Server kiểm tra kind hợp lệ + `toId` đang có mặt trong
  nhà, rồi broadcast `{type:'action', kind, fromId, fromName, toId, toName}`
  cho **cả nhà** (kể cả người gửi) để mọi client cùng chạy hoạt cảnh.
  Không có sát thương, không có điểm số. kind lạ → lỗi `ACTION_INVALID`
  chỉ cho người gửi; toId không tồn tại → lỗi `ACTION_TARGET_NOT_FOUND`
  chỉ cho người gửi; cả hai trường hợp đều không broadcast.
- Tin mới `voice-signal {toId, data}` — kênh tín hiệu WebRTC (SDP
  offer/answer, ICE candidate): server chuyển tiếp `data` **nguyên trạng**
  kèm `fromId` tới **đúng socket của người nhận**, không broadcast, không
  lưu. toId không tồn tại → lỗi nhẹ `VOICE_TARGET_NOT_FOUND` cho người gửi
  rồi bỏ qua.
- Client mẫu `public/index.html`: thêm cụm "Tương tác với người chơi" —
  ô chọn người (từ `presence`), 5 nút động tác gửi `action`, nút "Gửi
  voice-signal thử" và nhật ký hiển thị `action`/`voice-signal` nhận được
  (kèm ghi chú client thật dùng `data` làm offer/answer/ICE).

## Môi trường lượt này
- Server test chạy `ROOM_CAP=3 PORT=3100`. Lý do cap=3 (thay vì 2 như các
  lượt trước): kiểm chứng voice-signal cần **3 người cùng ở trong nhà**
  (người gửi, người nhận, và người thứ ba phải KHÔNG nhận được). Kiểm cap
  do đó chuyển sang client thứ 4 (Dung) — vẫn là nguyên tắc cap+1 bị chặn.
- Toàn bộ kiểm cũ được giữ nguyên và chạy lại trong cùng lượt.

## Kết quả đo được: 24 PASS / 0 FAIL

```
Test nối tới ws://localhost:3100 — mô hình 1 nhà chung duy nhất
  PASS  A join không gửi room vẫn vào được, nhận joined + id — house=Nhà Làng Mèo
  PASS  presence sau khi A vào: 1 người — count=1/3
  PASS  B join có khai room lạ vẫn vào được nhà chung
  PASS  B khác "room" tự khai vẫn chung nhà: A thấy đủ 2 người — users=An,Bình
  PASS  B cũng thấy An trong cùng nhà chung
  PASS  C join vào được nhà chung (người thứ 3)
  PASS  presence sau khi C vào: đủ 3 người trong nhà
  PASS  seat: B thấy An ngồi sofa-1
  PASS  video: B nhận đồng bộ từ A — videoId=dQw4w9WgXcQ t=42
  PASS  chat: A nhận tin của Bình
  PASS  game: payload relay nguyên trạng tới B
  PASS  appearance: B thấy đúng appearance của An trong presence — {"skin":"sang","hair":"nau","shirt":"xanh","hairStyle":"dai","accessory":"tai-meo"}
  PASS  move: B nhận đúng tọa độ A gửi (trong biên) — x=3.5 z=-2 rotY=1.25
  PASS  move vượt biên bị kẹp khi relay: x=9, z=-7 — x=9 z=-7
  PASS  move: pos đã kẹp được lưu trong presence
  PASS  action: B nhận đúng action punch từ A — from=An toId=2
  PASS  action: cả nhà nhận (A và C cũng nhận được)
  PASS  action: kind lạ bị từ chối ACTION_INVALID và không broadcast
  PASS  action: toId không tồn tại bị báo lỗi nhẹ và không broadcast
  PASS  voice-signal: B nhận đúng từ A, data nguyên trạng — fromId=1
  PASS  voice-signal: C (người thứ 3) và A đều KHÔNG nhận — không broadcast, không vọng lại
  PASS  voice-signal: toId không tồn tại được báo lỗi nhẹ cho người gửi
  PASS  cap: người thứ 4 (cap=3) bị từ chối ROOM_FULL dù khai room khác — Nhà Làng Mèo đã đủ 3 người. Vui lòng quay lại sau.
  PASS  cap: nhà vẫn đúng 3 người sau khi từ chối

Kết quả: 24 PASS, 0 FAIL
```

Chi tiết các kiểm mới:
- `action`: A gửi `{kind:'punch', toId:<id của B>}` → B nhận đúng
  `fromId/fromName/toId`; A (người gửi) và C đều nhận được cùng tin —
  đúng tính chất broadcast cả nhà để chạy hoạt cảnh đồng bộ.
- `voice-signal`: A gửi cho B gói `data` gồm sdp + 2 candidate → B nhận
  **y hệt** (so sánh chuỗi JSON), kèm `fromId` của A. Sau 400 ms, hộp thư
  của C không có tin `voice-signal` nào và của A cũng không có (không
  broadcast, không vọng lại người gửi).

## Kiểm thêm
- `GET /healthz` trong lúc server test chạy → `{"ok":true,"house":"Nhà Làng Mèo","users":0,"cap":3}`.
- JS nội tuyến của client mẫu trích ra kiểm cú pháp bằng `node --check`: OK;
  trang có đủ 5 nút `data-action`, ô chọn người `targetUser` và nút gửi
  `voice-signal` thử.
- Server test đã tắt sau khi đo (kiểm lại: không còn tiến trình `server.js`).

## Cách chạy lại test
```bash
ROOM_CAP=3 PORT=3100 npm start   # terminal 1
WS_URL=ws://localhost:3100 npm test   # terminal 2
```
