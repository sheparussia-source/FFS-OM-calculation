(function (root) {
  'use strict';

  const FFS = root.FFS;
  const clamp = FFS.clamp;
  const smoothstep = FFS.smoothstep;

  FFS.calcAutoB4 = function (S) {
    const st = S || FFS.state;
    const s1L = st.T1;
    const b3Net = st.t1InB3 ? Math.max(0, st.B3 - st.T1) : st.B3;
    const fixed = s1L + b3Net + 2 * st.B2 + st.B1 + st.T2;
    return st.B - fixed;
  };

  FFS.recalcBalance = function (S) {
    const st = S || FFS.state;
    if (st.autoB4) {
      st.autoB = false;
      st.B4 = FFS.calcAutoB4(st);
    } else if (st.autoB) {
      st.B = FFS.getGeom(st).sumB;
    }
  };

  FFS.finalizeAutoBalance = function (st) {
    if (st) FFS.recalcBalance(st);
    return st;
  };

  FFS.getGeom = function (S) {
    const st = S || FFS.state;
    const s1L = st.T1;
    const b3Net = st.t1InB3 ? Math.max(0, st.B3 - st.T1) : st.B3;
    const s2 = s1L + b3Net;            // B3 | B2L
    const s4 = s2 + st.B2;             // B2L | B1
    const s5 = s4 + st.B1;             // B1 | B2R
    const s7 = s5 + st.B2;             // B2R | B4
    const b4Eff = Math.max(0, st.B4);
    const s8 = s7 + b4Eff;             // B4 | T2
    const sumB = s8 + st.T2;
    const xCenter = s4 + st.B1 / 2;
    const halfPerim = st.B1 + st.B2;
    const backOverlap = b3Net + st.B4 - st.B1;
    const seamS1 = s1L + 2 * st.B1 + 2 * st.B2;
    // 0 всегда край B4 (s8), как в подписи поля. Пустое поле сюда не приходит.
    const seamS3 = st.S3off === 0 ? s8 : (seamS1 + st.S3off);
    const seamS2 = seamS1 + st.S2off;
    const seamErrors = [];
    for (const [name, x] of [['S1', seamS1], ['S2', seamS2], ['S3', seamS3]]) {
      if (st[name] && (x < 0 || x > st.B)) seamErrors.push(`${name} = ${FFS.formatNum(x)} мм за пределами полотна 0…${FFS.formatNum(st.B)} мм`);
    }
    const channel = st.S1 && st.S3 && Math.min(seamS1, seamS3) >= 0 && Math.max(seamS1, seamS3) <= st.B
      ? { left: Math.min(seamS1, seamS3), right: Math.max(seamS1, seamS3), width: Math.abs(seamS3 - seamS1) }
      : null;
    return { channel, seamErrors, sumB, s1L, b3Net, b4Eff, s2, s4, s5, s7, s8, xCenter, halfPerim, backOverlap, seamS1, seamS2, seamS3 };
  };

  FFS.getStripBounds = function (val, w, align) {
    const left = align === 'center' ? val - w / 2 : val;
    return { left, right: left + w, center: left + w / 2 };
  };


  FFS.getTransverseGeom = function (S) {
    const st = S || FFS.state;
    const topEnd = st.transOn ? Math.max(0, st.topSeal) : 0;
    const botStart = st.transOn ? Math.max(0, st.A - Math.max(0, st.botSeal)) : st.A;
    const dz = st.transOn ? Math.max(0, st.deadZone) : 0;
    const safeTop = topEnd + dz;
    const safeBot = botStart - dz;
    const effA = Math.max(0, safeBot - safeTop);
    return { on: !!st.transOn, topEnd, botStart, dz, safeTop, safeBot, effA };
  };

  FFS.parseMatrix = function (str) {
    const m = String(str || '3x6').match(/(\d+)\s*[xх×*]\s*(\d+)/i);
    if (!m) return { cols: 3, rows: 6 };
    return { cols: clamp(+m[1], 1, 10), rows: clamp(+m[2], 1, 20) };
  };

  FFS.evalPolytexTooling = function (S) {
    const st = S || FFS.state;
    const b2Max = st.B2 + Math.max(0, st.B2tolP);
    // Граница Small/Medium стыкуется на 290: дробь 289.4 не выпадает в «Вне S/M».
    // Отдельного класса Large в расчёте нет, поэтому у Medium нет верхней границы B1.
    if (st.B1 >= 210 && st.B1 < 290 && b2Max <= 120) {
      return { cls: 'pill-info', text: 'POLYTEX: Small', detail: `Small (B1≥210, B2≤120; факт B2+доп=${b2Max} мм)` };
    }
    if (st.B1 >= 260 && st.B1 < 290 && st.B2 <= 200) {
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

  FFS.pushStripHits = function (rows, name, b, st, g, allowGusset = false) {
    const tol = Math.max(Math.abs(st.B2tolM), Math.abs(st.B2tolP));
    if (b.left < 0 || b.right > st.B) {
      rows.push({ label: `${name} край полотна`, status: 'err', text: 'Вылет за B!' });
      return;
    }
    const hitL = b.right > g.s2 && b.left < g.s4;
    const hitR = b.right > g.s5 && b.left < g.s7;
    if (!allowGusset && (hitL || hitR)) {
      rows.push({ label: `${name} ↔ Фальц B2`, status: 'err', text: 'Наезд на фальц!' });
    } else if (!allowGusset) {
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
    } else if (b.left < g.s1L + st.T2) {
      const ov = Math.round((g.s1L + st.T2 - b.left) * 10) / 10;
      rows.push({ label: `${name} ↔ Подгиб T2`, status: 'warn', text: `Заход ${ov} мм` });
    }
    for (const [nameOfSeam, x] of [['S1', g.seamS1], ['S2', g.seamS2], ['S3', g.seamS3]]) {
      if (st[nameOfSeam] && b.left < x && b.right > x) {
        rows.push({ label: `${name} ↔ Шов ${nameOfSeam}`, status: 'err', text: 'Полоса пересекает шов' });
      }
    }
    if (g.channel && b.left < g.channel.right && b.right > g.channel.left && g.channel.width > 0) {
      rows.push({ label: `${name} ↔ Канал S1–S3`, status: 'warn', text: 'Заход в канал S1–S3' });
    }
  };

  FFS.markExtent = function (rows, label, x0, x1, y0, y1, st) {
    const web = st || FFS.state;
    const overX = x0 < -0.1 || x1 > web.B + 0.1;
    const overY = y0 < -0.1 || y1 > web.A + 0.1;
    if (overX || overY) {
      rows.push({ label, status: 'err', text: 'Вылет за полотно!' });
    }
  };

  FFS.analyzeEmbossingAndPerf = function (S) {
    const st = S || FFS.state;
    const g = FFS.getGeom(st);
    const rows = g.seamErrors.map(text => ({ label: 'Продольный шов', status: 'err', text }));

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
      } else if (active.length) {
        rows.push({ label: 'Симметрия тиснения', status: 'muted', text: 'Не требуется' });
      }

      active.forEach(item => {
        FFS.pushStripHits(rows, `E${item.i + 1}`, item.b, st, g);
      });
    }

    if (st.perfOn) {
      const pAlign = st.perfAlign || 'left';
      st.P.forEach((v, i) => {
        if (v === null) return;
        const b = FFS.getStripBounds(v, st.perfW, pAlign);
        FFS.pushStripHits(rows, `P${i + 1}`, b, st, g, st.perfAllowGusset);
        for (let j = i + 1; j < st.P.length; j++) {
          if (st.P[j] === null) continue;
          const other = FFS.getStripBounds(st.P[j], st.perfW, pAlign);
          const overlap = Math.min(b.right, other.right) - Math.max(b.left, other.left);
          if (overlap > 0.000001) rows.push({ label: `P${i + 1} ↔ P${j + 1}`, status: 'err', text: `Перекрытие ${FFS.formatNum(overlap)} мм` });
        }
      });

      [[0, 1], [2, 3]].forEach(([i, j]) => {
        if (st.P[i] !== null && st.P[j] !== null) {
          const bi = FFS.getStripBounds(st.P[i], st.perfW, pAlign);
          const bj = FFS.getStripBounds(st.P[j], st.perfW, pAlign);
          const delta = Math.round(((bj.center - g.xCenter) - (g.xCenter - bi.center)) * 10) / 10;
          rows.push({
            label: `Перф. P${i + 1}↔P${j + 1}`,
            status: Math.abs(delta) <= 2 ? 'ok' : (st.symMode !== 'off' ? 'err' : 'muted'),
            text: Math.abs(delta) <= 2 ? '✓ OK' : `Δ ${delta > 0 ? '+' : ''}${delta} мм`
          });
        }
      });
    }

    const cutBox = (pat, cx, cy) => {
      const parsed = FFS.parseMatrix(pat);
      const halfW = ((parsed.cols - 1) * 7) / 2;
      const h = (parsed.rows - 1) * 14 + 9;
      return { x0: cx - halfW, x1: cx + halfW, y0: cy, y1: cy + h };
    };
    if (st.pmOn) {
      FFS.markExtent(rows, 'Фотометка', st.pmX, st.pmX + st.pmW, st.pmY, st.pmY + st.pmH, st);
    }
    const checkFlap = (label, left, right, permitted) => {
      if (!permitted.some(([a, b]) => left >= a && right <= b)) {
        rows.push({ label, status: 'err', text: 'Обработка выходит за границу клапана' });
      }
    };
    const outer = [g.s1L, g.s2], inner = [g.s7, g.s8];
    if (st.cutExtOn) {
      const box = cutBox(st.cutExtPat, st.C1, st.D1);
      FFS.markExtent(rows, 'Разрезы C1/D1', box.x0, box.x1, box.y0, box.y1, st);
      checkFlap('Разрезы C1/D1', box.x0, box.x1, [outer]);
    }
    if (st.cutIntOn) {
      const box = cutBox(st.cutIntPat, st.C2, st.D2);
      FFS.markExtent(rows, 'Разрезы C2/D2', box.x0, box.x1, box.y0, box.y1, st);
      checkFlap('Разрезы C2/D2', box.x0, box.x1, [inner]);
    }
    if (st.fgOn) {
      checkFlap('Тиснение F/G', st.F - 14, st.F + 14, [outer, inner]);
      FFS.markExtent(rows, 'Тиснение F/G', st.F - 14, st.F + 14, st.G, st.G + 95, st);
    }

    if (st.transOn) {
      const tr = FFS.getTransverseGeom(st);
      if (tr.topEnd >= tr.botStart) {
        rows.push({ label: 'Поперечные швы', status: 'err', text: 'Швы перекрываются!' });
      } else if (tr.safeTop >= tr.safeBot) {
        rows.push({ label: 'Мёртвые зоны (A)', status: 'warn', text: 'Нет чистой зоны печати' });
      }

      const checkY = (label, y0, y1) => {
        if (y0 < tr.topEnd - 0.1 || y1 > tr.botStart + 0.1) {
          rows.push({ label, status: 'err', text: 'В зоне попер. шва!' });
        } else if (tr.dz > 0 && (y0 < tr.safeTop - 0.1 || y1 > tr.safeBot + 0.1)) {
          rows.push({ label, status: 'warn', text: 'В мёртвой зоне шва' });
        }
      };

      if (st.pmOn) {
        checkY('Фотометка (по Y)', st.pmY, st.pmY + st.pmH);
      }
      if (st.cutExtOn) {
        const { rows: rExt } = FFS.parseMatrix(st.cutExtPat);
        const hExt = (rExt - 1) * 14 + 9;
        checkY('Разрезы C1/D1', st.D1, st.D1 + hExt);
      }
      if (st.cutIntOn) {
        const { rows: rInt } = FFS.parseMatrix(st.cutIntPat);
        const hInt = (rInt - 1) * 14 + 9;
        checkY('Разрезы C2/D2', st.D2, st.D2 + hInt);
      }
      if (st.fgOn) {
        checkY('Тиснение F/G', st.G, st.G + 95);
      }
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
    if (mode === 'gusset') {
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


    if (typeof FFS.syncStateToInputs === 'function') FFS.syncStateToInputs();
    if (typeof FFS.updateAll === 'function') FFS.updateAll(false);
  };

  FFS.autoFixPerfSymmetry = function () {
    const st = FFS.state;
    const g = FFS.getGeom(st);
    const W = st.perfW;
    const pAlign = st.perfAlign || 'left';
    const shift = pAlign === 'center' ? W / 2 : 0;
    const mirrorTo = (src, dst) => {
      const original = FFS.getStripBounds(st.P[src], W, pAlign);
      const left = 2 * g.xCenter - original.right;
      const checks = [];
      FFS.pushStripHits(checks, '', { left, right: left + W }, st, g, st.perfAllowGusset);
      const overlaps = st.P.some((v, index) => {
        if (v === null || index === dst) return false;
        const strip = FFS.getStripBounds(v, W, pAlign);
        return left < strip.right - 1e-7 && left + W > strip.left + 1e-7;
      });
      if (overlaps || checks.some(row => row.status === 'err')) {
        FFS.ui.symNote = `Для P${src + 1} нет свободного симметричного места`;
        return;
      }
      st.P[dst] = left + shift;
    };

    FFS.ui.symNote = '';
    st.perfOn = true;
    [[0, 1], [2, 3]].forEach(([i, j]) => {
      if (st.P[i] !== null && st.P[j] === null) mirrorTo(i, j);
      else if (st.P[i] === null && st.P[j] !== null) mirrorTo(j, i);
      else if (st.P[i] !== null && st.P[j] !== null) mirrorTo(i, j);
      else if (i === 0) {
        const margin = Math.max(st.symMargin, Math.abs(st.B2tolM), st.B2tolP);
        const left = st.perfAllowGusset && W <= st.B2 ? g.s2 + (st.B2 - W) / 2 : g.s4 + margin;
        const right = 2 * g.xCenter - left - W;
        const checks = [];
        FFS.pushStripHits(checks, '', { left, right: left + W }, st, g, st.perfAllowGusset);
        FFS.pushStripHits(checks, '', { left: right, right: right + W }, st, g, st.perfAllowGusset);
        if (right < left + W || checks.some(row => row.status === 'err')) {
          FFS.ui.symNote = 'Для двух отдельных полос недостаточно места. Укажите координаты вручную.';
        } else {
          st.P[0] = left + shift;
          st.P[1] = right + shift;
        }
      }
    });

    if (typeof FFS.syncStateToInputs === 'function') FFS.syncStateToInputs();
    if (typeof FFS.updateAll === 'function') FFS.updateAll(false);
  };

  // Sequential folding of the side walls, lips and gussets.
  // Stage 1 (0..50%): side walls lift. Inner lip T2 (32 mm, right edge, B4) closes first.
  // Outer lip T1 (8 mm, left edge, B3) closes second and sits outside it (-gap), so the
  // 8 mm edge covers the 32 mm edge.
  // Stage 2 (50..100%): tuck the M-gussets inward.
  FFS.evalProfile = function (s, fold01, S, geometry) {
    const st = S || FFS.state;
    const g = geometry || FFS.getGeom(st);
    const p1Side = smoothstep(0.00, 0.24, fold01);
    const p1In   = smoothstep(0.16, 0.36, fold01);
    const p1Out  = smoothstep(0.36, 0.50, fold01);
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
      const edge = Math.max(0, d - g.b4Eff);
      // If the straight inner edge would reach the opposite wall, tuck T2
      // at its existing crease before the inner flap starts to close.
      const tuck = g.b4Eff + st.T2 > st.B1 ? smoothstep(0, 0.16, fold01) * (Math.PI - 0.08) : 0;
      return {
        x: x0 + (d - edge) * Math.cos(theta3In) + edge * Math.cos(theta3In + tuck),
        z: z0 - (d - edge) * Math.sin(theta3In) - edge * Math.sin(theta3In + tuck)
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

  // The profile is piecewise linear between these creases and the outer layer ramp.
  FFS.profileIntersection = function (st, g, fold) {
    const cuts = [0, Math.max(0, g.s2 - 10), g.s2, g.s2 + st.B2 / 2, g.s4, g.s5,
      g.s5 + st.B2 / 2, g.s7, g.s8, st.B];
    const ends = [...new Set(cuts.filter(x => x <= st.B))];
    const points = ends.map(x => FFS.evalProfile(x, fold, st, g));
    for (let i = 0; i + 1 < points.length; i++) {
      const a = points[i], b = points[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z;
      for (let j = i + 2; j + 1 < points.length; j++) {
        const c = points[j], d = points[j + 1];
        const ex = d.x - c.x, ez = d.z - c.z;
        const det = dx * ez - dz * ex;
        if (Math.abs(det) < 1e-8) continue;
        const t = ((c.x - a.x) * ez - (c.z - a.z) * ex) / det;
        const u = ((c.x - a.x) * dz - (c.z - a.z) * dx) / det;
        if (t > 1e-7 && t < 1 - 1e-7 && u > 1e-7 && u < 1 - 1e-7) {
          return { x: a.x + t * dx, z: a.z + t * dz };
        }
      }
    }
    return null;
  };

  // Split 7 rigid panels at the 6 sharp creases so every face has crisp un-averaged 3D normals
  FFS.getProfilePanels = function (S) {
    const st = S || FFS.state;
    const g = FFS.getGeom(st);
    const maxS = st.B;
    const cuts = [0, g.s2, g.s2 + st.B2 / 2, g.s4, g.s5, g.s5 + st.B2 / 2, g.s7, maxS];
    if (g.b4Eff + st.T2 > st.B1 && g.s8 > g.s7 && g.s8 < maxS) cuts.splice(-1, 0, g.s8);
    const panels = [];

    for (let i = 0; i < cuts.length - 1; i++) {
      const a = clamp(cuts[i], 0, maxS);
      const b = clamp(cuts[i + 1], 0, maxS);
      if (b - a < 0.05) continue;

      const set = new Set([a, b]);
      // Kink where the outer 8 mm lip T1 finishes stepping outside the inner one.
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
