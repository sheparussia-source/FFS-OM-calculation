(function (root) {
  'use strict';

  const FFS = root.FFS;
  const $ = FFS.$;
  const clamp = FFS.clamp;

  let canvas2d, ctx2d, inlineInput;
  let zoom2d = 1, pan2dX = 0, pan2dY = 0;
  let lastLayout = null;
  let hitZones = [];
  let dragState = null;
  let inlineTarget = null;

  FFS.resize2D = function () {
    const wrap = $('wrap-2d');
    if (!canvas2d || !wrap || wrap.clientWidth < 10) return;
    const dpr = window.devicePixelRatio || 1;
    canvas2d.width = Math.floor(wrap.clientWidth * dpr);
    canvas2d.height = Math.floor(wrap.clientHeight * dpr);
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    FFS.draw2D();
  };

  FFS.reset2DView = function () {
    zoom2d = 1;
    pan2dX = 0;
    pan2dY = 0;
    FFS.draw2D();
  };

  FFS.draw2D = function () {
    if (!canvas2d || !ctx2d) return;
    const W = canvas2d.clientWidth;
    const H = canvas2d.clientHeight;
    if (W < 10 || H < 10) return;
    ctx2d.clearRect(0, 0, W, H);
    hitZones = [];

    const S = FFS.state;
    const g = FFS.getGeom(S);

    // Engineering grid
    ctx2d.strokeStyle = '#f1f5f9';
    ctx2d.lineWidth = 1;
    for (let x = 0; x < W; x += 24) { ctx2d.beginPath(); ctx2d.moveTo(x, 0); ctx2d.lineTo(x, H); ctx2d.stroke(); }
    for (let y = 0; y < H; y += 24) { ctx2d.beginPath(); ctx2d.moveTo(0, y); ctx2d.lineTo(W, y); ctx2d.stroke(); }

    // Freeze T1=0 anchor during boundary drags so handles track mouse 1:1 in BOTH normal & mirrored modes
    let ox, oy, scale, oxRight;
    if (dragState && dragState.frozenLayout) {
      ({ ox, oy, scale, oxRight } = dragState.frozenLayout);
      const spanB = Math.max(S.B, g.sumB, 1);
      if (S.mirror2d) {
        ox = oxRight - spanB * scale;
      } else {
        oxRight = ox + spanB * scale;
      }
    } else {
      const padL = 46, padR = 78, padT = 56, padB = 104;
      const filmB = Math.max(S.B, g.sumB, 1);
      const effB = Math.max(filmB, 100);
      const effA = Math.max(S.A, 100);
      const baseScale = Math.min((W - padL - padR) / effB, (H - padT - padB) / effA);
      scale = Math.max(0.04, baseScale * zoom2d);
      ox = (W - padR + padL - filmB * scale) / 2 + pan2dX;
      oy = (H - padB + padT - S.A * scale) / 2 + pan2dY;
      oxRight = ox + filmB * scale;
    }

    const filmB = Math.max(S.B, g.sumB, 1);
    const webW = filmB * scale;
    const webH = S.A * scale;
    lastLayout = { ox, oy, scale, webW, webH, oxRight };

    const x2p = mm => S.mirror2d ? (oxRight - mm * scale) : (ox + mm * scale);
    const y2p = mm => oy + mm * scale;
    const rectX = (a, b) => {
      const p1 = x2p(a), p2 = x2p(b);
      return { x: Math.min(p1, p2), w: Math.abs(p2 - p1) };
    };

    const segs = [
      { key: 'T1', label: 'T1', a: 0, b: g.s1L, fill: '#f1f5f9' },
      { key: 'B3', label: 'B3 (Внеш.кл.)', a: g.s1L, b: g.s2, fill: '#fff7ed' },
      { key: 'B2L', dimKey: 'B2', label: 'B2 (Фальц)', a: g.s2, b: g.s4, fill: '#ecfdf5', gusset: true },
      { key: 'B1', label: 'ЛИЦО (B1)', a: g.s4, b: g.s5, fill: '#ffffff', face: true },
      { key: 'B2R', dimKey: 'B2', label: 'B2 (Фальц)', a: g.s5, b: g.s7, fill: '#ecfdf5', gusset: true },
      { key: 'B4', label: 'B4 (Внутр.кл.)', a: g.s7, b: g.s8, fill: '#faf5ff' },
      { key: 'T2', label: 'T2', a: g.s8, b: g.sumB, fill: '#f1f5f9' }
    ];

    const film = rectX(0, S.B);
    const deferredBadges = [];

    // Clip film interior
    ctx2d.save();
    ctx2d.beginPath();
    ctx2d.rect(film.x, oy, film.w, webH);
    ctx2d.clip();

    segs.forEach(sg => {
      const r = rectX(sg.a, sg.b);
      ctx2d.fillStyle = sg.fill;
      ctx2d.fillRect(r.x, oy, r.w, webH);

      if (sg.gusset) {
        const gx = x2p((sg.a + sg.b) / 2);
        ctx2d.save();
        ctx2d.strokeStyle = '#10b981';
        ctx2d.lineWidth = 1.4;
        ctx2d.setLineDash([5, 4]);
        ctx2d.beginPath(); ctx2d.moveTo(gx, oy); ctx2d.lineTo(gx, oy + webH); ctx2d.stroke();
        ctx2d.restore();
      }

      if (r.w > 26 && !sg.face) {
        ctx2d.fillStyle = '#475569';
        ctx2d.font = '600 10px sans-serif';
        ctx2d.textAlign = 'center';
        ctx2d.fillText(r.w > 78 ? sg.label : (sg.dimKey || sg.key), r.x + r.w / 2, oy + 15);
      }

      if (sg.face) {
        const cx = r.x + r.w / 2, cy = oy + webH / 2;
        ctx2d.save();
        ctx2d.translate(cx, cy);
        if (S.scheme === 'A2') ctx2d.rotate(Math.PI);
        ctx2d.fillStyle = '#1e293b';
        ctx2d.font = `800 ${clamp(r.w * 0.14, 13, 28)}px sans-serif`;
        ctx2d.textAlign = 'center';
        ctx2d.textBaseline = 'middle';
        ctx2d.fillText('ЛИЦО', 0, -8);
        ctx2d.fillStyle = '#64748b';
        ctx2d.font = '600 10px sans-serif';
        ctx2d.fillText(`B1 = ${S.B1} мм • Схема ${S.scheme}`, 0, 14);
        ctx2d.restore();
      }
    });

    if (S.B > g.sumB + 0.5) {
      const r = rectX(g.sumB, S.B);
      ctx2d.fillStyle = 'rgba(239,68,68,0.12)';
      ctx2d.fillRect(r.x, oy, r.w, webH);
    } else if (g.sumB > S.B + 0.5) {
      const mark = x2p(S.B);
      ctx2d.save();
      ctx2d.strokeStyle = '#dc2626';
      ctx2d.lineWidth = 1.2;
      ctx2d.setLineDash([4, 3]);
      ctx2d.beginPath();
      ctx2d.moveTo(mark, oy);
      ctx2d.lineTo(mark, oy + webH);
      ctx2d.stroke();
      ctx2d.restore();
    }

    // Uploaded OM artwork overlay (XOR flip keeps artwork locked to film T1..T2 in both normal & mirrored 2D)
    if (S.omShow2D && typeof FFS.hasArtwork === 'function' && FFS.hasArtwork()) {
      const effFlipX = Boolean(S.omFlipX) !== Boolean(S.mirror2d);
      FFS.drawArtworkOnCtx(ctx2d, film.x, oy, film.w, webH, effFlipX, Boolean(S.omRot180), (S.omOpacity2D ?? 55) / 100, S);
    }

    // Transverse weld seams & dead zones (top / bottom along A)
    if (S.transOn) {
      const tr = FFS.getTransverseGeom(S);
      const drawTransHatch = (ya, yb) => {
        if (yb <= ya) return;
        const py = y2p(ya), ph = (yb - ya) * scale;
        ctx2d.save();
        ctx2d.fillStyle = 'rgba(220, 38, 38, 0.14)';
        ctx2d.fillRect(ox, py, webW, ph);
        ctx2d.beginPath();
        ctx2d.rect(ox, py, webW, ph);
        ctx2d.clip();
        ctx2d.strokeStyle = 'rgba(220, 38, 38, 0.42)';
        ctx2d.lineWidth = 0.9;
        ctx2d.beginPath();
        for (let x = ox - ph; x < ox + webW + ph; x += 10) {
          ctx2d.moveTo(x, py); ctx2d.lineTo(x + ph, py + ph);
        }
        ctx2d.stroke();
        ctx2d.restore();
      };

      drawTransHatch(0, Math.min(tr.topEnd, S.A));
      drawTransHatch(Math.max(0, tr.botStart), S.A);

      if (tr.dz > 0) {
        ctx2d.fillStyle = 'rgba(245, 158, 11, 0.14)';
        if (tr.safeTop > tr.topEnd) {
          ctx2d.fillRect(ox, y2p(tr.topEnd), webW, (Math.min(tr.safeTop, S.A) - tr.topEnd) * scale);
        }
        if (tr.botStart > tr.safeBot) {
          const yStart = Math.max(0, tr.safeBot);
          ctx2d.fillRect(ox, y2p(yStart), webW, (tr.botStart - yStart) * scale);
        }
      }

      // Crisp horizontal seam & dead-zone lines
      const drawHLine = (mm, col, dash) => {
        if (mm <= 0 || mm >= S.A) return;
        const py = y2p(mm);
        ctx2d.save();
        ctx2d.strokeStyle = col;
        ctx2d.lineWidth = 1.2;
        ctx2d.setLineDash(dash);
        ctx2d.beginPath(); ctx2d.moveTo(ox, py); ctx2d.lineTo(ox + webW, py); ctx2d.stroke();
        ctx2d.restore();
      };
      drawHLine(tr.topEnd, '#dc2626', [6, 3]);
      drawHLine(tr.botStart, '#dc2626', [6, 3]);
      if (tr.dz > 0) {
        drawHLine(tr.safeTop, '#d97706', [3, 3]);
        drawHLine(tr.safeBot, '#d97706', [3, 3]);
      }
    }

    if (S.showZones) {
      const tol = Math.max(Math.abs(S.B2tolM), Math.abs(S.B2tolP));
      if (tol > 0) {
        ctx2d.fillStyle = 'rgba(245,158,11,0.15)';
        [[g.s2 - tol, g.s2], [g.s4, g.s4 + tol], [g.s5 - tol, g.s5], [g.s7, g.s7 + tol]].forEach(([a, b]) => {
          const r = rectX(a, b);
          ctx2d.fillRect(r.x, oy, r.w, webH);
        });
      }
      if (S.T2 > 0) {
        const r = rectX(g.s1L, g.s1L + S.T2);
        ctx2d.fillStyle = 'rgba(148,163,184,0.18)';
        ctx2d.fillRect(r.x, oy, r.w, webH);
        ctx2d.save();
        ctx2d.strokeStyle = '#94a3b8';
        ctx2d.setLineDash([3, 3]);
        ctx2d.beginPath();
        ctx2d.moveTo(x2p(g.s1L + S.T2), oy);
        ctx2d.lineTo(x2p(g.s1L + S.T2), oy + webH);
        ctx2d.stroke();
        ctx2d.restore();
      }
      if (g.channel) {
        const r = rectX(g.channel.left, g.channel.right);
        ctx2d.fillStyle = 'rgba(147,51,234,0.10)';
        ctx2d.fillRect(r.x, oy, r.w, webH);
      }
    }

    // Segment boundary drag handles (lowest hit priority)
    const boundKeys = ['T1', 'B3', 'B2L', 'B1', 'B2R', 'B4', 'T2'];
    segs.forEach((sg, idx) => {
      const bx = x2p(sg.b);
      if (idx < 6) {
        ctx2d.strokeStyle = '#64748b';
        ctx2d.lineWidth = 1;
        ctx2d.beginPath(); ctx2d.moveTo(bx, oy); ctx2d.lineTo(bx, oy + webH); ctx2d.stroke();
      }
      hitZones.push({ type: 'bound', key: boundKeys[idx], x: bx - 5, y: oy, w: 10, h: webH });
    });

    // Embossing fills E1..E5 (badges deferred outside clip so they never crop!)
    if (S.embOn) {
      S.E.forEach((val, idx) => {
        if (val === null) return;
        const st = FFS.getStripBounds(val, S.embW, S.embAlign);
        if (st.right < 0 || st.left > S.B) return;
        const r = rectX(st.left, st.right);
        const hitF = (st.right > g.s2 && st.left < g.s4) || (st.right > g.s5 && st.left < g.s7) || st.left < 0 || st.right > S.B;

        ctx2d.save();
        ctx2d.fillStyle = hitF ? 'rgba(220,38,38,0.18)' : 'rgba(100,116,139,0.18)';
        ctx2d.fillRect(r.x, oy, r.w, webH);
        ctx2d.strokeStyle = hitF ? 'rgba(220,38,38,0.65)' : 'rgba(71,85,105,0.45)';
        ctx2d.lineWidth = 0.85;
        ctx2d.beginPath();
        for (let y = oy - r.w; y < oy + webH; y += 8) {
          ctx2d.moveTo(r.x, y); ctx2d.lineTo(r.x + r.w, y + r.w);
        }
        ctx2d.stroke();
        ctx2d.strokeStyle = hitF ? '#dc2626' : '#475569';
        ctx2d.strokeRect(r.x, oy, r.w, webH);
        ctx2d.restore();

        hitZones.push({ type: 'E', idx, x: r.x, y: oy, w: Math.max(r.w, 14), h: webH });
        deferredBadges.push({
          arr: 'E', idx, val,
          lx: r.x + r.w / 2,
          ly: oy + webH - 14 - (idx % 2) * 16,
          txt: `E${idx + 1}:${val}`,
          stroke: hitF ? '#dc2626' : '#475569',
          color: hitF ? '#dc2626' : '#0f172a'
        });
      });
    }

    // Perforation fills P1..P4 (badges deferred outside clip)
    if (S.perfOn) {
      S.P.forEach((val, idx) => {
        if (val === null) return;
        const pst = FFS.getStripBounds(val, S.perfW, S.perfAlign || 'left');
        if (pst.right < 0 || pst.left > S.B) return;
        const r = rectX(pst.left, pst.right);
        ctx2d.save();
        ctx2d.fillStyle = 'rgba(37,99,235,0.11)';
        ctx2d.fillRect(r.x, oy, r.w, webH);
        ctx2d.fillStyle = '#1d4ed8';
        for (let y = oy + 6; y < oy + webH - 4; y += 9) {
          for (let x = r.x + 4; x < r.x + r.w - 2; x += 7) ctx2d.fillRect(x, y, 1.8, 1.8);
        }
        ctx2d.restore();

        hitZones.push({ type: 'P', idx, x: r.x, y: oy, w: Math.max(r.w, 14), h: webH });
        deferredBadges.push({
          arr: 'P', idx, val,
          lx: r.x + r.w / 2,
          ly: oy + 32 + (idx % 2) * 16,
          txt: `P${idx + 1}:${val}`,
          stroke: '#1d4ed8',
          color: '#1d4ed8'
        });
      });
    }

    if (S.cutExtOn) {
      const cx = x2p(S.C1), cy = y2p(S.D1);
      drawCutMatrix2D(cx, cy, scale, S.cutExtPat, '#0f172a', 'C1/D1');
      hitZones.push({ type: 'cutExt', x: cx - 18, y: cy - 10, w: 36, h: 64 });
    }
    if (S.cutIntOn) {
      const cx = x2p(S.C2), cy = y2p(S.D2);
      drawCutMatrix2D(cx, cy, scale, S.cutIntPat, '#7c3aed', 'C2/D2');
      hitZones.push({ type: 'cutInt', x: cx - 18, y: cy - 10, w: 36, h: 64 });
    }
    if (S.fgOn) {
      const r = rectX(S.F - 14, S.F + 14);
      const fh = 95 * scale, fy = y2p(S.G);
      ctx2d.save();
      ctx2d.fillStyle = 'rgba(15,23,42,0.22)';
      ctx2d.fillRect(r.x, fy, r.w, fh);
      ctx2d.strokeStyle = '#0f172a';
      ctx2d.lineWidth = 1;
      ctx2d.strokeRect(r.x, fy, r.w, fh);
      for (let y = fy; y < fy + fh; y += 5) {
        ctx2d.beginPath(); ctx2d.moveTo(r.x, y); ctx2d.lineTo(r.x + r.w, y); ctx2d.stroke();
      }
      ctx2d.restore();
      hitZones.push({ type: 'fg', x: r.x - 4, y: fy - 4, w: r.w + 8, h: fh + 8 });
    }
    if (S.pmOn) {
      const r = rectX(S.pmX, S.pmX + S.pmW);
      const py = y2p(S.pmY);
      const pw = r.w, ph = S.pmH * scale;
      ctx2d.fillStyle = S.pmColor;
      ctx2d.fillRect(r.x, py, pw, ph);
      ctx2d.strokeStyle = '#ef4444';
      ctx2d.lineWidth = 1;
      ctx2d.strokeRect(r.x - 1, py - 1, pw + 2, ph + 2);
      hitZones.push({ type: 'pm', x: r.x - 5, y: py - 5, w: pw + 10, h: ph + 10 });
    }

    ctx2d.restore(); // end film clip

    // Outer film frame
    ctx2d.strokeStyle = '#0f172a';
    ctx2d.lineWidth = 1.6;
    ctx2d.strokeRect(film.x, oy, film.w, webH);

    if (S.transOn) {
      const tr = FFS.getTransverseGeom(S);
      ctx2d.save();
      ctx2d.font = '700 9.5px monospace';
      ctx2d.fillStyle = '#dc2626';
      ctx2d.textAlign = 'right';
      ctx2d.textBaseline = 'middle';
      if (tr.topEnd > 0) ctx2d.fillText(`Шов ${tr.topEnd}`, ox - 5, y2p(tr.topEnd / 2));
      if (tr.botStart < S.A) ctx2d.fillText(`Шов ${S.A - tr.botStart}`, ox - 5, y2p((tr.botStart + S.A) / 2));
      ctx2d.restore();
    }

    // Draw E/P badges unclipped so edge values never get cropped
    deferredBadges.forEach(bd => {
      ctx2d.font = '700 10px monospace';
      const tw = ctx2d.measureText(bd.txt).width + 8;
      ctx2d.fillStyle = '#ffffff';
      ctx2d.strokeStyle = bd.stroke;
      ctx2d.lineWidth = 1;
      ctx2d.beginPath();
      ctx2d.roundRect(bd.lx - tw / 2, bd.ly - 8, tw, 16, 3);
      ctx2d.fill();
      ctx2d.stroke();
      ctx2d.fillStyle = bd.color;
      ctx2d.textAlign = 'center';
      ctx2d.textBaseline = 'middle';
      ctx2d.fillText(bd.txt, bd.lx, bd.ly);

      hitZones.push({
        type: 'dimArr', arr: bd.arr, idx: bd.idx, val: bd.val,
        x: bd.lx - tw / 2, y: bd.ly - 8, w: tw, h: 16, cx: bd.lx, cy: bd.ly
      });
    });

    // Center axis of B1
    const xCenterPx = x2p(g.xCenter);
    ctx2d.save();
    ctx2d.strokeStyle = '#2563eb';
    ctx2d.lineWidth = 1.2;
    ctx2d.setLineDash([6, 4]);
    ctx2d.beginPath(); ctx2d.moveTo(xCenterPx, oy - 14); ctx2d.lineTo(xCenterPx, oy + webH + 8); ctx2d.stroke();
    ctx2d.restore();

    // Mating seam line S1' at T1|B3
    if (S.S1) {
      const sx0 = x2p(g.s1L);
      ctx2d.save();
      ctx2d.strokeStyle = 'rgba(220,38,38,0.6)';
      ctx2d.lineWidth = 1.4;
      ctx2d.setLineDash([4, 4]);
      ctx2d.beginPath(); ctx2d.moveTo(sx0, oy - 8); ctx2d.lineTo(sx0, oy + webH + 4); ctx2d.stroke();
      ctx2d.setLineDash([]);
      ctx2d.fillStyle = '#dc2626';
      ctx2d.font = '700 9.5px monospace';
      ctx2d.textAlign = 'center';
      ctx2d.fillText("S1'", sx0, oy - 12);
      ctx2d.restore();
    }

    // Seams S1, S2, S3
    const seams = [
      { k: 'S1', on: S.S1, xMm: g.seamS1, col: '#dc2626' },
      { k: 'S2', on: S.S2, xMm: g.seamS2, col: '#ea580c' },
      { k: 'S3', on: S.S3, xMm: g.seamS3, col: '#9333ea' }
    ].filter(sm => sm.on);

    seams.forEach((sm, idx) => {
      const sx = x2p(sm.xMm);
      const labelY = oy - 12 - (idx % 2) * 14;
      ctx2d.save();
      ctx2d.strokeStyle = sm.col;
      ctx2d.lineWidth = 1.8;
      ctx2d.setLineDash([5, 3]);
      ctx2d.beginPath(); ctx2d.moveTo(sx, oy - 8); ctx2d.lineTo(sx, oy + webH + 4); ctx2d.stroke();
      ctx2d.setLineDash([]);
      ctx2d.fillStyle = sm.col;
      ctx2d.font = '700 10px monospace';
      ctx2d.textAlign = 'center';
      ctx2d.fillText(sm.k, sx, labelY);
      ctx2d.restore();
      if (sm.k !== 'S1') {
        hitZones.push({ type: 'seam', key: sm.k, x: sx - 6, y: oy - 16, w: 12, h: webH + 20 });
      }
    });

    // Bottom Segment Dimensions (sorted left-to-right on screen)
    const dimY1 = oy + webH + 22;
    const dimItems = segs.map(sg => {
      const key = sg.dimKey || sg.key;
      const aMm = (sg.key === 'B3' && S.t1InB3) ? 0 : sg.a;
      const bMm = sg.b;
      const raw = sg.key === 'B3' ? S.B3 : (sg.gusset ? S.B2 : (sg.key === 'T1' ? S.T1 : (sg.key === 'B1' ? S.B1 : (sg.key === 'B4' ? S.B4 : S.T2))));
      const val = FFS.formatNum(raw);
      const p1 = x2p(aMm), p2 = x2p(bMm);
      const x1 = Math.min(p1, p2), x2 = Math.max(p1, p2);
      const lbl = (sg.gusset && (x2 - x1) > 84) ? `B2:${val} (${FFS.formatNum(S.B2tolM)}/+${FFS.formatNum(S.B2tolP)})` : `${key}:${val}`;
      ctx2d.font = '600 10px monospace';
      const tw = ctx2d.measureText(lbl).width + 10;
      return { x1, x2, mx: (x1 + x2) / 2, tw, lbl, key, val, forceTier1: (sg.key === 'T1' && S.t1InB3) };
    }).sort((u, v) => u.mx - v.mx);

    let prevBadgeRight = -Infinity;
    let prevTier = 0;
    dimItems.forEach(it => {
      let tier = it.forceTier1 ? 1 : 0;
      if (!it.forceTier1 && it.mx - it.tw / 2 < prevBadgeRight + 4 && prevTier === 0) tier = 1;
      const by = dimY1 + tier * 22;
      drawDimH(it.x1, it.x2, dimY1, by, it.lbl, '#475569', it.key, it.val);
      if (tier === 0) prevBadgeRight = it.mx + it.tw / 2;
      prevTier = tier;
    });

    // Total B Dimension Line
    const dimY2 = oy + webH + 70;
    const bEdge1 = x2p(0);
    const bEdge2 = x2p(S.B);
    drawDimH(Math.min(bEdge1, bEdge2), Math.max(bEdge1, bEdge2), dimY2, dimY2, `B = ${FFS.formatNum(S.B)} мм${S.mirror2d ? ' (T1 справа)' : ''}`, '#2563eb', 'B', FFS.formatNum(S.B));

    // Right Height A Dimension Line (offset past max(webW, sumB) so manual B < sumB never collides)
    const rightMostPx = Math.max(ox + webW, x2p(0), x2p(g.sumB));
    drawDimV(oy, oy + webH, rightMostPx + 26, `A = ${FFS.formatNum(S.A)} мм`, '#2563eb', 'A', FFS.formatNum(S.A));
  };

  function drawCutMatrix2D(cx, cy, scale, pat, color, label) {
    const { cols, rows } = FFS.parseMatrix(pat);
    const dx = 7 * scale, dy = 14 * scale, len = 9 * scale;
    const startX = cx - ((cols - 1) * dx) / 2;
    ctx2d.save();
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 1.6;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const x = startX + c * dx, y = cy + r * dy;
        ctx2d.beginPath(); ctx2d.moveTo(x, y); ctx2d.lineTo(x, y + len); ctx2d.stroke();
      }
    }
    ctx2d.fillStyle = color;
    ctx2d.font = '700 9px monospace';
    ctx2d.textAlign = 'center';
    ctx2d.fillText(`${label} (${pat})`, cx, cy - 5);
    ctx2d.restore();
  }

  function drawDimH(x1, x2, lineY, badgeY, text, color, key, val) {
    ctx2d.save();
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(x1, lineY - 5); ctx2d.lineTo(x1, lineY + 5);
    ctx2d.moveTo(x2, lineY - 5); ctx2d.lineTo(x2, lineY + 5);
    ctx2d.moveTo(x1, lineY); ctx2d.lineTo(x2, lineY);
    ctx2d.stroke();

    const mx = (x1 + x2) / 2;
    if (Math.abs(badgeY - lineY) > 2) {
      ctx2d.beginPath();
      ctx2d.moveTo(mx, lineY); ctx2d.lineTo(mx, badgeY - 9);
      ctx2d.stroke();
    }

    ctx2d.font = '600 10px monospace';
    const tw = ctx2d.measureText(text).width + 10;
    const bx = mx - tw / 2, by = badgeY - 9, bh = 18;
    ctx2d.fillStyle = '#ffffff';
    ctx2d.strokeStyle = color;
    ctx2d.beginPath();
    ctx2d.roundRect(bx, by, tw, bh, 4);
    ctx2d.fill();
    ctx2d.stroke();

    ctx2d.fillStyle = color;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(text, mx, badgeY);
    ctx2d.restore();

    hitZones.push({ type: 'dim', key, val, x: bx, y: by, w: tw, h: bh, cx: mx, cy: badgeY });
  }

  function drawDimV(y1, y2, x, text, color, key, val) {
    ctx2d.save();
    ctx2d.strokeStyle = color;
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    ctx2d.moveTo(x - 5, y1); ctx2d.lineTo(x + 5, y1);
    ctx2d.moveTo(x - 5, y2); ctx2d.lineTo(x + 5, y2);
    ctx2d.moveTo(x, y1); ctx2d.lineTo(x, y2);
    ctx2d.stroke();

    const my = (y1 + y2) / 2;
    ctx2d.translate(x, my);
    ctx2d.rotate(-Math.PI / 2);
    ctx2d.font = '600 10px monospace';
    const tw = ctx2d.measureText(text).width + 10;
    ctx2d.fillStyle = '#ffffff';
    ctx2d.strokeStyle = color;
    ctx2d.beginPath();
    ctx2d.roundRect(-tw / 2, -9, tw, 18, 4);
    ctx2d.fill();
    ctx2d.stroke();
    ctx2d.fillStyle = color;
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(text, 0, 0);
    ctx2d.restore();

    hitZones.push({ type: 'dim', key, val, x: x - 12, y: my - 40, w: 24, h: 80, cx: x, cy: my });
  }

  function hitTest2D(mx, my) {
    for (let i = hitZones.length - 1; i >= 0; i--) {
      const z = hitZones[i];
      if (mx >= z.x && mx <= z.x + z.w && my >= z.y && my <= z.y + z.h) return z;
    }
    return null;
  }

  function openInlineEdit(zone) {
    inlineTarget = zone;
    inlineInput.value = zone.val;
    inlineInput.style.left = Math.max(6, zone.cx - 39) + 'px';
    inlineInput.style.top = Math.max(6, zone.cy - 12) + 'px';
    inlineInput.style.display = 'block';
    inlineInput.focus();
    inlineInput.select();
  }

  function commitInlineEdit() {
    if (!inlineTarget) return;
    const S = FFS.state;
    const v = FFS.parseLocaleNumber(inlineInput.value);
    if (!Number.isFinite(v)) FFS.showToast('Ошибка ввода числа. Размер сохранён.');
    if (Number.isFinite(v) && v !== FFS.parseLocaleNumber(inlineTarget.val)) {
      FFS.ui.symNote = '';
      const lim = {
        A: [150, 2500], B1: [80, 1500], B2: [10, 600],
        T1: [0, 150], T2: [0, 150],
        B3: [S.t1InB3 ? S.T1 + 10 : 10, 1200]
      };
      if (inlineTarget.type === 'dimArr') {
        S[inlineTarget.arr][inlineTarget.idx] = Math.max(0, v);
      } else if (inlineTarget.key === 'B') {
        S.autoB = false;
        S.B = clamp(v, 200, 3000);
        if (S.autoB4) FFS.recalcBalance(S);
      } else if (inlineTarget.key === 'B4') {
        S.autoB4 = false;
        S.B4 = clamp(v, 0, 1200);
        if (S.autoB) FFS.recalcBalance(S);
      } else {
        const k = inlineTarget.key;
        const pair = lim[k] || [0, Math.max(S.B, S.A, 1)];
        S[k] = clamp(v, pair[0], pair[1]);
        if (k === 'T1' && S.t1InB3) S.B3 = Math.max(S.B3, S.T1 + 10);
        FFS.recalcBalance(S);
      }
      FFS.syncStateToInputs();
      FFS.updateAll(true);
    }
    inlineTarget = null;
    inlineInput.style.display = 'none';
  }

  FFS.init2DInteraction = function () {
    canvas2d = $('canvas2d');
    ctx2d = canvas2d.getContext('2d');
    inlineInput = $('inline-edit');

    inlineInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') commitInlineEdit();
      if (e.key === 'Escape') { inlineTarget = null; inlineInput.style.display = 'none'; }
    });
    inlineInput.addEventListener('blur', commitInlineEdit);

    canvas2d.addEventListener('pointerdown', e => {
      const rect = canvas2d.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (inlineTarget) commitInlineEdit();

      const hit = hitTest2D(mx, my);
      if (hit && (hit.type === 'dim' || hit.type === 'dimArr') && e.button === 0) {
        e.preventDefault();
        openInlineEdit(hit);
        return;
      }
      if (hit && e.button === 0) {
        dragState = {
          hit, startX: mx, startY: my,
          orig: JSON.parse(JSON.stringify(FFS.state)),
          frozenLayout: hit.type === 'bound' && lastLayout ? { ...lastLayout } : null
        };
        return;
      }
      dragState = { pan: true, startX: mx, startY: my, origPX: pan2dX, origPY: pan2dY };
    });

    window.addEventListener('pointermove', e => {
      const rect = canvas2d.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;

      if (!dragState) {
        if (mx >= 0 && my >= 0 && mx <= rect.width && my <= rect.height) {
          const h = hitTest2D(mx, my);
          if (!h) canvas2d.style.cursor = 'grab';
          else if (h.type === 'dim' || h.type === 'dimArr') canvas2d.style.cursor = 'pointer';
          else if (['bound', 'E', 'P', 'seam'].includes(h.type)) canvas2d.style.cursor = 'ew-resize';
          else canvas2d.style.cursor = 'move';
        }
        return;
      }

      if (dragState.pan) {
        pan2dX = dragState.origPX + (mx - dragState.startX);
        pan2dY = dragState.origPY + (my - dragState.startY);
        FFS.draw2D();
        return;
      }

      const lay = dragState.frozenLayout || lastLayout;
      if (!lay) return;
      const S = FFS.state;
      const dir = S.mirror2d ? -1 : 1;
      const rawDx = ((mx - dragState.startX) / lay.scale) * dir;
      const dxMm = Math.round(rawDx);
      const dyMm = Math.round((my - dragState.startY) / lay.scale);
      const o = dragState.orig;
      const h = dragState.hit;
      let tipText = '';
      FFS.ui.symNote = '';

      if (h.type === 'bound') {
        if (h.key === 'T1') { S.T1 = clamp(o.T1 + dxMm, 0, S.t1InB3 ? Math.min(150, S.B3 - 10) : 150); tipText = `T1 = ${S.T1} мм`; }
        else if (h.key === 'B3') { S.B3 = clamp(o.B3 + dxMm, S.t1InB3 ? S.T1 + 10 : 10, 1200); tipText = `B3 = ${S.B3} мм`; }
        else if (h.key === 'B2L') { S.B2 = clamp(o.B2 + dxMm, 10, 600); tipText = `B2 = ${S.B2} мм`; }
        else if (h.key === 'B2R') { S.B2 = clamp(o.B2 + Math.round(rawDx / 2), 10, 600); tipText = `B2 = ${S.B2} мм`; }
        else if (h.key === 'B1') { S.B1 = clamp(o.B1 + dxMm, 80, 1500); tipText = `B1 = ${S.B1} мм`; }
        else if (h.key === 'B4') {
          if (S.autoB4) {
            S.T2 = clamp(o.T2 - dxMm, 0, 150);
            FFS.recalcBalance(S);
            tipText = `B4 = ${S.B4} мм (T2 = ${S.T2})`;
          } else {
            S.B4 = clamp(o.B4 + dxMm, 0, 1200);
            tipText = `B4 = ${S.B4} мм`;
          }
        } else if (h.key === 'T2') {
          if (S.autoB4) {
            S.B = clamp(o.B + dxMm, 200, 3000);
            FFS.recalcBalance(S);
            tipText = `B = ${S.B} мм (B4 = ${S.B4})`;
          } else {
            S.T2 = clamp(o.T2 + dxMm, 0, 150);
            tipText = `T2 = ${S.T2} мм`;
          }
        }
        FFS.recalcBalance(S);
      } else if (h.type === 'E') {
        S.E[h.idx] = clamp(o.E[h.idx] + dxMm, 0, S.B);
        tipText = `E${h.idx + 1} = ${S.E[h.idx]} мм`;
      } else if (h.type === 'P') {
        S.P[h.idx] = clamp(o.P[h.idx] + dxMm, 0, S.B);
        tipText = `P${h.idx + 1} = ${S.P[h.idx]} мм`;
      } else if (h.type === 'seam') {
        const k = h.key + 'off';
        const base = h.key === 'S3' && o.S3off === 0 ? FFS.getGeom(o).seamS3 - FFS.getGeom(o).seamS1 : o[k];
        S[k] = dxMm === 0 ? o[k] : base + dxMm;
        tipText = `${h.key} сдвиг = ${S[k]} мм`;
      } else if (h.type === 'pm') {
        S.pmX = clamp(o.pmX + dxMm, 0, Math.max(0, S.B - S.pmW));
        S.pmY = clamp(o.pmY + dyMm, 0, Math.max(0, S.A - S.pmH));
        tipText = `Фотометка X:${S.pmX} Y:${S.pmY}`;
      } else if (h.type === 'cutExt') {
        S.C1 = clamp(o.C1 + dxMm, 0, S.B); S.D1 = clamp(o.D1 + dyMm, 0, S.A);
        tipText = `C1:${S.C1} D1:${S.D1}`;
      } else if (h.type === 'cutInt') {
        S.C2 = clamp(o.C2 + dxMm, 0, S.B); S.D2 = clamp(o.D2 + dyMm, 0, S.A);
        tipText = `C2:${S.C2} D2:${S.D2}`;
      } else if (h.type === 'fg') {
        S.F = clamp(o.F + dxMm, 0, S.B); S.G = clamp(o.G + dyMm, 0, S.A);
        tipText = `F:${S.F} G:${S.G}`;
      }

      const tip = $('drag-tip');
      tip.textContent = tipText;
      tip.style.left = (mx + 14) + 'px';
      tip.style.top = (my - 28) + 'px';
      tip.style.display = 'block';

      FFS.syncStateToInputs();
      FFS.updateAll(false);
    });

    const endDrag = () => {
      if (dragState) {
        const wasBound = Boolean(dragState.frozenLayout);
        dragState = null;
        $('drag-tip').style.display = 'none';
        if (wasBound) FFS.updateAll(true);
      }
    };
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);

    canvas2d.addEventListener('wheel', e => {
      e.preventDefault();
      zoom2d = clamp(zoom2d * (e.deltaY < 0 ? 1.12 : 0.89), 0.45, 4.5);
      FFS.draw2D();
    }, { passive: false });
  };
})(window);
