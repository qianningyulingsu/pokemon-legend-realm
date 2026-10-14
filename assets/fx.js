/* ==========================================================================
   宝可梦~传说界域 · 视觉增强引擎 (fx.js)
   --------------------------------------------------------------------------
   在 app.js 渲染完成后做「后处理」，把正文变成有层次的排版：
     · 条目编号 → 徽章
     · 序言/诗词 → 居中诗词块
     · 机制条 → 强调底纹
     · 要点行（①②③ / ·）→ 悬挂缩进
     · 滚动显现 / 阅读进度 / 回到顶部 / 鼠标光泽
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- 工具 ---------- */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* 条目编号：1. / 12、/ 一、/ ① */
  var RE_NO = /^(\d{1,2}\s*[.、]|[一二三四五六七八九十]{1,3}\s*[．.、]|[①-⑳])\s*/;
  /* 诗词特征 */
  var RE_VERSE = /[兮矣哉焉]|[，、][^，。]{2,10}[，。]/;
  var POEM_HEAD = /(序言|序词|贺词|致辞|祭|铭|赋|题记|前言|终言|献词)/;

  /* 剥离标题开头的编号并返回它（用 TreeWalker 找第一个有内容的文本节点） */
  function stripLeadingNo(el) {
    if (!document.createTreeWalker) return null;
    var w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null), n;
    while ((n = w.nextNode())) {
      var v = n.nodeValue;
      if (!v || !v.trim()) continue;
      var m = RE_NO.exec(v.trim());
      if (m) {
        n.nodeValue = v.replace(RE_NO, '');
        return m[1].replace(/[.、．\s]/g, '');
      }
      return null;   // 第一个非空文本节点没有编号
    }
    return null;
  }

  /* ================= 1. 正文后处理 ================= */
  function enhanceDoc(root) {
    if (!root) return;
    var body = $('.doc-body', root) || root;

    /* --- 1.1 条目标题 → 编号徽章 --- */
    $$('.entry-h', body).forEach(function (h) {
      if (h.querySelector('.e-no')) return;
      var no = stripLeadingNo(h);
      if (no) h.insertAdjacentHTML('afterbegin', '<span class="e-no">' + no + '</span>');
    });

    /* --- 1.2 序言 / 诗词块 --- */
    $$('h2.sec,h3.sec', body).forEach(function (h) {
      if (!POEM_HEAD.test(h.textContent)) return;
      var node = h.nextElementSibling, n = 0;
      var group = [];
      while (node && n < 10) {
        if (/^(H2|H3|SECTION)$/.test(node.tagName)) break;
        if (node.classList && node.classList.contains('entry')) break;
        var t = node.textContent.trim();
        if (t && t.length <= 46) group.push(node);
        else if (group.length) break;
        node = node.nextElementSibling;
        n++;
      }
      if (group.length >= 2) {
        group.forEach(function (p) { p.classList.add('poem'); });
      }
    });
    /* 独立的对仗句（短 + 含顿号/兮） */
    $$('.doc-body p.para', body).forEach(function (p) {
      if (p.classList.contains('poem')) return;
      var t = p.textContent.trim();
      if (t.length >= 8 && t.length <= 30 && RE_VERSE.test(t) && !/[：:]/.test(t)) {
        p.classList.add('poem');
      }
    });

    /* --- 1.3 机制条强调 --- */
    var RE_MECH = /^机制[一二三四五六七八九十百\d]{1,4}/;
    $$('.entry-h', body).forEach(function (h) {
      if (RE_MECH.test(h.textContent.trim())) h.classList.add('mch');
    });

    /* --- 1.4 要点行悬挂缩进 --- */
    $$('.doc-body p.para', body).forEach(function (p) {
      if (p.classList.contains('poem')) return;
      if (/^[①-⑳]/.test(p.textContent.trim())) p.classList.add('pt');
    });
  }

  /* ================= 2. 滚动显现 ================= */
  var io = null;
  function initReveal(root) {
    if (io) io.disconnect();
    var targets = $$('.doc-body .entry, .doc-body h2.sec, .doc-body h3.sec, .boards .board-card, .qa-card', root || document);
    if (!targets.length || !('IntersectionObserver' in window)) return;
    targets.forEach(function (el, i) {
      el.classList.add('rv');
      if (i % 3 === 1) el.classList.add('d1');
      if (i % 3 === 2) el.classList.add('d2');
    });
    io = new IntersectionObserver(function (ents) {
      ents.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.02 });
    targets.forEach(function (el) { io.observe(el); });
  }

  /* ================= 3. 阅读进度条 ================= */
  function initProgress() {
    if ($('.rpbar')) return;
    var bar = document.createElement('div');
    bar.className = 'rpbar';
    document.body.appendChild(bar);
    var raf = null;
    function upd() {
      raf = null;
      var h = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = h > 0 ? Math.min(100, (window.scrollY / h) * 100) + '%' : '0%';
    }
    window.addEventListener('scroll', function () {
      if (!raf) raf = requestAnimationFrame(upd);
    }, { passive: true });
    window.addEventListener('resize', upd);
    upd();
  }

  /* ================= 4. 回到顶部 ================= */
  function initTotop() {
    if ($('.totop')) return;
    var b = document.createElement('div');
    b.className = 'totop';
    b.innerHTML = '↑';
    b.title = '回到顶部';
    document.body.appendChild(b);
    b.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    window.addEventListener('scroll', function () {
      b.classList.toggle('on', window.scrollY > 520);
    }, { passive: true });
  }

  /* ================= 5. 鼠标光泽跟随 ================= */
  function initSheen(root) {
    // 首页卡片加 sheen 层
    $$('.board-card', root || document).forEach(function (c) {
      if (!$('.sheen', c)) {
        var s = document.createElement('span');
        s.className = 'sheen';
        c.appendChild(s);
      }
    });
    document.addEventListener('mousemove', function (e) {
      var t = e.target.closest ? e.target.closest('.entry,.board-card') : null;
      if (!t) return;
      var r = t.getBoundingClientRect();
      t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      t.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }

  /* ================= 6. 对外接口 ================= */
  window.LJFX = {
    /* 每次路由渲染完后调用 */
    apply: function (root) {
      var v = root || document.getElementById('view');
      enhanceDoc(v);
      // 语义分层：卡名/技能/机制/字段 各归其类
      if (window.LJFX_LAYER) { try { window.LJFX_LAYER.apply(v); } catch (e) {} }
      initReveal(v);
      initSheen(v);
    },
    boot: function () {
      initProgress();
      initTotop();
    }
  };
})();
