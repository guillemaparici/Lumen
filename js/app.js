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
  L.zero = zero;
  L.hooks = { items() {}, thumb() {}, dirty() {} };   // batch.js se'n serveix per pintar la tira i el panell Lot

  const stage = $('stage'), view = $('view'), ctx = view.getContext('2d');
  const amb = $('ambient'), actx = amb.getContext('2d');
  const bar = $('topbar'), dock = $('dock');
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
  /* Marges: la foto ocupa tot l'escenari però es col·loca entre la barra i el panell (que suren com a vidre) */
  const ins = { t: 0, l: 0, r: 0, b: 0 };
  function measure() {
    const wide = window.matchMedia('(min-width:900px)').matches;
    ins.t = bar.offsetTop + bar.offsetHeight + 12;
    ins.l = ins.r = ins.b = wide ? 20 : 10;
    if (S.has) {
      const cs = getComputedStyle(dock);
      if (wide) ins.r = dock.offsetWidth + (parseFloat(cs.right) || 20) + 20;
      else ins.b = dock.offsetHeight + (parseFloat(cs.bottom) || 10) + 12;
    }
  }
  const ctr = () => ({ x: ins.l + (stage.clientWidth - ins.l - ins.r) / 2, y: ins.t + (stage.clientHeight - ins.t - ins.b) / 2 });
  const PAD = 6;
  function fit(C) { return Math.min((stage.clientWidth - ins.l - ins.r - 2 * PAD) / C.w, (stage.clientHeight - ins.t - ins.b - 2 * PAD) / C.h); }
  L.scale = () => fit(contentRect()) * S.view.zoom;           // px CSS per px de frame
  L.toScreen = (x, y) => {                                      // coordenades de frame -> escenari
    const C = contentRect(), sc = L.scale(), c = ctr();
    return { x: c.x + (x - C.x - S.view.cx) * sc, y: c.y + (y - C.y - S.view.cy) * sc };
  };
  function screenToContent(mx, my) {
    const sc = L.scale(), c = ctr();
    return { x: S.view.cx + (mx - c.x) / sc, y: S.view.cy + (my - c.y) / sc };
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
    measure();
    clampView();
    const C = contentRect(), k = L.scale() * dpr, c = ctr();
    const sub = { x: C.x + S.view.cx - c.x * dpr / k, y: C.y + S.view.cy - c.y * dpr / k, w: W / k, h: H / k };
    const geo = { rot: S.geo.rot, flipH: S.geo.flipH, flipV: S.geo.flipV, angle: S.geo.angle, crop: sub };
    engine.render(W, H, geo, S.comparing ? null : S.adj, C);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(engine.canvas, 0, 0);
    scheduleAmbient();
    if (L.crop) L.crop.sync();
    L.hooks.dirty();
  }

  /* ---------- Halo ambiental: miniatura de la foto, ampliada i difuminada per CSS ---------- */
  let ambTimer = 0;
  function scheduleAmbient() { if (!ambTimer) ambTimer = setTimeout(() => { ambTimer = 0; paintAmbient(); }, 220); }
  function paintAmbient() {
    if (!S.has || !view.width) return;
    const w = 28, h = Math.max(2, Math.round(w * view.height / view.width));
    if (amb.width !== w || amb.height !== h) { amb.width = w; amb.height = h; }
    actx.clearRect(0, 0, w, h);
    actx.drawImage(view, 0, 0, w, h);
  }

  /* ---------- Historial ---------- */
  const snap = () => JSON.stringify({ adj: S.adj, geo: S.geo });
  L.push = () => { S.history.push(snap()); if (S.history.length > 100) S.history.shift(); S.future.length = 0; updateBtns(); };
  function restore(str) {
    const o = JSON.parse(str);
    S.adj = Object.assign(zero(), o.adj); S.geo = o.geo || defGeo(S.srcW, S.srcH);
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

  /* ---------- Pestanyes (Ajustos · Retall · Lot) ---------- */
  const TAB = { adjust: 'Adj', crop: 'Crop', lot: 'Lot' };
  function applyTabs(m) {
    Object.keys(TAB).forEach((k) => {
      $('tab' + TAB[k]).classList.toggle('on', k === m);
      $('tab' + TAB[k]).setAttribute('aria-selected', k === m);
      $('panel' + TAB[k]).hidden = k !== m;
    });
    $('tools').dataset.active = m;
  }
  function setMode(m) {
    if (m === S.mode) return;
    if (m === 'crop' && !S.has) return;
    if (S.mode === 'crop' && L.crop) L.crop.leave(true);
    S.mode = m;
    applyTabs(m);
    if (m === 'crop' && L.crop) L.crop.enter();
    L.resetView(); L.draw();
  }
  L.setMode = setMode;
  $('tabAdj').addEventListener('click', () => setMode('adjust'));
  $('tabCrop').addEventListener('click', () => setMode('crop'));
  $('tabLot').addEventListener('click', () => setMode('lot'));

  /* ---------- Gestos de la vista: zoom i desplaçament ---------- */
  const ptrs = new Map();
  let gesture = null, lastTap = { t: 0, x: 0, y: 0 };
  const rectOf = () => stage.getBoundingClientRect();
  function zoomAt(mx, my, newZoom) {
    const anchor = screenToContent(mx, my);
    S.view.zoom = clamp(newZoom, 1, 10);
    const sc = L.scale();
    const c = ctr();
    S.view.cx = anchor.x - (mx - c.x) / sc;
    S.view.cy = anchor.y - (my - c.y) / sc;
    clampView(); L.draw(); flash('×' + S.view.zoom.toFixed(1));
  }
  stage.addEventListener('pointerdown', (e) => {
    if (!S.has || S.mode === 'crop' || e.target.closest('button')) return;
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
      const c = ctr();
      S.view.cx = gesture.anchor.x - (mx - c.x) / sc;
      S.view.cy = gesture.anchor.y - (my - c.y) / sc;
      clampView(); L.draw();
    } else if (ptrs.size === 1 && S.view.zoom > 1.001) {
      const sc = L.scale();
      S.view.cx -= dx / sc; S.view.cy -= dy / sc; clampView(); L.draw();
    } else if (ptrs.size === 1 && items.length > 1) {
      /* Llisca cap als costats per canviar de foto (només amb zoom 1) */
      const sx = e.clientX - p.x0, sy = e.clientY - p.y0;
      if (!p.sw && Math.abs(sx) > 12 && Math.abs(sx) > Math.abs(sy) * 1.3) p.sw = true;
      if (p.sw) {
        const edge = (sx > 0 && L.cur === 0) || (sx < 0 && L.cur === items.length - 1);
        const off = sx * (edge ? 0.18 : 0.7);
        view.style.transition = 'none';
        view.style.transform = 'translateX(' + off + 'px)';
        view.style.opacity = String(1 - Math.min(0.5, Math.abs(off) / 500));
      }
    }
  });
  function resetSwipe() {
    view.style.transition = 'transform .35s cubic-bezier(.22,1,.36,1),opacity .35s';
    view.style.transform = ''; view.style.opacity = '';
  }
  function endPtr(e) {
    const p = ptrs.get(e.pointerId); if (!p) return;
    ptrs.delete(e.pointerId);
    if (p.sw) {
      const sx = e.clientX - p.x0, dt = performance.now() - p.t0;
      const fast = Math.abs(sx) > 40 && Math.abs(sx) / dt > 0.5;
      if (e.type === 'pointerup' && (Math.abs(sx) > Math.min(110, stage.clientWidth * 0.22) || fast) && L.go(sx < 0 ? 1 : -1)) {
        /* la foto nova ja neteja la transformació quan estigui llesta (activate) */
      } else resetSwipe();
      if (ptrs.size === 0) gesture = null;
      return;
    }
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
    if (!S.has || S.mode === 'crop' || e.pointerType === 'touch') return;
    const r = rectOf(); zoomAt(e.clientX - r.left, e.clientY - r.top, S.view.zoom > 1.05 ? 1 : 2.5);
  });
  stage.addEventListener('wheel', (e) => {
    if (!S.has || S.mode === 'crop') return;
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

  /* ---------- Lot de fotos ---------- */
  /* Cada foto del lot guarda el seu propi estat (ajustos, retall, historial). El motor només té una textura:
     en canviar de foto es torna a descodificar el fitxer original i es restaura l'estat de la foto. */
  const items = (L.items = []);
  L.cur = -1;
  let nid = 1, actToken = 0;
  const defGeo = (w, h) => ({ rot: 0, flipH: false, flipV: false, angle: 0, crop: { x: 0, y: 0, w, h } });
  L.defGeo = defGeo;

  async function decodeViaImg(file) {
    const url = URL.createObjectURL(file), img = new Image();
    img.src = url;
    try { await img.decode(); } finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
    return img;
  }
  async function decodeFile(file) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image', premultiplyAlpha: 'none' }); }
    catch (e) { return decodeViaImg(file); }
  }
  function saveCur() {
    const it = items[L.cur]; if (!it || !S.has) return;
    it.adj = S.adj; it.geo = S.geo; it.history = S.history; it.future = S.future; it.ratioId = S.ratioId; it.w = S.srcW; it.h = S.srcH;
  }
  L.saveCur = saveCur;

  /* Activa la foto i-èssima. Retorna true / false (cancel·lada per una altra) / 'err' (no s'ha pogut obrir) */
  async function activate(i, dir) {
    if (!engine) { toast(t('toastNoGL')); return 'err'; }
    if (i < 0 || i >= items.length) return false;
    if (i === L.cur && S.has) return true;
    const token = ++actToken, it = items[i];
    const slow = setTimeout(() => { if (token === actToken) $('loading').hidden = false; }, 250);
    try {
      const bmp = await decodeFile(it.file);
      if (token !== actToken) { if (bmp.close) bmp.close(); return false; }
      if (S.mode === 'crop' && L.crop) { L.crop.leave(false); S.mode = 'adjust'; applyTabs('adjust'); }
      saveCur();
      const info = engine.setSource(bmp);
      if (bmp.close) bmp.close();
      L.cur = items.indexOf(it);
      S.srcW = info.w; S.srcH = info.h; S.has = true; S.name = it.name; S.editing = false; S.comparing = false;
      S.adj = it.adj || zero(); S.history = it.history || []; S.future = it.future || [];
      S.ratioId = it.ratioId || 'free'; S.draft = null;
      S.geo = it.geo || defGeo(info.w, info.h);
      it.w = info.w; it.h = info.h;
      $('empty').hidden = true;
      $('app').classList.remove('noimg');
      ['btnExport', 'btnCompare'].forEach((id) => ($(id).disabled = false));
      updateBtns(); syncUI(); L.resetView(); L.draw();
      L.hooks.items();
      if (info.downscaled) toast(t('toastBig'));
      /* entrada suau de la foto nova, des del costat cap on s'ha lliscat */
      view.style.transition = 'none'; view.style.transform = ''; view.style.opacity = '';
      if (dir && view.animate) view.animate(
        [{ transform: 'translateX(' + (dir * 56) + 'px)', opacity: 0 }, { transform: 'none', opacity: 1 }],
        { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)' });
      return true;
    } catch (e) {
      console.error(e);
      if (token !== actToken) return false;
      view.style.transition = ''; view.style.transform = ''; view.style.opacity = '';
      toast(t('toastErrOpen'));
      const idx = items.indexOf(it);
      if (idx >= 0) { items.splice(idx, 1); if (idx < L.cur) L.cur--; L.hooks.items(); }
      return 'err';
    } finally { clearTimeout(slow); if (token === actToken) $('loading').hidden = true; }
  }
  L.activate = (i) => activate(i, i > L.cur ? 1 : -1);
  L.go = (d) => {
    const n = L.cur + d;
    if (n < 0 || n >= items.length) return false;
    activate(n, d); return true;
  };

  /* Miniatures: es generen una a una en segon pla, sense bloquejar l'edició */
  let thumbBusy = false;
  async function makeThumb(file) {
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: 220, resizeQuality: 'low' }); }
    catch (e) { try { bmp = await decodeViaImg(file); } catch (e2) { return ''; } }
    const bw = bmp.width || bmp.naturalWidth, bh = bmp.height || bmp.naturalHeight, S2 = 112;
    const c = document.createElement('canvas'); c.width = c.height = S2;
    const k = Math.max(S2 / bw, S2 / bh), dw = bw * k, dh = bh * k;
    c.getContext('2d').drawImage(bmp, (S2 - dw) / 2, (S2 - dh) / 2, dw, dh);
    if (bmp.close) bmp.close();
    return c.toDataURL('image/jpeg', 0.72);
  }
  async function runThumbs() {
    if (thumbBusy) return; thumbBusy = true;
    try {
      let it;
      while ((it = items.find((x) => x.thumb === '')) ) {
        it.thumb = 'pending';
        const url = await makeThumb(it.file);
        it.thumb = url || 'none';
        L.hooks.thumb(it);
      }
    } finally { thumbBusy = false; }
  }

  async function addFiles(files) {
    if (!engine) { toast(t('toastNoGL')); return; }
    const list = [...files].filter((f) => f && (f.type || '').startsWith('image/'));
    if (!list.length) { toast(t('toastErrOpen')); return; }
    const first = items.length;
    list.forEach((f) => items.push({
      id: nid++, file: f, name: (f.name || 'foto').replace(/\.[^.]+$/, '') || 'foto',
      adj: null, geo: null, history: [], future: [], ratioId: 'free', thumb: '', w: 0, h: 0
    }));
    L.hooks.items();
    let res = 'err';
    while (res === 'err' && first < items.length) res = await activate(first);
    runThumbs();
    if (list.length > 1) toast(t('toastAdded').replace('{n}', list.length));
  }
  L.addFiles = addFiles;
  L.loadFile = (f) => addFiles([f]);

  function showEmpty() {
    S.has = false; S.mode = 'adjust'; applyTabs('adjust'); L.cur = -1;
    $('empty').hidden = false; $('app').classList.add('noimg');
    ['btnExport', 'btnCompare', 'btnUndo', 'btnRedo'].forEach((id) => ($(id).disabled = true));
    ctx.clearRect(0, 0, view.width, view.height); amb.width = amb.width;
    sheet.hidden = true;
    L.hooks.items();
  }
  L.removeCur = async () => {
    if (L.cur < 0) return;
    const i = L.cur; items.splice(i, 1); actToken++; L.cur = -1;
    if (!items.length) { showEmpty(); return; }
    let res = 'err', k = Math.min(i, items.length - 1);
    while (res === 'err' && items.length) { res = await activate(Math.min(k, items.length - 1)); }
    if (!items.length) showEmpty();
    toast(t('toastRemoved'));
  };

  const fileIn = $('fileIn');
  const openDlg = () => fileIn.click();
  L.openDlg = openDlg;
  $('btnOpen').addEventListener('click', openDlg);
  $('btnOpen2').addEventListener('click', openDlg);
  fileIn.addEventListener('change', () => { if (fileIn.files.length) addFiles(fileIn.files); fileIn.value = ''; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  stage.addEventListener('dragover', (e) => { e.preventDefault(); stage.classList.add('drag'); });
  stage.addEventListener('dragleave', () => stage.classList.remove('drag'));
  stage.addEventListener('drop', (e) => { e.preventDefault(); stage.classList.remove('drag'); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); });
  document.addEventListener('paste', (e) => {
    const fs = e.clipboardData ? [...e.clipboardData.files].filter((f) => f.type.startsWith('image/')) : [];
    if (fs.length) addFiles(fs);
  });

  /* ---------- Exportació ---------- */
  const sheet = $('sheet');
  const EXP = { fmt: 'jpeg', q: 92, size: 'orig', scope: 'one' };
  const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp' };
  function outSizeFor(c) {
    const cw = Math.round(c.w), ch = Math.round(c.h), long = Math.max(cw, ch);
    let k = EXP.size === 'orig' ? 1 : Math.min(1, EXP.size / long);
    let limited = false;
    if (long * k > engine.maxOut) { k = engine.maxOut / long; limited = true; }
    return { w: Math.max(1, Math.round(cw * k)), h: Math.max(1, Math.round(ch * k)), limited };
  }
  const outSize = () => outSizeFor(S.geo.crop);
  const batchScope = () => EXP.scope === 'all' && items.length > 1;
  function fillSizes() {
    const c = S.geo.crop, long = Math.round(Math.max(c.w, c.h)), sel = $('sizeSel'), all = batchScope();
    sel.innerHTML = '';
    const opts = [['orig', all ? t('fullSize') : t('fullSize') + ' (' + Math.round(c.w) + '×' + Math.round(c.h) + ')']];
    [4096, 2048, 1080].forEach((n) => { if (all || n < long) opts.push([String(n), n + ' px · ' + t('longSide')]); });
    opts.forEach(([v, label]) => { const o = document.createElement('option'); o.value = v; o.textContent = label; sel.appendChild(o); });
    if (!opts.some(([v]) => v === String(EXP.size))) EXP.size = 'orig';
    sel.value = String(EXP.size);
  }
  function updExportInfo() {
    const o = outSize(), all = batchScope();
    $('sheetTitle').textContent = t(all ? 'exportLotTitle' : 'exportTitle');
    $('btnExpGo').textContent = t(all ? 'saveZip' : 'save');
    $('exportInfo').textContent = all ? items.length + ' ' + t('photosZip') + (EXP.fmt === 'png' ? ' · ' + t('hintPng') : '') : o.w + '×' + o.h + ' px · ' + (o.w * o.h / 1e6).toFixed(1) + ' ' + t('mpx') +
      (EXP.fmt === 'png' ? ' · ' + t('hintPng') : '') + (o.limited ? ' · ' + t('hintLimit') : '');
    $('qField').hidden = EXP.fmt === 'png';
  }
  function openExport() {
    if (!S.has) return;
    if (S.mode === 'crop') setMode('adjust');
    EXP.scope = 'one';
    $('scopeField').hidden = items.length < 2;
    $('scopeSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.s === 'one'));
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
  $('scopeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    EXP.scope = b.dataset.s;
    $('scopeSeg').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    fillSizes(); updExportInfo();
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
  /* Exporta tot el lot en un ZIP: cada foto es descodifica, es renderitza amb el seu estat i es desa */
  async function exportAll() {
    saveCur();
    const keep = L.cur, files = [], used = {};
    try {
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        $('exportInfo').textContent = t('exporting') + ' ' + (i + 1) + ' / ' + items.length + '…';
        const bmp = await decodeFile(it.file);
        const info = engine.setSource(bmp); if (bmp.close) bmp.close();
        const g = it.geo || defGeo(info.w, info.h), o = outSizeFor(g.crop);
        engine.render(o.w, o.h, { rot: g.rot, flipH: g.flipH, flipV: g.flipV, angle: g.angle, crop: g.crop }, it.adj || zero(), g.crop);
        let blob = await engine.toBlob(MIME[EXP.fmt], EXP.q / 100);
        if (!blob || (blob.type && blob.type !== MIME[EXP.fmt])) { if (EXP.fmt !== 'jpeg') blob = await engine.toBlob(MIME.jpeg, EXP.q / 100); }
        if (!blob) throw new Error('blob');
        const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
        const base = it.name + '-lumen'; used[base] = (used[base] || 0) + 1;
        files.push({ name: base + (used[base] > 1 ? '-' + used[base] : '') + '.' + ext, data: new Uint8Array(await blob.arrayBuffer()) });
        await new Promise((r) => setTimeout(r, 0));
      }
      return LumenZip.make(files);
    } finally {
      /* torna a posar a la textura la foto que s'estava editant */
      try {
        const bmp = await decodeFile(items[keep].file); engine.setSource(bmp); if (bmp.close) bmp.close();
      } catch (e) { console.error(e); }
    }
  }

  $('btnExpGo').addEventListener('click', async () => {
    const btn = $('btnExpGo'); btn.disabled = true;
    try {
      if (batchScope()) {
        const zip = await exportAll();
        closeExport();
        if (await shareOrDownload(zip, 'lumen-lot.zip')) toast(t('toastZip'));
        return;
      }
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
    else if (!mod && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) === false && e.key === 'ArrowRight') L.go(1);
    else if (!mod && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) === false && e.key === 'ArrowLeft') L.go(-1);
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
  const ro = new ResizeObserver(() => L.draw());
  [stage, dock, bar].forEach((el) => ro.observe(el));
  window.addEventListener('orientationchange', () => setTimeout(L.draw, 200));
})();
