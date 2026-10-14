/*!
 * engine.js · 神经元场景引擎（点 · 线 · 面 / 黑白灰）
 * 用 Canvas 2D 实现的伪 3D 神经网络：没有三方库、没有网络请求，双击就能打开。
 * 视觉基调：纸白底、墨点、细线、浅灰面，加上缓慢移动的光源和跟着走的影子。
 * 只负责“画面与几何”。想改内容（昵称、兴趣、链接）请编辑 assets/app.js 顶部。
 * 可自由修改与再发布。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.NeuralEngine = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  /* 固定种子的随机数：每次打开页面，网络的形状都一样 */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* 每种节点的“墨色”：0 最黑，1 最浅的铅笔灰 */
  var TONE = { core: 0.04, topic: 0.10, relay: 0.40, child: 0.34, spark: 0.58, dust: 0.78 };

  function ink(alpha) { return 'rgba(14,15,19,' + alpha + ')'; }
  function toneStyle(tone, alpha) {
    var v = Math.round(lerp(16, 152, tone));
    return 'rgba(' + v + ',' + v + ',' + v + ',' + alpha + ')';
  }

  /* ---------- 预渲染的柔和块：既当影子，也当晕染 ---------- */
  var softCache = Object.create(null);
  function softSprite(size, rgb, peak) {
    var key = size + '_' + rgb.join('_') + '_' + peak;
    if (softCache[key]) { return softCache[key]; }
    if (typeof document === 'undefined') { return null; }
    var cv = document.createElement('canvas');
    cv.width = cv.height = size;
    var g = cv.getContext('2d');
    var grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(' + rgb.join(',') + ',' + peak + ')');
    grad.addColorStop(0.35, 'rgba(' + rgb.join(',') + ',' + peak * 0.55 + ')');
    grad.addColorStop(0.68, 'rgba(' + rgb.join(',') + ',' + peak * 0.16 + ')');
    grad.addColorStop(1, 'rgba(' + rgb.join(',') + ',0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    softCache[key] = cv;
    return cv;
  }

  /* ---------- 纸纹：一格噪点平铺整屏 ---------- */
  var grainTile = null;
  var grainPat = null;
  function getGrainPattern(ctx) {
    if (grainPat) { return grainPat; }
    if (typeof document === 'undefined') { return null; }
    if (!grainTile) {
      var size = 128;
      var cv = document.createElement('canvas');
      cv.width = cv.height = size;
      var g = cv.getContext('2d');
      var img = g.createImageData(size, size);
      var rand = mulberry32(97531);
      for (var i = 0; i < img.data.length; i += 4) {
        var v = Math.round(128 + (rand() - 0.5) * 60);
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = rand() < 0.32 ? 24 : 0;
      }
      g.putImageData(img, 0, 0);
      grainTile = cv;
    }
    grainPat = ctx.createPattern(grainTile, 'repeat');
    return grainPat;
  }

  /* ---------- 绕轴旋转（给“面”用） ---------- */
  function rotAxis(v, axis, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    var d = v[0] * axis[0] + v[1] * axis[1] + v[2] * axis[2];
    var cx = axis[1] * v[2] - axis[2] * v[1];
    var cy = axis[2] * v[0] - axis[0] * v[2];
    var cz = axis[0] * v[1] - axis[1] * v[0];
    return [
      v[0] * c + cx * s + axis[0] * d * (1 - c),
      v[1] * c + cy * s + axis[1] * d * (1 - c),
      v[2] * c + cz * s + axis[2] * d * (1 - c)
    ];
  }

  function createScene(cfg) {
    cfg = cfg || {};
    var rng = mulberry32(cfg.seed || 20261014);
    var topics = cfg.topics || [];
    var nodes = [];
    var edges = [];
    var planes = [];
    var smudges = [];
    var sparks = [];
    var byId = Object.create(null);
    var rings = [];
    var specks = [];

    var R_TOPIC = cfg.ringRadius || 264;
    var R_CHILD = cfg.childRadius || 92;
    var DUST_COUNT = cfg.dust === undefined ? 88 : cfg.dust;
    var SPARK_COUNT = cfg.sparks === undefined ? 4 : cfg.sparks;
    var RELAY_COUNT = cfg.relays === undefined ? 2 : cfg.relays;
    var CAM_DIST = 880;

    function pushNode(n) {
      n.alpha = n.alpha === undefined ? 1 : n.alpha;
      n.targetAlpha = n.alpha;
      n._sx = 0; n._sy = 0; n._s = 1; n._z = 0; n._vis = n.alpha;
      nodes.push(n);
      byId[n.id] = n;
      return n;
    }

    function pushEdge(a, b, kind, opt) {
      opt = opt || {};
      var e = {
        a: byId[a], b: byId[b], kind: kind,
        w: opt.w || 1,
        pulse: !!opt.pulse,
        speed: opt.speed || 0.13,
        t: rng(),
        vis: 1
      };
      edges.push(e);
      return e;
    }

    /* ---------- 1. 中心节点 ---------- */
    pushNode({
      id: 'core', kind: 'core', tone: TONE.core,
      label: cfg.coreLabel || '',
      topic: cfg.coreTopic || null,
      x: 0, y: 0, z: 0, r: 36
    });

    /* ---------- 2. 主题节点、装饰星点、主干中继、子节点 ---------- */
    var ringTopics = topics.filter(function (t) { return t.node && t.node !== 'core'; });

    ringTopics.forEach(function (t, i) {
      var ang = i / ringTopics.length * TAU + 0.62;
      var rad = R_TOPIC * (0.94 + rng() * 0.14);
      var px = Math.cos(ang) * rad;
      var py = Math.sin(i * 1.9 + 0.5) * 112;
      var pz = Math.sin(ang) * rad;

      pushNode({
        id: t.node, kind: 'topic', tone: TONE.topic,
        label: t.label, topic: t.id,
        x: px, y: py, z: pz, r: 23
      });

      /* 主干：中心 → 中继 → 中继 → 主题，比一根直线更像“神经” */
      var prev = 'core';
      for (var r = 1; r <= RELAY_COUNT; r++) {
        var f = r / (RELAY_COUNT + 1);
        var rx = px * f + (rng() - 0.5) * 46;
        var ry = py * f + (rng() - 0.5) * 46;
        var rz = pz * f + (rng() - 0.5) * 46;
        var rid = 'relay-' + t.id + '-' + r;
        pushNode({
          id: rid, kind: 'relay', tone: TONE.relay,
          label: '', topic: t.id,
          x: rx, y: ry, z: rz, r: 8 + rng() * 3
        });
        pushEdge(prev, rid, 'spine', { w: 1.5, pulse: r === 1, speed: 0.09 + rng() * 0.05 });
        prev = rid;
      }
      pushEdge(prev, t.node, 'spine', { w: 1.5, pulse: false });

      /* 主题周围的小星点：只是装饰，让每个主题像一小团神经组织 */
      var cluster = [];
      for (var k = 0; k < SPARK_COUNT; k++) {
        var sa = rng() * TAU;
        var sr = 62 + rng() * 54;
        var sy = (rng() - 0.5) * 74;
        var sid = 'spark-' + t.id + '-' + k;
        pushNode({
          id: sid, kind: 'spark', tone: TONE.spark,
          label: '', topic: t.id,
          x: px + Math.cos(sa) * sr,
          y: py + sy,
          z: pz + Math.sin(sa) * sr,
          r: 5 + rng() * 4
        });
        pushEdge(t.node, sid, 'branch', { w: 0.7 });
        cluster.push(sid);
      }
      for (var c2 = 1; c2 < cluster.length; c2++) {
        sparks.push(cluster[c2 - 1] + '|' + cluster[c2]);
      }

      /* 子节点：面板里的关键词标签 */
      var kids = t.children || [];
      var len = Math.sqrt(px * px + py * py + pz * pz) || 1;
      var ux = px / len, uy = py / len, uz = pz / len;
      var tx = -uz, tz = ux;
      if (Math.sqrt(tx * tx + tz * tz) < 1e-4) { tx = 1; tz = 0; }
      var tlen = Math.sqrt(tx * tx + tz * tz);
      tx /= tlen; tz /= tlen;
      var bx = uy * tz, by = uz * tx - ux * tz, bz = -uy * tx;

      kids.forEach(function (chip, j) {
        var ca = j / kids.length * TAU + 0.35;
        var rr = R_CHILD * (0.85 + rng() * 0.2);
        var ox = (tx * Math.cos(ca) + bx * Math.sin(ca)) * rr + ux * (rng() * 26 - 13);
        var oy = (by * Math.sin(ca)) * rr + uy * (rng() * 26 - 13);
        var oz = (tz * Math.cos(ca) + bz * Math.sin(ca)) * rr + uz * (rng() * 26 - 13);
        pushNode({
          id: t.node + ':' + j, kind: 'child', tone: TONE.child,
          label: chip, topic: t.id,
          x: px + ox, y: py + oy, z: pz + oz,
          r: 12, alpha: 0
        });
        pushEdge(t.node, t.node + ':' + j, 'branch', { w: 1 });
      });
    });

    /* 同一主题的星点之间连几根短线，形成小网 */
    sparks.forEach(function (pair) {
      var ids = pair.split('|');
      pushEdge(ids[0], ids[1], 'branch', { w: 0.6 });
    });

    /* ---------- 3. 背景“铅笔屑”：两层壳，让画面有颗粒感 ---------- */
    var dust = [];
    for (var d = 0; d < DUST_COUNT; d++) {
      var u = rng() * 2 - 1;
      var theta = rng() * TAU;
      var rxy = Math.sqrt(1 - u * u);
      var inner = d % 5 === 0;
      var shell = inner ? (300 + rng() * 120) : (400 + rng() * 260);
      var node = pushNode({
        id: 'dust-' + d, kind: 'dust', tone: TONE.dust, label: '',
        topic: null,
        x: Math.cos(theta) * rxy * shell,
        y: u * shell * 0.74,
        z: Math.sin(theta) * rxy * shell,
        r: (inner ? 5.5 : 3.5) + rng() * 4
      });
      dust.push(node);
    }
    dust.forEach(function (n, i) {
      var best = null, bestD = 1e9;
      for (var j = 0; j < dust.length; j++) {
        if (i === j) { continue; }
        var o = dust[j];
        var dx = o.x - n.x, dy = o.y - n.y, dz = o.z - n.z;
        var dist = dx * dx + dy * dy + dz * dz;
        if (dist < bestD && dist > 1) { bestD = dist; best = o; }
      }
      if (best && bestD < 230 * 230) {
        pushEdge(n.id, best.id, 'dust', { w: 0.8 });
      }
    });

    /* ---------- 4. “面”：几块慢慢转动的浅灰平面 + 大块晕染 ---------- */
    function addPlane(cx, cy, cz, u, v, alpha, speed, filled) {
      var n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0]
      ];
      var l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
      planes.push({
        c: [cx, cy, cz], u: u, v: v,
        n: [n[0] / l, n[1] / l, n[2] / l],
        alpha: alpha, speed: speed, filled: filled !== false
      });
    }
    addPlane(-40, -30, -60, [420, 40, -70], [50, 300, 30], 0.040, 0.030);
    addPlane(120, 40, -220, [300, -60, 120], [40, 220, -40], 0.034, -0.024);
    addPlane(-180, 90, 140, [260, 30, 90], [30, 180, 60], 0.030, 0.019);
    addPlane(60, -110, 200, [240, 20, -80], [36, 260, 50], 0.026, -0.026);

    [
      [-260, -120, -300, 300, 0.085],
      [300, 60, -260, 260, 0.075],
      [-120, 200, 120, 240, 0.06],
      [220, -170, 160, 220, 0.055],
      [0, 40, -420, 380, 0.05]
    ].forEach(function (s) {
      smudges.push({ x: s[0], y: s[1], z: s[2], r: s[3], a: s[4] });
    });

    /* ---------- 5. 装饰轨道（细线圆环） ---------- */
    rings.push({ r: 322, tilt: 0.16, alpha: 0.14, seg: 90 });
    rings.push({ r: 546, tilt: -0.42, alpha: 0.08, seg: 90 });

    /* ---------- 6. 背景纸屑（2D 星点换成铅笔灰点） ---------- */
    for (var s2 = 0; s2 < 110; s2++) {
      specks.push({
        x: rng(),
        y: rng(),
        r: rng() < 0.8 ? 1 : 2,
        a: 0.05 + rng() * 0.16,
        p: rng() * TAU
      });
    }

    /* ---------- 7. 视角与光源状态 ---------- */
    var state = {
      yaw: 0.62, pitch: -0.30,
      targetYaw: 0.62, targetPitch: -0.30,
      easing: false,
      zoom: 1, zoomTarget: 1,
      focusShift: 0,
      autoPause: false,
      dragging: false,
      selected: null,
      hover: null,
      time: 0,
      quality: 2,
      /* 光源：归一化方向 + 屏幕位置，缓慢漂移，也可以跟着鼠标走 */
      lightT: 0,
      lightX: 0.34, lightY: -0.36,
      lightTargetX: 0.34, lightTargetY: -0.36,
      lightPointer: false
    };

    /* ---------- 8. 每帧更新 ---------- */
    function update(dt, opt) {
      var motion = !opt || opt.motion !== false;
      dt = Math.min(Math.max(dt || 0, 0), 0.05);
      if (motion) { state.time += dt; }

      /* 光源：没人动鼠标时自己慢慢漂移；鼠标一动就跟着鼠标 */
      if (motion) { state.lightT += dt; }
      if (!state.lightPointer) {
        state.lightTargetX = Math.cos(state.lightT * 0.16) * 0.5 + 0.06;
        state.lightTargetY = Math.sin(state.lightT * 0.11) * 0.34 - 0.30;
      }
      var kl = 1 - Math.exp(-1.8 * dt);
      state.lightX = lerp(state.lightX, state.lightTargetX, kl);
      state.lightY = lerp(state.lightY, state.lightTargetY, kl);

      /* 自转、缓动这些只是算角度，几乎不花性能，任何画质档位都保留 */
      var auto = motion && !state.dragging && !state.autoPause && !state.selected;
      if (auto) {
        state.yaw += 0.05 * dt;
        state.targetYaw += 0.05 * dt;
      }

      if (state.easing) {
        var k = 1 - Math.exp(-4.6 * dt);
        state.yaw = lerp(state.yaw, state.targetYaw, k);
        state.pitch = lerp(state.pitch, state.targetPitch, k);
        if (Math.abs(state.yaw - state.targetYaw) < 0.0015 && Math.abs(state.pitch - state.targetPitch) < 0.0015) {
          state.yaw = state.targetYaw;
          state.pitch = state.targetPitch;
          state.easing = false;
        }
      }

      state.zoom = lerp(state.zoom, state.zoomTarget, 1 - Math.exp(-7 * dt));
      state.focusShift = lerp(state.focusShift, state.selected ? 1 : 0, 1 - Math.exp(-5 * dt));

      var ka = 1 - Math.exp(-8 * dt);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var ta;
        if (!state.selected) {
          ta = n.kind === 'child' ? 0 : 1;
        } else if (n.kind === 'child') {
          ta = n.topic === state.selected ? 1 : 0;
        } else if (n.kind === 'dust') {
          ta = 0.34;
        } else if (n.kind === 'core') {
          ta = state.selected === cfg.coreTopic ? 1.15 : 0.14;
        } else if (n.kind === 'spark' || n.kind === 'relay') {
          ta = state.selected && n.topic === state.selected ? 1 : 0.3;
        } else {
          ta = n.topic === state.selected ? 1.25 : 0.2;
        }
        n.targetAlpha = ta;
        n.alpha = lerp(n.alpha, ta, ka);
      }

      for (var e = 0; e < edges.length; e++) {
        var ed = edges[e];
        if (motion && ed.speed) { ed.t = (ed.t + dt * ed.speed) % 1; }
        var vis;
        if (ed.kind === 'branch') {
          vis = Math.min(ed.a.alpha, ed.b.alpha);
        } else if (ed.kind === 'dust') {
          vis = 0.5 * (state.selected ? 0.4 : 1);
        } else {
          vis = clamp(Math.min(ed.a.alpha, ed.b.alpha) * 1.05, 0.12, 1.15);
        }
        ed.vis = vis;
      }
    }

    /* ---------- 9. 投影：3D 坐标 → 屏幕坐标 ---------- */
    var m = {
      cy: 1, sy: 0, cp: 1, sp: 0, focal: 1, cx: 0, cyy: 0,
      lightSX: 0, lightSY: 0, lightDiag: 1
    };

    function setupMatrix(w, h) {
      m.cy = Math.cos(state.yaw); m.sy = Math.sin(state.yaw);
      m.cp = Math.cos(state.pitch); m.sp = Math.sin(state.pitch);
      m.focal = Math.min(w, h) * 0.94 * state.zoom;
      var fa = state.focusShift;
      var landscape = w >= h;
      m.cx = w / 2 - (landscape ? w * 0.075 : 0) * fa;
      m.cyy = h / 2 - (landscape ? 0 : h * 0.10) * fa;
      m.lightSX = w * (0.5 + state.lightX * 0.44);
      m.lightSY = h * (0.5 + state.lightY * 0.42);
      m.lightDiag = Math.sqrt(w * w + h * h) * 0.42;
    }

    function projectPoint(x, y, z) {
      var x1 = x * m.cy + z * m.sy;
      var z1 = -x * m.sy + z * m.cy;
      var y2 = y * m.cp - z1 * m.sp;
      var z2 = y * m.sp + z1 * m.cp;
      var dist = Math.max(90, CAM_DIST + z2);
      var sc = m.focal / dist;
      return { sx: m.cx + x1 * sc, sy: m.cyy + y2 * sc, s: sc, z: z2 };
    }

    function projectAll(w, h) {
      setupMatrix(w, h);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        var p = projectPoint(n.x, n.y, n.z);
        n._sx = p.sx; n._sy = p.sy; n._s = p.s; n._z = p.z;
        n._vis = n.alpha * clamp(1 - (p.z + 300) / 1250, 0.25, 1);
      }
    }

    /* ---------- 10. 点击 / 悬停命中判断 ---------- */
    function hitTest(px, py) {
      var best = null, bestScore = Infinity;
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (n.kind === 'dust') { continue; }
        if (n.alpha < 0.3) { continue; }
        var rad = Math.max(15, n.r * n._s * 1.5 + 8);
        var dx = px - n._sx, dy = py - n._sy;
        var d2 = dx * dx + dy * dy;
        if (d2 > rad * rad) { continue; }
        var score = d2 / (n._s * 100);
        if (score < bestScore) { bestScore = score; best = n; }
      }
      return best;
    }

    /* ---------- 11. 绘制 ---------- */
    var bgCache = { w: 0, h: 0, base: null };

    function drawPaper(ctx, w, h, motion) {
      if (!bgCache.base || bgCache.w !== w || bgCache.h !== h) {
        var base = ctx.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.08,
          w * 0.5, h * 0.5, Math.max(w, h) * 0.82);
        base.addColorStop(0, '#f1f0ed');
        base.addColorStop(0.55, '#e8e6e2');
        base.addColorStop(1, '#d7d6d1');
        bgCache = { w: w, h: h, base: base };
      }
      ctx.fillStyle = bgCache.base;
      ctx.fillRect(0, 0, w, h);

      /* 会移动的光：在纸面上照亮一块，四周自然沉下去 */
      var pool = ctx.createRadialGradient(m.lightSX, m.lightSY, 0, m.lightSX, m.lightSY, Math.max(w, h) * 0.7);
      pool.addColorStop(0, 'rgba(255,255,255,0.78)');
      pool.addColorStop(0.40, 'rgba(255,255,255,0.36)');
      pool.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = pool;
      ctx.fillRect(0, 0, w, h);

      /* 纸纹 */
      if (state.quality >= 2) {
        var pat = getGrainPattern(ctx);
        if (pat) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = pat;
          ctx.fillRect(0, 0, w, h);
          ctx.globalAlpha = 1;
        }
      }

      /* 背景纸屑：随左右旋转轻微视差 */
      var shift = motion ? state.yaw * 0.13 : 0;
      for (var i = 0; i < specks.length; i++) {
        var sp = specks[i];
        var sx = ((sp.x - shift) % 1 + 1) % 1 * w;
        var sy = sp.y * h;
        var tw = motion ? 0.62 + 0.38 * Math.sin(state.time * 0.8 + sp.p) : 0.8;
        ctx.fillStyle = 'rgba(26,28,34,' + (sp.a * tw) + ')';
        ctx.fillRect(sx, sy, sp.r, sp.r);
      }
    }

    /* 大块晕染 = “面” */
    function drawSmudges(ctx) {
      var sprite = softSprite(128, [24, 26, 32], 0.5);
      if (!sprite) { return; }
      for (var i = 0; i < smudges.length; i++) {
        var s = smudges[i];
        var p = projectPoint(s.x, s.y, s.z);
        var size = s.r * p.s * 2;
        ctx.globalAlpha = clamp(s.a * clamp(1 - (p.z + 300) / 1500, 0.3, 1), 0, 1);
        ctx.drawImage(sprite, p.sx - size / 2, p.sy - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
    }

    /* 浅灰平面 = “面”的几何部分 */
    function drawPlanes(ctx) {
      var list = planes.slice();
      list.forEach(function (pl) {
        pl._z = projectPoint(pl.c[0], pl.c[1], pl.c[2]).z;
      });
      list.sort(function (a, b) { return b._z - a._z; });

      for (var i = 0; i < list.length; i++) {
        var pl = list[i];
        var ang = state.time * pl.speed;
        var u = pl.speed ? rotAxis(pl.u, pl.n, ang) : pl.u;
        var v = pl.speed ? rotAxis(pl.v, pl.n, ang) : pl.v;
        var c = pl.c;
        var pts = [];
        var signs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        for (var j = 0; j < 4; j++) {
          var sx2 = signs[j][0] / 2, sy2 = signs[j][1] / 2;
          pts.push(projectPoint(
            c[0] + u[0] * sx2 + v[0] * sy2,
            c[1] + u[1] * sx2 + v[1] * sy2,
            c[2] + u[2] * sx2 + v[2] * sy2
          ));
        }
        ctx.beginPath();
        ctx.moveTo(pts[0].sx, pts[0].sy);
        for (var k2 = 1; k2 < 4; k2++) { ctx.lineTo(pts[k2].sx, pts[k2].sy); }
        ctx.closePath();
        if (pl.filled) {
          /* 面的明暗跟着光源走：靠近光的角更亮，背光的一侧沉下去 */
          var near = pts[0], far = pts[0];
          var nd = Infinity, fd = -Infinity;
          for (var q = 0; q < 4; q++) {
            var ddx = pts[q].sx - m.lightSX, ddy = pts[q].sy - m.lightSY;
            var dd = ddx * ddx + ddy * ddy;
            if (dd < nd) { nd = dd; near = pts[q]; }
            if (dd > fd) { fd = dd; far = pts[q]; }
          }
          var grad = ctx.createLinearGradient(near.sx, near.sy, far.sx, far.sy);
          grad.addColorStop(0, ink(pl.alpha * 0.35));
          grad.addColorStop(1, ink(pl.alpha * 1.7));
          ctx.fillStyle = grad;
          ctx.fill();
        }
        ctx.strokeStyle = ink(pl.alpha * 2.6);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    function drawRings(ctx) {
      for (var i = 0; i < rings.length; i++) {
        var ring = rings[i];
        var ct = Math.cos(ring.tilt), st = Math.sin(ring.tilt);
        ctx.beginPath();
        for (var j = 0; j <= ring.seg; j++) {
          var a = j / ring.seg * TAU;
          var x = Math.cos(a) * ring.r;
          var z0 = Math.sin(a) * ring.r;
          var p = projectPoint(x, -z0 * st, z0 * ct);
          if (j === 0) { ctx.moveTo(p.sx, p.sy); } else { ctx.lineTo(p.sx, p.sy); }
        }
        ctx.strokeStyle = ink(ring.alpha);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    function drawEdges(ctx) {
      var order = edges.slice().sort(function (a, b) {
        return (b.a._z + b.b._z) - (a.a._z + a.b._z);
      });
      for (var i = 0; i < order.length; i++) {
        var e = order[i];
        if (e.vis < 0.03) { continue; }
        var depth = clamp(1 - ((e.a._z + e.b._z) / 2 + 320) / 1400, 0.16, 1);
        var isDust = e.kind === 'dust';
        var width = lerp(0.55, 1.7, depth) * e.w;
        var alpha = (isDust ? 0.16 : 0.42) * e.vis * depth;

        ctx.beginPath();
        ctx.moveTo(e.a._sx, e.a._sy);
        ctx.lineTo(e.b._sx, e.b._sy);
        ctx.strokeStyle = ink(alpha);
        ctx.lineWidth = width;
        ctx.stroke();

        /* 主干再补一道很淡的偏移线，像手绘时重描了一遍 */
        if (!isDust && e.kind === 'spine' && state.quality >= 2) {
          ctx.beginPath();
          ctx.moveTo(e.a._sx + 0.9, e.a._sy + 0.7);
          ctx.lineTo(e.b._sx + 0.9, e.b._sy + 0.7);
          ctx.strokeStyle = ink(alpha * 0.35);
          ctx.lineWidth = width * 0.8;
          ctx.stroke();
        }
      }

      /* 沿主干跑动的墨点 */
      if (state.quality > 0) {
        var dot = softSprite(32, [10, 11, 15], 0.9);
        for (var k = 0; k < edges.length; k++) {
          var pe = edges[k];
          if (!pe.pulse || pe.vis < 0.15 || pe.kind !== 'spine') { continue; }
          var p = projectPoint(
            lerp(pe.a.x, pe.b.x, pe.t),
            lerp(pe.a.y, pe.b.y, pe.t),
            lerp(pe.a.z, pe.b.z, pe.t)
          );
          var size = clamp(p.s * 22, 4, 14);
          ctx.globalAlpha = clamp(0.75 * pe.vis, 0, 1);
          if (dot) { ctx.drawImage(dot, p.sx - size / 2, p.sy - size / 2, size, size); }
          ctx.globalAlpha = 1;
        }
      }
    }

    function drawNodes(ctx) {
      var order = nodes.slice().sort(function (a, b) { return b._z - a._z; });
      var font = '"Segoe UI", "Microsoft YaHei", "PingFang SC", system-ui, sans-serif';
      var shadow = softSprite(64, [22, 24, 30], 0.45);

      for (var i = 0; i < order.length; i++) {
        var n = order[i];
        var alpha = n.alpha * clamp(1 - (n._z + 300) / 1500, 0.25, 1);
        if (alpha < 0.02) { continue; }
        var selected = !!(n.topic && n.topic === state.selected && n.kind !== 'child');
        var hovered = state.hover === n;
        var radius = Math.max(0.9, n.r * n._s * 0.5) * (selected ? 1.22 : 1) * (hovered ? 1.14 : 1);

        /* 影子：从光源往外的方向投影，光源一动影子就跟着动 */
        if (shadow && (n.kind !== 'dust' || state.quality >= 2)) {
          var ddx = n._sx - m.lightSX;
          var ddy = n._sy - m.lightSY;
          var dl = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
          var len = 5 + 19 * clamp(dl / m.lightDiag, 0, 1.6);
          var ssize = radius * (n.kind === 'dust' ? 4.2 : 6.4);
          ctx.globalAlpha = clamp(0.26 * alpha * (n.kind === 'dust' ? 0.5 : 1), 0, 1);
          ctx.drawImage(shadow,
            n._sx + ddx / dl * len - ssize / 2,
            n._sy + ddy / dl * len - ssize / 2,
            ssize, ssize);
        }

        /* 墨点本体 */
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.beginPath();
        ctx.arc(n._sx, n._sy, radius, 0, TAU);
        ctx.fillStyle = toneStyle(n.tone, 1);
        ctx.fill();

        /* 主题与中心：外面再套一圈细线 */
        var ringR = radius * (n.kind === 'core' ? 2.2 : 2.0);
        if (n.kind === 'topic' || n.kind === 'core') {
          ctx.beginPath();
          ctx.arc(n._sx, n._sy, ringR, 0, TAU);
          if (selected) {
            ctx.setLineDash([4, 5]);
            ctx.lineDashOffset = -state.time * 22;
          }
          ctx.strokeStyle = ink(clamp(alpha * (selected ? 0.85 : 0.28), 0, 1));
          ctx.lineWidth = selected ? 1.6 : 1;
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.lineDashOffset = 0;
        }
        ctx.globalAlpha = 1;

        /* 文字：纸色描边 + 墨色字，浅灰底上也看得清 */
        var coreLabelOk = n.kind !== 'core' || !state.selected || state.selected === cfg.coreTopic || hovered;
        var showLabel = n.label && coreLabelOk && (n.kind === 'core' || n.kind === 'topic' ||
          (n.kind === 'child' && alpha > 0.32) || hovered);
        if (showLabel) {
          var fs = clamp(n._s * (n.kind === 'core' ? 22 : (n.kind === 'topic' ? 17 : 13.5)), 10, 30);
          ctx.font = (n.kind === 'topic' || n.kind === 'core' ? '600 ' : '500 ') + fs.toFixed(1) + 'px ' + font;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          var ly = n._sy + ringR + fs * 0.95;
          ctx.lineWidth = Math.max(3, fs * 0.34);
          ctx.strokeStyle = 'rgba(248,247,244,0.92)';
          ctx.strokeText(n.label, n._sx, ly);
          ctx.fillStyle = hovered ? '#000000' : ink(clamp(alpha * (selected ? 1 : 0.8), 0, 1));
          ctx.fillText(n.label, n._sx, ly);
        }
      }
    }

    function render(ctx, w, h, opt) {
      var motion = !opt || opt.motion !== false;
      projectAll(w, h);
      ctx.clearRect(0, 0, w, h);
      drawPaper(ctx, w, h, motion);
      drawSmudges(ctx);
      drawPlanes(ctx);
      drawRings(ctx);
      drawEdges(ctx);
      drawNodes(ctx);
    }

    /* ---------- 12. 交互接口 ---------- */

    /* 选中某个主题：镜头转到它正对屏幕的位置，并展开它的子节点 */
    function select(topicId) {
      state.selected = topicId || null;
      if (!topicId) {
        state.easing = false;
        state.targetYaw = state.yaw;
        state.targetPitch = state.pitch;
        return;
      }
      var target = null;
      for (var i = 0; i < nodes.length; i++) {
        if (nodes[i].topic === topicId && nodes[i].kind === 'topic') { target = nodes[i]; break; }
        if (!target && nodes[i].topic === topicId && nodes[i].kind === 'core') { target = nodes[i]; }
      }
      if (!target) { return; }
      var horiz = Math.sqrt(target.x * target.x + target.z * target.z);
      var desiredYaw = horiz < 1e-6 ? state.yaw : Math.atan2(-target.x, target.z) + Math.PI;
      var desiredPitch = horiz < 1e-6 ? 0 : Math.atan2(-target.y, horiz);
      var k = Math.round((state.yaw - desiredYaw) / TAU);
      state.targetYaw = desiredYaw + k * TAU;
      state.targetPitch = clamp(desiredPitch, -1.15, 1.15);
      state.easing = true;
    }

    /* 拖动旋转：直接改变角度，并停止缓动 */
    function nudge(dyaw, dpitch) {
      state.yaw += dyaw;
      state.targetYaw = state.yaw;
      if (dpitch) {
        state.pitch = clamp(state.pitch + dpitch, -1.2, 1.2);
        state.targetPitch = state.pitch;
      }
      state.easing = false;
    }

    function zoomBy(factor) {
      state.zoomTarget = clamp(state.zoomTarget * factor, 0.62, 2.4);
    }

    /* 复位视角：回到最初的机位，并清空选中 */
    function resetView() {
      state.selected = null;
      state.autoPause = false;
      var k = Math.round((state.yaw - 0.62) / TAU);
      state.targetYaw = 0.62 + k * TAU;
      state.targetPitch = -0.30;
      state.zoomTarget = 1;
      state.easing = true;
    }

    /* 鼠标位置 → 光源位置（归一化到 -1..1） */
    function pointLight(nx, ny) {
      state.lightPointer = true;
      state.lightTargetX = clamp(nx, -1.4, 1.4);
      state.lightTargetY = clamp(ny, -1.4, 1.4);
    }

    function releaseLight() { state.lightPointer = false; }

    return {
      nodes: nodes,
      edges: edges,
      rings: rings,
      planes: planes,
      smudges: smudges,
      state: state,
      TONE: TONE,
      update: update,
      render: render,
      projectAll: projectAll,
      projectPoint: projectPoint,
      hitTest: hitTest,
      select: select,
      nudge: nudge,
      zoomBy: zoomBy,
      resetView: resetView,
      pointLight: pointLight,
      releaseLight: releaseLight
    };
  }

  return {
    createScene: createScene,
    clamp: clamp,
    mulberry32: mulberry32,
    TAU: TAU
  };
});
