/* ==========================================================================
   宝可梦~传说界域 · 规则查询站
   纯前端：hash 路由 + 本地全文检索，无需服务器，双击 index.html 即可用
   ========================================================================== */
(function () {
  'use strict';

  var D = window.LJ_DATA || { boards: [], docs: {} };
  var DOC = D.docs || {};

  /* 每个板块的主色与徽标字 */
  var BOARD_META = {
    core: { c: '#e9c46a', badge: '核' },
    m1:   { c: '#ef4444', badge: '技' },
    m2:   { c: '#3b82f6', badge: '模' },
    m3:   { c: '#10b981', badge: '精' },
    m4:   { c: '#a78bfa', badge: '优' },
    m5:   { c: '#22d3ee', badge: '规' },
    m6:   { c: '#fb923c', badge: '新' }
  };
  var BOARD_BY_KEY = {};
  D.boards.forEach(function (b) {
    if (!BOARD_META[b.key]) BOARD_META[b.key] = { c: '#4a9eff', badge: b.title.charAt(0) };
    BOARD_BY_KEY[b.key] = b;
  });

  var view = document.getElementById('view');
  var qEl = document.getElementById('q');
  var qClear = document.getElementById('qclear');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  /* ---------------- 工具 ---------------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2200);
  }
  function fmtNum(n) {
    if (n >= 10000) return (n / 10000).toFixed(1).replace(/\.0$/, '') + ' 万';
    return String(n);
  }
  function boardOf(docId) {
    for (var i = 0; i < D.boards.length; i++)
      for (var j = 0; j < D.boards[i].docs.length; j++)
        if (D.boards[i].docs[j].id === docId) return D.boards[i];
    return null;
  }
  function boardMeta(key) { return BOARD_META[key] || { c: '#4a9eff', badge: '·' }; }
  function setAccent(hex) {
    document.documentElement.style.setProperty('--bc', hex);
  }

  /* ---------------- 检索 ---------------- */
  var SEARCH = null;
  function buildSearch() {
    if (SEARCH) return SEARCH;
    SEARCH = [];
    D.boards.forEach(function (b) {
      b.docs.forEach(function (d) {
        var doc = DOC[d.id];
        if (!doc) return;
        var list = doc.index || [];
        for (var i = 0; i < list.length; i++) {
          var row = list[i];
          var title = row[1] || '';
          var text = row[2] || '';
          SEARCH.push({
            doc: d.id, board: b.key, docTitle: d.title, boardTitle: b.title,
            aid: row[0], title: title, text: text,
            hay: (title + '\u0001' + text + '\u0001' + d.title + '\u0001' + b.title).toLowerCase()
          });
        }
      });
    });
    return SEARCH;
  }

  function snippet(text, q) {
    var lt = text.toLowerCase();
    var i = lt.indexOf(q);
    var start = 0;
    if (i > 46) start = i - 46;
    var s = text.slice(start, start + 190);
    if (start > 0) s = '…' + s;
    if (start + 190 < text.length) s = s + '…';
    return s;
  }
  function markQ(s, q) {
    if (!q) return esc(s);
    var out = '', low = s.toLowerCase(), i = 0;
    while (true) {
      var p = low.indexOf(q, i);
      if (p < 0) { out += esc(s.slice(i)); break; }
      out += esc(s.slice(i, p)) + '<mark class="q">' + esc(s.slice(p, p + q.length)) + '</mark>';
      i = p + q.length;
    }
    return out;
  }

  function doSearch(qRaw) {
    var q = qRaw.trim().toLowerCase();
    if (!q) return [];
    var all = buildSearch();
    var hits = [];
    for (var i = 0; i < all.length; i++) {
      var it = all[i];
      var p = it.hay.indexOf(q);
      if (p < 0) continue;
      var score = 0;
      if (it.title.toLowerCase().indexOf(q) >= 0) score += 100;
      if (it.title.toLowerCase() === q) score += 200;
      if (it.docTitle.toLowerCase().indexOf(q) >= 0) score += 40;
      if (p < 4) score += 10;
      if (it.text.length < 90) score += 6;
      hits.push({ it: it, score: score, at: p });
    }
    hits.sort(function (a, b) { return b.score - a.score || a.at - b.at; });
    return hits;
  }

  /* ---------------- 路由 ---------------- */
  function parseHash() {
    var h = location.hash.replace(/^#/, '');
    if (!h || h === '/') return { name: 'home' };
    var parts = h.split('/').filter(function (x) { return x !== ''; });
    if (parts[0] === 'b') return { name: 'board', key: parts[1] };
    if (parts[0] === 'd') return { name: 'doc', id: parts[1], anchor: parts[2] || null };
    if (parts[0] === 's') return { name: 'search', q: decodeURIComponent(parts.slice(1).join('/') || '') };
    if (parts[0] === 'ask') return { name: 'ask' };
    return { name: 'home' };
  }

  function markNav(name) {
    var h = document.getElementById('navHome'), a = document.getElementById('navAsk');
    if (h) h.className = name === 'home' ? 'on' : '';
    if (a) a.className = name === 'ask' ? 'on' : '';
  }

  function route() {
    var r = parseHash();
    window.scrollTo({ top: 0, behavior: 'auto' });
    markNav(r.name === 'ask' ? 'ask' : (r.name === 'home' ? 'home' : ''));
    if (r.name === 'board') renderBoard(r.key);
    else if (r.name === 'doc') renderDoc(r.id, r.anchor);
    else if (r.name === 'ask') renderAsk();
    else if (r.name === 'search') { qEl.value = r.q; renderSearch(r.q); }
    else renderHome();
    // 视觉增强：编号徽章 / 诗词块 / 机制条 / 滚动显现 / 鼠标光泽
    if (window.LJFX) { try { window.LJFX.apply(view); } catch (e) {} }
  }

  /* ---------------- 首页 ---------------- */
  function renderHome() {
    setAccent('#e9c46a');
    qEl.value = '';
    qClear.hidden = true;

    var totalDocs = 0, totalChars = 0;
    D.boards.forEach(function (b) {
      totalDocs += b.docs.length;
      b.docs.forEach(function (d) { totalChars += d.chars || 0; });
    });

    var h = [];
    h.push('<section class="hero">');
    h.push('<div class="hero-kicker">卡牌规则 · 全站速查</div>');
    h.push('<h1>宝可梦<em style="color:var(--gold)">~</em>传说界域</h1>');
    h.push('<p>汇聚全部板块文档。按板块浏览，或直接搜索技能卡名、机制条目、模式名称、精灵阶级，' +
           '命中后一键跳到原文位置并高亮。</p>');
    h.push('<div class="hero-stats">' +
           '<div><b>' + D.boards.length + '</b>大板块</div>' +
           '<div><b>' + totalDocs + '</b>篇文档</div>' +
           '<div><b>' + fmtNum(totalChars) + '</b>字</div>' +
           '</div>');
    h.push('</section>');

    h.push('<div class="sectitle"><h2>板块导航</h2><span>点击进入</span></div><div class="boards">');
    D.boards.forEach(function (b) {
      var m = boardMeta(b.key);
      var empty = b.docs.length === 0;
      h.push('<a class="board-card' + (empty ? ' bc-empty' : '') + '" href="#/b/' + esc(b.key) + '" ' +
             'style="--bc:' + m.c + '">');
      h.push('<div class="bc-top"><span class="bc-badge">' + esc(m.badge) + '</span>' +
             '<span class="bc-name">' + esc(b.title) + '</span></div>');
      h.push('<div class="bc-desc">' + esc(b.desc || '') + '</div>');
      h.push('<div class="bc-foot">' +
             (empty
               ? '<span>暂无内容</span><span class="bc-count">0 篇</span>'
               : '<span>共 <b class="bc-count">' + b.docs.length + '</b> 篇</span><span>进入 →</span>') +
             '</div>');
      h.push('</a>');
    });
    h.push('</div>');

    var hot = [];
    ['技能卡', '机制', '第一模式', '妖神级', '专属年卡', '王者印记', '精灵阶级', '规则'].forEach(function (t) {
      hot.push('<button data-q="' + esc(t) + '">' + esc(t) + '</button>');
    });
    h.push('<div class="sectitle"><h2>热门检索</h2><span>点一下试试</span></div>');
    h.push('<div class="quick" style="justify-content:flex-start">' + hot.join('') + '</div>');

    view.innerHTML = h.join('');
    view.querySelectorAll('.quick button').forEach(function (b) {
      b.addEventListener('click', function () { goSearch(b.dataset.q); });
    });
  }

  /* ---------------- 板块页 ---------------- */
  function renderBoard(key) {
    var b = BOARD_BY_KEY[key];
    if (!b) { renderHome(); return; }
    var m = boardMeta(key);
    setAccent(m.c);
    qEl.value = '';
    qClear.hidden = true;

    var h = [];
    h.push('<div class="crumbs"><a href="#/">首页</a><i>/</i><span>' + esc(b.title) + '</span></div>');
    h.push('<div class="doc-head"><h1>' + esc(b.title) + '</h1>' +
           '<div class="meta"><span>' + esc(b.desc || '') + '</span>' +
           '<span>共 <b>' + b.docs.length + '</b> 篇</span></div></div>');

    if (!b.docs.length) {
      h.push('<div class="empty"><div class="e1">◌</div>' +
             '<div>该板块内容待补充</div>' +
             '<div style="margin-top:8px;font-size:12.5px">把文档放进对应文件夹后重新生成即可</div></div>');
      view.innerHTML = h.join('');
      return;
    }

    h.push('<div class="sectitle"><h2>文档列表</h2><span>共 ' + b.docs.length + ' 篇</span></div><div class="doc-grid">');
    b.docs.forEach(function (d) {
      var label = d.title.length > 12 ? (d.title.slice(0, 10) + '…') : d.title;
      h.push('<a class="doc-item" href="#/d/' + esc(d.id) + '" style="--bc:' + m.c + '">');
      h.push('<span class="di-no">' + esc(d.id.slice(-3).replace(/^0+/, '') || '0') + '</span>');
      h.push('<span class="di-txt"><span class="di-name">' + esc(d.title) + '</span>' +
             '<span class="di-meta">' + (d.chars || 0) + ' 字 · ' + (d.entries || 0) + ' 个条目</span></span>');
      h.push('</a>');
    });
    h.push('</div>');
    view.innerHTML = h.join('');
  }

  /* ---------------- 文档页 ---------------- */
  var spyObserver = null;

  function renderDoc(id, anchor) {
    var doc = DOC[id];
    if (!doc) {
      view.innerHTML = '<div class="empty"><div class="e1">✕</div><div>找不到该文档</div>' +
                       '<div style="margin-top:14px"><a href="#/">← 返回首页</a></div></div>';
      return;
    }
    var b = boardOf(id);
    var m = boardMeta(doc.board);
    setAccent(m.c);

    var idx = (b ? b.docs.findIndex(function (x) { return x.id === id; }) : -1);
    var prev = (b && idx > 0) ? b.docs[idx - 1] : null;
    var next = (b && idx >= 0 && idx < b.docs.length - 1) ? b.docs[idx + 1] : null;

    var outline = doc.outline || [];
    var showToc = outline.length >= 4;

    var h = [];
    h.push('<div class="crumbs"><a href="#/">首页</a><i>/</i>' +
           (b ? '<a href="#/b/' + esc(b.key) + '">' + esc(b.title) + '</a><i>/</i>' : '') +
           '<span>' + esc(doc.title) + '</span></div>');

    h.push('<div class="doc-head"><h1>' + esc(doc.title) + '</h1>' +
           '<div class="meta"><span>' + esc(m.badge + ' ' + (b ? b.title : '')) + '</span>' +
           '<span><b>' + doc.chars + '</b> 字</span>' +
           '<span>' + outline.length + ' 个小节</span>' +
           '<span style="cursor:pointer" id="printlink">打印 / 存 PDF</span>' +
           '</div></div>');

    h.push('<div class="reader' + (showToc ? '' : ' narrow') + '">');
    h.push('<article class="doc-body">' + doc.html + '</article>');

    if (showToc) {
      var t = ['<nav class="toc collapsed" id="toc"><div class="toc-h">本篇目录</div>'];
      outline.forEach(function (o) {
        t.push('<a class="lv' + o.level + '" href="#/d/' + esc(id) + '/' + esc(o.id) + '">' +
               esc(o.text) + '</a>');
      });
      t.push('</nav>');
      h.push(t.join(''));
    }
    h.push('</div>');

    h.push('<div class="pager">');
    h.push(prev
      ? '<a class="pg-l" href="#/d/' + esc(prev.id) + '"><span class="pg-k">← 上一篇</span><span class="pg-n">' + esc(prev.title) + '</span></a>'
      : '<span class="pg-void"></span>');
    h.push(next
      ? '<a class="pg-r" href="#/d/' + esc(next.id) + '"><span class="pg-k">下一篇 →</span><span class="pg-n">' + esc(next.title) + '</span></a>'
      : '<span class="pg-void"></span>');
    h.push('</div>');

    view.innerHTML = h.join('');

    var pl = document.getElementById('printlink');
    if (pl) pl.addEventListener('click', function () { window.print(); });

    var toc = document.getElementById('toc');
    if (toc) {
      toc.classList.remove('collapsed');
      if (window.innerWidth <= 980) {
        toc.classList.add('collapsed');
        var hd = document.createElement('div');
        hd.className = 'toc-h';
        hd.style.cursor = 'pointer';
        hd.textContent = '本篇目录（点击展开）';
        toc.insertBefore(hd, toc.firstChild);
        hd.addEventListener('click', function () { toc.classList.toggle('collapsed'); });
      }
      // 滚动高亮
      if (spyObserver) spyObserver.disconnect();
      var links = {};
      toc.querySelectorAll('a').forEach(function (a) {
        links[a.getAttribute('href').split('/').pop()] = a;
      });
      var targets = outline.map(function (o) { return document.getElementById(o.id); }).filter(Boolean);
      spyObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var cur = toc.querySelector('a.active');
          if (cur) cur.classList.remove('active');
          var a = links[en.target.id];
          if (a) {
            a.classList.add('active');
            var top = a.offsetTop - toc.clientHeight / 2 + a.clientHeight / 2;
            if (top > 0) toc.scrollTo({ top: top, behavior: 'smooth' });
          }
        });
      }, { rootMargin: '-72px 0px -68% 0px', threshold: 0 });
      targets.forEach(function (el) { spyObserver.observe(el); });
    }

    if (anchor) {
      setTimeout(function () {
        var el = document.getElementById(anchor);
        if (!el) return;
        var y = el.getBoundingClientRect().top + window.scrollY - 78;
        window.scrollTo({ top: y, behavior: 'smooth' });
        el.classList.add('flash');
        setTimeout(function () { el.classList.remove('flash'); }, 1600);
      }, 60);
    }
  }

  /* ---------------- 搜索页 ---------------- */
  function renderSearch(qRaw) {
    setAccent('#e9c46a');
    qEl.value = qRaw;
    qClear.hidden = !qRaw;
    var q = qRaw.trim();

    var h = [];
    if (!q) {
      h.push('<div class="crumbs"><a href="#/">首页</a><i>/</i><span>搜索</span></div>');
      h.push('<div class="empty"><div class="e1">⌕</div><div>请输入关键词</div></div>');
      view.innerHTML = h.join('');
      return;
    }

    var t0 = performance.now();
    var hits = doSearch(q);
    var ms = Math.round(performance.now() - t0);
    var LIMIT = 80;

    h.push('<div class="crumbs"><a href="#/">首页</a><i>/</i><span>搜索</span></div>');
    h.push('<div class="res-head"><h2>“' + esc(q) + '”</h2>' +
           '<span class="n">' + hits.length + '</span><span class="hint">条命中 · ' + ms + ' ms</span></div>');

    if (!hits.length) {
      h.push('<div class="empty"><div class="e1">◌</div><div>没有找到相关内容</div>' +
             '<div style="margin-top:8px;font-size:12.5px">试试更短的关键词，例如「妖王」「模式」「年卡」</div></div>');
      view.innerHTML = h.join('');
      return;
    }

    h.push('<div class="hits">');
    hits.slice(0, LIMIT).forEach(function (x) {
      var it = x.it;
      var c = boardMeta(it.board).c;
      var isTitleHit = it.title.toLowerCase().indexOf(q.toLowerCase()) >= 0;
      h.push('<a class="hit" href="#/d/' + esc(it.doc) + '/' + esc(it.aid) + '" style="--hbc:' + c + '">');
      h.push('<div class="hit-top"><span class="hit-board">' + esc(it.boardTitle) + '</span>' +
             '<span class="hit-doc">' + esc(it.docTitle) + '</span></div>');
      h.push('<div class="hit-title">' + markQ(it.title, q.toLowerCase()) + '</div>');
      if (!isTitleHit || it.text.length > it.title.length + 8) {
        h.push('<div class="hit-snip">' + markQ(snippet(it.text, q.toLowerCase()), q.toLowerCase()) + '</div>');
      }
      h.push('</a>');
    });
    h.push('</div>');
    if (hits.length > LIMIT) {
      h.push('<div class="empty" style="padding:24px">仅显示前 ' + LIMIT + ' 条，请把关键词写得更具体</div>');
    }
    view.innerHTML = h.join('');
  }

  /* ---------------- 智能问答页 ---------------- */
  function answerCardHtml(res) {
    var h = [];
    var tag = { def: '释义', list: '条目汇总', how: '规则说明', cmp: '对比', src: '出处', why: '原因', search: '相关' }[res.intent] || '相关';
    h.push('<div class="qa-card">');
    h.push('<div class="ans-head"><span class="ans-tag">' + tag + '</span>' + esc(res.title) + '</div>');

    if (res.blocks.length === 1) {
      var b = res.blocks[0];
      var meta = [];
      if (b.tier) meta.push('<span class="chip chip-tier">' + esc(b.tier) + '</span>');
      if (b.board) meta.push('<span class="chip">' + esc(b.board) + '</span>');
      if (b.docTitle) meta.push('<span class="chip chip-src">' + esc(b.docTitle) + '</span>');
      if (meta.length) h.push('<div class="ans-meta">' + meta.join('') + '</div>');
      if (b.body) h.push('<div class="ans-body">' + esc(b.body) + '</div>');
      h.push('<a class="ans-src" href="' + b.href + '">查看原文 →</a>');
    } else {
      h.push('<ul class="ans-list">');
      res.blocks.forEach(function (x) {
        h.push('<li><a href="' + x.href + '"><b>' + esc(x.name) + '</b>' +
               (x.tier ? '<span class="chip chip-tier">' + esc(x.tier) + '</span>' : '') +
               (x.body ? '<span class="d">' + esc(x.body.slice(0, 90)) + (x.body.length > 90 ? '…' : '') + '</span>' : '') +
               '</a></li>');
      });
      h.push('</ul>');
    }

    if (res.note) h.push('<div class="ans-note">' + esc(res.note) + '</div>');
    if (res.related && res.related.length) {
      h.push('<div class="ans-rel"><span>相关：</span>');
      res.related.forEach(function (r) { h.push('<a href="' + r.href + '">' + esc(r.name) + '</a>'); });
      h.push('</div>');
    }
    h.push('<div class="ans-foot"><span class="dim">用时 ' + Math.round(res.ms) + ' ms · 离线检索</span></div>');
    h.push('</div>');
    return h.join('');
  }

  function askOnPage(q, hint) {
    var box = document.getElementById('qaAns');
    if (!box || !q || !q.trim()) return;
    box.innerHTML = '<div class="qa-card"><div class="ans-head">正在检索…</div>' +
                    '<div class="ans-note"><span class="dots"><i></i><i></i><i></i></span> 从 44 篇原文里找答案</div></div>';
    setTimeout(function () {
      var res;
      try { res = window.LJAsk.answer(q, hint); } catch (e) { res = null; }
      if (!res || !res.blocks || !res.blocks.length) {
        box.innerHTML = '<div class="qa-card"><div class="ans-head">没有找到「' + esc(q) + '」</div>' +
                        '<div class="ans-note">换个更短、更贴近游戏的说法试试。</div></div>';
        return;
      }
      box.innerHTML = answerCardHtml(res);
      box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function randomChips() {
    var wrap = document.getElementById('qaChips');
    if (!wrap) return;
    var out = (window.LJAsk && window.LJAsk.randomQuestions)
      ? window.LJAsk.randomQuestions(4) : [];
    if (!out || out.length < 4) {
      out = (out || []).slice();
      var fb = ['妖神级是什么？', '九大模式都有哪些？', '专属年卡是什么？', '王者印记怎么获得？'];
      while (out.length < 4) out.push([fb[out.length % 4], null, null, 'entry']);
    }
    wrap.innerHTML = '';
    out.forEach(function (q) {
      var b = document.createElement('button');
      b.className = 'qa-chip';
      b.textContent = q[0];
      b.addEventListener('click', function () { askOnPage(q[0], { doc: q[1], anchor: q[2] }); });
      wrap.appendChild(b);
    });
  }

  /* 出题挑战：问答页里的普通区块 */
  var QUIZ_STATE = { q: null, done: false };
  function newQuiz() {
    var box = document.getElementById('qaQuizBox');
    var QUIZ = window.LJ_QUIZ || [];
    if (!box) return;
    if (!QUIZ.length) { box.innerHTML = '<div class="qa-card">题库是空的。</div>'; return; }
    var q = QUIZ[Math.floor(Math.random() * QUIZ.length)];
    QUIZ_STATE.q = q;
    QUIZ_STATE.done = false;
    var kindName = { name: '猜卡名', body: '猜效果', src: '猜出处' }[q.k] || '答题';
    var h = ['<div class="qa-card qz"><div class="qz-tag">🎯 ' + kindName + '</div>' +
             '<div class="qz-q">' + esc(q.q).replace(/\n/g, '<br>') + '</div><div class="qz-opts">'];
    q.o.forEach(function (o, i) {
      h.push('<button class="qz-o" data-i="' + i + '">' + esc(o) + '</button>');
    });
    h.push('</div><div class="qz-res"></div></div>');
    box.innerHTML = h.join('');
    box.querySelectorAll('.qz-o').forEach(function (btn) {
      btn.addEventListener('click', function () { gradeQuiz(+btn.dataset.i); });
    });
  }

  function gradeQuiz(pick) {
    var box = document.getElementById('qaQuizBox');
    var q = QUIZ_STATE.q;
    if (!box || !q || QUIZ_STATE.done) return;
    QUIZ_STATE.done = true;
    var ok = pick === q.a;
    box.querySelectorAll('.qz-o').forEach(function (b, i) {
      b.disabled = true;
      if (i === q.a) b.classList.add('right');
      else if (i === pick) b.classList.add('wrong');
    });
    box.querySelector('.qz-res').innerHTML =
      (ok ? '<b class="ok">✔ 答对了！</b>' : '<b class="no">✘ 不对哦，正确答案是「' + esc(q.o[q.a]) + '」</b>') +
      '　' + esc(q.x || '') + '<br><a href="#/d/' + q.d + '/' + q.an + '">看原文 →</a>';
  }

  function renderAsk() {
    setAccent('#a78bfa');
    qEl.value = '';
    qClear.hidden = true;

    var blocks = ((window.LJ_QA && window.LJ_QA.blocks) || []).length;
    var quizN = (window.LJ_QUIZ || []).length;

    var h = [];
    h.push('<div class="crumbs"><a href="#/">首页</a><i>/</i><span>智能问答</span></div>');
    h.push('<section class="qa-hero">');
    h.push('<div class="hero-kicker">离线知识引擎 · 不用联网</div>');
    h.push('<h1>智 能 问 答</h1>');
    h.push('<p>用大白话问规则。助手会从全部原文里检索、组装答案，并给出出处链接。' +
           '完全在本地运行，不联网、不花钱。</p>');
    h.push('<form class="qa-form" id="qaForm">' +
           '<input id="qaInput" placeholder="例如：妖神级是什么？  按 Enter 提问" autocomplete="off">' +
           '<button type="submit">问一下</button>' +
           '<button type="button" class="qa-quiz" id="qaQuizGo">🎯 考考我</button>' +
           '</form>');
    h.push('<div class="qa-meta">知识块 <b>' + blocks + '</b> · 题库 <b>' + quizN + '</b> 题</div>');
    h.push('</section>');

    h.push('<div class="sectitle"><h2>不知道问什么？</h2><span>每次随机 4 条</span>' +
           '<button class="mini-b" id="qaRe">↻ 换一批</button></div>');
    h.push('<div class="qa-chips" id="qaChips"></div>');
    h.push('<div class="qa-ans" id="qaAns"></div>');

    h.push('<div class="sectitle" id="qaQuizAnchor"><h2>考考我</h2><span>四选一，当场判分</span>' +
           '<button class="mini-b" id="qaQuizNew">↻ 换一题</button></div>');
    h.push('<div id="qaQuizBox"></div>');

    view.innerHTML = h.join('');

    document.getElementById('qaForm').addEventListener('submit', function (e) {
      e.preventDefault();
      askOnPage(document.getElementById('qaInput').value);
    });
    document.getElementById('qaRe').addEventListener('click', randomChips);
    document.getElementById('qaQuizNew').addEventListener('click', newQuiz);
    document.getElementById('qaQuizGo').addEventListener('click', function () {
      newQuiz();
      var a = document.getElementById('qaQuizAnchor');
      if (a) a.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    randomChips();
    newQuiz();
  }

  function goSearch(q) {
    q = (q || '').trim();
    if (!q) return;
    location.hash = '#/s/' + encodeURIComponent(q);
  }

  /* ---------------- 事件绑定 ---------------- */
  var debounce = null;
  qEl.addEventListener('input', function () {
    qClear.hidden = !qEl.value;
    clearTimeout(debounce);
    var v = qEl.value;
    debounce = setTimeout(function () {
      if (!v.trim()) {
        if (parseHash().name === 'search') location.hash = '#/';
        return;
      }
      location.hash = '#/s/' + encodeURIComponent(v.trim());
    }, 260);
  });
  qEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { clearTimeout(debounce); goSearch(qEl.value); qEl.blur(); }
    if (e.key === 'Escape') { qEl.value = ''; qClear.hidden = true; goSearch(''); }
  });
  qClear.addEventListener('click', function () {
    qEl.value = ''; qClear.hidden = true; qEl.focus();
    if (parseHash().name === 'search') location.hash = '#/';
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== qEl &&
        !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
      e.preventDefault(); qEl.focus(); qEl.select();
    }
  });

  var themeBtn = document.getElementById('theme');
  function applyTheme(t) {
    document.body.classList.toggle('light', t === 'light');
    try { localStorage.setItem('lj-theme', t); } catch (err) {}
  }
  themeBtn.addEventListener('click', function () {
    applyTheme(document.body.classList.contains('light') ? 'dark' : 'light');
  });
  try { applyTheme(localStorage.getItem('lj-theme') || 'dark'); } catch (e) { applyTheme('dark'); }

  window.addEventListener('hashchange', route);

  /* ---------------- 页脚统计 ---------------- */
  (function () {
    var n = 0, c = 0;
    D.boards.forEach(function (b) { n += b.docs.length; b.docs.forEach(function (d) { c += d.chars || 0; }); });
    document.getElementById('footstat').textContent =
      '共 ' + D.boards.length + ' 个板块 · ' + n + ' 篇文档 · ' + fmtNum(c) + ' 字';
  })();

  route();

  /* 启动视觉增强的全局部分 */
  if (window.LJFX) { try { window.LJFX.boot(); } catch (e) {} }
})();
