const express = require('express');
const store = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getRoomOrThrow(code, userId) {
  const room = store.findRoomByCode((code || '').toUpperCase());
  if (!room) return { error: [404, 'Không tìm thấy phòng'] };
  if (room.buyer_id !== userId && room.seller_id !== userId) return { error: [403, 'Bạn không thuộc phòng này'] };
  return { room };
}

// Lấy tin nhắn (hỗ trợ ?after=<id> để chỉ lấy tin mới — dùng cho polling)
router.get('/:code/messages', requireAuth, (req, res) => {
  const { room, error } = getRoomOrThrow(req.params.code, req.user.id);
  if (error) return res.status(error[0]).json({ error: error[1] });

  const after = Number(req.query.after || 0);
  res.json({ messages: store.messagesAfter(room.id, after) });
});

// Gửi tin nhắn thật (lưu file, không phải chèn tạm vào DOM)
router.post('/:code/messages', requireAuth, (req, res) => {
  try {
    const { content } = req.body || {};
    if (!content || !content.trim()) return res.status(400).json({ error: 'Nội dung trống' });

    const { room, error } = getRoomOrThrow(req.params.code, req.user.id);
    if (error) return res.status(error[0]).json({ error: error[1] });

    const message = store.addMessage({
      room_id: room.id, sender_id: req.user.id, sender_name: req.user.name,
      content: content.trim(), is_system: 0,
    });
    res.json({ message });
  } catch (e) {
    console.error('[chat/send]', e);
    res.status(500).json({ error: 'Có lỗi ở máy chủ, vui lòng thử lại' });
  }
});

module.exports = router;
