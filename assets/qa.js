/* ==========================================================================
   宝可梦~传说界域 · 离线问答引擎
   纯本地检索 + 条目组装，不联网、不需要 Key。
   ========================================================================== */
window.LJAsk = (function () {
  'use strict';

  var QA = window.LJ_QA || { blocks: [], docs: {}, syn: {}, stop: [], rand: [] };
  var BLOCKS = QA.blocks || [];
  var N = BLOCKS.length;

  /* ---------------- 分词 ---------------- */
  var RE_LAT = /[A-Za-z][A-Za-z0-9]{1,}/g;
  var RE_NUM = /\d{2,}/g;
  var RE_CJK = /[\u4e00-\u9fff]+/g;

  function termsOf(text) {
    var ts = [], m;
    RE_LAT.lastIndex = 0;
    while ((m = RE_LAT.exec(text))) ts.push(m[0].toLowerCase());
    RE_NUM.lastIndex = 0;
    while ((m = RE_NUM.exec(text))) ts.push(m[0]);
    RE_CJK.lastIndex = 0;
    while ((m = RE_CJK.exec(text))) {
      var s = m[0], L = s.length, i, n;
      if (L <= 6) ts.push(s);
      for (n = 2; n <= 3; n++) {
        if (L < n) continue;
        for (i = 0; i <= L - n; i++) ts.push(s.substr(i, n));
      }
    }
    return ts;
  }

  /* 同义词双向展开 */
  var SYN = QA.syn || {};
  var SYN_BOTH = {};
  Object.keys(SYN).forEach(function (k) {
    SYN_BOTH[k] = (SYN_BOTH[k] || []).concat(SYN[k]);
    SYN[k].forEach(function (v) {
      SYN_BOTH[v] = (SYN_BOTH[v] || []).concat([k]);
    });
  });

  function stripStop(q) {
    var s = q;
    var words = (QA.stop || []).slice().sort(function (a, b) { return b.length - a.length; });
    words.forEach(function (w) { s = s.split(w).join(' '); });
    return s.replace(/[，。？！、；：“”‘’（）《》【】「」『』〈〉〔〕\s]+/g, ' ').trim();
  }

  function expand(term) {
    var out = [term];
    (SYN_BOTH[term] || []).forEach(function (v) { if (out.indexOf(v) < 0) out.push(v); });
    return out;
  }

  /* ---------------- 索引（首次使用时在内存里建） ---------------- */
  var IDF = null, INV = null;
  var ready = false;

  function buildIndex() {
    if (ready) return;
    IDF = {};
    INV = {};
    var df = {};
    var i, ts, j, t;
    for (i = 0; i < N; i++) {
      ts = termsOf(BLOCKS[i][3] + '\u0001' + BLOCKS[i][4]);
      var seen = {};
      for (j = 0; j < ts.length; j++) {
        t = ts[j];
        if (seen[t]) continue;
        seen[t] = 1;
        df[t] = (df[t] || 0) + 1;
      }
    }
    Object.keys(df).forEach(function (t) {
      var d = df[t];
      if (d > N * 0.45) return;                 // 太常见，没有区分度
      // 3 字以上的专名常常整份语料里只出现一次（例如「九大模式」），
      // 这类词恰恰是查询的关键，不能按 df>=2 一刀切掉。
      var keep = (d >= 2) || (t.length >= 3 && /[\u4e00-\u9fff]/.test(t));
      if (!keep) return;
      IDF[t] = Math.log(1 + N / d);
      INV[t] = [];
    });
    for (i = 0; i < N; i++) {
      ts = termsOf(BLOCKS[i][3] + '\u0001' + BLOCKS[i][4]);
      var s2 = {};
      for (j = 0; j < ts.length; j++) {
        t = ts[j];
        if (s2[t] || !INV[t]) continue;
        s2[t] = 1;
        INV[t].push(i);
      }
    }
    ready = true;
  }

  /* 块自身除标题外还剩多少正文（小标题/目录标签会接近 0） */
  function bodyLen(i) {
    var b = BLOCKS[i], t = b[4] || '', ti = b[3] || '';
    return (ti && t.indexOf(ti) === 0) ? t.length - ti.length : t.length;
  }

  /* ---------------- 检索 ---------------- */
  function search(qRaw, opt) {
    opt = opt || {};
    buildIndex();
    var cleaned = stripStop(qRaw);
    if (!cleaned) cleaned = (qRaw || '').trim();
    if (!cleaned) return { hits: [], terms: [] };

    var qTerms = termsOf(cleaned);
    var weights = {};
    var total = 0;
    qTerms.forEach(function (t) {
      expand(t).forEach(function (v) {
        if (IDF[v] && !weights[v]) { weights[v] = IDF[v]; total += IDF[v]; }
      });
      if (IDF[t] && !weights[t]) { weights[t] = IDF[t]; total += IDF[t]; }
    });
    if (cleaned.length >= 2 && IDF[cleaned]) weights[cleaned] = IDF[cleaned] * 1.5;

    if (!total) return substringSearch(cleaned, opt);

    var acc = {};
    Object.keys(weights).forEach(function (t) {
      var list = INV[t];
      if (!list) return;
      for (var k = 0; k < list.length; k++) {
        acc[list[k]] = (acc[list[k]] || 0) + weights[t];
      }
    });

    var lowQ = cleaned.toLowerCase();
    var hits = [];
    Object.keys(acc).forEach(function (k) {
      var i = +k;
      var b = BLOCKS[i];
      var title = b[3] || '', text = b[4] || '';
      var s = acc[i];
      var cov = s / total;
      s *= (0.45 + 0.55 * Math.min(cov, 1));
      if (b[2] === 'entry') s *= 1.18;
      if (b[2] === 'head') s *= 1.10;
      var bl = bodyLen(i);
      if (bl < 6) s *= 0.72;                    // 光秃秃的小标题不该压过有正文的块

      var lt = title.toLowerCase(), lx = text.toLowerCase();
      var pos = (title && lt.indexOf(lowQ) >= 0) ? 0 : lx.indexOf(lowQ);
      if (pos === 0) s *= 4.0;
      else if (pos > 0) s *= Math.max(1.5, 2.6 - pos / 55);   // 出现越靠前越相关

      var anyT = false;
      for (var t2 in weights) { if (lt.indexOf(t2) >= 0) { anyT = true; break; } }
      if (anyT) s *= 1.75;

      var dt = (QA.docs[b[0]] || [''])[0].toLowerCase();
      if (dt.indexOf(lowQ) >= 0) s *= 1.35;

      hits.push({ i: i, score: s, cov: cov });
    });

    hits.sort(function (a, b) { return b.score - a.score; });
    if (!hits.length && cleaned.length >= 2) return substringSearch(cleaned, opt);
    return { hits: hits.slice(0, opt.limit || 40), terms: Object.keys(weights) };
  }

  function substringSearch(q, opt) {
    var lowQ = q.toLowerCase();
    var hits = [];
    for (var i = 0; i < N; i++) {
      var b = BLOCKS[i];
      var lt = (b[3] || '').toLowerCase(), lx = (b[4] || '').toLowerCase();
      var p = lt.indexOf(lowQ);
      if (p >= 0) { hits.push({ i: i, score: 10 - p * 0.01 + (b[2] === 'entry' ? 3 : 0), cov: 1 }); continue; }
      p = lx.indexOf(lowQ);
      if (p >= 0) hits.push({ i: i, score: 4 + (b[2] === 'entry' ? 1 : 0), cov: 1 });
    }
    hits.sort(function (a, b) { return b.score - a.score; });
    return { hits: hits.slice(0, (opt && opt.limit) || 40), terms: [q] };
  }

  /* ---------------- 问句意图 ---------------- */
  function intentOf(q) {
    var s = q.trim();
    if (/区别|不同|差别|对比|哪个强|谁强|vs|VS|相比/.test(s)) return 'cmp';
    if (/有哪些|有哪|都有什么|全部|大全|列表|列出|一共有几|多少个|几条|几个/.test(s)) return 'list';
    if (/怎么|如何|怎样|流程|步骤|规则是|怎么玩|怎么用|怎么获得|怎么算/.test(s)) return 'how';
    if (/为什么|原因/.test(s)) return 'why';
    if (/是什么|什么是|什么意思|啥意思|含义|是啥|解释|介绍|讲解|解读/.test(s)) return 'def';
    if (/出自|哪一期|哪一篇|哪个模式|属于/.test(s)) return 'src';
    return 'search';
  }

  /* ---------------- 实体解析 ---------------- */
  function numPrefix(t) {
    var m = t.match(/^\s*(\d{1,2})\s*[.、]\s*/);
    return m ? m[1] : '';
  }

  var TIERS = [
    ['妖神级别', '妖神级'], ['妖神级', '妖神级'],
    ['妖王级', '妖王级'], ['活动级', '活动级'], ['常规级', '常规级'],
    ['特权级', '特权级'], ['专属年卡', '专属年卡'], ['限定年卡', '限定年卡']
  ];

  /* 把一条知识块解析成结构化字段 —— "解读"能力的核心 */
  function analyze(i) {
    var b = BLOCKS[i];
    var title = b[3] || '', text = b[4] || '';
    var body = text;
    if (title && text.indexOf(title) === 0) body = text.slice(title.length).trim();
    var nm = title.replace(/^\s*\d{1,2}\s*[.、]\s*/, '').replace(/[：:]\s*$/, '').trim();
    if (!nm) {                                  // 无标题的段落，用开头当摘要名
      nm = text.slice(0, 30).replace(/\s+/g, '') + (text.length > 30 ? '…' : '');
      body = text;
    }
    var tier = '';
    var probe = title + ' ' + text.slice(0, 40);
    for (var k = 0; k < TIERS.length; k++) {
      if (probe.indexOf(TIERS[k][0]) >= 0) { tier = TIERS[k][1]; break; }
    }
    var dm = QA.docs[b[0]] || ['', ''];
    return {
      i: i, doc: b[0], anchor: b[1], kind: b[2],
      name: nm, body: body, tier: tier, no: numPrefix(title),
      docTitle: dm[0], board: dm[1],
      href: '#/d/' + b[0] + '/' + b[1]
    };
  }

  /* ---------------- 组装答案 ---------------- */
  function findByAnchor(doc, anchor) {
    for (var i = 0; i < N; i++) {
      if (BLOCKS[i][0] === doc && BLOCKS[i][1] === anchor) return i;
    }
    return -1;
  }

  function answer(qRaw, hint) {
    var t0 = performance.now();
    var q = (qRaw || '').trim();
    if (!q) return null;

    var it = intentOf(q);
    var stripped = stripStop(q);
    var res = search(stripped || q, { limit: 60 });
    var hits = res.hits;

    /* 随机问题自带出处：检索没把握时直接用出处定位，保证问得出来 */
    if (hint && hint.doc && hint.anchor) {
      var weak = !hits.length || (hits[0].cov || 0) < 0.55;
      if (weak) {
        var di = findByAnchor(hint.doc, hint.anchor);
        if (di >= 0) {
          hits = [{ i: di, score: 9999, cov: 1 }].concat(
            hits.filter(function (h) { return h.i !== di; }));
        }
      }
    }

    var out = {
      q: q, intent: it, hits: hits, ms: 0,
      title: '', blocks: [], related: [], note: '', isList: false
    };

    if (!hits.length) {
      out.title = '没有找到相关内容';
      out.note = '换个更短、更贴近游戏的说法试试，比如「妖神级」「年卡」「第三模式」。';
      out.ms = performance.now() - t0;
      return out;
    }

    var best = hits[0];

    /* 列表类：只收「名字里真的含关键词」的条目，不够就退回复读原文 */
    if (it === 'list') {
      var kws = stripped.split(/\s+/).filter(function (x) { return x.length >= 2; });
      var listed = [];
      for (var i = 0; i < hits.length && listed.length < 14; i++) {
        var a = analyze(hits[i].i);
        if (a.kind !== 'entry') continue;
        var nm = a.name;
        if (nm.length > 30) continue;
        var hitName = kws.some(function (k) { return nm.indexOf(k) >= 0 || k.indexOf(nm) >= 0; });
        if (!hitName && hits[i].cov < 0.82) continue;
        listed.push(a);
      }
      if (listed.length >= 2) {
        out.title = '共找到 ' + listed.length + ' 条相关条目';
        out.blocks = listed;
        out.isList = true;
        out.note = '点任意一条看原文。';
      }
    }

    /* 对比类：拆成两个对象分别检索 */
    if (it === 'cmp') {
      var parts = q.split(/和|与|跟|对比|vs|VS|相比|哪个强|谁强/).map(function (x) {
        return stripStop(x.replace(/[？?。，,、]/g, '')).trim();
      }).filter(function (x) { return x.length >= 1; });
      if (parts.length >= 2) {
        var sides = parts.slice(0, 2).map(function (p) {
          var r = search(p, { limit: 1 });
          return r.hits.length ? analyze(r.hits[0].i) : null;
        }).filter(Boolean);
        if (sides.length === 2) {
          out.title = '对比：「' + sides[0].name + '」 vs 「' + sides[1].name + '」';
          out.blocks = sides;
          out.isList = true;
          out.note = '两边内容分别列出，自己比对。';
        }
      }
    }

    if (!out.blocks.length) {
      /* 单条问答：优先"有实质内容的条目"，避免只丢回一个光秃秃的小标题 */
      var pick = best;
      var j;
      for (j = 0; j < hits.length; j++) {
        if (BLOCKS[hits[j].i][2] === 'entry' && bodyLen(hits[j].i) >= 8 &&
            hits[j].score >= best.score * 0.55) { pick = hits[j]; break; }
      }
      if (bodyLen(pick.i) < 8) {
        for (j = 0; j < hits.length; j++) {
          if (bodyLen(hits[j].i) >= 10 && hits[j].score >= best.score * 0.4) {
            pick = hits[j];
            break;
          }
        }
      }
      var main = analyze(pick.i);
      out.title = main.name;
      out.blocks = [main];

      var rel = [], seen = {};
      seen[pick.i] = 1;
      for (var m = 1; m < hits.length && rel.length < 5; m++) {
        if (seen[hits[m].i]) continue;
        var ra = analyze(hits[m].i);
        if (ra.doc === main.doc && ra.name === main.name) continue;
        if (ra.kind !== 'entry' && ra.kind !== 'head') continue;
        seen[hits[m].i] = 1;
        rel.push(ra);
      }
      out.related = rel;

      if (it === 'src') {
        out.title = '「' + main.name + '」的出处';
        out.note = '出自《' + main.docTitle + '》（' + main.board + '）';
      } else if (it === 'def') {
        out.note = main.body ? '' : '原文只有标题，没有展开说明。';
      } else if (it === 'how') {
        out.note = '下面是原文中的相关说明。';
      }
    }

    out.ms = performance.now() - t0;
    return out;
  }

  /* ---------------- 随机问题 ---------------- */
  var randSeen = {};
  function randomQuestion() {
    var pool = QA.rand || [];
    if (!pool.length) return null;
    for (var k = 0; k < 14; k++) {
      var q = pool[Math.floor(Math.random() * pool.length)];
      if (!randSeen[q[0]] || k === 13) { randSeen[q[0]] = 1; return q; }
    }
    return pool[0];
  }

  /* 一次抽 n 条，尽量来自不同文档；随机问题自带出处，保证答得出来 */
  function randomQuestions(n) {
    n = n || 4;
    var pool = (QA.rand || []).slice();
    var out = [], used = {}, i, k;
    for (i = pool.length - 1; i > 0; i--) {
      k = Math.floor(Math.random() * (i + 1));
      var t = pool[i]; pool[i] = pool[k]; pool[k] = t;
    }
    for (k = 0; k < pool.length && out.length < n; k++) {
      if (out.length < n - 1 && used[pool[k][1]]) continue;
      used[pool[k][1]] = 1;
      out.push(pool[k]);
    }
    return out;
  }

  return {
    ready: function () { buildIndex(); return true; },
    indexSize: function () { return N; },
    search: search,
    answer: answer,
    analyze: analyze,
    intentOf: intentOf,
    randomQuestion: randomQuestion,
    randomQuestions: randomQuestions,
    blocks: BLOCKS
  };
})();
