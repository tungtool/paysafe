// server/services/vnpay.js
// Tích hợp THẬT với VNPay (cổng thu tiền vào tài khoản escrow của bạn).
// Dựa theo tài liệu tích hợp chính thức của VNPay: https://sandbox.vnpayment.vn/apis/docs/
// Bạn cần điền VNPAY_TMN_CODE và VNPAY_HASH_SECRET thật (merchant đã đăng ký) vào .env
// Trước khi lên production, hãy test kỹ trên môi trường sandbox của VNPay.

const crypto = require('crypto');
require('dotenv').config();

function sortObject(obj) {
  const sorted = {};
  Object.keys(obj).sort().forEach(key => { sorted[key] = obj[key]; });
  return sorted;
}

function buildPaymentUrl({ amount, orderId, orderInfo, ipAddr, bankCode }) {
  const tmnCode = process.env.VNPAY_TMN_CODE;
  const secretKey = process.env.VNPAY_HASH_SECRET;
  const vnpUrl = process.env.VNPAY_URL;
  const returnUrl = process.env.VNPAY_RETURN_URL;

  if (!tmnCode || !secretKey || tmnCode === 'YOUR_TMN_CODE') {
    throw new Error('Chưa cấu hình VNPAY_TMN_CODE / VNPAY_HASH_SECRET trong .env — không thể tạo link thanh toán thật.');
  }

  const date = new Date();
  const createDate = date.toISOString().replace(/[-:T.]/g, '').slice(0, 14);

  let vnpParams = {
    vnp_Version: '2.1.0',
    vnp_Command: 'pay',
    vnp_TmnCode: tmnCode,
    vnp_Locale: 'vn',
    vnp_CurrCode: 'VND',
    vnp_TxnRef: orderId,
    vnp_OrderInfo: orderInfo,
    vnp_OrderType: 'other',
    vnp_Amount: Math.round(amount) * 100, // VNPay yêu cầu nhân 100
    vnp_ReturnUrl: returnUrl,
    vnp_IpAddr: ipAddr || '127.0.0.1',
    vnp_CreateDate: createDate,
  };
  if (bankCode) vnpParams.vnp_BankCode = bankCode;

  vnpParams = sortObject(vnpParams);

  const signData = Object.entries(vnpParams).map(([k, v]) => `${k}=${v}`).join('&');
  const hmac = crypto.createHmac('sha512', secretKey);
  const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
  vnpParams.vnp_SecureHash = signed;

  const query = Object.entries(vnpParams).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  return `${vnpUrl}?${query}`;
}

// Xác thực chữ ký khi VNPay gọi lại (return URL hoặc IPN)
function verifySignature(queryParams) {
  const secretKey = process.env.VNPAY_HASH_SECRET;
  const params = { ...queryParams };
  const receivedHash = params.vnp_SecureHash;
  delete params.vnp_SecureHash;
  delete params.vnp_SecureHashType;

  const sorted = sortObject(params);
  const signData = Object.entries(sorted).map(([k, v]) => `${k}=${v}`).join('&');
  const hmac = crypto.createHmac('sha512', secretKey);
  const computedHash = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

  return computedHash === receivedHash;
}

module.exports = { buildPaymentUrl, verifySignature };
