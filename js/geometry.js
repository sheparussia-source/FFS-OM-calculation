(function (root) {
  'use strict';

  const FFS = root.FFS;
  const clamp = FFS.clamp;
  const smoothstep = FFS.smoothstep;

  FFS.getGeom = function (S) {
    const st = S || FFS.state;
    const s1L = st.T1;
    const b3Net = st.t1InB3 ? Math.max(0, st.B3 - st.T1) : st.B3;
    const s2 = s1L + b3Net;            // B3 | B2L
    const s4 = s2 + st.B2;             // B2L | B1
    const s5 = s4 + st.B1;             // B1 | B2R
    const s7 = s5 + st.B2;             // B2R | B4
    const s8 = s7 + st.B4;             // B4 | T2
    const sumB = s8 + st.T2;
    const xCenter = s4 + st.B1 / 2;
    const halfPerim = st.B1 + st.B2;
    const backOverlap = b3Net + st.B4 - st.B1;
    const seamS1 = s1L + 2 * st.B1 + 2 * st.B2;
    const seamS3 = (st.S3off === 0 && backOverlap > 0) ? s8 : (seamS1 + st.S3off);
    const seamS2 = seamS1 + st.S2off;
    return { sumB, s1L, b3Net, s2, s4, s5, s7, s8, xCenter, halfPerim, backOverlap, seamS1, seamS2, seamS3 };
  };

  FFS.getStripBounds = function (val, w, align) {
    const left = align === 'center' ? val - w / 2 : val;
    return { left, right: left + w, center: left + w / 2 };
  };

  FFS.parseMatrix = function (str) {
    const m = String(str || '3x6').match(/(\d+)\s*[xх×*]\s*(\d+)/i);
    if (!m) return { cols: 3, rows: 6 };
    return { cols: clamp(+m[1], 1, 10), rows: clamp(+m[2], 1, 20) };
  };

  FFS.evalPolytexTooling = function (S) {
    const st = S || FFS.state;
    const b2Max = st.B2 + Math.max(0, st.B2tolP);
    if (st.B1 >= 210 && st.B1 <= 289 && b2Max <= 120) {
      return { cls: 'pill-info', text: 'POLYTEX: Small', detail: `Small (B1≥210, B2≤120; факт B2+доп=${b2Max} мм)` };
    }
    if (st.B1 >= 260 && st.B1 <= 289 && st.B2 <= 200) {
      const warn = b2Max > 200 ? `, B2+доп=${b2Max}!` : '';
      return { cls: 'pill-warn', text: `POLYTEX: Med (пред.${warn})`, detail: `Предел Medium (B1 260..289 мм, B2+доп=${b2Max} мм)` };
    }
    if (st.B1 >= 290 && st.B2 <= 200) {
      if (b2Max > 200) {
        return { cls: 'pill-warn', text: `POLYTEX: Med (B2+доп=${b2Max}!)`, detail: `Medium (B2 ном. ≤200, но с допуском ${b2Max} > 200 мм)` };
      }
      return { cls: 'pill-info', text: 'POLYTEX: Medium', detail: `Medium (B1≥290, B2≤200; факт B2+доп=${b2Max} мм)` };
    }
    if (st.B1 >= 190 && st.B1 < 210 && b2Max <= 120) {
      return { cls: 'pill-warn', text: 'POLYTEX: Small (пред.)', detail: `Предел оснастки Small (190..210 мм)` };
    }
    return { cls: 'pill-warn', text: 'POLYTEX: Вне S/M', detail: `Не попадает в Small/Medium (нужна Large / проверка оснастки)` };
  };

  FFS.analyzeEmbossingAndPerf = function (S) {
    const st = S || FFS.state;
    const g = FFS.getGeom(st);
    const rows = [];
    const tol = Math.max(Math.abs(st.B2tolM), Math.abs(st.B2tolP));

    if (FFS.ui.symNote) {
      rows.push({ label: 'Автоподбор', status: 'warn', text: FFS.ui.symNote });
    }

    if (st.embOn) {
      const active = st.E
        .map((v, i) => ({ v, i, b: v !== null ? FFS.getStripBounds(v, st.embW, st.embAlign) : null }))
        .filter(o => o.v !== null)
        .sort((a, b) => a.b.left - b.b.left);

      // Pairwise overlap check between embossing bands
      for (let k = 0; k < active.length - 1; k++) {
        if (active[k].b.right > active[k + 1].b.left + 0.1) {
          rows.push({
            label: `E${active[k].i + 1} ↔ E${active[k + 1].i + 1}`,
            status: 'err',
            text: `Перекрытие ${Math.round(active[k].b.right - active[k + 1].b.left)} мм!`
          });
        }
      }

      if (st.symMode === 'face_back') {
        const n = active.length;
        for (let k = 0; k < Math.floor(n / 2); k++) {
          const a = active[k], b = active[n - 1 - k];
          const delta = Math.round(((b.b.center - g.xCenter) - (g.xCenter - a.b.center)) * 10) / 10;
          rows.push({
            label: `Ось B1: E${a.i + 1}↔E${b.i + 1}`,
            status: Math.abs(delta) <= 2 ? 'ok' : 'err',
            text: Math.abs(delta) <= 2 ? '✓ OK' : `Δ ${delta > 0 ? '+' : ''}${delta} мм`
          });
        }
        if (n === 4) {
          const d13 = Math.round(((active[2].b.left - active[0].b.left) - g.halfPerim) * 10) / 10;
          const d24 = Math.round(((active[3].b.left - active[1].b.left) - g.halfPerim) * 10) / 10;
          const ok = Math.abs(d13) <= 2 && Math.abs(d24) <= 2;
          rows.push({
            label: `Лицо=Тыл (шаг ${g.halfPerim})`,
            status: ok ? 'ok' : 'err',
            text: ok ? '✓ Совпадают' : `Δ ${d13}/${d24} мм`
          });
        }
      } else if (st.symMode === 'face_channel') {
        const faceStrips = active.filter(o => o.b.center >= g.s4 && o.b.center <= g.s5);
        if (faceStrips.length >= 2) {
          const a = faceStrips[0], b = faceStrips[faceStrips.length - 1];
          const gapL = Math.round((a.b.left - g.s4) * 10) / 10;
          const gapR = Math.round((g.s5 - b.b.right) * 10) / 10;
          const delta = Math.round((gapL - gapR) * 10) / 10;
          rows.push({
            label: `Лицо B1 (E${a.i + 1}↔E${b.i + 1})`,
            status: Math.abs(delta) <= 2 ? 'ok' : 'err',
            text: Math.abs(delta) <= 2 ? `✓ OK (${gapL}/${gapR} мм)` : `Δ ${delta > 0 ? '+' : ''}${delta} мм (${gapL}/${gapR})`
          });
        } else if (faceStrips.length === 1) {
          const d = Math.round((faceStrips[0].b.center - g.xCenter) * 10) / 10;
          rows.push({
            label: `Лицо B1 (E${faceStrips[0].i + 1})`,
            status: Math.abs(d) <= 2 ? 'ok' : 'warn',
            text: Math.abs(d) <= 2 ? '✓ По оси' : `Сдвиг ${d > 0 ? '+' : ''}${d} мм`
          });
        }

        if (g.backOverlap > 0.5) {
          const chStrips = active.filter(o => o.b.center >= g.seamS1 - 5 && o.b.center <= g.s8 + 5);
          if (chStrips.length) {
            const ch = chStrips[0];
            const gapS1 = Math.round((ch.b.left - g.seamS1) * 10) / 10;
            const gapS3 = Math.round((g.s8 - ch.b.right) * 10) / 10;
            const ok = gapS1 >= 2 && gapS3 >= 2 && Math.abs(gapS1 - gapS3) <= 2;
            const inside = gapS1 >= 0 && gapS3 >= 0;
            rows.push({
              label: `Канал S1–S3 (E${ch.i + 1})`,
              status: ok ? 'ok' : (inside ? 'warn' : 'err'),
              text: ok ? `✓ Центр (${gapS1}/${gapS3} мм)` : (inside ? `Зазоры ${gapS1}/${gapS3} мм` : 'Наезд на шов!')
            });
          } else {
            rows.push({ label: 'Канал S1–S3', status: 'muted', text: 'Полоса не задана' });
          }
        }

        const b3Strips = active.filter(o => o.b.center >= g.s1L && o.b.center <= g.s2);
        if (b3Strips.length) {
          const b3s = b3Strips[0];
          const fromS1 = Math.round((b3s.b.left - g.s1L) * 10) / 10;
          rows.push({
            label: `Тыл B3 (E${b3s.i + 1})`,
            status: fromS1 >= 5 ? 'ok' : 'warn',
            text: `От S1': ${fromS1} мм`
          });
        }
      } else if (active.length) {
        rows.push({ label: 'Симметрия тиснения', status: 'muted', text: 'Не требуется' });
      }

      // Physical collision checks (active in ALL modes)
      active.forEach(item => {
        const b = item.b;
        const name = `E${item.i + 1}`;
        const isInChannel = g.backOverlap > 0.5 && b.left >= g.seamS1 && b.right <= g.s8;

        if (b.left < 0 || b.right > st.B) {
          rows.push({ label: `${name} край полотна`, status: 'err', text: 'Вылет за B!' });
          return;
        }
        const hitL = b.right > g.s2 && b.left < g.s4;
        const hitR = b.right > g.s5 && b.left < g.s7;
        if (hitL || hitR) {
          rows.push({ label: `${name} ↔ Фальц B2`, status: 'err', text: 'Наезд на фальц!' });
        } else {
          const gaps = [
            Math.abs(b.right - g.s2), Math.abs(b.left - g.s4),
            Math.abs(b.right - g.s5), Math.abs(b.left - g.s7)
          ];
          const minGap = Math.round(Math.min(...gaps) * 10) / 10;
          if (minGap < tol) {
            rows.push({ label: `${name} до фальца`, status: 'warn', text: `${minGap} мм (< ±${tol})` });
          }
        }
        if (b.left < g.s1L || b.right > g.s8) {
          rows.push({ label: `${name} ↔ Кромка T`, status: 'err', text: 'Наезд на T1/T2!' });
        } else if (st.symMode !== 'face_channel' && b.left < g.s1L + st.T2) {
          const ov = Math.round((g.s1L + st.T2 - b.left) * 10) / 10;
          rows.push({ label: `${name} ↔ Подгиб T2`, status: 'warn', text: `Заход ${ov} мм` });
        }
        if (st.symMode !== 'face_channel' && g.backOverlap > 0.5 && b.right > g.seamS1 && b.left < g.s8 && !isInChannel) {
          rows.push({ label: `${name} ↔ Шов S1`, status: 'warn', text: 'Пересекает S1' });
        }
      });
    }

    if (st.perfOn) {
      [[0, 1], [2, 3]].forEach(([i, j]) => {
        if (st.P[i] !== null && st.P[j] !== null) {
          const delta = Math.round(((st.P[j] - g.xCenter) - (g.xCenter - st.P[i])) * 10) / 10;
          rows.push({
            label: `Перф. P${i + 1}↔P${j + 1}`,
            status: Math.abs(delta) <= 2 ? 'ok' : (st.symMode !== 'off' ? 'err' : 'muted'),
            text: Math.abs(delta) <= 2 ? '✓ OK' : `Δ ${delta > 0 ? '+' : ''}${delta} мм`
          });
        }
      });
    }

    return rows;
  };

  FFS.autoFixSymmetry = function (mode) {
    const st = FFS.state;
    const g = FFS.getGeom(st);
    const W = st.embW;
    const shift = st.embAlign === 'center' ? W / 2 : 0;
    const maxFaceMargin = Math.max(0, Math.floor((st.B1 - 2 * W) / 2) - 2);
    FFS.ui.symNote = '';

    if (!st.embOn) st.embOn = true;

    let e1L, e2L, e3L, e4L;
    if (mode === 'gusset' && st.symMode === 'face_channel' && g.backOverlap > 0.5) {
      const m = Math.min(st.symMargin, maxFaceMargin);
      if (st.symMargin > maxFaceMargin) FFS.ui.symNote = `Отступ ограничен до ${m} мм (ширина B1)`;
      e1L = st.E[0] !== null ? FFS.getStripBounds(st.E[0], W, st.embAlign).left : (g.s1L + 22);
      e2L = g.s4 + m;
      e3L = g.s5 - m - W;
      e4L = (g.seamS1 + g.s8) / 2 - W / 2;
    } else if (mode === 'gusset') {
      const m = Math.min(st.symMargin, maxFaceMargin);
      if (st.symMargin > maxFaceMargin) FFS.ui.symNote = `Отступ ограничен до ${m} мм (ширина B1)`;
      e1L = g.s2 - m - W;
      e2L = g.s4 + m;
      e3L = g.s5 - m - W;
      e4L = g.s7 + m;
    } else {
      const curE1 = st.E[0] !== null ? st.E[0] : 30;
      const rawE1L = FFS.getStripBounds(curE1, W, st.embAlign).left;
      let dGusset = g.s2 - (rawE1L + W);
      if (dGusset > maxFaceMargin) {
        dGusset = maxFaceMargin;
        FFS.ui.symNote = `E1 сдвинут: отступ ≤ ${maxFaceMargin} мм (без нахлёста E2/E3)`;
      } else if (dGusset < 0) {
        dGusset = 0;
        FFS.ui.symNote = 'E1 сдвинут к границе фальца';
      }
      e1L = g.s2 - dGusset - W;
      e2L = g.s4 + dGusset;
      e3L = g.s5 - dGusset - W;
      e4L = g.s7 + dGusset;
    }

    const lim = v => Math.round(clamp(v, 0, Math.max(0, st.B - W)) + shift);
    st.E[0] = lim(e1L);
    st.E[1] = lim(e2L);
    st.E[2] = lim(e3L);
    st.E[3] = lim(e4L);
    st.E[4] = null;

    if (typeof FFS.syncStateToInputs === 'function') FFS.syncStateToInputs();
    if (typeof FFS.updateAll === 'function') FFS.updateAll(false);
  };

  FFS.autoFixPerfSymmetry = function () {
    const st = FFS.state;
    const g = FFS.getGeom(st);
    [[0, 1], [2, 3]].forEach(([i, j]) => {
      if (st.P[i] !== null) {
        st.P[j] = Math.round(clamp(2 * g.xCenter - st.P[i], st.T1, st.B - st.T2));
      }
    });
    if (typeof FFS.syncStateToInputs === 'function') FFS.syncStateToInputs();
    if (typeof FFS.updateAll === 'function') FFS.updateAll(false);
  };

  // ===================== SEQUENTIAL COLLISION-FREE 3D KINEMATICS =====================
  // Stage 1 (0..50%): Side walls lift -> Inner flap B4+T2 closes -> Outer flap B3+T1 closes outside (-gap)
  // Stage 2 (50..100%): M-gussets tuck cleanly inward preserving arc-length with zero layer intrusion
  FFS.evalProfile = function (s, fold01, S) {
    const st = S || FFS.state;
    const g = FFS.getGeom(st);
    const p1Side = smoothstep(0.00, 0.24, fold01);
    const p1In   = smoothstep(0.16, 0.36, fold01);
    const p1Out  = smoothstep(0.34, 0.50, fold01);
    const p2     = smoothstep(0.50, 1.00, fold01);

    const halfB1 = st.B1 / 2;
    const halfB2 = st.B2 / 2;
    const s4 = g.s4;
    const s5 = g.s5;

    const gap = Math.min(2.4, Math.max(0.8, st.B2 * 0.08));
    const minDepth = Math.max(gap * 3.0, Math.min(14.0, st.B2 * 0.25));
    const sinMin = clamp(minDepth / Math.max(st.B2, 10.0), 0.04, 0.45);
    const alphaMax = Math.PI - Math.asin(sinMin);
    const alpha = (Math.PI / 2) + p2 * (alphaMax - Math.PI / 2);

    const theta1 = p1Side * alpha;
    const theta2 = p1Side * (Math.PI - alpha);
    const theta3In  = theta2 + p1In  * (Math.PI - theta2);
    const theta3Out = theta2 + p1Out * (Math.PI - theta2);

    if (s >= s4 && s <= s5) {
      return { x: -halfB1 + (s - s4), z: 0 };
    }
    if (s > s5) {
      const u = s - s5;
      if (u <= halfB2) {
        return { x: halfB1 + u * Math.cos(theta1), z: -u * Math.sin(theta1) };
      }
      if (u <= st.B2) {
        const d = u - halfB2;
        return {
          x: halfB1 + halfB2 * Math.cos(theta1) + d * Math.cos(theta2),
          z: -halfB2 * Math.sin(theta1) - d * Math.sin(theta2)
        };
      }
      const d = u - st.B2;
      const x0 = halfB1 + halfB2 * (Math.cos(theta1) + Math.cos(theta2));
      const z0 = -halfB2 * (Math.sin(theta1) + Math.sin(theta2));
      return {
        x: x0 + d * Math.cos(theta3In),
        z: z0 - d * Math.sin(theta3In)
      };
    }
    const u = s4 - s;
    if (u <= halfB2) {
      return { x: -halfB1 - u * Math.cos(theta1), z: -u * Math.sin(theta1) };
    }
    if (u <= st.B2) {
      const d = u - halfB2;
      return {
        x: -halfB1 - halfB2 * Math.cos(theta1) - d * Math.cos(theta2),
        z: -halfB2 * Math.sin(theta1) - d * Math.sin(theta2)
      };
    }
    const d = u - st.B2;
    const x0 = -halfB1 - halfB2 * (Math.cos(theta1) + Math.cos(theta2));
    const z0 = -halfB2 * (Math.sin(theta1) + Math.sin(theta2));
    const outZ = -gap * p1Out * Math.min(1.0, d / 10.0);
    return {
      x: x0 - d * Math.cos(theta3Out),
      z: z0 - d * Math.sin(theta3Out) + outZ
    };
  };

  // Split 7 rigid panels at the 6 sharp creases so every face has crisp un-averaged 3D normals
  FFS.getProfilePanels = function (S) {
    const st = S || FFS.state;
    const g = FFS.getGeom(st);
    const maxS = Math.max(st.B, 1);
    const cuts = [0, g.s2, g.s2 + st.B2 / 2, g.s4, g.s5, g.s5 + st.B2 / 2, g.s7, maxS];
    const panels = [];

    for (let i = 0; i < cuts.length - 1; i++) {
      const a = clamp(cuts[i], 0, maxS);
      const b = clamp(cuts[i + 1], 0, maxS);
      if (b - a < 0.05) continue;

      const set = new Set([a, b]);
      // Preserve smooth ramp transition on outer flap B3 near s2 - 10 mm
      if (i === 0 && g.s2 - 10 > a && g.s2 - 10 < b) {
        set.add(g.s2 - 10);
        if (g.s1L > a && g.s1L < b) set.add(g.s1L);
      }
      if (i === 6) {
        if (g.seamS1 > a && g.seamS1 < b) set.add(g.seamS1);
        if (g.s8 > a && g.s8 < b) set.add(g.s8);
      }
      const nSub = (i === 0 || i === 3 || i === 6) ? 10 : 3;
      for (let k = 1; k < nSub; k++) {
        set.add(a + (b - a) * (k / nSub));
      }
      panels.push(Array.from(set).sort((u, v) => u - v));
    }
    return panels;
  };
})(window);
