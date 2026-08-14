'use strict';

/**
 * Dựng nhãn theo loại phiếu + gom dữ liệu + kiểm tra trước khi gửi.
 *
 * ⚠️ KHÔNG nhớ lại ô nào giữa các lượt lập phiếu (không localStorage, không
 *    tự điền từ lượt trước). Phiếu xuất/nhập là chứng từ giao ca — ô điền sẵn
 *    dễ bị bấm gửi luôn mà không đọc, ghi nhầm tên người của lượt trước.
 *    Bài học đã trả giá bên app Biên bản sự cố (§12). Đừng thêm lại "tiện ích" này.
 */

/** Đổi toàn bộ chữ trên form sang loại phiếu đang lập. */
function applyLoai(loai) {
  LOAI = (loai === 'nhap') ? 'nhap' : 'xuat';
  var n = NHAN[LOAI];

  document.title = n.tieuDe + ' — GHN';
  $('hdrTitle').textContent = n.tieuDe;
  $('hdrSub').textContent = 'Điền 6 ô rồi bấm gửi';

  var badge = $('hdrBadge');
  badge.textContent = n.icon + ' ' + n.ten;
  badge.className = 'hdr-badge ' + LOAI;
  show(badge, true);

  $('hdrKhoiKho').textContent = n.khoi;

  // Nhãn có dấu * bắt buộc — dựng lại cả phần <span> để không mất dấu sao.
  $('lblTinh').innerHTML = escHtml(n.tinh) + ' <span class="req">*</span>';
  $('lblNguoi').innerHTML = escHtml(n.nguoi) + ' <span class="req">*</span>';
  $('tinh').placeholder = n.phVeTinh;
  $('nguoi').placeholder = n.phVeNguoi;
}

/**
 * Ô "Kho" — chỉ có ở cụm HN02 + Dương Xá, bản HY01 KHÔNG có.
 *
 * ⚠️ KHÔNG tự chọn sẵn kho đầu danh sách. Quét nhầm tem / mở link trần mà form
 *    lẳng lặng chọn "Hà Nội 02" thì phiếu ghi sai kho mà không ai biết.
 */
function renderKho() {
  var sel = $('kho');

  DS_KHO.forEach(function (v) {
    var o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });

  // Tem QR mang sẵn ?kho= → điền luôn. So không phân biệt hoa/thường vì giá trị
  // này đi qua URL, người dựng tem dễ gõ lệch kiểu chữ.
  if (KHO) {
    var hit = '';
    DS_KHO.forEach(function (v) {
      if (v.toLowerCase() === KHO.toLowerCase()) hit = v;
    });
    if (hit) {
      sel.value = hit;
      $('khoHint').textContent = 'Đã nhận kho từ tem QR — sai thì chọn lại.';
    } else {
      $('khoHint').textContent = '⚠️ Tem QR ghi kho "' + KHO + '" không có trong danh sách — chọn tay giúp mình.';
    }
  }
}

function collect() {
  return {
    loai: LOAI,
    kho: $('kho').value.trim(),
    maChuyenDi: $('maChuyenDi').value.trim().toUpperCase(),
    bienSoXe: $('bienSoXe').value.trim().toUpperCase(),
    sealXe: $('sealXe').value.trim().toUpperCase(),
    cua: $('cua').value.trim(),
    tinh: $('tinh').value.trim(),
    nguoi: $('nguoi').value.trim(),
    ghiChu: $('ghiChu').value.trim(),
    photos: photos.map(function (p) {
      return { name: p.name, mimeType: p.mimeType, data: p.data };
    })
  };
}

/**
 * Kiểm phía máy để báo lỗi ngay, khỏi mất một vòng gọi mạng.
 * Server vẫn kiểm lại đầy đủ — form có thể bị bỏ qua bằng cách gọi thẳng API.
 */
function validateClient(p) {
  var e = [];

  function need(id, nhan) {
    var el = $(id);
    if (!el.value.trim()) {
      e.push('Thiếu ' + nhan + '.');
      el.classList.add('invalid');
    } else {
      el.classList.remove('invalid');
    }
  }

  var n = NHAN[LOAI] || NHAN.xuat;
  need('kho', 'Kho');
  need('maChuyenDi', 'Mã chuyến đi');
  need('bienSoXe', 'Biển số xe');
  need('sealXe', 'Seal xe');
  need('cua', 'Cửa');
  need('tinh', n.tinh);
  need('nguoi', n.nguoi);

  if (['xuat', 'nhap'].indexOf(p.loai) < 0) {
    e.push('Chưa xác định được loại phiếu (xuất hay nhập) — tải lại trang và chọn lại.');
  }
  return e;
}
