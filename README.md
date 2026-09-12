# SafePay – Nền tảng giao dịch trung gian (Escrow)

Ứng dụng full-stack **thật** (không mô phỏng): backend Node.js/Express +
lưu trữ dữ liệu bằng file JSON thuần JavaScript (không dùng SQLite/thư viện
native nào), frontend thuần HTML/JS gọi API thật. Toàn bộ logic — tài khoản, phòng giao dịch,
chat, thanh toán, giải ngân, tranh chấp — đều được lưu trong database và xử lý
qua API, không có dữ liệu giả cứng trong code.

## 1. Cài đặt

```bash
npm install
cp .env.example .env
```

Mở `.env` và điền các giá trị thật của bạn (xem mục 3 và 4 bên dưới).

## 2. Chạy

```bash
npm start
# hoặc khi phát triển (tự restart khi sửa code):
npm run dev
```

Mặc định chạy tại `http://localhost:3000`. Tài khoản admin đầu tiên được tạo
tự động từ `ADMIN_EMAIL` / `ADMIN_PASSWORD` trong `.env` khi server khởi động lần đầu.

## 3. Chế độ DEMO thanh toán (mặc định — không cần cấu hình gì)

Nếu bạn CHƯA điền `VNPAY_TMN_CODE` / `VNPAY_HASH_SECRET` thật vào `.env`, app
tự động chạy ở **chế độ DEMO**: khi người mua bấm "Thanh toán", hệ thống đưa
tới 1 trang xác nhận giả lập trong app (ghi rõ "DEMO", không có tiền thật di
chuyển) — bấm xác nhận là coi như đã thanh toán, phòng chuyển sang trạng thái
`escrow` để bạn test tiếp toàn bộ luồng (chat, xác nhận hoàn tất, admin giải
ngân, tranh chấp...).

Đây là để bạn kiểm tra toàn bộ website hoạt động đúng trước khi cắm cổng
thanh toán thật. Khi nào bạn điền đủ 2 biến VNPay thật (mục 4 bên dưới), hệ
thống **tự động chuyển sang thanh toán thật** — không cần sửa dòng code nào.

## 4. Cấu hình cổng thanh toán thật (VNPay)

App đã tích hợp sẵn **VNPay** (phổ biến nhất cho merchant Việt Nam, hỗ trợ
nhiều ngân hàng nội địa + thẻ quốc tế) theo đúng tài liệu chính thức của VNPay.

