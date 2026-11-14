# 🐱 Nhà Làng Mèo — máy chủ online (1 nhà chung duy nhất)

Máy chủ đồng bộ thời gian thực cho "Nhà xem phim chung": **chỉ có một server,
một nhà chung duy nhất** — không có khái niệm nhiều phòng / mã phòng. Ai vào
cũng vào cùng **Nhà Làng Mèo**, thấy danh sách nhau (tối đa **30 người**),
chiếm ghế sofa, đồng bộ video YouTube (chiếu/dừng/tua cùng lúc), chat,
tương tác đùa giữa người chơi (đấm/đá/vẫy tay/ôm/đập tay — chỉ là hoạt
cảnh, không sát thương), kênh tín hiệu voice WebRTC 1-1, relay sự kiện
game (cờ cá ngựa, bi-a), và kênh đồng bộ mở `sync` (tiền tố `vl-`) cho các
tính năng biệt thự (bàn DJ, màn hình Sky Bar, slide…). Vị trí người chơi
giờ có cả độ cao `y` (tầng lửng, sân thượng). Client tĩnh được phục vụ
luôn từ thư mục `public/`.

Công nghệ: Node.js + Express (trang tĩnh) + `ws` (WebSocket), chạy chung 1 cổng.

## Chạy ở local

```bash
npm install
npm start            # mặc định cổng 3000, mở http://localhost:3000
```

Biến môi trường:

| Biến       | Mặc định | Ý nghĩa                                   |
|------------|----------|-------------------------------------------|
| `PORT`     | `3000`   | Cổng chạy (Render tự cấp, không cần đặt)  |
| `ROOM_CAP` | `30`     | Số người tối đa trong nhà chung           |

## Giao thức WebSocket (JSON)

Kết nối tới cùng địa chỉ với trang web, đổi `http→ws`, `https→wss`.

> **Không còn trường `room`.** Client bản cũ còn gửi `room` trong tin `join`
> cũng không sao — server **bỏ qua** trường đó, tất cả vẫn vào một nhà chung.

**Client → Server**

| type     | Trường                                            | Ý nghĩa |
|----------|---------------------------------------------------|---------|
| `join`   | `name`, `appearance` (tuỳ chọn)                   | Vào nhà chung (trường `room` nếu có sẽ bị bỏ qua). `appearance = {skin, hair, shirt, hairStyle, accessory}` — ngoại hình nhân vật 3D, server lưu và phát lại trong `presence` |
| `move`   | `x`, `y`, `z`, `rotY`, `sitting`                  | Nhân vật 3D di chuyển tự do trong khu đất BIỆT THỰ: server **kẹp** `x ∈ [-18, 18]`, `z ∈ [-12, 48]` (vườn kéo dài về phía sau), độ cao `y ∈ [0, 6.5]` (thiếu `y` → mặc định 0), lưu vị trí hiện tại vào trạng thái người dùng, relay cho cả nhà **trừ người gửi** (không lưu lịch sử) |
| `seat`   | `seatId` (chuỗi; `null` = trả ghế)                | Chiếm/trả ghế sofa |
| `video`  | `videoId`, `playing`, `currentTime`, `by`         | Đặt/trạng thái video cần đồng bộ |
| `chat`   | `text`                                            | Nhắn trong nhà |
| `action` | `kind`, `toId`                                    | Tương tác giữa người chơi: `kind` ∈ `punch`, `kick`, `wave`, `hug`, `highfive`; `toId` = id người bị tác động (lấy từ `presence`). Chỉ hiệu ứng đùa — không sát thương, không điểm số |
| `voice-signal` | `toId`, `data` (bất kỳ)                     | Tín hiệu WebRTC (SDP offer/answer, ICE candidate) — server chuyển tiếp **nguyên trạng** `data` tới đúng người nhận, không broadcast, không lưu |
| `game`   | `payload` (bất kỳ)                                | Sự kiện game — server relay **nguyên trạng** |
| `sync`   | `kind`, `data` (bất kỳ, JSON ≤ 16KB)              | Kênh đồng bộ MỞ cho tính năng biệt thự: `kind` tuỳ ý nhưng **bắt buộc bắt đầu bằng `vl-`** và ≤ 40 ký tự (`vl-dj`, `vl-bar`, `vl-state`, `vl-slide`…); server broadcast **nguyên trạng** cho cả nhà **trừ người gửi** (cùng quy ước `game`) |

**Server → Client**

