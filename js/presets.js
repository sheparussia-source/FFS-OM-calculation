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

  FFS.$ = function (id) { return document.getElementById(id); };
  FFS.clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  FFS.smoothstep = function (e0, e1, x) {
    const t = FFS.clamp((x - e0) / (e1 - e0), 0, 1);
    return t * t * (3 - 2 * t);
  };

  FFS.PRESETS = {
    tk03343: {
      A: 780, B: 1220, autoB: true, B1: 390, B2: 200, B2tolM: -6, B2tolP: 6, B3: 195, B4: 195, T1: 8, T2: 32, t1InB3: false,
      S1: true, S2: false, S3: false, S2off: 12, S3off: 0,
      symMode: 'face_back', symMargin: 15, showZones: true, mirror2d: false,
      embOn: true, embW: 62, embAlign: 'left', E: [30, 405, 695, 1070, null],
      perfOn: false, perfW: 30, P: [null, null, null, null],
      cutExtOn: false, C1: 60, D1: 80, cutExtPat: '3x6',
      cutIntOn: false, C2: 1120, D2: 360, cutIntPat: '3x6',
      fgOn: false, F: 1185, G: 260,
      pmOn: false, pmW: 50, pmH: 15, pmX: 60, pmY: 25, pmColor: '#000000',
      scheme: 'A1'
    },
    rl1: {
      A: 720, B: 940, autoB: true, B1: 350, B2: 100, B2tolM: -6, B2tolP: 6, B3: 175, B4: 175, T1: 8, T2: 32, t1InB3: false,
      S1: true, S2: false, S3: false, S2off: 12, S3off: 0,
      symMode: 'off', symMargin: 15, showZones: true, mirror2d: false,
      embOn: false, embW: 62, embAlign: 'left', E: [null, null, null, null, null],
      perfOn: false, perfW: 25, P: [null, null, null, null],
      cutExtOn: false, C1: 50, D1: 80, cutExtPat: '3x6',
      cutIntOn: false, C2: 860, D2: 300, cutIntPat: '3x6',
      fgOn: false, F: 905, G: 220,
      pmOn: true, pmW: 50, pmH: 15, pmX: 60, pmY: 20, pmColor: '#000000',
      scheme: 'A1'
    },
    rl2: {
      A: 650, B: 770, autoB: true, B1: 245, B2: 85, B2tolM: -6, B2tolP: 6, B3: 183, B4: 140, T1: 8, T2: 32, t1InB3: true,
      S1: true, S2: false, S3: true, S2off: 35, S3off: 0,
      symMode: 'face_channel', symMargin: 30, showZones: true, mirror2d: false,
      embOn: true, embW: 60, embAlign: 'left', E: [30, 298, 423, 673, null],
      perfOn: false, perfW: 25, P: [null, null, null, null],
      cutExtOn: false, C1: 50, D1: 70, cutExtPat: '3x6',
      cutIntOn: true, C2: 693, D2: 252, cutIntPat: '3x6',
      fgOn: false, F: 735, G: 200,
      pmOn: true, pmW: 20, pmH: 40, pmX: 45, pmY: 25, pmColor: '#000000',
      scheme: 'A2'
    },
    m10401: {
      A: 630, B: 790, autoB: true, B1: 250, B2: 90, B2tolM: -6, B2tolP: 6, B3: 183, B4: 145, T1: 8, T2: 32, t1InB3: true,
      S1: true, S2: false, S3: true, S2off: 35, S3off: 0,
      symMode: 'face_channel', symMargin: 30, showZones: true, mirror2d: true,
      embOn: true, embW: 60, embAlign: 'left', E: [30, 303, 433, 693, null],
      perfOn: false, perfW: 25, P: [null, null, null, null],
      cutExtOn: false, C1: 50, D1: 70, cutExtPat: '3x6',
      cutIntOn: true, C2: 713, D2: 252, cutIntPat: '3x6',
      fgOn: false, F: 740, G: 200,
      pmOn: true, pmW: 40, pmH: 20, pmX: 483, pmY: 50, pmColor: '#000000',
      scheme: 'A2'
    }
  };

  FFS.state = JSON.parse(JSON.stringify(FFS.PRESETS.tk03343));
  FFS.ui = {
    foldPct: 65,
    isPlaying: false,
    playDir: 1,
    foldTarget: null,
    xrayOn: false,
    symNote: ''
  };
})(window);
