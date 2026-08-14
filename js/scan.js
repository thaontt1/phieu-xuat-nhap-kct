'use strict';

/**
 * Quét mã vạch bằng camera — dùng chung cho NHIỀU ô (mã chuyến đi, seal xe).
 *
 * Ô đích khai bằng thuộc tính trên nút bấm:
 *   <button data-scan="maChuyenDi">                → quét xong ĐIỀN ĐÈ, đóng luôn
 *   <button data-scan="abc" data-scan-mode="append"> → quét xong THÊM vào danh
 *        sách ngăn bởi dấu phẩy, KHÔNG đóng — quét tiếp mã thứ 2, 3…
 *   (App phiếu xuất/nhập hiện chỉ dùng chế độ 'replace'; chế độ 'append' giữ
 *    nguyên vì code dùng chung với app Biên bản sự cố, bỏ đi là lệch 2 bản.)
 *
 * Bắt sự kiện theo kiểu uỷ quyền ở document để nút sinh động về sau vẫn ăn.
 *
 * Dùng ZXing nhúng sẵn trong repo (js/vendor/zxing.min.js) thay vì CDN ngoài —
 * kho có thể sóng yếu, phụ thuộc CDN là rước rủi ro.
 * Máy không có camera / trình duyệt không hỗ trợ → nút tự khoá, nhập tay như cũ.
 *
 * Hai chế độ đọc:
 *   1. Quét liên tục từ luồng video (nhanh, dùng khi mã rõ nét).
 *   2. "Chụp để quét" — chụp 1 ảnh tĩnh rồi giải mã. Ảnh tĩnh nét và phân giải
 *      cao hơn khung video nhiều, cứu được ca mã mờ / chụp qua màn hình.
 *
 * ⚠️ Đường video KHÔNG dùng decodeFromConstraints của thư viện nữa (31/07).
 *    Lý do: hàm đó dò TOÀN BỘ khung 1920x1080 mỗi lượt — vừa chậm (ít lượt
 *    thử mỗi giây) vừa dính nhiễu nền. Thay bằng vòng lặp tự viết: chỉ cắt
 *    DẢI NGANG GIỮA KHUNG rồi đưa xuống lớp thấp (MultiFormatReader +
 *    HybridBinarizer). Kèm ZOOM quang học — yếu tố quyết định với mã 1D:
 *    Code128 15 ký tự ≈ 200 module, muốn đọc chắc thì mỗi module cần ≥2 điểm
 *    ảnh, zoom 2x là tăng gấp đôi bề rộng mỗi vạch.
 */

var scanStream = null;      // MediaStream đang mở
var scanTrack = null;       // video track (để zoom / đèn)
var scanLoopId = 0;         // setTimeout của vòng dò
var scanCanvas = null;      // canvas tái dùng, tránh cấp phát mỗi khung hình
var scanCore = null;        // MultiFormatReader (lớp thấp)
var scanTargetId = '';      // id ô đang chờ điền
var scanMode = 'replace';   // 'replace' | 'append'
var scanLastCode = '';      // chống bắn lặp cùng 1 mã liên tục
var scanLastAt = 0;
var scanZoomCap = null;     // {min,max,step} nếu máy cho chỉnh zoom
var scanZoom = 1;
var scanAudio = null;       // AudioContext — dựng lúc bấm nút (cần cử chỉ người dùng)
var scanOkTimer = 0;        // hẹn giờ tắt dấu tích
var scanClosing = false;    // chặn quét thêm trong lúc chờ đóng màn

/** Dải cắt để dò: full bề ngang, 42% chiều cao, canh giữa.
 *  Cắt theo CHIỀU CAO là chính — mã vạch dài nằm ngang, giữ nguyên bề ngang
 *  để không cắt cụt mã; bỏ phần trên/dưới vừa nhanh vừa bớt nhiễu. */
var SCAN_BAND = 0.42;

