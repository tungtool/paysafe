const express = require('express');
const bcrypt = require('bcryptjs');
const store = require('../db');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/register', (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập đủ họ tên, email, mật khẩu' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự' });
    }
    const emailNorm = email.toLowerCase().trim();
    if (store.findUserByEmail(emailNorm)) {
      return res.status(409).json({ error: 'Email đã được đăng ký' });
    }
    const hash = bcrypt.hashSync(password, 10);
    const user = store.createUser({ name: name.trim(), email: emailNorm, password_hash: hash, role: 'user' });
    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error('[auth/register]', e);
    res.status(500).json({ error: 'Có lỗi ở máy chủ, vui lòng thử lại' });
  }
});

router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });

    const user = store.findUserByEmail(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }
    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error('[auth/login]', e);
    res.status(500).json({ error: 'Có lỗi ở máy chủ, vui lòng thử lại' });
  }
});

router.get('/me', requireAuth, (req, res) => {
  const user = store.findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role } });
});

module.exports = router;
