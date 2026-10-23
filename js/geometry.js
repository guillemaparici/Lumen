/* Lumen — geometria del retall (funcions pures, sense DOM; es poden provar amb Node).
   Tot s'expressa en píxels del "frame" (imatge ja girada/voltejada), amb Y cap avall.
   Un crop és {x,y,w,h}. L'angle d'endreçat (graus) gira la imatge al voltant del centre del frame. */
(function (root) {
  const RAD = Math.PI / 180;

  function inside(x, y, W, H, ang, eps) {
    eps = eps == null ? 0.5 : eps;
    const a = ang * RAD, c = Math.cos(a), s = Math.sin(a);
    const dx = x - W / 2, dy = y - H / 2;
    const sx = W / 2 + c * dx + s * dy, sy = H / 2 - s * dx + c * dy;
    return sx >= -eps && sx <= W + eps && sy >= -eps && sy <= H + eps;
  }
  function cropInside(cr, W, H, ang) {
    return inside(cr.x, cr.y, W, H, ang) && inside(cr.x + cr.w, cr.y, W, H, ang) &&
      inside(cr.x, cr.y + cr.h, W, H, ang) && inside(cr.x + cr.w, cr.y + cr.h, W, H, ang);
  }
  function scaleAbout(cr, k) {
    const cx = cr.x + cr.w / 2, cy = cr.y + cr.h / 2;
    return { x: cx - cr.w * k / 2, y: cy - cr.h * k / 2, w: cr.w * k, h: cr.h * k };
  }
  function lerpRect(a, b, t) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t };
  }
  function minSize(W, H) { return Math.max(24, 0.04 * Math.min(W, H)); }

  /** Si el retall surt de la imatge girada, l'encongeix al voltant del centre fins que hi càpiga. */
  function shrinkToFit(cr, W, H, ang) {
    if (cropInside(cr, W, H, ang)) return cr;
    let c0 = cr;
    if (!inside(cr.x + cr.w / 2, cr.y + cr.h / 2, W, H, ang, 0)) c0 = { x: W / 2 - cr.w / 2, y: H / 2 - cr.h / 2, w: cr.w, h: cr.h };
    let lo = 0, hi = 1;
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2;
      if (cropInside(scaleAbout(c0, mid), W, H, ang)) lo = mid; else hi = mid;
    }
    return scaleAbout(c0, lo);
  }

  /** Retall més gran possible amb una relació d'aspecte donada, centrat a "center". */
  function fitRatio(center, ratio, W, H, ang) {
    let w = W, h = W / ratio;
    if (h > H) { h = H; w = H * ratio; }
    return shrinkToFit({ x: center.x - w / 2, y: center.y - h / 2, w, h }, W, H, ang);
  }

  /** Aplica una operació (la que veu l'usuari) a un retall. W,H = mida del frame ABANS de l'operació. */
  function transformCrop(cr, W, H, op) {
    switch (op) {
      case 'rotR': return { x: H - (cr.y + cr.h), y: cr.x, w: cr.h, h: cr.w };
      case 'rotL': return { x: cr.y, y: W - (cr.x + cr.w), w: cr.h, h: cr.w };
      case 'flipH': return { x: W - (cr.x + cr.w), y: cr.y, w: cr.w, h: cr.h };
      case 'flipV': return { x: cr.x, y: H - (cr.y + cr.h), w: cr.w, h: cr.h };
    }
    return cr;
  }

  /** Composició d'estat geomètric: la imatge és flip(rot(font)). Girar després de voltejar intercanvia els voltejats. */
  function applyOp(geo, op) {
    const g = Object.assign({}, geo);
    if (op === 'rotR') { g.rot = (g.rot + 1) % 4; const t = g.flipH; g.flipH = g.flipV; g.flipV = t; }
    else if (op === 'rotL') { g.rot = (g.rot + 3) % 4; const t = g.flipH; g.flipH = g.flipV; g.flipV = t; }
    else if (op === 'flipH') g.flipH = !g.flipH;
    else if (op === 'flipV') g.flipV = !g.flipV;
    return g;
  }

  /** Entre el retall vell i el candidat, agafa el més proper al candidat que encara càpiga dins la imatge. */
  function clampTowards(old, cand, W, H, ang) {
    if (cropInside(cand, W, H, ang)) return cand;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (cropInside(lerpRect(old, cand, mid), W, H, ang)) lo = mid; else hi = mid;
    }
    return lerpRect(old, cand, lo);
  }

  function moveCrop(c0, dx, dy, W, H, ang) {
    return clampTowards(c0, { x: c0.x + dx, y: c0.y + dy, w: c0.w, h: c0.h }, W, H, ang);
  }

  /** h: 'tl','t','tr','r','br','b','bl','l'. ratio: nombre (w/h) o null (lliure). */
  function resizeCrop(c0, h, dx, dy, ratio, W, H, ang) {
    let x0 = c0.x, y0 = c0.y, x1 = c0.x + c0.w, y1 = c0.y + c0.h;
    const min = minSize(W, H);
    if (h.includes('l')) x0 += dx;
    if (h.includes('r')) x1 += dx;
    if (h.includes('t')) y0 += dy;
    if (h.includes('b')) y1 += dy;
    if (x1 - x0 < min) { if (h.includes('l')) x0 = x1 - min; else x1 = x0 + min; }
    if (y1 - y0 < min) { if (h.includes('t')) y0 = y1 - min; else y1 = y0 + min; }
    if (ratio) {
      let w = x1 - x0, hh = y1 - y0;
      if (h.length === 2) {
        if (w / hh > ratio) hh = w / ratio; else w = hh * ratio;
        if (h.includes('l')) x0 = x1 - w; else x1 = x0 + w;
        if (h.includes('t')) y0 = y1 - hh; else y1 = y0 + hh;
      } else if (h === 'l' || h === 'r') {
        hh = w / ratio; const cy = c0.y + c0.h / 2;
        y0 = cy - hh / 2; y1 = cy + hh / 2;
      } else {
        w = hh * ratio; const cx = c0.x + c0.w / 2;
        x0 = cx - w / 2; x1 = cx + w / 2;
      }
    }
    const cand = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    if (cand.w < min - 1e-6 || cand.h < min - 1e-6) return c0;
    return clampTowards(c0, cand, W, H, ang);
  }

  const api = { inside, cropInside, scaleAbout, shrinkToFit, fitRatio, transformCrop, applyOp, moveCrop, resizeCrop, minSize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.LumenGeo = api;
})(typeof window !== 'undefined' ? window : globalThis);