1. Đăng ký merchant thật tại VNPay (hoặc dùng tài khoản sandbox để test:
   https://sandbox.vnpayment.vn/devreadme/)
2. Lấy `vnp_TmnCode` và `Hash Secret`, điền vào `.env`:
   ```
   VNPAY_TMN_CODE=...
   VNPAY_HASH_SECRET=...
   VNPAY_URL=https://sandbox.vnpayment.vn/paymentv2/vpcpay.html   # đổi sang URL production khi lên thật
   VNPAY_RETURN_URL=https://your-domain.vn/api/payments/vnpay/return
   VNPAY_IPN_URL=https://your-domain.vn/api/payments/vnpay/ipn
   ```
3. Trong trang cấu hình merchant của VNPay, khai báo **IPN URL** trùng với
   `VNPAY_IPN_URL` ở trên — đây là nơi VNPay báo kết quả thanh toán *đáng tin
   cậy nhất* (server gọi server), khác với Return URL (chỉ để hiển thị cho
   người dùng, không nên dùng để xác nhận tiền vì có thể bị giả mạo).

### Muốn dùng Momo / ZaloPay thay vì VNPay?

Kiến trúc app tách riêng phần tích hợp cổng thanh toán ở
`server/services/vnpay.js` và endpoint `server/routes/payments.routes.js`.
Bạn có thể viết thêm `server/services/momo.js` theo tài liệu của Momo
(https://developers.momo.vn) hoặc ZaloPay (https://docs.zalopay.vn) rồi thêm
route tương ứng — cấu trúc dữ liệu (bảng `transactions`) đã hỗ trợ sẵn nhiều
gateway (cột `gateway`).

## 5. Về việc GIẢI NGÂN cho người bán (rất quan trọng)

Hầu hết merchant thường của VNPay/Momo/ZaloPay **chỉ hỗ trợ THU tiền**, không
tự động **CHI tiền** ra tài khoản người bán. Vì vậy app này xử lý giải ngân
theo quy trình bán tự động, đúng với thực tế vận hành escrow ở Việt Nam:

1. Người mua xác nhận hoàn tất (hoặc admin xử lý tranh chấp nghiêng về 1 bên)
   → hệ thống tự tạo 1 bản ghi "chờ giải ngân/hoàn tiền" trong bảng `transactions`.
2. Admin vào `/#admin` (mục "Chờ giải ngân / hoàn tiền"), tự thực hiện chuyển
   khoản thật qua Internet Banking tới tài khoản người bán/người mua.
3. Admin upload ảnh biên lai và bấm "Xác nhận đã chuyển khoản" → hệ thống ghi
   nhận trạng thái `success` kèm bằng chứng, đồng thời thông báo cho các bên
   trong hộp thư của phòng.

Nếu công ty bạn đã ký hợp đồng "chi hộ" (payout API) với ngân hàng hoặc ví
điện tử, bạn có thể thay bước 2–3 bằng lệnh gọi API tự động — chỉ cần sửa
`server/routes/admin.routes.js`.

## 6. Yêu cầu pháp lý — vui lòng đọc kỹ

Vận hành một nền tảng **giữ tiền hộ (trung gian thanh toán)** tại Việt Nam là
hoạt động **có điều kiện**, chịu sự quản lý của Ngân hàng Nhà nước theo quy
định về dịch vụ trung gian thanh toán / ví điện tử. Về nguyên tắc:

- Nếu bạn tự đứng ra **giữ tiền của người khác trong tài khoản của mình** một
  cách có hệ thống, bạn có thể cần giấy phép cung ứng dịch vụ trung gian
  thanh toán, hoặc phải hợp tác với một tổ chức đã có giấy phép (ví điện tử,
  ngân hàng) để họ giữ tiền hộ (dùng tài khoản đảm bảo/tài khoản ký quỹ do họ
  quản lý) thay vì bạn tự giữ.
- Việc chỉ viết code không tạo ra giấy phép — bạn cần làm việc với luật sư /
  đơn vị tư vấn tài chính trước khi vận hành thật với tiền của người dùng.

Mình xây phần kỹ thuật đầy đủ để bạn có nền tảng vận hành, nhưng phần pháp lý
là điều bạn cần chuẩn bị song song.

## 7. Cấu trúc thư mục

```
server/
  index.js              # entry point, mount routes
  db.js                 # lưu trữ dữ liệu (file JSON) + khởi tạo admin
  middleware/auth.js     # JWT auth + phân quyền admin
  services/vnpay.js      # tạo link thanh toán, xác thực chữ ký VNPay
  routes/
    auth.routes.js       # đăng ký / đăng nhập
    rooms.routes.js       # tạo / tham gia / hoàn tất / tranh chấp phòng
    chat.routes.js         # gửi / lấy tin nhắn (polling)
    payments.routes.js     # tạo link VNPay, xử lý return + IPN
    admin.routes.js        # xác nhận giải ngân, xử lý tranh chấp, thống kê
public/
  index.html             # SPA (1 trang, chuyển view bằng JS)
  css/style.css
  js/api.js               # gọi API thật
  js/app.js                # toàn bộ logic giao diện
data/safepay.json         # toàn bộ dữ liệu (tự tạo khi chạy lần đầu)
uploads/                  # ảnh biên lai / bằng chứng do admin upload
```

## 8. Deploy lên Render.com

Cách nhanh nhất — dùng file `render.yaml` đã có sẵn trong repo:

1. Đẩy code lên GitHub (repo có thể để private).
2. Vào [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint** → chọn repo này.
   Render tự đọc `render.yaml` và tạo đúng service.
3. Render sẽ hỏi giá trị cho các biến đánh dấu `sync: false` (không public) —
   điền `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `VNPAY_TMN_CODE`, `VNPAY_HASH_SECRET`,
   thông tin ngân hàng công ty...
4. Bấm **Apply** — sau ~2-3 phút app sẽ có URL dạng `https://safepay-app.onrender.com`.
5. Quay lại trang cấu hình merchant VNPay, cập nhật **IPN URL** thành
   `https://<tên-app-của-bạn>.onrender.com/api/payments/vnpay/ipn` (đúng domain
   Render cấp cho bạn, không phải domain mẫu trong file).

### ⚠️ Điều BẮT BUỘC phải biết trước khi deploy: file dữ liệu + Render free tier

Free tier của Render **không có persistent disk** — nghĩa là container bị xoá
và tạo lại mỗi khi bạn deploy lại code hoặc service tự ngủ sau 15 phút không
hoạt động rồi thức dậy. File `data/safepay.json` (chứa toàn bộ user, phòng
giao dịch, lịch sử tiền) sẽ **mất sạch** mỗi lần đó xảy ra. Với app xử lý tiền
thật, đây là rủi ro không chấp nhận được.

→ `render.yaml` mình chuẩn bị sẵn dùng `plan: starter` (~$7/tháng) kèm
**Persistent Disk** 1GB gắn vào đúng thư mục `data/` để dữ liệu không bị mất.
Nếu chỉ muốn deploy thử giao diện (chưa xử lý tiền thật), bạn có thể đổi
`plan: starter` → `plan: free` và bỏ phần `disk:` trong `render.yaml`, nhưng
nhớ đây chỉ nên dùng để demo, không dùng khi đã có giao dịch tiền thật.

**Lựa chọn thay thế khi lượng giao dịch lớn:** chuyển sang **Render
PostgreSQL** (free 30 ngày, sau đó từ $6/tháng) để không phụ thuộc vào 1 file
duy nhất — cần viết lại `server/db.js` để dùng driver `pg` thay vì đọc/ghi
JSON. Nếu bạn muốn, nói mình làm luôn phần chuyển đổi này khi app đã có nhiều
người dùng thật.

## 9. Triển khai production

- Đặt app sau reverse proxy (Nginx/Caddy) với HTTPS bắt buộc (VNPay yêu cầu
  Return/IPN URL là HTTPS ở môi trường production).
- Đổi `JWT_SECRET` thành chuỗi ngẫu nhiên dài, không commit `.env` lên git.
- Cân nhắc chuyển sang PostgreSQL nếu lượng giao dịch lớn (xem mục 8).
- Giới hạn kích thước file upload, quét virus cho ảnh biên lai nếu cần.

## 10. Xử lý lỗi thường gặp khi deploy

**Lỗi `gyp ERR! build error` (build native module thất bại):** Bản trước của
project dùng `better-sqlite3` để lưu dữ liệu — thư viện này cần biên dịch
C++ (`node-gyp`) khi cài đặt, và sẽ lỗi nếu môi trường build (Render hoặc máy
bạn) dùng bản Node quá mới chưa có sẵn binary, hoặc thiếu công cụ biên dịch.

**→ Project hiện tại đã bỏ hẳn `better-sqlite3`**, chuyển sang lưu dữ liệu
bằng file JSON thuần JavaScript (`server/db.js`) — không có bước biên dịch
nào, không phụ thuộc phiên bản Node cụ thể, nên **lỗi này sẽ không xảy ra
lại nữa** dù bạn deploy ở Render, Railway, VPS hay máy nào có Node ≥18.

Nếu bạn từng gặp lỗi này với bản cũ, chỉ cần thay toàn bộ code bằng bản mới
nhất (đẩy lại lên GitHub) rồi **Clear build cache & deploy** trên Render là
xong, không cần làm gì thêm.

**Lỗi "Cannot find module '.../server/index.js'" khi start:** thường do khi
đẩy code lên GitHub, thư mục `server/` hoặc `public/` bị thiếu file bên trong
(hay gặp khi kéo-thả upload qua giao diện web GitHub, trình duyệt không đưa
được file trong thư mục con lên). Cách chắc chắn nhất: dùng **GitHub Desktop**
(desktop.github.com) để đẩy code thay vì kéo-thả trên web — nó xử lý đúng
toàn bộ cây thư mục con.
