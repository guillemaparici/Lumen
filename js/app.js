/* Lumen — nucli de l'app: estat, historial, vista (zoom/pan), ajustos, obrir fitxers i exportació. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const t = (k) => I18N.t(k);
  const L = (window.L = {});

  const ADJ = [
    { k: 'brightness', min: -100, max: 100 }, { k: 'contrast', min: -100, max: 100 },
    { k: 'saturation', min: -100, max: 100 }, { k: 'ambience', min: -100, max: 100 },
    { k: 'highlights', min: -100, max: 100 }, { k: 'shadows', min: -100, max: 100 },
    { k: 'warmth', min: -100, max: 100 }, { k: 'tint', min: -100, max: 100 },
    { k: 'sharpen', min: 0, max: 100 }, { k: 'vignette', min: -100, max: 100 }
  ];
  const zero = () => Object.fromEntries(ADJ.map((a) => [a.k, 0]));

  const S = (L.S = {
    name: 'foto', srcW: 0, srcH: 0, has: false,
    adj: zero(), geo: null, history: [], future: [],
    mode: 'adjust', view: { zoom: 1, cx: 0, cy: 0 },
    comparing: false, editing: false, sel: 'brightness',
    draft: null, ratioId: 'free'
  });
  L.t = t;

  const stage = $('stage'), view = $('view'), ctx = view.getContext('2d');
  let engine = null;
  try { engine = L.engine = new LumenEngine(); } catch (e) { setTimeout(() => toast(t('toastNoGL')), 300); }

  /* ---------- Utilitats ---------- */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }
  L.toast = toast;
  let badgeTimer = 0;
  function flash(msg) {
    const b = $('badge'); b.textContent = msg; b.classList.add('show');
    clearTimeout(badgeTimer); badgeTimer = setTimeout(() => b.classList.remove('show'), 900);
  }
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---------- Geometria de la vista ---------- */
  L.frame = () => LumenEngine.frameSize(S.srcW, S.srcH, S.geo.rot);
  function contentRect() {
    if (S.mode === 'crop') { const f = L.frame(); return { x: 0, y: 0, w: f.w, h: f.h }; }
    return S.geo.crop;
  }
  L.contentRect = contentRect;
  const PAD = 14;
  function fit(C) { return Math.min((stage.clientWidth - 2 * PAD) / C.w, (stage.clientHeight - 2 * PAD) / C.h); }
  L.scale = () => fit(contentRect()) * S.view.zoom;           // px CSS per px de frame
  L.toScreen = (x, y) => {                                      // coordenades de frame -> estage
    const C = contentRect(), sc = L.scale();
    return { x: stage.clientWidth / 2 + (x - C.x - S.view.cx) * sc, y: stage.clientHeight / 2 + (y - C.y - S.view.cy) * sc };
  };
  function screenToContent(mx, my) {
    const sc = L.scale();
    return { x: S.view.cx + (mx - stage.clientWidth / 2) / sc, y: S.view.cy + (my - stage.clientHeight / 2) / sc };
  }
  function clampView() {
    const C = contentRect();
    if (S.view.zoom <= 1.001) { S.view.zoom = 1; S.view.cx = C.w / 2; S.view.cy = C.h / 2; }
    else { S.view.cx = clamp(S.view.cx, 0, C.w); S.view.cy = clamp(S.view.cy, 0, C.h); }
  }
  L.resetView = () => { S.view.zoom = 1; clampView(); };

  /* ---------- Dibuix ---------- */
  let raf = 0;
  L.draw = () => { if (!raf) raf = requestAnimationFrame(draw); };
  function draw() {
    raf = 0;
    if (!S.has || !engine) return;
    const sw = stage.clientWidth, sh = stage.clientHeight;
    if (!sw || !sh) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(sw * dpr), H = Math.round(sh * dpr);
    if (view.width !== W || view.height !== H) { view.width = W; view.height = H; }
    view.style.width = sw + 'px'; view.style.height = sh + 'px';
    clampView();
    const C = contentRect(), k = L.scale() * dpr;
    const sub = { x: C.x + S.view.cx - W / 2 / k, y: C.y + S.view.cy - H / 2 / k, w: W / k, h: H / k };
    const geo = { rot: S.geo.rot, flipH: S.geo.flipH, flipV: S.geo.flipV, angle: S.geo.angle, crop: sub };
    engine.render(W, H, geo, S.comparing ? null : S.adj, C);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(engine.canvas, 0, 0);
    if (L.crop) L.crop.sync();
  }

  /* ---------- Historial ---------- */
  const snap = () => JSON.stringify({ adj: S.adj, geo: S.geo });
  L.push = () => { S.history.push(snap()); if (S.history.length > 100) S.history.shift(); S.future.length = 0; updateBtns(); };
  function restore(str) {
    const o = JSON.parse(str);
    S.adj = Object.assign(zero(), o.adj); S.geo = o.geo;
    S.draft = S.mode === 'crop' ? Object.assign({}, S.geo.crop) : null;
    L.resetView(); syncUI(); L.draw(); updateBtns();
  }
  function undo() { if (!S.history.length) return; S.future.push(snap()); restore(S.history.pop()); }
  function redo() { if (!S.future.length) return; S.history.push(snap()); restore(S.future.pop()); }
  function updateBtns() {
    $('btnUndo').disabled = !S.history.length; $('btnRedo').disabled = !S.future.length;
  }

  /* ---------- Lliscadors: farciment des de zero (o des de l'esquerra) fins al valor ---------- */
  function paint(el) {
    const min = +el.min, max = +el.max, v = +el.value;
    const pct = (x) => clamp((x - min) / (max - min) * 100, 0, 100);
    const a = pct(v), z = pct(0);
    el.style.setProperty('--s', Math.min(a, z) + '%');
    el.style.setProperty('--e', Math.max(a, z) + '%');
  }
  L.paint = paint;

  /* ---------- Ajustos ---------- */
  const chipsEl = $('adjChips'), slider = $('adjSlider');
  ADJ.forEach((a) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.k = a.k; b.textContent = t('adj_' + a.k);
    b.addEventListener('click', () => select(a.k));
    chipsEl.appendChild(b);
  });
  function updateVal() {
    const v = Math.round(S.adj[S.sel] * 100);
    $('adjVal').textContent = (v > 0 && ADJ.find((a) => a.k === S.sel).min < 0 ? '+' : '') + v;
  }
  function markChips() {
    chipsEl.querySelectorAll('.chip').forEach((c) => {
      c.classList.toggle('on', c.dataset.k === S.sel);
      c.classList.toggle('mod', Math.abs(S.adj[c.dataset.k]) > 1e-6);
    });
  }
  function select(k) {
    S.sel = k;
    const a = ADJ.find((x) => x.k === k);
    slider.min = a.min; slider.max = a.max; slider.step = 1;
    slider.value = Math.round(S.adj[k] * 100);
    paint(slider);
    $('adjName').textContent = t('adj_' + k);
    updateVal(); markChips();
  }
  slider.addEventListener('input', () => {
    if (!S.has) return;
    if (!S.editing) { L.push(); S.editing = true; }
    S.adj[S.sel] = slider.value / 100;
    paint(slider); updateVal(); markChips(); L.draw();
  });
  slider.addEventListener('change', () => { S.editing = false; });
  $('btnResetOne').addEventListener('click', () => {
    if (!S.has || S.adj[S.sel] === 0) return;
    L.push(); S.adj[S.sel] = 0; select(S.sel); L.draw();
  });
  $('btnResetAll').addEventListener('click', () => {
    if (!S.has || ADJ.every((a) => S.adj[a.k] === 0)) return;
    L.push(); S.adj = zero(); select(S.sel); L.draw(); toast(t('toastReset'));
  });
  function syncUI() { select(S.sel); if (L.crop) L.crop.syncUI(); }
  L.syncUI = syncUI;

  /* ---------- Pestanyes ---------- */
  function setMode(m) {
    if (m === S.mode) return;
    if (m === 'crop' && !S.has) return;
    if (S.mode === 'crop' && L.crop) L.crop.leave(true);
    S.mode = m;
    $('tabAdj').classList.toggle('on', m === 'adjust'); $('tabCrop').classList.toggle('on', m === 'crop');
    $('panelAdj').hidden = m !== 'adjust'; $('panelCrop').hidden = m !== 'crop';
    if (m === 'crop' && L.crop) L.crop.enter();
    L.resetView(); L.draw();
  }
  L.setMode = setMode;
  $('tabAdj').addEventListener('click', () => setMode('adjust'));
  $('tabCrop').addEventListener('click', () => setMode('crop'));

  /* ---------- Gestos de la vista: zoom i desplaçament ---------- */
  const ptrs = new Map();
  let gesture = null, lastTap = { t: 0, x: 0, y: 0 };
  const rectOf = () => stage.getBoundingClientRect();
  function zoomAt(mx, my, newZoom) {
    const anchor = screenToContent(mx, my);
    S.view.zoom = clamp(newZoom, 1, 10);
    const sc = L.scale();
    S.view.cx = anchor.x - (mx - stage.clientWidth / 2) / sc;
    S.view.cy = anchor.y - (my - stage.clientHeight / 2) / sc;
    clampView(); L.draw(); flash('×' + S.view.zoom.toFixed(1));
  }
  stage.addEventListener('pointerdown', (e) => {
    if (!S.has || S.mode !== 'adjust' || e.target.closest('button')) return;
    stage.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { lx: e.clientX, ly: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), moved: false });
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], r = rectOf();
      gesture = { type: 'pinch', d0: Math.hypot(a.lx - b.lx, a.ly - b.ly) || 1, z0: S.view.zoom,
        anchor: screenToContent((a.lx + b.lx) / 2 - r.left, (a.ly + b.ly) / 2 - r.top) };
    } else gesture = { type: 'pan' };
  });
  stage.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.lx, dy = e.clientY - p.ly;
    p.lx = e.clientX; p.ly = e.clientY;
    if (Math.hypot(e.clientX - p.x0, e.clientY - p.y0) > 8) p.moved = true;
    if (gesture && gesture.type === 'pinch' && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], r = rectOf();
      const d = Math.hypot(a.lx - b.lx, a.ly - b.ly), mx = (a.lx + b.lx) / 2 - r.left, my = (a.ly + b.ly) / 2 - r.top;
      S.view.zoom = clamp(gesture.z0 * d / gesture.d0, 1, 10);
      const sc = L.scale();
      S.view.cx = gesture.anchor.x - (mx - stage.clientWidth / 2) / sc;
      S.view.cy = gesture.anchor.y - (my - stage.clientHeight / 2) / sc;
      clampView(); L.draw();
    } else if (ptrs.size === 1 && S.view.zoom > 1.001) {
      const sc = L.scale();
      S.view.cx -= dx / sc; S.view.cy -= dy / sc; clampView(); L.draw();
    }
  });
  function endPtr(e) {
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.delete(e.pointerId);
    const now = performance.now();
    if (e.type === 'pointerup' && !p.moved && now - p.t0 < 300 && ptrs.size === 0 && gesture && gesture.type === 'pan') {
      if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
        const r = rectOf(); zoomAt(e.clientX - r.left, e.clientY - r.top, S.view.zoom > 1.05 ? 1 : 2.5);
        lastTap.t = 0;
      } else lastTap = { t: now, x: e.clientX, y: e.clientY };
    }
    if (ptrs.size === 1) gesture = { type: 'pan' };
    if (ptrs.size === 0) gesture = null;
  }
  stage.addEventListener('pointerup', endPtr);
  stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('dblclick', (e) => {
    if (!S.has || S.mode !== 'adjust' || e.pointerType === 'touch') return;
    const r = rectOf(); zoomAt(e.clientX - r.left, e.clientY - r.top, S.view.zoom > 1.05 ? 1 : 2.5);
  });
  stage.addEventListener('wheel', (e) => {
    if (!S.has || S.mode !== 'adjust') return;
    e.preventDefault();
    const r = rectOf();
    zoomAt(e.clientX - r.left, e.clientY - r.top, S.view.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  /* ---------- Comparar (mantenir premut) ---------- */
  function setCompare(on) { if (!S.has || S.comparing === on) return; S.comparing = on; $('btnCompare').classList.toggle('on', on); L.draw(); }
  const bc = $('btnCompare');
  bc.addEventListener('pointerdown', (e) => { e.preventDefault(); bc.setPointerCapture(e.pointerId); setCompare(true); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => bc.addEventListener(ev, () => setCompare(false)));
  bc.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------- Obrir fotos ---------- */
  async function decodeViaImg(file) {
    const url = URL.createObjectURL(file), img = new Image();
    img.src = url;
    try { await img.decode(); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
    return img;
  }
  async function loadFile(file) {
    if (!engine) { toast(t('toastNoGL')); return; }
    if (!file || !(file.type || '').startsWith('image/')) { toast(t('toastErrOpen')); return; }
    $('loading').hidden = false;
    try {
      let bmp;
      try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'none' }); }
      catch (e) { bmp = await decodeViaImg(file); }
      const info = engine.setSource(bmp);
      if (bmp.close) bmp.close();
      if (S.mode === 'crop' && L.crop) L.crop.leave(false);
      S.mode = 'adjust';
      $('tabAdj').classList.add('on'); $('tabCrop').classList.remove('on');
      $('panelAdj').hidden = false; $('panelCrop').hidden = true;
      S.srcW = info.w; S.srcH = info.h; S.has = true;
      S.name = (file.name || 'foto').replace(/\.[^.]+$/, '') || 'foto';
      S.adj = zero(); S.history = []; S.future = []; S.draft = null; S.ratioId = 'free';
      S.geo = { rot: 0, flipH: false, flipV: false, angle: 0, crop: { x: 0, y: 0, w: info.w, h: info.h } };
      $('empty').hidden = true;
      ['btnExport', 'btnCompare'].forEach((id) => ($(id).disabled = false));
      updateBtns(); syncUI(); L.resetView(); L.draw();
      if (info.downscaled) toast(t('toastBig'));
    } catch (e) {
      console.error(e); toast(t('toastErrOpen'));
    } finally { $('loading').hidden = true; }
  }
  L.loadFile = loadFile;
  const fileIn = $('fileIn');
  const openDlg = () => fileIn.click();
  $('btnOpen').addEventListener('click', openDlg);
  $('btnOpen2').addEventListener('click', openDlg);
  fileIn.addEventListener('change', () => { if (fileIn.files[0]) loadFile(fileIn.files[0]); fileIn.value = ''; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drag'));
  stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drag'); const f = e.dataTransfer.files[0]; if (f) loadFile(f); });
  document.addEventListener('paste', (e) => { const f = e.clipboardData && e.clipboardData.files[0]; if (f && f.type.startsWith('image/')) loadFile(f); });

  /* ---------- Exportació ---------- */
  const sheet = $('sheet');
  const EXP = { fmt: 'jpeg', q: 92, size: 'orig' };
  const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' };
  function outSize() {
    const c = S.geo.crop, cw = Math.round(c.w), ch = Math.round(c.h), long = Math.max(cw, ch);
    let k = EXP.size === 'orig' ? 1 : Math.min(1, EXP.size / long);
    let limited = false;
    if (long * k > engine.maxOut) { k = engine.maxOut / long; limited = true; }
    return { w: Math.max(1, Math.round(cw * k)), h: Math.max(1, Math.round(ch * k)), limited };
  }
  function fillSizes() {
    const c = S.geo.crop, long = Math.round(Math.max(c.w, c.h)), sel = $('sizeSel');
    sel.innerHTML = '';
    const opts = [['orig', t('fullSize') + ' (' + Math.round(c.w) + '×' + Math.round(c.h) + ')']];
    [4096, 2048, 1080].forEach((n) => { if (n < long) opts.push([String(n), n + ' px · ' + t('longSide')]); });
    opts.forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); });
    if (!opts.some(([v]) => v === String(EXP.size))) EXP.size = 'orig';
    sel.value = String(EXP.size);
  }
  function updExportInfo() {
    const o = outSize();
    $('exportInfo').textContent = o.w + '×' + o.h + ' px · ' + (o.w * o.h / 1e6).toFixed(1) + ' ' + t('mpx') +
      (EXP.fmt === 'png' ? ' · ' + t('hintPng') : '') + (o.limited ? ' · ' + t('hintLimit') : '');
    $('qField').hidden = EXP.fmt === 'png';
  }
  function openExport() {
    if (!S.has) return;
    if (S.mode === 'crop') setMode('adjust');
    fillSizes(); updExportInfo(); sheet.hidden = false;
  }
  const closeExport = () => { sheet.hidden = true; };
  $('btnExport').addEventListener('click', openExport);
  $('btnExpCancel').addEventListener('click', closeExport);
  sheet.addEventListener('pointerdown', (e) => { if (e.target === sheet) closeExport(); });
  $('fmtSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    EXP.fmt = b.dataset.f;
    $('fmtSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    updExportInfo();
  });
  $('qSlider').addEventListener('input', (e) => { EXP.q = +e.target.value; $('qVal').textContent = EXP.q; paint(e.target); });
  $('sizeSel').addEventListener('change', (e) => { EXP.size = e.target.value === 'orig' ? 'orig' : +e.target.value; updExportInfo(); });

  async function shareOrDownload(blob, filename) {
    const file = new File([blob], filename, { type: blob.type });
    if (matchMedia('(pointer:coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return true; }
      catch (e) { if (e.name === 'AbortError') return false; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
    return true;
  }
  $('btnExpGo').addEventListener('click', async () => {
    const btn = $('btnExpGo'); btn.disabled = true;
    try {
      const o = outSize(), g = S.geo;
      let fmt = EXP.fmt;
      engine.render(o.w, o.h, { rot: g.rot, flipH: g.flipH, flipV: g.flipV, angle: g.angle, crop: g.crop }, S.adj, g.crop);
      let blob = await engine.toBlob(MIME[fmt], EXP.q / 100);
      if (!blob || (blob.type && blob.type !== MIME[fmt])) {
        if (fmt !== 'jpeg') { fmt = 'jpeg'; blob = await engine.toBlob(MIME.jpeg, EXP.q / 100); }
      }
      if (!blob) throw new Error('blob');
      closeExport();
      const ok = await shareOrDownload(blob, S.name + '-lumen.' + EXT[fmt]);
      if (ok) toast(t('toastSaved'));
    } catch (e) { console.error(e); toast(t('toastErrExport')); }
    finally { btn.disabled = false; L.draw(); }
  });

  /* ---------- Dreceres de teclat ---------- */
  window.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (!sheet.hidden) { if (e.key === 'Escape') closeExport(); return; }
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && k === 'y') { e.preventDefault(); redo(); }
    else if (!mod && !e.repeat && k === 'o') openDlg();
    else if (!mod && !e.repeat && k === 'c') setCompare(true);
  });
  window.addEventListener('keyup', (e) => { if (e.key.toLowerCase() === 'c') setCompare(false); });
  $('btnUndo').addEventListener('click', undo);
  $('btnRedo').addEventListener('click', redo);

  /* ---------- Inici ---------- */
  stage.dataset.drop = t('dropHere');
  I18N.apply();
  select('brightness');
  document.querySelectorAll('input[type=range]').forEach(paint);
  new ResizeObserver(() => L.draw()).observe(stage);
  window.addEventListener('orientationchange', () => setTimeout(L.draw, 200));
})();
