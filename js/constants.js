'use strict';

/** Trạng thái dùng chung giữa các file — không chứa DOM. */
var LOAI = '';        // 'xuat' | 'nhap' — đọc từ ?loai= trên URL hoặc màn chọn

/**
 * Kho đọc từ ?kho= trên URL — KHÁC bản HY01.
 *
 * Cụm này có HAI kho (Hà Nội 02, Dương Xá) dùng CHUNG một Google Sheet và
 * chung cặp nhóm Telegram xuất/nhập. Không có trường này thì hai kho trộn vào
 * nhau, mở Sheet ra không tách nổi — mà lỗi đó KHÔNG báo gì, chỉ lộ khi đi làm
 * báo cáo. Tem QR mỗi kho mang sẵn ?kho= nên nhân viên không phải chọn.
 *
 * ⚠️ Giữ khớp ĐÚNG CHUỖI với OPT_KHO trong apps_script/Code.gs — lệch một chữ
 *    là form cho chọn giá trị mà server từ chối.
 */
var KHO = '';
var DS_KHO = ['Hà Nội 02', 'Dương Xá'];

/**
 * Chữ hiển thị theo loại phiếu.
 *
 * Toàn bộ khác biệt giữa phiếu XUẤT và phiếu NHẬP nằm gọn trong bảng này —
 * cấu trúc dữ liệu, luồng gửi, cách quét mã đều y hệt nhau. Muốn đổi chữ thì
 * sửa ở đây, đừng rải if/else khắp nơi.
 *
 * ⚠️ Hai khoá `xuat` / `nhap` phải khớp ĐÚNG chuỗi mà backend nhận
 *    (xem LOAI_XUAT / LOAI_NHAP trong Code.gs) — lệch một chữ là server từ chối.
 */
var NHAN = {
  xuat: {
    ten: 'PHIẾU XUẤT',
    tieuDe: 'Phiếu xuất hàng',
    icon: '📤',
    khoi: 'Nơi xuất hàng',
    tinh: 'Tỉnh xuất',
    nguoi: 'Tên người xuất',
    phVeTinh: 'VD: Thái Bình',
    phVeNguoi: 'Họ tên người xuất hàng'
  },
  nhap: {
    ten: 'PHIẾU NHẬP',
    tieuDe: 'Phiếu nhập hàng',
    icon: '📥',
    khoi: 'Nơi nhập hàng',
    tinh: 'Tỉnh nhập',
    nguoi: 'Tên người nhập',
    phVeTinh: 'VD: Hải Dương',
    phVeNguoi: 'Họ tên người nhập hàng'
  }
};

function $(id) {
  return document.getElementById(id);
}

function escHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function qs(name) {
  var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
  return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : '';
}

function show(el, on) {
  el.hidden = !on;
}