| type       | Trường                                             | Ý nghĩa |
|------------|----------------------------------------------------|---------|
| `joined`   | `id`, `name`, `house`, `cap`, `appearance`, `pos`  | Xác nhận đã vào nhà (`house` = "Nhà Làng Mèo") |
| `presence` | `count`, `cap`, `users[{id,name,seatId,appearance,pos}]` | Danh sách người trong nhà (broadcast mỗi khi có thay đổi) — hiển thị dạng `count/cap`, ví dụ 7/30. Mỗi user kèm `appearance` (ngoại hình 3D) và `pos = {x, y, z, rotY, sitting}` (vị trí hiện tại kèm độ cao — người vào sau dựng nhân vật đúng chỗ, đúng tầng từ đây) |
| `move`     | `userId`, `name`, `x`, `y`, `z`, `rotY`, `sitting` | Ai đó vừa di chuyển — tọa độ + độ cao đã được server kẹp biên (không gửi lại người gửi) |
| `seat`     | `userId`, `name`, `seatId`                         | Ai đó đổi ghế |
| `video`    | `videoId`, `playing`, `currentTime`, `by`          | Đồng bộ video cho cả nhà (không gửi lại người gửi) |
| `chat`     | `from`, `userId`, `text`, `ts`                     | Tin nhắn |
| `action`   | `kind`, `fromId`, `fromName`, `toId`, `toName`     | Ai đó vừa tương tác với ai đó — broadcast **cả nhà** (kể cả người gửi) để mọi client cùng chạy hoạt cảnh |
| `voice-signal` | `fromId`, `fromName`, `data`                   | Tín hiệu WebRTC từ một người — **chỉ người nhận được chỉ định mới nhận được tin này**, người khác trong nhà không hề thấy |
| `game`     | `from`, `userId`, `payload`                        | Sự kiện game relay từ người chơi khác |
| `sync`     | `kind`, `data`, `fromId`, `fromName`               | Sự kiện đồng bộ mở từ một người trong nhà — client rẽ xử lý theo `kind` (`vl-dj`, `vl-bar`…); không gửi lại người gửi |
| `error`    | `code`, `message`                                  | Lỗi. `code: "ROOM_FULL"` = nhà đã đủ 30 người (người thứ 31 bị từ chối); `"SEAT_TAKEN"` = ghế đã có người; `"NOT_JOINED"` = chưa vào nhà; `"ACTION_INVALID"` = `kind` của `action` không hợp lệ; `"ACTION_TARGET_NOT_FOUND"` / `"VOICE_TARGET_NOT_FOUND"` = người được chọn không còn trong nhà (chỉ báo cho người gửi, các tin đó bị bỏ qua); `"SYNC_KIND_INVALID"` = `kind` của `sync` không bắt đầu bằng `vl-` hoặc dài quá 40 ký tự; `"SYNC_DATA_TOO_LARGE"` = `data` của `sync` vượt 16KB sau JSON hoá (cả hai chỉ báo cho người gửi, không broadcast) |

Kiểm tra sức khỏe: `GET /healthz` → `{"ok":true,"house":"Nhà Làng Mèo","users":<số người đang trong nhà>,"cap":30}`.

## Deploy lên Render (bằng tài khoản của chủ nhân)

Gói này **chưa được deploy** — các bước dưới đây do chủ nhân thực hiện bằng
tài khoản Render của mình:

1. Đưa thư mục `nha-xem-phim-online/` lên một repo GitHub/GitLab
   (Render chỉ kéo code từ git; `node_modules/` đã có trong `.gitignore`).
