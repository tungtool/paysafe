// public/js/app.js
let CURRENT_USER = null;
let SELECTED_ROLE = 'buyer';
let CURRENT_ROOM_CODE = null;
let CHAT_TIMER = null;
let ROOM_TIMER = null;
let LAST_MSG_ID = 0;

const Router = {
  go(page) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page).classList.add('active');
    clearInterval(CHAT_TIMER); clearInterval(ROOM_TIMER);
    if (page === 'home') UI.renderHome();
    if (page === 'admin') UI.renderAdmin();
  }
};

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3500);
}
function money(n) { return '₫' + Number(n || 0).toLocaleString('vi-VN'); }
function fmtTime(s) { return new Date(s + 'Z').toLocaleString('vi-VN'); }

const UI = {
  async init() {
    if (API.token) {
      try { const { user } = await API.me(); CURRENT_USER = user; } catch (e) { API.setToken(null); }
    }
    this.renderNav();
    // Xử lý kết quả trả về từ VNPay (nếu có)
    const params = new URLSearchParams(location.search);
    if (params.get('vnpay_result')) {
      toast(params.get('vnpay_result') === 'success'
        ? '✅ Thanh toán thành công! Đang cập nhật trạng thái phòng...'
        : '❌ Thanh toán thất bại hoặc bị huỷ.');
      history.replaceState({}, '', location.pathname);
    }
    Router.go('home');
  },

  renderNav() {
    const box = document.getElementById('nav-actions');
    if (!CURRENT_USER) {
      box.innerHTML = `<span style="font-size:13px;color:var(--text-muted);">Đăng nhập để tạo/tham gia phòng</span>`;
      return;
    }
    let adminBtn = CURRENT_USER.role === 'admin' ? `<button class="btn btn-sm" onclick="Router.go('admin')">Admin</button>` : '';
    box.innerHTML = `
      <span style="font-size:13px;">👤 ${CURRENT_USER.name}</span>
      ${adminBtn}
      <button class="btn btn-sm" onclick="UI.logout()">Đăng xuất</button>`;
  },

  logout() { API.setToken(null); CURRENT_USER = null; Router.go('home'); },

  renderHome() {
    this.renderAuthBox();
    document.getElementById('room-box').classList.toggle('hidden', !CURRENT_USER);
    this.updateFeeHint();
    if (CURRENT_USER) this.renderMyRooms(); else document.getElementById('my-rooms-box').innerHTML = '';
  },

  renderAuthBox() {
    const box = document.getElementById('auth-box');
    if (CURRENT_USER) {
      box.innerHTML = `<h2>Xin chào, ${CURRENT_USER.name} 👋</h2><p class="sub" style="margin-bottom:0;">Tạo phòng mới hoặc tham gia bằng mã bên dưới.</p>`;
      return;
    }
    box.innerHTML = `
      <div class="tab-row">
        <div class="tab active" data-atab="login" onclick="UI.switchAuthTab('login')">Đăng nhập</div>
        <div class="tab" data-atab="register" onclick="UI.switchAuthTab('register')">Đăng ký</div>
      </div>
      <div id="atab-login">
        <div class="form-group"><label>Email</label><input id="li-email" type="email"></div>
        <div class="form-group"><label>Mật khẩu</label><input id="li-pass" type="password"></div>
        <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="UI.doLogin()">Đăng nhập</button>
      </div>
      <div id="atab-register" class="hidden">
        <div class="form-group"><label>Họ tên</label><input id="re-name"></div>
        <div class="form-group"><label>Email</label><input id="re-email" type="email"></div>
        <div class="form-group"><label>Mật khẩu (tối thiểu 6 ký tự)</label><input id="re-pass" type="password"></div>
        <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="UI.doRegister()">Tạo tài khoản</button>
      </div>`;
  },

  switchAuthTab(tab) {
    document.querySelectorAll('[data-atab]').forEach(el => el.classList.toggle('active', el.dataset.atab === tab));
    document.getElementById('atab-login').classList.toggle('hidden', tab !== 'login');
    document.getElementById('atab-register').classList.toggle('hidden', tab !== 'register');
  },

  async doLogin() {
    try {
      const { token, user } = await API.login(document.getElementById('li-email').value, document.getElementById('li-pass').value);
      API.setToken(token); CURRENT_USER = user;
      this.renderNav(); this.renderHome();
      toast('Đăng nhập thành công!');
    } catch (e) { toast(e.message); }
  },

  async doRegister() {
    try {
      const { token, user } = await API.register(
        document.getElementById('re-name').value,
        document.getElementById('re-email').value,
        document.getElementById('re-pass').value
      );
      API.setToken(token); CURRENT_USER = user;
      this.renderNav(); this.renderHome();
      toast('Tạo tài khoản thành công!');
    } catch (e) { toast(e.message); }
  },

  switchTab(tab) {
    document.querySelectorAll('.tab-row .tab[data-tab]').forEach(el => el.classList.toggle('active', el.dataset.tab === tab));
    document.getElementById('tab-create').classList.toggle('hidden', tab !== 'create');
    document.getElementById('tab-join').classList.toggle('hidden', tab !== 'join');
  },

  selectRole(role) {
    SELECTED_ROLE = role;
    document.querySelectorAll('.role-card').forEach(el => el.classList.toggle('active', el.dataset.role === role));
  },

  updateFeeHint() {
    const amt = Number(document.getElementById('f-amount')?.value || 0);
    const fee = Math.ceil(amt * 0.01);
    document.getElementById('fee-hint').textContent = amt ? `Phí dịch vụ 1%: ${money(fee)} — Tổng người mua thanh toán: ${money(amt + fee)}` : '';
  },

  async createRoom() {
    if (!CURRENT_USER) return toast('Vui lòng đăng nhập trước');
    try {
      const { room } = await API.createRoom({
        title: document.getElementById('f-title').value,
        description: document.getElementById('f-desc').value,
        amount: document.getElementById('f-amount').value,
        role: SELECTED_ROLE,
        inspectionHours: document.getElementById('f-hours').value,
      });
      toast('Đã tạo phòng ' + room.code);
      this.openRoom(room.code);
    } catch (e) { toast(e.message); }
  },

  async joinRoom() {
    if (!CURRENT_USER) return toast('Vui lòng đăng nhập trước');
    const code = document.getElementById('f-code').value.trim().toUpperCase();
    if (!code) return toast('Vui lòng nhập mã phòng');
    try {
      const { room } = await API.joinRoom(code);
      this.openRoom(room.code);
    } catch (e) { toast(e.message); }
  },

  async renderMyRooms() {
    const box = document.getElementById('my-rooms-box');
    try {
      const { rooms } = await API.myRooms();
      if (!rooms.length) { box.innerHTML = ''; return; }
      box.innerHTML = `<h3>Phòng của tôi</h3>` + rooms.map(r => `
        <div class="info-row" style="cursor:pointer;" onclick="UI.openRoom('${r.code}')">
          <span>${r.title} <span style="color:var(--text-muted);font-size:12px;">(${r.code})</span></span>
          <span class="badge badge-${r.status}">${statusLabel(r.status)}</span>
        </div>`).join('');
    } catch (e) { box.innerHTML = ''; }
  },

  async openRoom(code) {
    CURRENT_ROOM_CODE = code;
    Router.go('room');
    await this.loadRoom();
    LAST_MSG_ID = 0;
    await this.loadMessages(true);
    ROOM_TIMER = setInterval(() => this.loadRoom(), 5000);
    CHAT_TIMER = setInterval(() => this.loadMessages(false), 3000);
  },

  async loadRoom() {
    try {
      const { room, transactions, disputes } = await API.getRoom(CURRENT_ROOM_CODE);
      this.renderRoom(room, transactions, disputes);
    } catch (e) { toast(e.message); }
  },

  renderRoom(room, transactions, disputes) {
    document.getElementById('room-badge').className = 'badge badge-' + room.status;
    document.getElementById('room-badge').textContent = statusLabel(room.status);
    document.getElementById('room-code-display').textContent = room.code;
    document.getElementById('room-title').textContent = room.title;

    const isBuyer = CURRENT_USER.id === room.buyer_id;
    const isSeller = CURRENT_USER.id === room.seller_id;

    document.getElementById('room-info-rows').innerHTML = `
      <div class="info-row"><span>Sản phẩm / Dịch vụ</span><span>${room.description || '—'}</span></div>
      <div class="info-row"><span>Giá trị giao dịch</span><span style="font-weight:700;color:var(--accent);">${money(room.amount)}</span></div>
      <div class="info-row"><span>Phí dịch vụ</span><span>${money(room.fee)} · Người mua chịu</span></div>
      <div class="info-row"><span>Thời hạn kiểm tra</span><span>${room.inspection_hours} giờ sau khi nhận hàng</span></div>
      <div class="info-row"><span>Vai trò của bạn</span><span>${isBuyer ? '🛒 Người mua' : isSeller ? '📦 Người bán' : '—'}</span></div>`;

    // Action panel theo trạng thái
    const panel = document.getElementById('action-panel');
    if (room.status === 'pending') {
      panel.innerHTML = `<h3>⏳ Đang chờ đối tác</h3><p class="sub">Chia sẻ mã phòng bên dưới cho ${room.creator_role === 'buyer' ? 'người bán' : 'người mua'} để họ tham gia.</p>
        <div class="copy-code" onclick="UI.copyRoomCode()">${room.code}</div>`;
    } else if (room.status === 'active') {
      if (isBuyer) {
        panel.innerHTML = `<h3>🏦 Thanh toán vào escrow</h3><p class="sub">Nhấn nút bên dưới để thanh toán an toàn qua VNPay. Tiền sẽ được SafePay giữ cho đến khi bạn xác nhận đã nhận hàng.</p>
          <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="UI.payWithVnpay()">Thanh toán ${money(room.amount + room.fee)} qua VNPay</button>`;
      } else {
        panel.innerHTML = `<h3>⏳ Chờ người mua thanh toán</h3><p class="sub">Người mua cần nạp tiền vào escrow trước khi bạn giao hàng/dịch vụ.</p>`;
      }
    } else if (room.status === 'escrow') {
      let html = `<div class="alert-box alert-success">✅ SafePay đã giữ ${money(room.amount)} an toàn.</div>`;
      if (isBuyer) {
        html += `<h3>✅ Xác nhận hoàn tất</h3><p class="sub">Bạn đã kiểm tra và hài lòng với hàng hoá / dịch vụ nhận được?</p>
          <button class="btn btn-success" style="width:100%;justify-content:center;margin-bottom:8px;" onclick="UI.completeRoom()">✓ Xác nhận hoàn tất & giải ngân</button>
          <button class="btn btn-danger" style="width:100%;justify-content:center;" onclick="UI.openDispute()">✕ Có vấn đề với hàng hoá</button>`;
      } else {
        html += `<h3>📦 Đang giao dịch</h3><p class="sub">Chờ người mua xác nhận đã nhận hàng để giải ngân.</p>
          <button class="btn btn-danger" style="width:100%;justify-content:center;" onclick="UI.openDispute()">✕ Báo cáo vấn đề</button>`;
      }
      panel.innerHTML = html;
    } else if (room.status === 'complete') {
      panel.innerHTML = `<div class="alert-box alert-success">🎉 Giao dịch đã hoàn tất.</div><p class="sub">${isSeller ? 'Admin sẽ chuyển khoản cho bạn và cập nhật trạng thái giải ngân bên dưới.' : 'Cảm ơn bạn đã sử dụng SafePay!'}</p>`;
    } else if (room.status === 'dispute') {
      panel.innerHTML = `<div class="alert-box alert-danger">⚠️ Giao dịch đang trong quá trình tranh chấp. Đội ngũ SafePay sẽ xem xét và đưa ra quyết định.</div>`;
    }

    // Danh sách giao dịch tiền
    const txBox = document.getElementById('tx-list');
    if (!transactions.length) {
      txBox.innerHTML = `<p class="sub" style="margin:0;">Chưa có giao dịch tiền nào.</p>`;
    } else {
      txBox.innerHTML = transactions.map(t => `
        <div class="info-row">
          <span>${txTypeLabel(t.type)} ${t.gateway ? '· ' + t.gateway : ''}</span>
          <span>${money(t.amount)} <span class="badge badge-${t.status === 'success' ? 'complete' : t.status === 'failed' ? 'dispute' : 'pending'}" style="margin-left:6px;">${txStatusLabel(t.status)}</span></span>
        </div>`).join('');
    }
  },

  copyRoomCode() {
    navigator.clipboard.writeText(CURRENT_ROOM_CODE);
    toast('Đã sao chép mã phòng: ' + CURRENT_ROOM_CODE);
  },

  async payWithVnpay() {
    try {
      const { url } = await API.createVnpayUrl(CURRENT_ROOM_CODE);
      window.location.href = url; // chuyển hướng THẬT sang cổng thanh toán VNPay
    } catch (e) { toast(e.message); }
  },

  async completeRoom() {
    if (!confirm('Xác nhận bạn đã nhận đủ hàng/dịch vụ và đồng ý giải ngân cho người bán?')) return;
    try { await API.completeRoom(CURRENT_ROOM_CODE); toast('Đã xác nhận hoàn tất!'); this.loadRoom(); }
    catch (e) { toast(e.message); }
  },

  async openDispute() {
    const reason = prompt('Mô tả vấn đề bạn gặp phải với giao dịch này:');
    if (!reason) return;
    try { await API.disputeRoom(CURRENT_ROOM_CODE, reason); toast('Đã gửi yêu cầu tranh chấp tới SafePay'); this.loadRoom(); }
    catch (e) { toast(e.message); }
  },

  async loadMessages(initial) {
    try {
      const { messages } = await API.getMessages(CURRENT_ROOM_CODE, LAST_MSG_ID);
      if (!messages.length) return;
      const box = document.getElementById('chat-box');
      messages.forEach(m => {
        LAST_MSG_ID = Math.max(LAST_MSG_ID, m.id);
        const div = document.createElement('div');
        if (m.is_system) {
          div.className = 'system-msg';
          div.textContent = m.content;
        } else {
          const mine = CURRENT_USER && m.sender_id === CURRENT_USER.id;
          div.className = 'msg ' + (mine ? 'me' : 'other');
          div.innerHTML = `${mine ? '' : `<div class="msg-name">👤 ${m.sender_name}</div>`}<div class="msg-bubble"></div><div class="msg-time">${fmtTime(m.created_at)}</div>`;
          div.querySelector('.msg-bubble').textContent = m.content; // tránh XSS
        }
        box.appendChild(div);
      });
      if (initial || box.scrollHeight - box.scrollTop < 500) box.scrollTop = box.scrollHeight;
    } catch (e) { /* im lặng khi polling lỗi tạm thời */ }
  },

  async sendChat() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content) return;
    input.value = '';
    try { await API.sendMessage(CURRENT_ROOM_CODE, content); this.loadMessages(false); }
    catch (e) { toast(e.message); }
  },

  // ===== ADMIN =====
  async renderAdmin() {
    if (!CURRENT_USER || CURRENT_USER.role !== 'admin') { toast('Bạn không có quyền admin'); Router.go('home'); return; }
    try {
      const { roomsByStatus, pendingPayouts, openDisputes, totalEscrowHeld } = await API.adminStats();
      document.getElementById('admin-stats').innerHTML = `
        <div class="grid-2">
          <div class="info-row"><span>Đang giữ tiền (escrow)</span><span style="font-weight:700;">${money(totalEscrowHeld.total)}</span></div>
          <div class="info-row"><span>Chờ giải ngân</span><span>${pendingPayouts.c} khoản · ${money(pendingPayouts.total)}</span></div>
          <div class="info-row"><span>Tranh chấp đang mở</span><span>${openDisputes.c}</span></div>
        </div>
        <div style="margin-top:10px;">${roomsByStatus.map(r => `<span class="badge badge-${r.status}" style="margin-right:6px;">${statusLabel(r.status)}: ${r.c}</span>`).join('')}</div>`;
    } catch (e) { toast(e.message); }

    try {
      const { payouts } = await API.adminPayouts();
      const pending = payouts.filter(p => p.status === 'pending');
      document.getElementById('admin-payouts').innerHTML = !pending.length ? '<p class="sub">Không có khoản nào đang chờ.</p>' :
        pending.map(p => `
          <div class="card" style="padding:14px;margin-bottom:10px;">
            <div class="info-row"><span>${p.type === 'payout' ? 'Giải ngân' : 'Hoàn tiền'} · Phòng ${p.room_code}</span><span style="font-weight:700;">${money(p.amount)}</span></div>
            <div class="info-row"><span>Người nhận</span><span>${p.recipient_name || '—'} (${p.recipient_email || '—'})</span></div>
            <form onsubmit="UI.confirmPayout(event, ${p.id})" style="margin-top:8px;display:flex;gap:8px;align-items:center;">
              <input type="file" name="proof" accept="image/*" style="flex:1;">
              <button class="btn btn-success btn-sm" type="submit">Xác nhận đã chuyển khoản</button>
            </form>
          </div>`).join('');
    } catch (e) { /* noop */ }

    try {
      const { disputes } = await API.adminDisputes();
      const open = disputes.filter(d => d.status === 'open');
      document.getElementById('admin-disputes').innerHTML = !open.length ? '<p class="sub">Không có tranh chấp nào đang mở.</p>' :
        open.map(d => `
          <div class="card" style="padding:14px;margin-bottom:10px;">
            <div class="info-row"><span>Phòng ${d.room_code} — ${d.title}</span><span>${money(d.amount)}</span></div>
            <p style="font-size:13px;margin:8px 0;"><b>Lý do:</b> ${d.reason}</p>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-success btn-sm" onclick="UI.resolveDispute(${d.id}, 'seller')">Nghiêng về người bán</button>
              <button class="btn btn-danger btn-sm" onclick="UI.resolveDispute(${d.id}, 'buyer')">Nghiêng về người mua</button>
            </div>
          </div>`).join('');
    } catch (e) { /* noop */ }
  },

  async confirmPayout(ev, id) {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    try { await API.adminConfirmPayout(id, fd); toast('Đã xác nhận chuyển khoản'); this.renderAdmin(); }
    catch (e) { toast(e.message); }
  },

  async resolveDispute(id, decision) {
    const note = prompt('Ghi chú quyết định xử lý (tuỳ chọn):') || '';
    try { await API.adminResolveDispute(id, decision, note); toast('Đã xử lý tranh chấp'); this.renderAdmin(); }
    catch (e) { toast(e.message); }
  },
};

function statusLabel(s) {
  return { pending: 'Chờ đối tác', active: 'Chờ thanh toán', escrow: 'Đang giữ tiền', complete: 'Hoàn tất', dispute: 'Tranh chấp', cancelled: 'Đã huỷ' }[s] || s;
}
function txTypeLabel(t) { return { deposit: 'Nạp vào escrow', payout: 'Giải ngân người bán', refund: 'Hoàn tiền người mua' }[t] || t; }
function txStatusLabel(s) { return { pending: 'Đang chờ', success: 'Thành công', failed: 'Thất bại' }[s] || s; }

document.getElementById('f-amount')?.addEventListener?.('input', () => UI.updateFeeHint());
document.addEventListener('input', (e) => { if (e.target.id === 'f-amount') UI.updateFeeHint(); });

UI.init();
