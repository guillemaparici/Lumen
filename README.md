# Lumen — editor de fotos (fases 1 i 2)

Editor de fotos personal que s'instal·la com una app (PWA) i funciona sense connexió.
Les fotos **mai surten del teu dispositiu**: tot el procés es fa al navegador.

## Què inclou la fase 1
- Obrir foto (botó, arrossegar-la o enganxar-la) amb orientació EXIF correcta
- Ajustos: brillantor, contrast, saturació, ambient, llums, ombres, temperatura, tinta, nitidesa i vinyeta
- Retall amb tiradors i relacions d'aspecte (lliure, original, 1:1, 4:5, 5:4, 3:4, 4:3, 2:3, 3:2, 9:16, 16:9)
- Girar 90°, voltejar i endreçar l'horitzó (±45°)
- Zoom (pessic, roda del ratolí o doble toc) i desplaçament
- Abans/després: mantén premut el botó de comparar (o la tecla **C**)
- Desfer / refer (**Ctrl+Z** / **Ctrl+Maj+Z**)
- Exportació a JPG, PNG o WebP, amb qualitat i mida a escollir

## Fase 2: treballar en lot
- Obre diverses fotos alhora (o arrossega-les). Apareix una **tira de miniatures** dins del panell.
- **Llisca** a esquerra/dreta sobre la foto (amb zoom 1), toca una miniatura o usa les **fletxes** del teclat.
- Cada foto té els seus propis ajustos, retall i historial de desfer. Un puntet marca les fotos editades.
- Pestanya **Lot**: copia/enganxa ajustos, **Aplica a totes**, **Selecciona** (marca miniatures i enganxa només a aquestes),
  afegeix fotos o treu la foto actual del lot. Només es copien els ajustos de color; el retall és de cada foto.
- **Exporta → Tot el lot**: baixa un únic ZIP amb totes les fotos (cadascuna amb el seu retall i ajustos).

## Fitxers
```
index.html               l'app (estructura)
css/style.css            disseny: negre i blanc trencat, vidre esmerilat, microinteraccions
fonts/                   Instrument Serif i Hanken Grotesk en local (llicència OFL), perquè funcioni sense connexió
manifest.webmanifest     perquè Chrome la reconegui com a app
sw.js                    funcionament sense connexió
icons/                   icones de l'app
js/i18n.js               textos (català; preparat per afegir castellà i anglès)
js/geometry.js           càlculs del retall
js/zip.js                creador de ZIP (exportació del lot)
js/batch.js              tira de miniatures i panell Lot
js/engine.js             motor de render (WebGL2)
js/app.js, js/crop.js    interfície i eines
```

## Publicar-la a GitHub Pages (gratis)
1. A github.com, crea un repositori nou (p. ex. `lumen`). **Ha de ser públic** perquè Pages sigui gratuït.
2. A la pàgina del repositori: **Add file → Upload files**. Arrossega **el contingut** d'aquesta carpeta
   (`index.html`, `manifest.webmanifest`, `sw.js`, la carpeta `icons` i la carpeta `js`) i prem **Commit changes**.
   `index.html` ha de quedar a l'arrel del repositori, no dins d'una subcarpeta.
3. **Settings → Pages**. A *Build and deployment* tria **Deploy from a branch**, branca `main`, carpeta `/ (root)`, i **Save**.
4. Al cap d'1–2 minuts l'adreça serà `https://EL_TEU_USUARI.github.io/lumen/`.
5. Obre-la amb **Chrome**:
   - Mòbil: menú ⋮ → **Instal·la l'app** (o *Afegeix a la pantalla d'inici*).
   - Ordinador: icona d'instal·lar a la barra d'adreces.

> Només el codi de l'app és públic; les teves fotos i estils es queden al teu dispositiu.

## Actualitzar l'app
Substitueix els fitxers al repositori i, a `sw.js`, puja el número de `CACHE_VERSION`
(`lumen-v5` → `lumen-v6`) perquè els dispositius descarreguin la versió nova.

## Afegir idiomes
A `js/i18n.js`, copia el bloc `ca`, canvia la clau (`es`, `en`) i tradueix els textos.