function scanSupported() {
  return typeof ZXing !== 'undefined' &&
         !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

function initScan() {
  if (!scanSupported()) {
    document.querySelectorAll('[data-scan]').forEach(disableScanBtn);
    show($('scanHint'), true);
    return;
  }

  // Uỷ quyền: bắt cho cả nút có sẵn lẫn nút sinh động về sau.
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest ? ev.target.closest('[data-scan]') : null;
    if (!btn || btn.disabled) return;
    openScanner(btn.getAttribute('data-scan'),
                btn.getAttribute('data-scan-mode') || 'replace');
  });

  $('btnScanCancel').addEventListener('click', closeScanner);
  $('btnScanShot').addEventListener('click', function () { $('scanShot').click(); });
  $('scanShot').addEventListener('change', onScanShot);
  $('btnZoomIn').addEventListener('click', function () { nudgeZoom(1); });
  $('btnZoomOut').addEventListener('click', function () { nudgeZoom(-1); });
  $('btnTorch').addEventListener('click', toggleTorch);
}

function disableScanBtn(btn) {
  btn.disabled = true;
  btn.textContent = '—';
}

/**
 * Chỉ bật các định dạng thực sự dùng trên chứng từ vận chuyển.
 * Càng ít định dạng, mỗi khung hình dò càng nhanh → bắt mã nhạy hơn hẳn.
 */
function scanHints_() {
  var F = ZXing.BarcodeFormat;
  var h = new Map();
  h.set(ZXing.DecodeHintType.POSSIBLE_FORMATS,
        [F.CODE_128, F.CODE_39, F.ITF, F.QR_CODE, F.DATA_MATRIX]);
  h.set(ZXing.DecodeHintType.TRY_HARDER, true);
  return h;
}

/**
 * Tiếng "ting" báo đã nhận mã.
 *
 * Dựng bằng WebAudio chứ KHÔNG nhúng file mp3: không thêm file nhị phân vào repo,
 * không phải chờ tải, và kho sóng yếu vẫn kêu.
 * ⚠️ iOS chặn phát tiếng nếu AudioContext không được tạo/đánh thức trong một cử
 *    chỉ người dùng — nên gọi hàm này ngay ở nhánh bấm nút mở máy quét.
 */
function wakeAudio() {
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    if (!scanAudio) scanAudio = new AC();
    if (scanAudio.state === 'suspended') scanAudio.resume();
  } catch (e) { scanAudio = null; }
}

/** notes: mảng [tần số Hz, thời điểm bắt đầu (giây), độ dài] */
function playTones(notes, vol) {
  if (!scanAudio) return;
  try {
    var t0 = scanAudio.currentTime;
    notes.forEach(function (n) {
      var osc = scanAudio.createOscillator();
      var gain = scanAudio.createGain();
      osc.type = 'sine';
      osc.frequency.value = n[0];
      var at = t0 + n[1], dur = n[2];
      // Bao hình dốc: lên rất nhanh rồi tắt dần — nghe thành tiếng "ting" gọn,
      // không bị "bụp" như bật/tắt đột ngột.
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(vol, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(gain);
      gain.connect(scanAudio.destination);
      osc.start(at);
      osc.stop(at + dur + 0.02);
    });
  } catch (e) { /* không kêu được thì vẫn còn dấu tích + rung */ }
}

/** Nhận mã mới: 2 nốt đi lên, nghe "ting" vui tai. */
function beepOk() { playTones([[988, 0, 0.16], [1319, 0.085, 0.20]], 0.32); }

/** Mã trùng: 1 nốt trầm — phải KHÁC tiếng nhận, không thì quét trùng vẫn tưởng đã thêm. */
function beepDup() { playTones([[420, 0, 0.22]], 0.26); }

/** Dấu tích đè giữa màn hình, kèm mã vừa đọc để người quét đối chiếu bằng mắt. */
function flashOk(code, isDup) {
  var box = $('scanOk');
  $('scanOkCode').textContent = code;
  box.classList.toggle('dup', !!isDup);
  box.querySelector('.scan-ok-tick').textContent = isDup ? '!' : '✓';

  // Gỡ rồi gắn lại để chạy lại hoạt ảnh khi quét liên tiếp nhiều mã.
  show(box, false);
  void box.offsetWidth;
  show(box, true);

  if (scanOkTimer) clearTimeout(scanOkTimer);
  scanOkTimer = setTimeout(function () { show(box, false); }, 900);
}

function openScanner(targetId, mode) {
  scanTargetId = targetId;
  scanMode = mode === 'append' ? 'append' : 'replace';
  scanLastCode = '';
  scanLastAt = 0;
  scanClosing = false;

  wakeAudio();                  // phải gọi trong cử chỉ bấm nút, xem chú thích trên

  show($('scanner'), true);
  show($('scanGot'), false);
  show($('scanOk'), false);
  show($('scanZoom'), false);
  show($('btnTorch'), false);
  $('scanTip').textContent = 'Đang mở camera…';
  $('btnScanCancel').textContent = scanMode === 'append' ? 'Xong' : 'Huỷ';

  scanCore = new ZXing.MultiFormatReader();
  scanCore.setHints(scanHints_());

  // Xin phân giải cao: mã Code128 dày vạch, ở 640x480 gần như không đọc nổi.
  navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      advanced: [{ focusMode: 'continuous' }]
    }
  }).then(function (stream) {
    scanStream = stream;
    scanTrack = stream.getVideoTracks()[0] || null;

    var v = $('scanVideo');
    v.srcObject = stream;
    v.play().catch(function () { /* iOS đôi khi kén, autoplay+muted lo phần này */ });

    setupZoom();
    $('scanTip').textContent = scanMode === 'append'
      ? 'Quét lần lượt từng mã kiện — xong hết thì bấm "Xong"'
      : 'Đưa mã vạch nằm NGANG vào dải sáng, cho mã chiếm gần hết bề ngang';

    scanTick();
  }).catch(function (e) {
    $('scanTip').textContent = 'Không mở được camera: ' +
      (e && e.name ? e.name : e) + ' — dùng nút "Chụp để quét" hoặc nhập tay.';
  });
}

