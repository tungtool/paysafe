const { verifyToken } = require('../utils/jwt');

// Yêu cầu đăng nhập (Bearer token)
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    req.user = verifyToken(token);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc hết hạn' });
  }
}

// Yêu cầu quyền admin
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ admin mới có quyền truy cập' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
