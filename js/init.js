'use strict';

/**
 * Điểm khởi động: xác định loại phiếu → dựng form → gắn sự kiện.
 *
 * ⚠️ KHÔNG gọi bootstrap như app Biên bản sự cố. App đó phải hỏi máy chủ danh
 *    mục khu vực + danh sách lựa chọn trước khi dựng form. Phiếu xuất/nhập
 *    toàn ô gõ tự do nên không cần hỏi gì cả ⇒ bỏ luôn vòng gọi mạng lúc mở
 *    trang: form hiện ngay, kho sóng yếu vẫn mở được, bớt một chỗ hỏng.
 *    (Đánh đổi: không biết backend sống hay chết cho tới lúc bấm gửi — chấp
 *    nhận được vì màn lỗi có nút gửi lại và dữ liệu đã nhập vẫn còn.)
 *
 * Ghi chú CORS: Apps Script không xử lý được preflight OPTIONS, nên request gửi
 * phiếu phải là "simple request": POST body chuỗi, để fetch tự đặt
 * Content-Type: text/plain. KHÔNG set application/json — sẽ kích hoạt preflight
 * và hỏng. Phía Apps Script tự JSON.parse nội dung body.
 */

(function boot() {
  var loai = qs('loai').trim().toLowerCase();
  KHO = qs('kho').trim();   // cụm HN02 + Dương Xá: tem QR mỗi kho mang sẵn tham số này

  if (loai === 'xuat' || loai === 'nhap') {
    start(loai);
    return;
  }

  // Mở link trần (không có ?loai=) → cho chọn thay vì đoán bừa.
  show($('pick'), true);
  document.querySelectorAll('.pick-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      show($('pick'), false);
      start(btn.getAttribute('data-loai'));
    });
  });
})();

function start(loai) {
  applyLoai(loai);
  renderKho();

  show($('frm'), true);
  // MAX_PHOTOS = 0 ⇒ không giới hạn. Câu chữ đổi hẳn chứ không in số 0 ra màn hình.
  $('maxPhotoTxt').textContent = CONFIG.MAX_PHOTOS
    ? 'Tối đa ' + CONFIG.MAX_PHOTOS + ' ảnh'
    : 'Không giới hạn số ảnh';

  initScan();

  $('photoCam').addEventListener('change', onPickPhotos);
  $('photoLib').addEventListener('change', onPickPhotos);
  $('frm').addEventListener('submit', onSubmit);
  $('btnAgain').addEventListener('click', function () { location.reload(); });

  // Các ô mã / biển số luôn viết hoa cho đồng nhất khi thống kê.
  // Ô "Cửa", "Tỉnh", "Người" giữ nguyên chữ người ta gõ (user chốt gõ tự do).
  ['maChuyenDi', 'bienSoXe', 'sealXe'].forEach(function (id) {
    $(id).addEventListener('input', function () { this.value = this.value.toUpperCase(); });
  });
}

function onSubmit(ev) {
  ev.preventDefault();
  var p = collect();
  var errs = validateClient(p);
  var box = $('errBox');

  if (errs.length) {
    box.textContent = '• ' + errs.join('\n• ');
    show(box, true);
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  show(box, false);

  $('btnSubmit').disabled = true;
  show($('overlay'), true);
  $('overlayTxt').textContent = photos.length
    ? 'Đang tải ' + photos.length + ' ảnh và gửi phiếu…'
    : 'Đang gửi phiếu…';

  fetch(CONFIG.API_URL, { method: 'POST', body: JSON.stringify(p) })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (!res || !res.ok) throw new Error((res && res.error) || 'Máy chủ từ chối dữ liệu.');
      onOk(res);
    })
    .catch(onFail);
}

function onOk(res) {
  show($('overlay'), false);
  show($('frm'), false);
  $('doneCode').textContent = 'Mã phiếu: ' + res.maPhieu;

  if (res.telegramUrl) {
    $('doneTg').href = res.telegramUrl;
    show($('doneTg'), true);
  }
  if (res.warnings && res.warnings.length) {
    $('doneWarn').textContent = '⚠️ Dữ liệu đã lưu, nhưng:\n• ' + res.warnings.join('\n• ');
    show($('doneWarn'), true);
  }
  show($('done'), true);
  window.scrollTo(0, 0);
}

function onFail(err) {
  show($('overlay'), false);
  $('btnSubmit').disabled = false;
  var box = $('errBox');
  box.textContent = 'Gửi thất bại:\n' + (err && err.message ? err.message : err) +
    '\n\nKiểm tra kết nối mạng rồi bấm gửi lại. Dữ liệu bạn đã nhập vẫn còn.';
  show(box, true);
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
