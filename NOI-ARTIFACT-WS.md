# Nối artifact 3D `nha-xem-phim-chung` vào máy chủ WebSocket — bản chuẩn bị

Ghi ngày 2026-11-14 ~10:20 (giờ VN), sau khi bản 3D được giao lúc 10:15.
CHƯA sửa code — đây là bản đồ nối dây để main agent áp trong một lượt,
khi chủ nhân phản hồi kết quả test 3D hoặc bảo nối online / deploy.

## Khoảng hở đã kiểm chứng bằng đọc code (không phải đoán)

- Artifact 3D `~/workspace/ts-spaces/nha-xem-phim-chung/index.html`
  (2.518 dòng, sửa lần cuối 03:14 UTC) **không có WebSocket nào**:
  lớp `Transport` (dòng ~867) chỉ dùng `BroadcastChannel('lang-meo-room')`
  — đồng bộ giữa các tab trên **cùng một máy**. Chú thích trong file tự ghi
  "thay bằng WebSocket ở đợt sau".
- Máy chủ `~/workspace/nha-xem-phim-online/server.js` đã có đủ giao thức
  (join/move/seat/video/chat/game, cap 30, kẹp biên) và test local
  15/15 PASS (`TEST.md`). Client mẫu `public/index.html:154` đã dùng
  WebSocket thật. Chỉ artifact 3D là chưa nối.
- Nghĩa là: bản 3D hiện tại chơi đúng trên 1 máy (đi lại, ngồi sofa,
  chiếu YouTube, cờ cá ngựa/bi-a), nhưng **2 máy khác nhau vào vẫn không
  thấy nhau** — đúng yêu cầu "30 người online" chủ nhân chốt lúc 02:45 UTC
  thì chưa đạt. Không được nói với anh là online đã xong.

## Chuỗi việc còn lại (theo thứ tự)

1. Nối Transport của artifact sang WebSocket (bản đồ dưới đây).
2. Chủ nhân deploy gói server lên Render bằng tài khoản của anh
   (README.md mục Deploy: đưa lên git repo → Blueprint → Apply;
   chưa deploy thì chưa có địa chỉ `wss://` để artifact trỏ tới).
3. Cấu hình `WS_URL` trong artifact = `wss://<địa-chỉ-render>/`,
   rồi test 2 máy/trình duyệt khác nhau: vào nhà, thấy nhau đi lại,
   ngồi ghế, đổi video.

## Bản đồ giao thức (server ↔ artifact)

| Tính năng | Server (`server.js`) | Artifact hiện tại | Cách nối |
|---|---|---|---|
| Vào nhà | `join {name, appearance}` → trả `joined {id, name, house, cap}` + `presence` | `join`/`presence` qua BroadcastChannel, member id chuỗi `m…` | Gửi `join` khi socket mở; `id` số của server đổi thành chuỗi `'ws-'+id` để khớp `members` Map |
| Ngoại hình | `appearance {skin, hair, shirt, hairStyle, accessory}` | avatar `{skin, hairColor, shirt, style, face, accessory}` | Ánh xạ `hairColor→hair`, `style→hairStyle`; `face` chỉ giữ local (server không có trường này, đừng gửi) |
| Di chuyển | `move {x, z, rotY, sitting}` (boolean), server kẹp x∈[-9,9], z∈[-7,7], relay trừ người gửi | `sendMove()` gửi `sitting: RoomState.me.seat` (chuỗi ghế hoặc null) | Gửi `sitting: !!seat`; ghế đổi riêng bằng tin `seat` (dưới đây). Nghe `move` theo `userId` cập nhật vị trí nhân vật |
| Ghế | `seat {seatId}` / `null` = trả ghế; server chặn trùng ghế (`SEAT_TAKEN`) | `seat` là chuỗi trong member, tự dàn xếp bằng `joinedAt` | Gửi `seat` khi ngồi/đứng; nghe `seat` + `presence` để vẽ lại; bỏ luật tự dàn xếp local khi ở chế độ WS |
| Video | `video {videoId, playing, currentTime, by}` | `screen {videoId, url, byName}`, `applyScreen()` chỉ đặt `src` iframe + autoplay | Gửi `video` với `playing:true, currentTime:0` khi dán link; nghe `video` → `applyScreen`. **Giới hạn đã biết:** iframe hiện tại không seek/pause theo `currentTime`/`playing` — muốn đồng bộ tua/dừng thật cần YouTube IFrame API, ghi rõ với anh nếu làm |
| Chat | `chat {text}` / nhận `{from, userId, text, ts}` | **Không có ô chat trong artifact** (grep `chat` = 0 kết quả; chỉ có feed join/leave/screen) | Thêm ô chat tối thiểu hoặc hoãn có chủ đích — đừng tuyên bố "có chat" khi chưa thêm |
| Game | `game {payload}` relay nguyên trạng | `game-status {game, text}` (chữ) | Gói thành `payload {game, text}` và xử lý `payload` nhận về như sự kiện local |
| Reaction | Server không có loại tin này | `reaction {emoji}` qua BroadcastChannel | Gói vào `game` payload `{kind:'reaction', emoji}` hoặc bỏ qua ở chế độ WS — chọn một, đừng im lặng mất tính năng |
| Danh sách/x/30 | `presence {count, cap, users[{id,name,seatId,appearance,pos}]}` | `members` Map + `pruneMembers()` xóa sau 9s không thấy | **Bẫy:** server chỉ broadcast `presence` khi join/leave/đổi ghế, không gửi theo `move` — người đứng yên sẽ bị `pruneMembers()` xóa sau 9s. Khi ở chế độ WS phải tắt prune cho peer WS (hoặc heartbeat presence), chỉ prune khi mất kết nối |
| Nhà đầy | `error {code:'ROOM_FULL'}` | Chưa xử lý | Hiện toast "Nhà đã đủ 30 người" và chặn vào, không gợi ý phòng khác (chỉ có 1 nhà) |
| Biên phòng | Server kẹp x∈[-9,9], z∈[-7,7] | `WORLD` x∈[-7.9,7.9], z∈[-5.6,5.9] | Thống nhất một biên (khuyến nghị lấy biên artifact, sửa server `BOUND_X/Z` thành 7.9/5.9 hoặc kẹp vị trí remote khi render) — nếu không, người remote có thể đứng ngoài tường |

