const express = require('express');
const store = require('../db');
const { requireAuth } = require('../middleware/auth');
const vnpay = require('../services/vnpay');

const router = express.Router();

function logSystemMessage(roomId, content) {
  store.addMessage({ room_id: roomId, sender_id: null, sender_name: 'SafePay', content, is_system: 1 });
}

// Chưa điền VNPAY_TMN_CODE/VNPAY_HASH_SECRET thật -> tự động chạy ở CHẾ ĐỘ DEMO
// để bạn vẫn test được trọn luồng trên web. Khi điền đủ 2 biến này trong biến
// môi trường (.env hoặc trên Render), hệ thống tự chuyển sang thanh toán VNPay
// thật — không cần sửa code.
function isVnpayConfigured() {
  const code = process.env.VNPAY_TMN_CODE;
  const secret = process.env.VNPAY_HASH_SECRET;
  return !!code && !!secret && code !== 'YOUR_TMN_CODE' && secret !== 'YOUR_HASH_SECRET';
}

// Người mua bấm "Nạp tiền vào escrow"
router.post('/:code/create-vnpay-url', requireAuth, (req, res) => {
  try {
    const room = store.findRoomByCode((req.params.code || '').toUpperCase());
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
    if (room.buyer_id !== req.user.id) return res.status(403).json({ error: 'Chỉ người mua mới thanh toán được' });
    if (!['active', 'pending'].includes(room.status)) {
      return res.status(400).json({ error: 'Phòng không ở trạng thái chờ thanh toán' });
    }
    if (!room.seller_id) return res.status(400).json({ error: 'Cần có người bán tham gia phòng trước khi thanh toán' });

    const totalAmount = room.amount + room.fee;
    const ref = room.code + '-' + Date.now();

    store.addTransaction({
      room_id: room.id, type: 'deposit',
      gateway: isVnpayConfigured() ? 'vnpay' : 'vnpay_demo',
      gateway_txn_ref: ref, amount: totalAmount, status: 'pending',
    });

    if (!isVnpayConfigured()) {
      // CHẾ ĐỘ DEMO: chuyển tới trang xác nhận thanh toán giả lập trong app,
      // không có tiền thật nào di chuyển. Dùng để bạn test giao diện/luồng.
      return res.json({
        url: `/demo-payment.html?ref=${encodeURIComponent(ref)}&amount=${totalAmount}&code=${room.code}`,
        demo: true,
      });
    }

    const url = vnpay.buildPaymentUrl({
      amount: totalAmount, orderId: ref,
      orderInfo: `Thanh toan escrow phong ${room.code}`, ipAddr: req.ip,
    });
    res.json({ url, demo: false });
  } catch (e) {
    console.error('[payments/create-vnpay-url]', e);
    res.status(500).json({ error: e.message || 'Có lỗi ở máy chủ, vui lòng thử lại' });
  }
});

// Xác nhận thanh toán DEMO (chỉ hoạt động khi VNPay CHƯA được cấu hình thật —
// để tránh bị lợi dụng xác nhận khống khi đã lên production thật)
router.post('/demo/confirm', requireAuth, (req, res) => {
  if (isVnpayConfigured()) {
    return res.status(400).json({ error: 'VNPay thật đã được cấu hình, không dùng xác nhận demo nữa' });
  }
  const { ref } = req.body || {};
  const tx = store.findTransactionByRef(ref, 'deposit');
  if (!tx) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
  if (tx.status !== 'pending') return res.status(400).json({ error: 'Giao dịch đã được xử lý' });

  store.updateTransaction(tx.id, { status: 'success' });
  store.updateRoom(tx.room_id, { status: 'escrow', escrow_paid_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
  logSystemMessage(tx.room_id, `✅ [DEMO] Đã ghi nhận thanh toán ₫${tx.amount.toLocaleString('vi-VN')} vào tài khoản trung gian (đây là dữ liệu giả lập, chưa kết nối cổng thanh toán thật).`);

  res.json({ ok: true });
});

// VNPay redirect trình duyệt người dùng về đây sau khi thanh toán (chỉ để hiển thị UI,
// KHÔNG dùng để xác nhận tiền — việc xác nhận thật phải dựa vào IPN bên dưới)
router.get('/vnpay/return', (req, res) => {
  try {
    const ok = vnpay.verifySignature(req.query);
    const ref = req.query.vnp_TxnRef;
    const success = ok && req.query.vnp_ResponseCode === '00';
    res.redirect(`/?vnpay_result=${success ? 'success' : 'failed'}&ref=${encodeURIComponent(ref || '')}`);
  } catch (e) {
    res.redirect('/?vnpay_result=failed');
  }
});

// VNPay server-to-server gọi vào đây để báo kết quả thanh toán THẬT (IPN).
router.get('/vnpay/ipn', (req, res) => {
  try {
    const valid = vnpay.verifySignature(req.query);
    if (!valid) return res.json({ RspCode: '97', Message: 'Invalid signature' });

    const ref = req.query.vnp_TxnRef;
    const responseCode = req.query.vnp_ResponseCode;
    const amountReceived = Number(req.query.vnp_Amount) / 100;

    const tx = store.findTransactionByRef(ref, 'deposit');
    if (!tx) return res.json({ RspCode: '01', Message: 'Order not found' });
    if (tx.status !== 'pending') return res.json({ RspCode: '02', Message: 'Order already confirmed' });
    if (tx.amount !== amountReceived) return res.json({ RspCode: '04', Message: 'Amount mismatch' });

    if (responseCode === '00') {
      store.updateTransaction(tx.id, { status: 'success' });
      store.updateRoom(tx.room_id, { status: 'escrow', escrow_paid_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });
      logSystemMessage(tx.room_id, `✅ SafePay đã nhận thanh toán ₫${amountReceived.toLocaleString('vi-VN')} vào tài khoản trung gian. Tiền đang được giữ an toàn.`);
    } else {
      store.updateTransaction(tx.id, { status: 'failed' });
    }
    res.json({ RspCode: '00', Message: 'Confirm Success' });
  } catch (e) {
    console.error('[payments/vnpay-ipn]', e);
    res.json({ RspCode: '99', Message: 'Unknown error' });
  }
});

module.exports = router;
