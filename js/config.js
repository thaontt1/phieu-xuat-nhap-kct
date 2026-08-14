'use strict';

/**
 * CẤU HÌNH — file duy nhất cần sửa khi backend đổi.
 *
 * ⚠️ Đây là lớp đệm giúp tem QR dán ngoài kho sống vĩnh viễn:
 *    QR trỏ vào trang này, KHÔNG trỏ thẳng vào Apps Script.
 *    Mai kia deployment Apps Script đổi ID → chỉ sửa API_URL dưới đây,
 *    commit lại repo là xong, KHÔNG phải bóc tem in lại.
 *
 * ⚠️ App này KHÔNG dùng chung backend với app "Biên bản sự cố giao nhận".
 *    Apps Script riêng + Google Sheet riêng (user chốt tách hẳn 04/08) —
 *    để mọi thay đổi ở đây không đụng vào hệ thống biên bản đang chạy thật.
 */

var CONFIG = {

  // URL web app Apps Script (đuôi /exec). Lấy ở: Deploy → Manage deployments.
  // KHÔNG được chứa đoạn /u/<số>/ — đó là chỉ số tài khoản của riêng máy người
  // copy, dán vào đây thì máy người khác mở sẽ vào nhầm tài khoản.
  //
  // ⚠️ Đổi giá trị này thì PHẢI push lại repo Pages, không thì trang live vẫn
  //    gọi vào deployment cũ. Chỉ đổi khi lỡ bấm "New deployment" — deploy đúng
  //    cách (✏️ Edit → Version: New) thì id giữ nguyên, khỏi phải đụng vào đây.
  // ⚠️ CHƯA ĐIỀN. Deploy Apps Script của CỤM HN02 + DƯƠNG XÁ xong (bước X6 trong
  //    HUONG_DAN_TUNG_BUOC.md) thì dán URL /exec vào đây rồi mới push repo.
  //    TUYỆT ĐỐI không dán URL của HY01 vào — phiếu 2 kho mới sẽ chạy vào Sheet
  //    và nhóm Telegram của HY01 mà KHÔNG báo lỗi gì.
  API_URL: 'CHUA_DIEN_URL_APPS_SCRIPT',

  // 0 = không giới hạn số ảnh.
  // ⚠️ Trang này KHÔNG hỏi backend lúc mở ⇒ con số này độc lập với MAX_PHOTOS trong
  //    Code.gs. Đổi thì phải đổi KHỚP cả hai, và deploy backend TRƯỚC khi push web —
  //    để lệch (web thả tự do, backend còn cắt) là ảnh dư bị bỏ âm thầm.
  MAX_PHOTOS: 0,
  MAX_EDGE: 1600,   // px — cạnh dài nhất của ảnh sau khi nén
  JPEG_Q: 0.72
};