/**
 * Zoom quang học — đòn bẩy lớn nhất với mã 1D. Máy cho chỉnh thì kéo sẵn lên 2x
 * (hoặc mức cao nhất máy cho, nếu dưới 2x) rồi hiện nút +/− cho người quét tự chỉnh.
 * Máy không hỗ trợ (nhiều bản iOS) thì ẩn luôn, không bày nút chết.
 */
function setupZoom() {
  var caps = (scanTrack && scanTrack.getCapabilities) ? scanTrack.getCapabilities() : null;

  if (caps && caps.zoom && caps.zoom.max > caps.zoom.min) {
    scanZoomCap = {
      min: caps.zoom.min,
      max: caps.zoom.max,
      step: caps.zoom.step || 0.1
    };
    show($('scanZoom'), true);
    applyZoom(Math.min(2, scanZoomCap.max));
  } else {
    scanZoomCap = null;
  }

  // Đèn pin: kho tối thì đây là thứ cứu được nhiều ca. iOS thường không cho.
  if (caps && caps.torch) show($('btnTorch'), true);
}

function applyZoom(z) {
  if (!scanZoomCap || !scanTrack) return;
  z = Math.max(scanZoomCap.min, Math.min(scanZoomCap.max, z));
  scanTrack.applyConstraints({ advanced: [{ zoom: z }] })
    .then(function () {
      scanZoom = z;
      $('zoomVal').textContent = z.toFixed(1) + '×';
    })
    .catch(function () { /* máy từ chối thì giữ nguyên mức cũ */ });
}

function nudgeZoom(dir) {
  if (!scanZoomCap) return;
  var step = Math.max(scanZoomCap.step, (scanZoomCap.max - scanZoomCap.min) / 10);
  applyZoom(scanZoom + dir * step);
}

function toggleTorch() {
  if (!scanTrack) return;
  var on = $('btnTorch').getAttribute('data-on') === '1';
  scanTrack.applyConstraints({ advanced: [{ torch: !on }] })
    .then(function () { $('btnTorch').setAttribute('data-on', on ? '0' : '1'); })
    .catch(function () { /* không bật được thì thôi */ });
}

/**
 * Một lượt dò: cắt dải ngang giữa khung hình rồi đưa xuống lớp thấp của ZXing.
 * Không dùng requestAnimationFrame — dò xong mới hẹn lượt kế, để máy yếu không
 * bị dồn việc.
 */
