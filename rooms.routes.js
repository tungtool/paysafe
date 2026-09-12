const express = require('express');
const { customAlphabet } = require('nanoid');
const store = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 6);

function feePercent() {
  const n = Number(process.env.SERVICE_FEE_PERCENT);
  return Number.isFinite(n) ? n : 1;
}

function logSystemMessage(roomId, content) {
  store.addMessage({ room_id: roomId, sender_id: null, sender_name: 'SafePay', content, is_system: 1 });
}

function roomForUser(room, userId) {
  return room.buyer_id === userId || room.seller_id === userId;
}

function uniqueRoomCode() {
  let code;
  do { code = 'SP-' + genCode(); } while (store.findRoomByCode(code));
  return code;
}

// Tạo phòng giao dịch mới
router.post('/', requireAuth, (req, res) => {
  try {
    const { title, description, amount, role, inspectionHours } = req.body || {};
    if (!title || !amount || !role) {
      return res.status(400).json({ error: 'Thiếu tiêu đề, số tiền hoặc vai trò' });
    }
    if (!['buyer', 'seller'].includes(role)) {
      return res.status(400).json({ error: 'Vai trò phải là buyer hoặc seller' });
    }
    const amt = Math.round(Number(amount));
    if (!amt || amt <= 0) return res.status(400).json({ error: 'Số tiền không hợp lệ' });

    const fee = Math.ceil((amt * feePercent()) / 100);
    const code = uniqueRoomCode();
    const buyerId = role === 'buyer' ? req.user.id : null;
    const sellerId = role === 'seller' ? req.user.id : null;

    const room = store.createRoom({
      code, title: title.trim(), description: (description || '').trim(), amount: amt, fee,
      creator_role: role, buyer_id: buyerId, seller_id: sellerId, status: 'pending',
      inspection_hours: Number(inspectionHours) || 24,
    });

    logSystemMessage(room.id, `Phòng được tạo bởi ${req.user.name} (vai trò: ${role === 'buyer' ? 'người mua' : 'người bán'})`);
    res.json({ room });
  } catch (e) {
    console.error('[rooms/create]', e);
    res.status(500).json({ error: 'Có lỗi ở máy chủ, vui lòng thử lại' });
  }
});

// Tham gia phòng bằng mã
router.post('/:code/join', requireAuth, (req, res) => {
  try {
    const room = store.findRoomByCode((req.params.code || '').toUpperCase());
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng với mã này' });

    if (room.buyer_id === req.user.id || room.seller_id === req.user.id) {
      return res.json({ room });
    }

    const openSlot = room.buyer_id ? (room.seller_id ? null : 'seller') : 'buyer';
    if (!openSlot) return res.status(400).json({ error: 'Phòng đã đủ 2 thành viên' });

    const patch = { [`${openSlot}_id`]: req.user.id };
    if (room.status === 'pending') patch.status = 'active';
    const updated = store.updateRoom(room.id, patch);

    logSystemMessage(room.id, `${req.user.name} đã tham gia phòng với vai trò ${openSlot === 'buyer' ? 'người mua' : 'người bán'}`);
    res.json({ room: updated });
  } catch (e) {
    console.error('[rooms/join]', e);
    res.status(500).json({ error: 'Có lỗi ở máy chủ, vui lòng thử lại' });
  }
});

// Danh sách phòng của tôi
router.get('/mine', requireAuth, (req, res) => {
  res.json({ rooms: store.roomsForUser(req.user.id) });
});

// Chi tiết 1 phòng
router.get('/:code', requireAuth, (req, res) => {
  const room = store.findRoomByCode((req.params.code || '').toUpperCase());
  if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
  if (!roomForUser(room, req.user.id) && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Bạn không thuộc phòng này' });
  }
  res.json({
    room,
    transactions: store.transactionsForRoom(room.id),
    disputes: store.disputesForRoom(room.id),
  });
});

// Người mua xác nhận đã nhận hàng/dịch vụ -> tạo yêu cầu giải ngân cho người bán
router.post('/:code/complete', requireAuth, (req, res) => {
  try {
    const room = store.findRoomByCode((req.params.code || '').toUpperCase());
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
    if (room.buyer_id !== req.user.id) return res.status(403).json({ error: 'Chỉ người mua mới xác nhận hoàn tất được' });
    if (room.status !== 'escrow') return res.status(400).json({ error: 'Phòng chưa ở trạng thái giữ tiền (escrow)' });

    const updated = store.updateRoom(room.id, { status: 'complete', completed_at: new Date().toISOString().slice(0, 19).replace('T', ' ') });

    store.addTransaction({
      room_id: room.id, type: 'payout', gateway: 'manual_bank',
      amount: room.amount - room.fee, status: 'pending',
      note: 'Chờ admin chuyển khoản thật cho người bán',
    });

    logSystemMessage(room.id, `${req.user.name} xác nhận hoàn tất. Yêu cầu giải ngân ₫${(room.amount - room.fee).toLocaleString('vi-VN')} cho người bán đã được gửi tới admin.`);
    res.json({ room: updated });
  } catch (e) {
    console.error('[rooms/complete]', e);
    res.status(500).json({ error: 'Có lỗi ở máy chủ, vui lòng thử lại' });
  }
});

// Khởi tạo tranh chấp
router.post('/:code/dispute', requireAuth, (req, res) => {
  try {
    const { reason } = req.body || {};
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'Vui lòng nhập lý do tranh chấp' });

    const room = store.findRoomByCode((req.params.code || '').toUpperCase());
    if (!room) return res.status(404).json({ error: 'Không tìm thấy phòng' });
    if (!roomForUser(room, req.user.id)) return res.status(403).json({ error: 'Bạn không thuộc phòng này' });
    if (!['escrow', 'active'].includes(room.status)) {
      return res.status(400).json({ error: 'Chỉ có thể tranh chấp khi giao dịch đang diễn ra' });
    }

    const updated = store.updateRoom(room.id, { status: 'dispute' });
    store.addDispute({ room_id: room.id, reporter_id: req.user.id, reason: reason.trim() });
    logSystemMessage(room.id, `⚠️ ${req.user.name} đã khởi tạo tranh chấp. Đội ngũ SafePay sẽ xem xét và phản hồi.`);

    res.json({ room: updated });
  } catch (e) {
    console.error('[rooms/dispute]', e);
    res.status(500).json({ error: 'Có lỗi ở máy chủ, vui lòng thử lại' });
  }
});

module.exports = router;
