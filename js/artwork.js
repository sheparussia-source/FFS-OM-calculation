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
