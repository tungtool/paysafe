// server/db.js
// Lớp lưu trữ dữ liệu THẬT, ghi ra file JSON trên đĩa (data/safepay.json).
// Cố tình KHÔNG dùng thư viện SQLite native (better-sqlite3, sqlite3...) vì
// các thư viện đó cần biên dịch C++ (node-gyp) khi cài đặt — đây chính là
// nguyên nhân gây lỗi "gyp ERR! build error" khi deploy lên Render/các nền
// tảng khác nếu môi trường build thiếu công cụ biên dịch hoặc lệch phiên bản
// Node. Toàn bộ code dưới đây là JavaScript thuần 100%, không có bước
// biên dịch nào — cài đặt xong là chạy được ngay trên mọi máy có Node.
//
// Dữ liệu vẫn được lưu THẬT (ghi file, đọc lại được sau khi restart), chỉ
// khác về công nghệ lưu trữ so với bản trước.

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'safepay.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
ensureDataDir();

function emptyDB() {
  return {
    users: [], rooms: [], messages: [], transactions: [], disputes: [],
    _seq: { users: 0, rooms: 0, messages: 0, transactions: 0, disputes: 0 },
  };
}

function loadDB() {
  if (!fs.existsSync(DATA_FILE)) return emptyDB();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    // đảm bảo đủ field ngay cả khi file cũ thiếu (an toàn khi nâng cấp app)
    return { ...emptyDB(), ...parsed, _seq: { ...emptyDB()._seq, ...(parsed._seq || {}) } };
  } catch (e) {
    console.error('[store] Không đọc được file dữ liệu, tạo mới:', e.message);
    return emptyDB();
  }
}

let mem = loadDB();

// Ghi an toàn: ghi ra file tạm rồi đổi tên, tránh hỏng file nếu server bị tắt
// đột ngột giữa lúc đang ghi.
function persist() {
  ensureDataDir();
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(mem, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_FILE);
}

function nextId(collection) {
  mem._seq[collection] = (mem._seq[collection] || 0) + 1;
  return mem._seq[collection];
}

function nowStr() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

const store = {
  // ===== Users =====
  createUser({ name, email, password_hash, role }) {
    const user = { id: nextId('users'), name, email, password_hash, role, created_at: nowStr() };
    mem.users.push(user); persist();
    return user;
  },
  findUserByEmail(email) { return mem.users.find(u => u.email === email) || null; },
  findUserById(id) { return mem.users.find(u => u.id === id) || null; },

  // ===== Rooms =====
  createRoom(fields) {
    const room = {
      id: nextId('rooms'), status: 'pending', escrow_paid_at: null, completed_at: null,
      created_at: nowStr(), ...fields,
    };
    mem.rooms.push(room); persist();
    return room;
  },
  findRoomByCode(code) { return mem.rooms.find(r => r.code === code) || null; },
  findRoomById(id) { return mem.rooms.find(r => r.id === id) || null; },
  updateRoom(id, patch) {
    const room = store.findRoomById(id);
    if (!room) return null;
    Object.assign(room, patch); persist();
    return room;
  },
  roomsForUser(userId) {
    return mem.rooms
      .filter(r => r.buyer_id === userId || r.seller_id === userId)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },

  // ===== Messages =====
  addMessage({ room_id, sender_id = null, sender_name, content, is_system = 0 }) {
    const msg = { id: nextId('messages'), room_id, sender_id, sender_name, content, is_system: is_system ? 1 : 0, created_at: nowStr() };
    mem.messages.push(msg); persist();
    return msg;
  },
  messagesAfter(roomId, afterId) {
    return mem.messages.filter(m => m.room_id === roomId && m.id > afterId).sort((a, b) => a.id - b.id);
  },

  // ===== Transactions (tiền: nạp / giải ngân / hoàn tiền) =====
  addTransaction(fields) {
    const tx = {
      id: nextId('transactions'), status: 'pending', gateway: null, gateway_txn_ref: null,
      proof_path: null, note: null, created_at: nowStr(), updated_at: null, ...fields,
    };
    mem.transactions.push(tx); persist();
    return tx;
  },
  findTransactionById(id) { return mem.transactions.find(t => t.id === id) || null; },
  findTransactionByRef(ref, type) { return mem.transactions.find(t => t.gateway_txn_ref === ref && t.type === type) || null; },
  transactionsForRoom(roomId) {
    return mem.transactions.filter(t => t.room_id === roomId).sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
  },
  updateTransaction(id, patch) {
    const tx = store.findTransactionById(id);
    if (!tx) return null;
    Object.assign(tx, patch, { updated_at: nowStr() }); persist();
    return tx;
  },
  allPayoutsAndRefunds() {
    return mem.transactions.filter(t => t.type === 'payout' || t.type === 'refund')
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },

  // ===== Disputes (tranh chấp) =====
  addDispute(fields) {
    const d = { id: nextId('disputes'), status: 'open', resolution_note: null, resolved_at: null, created_at: nowStr(), ...fields };
    mem.disputes.push(d); persist();
    return d;
  },
  findDisputeById(id) { return mem.disputes.find(d => d.id === id) || null; },
  disputesForRoom(roomId) {
    return mem.disputes.filter(d => d.room_id === roomId).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },
  allDisputes() {
    return mem.disputes.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  },
  updateDispute(id, patch) {
    const d = store.findDisputeById(id);
    if (!d) return null;
    Object.assign(d, patch); persist();
    return d;
  },

  // ===== Thống kê cho admin =====
  roomCountsByStatus() {
    const counts = {};
    mem.rooms.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
    return Object.entries(counts).map(([status, c]) => ({ status, c }));
  },
  totalEscrowHeld() {
    return mem.rooms.filter(r => r.status === 'escrow').reduce((s, r) => s + (r.amount - r.fee), 0);
  },
  pendingPayoutStats() {
    const pending = mem.transactions.filter(t => t.type === 'payout' && t.status === 'pending');
    return { c: pending.length, total: pending.reduce((s, t) => s + t.amount, 0) };
  },
  openDisputeCount() {
    return mem.disputes.filter(d => d.status === 'open').length;
  },
};

// Tạo tài khoản admin đầu tiên nếu chưa có (đọc từ biến môi trường)
function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Admin';
  if (!email || !password) {
    console.warn('[init] Chưa đặt ADMIN_EMAIL/ADMIN_PASSWORD trong biến môi trường — bỏ qua tạo tài khoản admin. App vẫn chạy bình thường, bạn có thể tạo admin thủ công sau.');
    return;
  }
  if (store.findUserByEmail(email)) return;
  try {
    const hash = bcrypt.hashSync(password, 10);
    store.createUser({ name, email, password_hash: hash, role: 'admin' });
    console.log(`[init] Đã tạo tài khoản admin: ${email}`);
  } catch (e) {
    console.error('[init] Lỗi khi tạo tài khoản admin:', e.message);
  }
}
ensureAdmin();

module.exports = store;
