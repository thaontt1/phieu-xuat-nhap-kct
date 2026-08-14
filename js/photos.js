'use strict';

/** Ảnh đã nén, sẵn sàng gửi: {name, mimeType, data(base64), url(dataURL để xem trước)} */
var photos = [];

function onPickPhotos(ev) {
  var files = Array.prototype.slice.call(ev.target.files || []);
  ev.target.value = '';
  // CONFIG.MAX_PHOTOS = 0 ⇒ không giới hạn, nhận hết ảnh người dùng chọn.
  if (!CONFIG.MAX_PHOTOS) {
    files.forEach(compressAndAdd);
    return;
  }

  var room = CONFIG.MAX_PHOTOS - photos.length;
  if (room <= 0) {
    alert('Tối đa ' + CONFIG.MAX_PHOTOS + ' ảnh.');
    return;
  }
  files.slice(0, room).forEach(compressAndAdd);
}

/**
 * Nén phía máy trước khi gửi — ảnh gốc điện thoại 5-8MB sẽ làm request
 * quá nặng và dễ timeout.
 */
function compressAndAdd(file) {
  if (!/^image\//.test(file.type)) return;
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      var scale = Math.min(1, CONFIG.MAX_EDGE / Math.max(img.width, img.height));
      var cv = document.createElement('canvas');
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      var url = cv.toDataURL('image/jpeg', CONFIG.JPEG_Q);
      photos.push({
        name: file.name,
        mimeType: 'image/jpeg',
        data: url.split(',')[1],
        url: url
      });
      renderThumbs();
    };
    img.onerror = function () { alert('Không đọc được ảnh: ' + file.name); };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function renderThumbs() {
  var host = $('thumbs');
  host.innerHTML = '';
  photos.forEach(function (p, i) {
    var d = document.createElement('div');
    d.className = 'thumb';
    d.innerHTML = '<img src="' + p.url + '" alt=""><button type="button" aria-label="Xoá ảnh">×</button>';
    d.querySelector('button').addEventListener('click', function () {
      photos.splice(i, 1);
      renderThumbs();
    });
    host.appendChild(d);
  });
}
