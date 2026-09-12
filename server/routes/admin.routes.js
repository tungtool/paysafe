const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const store = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireAdmin);

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 10 * 1024 * 1024 } });

function logSystemMessage(roomId, content) {
  store.addMessage({ room_id: roomId, sender_id: null, sender_name: 'SafePay', content, is_system: 1 });
}
function nowStr() { return new Date().toISOString().slice(0, 19).replace('T', ' '); }

// Tổng quan
router.get('/stats', (req, res) => {
  res.json({
    roomsByStatus: store.roomCountsByStatus(),
    pendingPayouts: store.pendingPayoutStats(),
    openDisputes: { c: store.openDisputeCount() },
    totalEscrowHeld: { total: store.totalEscrowHeld() },
  });
});

// Danh sách các khoản CHỜ GIẢI NGÂN / HOÀN TIỀN thật
router.get('/payouts', (req, res) => {
  const payouts = store.allPayoutsAndRefunds().map(t => {
    const room = store.findRoomById(t.room_id);
    const recipientId = t.type === 'payout' ? room?.seller_id : room?.buyer_id;
    const recipient = recipientId ? store.findUserById(recipientId) : null;
    return {
      ...t,
      room_code: room?.code || null,
      room_title: room?.title || null,
      recipient_name: recipient?.name || null,
      recipient_email: recipient?.email || null,
    };
  });
  res.json({ payouts });
});

// Xác nhận đã chuyển khoản thật (kèm ảnh biên lai)
router.post('/payouts/:id/confirm', upload.single('proof'), (req, res) => {
  try {
    const tx = store.findTransactionById(Number(req.params.id));
    if (!tx) return res.status(404).json({ error: 'Không tìm thấy giao dịch' });
    if (tx.status !== 'pending') return res.status(400).json({ error: 'Giao dịch đã được xử lý' });

    const proofPath = req.file ? `/uploads/${req.file.filename}` : null;
    store.updateTransaction(tx.id, { status: 'success', proof_path: proofPath });

    const label = tx.type === 'payout' ? 'giải ngân cho người bán' : 'hoàn tiền cho người mua';
    logSystemMessage(tx.room_id, `✅ Admin xác nhận đã chuyển khoản ${label}: ₫${tx.amount.toLocaleString('vi-VN')}${proofPath ? ' (có biên lai đính kèm)' : ''}.`);

    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/confirm-payout]', e);
    res.status(500).json({ error: 'Có lỗi ở máy chủ, vui lòng thử lại' });
  }
});

// Danh sách tranh chấp
router.get('/disputes', (req, res) => {
  const disputes = store.allDisputes().map(d => {
    const room = store.findRoomById(d.room_id);
    return { ...d, room_code: room?.code, title: room?.title, amount: room?.amount, fee: room?.fee, buyer_id: room?.buyer_id, seller_id: room?.seller_id };
  });
  res.json({ disputes });
});

// Admin xử lý tranh chấp
router.post('/disputes/:id/resolve', (req, res) => {
  try {
    const { decision, note } = req.body || {};
    if (!['seller', 'buyer'].includes(decision)) return res.status(400).json({ error: 'decision phải là seller hoặc buyer' });

    const dispute = store.findDisputeById(Number(req.params.id));
    if (!dispute) return res.status(404).json({ error: 'Không tìm thấy tranh chấp' });
    if (dispute.status !== 'open') return res.status(400).json({ error: 'Tranh chấp đã được xử lý' });

    const room = store.findRoomById(dispute.room_id);
    store.updateDispute(dispute.id, {
      status: decision === 'seller' ? 'resolved_seller' : 'resolved_buyer',
      resolution_note: note || '', resolved_at: nowStr(),
    });
    store.updateRoom(room.id, { status: 'complete', completed_at: nowStr() });

    if (decision === 'seller') {
      store.addTransaction({ room_id: room.id, type: 'payout', gateway: 'manual_bank', amount: room.amount - room.fee, status: 'pending', note: 'Giải ngân theo quyết định xử lý tranh chấp' });
      logSystemMessage(room.id, `⚖️ Admin đã xử lý tranh chấp: nghiêng về người bán. Yêu cầu giải ngân đã được tạo.`);
    } else {
      store.addTransaction({ room_id: room.id, type: 'refund', gateway: 'manual_bank', amount: room.amount, status: 'pending', note: 'Hoàn tiền theo quyết định xử lý tranh chấp' });
      logSystemMessage(room.id, `⚖️ Admin đã xử lý tranh chấp: nghiêng về người mua. Yêu cầu hoàn tiền đã được tạo.`);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[admin/resolve-dispute]', e);
    res.status(500).json({ error: 'Có lỗi ở máy chủ, vui lòng thử lại' });
  }
});

module.exports = router;
