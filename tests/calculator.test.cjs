const { test } = require('node:test');
const assert = require('node:assert/strict');

global.window = {};
require('../js/presets.js');
require('../js/geometry.js');
const F = window.FFS;
function order(values = {}) {
  return F.sanitizeState({ ...F.cloneDefaultState(), ...values });
}

test('validate complete locale numbers', () => {
  for (const raw of ['1 234,5', '1,234.5', '1.234,5']) assert.equal(F.parseLocaleNumber(raw), 1234.5);
  for (const raw of ['850/900', '750,5,9', '45x', '1 2']) assert.ok(Number.isNaN(F.parseLocaleNumber(raw)));
});

test('the active seams define the channel independently of the flap overlap', () => {
  const s = order({ B: 940, S3: true, S3off: 10, embOn: true, E: [875], embW: 15 });
  const g = F.getGeom(s);
  assert.equal(g.backOverlap, 60);
  assert.deepEqual(g.channel, { left: 848, right: 858, width: 10 });
  assert.ok(!F.analyzeEmbossingAndPerf(s).some(r => r.label.includes('Канал')));
  assert.equal(F.getGeom({ ...s, S3off: -10 }).channel.left, 838);
  assert.equal(F.getGeom({ ...s, S3: false }).channel, null);
  const invalid = F.getGeom({ ...s, S3off: 120, S2: true, S2off: 150 });
  assert.equal(invalid.seamErrors.length, 2);
  assert.equal(invalid.channel, null);
});

test('check the whole tool width against the appropriate flap', () => {
  const s = order({ cutExtOn: true, cutIntOn: true, fgOn: true, C1: 428, C2: 428, F: 428 });
  const flapErrors = v => F.analyzeEmbossingAndPerf(v).filter(r => r.text.includes('границу клапана'));
  assert.equal(flapErrors(s).length, 3);
  assert.equal(flapErrors({ ...s, C1: 100, C2: 780, F: 740 }).length, 0);
  assert.equal(flapErrors({ ...s, C1: 157, C2: 780, F: 740 }).length, 1);
});

test('perforation overlaps, optional gusset permission, E5 and out-of-range coordinates', () => {
  F.state = order({ perfOn: true, P: [415.5, 415.5], E: [950, null, null, null, 450] });
  assert.equal(F.state.E[0], 950);
  assert.ok(F.analyzeEmbossingAndPerf(F.state).some(r => r.text.includes('Перекрытие 25')));
  F.autoFixSymmetry('gusset');
  assert.equal(F.state.E[4], 450);
  for (const allow of [false, true]) {
    F.state = order({ perfAllowGusset: allow });
    F.autoFixPerfSymmetry();
    assert.ok(!F.analyzeEmbossingAndPerf(F.state).some(r => r.status === 'err'));
    assert.equal(F.state.P[0] < F.getGeom(F.state).s4, allow);
  }
  F.state = order({ perfOn: true, P: [415.5], perfW: 25 });
  F.autoFixPerfSymmetry();
  assert.equal(F.state.P[1], null);
  assert.match(F.ui.symNote, /нет свободного/);
});

test('60,000 reproducible orders retain balance, effective height and finite profiles', () => {
  let seed = 20261126;
  function size(min, max) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return Math.round((min + (max - min) * seed / 2 ** 32) * 10) / 10;
  }
  for (let i = 0; i < 60000; i++) {
    const t1InB3 = i % 2 === 0;
    const T1 = size(0, 150);
    const s = order({ A: size(150, 2500), B: size(200, 3000), B1: size(80, 1500), B2: size(10, 600),
      T1, T2: size(0, 150), t1InB3, B3: size(t1InB3 ? T1 + 10 : 10, 1200), B4: size(0, 1200),
      autoB: i % 3 === 0, autoB4: i % 3 === 1, transOn: true,
      topSeal: size(0, 150), botSeal: size(0, 150), deadZone: size(0, 100) });
    const fixed = s.B3 + (t1InB3 ? 0 : T1) + 2 * s.B2 + s.B1 + s.T2;
    const g = F.getGeom(s);
    if (s.autoB || s.autoB4) assert.ok(Math.abs(s.B - fixed - s.B4) < 1e-7);
    assert.ok(Math.abs(F.getTransverseGeom(s).effA - Math.max(0, s.A - s.topSeal - s.botSeal - 2 * s.deadZone)) < 1e-7);
    for (const fold of [0, 0.24, 0.34, 0.5, 0.75, 1]) {
      for (const x of [0, g.s2, g.s4 - s.B2 / 2, g.s4, g.s5, g.s7, g.s8, s.B]) {
        const point = F.evalProfile(x, fold, s, g);
        assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z));
        if (!fold) assert.ok(Math.abs(point.x - x + g.xCenter) < 1e-7 && point.z === 0);
      }
    }
  }
});

test('the outer 8 mm lip covers the 32 mm lip throughout the final folding stage', () => {
  const s = order(), g = F.getGeom(s);
  for (const f of [0.50, 0.65, 0.75, 1]) {
    for (const left of [0, 4, 8]) {
      const outer = F.evalProfile(left, f, s, g);
      const inner = F.evalProfile(g.seamS1 - s.T1 + left, f, s, g);
      assert.ok(Math.abs(outer.x - inner.x) < 1e-7);
      assert.ok(outer.z < inner.z);
    }
  }
});

test('1020 and 1030 mm webs fold without crossing at every quarter percent', () => {
  for (const B of [880, 1020, 1030]) {
    const s = order({ B }), g = F.getGeom(s);
    for (let i = 0; i <= 400; i++) assert.equal(F.profileIntersection(s, g, i / 400), null);
  }
  const s = order({ autoB4: false, autoB: true, B1: 373, B2: 269, B3: 41, B4: 368, T1: 124, T2: 11 });
  assert.ok(F.profileIntersection(s, F.getGeom(s), 1));
});
