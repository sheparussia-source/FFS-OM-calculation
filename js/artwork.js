(function (root) {
  'use strict';

  const FFS = root.FFS;
  const $ = FFS.$;
  const clamp = FFS.clamp;

  let cropCanvas = null;
  let cropCtx = null;
  let cropDraft = { L: 0, R: 0, T: 0, B: 0 };
  let cropBox = null; // fitted image rect on cropCanvas
  let cropDrag = null;

  FFS.hasArtwork = function () {
    return !!(FFS.artwork && FFS.artwork.img && FFS.artwork.naturalW > 0);
  };

  FFS.getArtworkSourceRect = function (S) {
    const st = S || FFS.state;
    const nw = FFS.artwork.naturalW || 1;
    const nh = FFS.artwork.naturalH || 1;
    const lr = FFS.normalizeCropPair(st.omCropL || 0, st.omCropR || 0);
    const tb = FFS.normalizeCropPair(st.omCropT || 0, st.omCropB || 0);
    const cL = lr[0] / 100;
    const cR = lr[1] / 100;
    const cT = tb[0] / 100;
    const cB = tb[1] / 100;
    return {
      sx: nw * cL,
      sy: nh * cT,
      sw: Math.max(1, nw * (1 - cL - cR)),
      sh: Math.max(1, nh * (1 - cT - cB))
    };
  };

  // Shared pixel-accurate artwork renderer for both 2D blueprint and 3D bag texture
  FFS.drawArtworkOnCtx = function (ctx, x, y, w, h, flipX, rot180, opacity, S) {
    if (!FFS.hasArtwork() || opacity <= 0.001) return;
    const src = FFS.getArtworkSourceRect(S);
    ctx.save();
    ctx.globalAlpha = clamp(opacity, 0, 1);
    ctx.translate(x + w / 2, y + h / 2);
    if (rot180) ctx.rotate(Math.PI);
    if (flipX) ctx.scale(-1, 1);
    ctx.drawImage(FFS.artwork.img, src.sx, src.sy, src.sw, src.sh, -w / 2, -h / 2, w, h);
    ctx.restore();
  };

  FFS.updateArtworkUI = function () {
    const loaded = FFS.hasArtwork();
    const dz = $('om-dropzone');
    const lbl = $('om-file-label');
    const meta = $('om-file-meta');
    const cropBtn = $('btn-om-crop');
    const clrBtn = $('btn-om-clear');
    const quickBtn = $('btn-quick-om');
    const ratioEl = $('om-ratio-info');

    if (dz) dz.classList.toggle('loaded', loaded);
    if (cropBtn) cropBtn.disabled = !loaded;
    if (clrBtn) clrBtn.disabled = !loaded;
    if (quickBtn) {
      quickBtn.textContent = loaded ? 'ОМ: заменить' : '+ Макет ОМ';
    }

    if (loaded) {
      if (lbl) lbl.textContent = FFS.artwork.fileName || 'Оригинал-макет загружен';
      if (meta) meta.textContent = `${FFS.artwork.naturalW} × ${FFS.artwork.naturalH} px • Клик для замены`;
      if (ratioEl) {
        const src = FFS.getArtworkSourceRect(FFS.state);
        const imgRatio = src.sw / Math.max(1, src.sh);
        const bagRatio = FFS.state.B / Math.max(1, FFS.state.A);
        const diffPct = Math.abs(imgRatio - bagRatio) / bagRatio * 100;
        const status = diffPct <= 3.5
          ? `<span style="color:#166534;font-weight:700;">✓ Совпадает (Δ ${diffPct.toFixed(1)}%)</span>`
          : `<span style="color:#92400e;font-weight:700;">Отклонение ${diffPct.toFixed(1)}% — проверьте обрезку</span>`;
        ratioEl.innerHTML =
          `Пропорция рамки ОМ: <b>${imgRatio.toFixed(3)}</b> (B/A = <b>${bagRatio.toFixed(3)}</b>)<br>` +
          `Соответствие формату: ${status}`;
      }
    } else {
      if (lbl) lbl.textContent = 'Нажмите или перетащите картинку ОМ';
      if (meta) meta.textContent = 'PNG, JPG, WebP • Совмещение на 2D и 3D';
      if (ratioEl) ratioEl.textContent = 'Загрузите изображение ОМ для контроля пропорций B/A.';
    }
  };

  FFS.loadArtworkFile = function (file) {
    if (!file) return;
    if (!file.type || !file.type.startsWith('image/')) {
      if (typeof FFS.showToast === 'function') FFS.showToast('Выберите файл изображения (PNG, JPG или WebP)');
      return;
    }
    const reader = new FileReader();
    reader.onload = function () {
      const img = new Image();
      img.onload = function () {
        FFS.artwork.img = img;
        FFS.artwork.fileName = file.name;
        FFS.artwork.naturalW = img.naturalWidth || img.width;
        FFS.artwork.naturalH = img.naturalHeight || img.height;
        FFS.state.omShow2D = true;
        FFS.state.omShow3D = true;
        if (typeof FFS.syncStateToInputs === 'function') FFS.syncStateToInputs();
        FFS.updateArtworkUI();
        if (typeof FFS.updateAll === 'function') FFS.updateAll(false);
        if (typeof FFS.showToast === 'function') FFS.showToast(`Макет «${file.name}» наложен на 2D и 3D`);
      };
      img.onerror = function () {
        if (typeof FFS.showToast === 'function') FFS.showToast('Не удалось прочитать изображение');
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  };

  FFS.triggerUploadOM = function () {
    const inp = $('in-om-file');
    if (inp) {
      inp.value = '';
      inp.click();
    }
  };

  FFS.clearArtwork = function () {
    FFS.artwork.img = null;
    FFS.artwork.fileName = '';
    FFS.artwork.naturalW = 0;
    FFS.artwork.naturalH = 0;
    FFS.updateArtworkUI();
    if (typeof FFS.updateAll === 'function') FFS.updateAll(false);
    if (typeof FFS.showToast === 'function') FFS.showToast('Макет ОМ убран');
  };

  FFS.resetArtworkCrop = function () {
    FFS.state.omCropL = 0;
    FFS.state.omCropR = 0;
    FFS.state.omCropT = 0;
    FFS.state.omCropB = 0;
    if (typeof FFS.syncStateToInputs === 'function') FFS.syncStateToInputs();
    FFS.updateArtworkUI();
    if (typeof FFS.updateAll === 'function') FFS.updateAll(false);
  };

  // ===================== INTERACTIVE CROP MODAL =====================
  function drawCropModal() {
    if (!cropCanvas || !cropCtx || !FFS.hasArtwork()) return;
    const wrap = cropCanvas.parentElement;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (W < 20 || H < 20) return;

    const dpr = window.devicePixelRatio || 1;
    if (cropCanvas.width !== Math.floor(W * dpr) || cropCanvas.height !== Math.floor(H * dpr)) {
      cropCanvas.width = Math.floor(W * dpr);
      cropCanvas.height = Math.floor(H * dpr);
    }
    cropCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cropCtx.clearRect(0, 0, W, H);

    const pad = 22;
    const nw = FFS.artwork.naturalW;
    const nh = FFS.artwork.naturalH;
    const sc = Math.min((W - pad * 2) / nw, (H - pad * 2) / nh);
    const iw = nw * sc;
    const ih = nh * sc;
    const ix = (W - iw) / 2;
    const iy = (H - ih) / 2;
    cropBox = { ix, iy, iw, ih };

    cropCtx.drawImage(FFS.artwork.img, ix, iy, iw, ih);

    const x1 = ix + iw * (cropDraft.L / 100);
    const x2 = ix + iw * (1 - cropDraft.R / 100);
    const y1 = iy + ih * (cropDraft.T / 100);
    const y2 = iy + ih * (1 - cropDraft.B / 100);
    const rw = Math.max(2, x2 - x1);
    const rh = Math.max(2, y2 - y1);

    // Dark mask outside selection
    cropCtx.fillStyle = 'rgba(15, 23, 42, 0.56)';
    cropCtx.fillRect(ix, iy, iw, Math.max(0, y1 - iy));
    cropCtx.fillRect(ix, y2, iw, Math.max(0, iy + ih - y2));
    cropCtx.fillRect(ix, y1, Math.max(0, x1 - ix), rh);
    cropCtx.fillRect(x2, y1, Math.max(0, ix + iw - x2), rh);

    // Selection frame & rule-of-thirds / center cross
    cropCtx.strokeStyle = '#3b82f6';
    cropCtx.lineWidth = 2;
    cropCtx.strokeRect(x1, y1, rw, rh);

    cropCtx.save();
    cropCtx.strokeStyle = 'rgba(96, 165, 250, 0.55)';
    cropCtx.lineWidth = 1;
    cropCtx.setLineDash([5, 4]);
    cropCtx.beginPath();
    cropCtx.moveTo((x1 + x2) / 2, y1); cropCtx.lineTo((x1 + x2) / 2, y2);
    cropCtx.moveTo(x1, (y1 + y2) / 2); cropCtx.lineTo(x2, (y1 + y2) / 2);
    cropCtx.stroke();
    cropCtx.restore();

    // 8 resize handles
    const handles = [
      [x1, y1], [(x1 + x2) / 2, y1], [x2, y1],
      [x1, (y1 + y2) / 2], [x2, (y1 + y2) / 2],
      [x1, y2], [(x1 + x2) / 2, y2], [x2, y2]
    ];
    cropCtx.fillStyle = '#ffffff';
    cropCtx.strokeStyle = '#2563eb';
    cropCtx.lineWidth = 2;
    handles.forEach(([hx, hy]) => {
      cropCtx.fillRect(hx - 5, hy - 5, 10, 10);
      cropCtx.strokeRect(hx - 5, hy - 5, 10, 10);
    });

    const stats = $('crop-stats');
    if (stats) {
      const selW = nw * (1 - (cropDraft.L + cropDraft.R) / 100);
      const selH = nh * (1 - (cropDraft.T + cropDraft.B) / 100);
      const rSel = selW / Math.max(1, selH);
      const rBag = FFS.state.B / Math.max(1, FFS.state.A);
      const diff = Math.abs(rSel - rBag) / rBag * 100;
      stats.textContent =
        `Л:${cropDraft.L.toFixed(1)}% П:${cropDraft.R.toFixed(1)}% В:${cropDraft.T.toFixed(1)}% Н:${cropDraft.B.toFixed(1)}% | ` +
        `Рамка ${rSel.toFixed(3)} vs B/A ${rBag.toFixed(3)} (Δ ${diff.toFixed(1)}%)`;
    }
  }

  function hitCropHandle(mx, my) {
    if (!cropBox) return 'new';
    const { ix, iy, iw, ih } = cropBox;
    const x1 = ix + iw * (cropDraft.L / 100);
    const x2 = ix + iw * (1 - cropDraft.R / 100);
    const y1 = iy + ih * (cropDraft.T / 100);
    const y2 = iy + ih * (1 - cropDraft.B / 100);
    const near = (a, b) => Math.abs(a - b) <= 10;

    if (near(mx, x1) && near(my, y1)) return 'tl';
    if (near(mx, x2) && near(my, y1)) return 'tr';
    if (near(mx, x1) && near(my, y2)) return 'bl';
    if (near(mx, x2) && near(my, y2)) return 'br';
    if (near(mx, x1) && my >= y1 && my <= y2) return 'l';
    if (near(mx, x2) && my >= y1 && my <= y2) return 'r';
    if (near(my, y1) && mx >= x1 && mx <= x2) return 't';
    if (near(my, y2) && mx >= x1 && mx <= x2) return 'b';
    if (mx > x1 && mx < x2 && my > y1 && my < y2) return 'move';
    return 'new';
  }

  FFS.openCropModal = function () {
    if (!FFS.hasArtwork()) return;
    const modal = $('crop-modal');
    if (!modal) return;
    cropDraft = {
      L: FFS.state.omCropL || 0,
      R: FFS.state.omCropR || 0,
      T: FFS.state.omCropT || 0,
      B: FFS.state.omCropB || 0
    };
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(drawCropModal, 20);
  };

  FFS.closeCropModal = function () {
    const modal = $('crop-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    cropDrag = null;
  };

  FFS.resetCropDraft = function () {
    cropDraft = { L: 0, R: 0, T: 0, B: 0 };
    drawCropModal();
  };

  FFS.applyCropModal = function () {
    FFS.state.omCropL = Math.round(cropDraft.L * 10) / 10;
    FFS.state.omCropR = Math.round(cropDraft.R * 10) / 10;
    FFS.state.omCropT = Math.round(cropDraft.T * 10) / 10;
    FFS.state.omCropB = Math.round(cropDraft.B * 10) / 10;
    if (typeof FFS.syncStateToInputs === 'function') FFS.syncStateToInputs();
    FFS.updateArtworkUI();
    FFS.closeCropModal();
    if (typeof FFS.updateAll === 'function') FFS.updateAll(false);
    if (typeof FFS.showToast === 'function') FFS.showToast('Рамка макета ОМ применена');
  };

  // Края полотна сходятся на продольном шве. Сравниваем полоску макета у свободного края
  // с полоской, которая приходит к ней по шву S1. Это пиксели картинки, не распознавание букв.
  FFS.analyzeSeamArtwork = function (S) {
    if (!FFS.hasArtwork() || typeof FFS.getGeom !== 'function') return [];
    const st = S || FFS.state;
    const g = FFS.getGeom(st);
    const label = 'Стык рисунка на шве';
    const filmB = Math.max(st.B, g.sumB, 1);
    const lip = Math.max(0, st.T1);
    const seamCut = g.seamS1 - lip;
    if (!(seamCut > 6) || seamCut > filmB - 1) {
      return [{ label, status: 'warn', text: 'Шов S1 вне полотна, стык рисунка не проверить' }];
    }

    const band = 4;
    const binMm = 2;
    const ppm = 3;
    const src = FFS.getArtworkSourceRect(st);
    const paint = (x0, wMm) => {
      const cw = Math.max(2, Math.round(wMm * ppm));
      const ch = Math.max(2, Math.round(Math.max(st.A, 1) * ppm));
      const canvas = document.createElement('canvas');
      canvas.width = cw;
      canvas.height = ch;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cw, ch);
      const fullW = filmB * ppm;
      ctx.save();
      ctx.translate(-x0 * ppm + fullW / 2, ch / 2);
      if (st.omRot180) ctx.rotate(Math.PI);
      if (st.omFlipX) ctx.scale(-1, 1);
      ctx.drawImage(FFS.artwork.img, src.sx, src.sy, src.sw, src.sh, -fullW / 2, -ch / 2, fullW, ch);
      ctx.restore();
      return ctx.getImageData(0, 0, cw, ch);
    };

    const profile = (image, fromRight) => {
      const cols = Math.max(1, Math.min(image.width, Math.round(band * ppm)));
      const bin = Math.max(1, Math.round(binMm * ppm));
      const bins = [];
      for (let y0 = 0; y0 < image.height; y0 += bin) {
        const y1 = Math.min(image.height, y0 + bin);
        let sum = 0;
        let n = 0;
        for (let y = y0; y < y1; y++) {
          for (let k = 0; k < cols; k++) {
            const x = fromRight ? (image.width - 1 - k) : k;
            const i = (y * image.width + x) * 4;
            const r = image.data[i];
            const gch = image.data[i + 1];
            const b = image.data[i + 2];
            const dr = 255 - r;
            const dg = 255 - gch;
            const db = 255 - b;
            sum += Math.sqrt(dr * dr + dg * dg + db * db);
            n++;
          }
        }
        bins.push(sum / n);
      }
      return bins;
    };

    const corrAt = (a, b, shift) => {
      let a0 = 0;
      let b0 = 0;
      let n = Math.min(a.length, b.length) - Math.abs(shift);
      if (shift > 0) a0 = shift;
      else b0 = -shift;
      if (n < 8) return 0;
      let ma = 0;
      let mb = 0;
      for (let i = 0; i < n; i++) {
        ma += a[a0 + i];
        mb += b[b0 + i];
      }
      ma /= n;
      mb /= n;
      let va = 0;
      let vb = 0;
      let cov = 0;
      for (let i = 0; i < n; i++) {
        const da = a[a0 + i] - ma;
        const db = b[b0 + i] - mb;
        va += da * da;
        vb += db * db;
        cov += da * db;
      }
      if (va < 1 || vb < 1) return 0;
      return cov / Math.sqrt(va * vb);
    };

    const seamImg = paint(seamCut - band, band);
    const edgeImg = paint(0, band);
    const seamProf = profile(seamImg, true);
    const edgeProf = profile(edgeImg, false);
    const maxShift = Math.round(12 / binMm);
    let bestShift = 0;
    let best = -1;
    for (let s = -maxShift; s <= maxShift; s++) {
      const c = corrAt(seamProf, edgeProf, s);
      if (c > best) {
        best = c;
        bestShift = s;
      }
    }
    const shiftMm = Math.round(bestShift * binMm * 10) / 10;
    const flat = (arr) => {
      let m = 0;
      for (let i = 0; i < arr.length; i++) m += arr[i];
      m /= arr.length;
      let v = 0;
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i] - m;
        v += d * d;
      }
      return v / arr.length < 4;
    };

    if (flat(seamProf) && flat(edgeProf)) {
      return [{ label, status: 'muted', text: 'На шве S1 рисунка нет' }];
    }
    if (best < 0.62) {
      return [{ label, status: 'warn', text: 'На шве S1 рисунок не продолжается' }];
    }
    if (Math.abs(shiftMm) > 3) {
      return [{
        label,
        status: 'warn',
        text: `На шве S1 строки не сходятся, смещение ${Math.abs(shiftMm)} мм`
      }];
    }
    return [{ label, status: 'ok', text: 'Рисунок на шве S1 продолжается' }];
  };

  FFS.initArtworkEvents = function () {
    const fileInp = $('in-om-file');
    if (fileInp) {
      fileInp.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        if (f) FFS.loadArtworkFile(f);
      });
    }

    // Drag-and-drop image onto dropzone OR directly onto 2D canvas
    [$('om-dropzone'), $('wrap-2d')].forEach(target => {
      if (!target) return;
      target.addEventListener('dragover', e => {
        e.preventDefault();
        target.classList.add('dragover');
      });
      target.addEventListener('dragleave', () => {
        target.classList.remove('dragover');
      });
      target.addEventListener('drop', e => {
        e.preventDefault();
        target.classList.remove('dragover');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) FFS.loadArtworkFile(f);
      });
    });

    cropCanvas = $('crop-canvas');
    if (!cropCanvas) return;
    cropCtx = cropCanvas.getContext('2d');

    const modal = $('crop-modal');
    if (modal) {
      modal.addEventListener('mousedown', e => {
        if (e.target === modal) FFS.closeCropModal();
      });
    }

    cropCanvas.addEventListener('mousedown', e => {
      if (!cropBox) return;
      const rect = cropCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const mode = hitCropHandle(mx, my);
      cropDrag = { mode, startX: mx, startY: my, orig: { ...cropDraft } };
    });

    window.addEventListener('mousemove', e => {
      if (!cropCanvas || !cropBox) return;
      const modalEl = $('crop-modal');
      if (!modalEl || !modalEl.classList.contains('open')) return;
      const rect = cropCanvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      if (!cropDrag) {
        const h = hitCropHandle(mx, my);
        const curMap = {
          tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize',
          l: 'ew-resize', r: 'ew-resize', t: 'ns-resize', b: 'ns-resize',
          move: 'move', new: 'crosshair'
        };
        cropCanvas.style.cursor = curMap[h] || 'crosshair';
        return;
      }

      const { ix, iy, iw, ih } = cropBox;
      const pxToPctX = px => clamp(((px - ix) / iw) * 100, 0, 100);
      const pxToPctY = py => clamp(((py - iy) / ih) * 100, 0, 100);
      const o = cropDrag.orig;
      const m = cropDrag.mode;

      if (m === 'new') {
        const aX = pxToPctX(cropDrag.startX), bX = pxToPctX(mx);
        const aY = pxToPctY(cropDrag.startY), bY = pxToPctY(my);
        cropDraft.L = clamp(Math.min(aX, bX), 0, 49);
        cropDraft.R = clamp(100 - Math.max(aX, bX), 0, 49);
        cropDraft.T = clamp(Math.min(aY, bY), 0, 49);
        cropDraft.B = clamp(100 - Math.max(aY, bY), 0, 49);
      } else if (m === 'move') {
        const dx = ((mx - cropDrag.startX) / iw) * 100;
        const dy = ((my - cropDrag.startY) / ih) * 100;
        const wPct = 100 - o.L - o.R;
        const hPct = 100 - o.T - o.B;
        const nL = clamp(o.L + dx, 0, Math.min(49, 100 - wPct));
        const nT = clamp(o.T + dy, 0, Math.min(49, 100 - hPct));
        cropDraft.L = nL;
        cropDraft.R = clamp(100 - wPct - nL, 0, 49);
        cropDraft.T = nT;
        cropDraft.B = clamp(100 - hPct - nT, 0, 49);
      } else {
        if (m.includes('l')) cropDraft.L = clamp(pxToPctX(mx), 0, Math.min(49, 92 - cropDraft.R));
        if (m.includes('r')) cropDraft.R = clamp(100 - pxToPctX(mx), 0, Math.min(49, 92 - cropDraft.L));
        if (m.includes('t')) cropDraft.T = clamp(pxToPctY(my), 0, Math.min(49, 92 - cropDraft.B));
        if (m.includes('b')) cropDraft.B = clamp(100 - pxToPctY(my), 0, Math.min(49, 92 - cropDraft.T));
      }
      drawCropModal();
    });

    window.addEventListener('mouseup', () => {
      cropDrag = null;
    });

    window.addEventListener('resize', () => {
      const modalEl = $('crop-modal');
      if (modalEl && modalEl.classList.contains('open')) drawCropModal();
    });
  };
})(window);