## Phần 3D local — kiểm tra bằng đọc code, không thấy lỗi

- `positionYtOverlay()` (~dòng 1598): chiếu 4 góc `screenCorners`
  (y 1.0–5.3, z -5.82, khớp mặt màn hình ở z -5.83) qua camera rồi đặt
  iframe theo đúng khung — logic đúng, chỉ chưa được nhìn tận mắt
  (Three.js r128 qua cdnjs, môi trường này không tải được để xem).
- `sendMove()` (~1041), WASD/joystick, nút hành động theo khoảng cách
  (ngồi <2.0, bi-a <2.7, cờ <2.3), `buildHouse()` — không thấy lỗi logic.
- Phần chưa kiểm chứng vẫn là đúng thứ đã nhờ anh test lúc 10:15:
  di chuyển có mượt không, video có khớp khung màn hình không.

## Không làm trong lượt này

- Không sửa `index.html` của artifact hay `server.js` (sửa mù không có
  browser test sẽ vi phạm luật verify-before-ship của Studio).
- Không nhắc anh ngay: tin nhờ test mới gửi lúc 10:15, chỉ 2 phút trước
  bản ghi này — chờ anh trả lời test rồi mới đưa việc nối online này vào
  cùng một tin, hoặc khi anh bảo deploy/nối online.

---

## Bổ sung 2026-11-14 (sau bản chụp trên — phía server, đã test 34/34)

Bản đồ ở trên chụp trạng thái ~10:20; phía server đã thay đổi các điểm
sau, khi nối artifact thật hãy lấy theo đây (chi tiết: README + TEST.md):

- **Biên server không còn 9/7 hay 16/12**: bản "Biệt thự Làng Mèo" kẹp
  `move` ở **x ∈ [-18, 18], z ∈ [-12, 48]** và có thêm **độ cao
  `y ∈ [0, 6.5]`** trong `move`/`presence.pos` (thiếu `y` → 0). Phần
  "Biên phòng" trong bảng trên và khuyến nghị lấy biên artifact 7.9/5.9
  đã lỗi thời — artifact hiện tại đi trong đúng biên biệt thự này.
- **Kênh đồng bộ mở `sync {kind, data}`**: kind bắt đầu bằng `vl-`
  (≤ 40 ký tự, data ≤ 16KB) được broadcast nguyên trạng trừ người gửi —
  artifact dùng cho bàn DJ (`vl-dj`), màn hình Sky Bar (`vl-bar`),
  `vl-state`, `vl-slide`… Khi nối Transport sang WS, các sự kiện local
  dạng `vl-*` của artifact ánh xạ thẳng vào kênh này.
