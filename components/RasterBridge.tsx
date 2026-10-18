// WebView tersembunyi untuk rasterisasi: me-render halaman PDF (via pdf.js)
// atau SVG tanda tangan menjadi PNG (base64). Murni WebView + canvas,
// tanpa native module — kompatibel Expo Go.
import React, { forwardRef, useImperativeHandle, useRef } from 'react';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export type RasterResult = {
  base64: string; // PNG tanpa prefix data:
  width: number; // px
  height: number; // px
};

export type RasterBridgeHandle = {
  rasterizePdfPage: (
    pdfBase64: string,
    page: number,
    widthPx: number,
  ) => Promise<RasterResult>;
  rasterizeSvg: (
    svg: string,
    width: number,
    height: number,
    scale: number,
  ) => Promise<RasterResult>;
};

type Pending = {
  resolve: (r: RasterResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const RASTER_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"><\/script>
<script>
(function () {
  'use strict';
  var WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var pdf = null, pdfKey = '';
  function post(m) { try { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); } catch (e) {} }
  function b64ToU8(b64) { var bin = atob(b64), len = bin.length, u8 = new Uint8Array(len); for (var i = 0; i < len; i++) u8[i] = bin.charCodeAt(i); return u8; }

  function rasterPdf(m) {
    if (typeof pdfjsLib === 'undefined') {
      post({ type: 'result', id: m.id, ok: false, error: 'Pustaka PDF gagal dimuat dari CDN. Periksa koneksi internet.' });
      return;
    }
    try { pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; } catch (e) {}
    var load = (m.base64 === pdfKey && pdf)
      ? Promise.resolve(pdf)
      : pdfjsLib.getDocument({ data: b64ToU8(m.base64) }).promise.then(function (doc) { pdf = doc; pdfKey = m.base64; return doc; });
    load.then(function (doc) { return doc.getPage(m.page); }).then(function (p) {
      var v0 = p.getViewport({ scale: 1 });
      var vp = p.getViewport({ scale: m.width / v0.width });
      var c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      return p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise.then(function () { return c; });
    }).then(function (c) {
      post({ type: 'result', id: m.id, ok: true, dataUrl: c.toDataURL('image/png'), width: c.width, height: c.height });
    }).catch(function (err) {
      post({ type: 'result', id: m.id, ok: false, error: 'Gagal me-render halaman: ' + (err && err.message ? err.message : err) });
    });
  }

  function rasterSvg(m) {
    try {
      var img = new Image();
      img.onload = function () {
        try {
          var c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(m.width * m.scale));
          c.height = Math.max(1, Math.round(m.height * m.scale));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          post({ type: 'result', id: m.id, ok: true, dataUrl: c.toDataURL('image/png'), width: c.width, height: c.height });
        } catch (err) { post({ type: 'result', id: m.id, ok: false, error: 'Gagal me-render tanda tangan.' }); }
      };
      img.onerror = function () { post({ type: 'result', id: m.id, ok: false, error: 'Gagal me-render tanda tangan.' }); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m.svg);
    } catch (err) { post({ type: 'result', id: m.id, ok: false, error: 'Gagal me-render tanda tangan.' }); }
  }

  function onMessage(e) {
    var m; try { m = JSON.parse(e.data); } catch (err) { return; }
    if (!m || !m.type) return;
    if (m.type === 'pdf') rasterPdf(m);
    else if (m.type === 'svg') rasterSvg(m);
  }
  document.addEventListener('message', onMessage);
  window.addEventListener('message', onMessage);
  post({ type: 'ready' });
})();
<\/script></body></html>`;

const RasterBridge = forwardRef<RasterBridgeHandle, object>(
  function RasterBridge(_props, ref) {
    const webRef = useRef<WebView>(null);
    const pending = useRef(new Map<string, Pending>());
    const ready = useRef(false);
    const queue = useRef<Array<() => void>>([]);

    const send = (msg: Record<string, unknown>): Promise<RasterResult> =>
      new Promise((resolve, reject) => {
        const id = Math.random().toString(36).slice(2);
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(new Error('Render kehabisan waktu. Coba lagi.'));
        }, 45000);
        pending.current.set(id, { resolve, reject, timer });
        const payload = JSON.stringify({ ...msg, id });
        const run = () => webRef.current?.postMessage(payload);
        if (ready.current) run();
        else queue.current.push(run);
      });

    useImperativeHandle(
      ref,
      () => ({
        rasterizePdfPage: (pdfBase64, page, widthPx) =>
          send({ type: 'pdf', base64: pdfBase64, page, width: widthPx }),
        rasterizeSvg: (svg, width, height, scale) =>
          send({ type: 'svg', svg, width, height, scale }),
      }),
      [],
    );

    const onMessage = (e: WebViewMessageEvent) => {
      let m: {
        type?: string;
        id?: string;
        ok?: boolean;
        dataUrl?: string;
        width?: number;
        height?: number;
        error?: string;
      };
      try {
        m = JSON.parse(e.nativeEvent.data);
      } catch {
        return;
      }
      if (m.type === 'ready') {
        ready.current = true;
        queue.current.splice(0).forEach((fn) => fn());
        return;
      }
      if (m.type === 'result' && m.id) {
        const p = pending.current.get(m.id);
        if (!p) return;
        pending.current.delete(m.id);
        clearTimeout(p.timer);
        if (m.ok) {
          const b64 = (m.dataUrl ?? '').split(',')[1] ?? '';
          p.resolve({
            base64: b64,
            width: m.width ?? 0,
            height: m.height ?? 0,
          });
        } else {
          p.reject(new Error(m.error || 'Gagal me-render.'));
        }
      }
    };

    return (
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: RASTER_HTML }}
        onMessage={onMessage}
        style={{ width: 0, height: 0 }}
      />
    );
  },
);

export default RasterBridge;
