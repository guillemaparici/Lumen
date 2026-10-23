/* Lumen — eina de retall: caixa amb tiradors, relacions d'aspecte, endreçar, girar i voltejar. */
(function () {
  'use strict';
  const L = window.L, S = L.S, G = window.LumenGeo, t = L.t;
  const $ = (id) => document.getElementById(id);
  const layer = $('cropLayer');

  const RATIOS = [
    { id: 'free' }, { id: 'orig' }, { id: '1:1', v: 1 }, { id: '4:5', v: 4 / 5 }, { id: '5:4', v: 5 / 4 },
    { id: '3:4', v: 3 / 4 }, { id: '4:3', v: 4 / 3 }, { id: '2:3', v: 2 / 3 }, { id: '3:2', v: 3 / 2 },
    { id: '9:16', v: 9 / 16 }, { id: '16:9', v: 16 / 9 }
  ];
  function ratioValue() {
    const r = RATIOS.find((x) => x.id === S.ratioId);
    if (!r || r.id === 'free') return null;
    if (r.id === 'orig') { const f = L.frame(); return f.w / f.h; }
    return r.v;
  }

  /* ---------- DOM de la capa ---------- */
  const shades = [0, 1, 2, 3].map(() => { const d = document.createElement('div'); d.className = 'shade'; return d; });
  const box = document.createElement('div'); box.className = 'box';
  const HANDLES = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'];
  const hEls = {};
  layer.append(...shades, box);
  HANDLES.forEach((h) => { const d = document.createElement('div'); d.className = 'h'; d.dataset.h = h; hEls[h] = d; layer.appendChild(d); });

  /* ---------- Xips de relació d'aspecte ---------- */
  const ratioChips = $('ratioChips');
  RATIOS.forEach((r) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.dataset.id = r.id;
    b.textContent = r.id === 'free' ? t('ratio_free') : r.id === 'orig' ? t('ratio_orig') : r.id;
    b.addEventListener('click', () => {
      S.ratioId = r.id; markRatios();
      const v = ratioValue();
      if (v && S.draft) {
        const f = L.frame(), d = S.draft;
        S.draft = G.fitRatio({ x: d.x + d.w / 2, y: d.y + d.h / 2 }, v, f.w, f.h, S.geo.angle);
      }
      L.draw();
    });
    ratioChips.appendChild(b);
  });
  function markRatios() { ratioChips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.id === S.ratioId)); }

  /* ---------- Posició de la caixa a pantalla ---------- */
  function sync() {
    if (layer.hidden || !S.draft) return;
    const sw = layer.clientWidth, sh = layer.clientHeight, d = S.draft;
    const a = L.toScreen(d.x, d.y), b = L.toScreen(d.x + d.w, d.y + d.h);
    const px = (el, l, tp, w, h) => { el.style.left = l + 'px'; el.style.top = tp + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; };
    px(box, a.x, a.y, b.x - a.x, b.y - a.y);
    px(shades[0], 0, 0, sw, Math.max(0, a.y));
    px(shades[1], 0, b.y, sw, Math.max(0, sh - b.y));
    px(shades[2], 0, a.y, Math.max(0, a.x), b.y - a.y);
    px(shades[3], b.x, a.y, Math.max(0, sw - b.x), b.y - a.y);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const pos = { tl: [a.x, a.y], t: [mx, a.y], tr: [b.x, a.y], r: [b.x, my], br: [b.x, b.y], b: [mx, b.y], bl: [a.x, b.y], l: [a.x, my] };
    HANDLES.forEach((h) => { hEls[h].style.left = pos[h][0] + 'px'; hEls[h].style.top = pos[h][1] + 'px'; });
  }

  /* ---------- Arrossegar: moure i redimensionar ---------- */
  function startDrag(e, mode) {
    e.preventDefault(); e.stopPropagation();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const c0 = Object.assign({}, S.draft), x0 = e.clientX, y0 = e.clientY, sc = L.scale(), f = L.frame(), ratio = ratioValue(), ang = S.geo.angle;
    const mv = (ev) => {
      const dx = (ev.clientX - x0) / sc, dy = (ev.clientY - y0) / sc;
      S.draft = mode === 'move' ? G.moveCrop(c0, dx, dy, f.w, f.h, ang) : G.resizeCrop(c0, mode, dx, dy, ratio, f.w, f.h, ang);
      L.draw();
    };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  box.addEventListener('pointerdown', (e) => startDrag(e, 'move'));
  HANDLES.forEach((h) => hEls[h].addEventListener('pointerdown', (e) => startDrag(e, h)));

  /* ---------- Entrar / sortir / confirmar ---------- */
  function commit() {
    const d = S.draft, c = S.geo.crop;
    if (!d) return false;
    let r = { x: d.x, y: d.y, w: d.w, h: d.h };
    if (S.geo.angle !== 0) r = { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 };   // marge per evitar vora transparent en girar
    const x = Math.round(r.x), y = Math.round(r.y);
    r = { x, y, w: Math.max(1, Math.round(r.w)), h: Math.max(1, Math.round(r.h)) };
    if (Math.abs(r.x - c.x) < 1 && Math.abs(r.y - c.y) < 1 && Math.abs(r.w - c.w) < 1 && Math.abs(r.h - c.h) < 1) return false;
    L.push(); S.geo.crop = r; return true;
  }
  function enter() {
    S.draft = Object.assign({}, S.geo.crop);
    layer.hidden = false; syncUI(); sync();
  }
  function leave(apply) {
    if (apply) commit();
    S.draft = null; layer.hidden = true;
  }
  function syncUI() {
    const a = S.geo.angle || 0;
    $('angleSlider').value = a; L.paint($('angleSlider'));
    $('angleVal').textContent = (a > 0 ? '+' : '') + a.toFixed(1) + '°';
    markRatios();
  }

  /* ---------- Girar, voltejar, endreçar ---------- */
  function op(name) {
    const f = L.frame();
    L.push();
    S.geo.crop = G.transformCrop(S.geo.crop, f.w, f.h, name);
    if (S.draft) S.draft = G.transformCrop(S.draft, f.w, f.h, name);
    const g = G.applyOp(S.geo, name);
    S.geo.rot = g.rot; S.geo.flipH = g.flipH; S.geo.flipV = g.flipV;
    if (name === 'flipH' || name === 'flipV') S.geo.angle = -S.geo.angle;     // el llindar d'inclinació es mira al mirall
    if (name === 'rotR' || name === 'rotL') {                                  // 4:5 <-> 5:4
      const m = /^(\d+):(\d+)$/.exec(S.ratioId);
      if (m) S.ratioId = m[2] + ':' + m[1];
    }
    syncUI(); L.resetView(); L.draw();
  }
  $('btnRotR').addEventListener('click', () => op('rotR'));
  $('btnRotL').addEventListener('click', () => op('rotL'));
  $('btnFlipH').addEventListener('click', () => op('flipH'));
  $('btnFlipV').addEventListener('click', () => op('flipV'));

  const angleSlider = $('angleSlider');
  angleSlider.addEventListener('input', () => {
    if (!S.has) return;
    if (!S.editing) { L.push(); S.editing = true; }
    const a = parseFloat(angleSlider.value) || 0, f = L.frame();
    S.geo.angle = a; L.paint(angleSlider);
    S.geo.crop = G.shrinkToFit(S.geo.crop, f.w, f.h, a);
    if (S.draft) S.draft = G.shrinkToFit(S.draft, f.w, f.h, a);
    $('angleVal').textContent = (a > 0 ? '+' : '') + a.toFixed(1) + '°';
    L.draw();
  });
  angleSlider.addEventListener('change', () => { S.editing = false; });
  angleSlider.addEventListener('dblclick', () => { angleSlider.value = 0; angleSlider.dispatchEvent(new Event('input')); angleSlider.dispatchEvent(new Event('change')); });

  $('btnCropReset').addEventListener('click', () => {
    if (!S.has) return;
    L.push();
    S.geo = { rot: 0, flipH: false, flipV: false, angle: 0, crop: { x: 0, y: 0, w: S.srcW, h: S.srcH } };
    S.draft = Object.assign({}, S.geo.crop); S.ratioId = 'free';
    syncUI(); L.resetView(); L.draw();
  });
  $('btnCropApply').addEventListener('click', () => {
    if (!S.has) return;
    L.setMode('adjust'); L.toast(t('toastCropApplied'));
  });

  L.crop = { enter, leave, sync, syncUI };
  markRatios();
})();
