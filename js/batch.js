/* Lumen — interfície del lot: tira de miniatures, panell «Lot» (copiar / enganxar / aplicar a totes / seleccionar). */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const L = window.L, S = L.S, t = L.t, items = L.items;
  const strip = $('strip');
  let clip = null;            // ajustos copiats
  let selMode = false;        // mode de selecció múltiple
  const picked = new Set();   // ids de les fotos marcades

  const ADJ_KEYS = Object.keys(L.zero());
  const hasAdj = (adj) => !!adj && ADJ_KEYS.some((k) => Math.abs(adj[k] || 0) > 1e-6);
  function geoEdited(g, w, h) {
    if (!g) return false;
    const c = g.crop;
    return g.rot !== 0 || g.flipH || g.flipV || Math.abs(g.angle) > 1e-6 ||
      (w > 0 && (Math.abs(c.w - w) > 0.5 || Math.abs(c.h - h) > 0.5 || Math.abs(c.x) > 0.5 || Math.abs(c.y) > 0.5));
  }
  const isEdited = (it, i) => i === L.cur
    ? hasAdj(S.adj) || geoEdited(S.geo, S.srcW, S.srcH)
    : hasAdj(it.adj) || geoEdited(it.geo, it.w, it.h);

  /* ---------- Tira ---------- */
  function render() {
    strip.hidden = items.length < 2;
    strip.classList.toggle('sel', selMode);
    strip.innerHTML = '';
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'th'; b.dataset.id = it.id; b.dataset.i = i;
      b.setAttribute('aria-label', (i + 1) + ' / ' + items.length + ' · ' + it.name);
      const img = document.createElement('img'); img.alt = '';
      if (it.thumb && it.thumb.startsWith('data:')) img.src = it.thumb;
      b.append(img);
      b.insertAdjacentHTML('beforeend', '<span class="ed"></span><span class="ck"></span>');
      strip.appendChild(b);
    });
    mark();
    info();
    const cur = strip.children[L.cur];
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }
  function mark() {
    [...strip.children].forEach((b, i) => {
      const it = items[i]; if (!it) return;
      b.classList.toggle('on', i === L.cur);
      b.classList.toggle('picked', picked.has(it.id));
      b.classList.toggle('edited', isEdited(it, i));
    });
  }
  /* Només repinta el puntet d'«editada» de la foto activa (es crida a cada dibuix) */
  let lastDot = null;
  function dirty() {
    const b = strip.children[L.cur]; if (!b || !items[L.cur]) return;
    const e = isEdited(items[L.cur], L.cur);
    if (lastDot !== L.cur + ':' + e) { lastDot = L.cur + ':' + e; b.classList.toggle('edited', e); }
  }
  function thumb(it) {
    const i = items.indexOf(it), b = strip.children[i]; if (!b) return;
    if (it.thumb.startsWith('data:')) b.querySelector('img').src = it.thumb;
  }
  function info() {
    $('lotInfo').textContent = items.length > 1 && L.cur >= 0
      ? t('photoOf').replace('{a}', L.cur + 1).replace('{b}', items.length) : t('onePhoto');
    $('btnPaste').disabled = !clip;
    const n = picked.size;
    $('pasteLabel').textContent = selMode && n ? t('pasteSel').replace('{n}', n) : t('pasteAdj');
    $('selLabel').textContent = t(selMode ? 'selectDone' : 'selectMode');
    $('btnSelMode').classList.toggle('on', selMode);
    $('btnSelMode').setAttribute('aria-pressed', selMode);
    $('lotHint').textContent = t(selMode ? 'hintSel' : 'hintLot');
    $('btnApplyAll').disabled = items.length < 2;
    $('btnSelMode').disabled = items.length < 2;
  }
  L.hooks.items = () => {
    const ids = new Set(items.map((x) => x.id));
    [...picked].forEach((id) => { if (!ids.has(id)) picked.delete(id); });
    if (items.length < 2) selMode = false;
    lastDot = null; render();
  };
  L.hooks.thumb = thumb;
  L.hooks.dirty = dirty;

  strip.addEventListener('click', (e) => {
    const b = e.target.closest('.th'); if (!b) return;
    const i = +b.dataset.i, it = items[i];
    if (selMode) {
      picked.has(it.id) ? picked.delete(it.id) : picked.add(it.id);
      mark(); info();
    } else L.activate(i);
  });

  /* ---------- Panell Lot ---------- */
  const copyAdj = (a) => Object.assign({}, a);
  /* Posa uns ajustos a la foto i-èssima; deixa el pas anterior a l'historial perquè es pugui desfer */
  function applyTo(i, adj) {
    if (i === L.cur) {
      L.push(); S.adj = copyAdj(adj); L.syncUI(); L.draw();
    } else {
      const it = items[i];
      it.history.push(JSON.stringify({ adj: it.adj || L.zero(), geo: it.geo }));
      if (it.history.length > 100) it.history.shift();
      it.future = []; it.adj = copyAdj(adj);
    }
  }
  $('btnAddPhotos').addEventListener('click', () => L.openDlg());
  $('btnRemove').addEventListener('click', () => L.removeCur());
  $('btnCopy').addEventListener('click', () => {
    if (!S.has) return;
    clip = copyAdj(S.adj); info(); L.toast(t('toastCopied'));
  });
  $('btnPaste').addEventListener('click', () => {
    if (!clip) { L.toast(t('toastNoClip')); return; }
    const idx = selMode && picked.size ? items.map((x, i) => (picked.has(x.id) ? i : -1)).filter((i) => i >= 0) : [L.cur];
    idx.forEach((i) => applyTo(i, clip));
    mark(); L.toast(t('toastPasted').replace('{n}', idx.length));
  });
  $('btnApplyAll').addEventListener('click', () => {
    if (!S.has || items.length < 2) return;
    const src = copyAdj(S.adj); clip = src;
    let n = 0;
    items.forEach((it, i) => { if (i !== L.cur) { applyTo(i, src); n++; } });
    info(); mark(); L.toast(t('toastAppliedAll').replace('{n}', n));
  });
  $('btnSelMode').addEventListener('click', () => {
    selMode = !selMode; if (!selMode) picked.clear();
    strip.classList.toggle('sel', selMode); mark(); info();
  });

  info();
})();
