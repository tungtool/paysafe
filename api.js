// public/js/api.js
// Toàn bộ hàm dưới đây gọi THẬT tới backend Express (không có dữ liệu giả lập).

const API = {
  token: localStorage.getItem('safepay_token') || null,

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('safepay_token', token);
    else localStorage.removeItem('safepay_token');
  },

  async _fetch(path, opts = {}) {
    const headers = opts.headers || {};
    if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    if (this.token) headers['Authorization'] = `Bearer ${this.token}`;

    const res = await fetch(`/api${path}`, { ...opts, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Có lỗi xảy ra, vui lòng thử lại');
    return data;
  },

  register(name, email, password) {
    return this._fetch('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) });
  },
  login(email, password) {
    return this._fetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  },
  me() { return this._fetch('/auth/me'); },

  createRoom(payload) { return this._fetch('/rooms', { method: 'POST', body: JSON.stringify(payload) }); },
  joinRoom(code) { return this._fetch(`/rooms/${code}/join`, { method: 'POST' }); },
  myRooms() { return this._fetch('/rooms/mine'); },
  getRoom(code) { return this._fetch(`/rooms/${code}`); },
  completeRoom(code) { return this._fetch(`/rooms/${code}/complete`, { method: 'POST' }); },
  disputeRoom(code, reason) { return this._fetch(`/rooms/${code}/dispute`, { method: 'POST', body: JSON.stringify({ reason }) }); },

  getMessages(code, after = 0) { return this._fetch(`/rooms/${code}/messages?after=${after}`); },
  sendMessage(code, content) { return this._fetch(`/rooms/${code}/messages`, { method: 'POST', body: JSON.stringify({ content }) }); },

  createVnpayUrl(code) { return this._fetch(`/payments/${code}/create-vnpay-url`, { method: 'POST' }); },

  adminStats() { return this._fetch('/admin/stats'); },
  adminPayouts() { return this._fetch('/admin/payouts'); },
  adminConfirmPayout(id, formData) { return this._fetch(`/admin/payouts/${id}/confirm`, { method: 'POST', body: formData }); },
  adminDisputes() { return this._fetch('/admin/disputes'); },
  adminResolveDispute(id, decision, note) { return this._fetch(`/admin/disputes/${id}/resolve`, { method: 'POST', body: JSON.stringify({ decision, note }) }); },
};
