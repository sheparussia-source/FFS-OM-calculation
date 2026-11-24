(function (root) {
  'use strict';

  const FFS = root.FFS;
  const $ = FFS.$;
  const clamp = FFS.clamp;

  FFS.switchTab = function (name, btn) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-body').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $('tab-' + name).classList.add('active');
  };

  FFS.setViewMode = function (mode) {
    const ws = $('workspace');
    ws.classList.remove('mode-2d', 'mode-3d');
    if (mode === '2d') ws.classList.add('mode-2d');
    if (mode === '3d') ws.classList.add('mode-3d');
    ['split', '2d', '3d'].forEach(m => $('vm-' + m).classList.toggle('active', m === mode));
    setTimeout(() => { FFS.resize2D(); FFS.resize3D(); }, 20);
  };

  let toastTimer = null;
  FFS.showToast = function (msg) {
    const el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  };

  FFS.renderPresetSelect = function () {
    const sel = $('preset-select');
    const delBtn = $('btn-del-preset');
    if (!sel) return;

    sel.innerHTML = '';
    const baseOpt = document.createElement('option');
    baseOpt.value = '';
    baseOpt.textContent = FFS.savedPresets.length
      ? '— Базовый шаблон —'
      : '— Нет сохранённых —';
    sel.appendChild(baseOpt);

    FFS.savedPresets.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `${p.name} (${p.data.B}×${p.data.A})`;
      sel.appendChild(opt);
    });

    sel.value = FFS.ui.activePresetId || '';
    if (delBtn) delBtn.disabled = !FFS.ui.activePresetId;
  };

  FFS.loadDefaultTemplate = function () {
    FFS.state = FFS.cloneDefaultState();
    FFS.ui.activePresetId = '';
    FFS.ui.symNote = '';
    FFS.renderPresetSelect();
    FFS.syncStateToInputs();
    FFS.reset2DView();
    FFS.updateAll(true);
  };

  FFS.applySavedPreset = function (id) {
    if (!id) {
      FFS.loadDefaultTemplate();
      return;
    }
    const preset = FFS.getPresetById(id);
    if (!preset) {
      FFS.loadDefaultTemplate();
      return;
    }
    FFS.state = FFS.sanitizeState(preset.data);
    FFS.ui.activePresetId = preset.id;
    FFS.ui.symNote = '';
    FFS.renderPresetSelect();
    FFS.syncStateToInputs();
    FFS.reset2DView();
    FFS.updateAll(true);
    FFS.showToast(`Загружен пресет «${preset.name}»`);
  };

  function updateSaveModalHint() {
    const inp = $('preset-name-input');
    const hint = $('preset-save-hint');
    if (!inp || !hint) return;
    const val = inp.value.trim();
    const exists = val ? FFS.findPresetByName(val) : null;
    if (exists) {
      hint.textContent = `Пресет «${exists.name}» уже существует — текущие параметры перезапишут его.`;
      hint.classList.add('overwrite');
    } else {
      hint.textContent = 'Пресет сохранится локально в браузере (можно выгрузить в JSON).';
      hint.classList.remove('overwrite');
    }
  }

  FFS.openSavePresetModal = function () {
    const modal = $('preset-modal');
    const inp = $('preset-name-input');
    if (!modal || !inp) return;
    const cur = FFS.ui.activePresetId ? FFS.getPresetById(FFS.ui.activePresetId) : null;
    const S = FFS.state;
    inp.value = cur ? cur.name : `FFS ${S.B}×${S.A} (B1=${S.B1}, B2=${S.B2})`;
    updateSaveModalHint();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    setTimeout(() => { inp.focus(); inp.select(); }, 20);
  };

  FFS.closeSavePresetModal = function () {
    const modal = $('preset-modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  };

  FFS.confirmSavePreset = function () {
    const inp = $('preset-name-input');
    if (!inp) return;
    const name = inp.value.trim();
    if (!name) {
      inp.focus();
      return;
    }
    const res = FFS.saveCurrentAsPreset(name);
    if (!res) return;
    FFS.ui.activePresetId = res.preset.id;
    FFS.renderPresetSelect();
    FFS.closeSavePresetModal();
    if (!res.stored) {
      FFS.showToast(`Сохранено в сессии (localStorage недоступен — используйте Экспорт)`);
    } else {
      FFS.showToast(res.updated ? `Пресет «${res.preset.name}» обновлён` : `Пресет «${res.preset.name}» сохранён`);
    }
  };

  FFS.deleteSelectedPreset = function () {
    if (!FFS.ui.activePresetId) return;
    const cur = FFS.getPresetById(FFS.ui.activePresetId);
    if (!cur) return;
    if (!root.confirm(`Удалить пресет «${cur.name}»?`)) return;
    FFS.deletePresetById(cur.id);
    FFS.ui.activePresetId = '';
    FFS.renderPresetSelect();
    FFS.showToast(`Пресет «${cur.name}» удалён`);
  };

  FFS.exportPresetsJSON = function () {
    if (!FFS.savedPresets.length) {
      FFS.showToast('Нет сохранённых пресетов для экспорта');
      return;
    }
    const json = FFS.serializePresetsJSON();
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ffs-bag-presets.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    FFS.showToast(`Экспортировано пресетов: ${FFS.savedPresets.length}`);
  };

  FFS.triggerImportPresets = function () {
    const inp = $('in-import-presets');
    if (inp) {
      inp.value = '';
      inp.click();
    }
  };

  FFS.syncStateToInputs = function () {
    const S = FFS.state;
    $('in-A').value = FFS.formatNum(S.A);
    $('in-B').value = FFS.formatNum(S.B);
    $('in-autoB').checked = !!S.autoB;
    $('in-B').disabled = !!S.autoB;
    $('in-autoB4').checked = !!S.autoB4;
    $('in-B4').disabled = !!S.autoB4;
    $('in-B1').value = FFS.formatNum(S.B1);
    $('in-B2').value = FFS.formatNum(S.B2);
    $('in-B2tolM').value = FFS.formatNum(S.B2tolM);
    $('in-B2tolP').value = FFS.formatNum(S.B2tolP);
    $('in-B3').value = FFS.formatNum(S.B3);
    $('in-B4').value = FFS.formatNum(S.B4);
    $('in-T1').value = FFS.formatNum(S.T1);
    $('in-T2').value = FFS.formatNum(S.T2);
    $('in-t1InB3').checked = S.t1InB3;
    $('lbl-B3').textContent = S.t1InB3 ? `B3 (вкл. T1, чист. ${Math.max(0, S.B3 - S.T1)})` : 'B3 (Внешний клапан)';

    $('in-symMode').value = S.symMode;
    $('in-symMargin').value = FFS.formatNum(S.symMargin);
    $('in-zones').checked = S.showZones;
    $('in-mirror2d').checked = S.mirror2d;

    $('in-S1').checked = S.S1;
    $('in-S2').checked = S.S2;
    $('in-S3').checked = S.S3;
    $('in-S2off').value = FFS.formatNum(S.S2off);
    $('in-S3off').value = FFS.formatNum(S.S3off);

    $('in-embOn').checked = S.embOn;
    $('in-embW').value = FFS.formatNum(S.embW);
    $('in-embAlign').value = S.embAlign;
    for (let i = 0; i < 5; i++) $('in-E' + (i + 1)).value = S.E[i] == null ? '' : FFS.formatNum(S.E[i]);

    $('in-perfOn').checked = S.perfOn;
    $('in-perfW').value = FFS.formatNum(S.perfW);
    $('in-perfAlign').value = S.perfAlign || 'left';
    for (let i = 0; i < 4; i++) $('in-P' + (i + 1)).value = S.P[i] == null ? '' : FFS.formatNum(S.P[i]);

    $('in-cutExtOn').checked = S.cutExtOn;
    $('in-C1').value = FFS.formatNum(S.C1); $('in-D1').value = FFS.formatNum(S.D1); $('in-cutExtPat').value = S.cutExtPat;
    $('in-cutIntOn').checked = S.cutIntOn;
    $('in-C2').value = FFS.formatNum(S.C2); $('in-D2').value = FFS.formatNum(S.D2); $('in-cutIntPat').value = S.cutIntPat;
    $('in-fgOn').checked = S.fgOn;
    $('in-F').value = FFS.formatNum(S.F); $('in-G').value = FFS.formatNum(S.G);

    $('in-pmOn').checked = S.pmOn;
    $('in-pmW').value = FFS.formatNum(S.pmW); $('in-pmH').value = FFS.formatNum(S.pmH);
    $('in-pmX').value = FFS.formatNum(S.pmX); $('in-pmY').value = FFS.formatNum(S.pmY);
    $('in-pmColor').value = S.pmColor;

    $('in-scheme').value = S.scheme;

    $('in-transOn').checked = !!S.transOn;
    $('in-topSeal').value = FFS.formatNum(S.topSeal);
    $('in-botSeal').value = FFS.formatNum(S.botSeal);
    $('in-deadZone').value = FFS.formatNum(S.deadZone);

    $('in-omShow2D').checked = !!S.omShow2D;
    $('in-omShow3D').checked = !!S.omShow3D;
    $('in-omHideLabels3D').checked = !!S.omHideLabels3D;
    $('in-omOpacity2D').value = S.omOpacity2D;
    $('lbl-omOp2D').textContent = Math.round(S.omOpacity2D) + '%';
    $('in-omOpacity3D').value = S.omOpacity3D;
    $('lbl-omOp3D').textContent = Math.round(S.omOpacity3D) + '%';
    $('in-omFlipX').checked = !!S.omFlipX;
    $('in-omRot180').checked = !!S.omRot180;
    $('in-omCropL').value = FFS.formatNum(S.omCropL);
    $('in-omCropR').value = FFS.formatNum(S.omCropR);
    $('in-omCropT').value = FFS.formatNum(S.omCropT);
    $('in-omCropB').value = FFS.formatNum(S.omCropB);
  };

  function lastOrTemplate(key, min, max) {
    const last = FFS.state[key];
    const tmpl = FFS.DEFAULT_STATE[key];
    const base = Number.isFinite(last) ? last : tmpl;
    return clamp(base, min, max);
  }

  function readNum(id, key, min, max) {
    const raw = $(id).value.trim();
    if (raw === '') return lastOrTemplate(key, min, max);
    const v = FFS.parseLocaleNumber(raw);
    if (v === Infinity) return max;
    if (v === -Infinity) return min;
    return Number.isFinite(v) ? clamp(v, min, max) : lastOrTemplate(key, min, max);
  }

  function readSigned(id, key, sign, min, max) {
    const raw = $(id).value.trim();
    if (raw === '') return lastOrTemplate(key, min, max);
    const v = FFS.parseLocaleNumber(raw);
    if (!Number.isFinite(v) && v !== Infinity && v !== -Infinity) return lastOrTemplate(key, min, max);
    const signed = sign < 0 ? -Math.abs(v) : Math.abs(v);
    return clamp(signed, min, max);
  }

  function readOffset(id, key) {
    const raw = $(id).value.trim();
    if (raw === '') return lastOrTemplate(key, -1e9, 1e9);
    const v = FFS.parseLocaleNumber(raw);
    return Number.isFinite(v) ? v : lastOrTemplate(key, -1e9, 1e9);
  }

  function readOptNum(id) {
    const raw = $(id).value.trim();
    if (raw === '') return null;
    const v = FFS.parseLocaleNumber(raw);
    return Number.isFinite(v) ? Math.max(0, v) : null;
  }

  FFS.updateFoldUI = function () {
    const txt = Math.round(FFS.ui.foldPct) + '%';
    $('fold-label').textContent = txt;
    $('xz-pct').textContent = txt;
    $('in-fold').value = FFS.ui.foldPct;
  };

  FFS.updateBadgesAndSummary = function () {
    const S = FFS.state;
    const g = FFS.getGeom(S);
    const diff = Math.round((S.B - g.sumB) * 10) / 10;

    const bb = $('badge-balance');
    if (Math.abs(diff) < 0.5) {
      bb.className = 'pill pill-ok';
      bb.textContent = `✓ B: ${FFS.formatNum(S.B)} мм`;
    } else {
      bb.className = 'pill pill-err';
      bb.textContent = `⚠ Невязка B: ${diff > 0 ? '+' : ''}${diff} мм`;
    }

    const bBack = $('badge-back');
    const warn3d = $('warn-3d');
    const errs3d = [];

    if (S.B4 < 0) errs3d.push(`Не хватает ширины полотна B: расчётный B4 = ${FFS.formatNum(S.B4)} мм!`);
    if (S.B2 >= S.B1) errs3d.push(`Фальц B2 (${S.B2}) ≥ B1 (${S.B1}): самопересечение фальцев!`);
    if (g.backOverlap < -0.5) errs3d.push(`Тыл не смыкается: разрыв ${Math.abs(Math.round(g.backOverlap))} мм (B3+B4 < B1)!`);
    if (g.b3Net > S.B1) errs3d.push(`Внешний клапан B3 (${g.b3Net}) шире рукава B1 (${S.B1})!`);
    if (S.B4 > S.B1) errs3d.push(`Внутренний клапан B4 (${S.B4}) шире рукава B1 (${S.B1})!`);

    if (errs3d.length) {
      bBack.className = 'pill pill-err';
      bBack.textContent = S.B4 < 0 ? `⚠ B4 = ${FFS.formatNum(S.B4)} мм!` : (S.B2 >= S.B1 ? '⚠ B2 ≥ B1!' : (g.backOverlap < 0 ? `⚠ Разрыв тыла ${Math.abs(Math.round(g.backOverlap))} мм` : '⚠ Клапан > B1!'));
      warn3d.innerHTML = errs3d.join('<br>');
      warn3d.style.display = 'block';
    } else if (g.backOverlap > 0.5) {
      bBack.className = 'pill pill-info';
      bBack.textContent = `Канал S1–S3: +${Math.round(g.backOverlap)} мм`;
      warn3d.style.display = 'none';
    } else {
      bBack.className = 'pill pill-ok';
      bBack.textContent = '✓ Тыл и фальцы OK';
      warn3d.style.display = 'none';
    }

    const tl = FFS.evalPolytexTooling(S);
    const bt = $('badge-tooling');
    bt.className = 'pill ' + tl.cls;
    bt.textContent = tl.text;

    $('geo-summary').innerHTML =
      `Σ сегментов: <b>${FFS.formatNum(g.sumB)} мм</b> (B = ${FFS.formatNum(S.B)} мм)<br>` +
      `Ось лица B1: <b>${g.xCenter.toFixed(1)} мм</b> • B1: <b>[${g.s4}..${g.s5}]</b><br>` +
      `Клапаны: внеш. <b>${FFS.formatNum(g.b3Net)}</b>` + (S.t1InB3 ? ' (T1 в B3)' : '') + ` • внутр. B4: <b>${FFS.formatNum(S.B4)} мм</b>` + (S.autoB4 ? ' (авто)' : '') + '<br>' +
      `Шов S1: <b>${FFS.formatNum(g.seamS1)} мм</b>` +
      (g.backOverlap > 0.5 ? ` • Канал до S3 (${FFS.formatNum(g.seamS3)}): <b>${FFS.formatNum(g.backOverlap)} мм</b>` : '') + '<br>' +
      (S.transOn ? `Раб. высота A<sub>эфф</sub>: <b>${FFS.getTransverseGeom(S).effA} мм</b> (швы ${S.topSeal}/${S.botSeal}, м/з ±${S.deadZone})<br>` : '') +
      `Оснастка: <b>${tl.detail}</b>`;

    const symEl = $('sym-list');
    const checks = FFS.analyzeEmbossingAndPerf(S);
    if (!checks.length) {
      const idle = S.embOn || S.perfOn
        ? 'Координаты не заданы'
        : 'Нет активного тиснения / перфорации';
      symEl.innerHTML = `<div class="sym-row"><span class="sym-muted">${idle}</span></div>`;
    } else {
      symEl.innerHTML = checks.map(c =>
        `<div class="sym-row"><span>${c.label}</span><span class="sym-${c.status}">${c.text}</span></div>`
      ).join('');
    }

  };

  FFS.updateAll = function (reframeCamera) {
    FFS.updateBadgesAndSummary();
    if (typeof FFS.updateArtworkUI === 'function') FFS.updateArtworkUI();
    FFS.draw2D();
    FFS.update3DTexture();
    FFS.update3DGeometry();
    FFS.drawCrossSection();
    if (reframeCamera) FFS.reframe3D();
  };

  function bindInputs() {
    const onEdit = (isBlur, ev) => {
      const S = FFS.state;
      const prevMaxDim = Math.max(S.A, S.B);
      FFS.ui.symNote = '';

      const srcId = ev && ev.target ? ev.target.id : '';
      let autoB = $('in-autoB').checked;
      let autoB4 = $('in-autoB4').checked;
      if (srcId === 'in-autoB4' && autoB4) {
        autoB = false;
        $('in-autoB').checked = false;
      } else if (srcId === 'in-autoB' && autoB) {
        autoB4 = false;
        $('in-autoB4').checked = false;
      } else if (autoB && autoB4) {
        autoB = false;
        $('in-autoB').checked = false;
      }
      S.autoB = autoB;
      S.autoB4 = autoB4;
      $('in-B').disabled = S.autoB;
      $('in-B4').disabled = S.autoB4;

      S.A = readNum('in-A', 'A', 150, 2500);
      S.B1 = readNum('in-B1', 'B1', 80, 1500);
      S.B2 = readNum('in-B2', 'B2', 10, 600);
      S.B2tolM = readSigned('in-B2tolM', 'B2tolM', -1, -30, 0);
      S.B2tolP = readSigned('in-B2tolP', 'B2tolP', 1, 0, 30);
      S.t1InB3 = $('in-t1InB3').checked;
      S.T1 = readNum('in-T1', 'T1', 0, 150);
      S.T2 = readNum('in-T2', 'T2', 0, 150);
      S.B3 = readNum('in-B3', 'B3', S.t1InB3 ? S.T1 + 10 : 10, 1200);
      $('lbl-B3').textContent = S.t1InB3 ? `B3 (вкл. T1, чист. ${Math.max(0, S.B3 - S.T1)})` : 'B3 (Внешний клапан)';

      if (S.autoB4) {
        S.B = readNum('in-B', 'B', 200, 3000);
        S.B4 = FFS.calcAutoB4(S);
        $('in-B4').value = FFS.formatNum(S.B4);
      } else if (S.autoB) {
        S.B4 = readNum('in-B4', 'B4', 0, 1200);
        S.B = FFS.getGeom(S).sumB;
        $('in-B').value = FFS.formatNum(S.B);
      } else {
        S.B = readNum('in-B', 'B', 200, 3000);
        S.B4 = readNum('in-B4', 'B4', 0, 1200);
      }

      S.symMode = $('in-symMode').value;
      S.symMargin = readNum('in-symMargin', 'symMargin', 0, 200);
      S.showZones = $('in-zones').checked;
      S.mirror2d = $('in-mirror2d').checked;

      S.S1 = $('in-S1').checked;
      S.S2 = $('in-S2').checked;
      S.S3 = $('in-S3').checked;
      S.S2off = readOffset('in-S2off', 'S2off');
      S.S3off = readOffset('in-S3off', 'S3off');

      S.embOn = $('in-embOn').checked;
      S.embW = readNum('in-embW', 'embW', 5, 200);
      S.embAlign = $('in-embAlign').value;
      for (let i = 0; i < 5; i++) S.E[i] = readOptNum('in-E' + (i + 1));

      S.perfOn = $('in-perfOn').checked;
      S.perfW = readNum('in-perfW', 'perfW', 5, 200);
      S.perfAlign = $('in-perfAlign').value;
      for (let i = 0; i < 4; i++) S.P[i] = readOptNum('in-P' + (i + 1));

      S.cutExtOn = $('in-cutExtOn').checked;
      S.C1 = readNum('in-C1', 'C1', 0, S.B); S.D1 = readNum('in-D1', 'D1', 0, S.A);
      S.cutExtPat = $('in-cutExtPat').value;
      S.cutIntOn = $('in-cutIntOn').checked;
      S.C2 = readNum('in-C2', 'C2', 0, S.B); S.D2 = readNum('in-D2', 'D2', 0, S.A);
      S.cutIntPat = $('in-cutIntPat').value;
      S.fgOn = $('in-fgOn').checked;
      S.F = readNum('in-F', 'F', 0, S.B); S.G = readNum('in-G', 'G', 0, S.A);

      S.pmOn = $('in-pmOn').checked;
      S.pmW = readNum('in-pmW', 'pmW', 2, 150); S.pmH = readNum('in-pmH', 'pmH', 2, 150);
      S.pmX = readNum('in-pmX', 'pmX', 0, S.B); S.pmY = readNum('in-pmY', 'pmY', 0, S.A);
      S.pmColor = $('in-pmColor').value;

      S.scheme = $('in-scheme').value;

      S.transOn = $('in-transOn').checked;
      S.topSeal = readNum('in-topSeal', 'topSeal', 0, 150);
      S.botSeal = readNum('in-botSeal', 'botSeal', 0, 150);
      S.deadZone = readNum('in-deadZone', 'deadZone', 0, 100);

      S.omShow2D = $('in-omShow2D').checked;
      S.omShow3D = $('in-omShow3D').checked;
      S.omHideLabels3D = $('in-omHideLabels3D').checked;
      S.omOpacity2D = readNum('in-omOpacity2D', 'omOpacity2D', 0, 100);
      $('lbl-omOp2D').textContent = Math.round(S.omOpacity2D) + '%';
      S.omOpacity3D = readNum('in-omOpacity3D', 'omOpacity3D', 0, 100);
      $('lbl-omOp3D').textContent = Math.round(S.omOpacity3D) + '%';
      S.omFlipX = $('in-omFlipX').checked;
      S.omRot180 = $('in-omRot180').checked;
      S.omCropL = readNum('in-omCropL', 'omCropL', 0, 49);
      S.omCropR = readNum('in-omCropR', 'omCropR', 0, 49);
      S.omCropT = readNum('in-omCropT', 'omCropT', 0, 49);
      S.omCropB = readNum('in-omCropB', 'omCropB', 0, 49);
      const cropLR = FFS.normalizeCropPair(S.omCropL, S.omCropR);
      const cropTB = FFS.normalizeCropPair(S.omCropT, S.omCropB);
      S.omCropL = cropLR[0]; S.omCropR = cropLR[1];
      S.omCropT = cropTB[0]; S.omCropB = cropTB[1];

      if (isBlur) FFS.syncStateToInputs();
      const scaleChanged = Math.abs(Math.max(S.A, S.B) - prevMaxDim) > 40;
      FFS.updateAll(scaleChanged);
    };

    document.querySelectorAll('aside input:not([type="file"]), aside select, #in-zones, #in-mirror2d').forEach(el => {
      el.addEventListener('input', ev => onEdit(false, ev));
      el.addEventListener('change', ev => onEdit(true, ev));
      el.addEventListener('blur', ev => onEdit(true, ev));
    });

    $('in-fold').addEventListener('input', e => {
      FFS.ui.isPlaying = false;
      FFS.ui.foldTarget = null;
      $('btn-play').textContent = '▶';
      FFS.ui.foldPct = parseFloat(e.target.value);
      FFS.updateFoldUI();
      FFS.update3DGeometry();
      FFS.drawCrossSection();
    });

    $('in-xray').addEventListener('change', e => {
      FFS.setXray(e.target.checked);
    });

    $('preset-select').addEventListener('change', e => {
      FFS.applySavedPreset(e.target.value);
    });

    const modal = $('preset-modal');
    const nameInp = $('preset-name-input');
    nameInp.addEventListener('input', updateSaveModalHint);
    nameInp.addEventListener('keydown', e => {
      if (e.key === 'Enter') FFS.confirmSavePreset();
      if (e.key === 'Escape') FFS.closeSavePresetModal();
    });
    modal.addEventListener('mousedown', e => {
      if (e.target === modal) FFS.closeSavePresetModal();
    });

    $('in-import-presets').addEventListener('change', e => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const { added, updated } = FFS.importPresetsFromJSON(String(reader.result || ''));
          FFS.renderPresetSelect();
          if (added + updated === 0) {
            FFS.showToast('В файле не найдено подходящих пресетов');
          } else {
            FFS.showToast(`Импорт: добавлено ${added}, обновлено ${updated}`);
          }
        } catch (err) {
          FFS.showToast('Ошибка чтения JSON-файла пресетов');
        }
      };
      reader.readAsText(file, 'utf-8');
    });
  }

  function initSplitter() {
    const splitter = $('splitter');
    const ws = $('workspace');
    const p2 = $('pane-2d');
    let active = false;

    splitter.addEventListener('mousedown', e => {
      e.preventDefault();
      active = true;
      splitter.classList.add('dragging');
    });
    window.addEventListener('mousemove', e => {
      if (!active) return;
      const rect = ws.getBoundingClientRect();
      p2.style.width = clamp(((e.clientX - rect.left) / rect.width) * 100, 22, 78) + '%';
      FFS.resize2D();
      FFS.resize3D();
    });
    window.addEventListener('mouseup', () => {
      if (!active) return;
      active = false;
      splitter.classList.remove('dragging');
    });

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => { FFS.resize2D(); FFS.resize3D(); });
      ro.observe($('wrap-2d'));
      ro.observe($('wrap-3d'));
    } else {
      window.addEventListener('resize', () => { FFS.resize2D(); FFS.resize3D(); });
    }
  }

  // Boot sequence
  FFS.init2DInteraction();
  FFS.initArtworkEvents();
  bindInputs();
  initSplitter();
  FFS.loadDefaultTemplate();
  FFS.updateFoldUI();
  FFS.loadThree(() => {
    FFS.init3D();
    FFS.resize3D();
    FFS.updateAll(true);
  });
  setTimeout(() => { FFS.resize2D(); FFS.resize3D(); }, 50);
})(window);
