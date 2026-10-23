/* Lumen — textos de la interfície.
   Per afegir un idioma: copia el bloc "ca", canvia la clau (p. ex. "es", "en") i tradueix els valors.
   L'app detecta l'idioma desat (localStorage "lumen.lang"); per defecte, català. */
(function () {
  const DICT = {
    ca: {
      export: 'Exporta', emptyTitle1: 'Dona', emptyTitle2: 'llum a les teves fotos',
      emptyText: 'Obre una foto per començar. Tot es queda al teu dispositiu.',
      openPhoto: 'Obre una foto', loading: 'Carregant…', dropHere: 'Deixa la foto aquí',
      tabAdjust: 'Ajustos', tabCrop: 'Retall', tabLot: 'Lot',
      // lot de fotos
      photoOf: 'Foto {a} de {b}', onePhoto: 'Una sola foto. Afegeix-ne més per treballar en lot.',
      addPhotos: 'Afegeix fotos', removePhoto: 'Treu aquesta foto del lot',
      copyAdj: 'Copia ajustos', pasteAdj: 'Enganxa ajustos', pasteSel: 'Enganxa a {n}', applyAll: 'Aplica a totes',
      selectMode: 'Selecciona', selectDone: 'Fet',
      hintLot: 'Llisca a esquerra o dreta sobre la foto per canviar-ne. Només es copien els ajustos de color; el retall és de cada foto.',
      hintSel: 'Toca les miniatures per marcar-les i després «Enganxa».',
      toastCopied: 'Ajustos copiats', toastNoClip: 'Primer copia els ajustos d\'una foto',
      toastPasted: 'Ajustos enganxats · {n}', toastAppliedAll: 'Ajustos aplicats a les altres fotos · {n}',
      toastAdded: 'Fotos afegides · {n}', toastRemoved: 'Foto treta del lot', toastZip: 'ZIP desat',
      scope: 'Abast', scopeOne: 'Aquesta foto', scopeAll: 'Tot el lot',
      exportLotTitle: 'Exporta el lot', saveZip: 'Desa el ZIP', exporting: 'Exportant', photosZip: 'fotos en un ZIP',
      resetOne: 'Restableix aquest', resetAll: 'Restableix tot',
      straighten: 'Endreça', rotL: '90°', rotR: '90°', flipH: 'Voltea ↔', flipV: 'Voltea ↕',
      resetCrop: 'Restableix', apply: 'Aplica',
      exportTitle: 'Exporta la foto', format: 'Format', quality: 'Qualitat', size: 'Mida', cancel: 'Cancel·la', save: 'Desa',
      // consells (tooltips)
      tipOpen: 'Obre una foto (O)', tipCompare: 'Mantén premut per veure l\'original (C)', tipUndo: 'Desfés (Ctrl+Z)', tipRedo: 'Refés (Ctrl+Maj+Z)',
      tipRotL: 'Gira a l\'esquerra', tipRotR: 'Gira a la dreta', tipFlipH: 'Voltea horitzontalment', tipFlipV: 'Voltea verticalment',
      // ajustos
      adj_brightness: 'Brillantor', adj_contrast: 'Contrast', adj_saturation: 'Saturació', adj_ambience: 'Ambient',
      adj_highlights: 'Llums', adj_shadows: 'Ombres', adj_warmth: 'Temperatura', adj_tint: 'Tinta',
      adj_sharpen: 'Nitidesa', adj_vignette: 'Vinyeta',
      // retall
      ratio_free: 'Lliure', ratio_orig: 'Original',
      // missatges
      toastOpened: 'Foto oberta', toastErrOpen: 'No s\'ha pogut obrir aquesta imatge', toastNoGL: 'Aquest navegador no admet WebGL2. Prova Chrome actualitzat.',
      toastSaved: 'Foto desada', toastErrExport: 'No s\'ha pogut exportar la foto', toastCropApplied: 'Retall aplicat',
      toastReset: 'Ajustos restablerts', toastBig: 'Imatge molt gran: s\'ha reduït per poder-la editar',
      original: 'Original', fullSize: 'Mida original', longSide: 'costat llarg', approx: 'Aprox.',
      mpx: 'Mpx', hintPng: 'El PNG no perd qualitat però pesa més.', hintLimit: 'Mida limitada pel dispositiu.'
    }
    // es: { ... }, en: { ... }
  };
  let lang = 'ca';
  try { lang = localStorage.getItem('lumen.lang') || 'ca'; } catch (e) {}
  if (!DICT[lang]) lang = 'ca';

  window.I18N = {
    lang,
    t(key) { return (DICT[lang] && DICT[lang][key]) || DICT.ca[key] || key; },
    apply(root) {
      (root || document).querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = I18N.t(el.dataset.i18n); });
      (root || document).querySelectorAll('[data-i18n-title]').forEach((el) => {
        const v = I18N.t(el.dataset.i18nTitle); el.title = v; el.setAttribute('aria-label', v);
      });
      document.documentElement.lang = lang;
    }
  };
})();