function scanTick() {
  var v = $('scanVideo');
  if (!scanStream || !v) return;

  var w = v.videoWidth, h = v.videoHeight;
  if (!w || !h) {                       // luồng chưa có khung hình đầu tiên
    scanLoopId = setTimeout(scanTick, 120);
    return;
  }

  var bandH = Math.max(80, Math.round(h * SCAN_BAND));
  var sy = Math.round((h - bandH) / 2);

  if (!scanCanvas) scanCanvas = document.createElement('canvas');
  if (scanCanvas.width !== w || scanCanvas.height !== bandH) {
    scanCanvas.width = w;
    scanCanvas.height = bandH;
  }

  var ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(v, 0, sy, w, bandH, 0, 0, w, bandH);

  try {
    var src = new ZXing.HTMLCanvasElementLuminanceSource(scanCanvas);
    var bmp = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src));
    var res = scanCore.decode(bmp);
    if (res) onScanned(res.getText());
  } catch (e) {
    // Khung hình không có mã → NotFoundException. Chuyện thường, bỏ qua.
  }
  try { scanCore.reset(); } catch (e) { /* không sao */ }

  if (scanStream) scanLoopId = setTimeout(scanTick, 60);
}

/** Chụp 1 ảnh tĩnh rồi giải mã — cứu ca mã mờ hoặc chụp qua màn hình. */
function onScanShot(ev) {
  var file = (ev.target.files || [])[0];
  ev.target.value = '';
  if (!file) return;

  $('scanTip').textContent = 'Đang đọc mã từ ảnh…';
  var reader = new FileReader();
  reader.onload = function () {
    var r = new ZXing.BrowserMultiFormatReader(scanHints_());
    r.decodeFromImageUrl(reader.result)
      .then(function (result) { onScanned(result.getText()); })
      .catch(function () {
        $('scanTip').textContent =
          'Không đọc được mã trong ảnh. Chụp lại gần hơn, đủ sáng, mã nằm ngang và không bị loá.';
      });
  };
  reader.readAsDataURL(file);
}

function onScanned(text) {
  if (scanClosing) return;
  var code = String(text || '').trim().toUpperCase();
  if (!code) return;

  // Vòng dò bắn liên tục khi mã còn trong khung — chặn lặp trong 1,5 giây.
  var now = Date.now();
  if (code === scanLastCode && now - scanLastAt < 1500) return;
  scanLastCode = code;
  scanLastAt = now;

  var el = $(scanTargetId);
  if (!el) { closeScanner(); return; }

  if (scanMode === 'append') {
    var added = appendCode(el, code);
    flashOk(code, !added);
    if (added) { beepOk(); if (navigator.vibrate) navigator.vibrate(60); }
    else       { beepDup(); if (navigator.vibrate) navigator.vibrate([40, 60, 40]); }
    return;                        // giữ camera mở để quét mã kế tiếp
  }

  el.value = code;
  el.classList.remove('invalid');
  flashOk(code, false);
  beepOk();
  if (navigator.vibrate) navigator.vibrate(80);

  // Nán lại một nhịp để người quét kịp thấy dấu tích và nghe tiếng báo —
  // đóng ngay lập tức thì không kịp biết máy đã nhận mã nào.
  scanClosing = true;
  setTimeout(closeScanner, 700);
}

/** Thêm mã vào ô danh sách ngăn bởi dấu phẩy. Trả về true nếu THÊM MỚI. */
function appendCode(el, code) {
  var list = el.value.split(',')
    .map(function (x) { return x.trim().toUpperCase(); })
    .filter(function (x) { return x; });

  var box = $('scanGot');
  if (list.indexOf(code) >= 0) {
    box.textContent = '⚠️ ' + code + ' — đã có trong danh sách';
    show(box, true);
    return false;
  }

  list.push(code);
  el.value = list.join(', ');
  el.classList.remove('invalid');
  box.textContent = '✅ Đã thêm ' + code + '  ·  tổng ' + list.length + ' mã';
  show(box, true);
  return true;
}

function closeScanner() {
  if (scanLoopId) { clearTimeout(scanLoopId); scanLoopId = 0; }
  if (scanOkTimer) { clearTimeout(scanOkTimer); scanOkTimer = 0; }
  show($('scanOk'), false);
  scanClosing = false;

  // Tắt hẳn đèn camera — phải dừng track, đặt srcObject = null là chưa đủ.
  var v = $('scanVideo');
  if (scanStream) {
    scanStream.getTracks().forEach(function (t) { t.stop(); });
  }
  if (v && v.srcObject) {
    v.srcObject.getTracks().forEach(function (t) { t.stop(); });
    v.srcObject = null;
  }

  scanStream = null;
  scanTrack = null;
  scanCore = null;
  scanZoomCap = null;
  scanZoom = 1;
  scanTargetId = '';
  $('btnTorch').setAttribute('data-on', '0');
  show($('scanner'), false);
}
