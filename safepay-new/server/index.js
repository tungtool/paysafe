// server/index.js
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');

// Không để 1 lỗi bất ngờ làm sập cả server mà không có log rõ ràng
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

require('./db'); // khởi tạo store + tài khoản admin ngay khi start

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Đảm bảo thư mục uploads luôn tồn tại (không phụ thuộc việc git có giữ được
// thư mục rỗng khi upload hay không)
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Phục vụ file frontend tĩnh
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/rooms', require('./routes/rooms.routes'));
app.use('/api/rooms', require('./routes/chat.routes')); // gộp path /:code/messages
app.use('/api/payments', require('./routes/payments.routes'));
app.use('/api/admin', require('./routes/admin.routes'));

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// 404 cho các route /api/* không khớp — trả JSON thay vì HTML mặc định
app.use('/api', (req, res) => res.status(404).json({ error: 'Không tìm thấy API endpoint này' }));

// Error handler cuối cùng — bắt mọi lỗi chưa được xử lý ở route, tránh server
// treo hoặc trả về HTML lỗi khó hiểu cho frontend
app.use((err, req, res, next) => {
  console.error('[express error handler]', err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Có lỗi ở máy chủ, vui lòng thử lại sau' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ SafePay server đang chạy tại http://localhost:${PORT}`);
  if (!process.env.VNPAY_TMN_CODE || process.env.VNPAY_TMN_CODE === 'YOUR_TMN_CODE') {
    console.log('ℹ️  VNPay chưa được cấu hình — thanh toán đang chạy ở CHẾ ĐỘ DEMO (không có tiền thật).');
  }
  if (!process.env.ADMIN_EMAIL) {
    console.log('ℹ️  Chưa đặt ADMIN_EMAIL/ADMIN_PASSWORD — chưa có tài khoản admin nào được tạo tự động.');
  }
}).on('error', (err) => {
  console.error('❌ Không khởi động được server:', err.message);
  process.exit(1);
});