2. Vào [dashboard.render.com](https://dashboard.render.com) → **New +** →
   **Blueprint** → chọn repo vừa đưa lên. Render tự đọc `render.yaml`
   trong gói này (đã khai: build `npm install`, start `npm start`,
   health check `/healthz`, `ROOM_CAP=30`) → bấm **Apply**.
   - Cách thủ công thay thế: **New + → Web Service** → chọn repo →
     Runtime: **Node**, Build Command: `npm install`,
     Start Command: `npm start` → **Create Web Service**.
3. Chờ deploy xong, Render cấp địa chỉ dạng
   `https://nha-xem-phim-online.onrender.com`. Mở thử địa chỉ đó:
   thấy trang client mẫu và vào nhà được là thành công.
   Kiểm nhanh thêm: mở `https://<địa-chỉ>/healthz` phải trả `{"ok":true,...}`.
4. Biến môi trường (nếu muốn đổi): trang service → **Environment** →
   sửa `ROOM_CAP` (mặc định 30). `PORT` do Render tự cấp, **đừng tự đặt**.

⚠️ Lưu ý gói Free của Render: máy chủ "ngủ" sau ~15 phút không ai dùng,
lần vào đầu tiên sau đó phải chờ vài chục giây để máy thức dậy. Muốn nhà
luôn sẵn sàng thì nâng gói trả phí của Render (việc này chủ nhân tự quyết).

## Nối client artifact `nha-xem-phim-chung` vào máy chủ này

Bản giao diện hiện tại đi qua một lớp vận chuyển riêng (đang dùng
BroadcastChannel — chỉ đồng bộ giữa các tab trên **cùng một máy**). Để chơi
online thật, chỉ cần thay lớp vận chuyển đó bằng WebSocket trỏ về máy chủ này:

1. Địa chỉ socket: `wss://<địa-chỉ-render>/` — tức địa chỉ `https://` của
   service ở bước trên, đổi đầu thành `wss://` (không thêm cổng, không thêm đường dẫn).
2. Khi mở trang: gửi `{type:"join", name, appearance}` ngay sau khi socket mở —
   **không gửi mã phòng** (bản cũ có ô mã phòng thì bỏ ô đó đi).
   `appearance = {skin, hair, shirt, hairStyle, accessory}` lấy từ màn hình tạo nhân vật.
3. Ánh xạ tính năng:
   - Nhân vật 3D của người khác → dựng từ `appearance` + `pos` trong `presence`
     (`pos` có cả độ cao `y` — dựng đúng tầng: mặt đất 0, tầng lửng ~3.2,
     sân thượng 4.0, hồ bơi −0.72 là độ cao LOCAL của client, server chỉ
     giữ y ≥ 0);
     khi nhân vật di chuyển (điều khiển WASD/chạm) → gửi `move {x, y, z, rotY, sitting}`
     (gửi mỗi lần vị trí đổi, server kẹp biên biệt thự x∈[-18,18],
     z∈[-12,48], y∈[0,6.5] và relay cho cả nhà);
     nghe `move` → cập nhật vị trí nhân vật tương ứng theo `userId`.
   - Danh sách người + số "x/30" → nghe sự kiện `presence`.
   - Ngồi ghế sofa → gửi `seat`, nghe `presence`/`seat` để vẽ lại.
   - Gắn link YouTube → tách `videoId` từ link, gửi `video`;
     nghe `video` để nạp video + seek tới `currentTime` + play/pause theo `playing`.
   - Chat → gửi/nghe `chat`.
   - Tương tác người chơi (đấm/đá/vẫy/ôm/đập tay khi đến gần nhau) → gửi
     `action {kind, toId}`, nghe `action` để chạy hoạt cảnh theo
     `fromId` → `toId`.
   - Voice trong phòng → mỗi cặp người nói chuyện mở 1 `RTCPeerConnection`
     (mesh), mọi offer/answer/ICE đóng vào `voice-signal {toId, data}` /
     nghe `voice-signal` theo `fromId`; âm thanh chạy thẳng peer-to-peer,
     server chỉ đưa tín hiệu.
   - Cờ cá ngựa / bi-a → đóng gói mọi sự kiện game vào `payload` của `game`
     và xử lý `payload` nhận về y như sự kiện local trước đây.
   - Tính năng biệt thự cần đồng bộ riêng (bàn DJ `vl-dj`, màn hình Sky Bar
     `vl-bar`, trạng thái chung `vl-state`, slide phòng họp `vl-slide`…) →
     gửi `sync {kind, data}` với `kind` bắt đầu bằng `vl-`; nghe `sync` và
     rẽ xử lý theo `kind`. Chú ý: người gửi KHÔNG nhận lại tin của mình —
     tự áp thay đổi ở local ngay khi gửi, như với `game`/`video`.
4. Xử lý `error` với `code:"ROOM_FULL"`: báo người dùng "Nhà đã đủ 30
   người" — không còn phòng khác để gợi ý, chỉ có thể chờ có người rời nhà.

Client mẫu trong `public/index.html` của gói này đã làm đúng các bước trên ở
mức tối thiểu — có thể mở 2 tab/trình duyệt khác nhau trỏ về cùng máy chủ
để tự kiểm chứng đồng bộ trước khi nối vào artifact thật. Riêng phần 3D,
client mẫu không vẽ nhân vật 3D (việc đó của artifact) — nó chỉ chọn ngoại
hình lúc vào nhà, hiện tọa độ trong danh sách người, và có 4 nút hướng +
nút Ngồi/Đứng để gửi thử tin `move` (đi mặt đất, `y` luôn 0; danh sách
người hiện độ cao của người khác nếu có). Nó cũng có sẵn cụm nút gửi thử
`action` (chọn người + 5 động tác), nút gửi thử `voice-signal` kèm
nhật ký nhận, và nút gửi thử kênh `sync` (`vl-dj`) — đủ để kiểm chứng
các giao thức mới ngay trên trình duyệt.

## Test tự động

Xem `TEST.md` — đã test thật ở local theo mô hình 1 nhà chung. Lượt mới
nhất (bản "Biệt thự Làng Mèo": `move` có độ cao `y`, biên
x∈[-18,18]/z∈[-12,48], kênh `sync` tiền tố `vl-`): **34 PASS / 0 FAIL** —
join không cần room, hai client khai room khác nhau vẫn chung nhà và
thấy nhau, ghế, video, chat, game relay, `appearance` + `move` 3 trục +
kẹp biên + lưu `pos` kèm `y` trong `presence`, action broadcast cả nhà
+ các trường hợp từ chối, voice-signal chỉ tới đúng người nhận, `sync`
broadcast trừ người gửi + từ chối kind sai/quá dài/data quá lớn, chặn
vượt cap. Các mục bổ sung theo từng đợt nằm ở các mục riêng trong
`TEST.md`.

```bash
ROOM_CAP=3 PORT=3100 npm start   # terminal 1
WS_URL=ws://localhost:3100 npm test   # terminal 2
```
