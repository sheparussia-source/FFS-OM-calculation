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
      if (typeof raw[k] === 'number' && Number.isFinite(raw[k])) base[k] = raw[k];
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

    if (Array.isArray(raw.E)) {
      base.E = [0, 1, 2, 3, 4].map(i => (typeof raw.E[i] === 'number' && Number.isFinite(raw.E[i]) && raw.E[i] >= 0) ? raw.E[i] : null);
    }
    if (Array.isArray(raw.P)) {
      base.P = [0, 1, 2, 3].map(i => (typeof raw.P[i] === 'number' && Number.isFinite(raw.P[i]) && raw.P[i] >= 0) ? raw.P[i] : null);
    }
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
