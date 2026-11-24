(function (root) {
  'use strict';

  // Polyfill CanvasRenderingContext2D.roundRect for older factory PC browsers
  if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      const rad = Math.min(Array.isArray(r) ? r[0] : (r || 0), w / 2, h / 2);
      this.moveTo(x + rad, y);
      this.arcTo(x + w, y, x + w, y + h, rad);
      this.arcTo(x + w, y + h, x, y + h, rad);
      this.arcTo(x, y + h, x, y, rad);
      this.arcTo(x, y, x + w, y, rad);
      this.closePath();
      return this;
    };
  }

  const FFS = root.FFS = root.FFS || {};
  const STORAGE_KEY = 'ffs_bag_cad_user_presets_v1';

  FFS.$ = function (id) { return document.getElementById(id); };
  FFS.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  // Запятая и точка - десятичные разделители. Пробел между разрядами снимается.
  FFS.parseLocaleNumber = function (raw) {
    if (typeof raw === 'number') return raw;
    if (raw == null) return NaN;
    let s = String(raw).trim();
    if (!s) return NaN;
    s = s.replace(/\s+/g, '');
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (lastComma !== -1) {
      s = s.replace(',', '.');
    }
    const m = s.match(/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/);
    if (!m) return NaN;
    return Number(m[0]);
  };

  FFS.formatNum = function (n) {
    if (!Number.isFinite(n)) return '';
    return String(Math.round(n * 10000) / 10000);
  };

  FFS.normalizeCropPair = function (a, b) {
    let x = FFS.clamp(FFS.parseLocaleNumber(a), 0, 49);
    let y = FFS.clamp(FFS.parseLocaleNumber(b), 0, 49);
    if (!Number.isFinite(x)) x = 0;
    if (!Number.isFinite(y)) y = 0;
    if (x + y > 92) {
      const k = 92 / (x + y);
      x = Math.round(x * k * 10) / 10;
      y = Math.round(y * k * 10) / 10;
      if (x + y > 92) {
        const over = Math.round((x + y - 92) * 10) / 10;
        if (x >= y) x = Math.round((x - over) * 10) / 10;
        else y = Math.round((y - over) * 10) / 10;
      }
    }
    return [x, y];
  };

  FFS.NUM_RANGES = {
    A: [150, 2500], B: [200, 3000], B1: [80, 1500], B2: [10, 600],
    B3: [10, 1200], B4: [0, 1200], T1: [0, 150], T2: [0, 150],
    symMargin: [0, 200], embW: [5, 200], perfW: [5, 200],
    topSeal: [0, 150], botSeal: [0, 150], deadZone: [0, 100],
    pmW: [2, 150], pmH: [2, 150],
    omOpacity2D: [0, 100], omOpacity3D: [0, 100],
    omCropL: [0, 49], omCropR: [0, 49], omCropT: [0, 49], omCropB: [0, 49]
  };
  FFS.smoothstep = function (e0, e1, x) {
    const t = FFS.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Neutral starting geometry (no hardcoded client/TK/RL presets)
  FFS.DEFAULT_STATE = {
    A: 700, B: 880, autoB: false, autoB4: true, B1: 300, B2: 120, B2tolM: -6, B2tolP: 6,
    B3: 150, B4: 150, T1: 8, T2: 32, t1InB3: false,
    S1: true, S2: false, S3: false, S2off: 12, S3off: 0,
    symMode: 'face_back', symMargin: 15, showZones: true, mirror2d: false,
    embOn: false, embW: 62, embAlign: 'left', E: [null, null, null, null, null],
    perfOn: false, perfW: 25, perfAlign: 'left', P: [null, null, null, null],
    cutExtOn: false, C1: 50, D1: 80, cutExtPat: '3x6',
    cutIntOn: false, C2: 750, D2: 250, cutIntPat: '3x6',
    fgOn: false, F: 820, G: 200,
    pmOn: false, pmW: 40, pmH: 15, pmX: 50, pmY: 25, pmColor: '#000000',
    scheme: 'A1',
    transOn: false, topSeal: 20, botSeal: 20, deadZone: 10,
    omShow2D: true, omShow3D: true, omHideLabels3D: true,
    omOpacity2D: 55, omOpacity3D: 100, omFlipX: false, omRot180: false,
    omCropL: 0, omCropR: 0, omCropT: 0, omCropB: 0
  };

  FFS.cloneDefaultState = function () {
    return JSON.parse(JSON.stringify(FFS.DEFAULT_STATE));
  };

  FFS.sanitizeState = function (raw) {
    const base = FFS.cloneDefaultState();
    if (!raw || typeof raw !== 'object') return base;

    const numKeys = ['A', 'B', 'B1', 'B2', 'B2tolM', 'B2tolP', 'B3', 'B4', 'T1', 'T2',
      'S2off', 'S3off', 'symMargin', 'embW', 'perfW', 'C1', 'D1', 'C2', 'D2', 'F', 'G',
      'pmW', 'pmH', 'pmX', 'pmY', 'topSeal', 'botSeal', 'deadZone',
      'omOpacity2D', 'omOpacity3D', 'omCropL', 'omCropR', 'omCropT', 'omCropB'];
    const boolKeys = ['autoB', 'autoB4', 't1InB3', 'S1', 'S2', 'S3', 'showZones', 'mirror2d',
      'embOn', 'perfOn', 'cutExtOn', 'cutIntOn', 'fgOn', 'pmOn',
      'transOn', 'omShow2D', 'omShow3D', 'omHideLabels3D', 'omFlipX', 'omRot180'];
    const strKeys = ['symMode', 'embAlign', 'perfAlign', 'cutExtPat', 'cutIntPat', 'pmColor', 'scheme'];

    numKeys.forEach(k => {
      const n = FFS.parseLocaleNumber(raw[k]);
      if (!Number.isFinite(n) && n !== Infinity && n !== -Infinity) return;
      if (k === 'B2tolM') base[k] = FFS.clamp(-Math.abs(n), -30, 0);
      else if (k === 'B2tolP') base[k] = FFS.clamp(Math.abs(n), 0, 30);
      else if (FFS.NUM_RANGES[k]) {
        const [lo, hi] = FFS.NUM_RANGES[k];
        base[k] = FFS.clamp(n, lo, hi);
      } else if (Number.isFinite(n)) base[k] = n;
    });
    boolKeys.forEach(k => {
      if (typeof raw[k] === 'boolean') base[k] = raw[k];
    });
    strKeys.forEach(k => {
      if (typeof raw[k] === 'string' && raw[k].length) base[k] = raw[k];
    });

    if (typeof raw.autoB4 !== 'boolean') {
      base.autoB4 = !base.autoB;
    }
    if (base.autoB4 && base.autoB) {
      base.autoB = false;
    }
    if (!['face_back', 'off'].includes(base.symMode)) base.symMode = 'face_back';
    if (!['left', 'center'].includes(base.embAlign)) base.embAlign = 'left';
    if (!['left', 'center'].includes(base.perfAlign)) base.perfAlign = 'left';
    if (!['A1', 'A2'].includes(base.scheme)) base.scheme = 'A1';

    const optNum = v => {
      const n = FFS.parseLocaleNumber(v);
      return Number.isFinite(n) ? Math.max(0, n) : null;
    };
    if (Array.isArray(raw.E)) {
      base.E = [0, 1, 2, 3, 4].map(i => optNum(raw.E[i]));
    }
    if (Array.isArray(raw.P)) {
      base.P = [0, 1, 2, 3].map(i => optNum(raw.P[i]));
    }

    const b3min = base.t1InB3 ? base.T1 + 10 : 10;
    base.B3 = FFS.clamp(base.B3, b3min, 1200);
    if (typeof FFS.finalizeAutoBalance === 'function') FFS.finalizeAutoBalance(base);
    ['C1', 'C2', 'F', 'pmX'].forEach(k => { base[k] = FFS.clamp(base[k], 0, base.B); });
    ['D1', 'D2', 'G', 'pmY'].forEach(k => { base[k] = FFS.clamp(base[k], 0, base.A); });
    base.E = base.E.map(v => (v === null ? null : FFS.clamp(v, 0, base.B)));
    base.P = base.P.map(v => (v === null ? null : FFS.clamp(v, 0, base.B)));
    const lr = FFS.normalizeCropPair(base.omCropL, base.omCropR);
    const tb = FFS.normalizeCropPair(base.omCropT, base.omCropB);
    base.omCropL = lr[0]; base.omCropR = lr[1];
    base.omCropT = tb[0]; base.omCropB = tb[1];
    return base;
  };

  FFS.loadSavedPresets = function () {
    try {
      const raw = root.localStorage ? root.localStorage.getItem(STORAGE_KEY) : null;
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(item => item && typeof item.name === 'string' && item.name.trim())
        .map(item => ({
          id: String(item.id || ('p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7))),
          name: item.name.trim().slice(0, 80),
          updatedAt: item.updatedAt || new Date().toISOString(),
          data: FFS.sanitizeState(item.data)
        }));
    } catch (e) {
      return [];
    }
  };

  FFS.persistSavedPresets = function (list) {
    try {
      if (!root.localStorage) return false;
      root.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  };

  FFS.savedPresets = FFS.loadSavedPresets();

  FFS.getPresetById = function (id) {
    return FFS.savedPresets.find(p => p.id === id) || null;
  };

  FFS.findPresetByName = function (name) {
    const norm = String(name || '').trim().toLowerCase();
    if (!norm) return null;
    return FFS.savedPresets.find(p => p.name.toLowerCase() === norm) || null;
  };

  FFS.saveCurrentAsPreset = function (name) {
    const clean = String(name || '').trim().slice(0, 80);
    if (!clean) return null;

    const snapshot = FFS.sanitizeState(FFS.state);
    const existing = FFS.findPresetByName(clean);
    let updated = false;
    let target;

    if (existing) {
      existing.name = clean;
      existing.data = snapshot;
      existing.updatedAt = new Date().toISOString();
      target = existing;
      updated = true;
    } else {
      target = {
        id: 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
        name: clean,
        updatedAt: new Date().toISOString(),
        data: snapshot
      };
      FFS.savedPresets.push(target);
    }

    const stored = FFS.persistSavedPresets(FFS.savedPresets);
    return { preset: target, updated, stored };
  };

  FFS.deletePresetById = function (id) {
    const idx = FFS.savedPresets.findIndex(p => p.id === id);
    if (idx === -1) return null;
    const removed = FFS.savedPresets.splice(idx, 1)[0];
    FFS.persistSavedPresets(FFS.savedPresets);
    return removed;
  };

  FFS.serializePresetsJSON = function () {
    return JSON.stringify({
      app: 'FFS Bag CAD',
      version: 1,
      exportedAt: new Date().toISOString(),
      presets: FFS.savedPresets
    }, null, 2);
  };

  FFS.importPresetsFromJSON = function (jsonText) {
    const parsed = JSON.parse(jsonText);
    let incoming = [];
    if (Array.isArray(parsed)) incoming = parsed;
    else if (parsed && Array.isArray(parsed.presets)) incoming = parsed.presets;
    else if (parsed && typeof parsed.name === 'string' && parsed.data) incoming = [parsed];
    else throw new Error('Неверный формат JSON');

    let added = 0;
    let updated = 0;
    incoming.forEach(item => {
      if (!item || typeof item.name !== 'string' || !item.name.trim()) return;
      const cleanName = item.name.trim().slice(0, 80);
      const data = FFS.sanitizeState(item.data || item);
      const existing = FFS.findPresetByName(cleanName);
      if (existing) {
        existing.data = data;
        existing.updatedAt = item.updatedAt || new Date().toISOString();
        updated++;
      } else {
        FFS.savedPresets.push({
          id: 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
          name: cleanName,
          updatedAt: item.updatedAt || new Date().toISOString(),
          data
        });
        added++;
      }
    });

    FFS.persistSavedPresets(FFS.savedPresets);
    return { added, updated };
  };

  FFS.state = FFS.cloneDefaultState();
  FFS.ui = {
    foldPct: 65,
    isPlaying: false,
    playDir: 1,
    foldTarget: null,
    xrayOn: false,
    symNote: '',
    activePresetId: ''
  };
  FFS.artwork = {
    img: null,
    fileName: '',
    naturalW: 0,
    naturalH: 0
  };
})(window);
