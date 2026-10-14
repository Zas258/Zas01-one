/*!
 * app.js · 页面逻辑
 * 结构：
 *   一、内容区  —— 想改昵称、爱好、方向、链接，只改这一段就够了
 *   二、界面逻辑 —— 导航、内容面板、鼠标/触摸/键盘操作、动效开关
 * 依赖：engine.js（同目录），没有任何外部库、字体和网络请求。
 */
(function () {
  'use strict';

  /* ============================================================
   * 一、内容区（改这里就行）
   * ============================================================ */

  var PROFILE = {
    nickname: '王权业',
    tagline: '神经元空间 · NEURON SPACE',
    /* 名字下面显示的小标签，可以随意增减 */
    tags: ['游戏', '硬件'],
    /* 头像：现在用的是自己提供的素描画，已经裁成正方形存成 assets/avatar.jpg。
       想换成别的图片：把图片复制到 assets/ 文件夹，
       再把下面一行改成 './assets/你的图片名.jpg'（或 .png）即可。
       avatar.svg 是按昵称做的图形徽章，留着当备用，图片加载失败时会自动用它。 */
    avatar: './assets/avatar.jpg',
    avatarFallback: './assets/avatar.svg'
  };

  /* 每一个主题 = 神经网络里的一个神经元 + 左侧的一个导航项。
     chips    ：面板里显示的关键词标签，同时会变成该神经元的子节点
     items    ：可选，用来展示账号等“可复制/可跳转”的条目
     note     ：可选，面板底部的一行小字
     children ：不需要单独写；只有「关于我」这一个主题不展开子节点 */
  var TOPICS = [
    {
      id: 'about',
      node: 'core',
      code: 'CORE',
      label: '关于我',
      title: '王权业',
      lead: '你好，我是王权业。这个页面把我自己做成了一张可以转动的神经网络：每个神经元是一个主题，点开就能看到内容。本页是参加光圈科技实验室（ApertureLab）首次活动的作品。',
      chips: ['游戏', '硬件', '软件开发', '自动化'],
      children: [],
      note: '拖动可以旋转，滚轮或双指可以缩放，点击其他神经元继续看。'
    },
    {
      id: 'hobby',
      node: 'topic-hobby',
      code: 'HOBBIES',
      label: '爱好',
      title: '爱好',
      lead: '平时比较感兴趣的两件事：',
      chips: ['游戏', '硬件']
    },
    {
      id: 'tech',
      node: 'topic-tech',
      code: 'TECH',
      label: '技术探索',
      title: '技术探索方向',
      lead: '在计算机、人工智能、物联网这个范围里，我最感兴趣的方向：',
      chips: ['软件开发', '自动化', '硬件'],
      note: '「感兴趣」不等于「已经掌握」——这些是我愿意继续花时间的方向。'
    },
    {
      id: 'club',
      node: 'topic-club',
      code: 'TEAM',
      label: '社团协作',
      title: '社团协作',
      lead: '在社团里可以搭把手的方向（自述，不是正式职务）：',
      chips: ['宣传', '设计', '技术支持', '资金支持']
    },
    {
      id: 'links',
      node: 'topic-links',
      code: 'LINKS',
      label: '账号入口',
      title: '账号入口',
      lead: '想找我，或者看看我在哪：',
      chips: ['QQ', '抖音', 'B 站'],
      items: [
        { label: 'QQ', value: '2209660299' },
        {
          label: '抖音',
          value: '王权业',
          search: 'https://www.douyin.com/search/%E7%8E%8B%E6%9D%83%E4%B8%9A'
        },
        {
          label: 'B 站',
          value: '王权业',
          search: 'https://search.bilibili.com/all?keyword=%E7%8E%8B%E6%9D%83%E4%B8%9A'
        }
      ],
      note: '抖音和 B 站这里填的是账号名，不是主页链接，所以给的是平台内搜索；QQ 号可以点“复制”。'
    }
  ];

  /* ============================================================
   * 二、界面逻辑（一般不需要改）
   * ============================================================ */

  var byTopic = {};
  TOPICS.forEach(function (t) { byTopic[t.id] = t; });

  var el = {};
  var scene = null;
  var ctx = null;
  var dpr = 1;
  var W = 1;
  var H = 1;
  var motionOn = true;
  var currentTopic = null;
  var lastTrigger = null;
  var navButtons = {};
  var raf = 0;
  var last = 0;
  var fpsAcc = 0;
  var fpsN = 0;
  var slowWindows = 0;

  function $(id) { return document.getElementById(id); }

  function isCompact() { return Math.min(window.innerWidth, window.innerHeight) < 760; }

  /* ---------- 初始化 ---------- */
  function init() {
    el.nav = $('nav');
    el.panel = $('panel');
    el.panelCode = $('panelCode');
    el.panelTitle = $('panelTitle');
    el.panelLead = $('panelLead');
    el.panelChips = $('panelChips');
    el.panelItems = $('panelItems');
    el.panelNote = $('panelNote');
    el.panelClose = $('panelClose');
    el.panelPrev = $('panelPrev');
    el.panelNext = $('panelNext');
    el.tip = $('tip');
    el.live = $('live');
    el.hudFps = $('hudFps');
    el.hudNodes = $('hudNodes');
    el.stage = $('stage');
    el.canvas = $('net');
    el.motionToggle = $('motionToggle');
    el.viewReset = $('viewReset');
    el.hint = $('stageHint');
    el.avatar = $('avatar');
    el.nickname = $('nickname');
    el.tagline = $('tagline');
    el.railTags = $('railTags');

    el.nickname.textContent = PROFILE.nickname;
    el.tagline.textContent = PROFILE.tagline;
    el.avatar.alt = PROFILE.nickname + ' 的头像';
    var avatarFallbackUsed = false;
    el.avatar.addEventListener('error', function () {
      if (avatarFallbackUsed || !PROFILE.avatarFallback) { return; }
      avatarFallbackUsed = true;
      el.avatar.src = PROFILE.avatarFallback;
    });
    el.avatar.src = PROFILE.avatar;
    document.title = PROFILE.nickname + ' · 神经元空间';
    (PROFILE.tags || []).forEach(function (tag) {
      var s = document.createElement('span');
      s.className = 'rail__tagchip';
      s.textContent = tag;
      el.railTags.appendChild(s);
    });
    el.railTags.hidden = !(PROFILE.tags && PROFILE.tags.length);

    ctx = el.canvas.getContext('2d', { alpha: false });

    var reduceMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    motionOn = !(reduceMQ && reduceMQ.matches);

    scene = window.NeuralEngine.createScene({
      seed: 20261014,
      coreLabel: PROFILE.nickname,
      coreTopic: 'about',
      /* 神经元数量：电脑上更密，手机上自动减一些，保证流畅 */
      dust: isCompact() ? 46 : 88,
      sparks: isCompact() ? 2 : 4,
      relays: 2,
      topics: TOPICS.map(function (t) {
        return {
          id: t.id,
          node: t.node,
          label: t.label,
          children: t.children || t.chips || []
        };
      })
    });

    buildNav();
    resize();
    bindStage();
    bindPanel();
    bindMotion();
    updateMotionButton();

    if (reduceMQ) {
      var onMQ = function () {
        motionOn = !reduceMQ.matches;
        updateMotionButton();
      };
      if (reduceMQ.addEventListener) { reduceMQ.addEventListener('change', onMQ); }
      else if (reduceMQ.addListener) { reduceMQ.addListener(onMQ); }
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      } else if (!raf) {
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    });

    el.hudNodes.textContent = String(scene.nodes.length);
    applyHash(true);
    raf = requestAnimationFrame(loop);

    /* 浏览器控制台里的调试入口，方便你自己试参数 */
    window.__neuron = {
      scene: scene,
      topics: TOPICS,
      profile: PROFILE,
      open: openTopic,
      close: closeTopic
    };
    document.body.setAttribute('data-ready', '1');
  }

  /* ---------- 尺寸 ---------- */
  function resize() {
    var rect = el.stage.getBoundingClientRect();
    W = Math.max(1, Math.round(rect.width));
    H = Math.max(1, Math.round(rect.height));
    dpr = Math.min(window.devicePixelRatio || 1, isCompact() ? 1.75 : 2);
    el.canvas.width = Math.round(W * dpr);
    el.canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ---------- 主循环 ---------- */
  function loop(now) {
    raf = requestAnimationFrame(loop);
    var dt = last ? (now - last) / 1000 : 0.016;
    last = now;
    if (dt > 0.25) { dt = 0.016; }

    scene.update(dt, { motion: motionOn });
    scene.render(ctx, W, H, { motion: motionOn });

    fpsAcc += dt;
    fpsN++;
    if (fpsAcc >= 0.5) {
      var fps = fpsN / fpsAcc;
      el.hudFps.textContent = String(Math.round(fps));
      fpsAcc = 0;
      fpsN = 0;
      /* 低端设备自动降一档特效，保证不卡 */
      if (fps < 30 && scene.state.quality > 0) {
        slowWindows++;
        if (slowWindows >= 2) { scene.state.quality--; slowWindows = 0; }
      } else {
        slowWindows = 0;
      }
    }
  }

  /* ---------- 左侧导航 ---------- */
  function buildNav() {
    TOPICS.forEach(function (t, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'navbtn';
      b.setAttribute('data-topic', t.id);

      var idx = document.createElement('span');
      idx.className = 'navbtn__idx';
      idx.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);

      var text = document.createElement('span');
      text.className = 'navbtn__text';
      var label = document.createElement('span');
      label.className = 'navbtn__label';
      label.textContent = t.label;
      var code = document.createElement('span');
      code.className = 'navbtn__code';
      code.textContent = t.code;
      text.appendChild(label);
      text.appendChild(code);

      var dot = document.createElement('span');
      dot.className = 'navbtn__dot';
      dot.setAttribute('aria-hidden', 'true');

      b.appendChild(idx);
      b.appendChild(text);
      b.appendChild(dot);

      b.addEventListener('click', function () {
        if (currentTopic === t.id) { closeTopic(); }
        else { openTopic(t.id, { trigger: b }); }
      });

      el.nav.appendChild(b);
      navButtons[t.id] = b;
    });
  }

  function syncNav(id) {
    TOPICS.forEach(function (t) {
      var b = navButtons[t.id];
      if (!b) { return; }
      var on = t.id === id;
      b.classList.toggle('is-active', on);
      if (on) { b.setAttribute('aria-current', 'true'); }
      else { b.removeAttribute('aria-current'); }
    });
  }

  /* ---------- 画布上的鼠标 / 触摸 / 键盘操作 ---------- */
  function localPoint(clientX, clientY) {
    var r = el.canvas.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  function showTip(x, y, text) {
    el.tip.textContent = text;
    el.tip.style.left = (x + 16) + 'px';
    el.tip.style.top = (y + 12) + 'px';
    el.tip.hidden = false;
  }

  function hideTip() { el.tip.hidden = true; }

  function hideHint() { el.hint.classList.add('is-hidden'); }

  function bindStage() {
    var pointers = new Map();
    var drag = { active: false, id: null, x: 0, y: 0, moved: 0 };
    var pinch = { active: false, dist: 0 };

    function pinchDist() {
      var pts = [];
      pointers.forEach(function (p) { pts.push(p); });
      if (pts.length < 2) { return 0; }
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }

    el.canvas.addEventListener('pointerdown', function (e) {
      try { el.canvas.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size >= 2) {
        pinch.active = true;
        pinch.dist = pinchDist();
        drag.active = false;
        hideTip();
        return;
      }
      drag.active = true;
      drag.id = e.pointerId;
      drag.x = e.clientX;
      drag.y = e.clientY;
      drag.moved = 0;
      scene.state.dragging = true;
      hideTip();
      hideHint();
    });

    el.canvas.addEventListener('pointermove', function (e) {
      var tracked = pointers.get(e.pointerId);
      if (tracked) { tracked.x = e.clientX; tracked.y = e.clientY; }

      if (pinch.active && pointers.size >= 2) {
        var d = pinchDist();
        if (pinch.dist > 0 && d > 0) { scene.zoomBy(d / pinch.dist); }
        pinch.dist = d;
        return;
      }

      if (drag.active && e.pointerId === drag.id) {
        var dx = e.clientX - drag.x;
        var dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 6) {
          scene.nudge(dx * 0.0062, -dy * 0.0055);
          scene.state.autoPause = true;
          el.canvas.classList.add('is-dragging');
          hideTip();
        }
        drag.x = e.clientX;
        drag.y = e.clientY;
        return;
      }

      /* 没有按下时：悬停检测 */
      var p = localPoint(e.clientX, e.clientY);
      var n = scene.hitTest(p.x, p.y);
      scene.state.hover = n;
      el.canvas.style.cursor = n ? 'pointer' : '';
      /* 鼠标位置同时驱动画面里的光源：光会慢慢跟过来，影子跟着转 */
      var rect = el.canvas.getBoundingClientRect();
      scene.pointLight(
        (e.clientX - rect.left) / rect.width * 2 - 1,
        (e.clientY - rect.top) / rect.height * 2 - 1
      );
      if (n && n.label && n.kind !== 'dust') { showTip(p.x, p.y, n.label); }
      else { hideTip(); }
    });

    function endPointer(e, cancelled) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) { pinch.active = false; }
      if (!drag.active || e.pointerId !== drag.id) { return; }
      var wasClick = drag.moved <= 6 && !cancelled;
      drag.active = false;
      scene.state.dragging = false;
      el.canvas.classList.remove('is-dragging');
      if (wasClick) {
        var p = localPoint(e.clientX, e.clientY);
        var n = scene.hitTest(p.x, p.y);
        if (n && n.topic) { openTopic(n.topic, { trigger: el.canvas }); }
        else { closeTopic(); }
      }
    }

    el.canvas.addEventListener('pointerup', function (e) { endPointer(e, false); });
    el.canvas.addEventListener('pointercancel', function (e) { endPointer(e, true); });
    el.canvas.addEventListener('pointerleave', function () {
      if (!drag.active) { scene.state.hover = null; hideTip(); }
      scene.releaseLight();
    });

    el.canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      var d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      scene.zoomBy(Math.exp(-d * 0.0011));
      hideHint();
    }, { passive: false });

    el.canvas.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 0.16 : 0.075;
      switch (e.key) {
        case 'ArrowLeft': scene.nudge(-step, 0); scene.state.autoPause = true; hideHint(); e.preventDefault(); return;
        case 'ArrowRight': scene.nudge(step, 0); scene.state.autoPause = true; hideHint(); e.preventDefault(); return;
        case 'ArrowUp': scene.nudge(0, -step * 0.8); scene.state.autoPause = true; hideHint(); e.preventDefault(); return;
        case 'ArrowDown': scene.nudge(0, step * 0.8); scene.state.autoPause = true; hideHint(); e.preventDefault(); return;
        case '+': case '=': scene.zoomBy(1.12); hideHint(); e.preventDefault(); return;
        case '-': case '_': scene.zoomBy(1 / 1.12); hideHint(); e.preventDefault(); return;
        case 'Escape': closeTopic(); e.preventDefault(); return;
        default: break;
      }
      if (/^[1-9]$/.test(e.key)) {
        var t = TOPICS[parseInt(e.key, 10) - 1];
        if (t) { openTopic(t.id, { trigger: el.canvas, focus: false }); e.preventDefault(); }
      }
    });

    if (window.ResizeObserver) {
      new ResizeObserver(resize).observe(el.stage);
    } else {
      window.addEventListener('resize', resize);
    }
    window.addEventListener('orientationchange', function () { setTimeout(resize, 120); });
  }

  /* ---------- 内容面板 ---------- */
  function bindPanel() {
    el.panelClose.addEventListener('click', function () { closeTopic(); });
    el.panelPrev.addEventListener('click', function () { stepTopic(-1); });
    el.panelNext.addEventListener('click', function () { stepTopic(1); });
    el.panel.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeTopic(); }
    });
  }

  function stepTopic(dir) {
    var i = 0;
    for (var k = 0; k < TOPICS.length; k++) { if (TOPICS[k].id === currentTopic) { i = k; } }
    var n = (i + dir + TOPICS.length) % TOPICS.length;
    openTopic(TOPICS[n].id, { trigger: null });
  }

  function copyText(text, btn) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1200);
    };
    var fallback = function () {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', 'readonly');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch (err) {
        btn.textContent = '复制失败';
        setTimeout(function () { btn.textContent = '复制'; }, 1500);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  function linkRow(item) {
    var row = document.createElement('div');
    row.className = 'linkrow';

    var label = document.createElement('span');
    label.className = 'linkrow__label';
    label.textContent = item.label;

    var value = document.createElement('span');
    value.className = 'linkrow__value';
    value.textContent = item.value;

    var actions = document.createElement('span');
    actions.className = 'linkrow__actions';

    var copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'mini';
    copy.textContent = '复制';
    copy.setAttribute('aria-label', '复制 ' + item.label + '：' + item.value);
    copy.addEventListener('click', function () { copyText(item.value, copy); });
    actions.appendChild(copy);

    if (item.search) {
      var a = document.createElement('a');
      a.className = 'mini';
      a.href = item.search;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = '平台内搜索';
      a.setAttribute('aria-label', '在平台内搜索 ' + item.value);
      actions.appendChild(a);
    }

    row.appendChild(label);
    row.appendChild(value);
    row.appendChild(actions);
    return row;
  }

  function openTopic(id, opt) {
    var t = byTopic[id];
    if (!t) { return; }
    currentTopic = id;
    if (opt && opt.trigger) { lastTrigger = opt.trigger; }

    el.panelCode.textContent = t.code;
    el.panelTitle.textContent = t.title;
    el.panelLead.textContent = t.lead;

    el.panelChips.textContent = '';
    (t.chips || []).forEach(function (c) {
      var li = document.createElement('li');
      li.className = 'chip';
      li.textContent = c;
      el.panelChips.appendChild(li);
    });
    el.panelChips.hidden = !(t.chips && t.chips.length);

    el.panelItems.textContent = '';
    (t.items || []).forEach(function (it) { el.panelItems.appendChild(linkRow(it)); });
    el.panelItems.hidden = !(t.items && t.items.length);

    el.panelNote.textContent = t.note || '';
    el.panelNote.hidden = !t.note;

    el.panel.hidden = false;
    scene.select(id);
    syncNav(id);
    el.live.textContent = '已打开：' + t.label;
    if (!opt || opt.focus !== false) { el.panel.focus({ preventScroll: true }); }
    setHash(id);
  }

  function closeTopic(opt) {
    if (!el.panel || el.panel.hidden) { return; }
    el.panel.hidden = true;
    currentTopic = null;
    scene.select(null);
    syncNav(null);
    setHash('');
    if ((!opt || opt.restoreFocus !== false) && lastTrigger && document.contains(lastTrigger)) {
      lastTrigger.focus({ preventScroll: true });
    }
  }

  function setHash(id) {
    try {
      var url = location.pathname + location.search + (id ? '#' + id : '');
      history.replaceState(null, '', url);
    } catch (err) { /* file:// 或老浏览器可能不允许，忽略即可 */ }
  }

  function applyHash() {
    var id = String(location.hash || '').replace(/^#\/?/, '');
    if (id && byTopic[id]) { openTopic(id, { trigger: null, focus: false }); }
  }

  /* ---------- 动效开关 ---------- */
  function updateMotionButton() {
    el.motionToggle.textContent = '动效 ' + (motionOn ? '开' : '关');
    el.motionToggle.setAttribute('aria-pressed', motionOn ? 'true' : 'false');
    document.body.classList.toggle('motion-off', !motionOn);
  }

  function bindMotion() {
    el.motionToggle.addEventListener('click', function () {
      motionOn = !motionOn;
      updateMotionButton();
    });
    el.viewReset.addEventListener('click', function () {
      closeTopic({ restoreFocus: false });
      scene.resetView();
      el.canvas.focus({ preventScroll: true });
    });
    window.addEventListener('hashchange', applyHash);
  }

  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
})();
