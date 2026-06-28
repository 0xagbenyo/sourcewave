/** PDF.js 3.x — renders authenticated PDF bytes inline in React Native WebView (Android). */
const PDF_JS_VERSION = '3.11.174';
const PDF_JS_CDN = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDF_JS_VERSION}`;

/**
 * Build HTML that paints every page to canvas via PDF.js (works on Android WebView).
 * `base64` must be raw PDF bytes (not a data: URI prefix).
 */
export function buildPdfJsViewerHtml(base64: string): string {
  const safeB64 = JSON.stringify(base64);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes"/>
  <script src="${PDF_JS_CDN}/pdf.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; min-height: 100%; background: #525659; }
    #status {
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      padding: 24px 16px;
      text-align: center;
    }
    #canvas-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 8px 8px 24px;
    }
    canvas {
      max-width: 100%;
      height: auto;
      background: #fff;
      box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    }
    #err { color: #ffcdd2; }
  </style>
</head>
<body>
  <div id="status">Loading PDF…</div>
  <div id="canvas-container"></div>
  <script>
    (function () {
      var pdfBase64 = ${safeB64};
      var statusEl = document.getElementById('status');
      var container = document.getElementById('canvas-container');
      function showErr(msg) {
        statusEl.innerHTML = '<span id="err">' + String(msg).replace(/</g, '&lt;') + '</span>';
      }
      try {
        if (!pdfBase64 || !window.pdfjsLib) {
          showErr('PDF viewer failed to load.');
          return;
        }
        pdfjsLib.GlobalWorkerOptions.workerSrc = '${PDF_JS_CDN}/pdf.worker.min.js';
        var raw = atob(pdfBase64);
        var bytes = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        pdfjsLib.getDocument({ data: bytes }).promise.then(function (pdf) {
          statusEl.style.display = 'none';
          var chain = Promise.resolve();
          for (var num = 1; num <= pdf.numPages; num++) {
            (function (pageNum) {
              chain = chain.then(function () {
                return pdf.getPage(pageNum).then(function (page) {
                  var base = page.getViewport({ scale: 1 });
                  var scale = Math.min((window.innerWidth - 16) / base.width, 2.5);
                  var viewport = page.getViewport({ scale: scale });
                  var canvas = document.createElement('canvas');
                  canvas.width = viewport.width;
                  canvas.height = viewport.height;
                  container.appendChild(canvas);
                  return page.render({
                    canvasContext: canvas.getContext('2d'),
                    viewport: viewport
                  }).promise;
                });
              });
            })(num);
          }
          return chain;
        }).catch(function (e) {
          showErr(e && e.message ? e.message : 'Could not render PDF.');
        });
      } catch (e) {
        showErr(e && e.message ? e.message : 'Could not open PDF.');
      }
    })();
  </script>
</body>
</html>`;
}
