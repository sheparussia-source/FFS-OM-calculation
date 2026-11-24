(function (root) {
  'use strict';

  const FFS = root.FFS;
  const $ = FFS.$;
  const clamp = FFS.clamp;

  let scene = null, camera = null, renderer = null;
  let bagMesh = null, bagGeo = null, bagMat = null, bagTex = null, gridHelper = null;
  let loopStarted = false;

  const texCanvas = document.createElement('canvas');
  texCanvas.width = 2048;
  texCanvas.height = 1024;
  const texCtx = texCanvas.getContext('2d');

  let camTheta = 0.56, camPhi = 1.18, camDist = 14;
  let camTarget = { x: 0, y: 0, z: 0 };
  let orbitDrag = null;

  function getIdealCamDist() {
    const S = FFS.state;
    const worldScale = 0.01;
    const film = Math.max(S.B, FFS.getGeom(S).sumB);
    const diag = Math.max(S.A * worldScale, Math.max(S.B1 + S.B2, film * 0.58) * worldScale);
    return clamp(diag * 1.65, 5.5, 45);
  }

  function updateCamera() {
    if (!camera) return;
    camera.position.set(
      camTarget.x + camDist * Math.sin(camPhi) * Math.sin(camTheta),
      camTarget.y + camDist * Math.cos(camPhi),
      camTarget.z + camDist * Math.sin(camPhi) * Math.cos(camTheta)
    );
    camera.lookAt(camTarget.x, camTarget.y, camTarget.z);
  }

  FFS.reframe3D = function () {
    camDist = getIdealCamDist();
    updateCamera();
  };

  FFS.setCameraPreset = function (preset) {
    camTarget = { x: 0, y: 0, z: 0 };
    const d = getIdealCamDist();
    if (preset === 'iso') { camTheta = 0.56; camPhi = 1.18; camDist = d; }
    else if (preset === 'front') { camTheta = 0; camPhi = Math.PI / 2; camDist = d * 0.92; }
    else if (preset === 'back') { camTheta = Math.PI; camPhi = Math.PI / 2; camDist = d * 0.92; }
    else if (preset === 'top') { camTheta = 0; camPhi = 0.12; camDist = d; }
    updateCamera();
  };

  FFS.setXray = function (on) {
    FFS.ui.xrayOn = !!on;
    if (bagMat) {
      bagMat.transparent = FFS.ui.xrayOn;
      bagMat.opacity = FFS.ui.xrayOn ? 0.48 : 1.0;
      bagMat.depthWrite = !FFS.ui.xrayOn;
      bagMat.needsUpdate = true;
    }
  };

  FFS.init3D = function () {
    const mount = $('three-mount');
    if (!mount || scene) return;
    if (typeof THREE === 'undefined') {
      mount.innerHTML = '<div class="three-status">Загрузка 3D-движка Three.js…<br>Если работаете без интернета, положите <code>three.min.js</code> в папку <code>lib/</code>.</div>';
      return;
    }

    // Clear any prior loading/error message before appending WebGL canvas
    mount.innerHTML = '';

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);

    camera = new THREE.PerspectiveCamera(40, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 300);
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 0.92));
    const dir1 = new THREE.DirectionalLight(0xffffff, 0.65);
    dir1.position.set(12, 16, 14);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x93c5fd, 0.35);
    dir2.position.set(-12, 8, -14);
    scene.add(dir2);

    gridHelper = new THREE.GridHelper(36, 36, 0x334155, 0x1e293b);
    scene.add(gridHelper);

    bagTex = new THREE.CanvasTexture(texCanvas);
    bagTex.anisotropy = 4;
    bagMat = new THREE.MeshStandardMaterial({
      map: bagTex,
      roughness: 0.48,
      metalness: 0.04,
      side: THREE.DoubleSide
    });
    bagGeo = new THREE.BufferGeometry();
    bagMesh = new THREE.Mesh(bagGeo, bagMat);
    scene.add(bagMesh);
    FFS.setXray(FFS.ui.xrayOn);

    const dom = renderer.domElement;
    dom.addEventListener('mousedown', e => {
      orbitDrag = { btn: e.button, x: e.clientX, y: e.clientY, th: camTheta, ph: camPhi, tx: camTarget.x, ty: camTarget.y };
    });
    window.addEventListener('mousemove', e => {
      if (!orbitDrag) return;
      const dx = e.clientX - orbitDrag.x, dy = e.clientY - orbitDrag.y;
      if (orbitDrag.btn === 0) {
        camTheta = orbitDrag.th - dx * 0.007;
        camPhi = clamp(orbitDrag.ph - dy * 0.007, 0.08, Math.PI - 0.08);
      } else {
        const k = camDist * 0.001;
        camTarget.x = orbitDrag.tx - dx * k;
        camTarget.y = orbitDrag.ty + dy * k;
      }
      updateCamera();
    });
    window.addEventListener('mouseup', () => { orbitDrag = null; });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    dom.addEventListener('wheel', e => {
      e.preventDefault();
      camDist = clamp(camDist * (e.deltaY > 0 ? 1.09 : 0.91), 3, 70);
      updateCamera();
    }, { passive: false });

    camDist = getIdealCamDist();
    updateCamera();
    FFS.update3DTexture();
    FFS.update3DGeometry();
    if (!loopStarted) {
      loopStarted = true;
      animateLoop();
    }
  };

  FFS.resize3D = function () {
    const mount = $('three-mount');
    if (!renderer || !camera || !mount || mount.clientWidth < 10) return;
    camera.aspect = mount.clientWidth / Math.max(1, mount.clientHeight);
    camera.updateProjectionMatrix();
    renderer.setSize(mount.clientWidth, mount.clientHeight);
  };

  FFS.update3DTexture = function () {
    const S = FFS.state;
    const gm = FFS.getGeom(S);
    const TW = texCanvas.width, TH = texCanvas.height;
    const g2 = texCtx;

    g2.fillStyle = '#f8fafc';
    g2.fillRect(0, 0, TW, TH);

    const filmB = Math.max(S.B, gm.sumB, 1);
    const sx = mm => (mm / filmB) * TW;
    const sy = mm => (mm / Math.max(S.A, 1)) * TH;

    const hasOm3D = Boolean(S.omShow3D && typeof FFS.hasArtwork === 'function' && FFS.hasArtwork());
    const hideBase = hasOm3D && Boolean(S.omHideLabels3D);

    if (!hideBase) {
      const zones = [
        { a: 0, b: gm.s1L, c: '#e2e8f0' },
        { a: gm.s1L, b: gm.s2, c: '#fff7ed' },
        { a: gm.s2, b: gm.s4, c: '#ecfdf5' },
        { a: gm.s4, b: gm.s5, c: '#ffffff' },
        { a: gm.s5, b: gm.s7, c: '#ecfdf5' },
        { a: gm.s7, b: gm.s8, c: '#f5f3ff' },
        { a: gm.s8, b: gm.sumB, c: '#e2e8f0' }
      ];
      zones.forEach(z => {
        g2.fillStyle = z.c;
        g2.fillRect(sx(z.a), 0, sx(z.b - z.a), TH);
      });
    } else {
      g2.fillStyle = '#ffffff';
      g2.fillRect(0, 0, TW, TH);
    }

    if (hasOm3D) {
      FFS.drawArtworkOnCtx(g2, 0, 0, TW, TH, Boolean(S.omFlipX), Boolean(S.omRot180), (S.omOpacity3D ?? 100) / 100, S);
    }

    [gm.s2, gm.s2 + S.B2 / 2, gm.s4, gm.s5, gm.s5 + S.B2 / 2, gm.s7].forEach((mm, i) => {
      g2.save();
      g2.strokeStyle = (i === 1 || i === 4) ? 'rgba(16,185,129,0.75)' : 'rgba(148,163,184,0.75)';
      g2.lineWidth = (i === 1 || i === 4) ? 4 : 2;
      g2.setLineDash([14, 10]);
      g2.beginPath(); g2.moveTo(sx(mm), 0); g2.lineTo(sx(mm), TH); g2.stroke();
      g2.restore();
    });

    if (!hideBase) {
      // Aspect-ratio compensated "ЛИЦО" graphic sized strictly to fit inside B1
      const pxPerMmX = TW / Math.max(S.B, gm.sumB, 1);
      const pxPerMmY = TH / Math.max(S.A, 1);
      const titleMm = clamp(Math.min(S.B1 * 0.24, S.A * 0.14), 22, 95);
      const subMm = titleMm * 0.34;
      g2.save();
      g2.translate(sx(gm.xCenter), TH / 2);
      if (S.scheme === 'A2') g2.rotate(Math.PI);
      g2.scale(pxPerMmX / pxPerMmY, 1);
      g2.fillStyle = '#0f172a';
      g2.font = `800 ${Math.round(titleMm * pxPerMmY)}px sans-serif`;
      g2.textAlign = 'center';
      g2.textBaseline = 'middle';
      g2.fillText('ЛИЦО', 0, -titleMm * 0.24 * pxPerMmY);
      g2.fillStyle = '#2563eb';
      g2.font = `700 ${Math.round(subMm * pxPerMmY)}px monospace`;
      g2.fillText(`FFS ${S.B1}×${S.A} (${S.scheme})`, 0, titleMm * 0.48 * pxPerMmY);
      g2.restore();
    }

    // Transverse weld seams & dead zones on 3D bag
    if (S.transOn) {
      const tr = FFS.getTransverseGeom(S);
      const draw3DTrans = (ya, yb) => {
        if (yb <= ya) return;
        const y0 = sy(ya), h = sy(yb - ya);
        g2.save();
        g2.fillStyle = 'rgba(220,38,38,0.22)';
        g2.fillRect(0, y0, TW, h);
        g2.beginPath(); g2.rect(0, y0, TW, h); g2.clip();
        g2.strokeStyle = 'rgba(220,38,38,0.55)';
        g2.lineWidth = 3;
        g2.beginPath();
        for (let x = -h; x < TW + h; x += 28) { g2.moveTo(x, y0); g2.lineTo(x + h, y0 + h); }
        g2.stroke();
        g2.restore();
      };
      draw3DTrans(0, Math.min(tr.topEnd, S.A));
      draw3DTrans(Math.max(0, tr.botStart), S.A);

      const draw3DHLine = (mm, col, dash) => {
        if (mm <= 0 || mm >= S.A) return;
        const y = sy(mm);
        g2.save();
        g2.strokeStyle = col;
        g2.lineWidth = 4;
        g2.setLineDash(dash);
        g2.beginPath(); g2.moveTo(0, y); g2.lineTo(TW, y); g2.stroke();
        g2.restore();
      };
      draw3DHLine(tr.topEnd, '#dc2626', [18, 10]);
      draw3DHLine(tr.botStart, '#dc2626', [18, 10]);
      if (tr.dz > 0) {
        draw3DHLine(tr.safeTop, '#f59e0b', [10, 10]);
        draw3DHLine(tr.safeBot, '#f59e0b', [10, 10]);
      }
    }

    if (S.embOn) {
      S.E.forEach(v => {
        if (v === null) return;
        const st = FFS.getStripBounds(v, S.embW, S.embAlign);
        const x0 = sx(st.left), w = sx(S.embW);
        g2.save();
        g2.fillStyle = 'rgba(71,85,105,0.24)';
        g2.fillRect(x0, 0, w, TH);
        g2.strokeStyle = 'rgba(51,65,85,0.6)';
        g2.lineWidth = 2;
        g2.beginPath();
        for (let y = -w; y < TH; y += 16) { g2.moveTo(x0, y); g2.lineTo(x0 + w, y + w); }
        g2.stroke();
        g2.restore();
      });
    }

    if (S.perfOn) {
      S.P.forEach(v => {
        if (v === null) return;
        const pst = FFS.getStripBounds(v, S.perfW, S.perfAlign || 'left');
        const x0 = sx(pst.left), w = sx(S.perfW);
        g2.fillStyle = 'rgba(37,99,235,0.14)';
        g2.fillRect(x0, 0, w, TH);
        g2.fillStyle = '#1d4ed8';
        for (let y = 12; y < TH - 12; y += 22) {
          for (let x = x0 + 6; x < x0 + w - 4; x += 14) g2.fillRect(x, y, 4, 4);
        }
      });
    }

    const drawTexCut = (cm, dm, pat, col) => {
      const { cols, rows } = FFS.parseMatrix(pat);
      const dxMm = 7, dyMm = 14, lenMm = 9;
      g2.strokeStyle = col; g2.lineWidth = 5;
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const xm = cm + (c - (cols - 1) / 2) * dxMm;
          const ym = dm + r * dyMm;
          g2.beginPath(); g2.moveTo(sx(xm), sy(ym)); g2.lineTo(sx(xm), sy(ym + lenMm)); g2.stroke();
        }
      }
    };
    if (S.cutExtOn) drawTexCut(S.C1, S.D1, S.cutExtPat, '#0f172a');
    if (S.cutIntOn) drawTexCut(S.C2, S.D2, S.cutIntPat, '#7c3aed');

    if (S.fgOn) {
      g2.fillStyle = 'rgba(15,23,42,0.35)';
      g2.fillRect(sx(S.F - 14), sy(S.G), sx(28), sy(95));
    }

    if (S.pmOn) {
      g2.fillStyle = S.pmColor;
      g2.fillRect(sx(S.pmX), sy(S.pmY), sx(S.pmW), sy(S.pmH));
    }

    [
      { on: S.S1, xMm: gm.s1L, col: 'rgba(220,38,38,0.65)' },
      { on: S.S1, xMm: gm.seamS1, col: '#dc2626' },
      { on: S.S2, xMm: gm.seamS2, col: '#ea580c' },
      { on: S.S3, xMm: gm.seamS3, col: '#9333ea' }
    ].forEach(sm => {
      if (!sm.on || sm.xMm < 0 || sm.xMm > Math.max(S.B, gm.sumB)) return;
      const x = sx(sm.xMm);
      g2.save();
      g2.strokeStyle = sm.col;
      g2.lineWidth = 6;
      g2.setLineDash([18, 12]);
      g2.beginPath(); g2.moveTo(x, 0); g2.lineTo(x, TH); g2.stroke();
      g2.restore();
    });

    if (bagTex) bagTex.needsUpdate = true;
  };

  // Split-vertex per-panel mesh so sharp 90°/176° creases have crisp unit normals (no dark bands!)
  FFS.update3DGeometry = function () {
    if (!bagGeo) return;
    const S = FFS.state;
    const f = FFS.ui.foldPct / 100;
    const panels = FFS.getProfilePanels(S);
    const rows = 2;
    const worldScale = 0.01;

    if (gridHelper) gridHelper.position.y = -(S.A * worldScale) / 2 - 0.15;

    let minZ = Infinity, maxZ = -Infinity;
    const panelPts = panels.map(ss => ss.map(s => {
      const p = FFS.evalProfile(s, f, S);
      if (p.z < minZ) minZ = p.z;
      if (p.z > maxZ) maxZ = p.z;
      return { s, x: p.x, z: p.z };
    }));
    const cz = (minZ + maxZ) / 2;

    const positions = [], uvs = [], indices = [];
    let vertOffset = 0;

    panelPts.forEach(pts => {
      const cols = pts.length;
      for (let r = 0; r <= rows; r++) {
        const v = r / rows;
        const y = (v - 0.5) * S.A * worldScale;
        for (let c = 0; c < cols; c++) {
          const p = pts[c];
          positions.push(p.x * worldScale, y, (p.z - cz) * worldScale);
          uvs.push(p.s / Math.max(S.B, FFS.getGeom(S).sumB, 1), v);
        }
      }
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = vertOffset + r * cols + c;
          const b = a + 1;
          const d = vertOffset + (r + 1) * cols + c;
          const e = d + 1;
          indices.push(a, b, d, b, e, d);
        }
      }
      vertOffset += (rows + 1) * cols;
    });

    bagGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bagGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    bagGeo.setIndex(indices);
    // r128 computeVertexNormals does not grow an existing normal buffer.
    // Vertices added after a size change (the T2 edge) would stay at zero and shade black.
    const prevN = bagGeo.getAttribute('normal');
    if (prevN && prevN.count !== positions.length / 3) bagGeo.deleteAttribute('normal');
    bagGeo.computeVertexNormals();
  };

  FFS.drawCrossSection = function () {
    const c = $('canvas-xz');
    if (!c) return;
    const gx = c.getContext('2d');
    const W = c.width, H = c.height;
    gx.clearRect(0, 0, W, H);

    const S = FFS.state;
    const g = FFS.getGeom(S);
    const f = FFS.ui.foldPct / 100;
    const panels = FFS.getProfilePanels(S);
    const flatS = [];
    panels.forEach(arr => arr.forEach(s => flatS.push(s)));
    const pts = flatS.map(s => ({ s, ...FFS.evalProfile(s, f, S) }));

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    pts.forEach(p => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
    });
    const sc = Math.min((W - 18) / Math.max(maxX - minX, 40), (H - 18) / Math.max(maxZ - minZ, 26));
    const ox = W / 2 - ((minX + maxX) / 2) * sc;
    const oy = H / 2 + ((minZ + maxZ) / 2) * sc;

    gx.lineWidth = 2.2;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      if (Math.abs(b.s - a.s) < 1e-4) continue;
      const mid = (a.s + b.s) / 2;
      if (mid < g.s2) gx.strokeStyle = '#fb923c';
      else if (mid < g.s4) gx.strokeStyle = '#10b981';
      else if (mid <= g.s5) gx.strokeStyle = '#60a5fa';
      else if (mid <= g.s7) gx.strokeStyle = '#10b981';
      else gx.strokeStyle = '#c084fc';
      gx.beginPath();
      gx.moveTo(ox + a.x * sc, oy - a.z * sc);
      gx.lineTo(ox + b.x * sc, oy - b.z * sc);
      gx.stroke();
    }
    const filmB = Math.max(S.B, g.sumB);
    if (S.S1 && g.seamS1 <= filmB) {
      const sp = FFS.evalProfile(g.seamS1, f, S);
      gx.fillStyle = '#ef4444';
      gx.beginPath();
      gx.arc(ox + sp.x * sc, oy - sp.z * sc, 3.2, 0, Math.PI * 2);
      gx.fill();
    }
    if (S.S3 && g.seamS3 <= filmB && g.backOverlap > 0.5) {
      const sp3 = FFS.evalProfile(g.seamS3, f, S);
      gx.fillStyle = '#a855f7';
      gx.beginPath();
      gx.arc(ox + sp3.x * sc, oy - sp3.z * sc, 3.0, 0, Math.PI * 2);
      gx.fill();
    }
  };

  FFS.togglePlay = function () {
    FFS.ui.isPlaying = !FFS.ui.isPlaying;
    FFS.ui.foldTarget = null;
    $('btn-play').textContent = FFS.ui.isPlaying ? '❚❚' : '▶';
  };

  FFS.animateFoldTo = function (target) {
    FFS.ui.isPlaying = false;
    $('btn-play').textContent = '▶';
    FFS.ui.foldTarget = target;
  };

  function animateLoop() {
    requestAnimationFrame(animateLoop);
    if (FFS.ui.isPlaying) {
      FFS.ui.foldPct += FFS.ui.playDir * 0.45;
      if (FFS.ui.foldPct >= 100) { FFS.ui.foldPct = 100; FFS.ui.playDir = -1; }
      if (FFS.ui.foldPct <= 0) { FFS.ui.foldPct = 0; FFS.ui.playDir = 1; }
      FFS.updateFoldUI();
      FFS.update3DGeometry();
      FFS.drawCrossSection();
    } else if (FFS.ui.foldTarget !== null) {
      const diff = FFS.ui.foldTarget - FFS.ui.foldPct;
      if (Math.abs(diff) < 0.6) { FFS.ui.foldPct = FFS.ui.foldTarget; FFS.ui.foldTarget = null; }
      else { FFS.ui.foldPct += diff * 0.14; }
      FFS.updateFoldUI();
      FFS.update3DGeometry();
      FFS.drawCrossSection();
    }
    if (renderer && scene && camera) renderer.render(scene, camera);
  }
})(window);
