/* ==========================================================================
   宝可梦~传说界域 · 离线问答引擎 v3
   --------------------------------------------------------------------------
   修正 v2 的问题：
     ① 停用词单字误伤（"能"把"技能卡"吃成"技卡"）→ 已在 build_qa.py 修
     ② 实体别名缺失（"妖王"匹配不到"妖王级"）→ 改为别名表匹配
     ③ 条目列表未去重、排序差 → 改为按名称去重 + 标题命中优先
     ④ 「有哪些」类问题 → 直接给类目清单（模式/阶级/机制/模式成员）
   ========================================================================== */
window.LJAsk = (function () {
  'use strict';

  var QA = window.LJ_QA || { blocks: [], docs: {}, stop: [], rand: [] };
  var ENT = window.LJ_ENT || { cards: [], mechs: [], modes: [], periods: [], tiers: {}, terms: {} };
  var RAND = window.LJ_RAND || QA.rand || [];
  var BLOCKS = QA.blocks || [];
  var N = BLOCKS.length;

  /* ---------- 工具 ---------- */
  function keyOf(s) {
    return String(s || '').replace(/[\s，。、；：！？「」『』“”"'（）()【】\[\]·・~～—\-－_]/g, '');
  }
  function clean(s) {
    // 只剥离多字口语词，绝不动单字（避免"技能卡"→"技卡"）
    return String(s || '')
      .replace(/(请问|请教|我想知道|我想问|能不能|可不可以|是什么|什么是|有哪些|有哪|怎么|如何|为什么|为何|多少|几个|介绍|解释|讲解|说明|告诉我|帮我|查一下|查询|搜一下|搜索|谈谈|说说|讲讲|看看|一下)/g, ' ')
      .replace(/[，。？！、；：“”‘’（）《》【】「」『』\s]+/g, ' ')
      .trim();
  }

  /* ---------- 别名表（长别名优先） ---------- */
  var ALIAS = [];
  Object.keys(ENT.terms || {}).forEach(function (t) {
    var list = (ENT.terms[t].a || []).concat([t]);
    list.forEach(function (a) { if (a && a.length >= 2) ALIAS.push([a, t]); });
  });
  ALIAS.sort(function (x, y) { return y[0].length - x[0].length; });

  /* ---------- 意图 ---------- */
  function intentOf(q) {
    var s = q.trim();
    if (/区别|不同|差别|对比|哪个强|谁强|vs|VS|相比/.test(s)) return 'cmp';
    if (/有哪些|有哪|都有什么|全部|大全|列表|列出|一共有几|多少个|几条|几个|清单|一览/.test(s)) return 'list';
    if (/怎么|如何|怎样|流程|步骤|规则是|怎么玩|怎么用|怎么获得|怎么算|玩法是/.test(s)) return 'how';
    if (/为什么|原因|为何/.test(s)) return 'why';
    if (/出自|哪一期|哪一篇|哪个模式|属于哪|在哪里/.test(s)) return 'src';
    if (/是什么|什么是|什么意思|啥意思|含义|是啥|解释|介绍|讲解|解读|定义/.test(s)) return 'def';
    return 'search';
  }

  /* ---------- 实体识别 ---------- */
  function findEntity(qRaw) {
    var q = keyOf(qRaw);
    if (q.length < 2) return null;

    // ① 卡名（最长匹配）
    var best = null;
    for (var i = 0; i < ENT.cards.length; i++) {
      var cn = keyOf(ENT.cards[i].n);
      if (cn.length < 2 || q.indexOf(cn) < 0) continue;
      var sc = cn.length * 10 - (q.length - cn.length);
      if (!best || sc > best.sc) best = { sc: sc, d: ENT.cards[i] };
    }
    if (best) return { type: 'card', data: best.d, q: qRaw };

    // ② 机制
    var m = q.match(/机制([一二三四五六七八九十百\d]{1,4})/);
    if (m) {
      for (var j = 0; j < ENT.mechs.length; j++) {
        if (keyOf(ENT.mechs[j].n).indexOf('机制' + m[1]) === 0) {
          return { type: 'mech', data: ENT.mechs[j], q: qRaw };
        }
      }
    }

    // ③ 模式（编号 / 名称）
    var mm = q.match(/第([一二三四五六七八九十\d]{1,3})模式/);
    if (mm) {
      for (var k = 0; k < ENT.modes.length; k++) {
        if (keyOf(ENT.modes[k].n).indexOf('第' + mm[1] + '模式') === 0) {
          return { type: 'mode', data: ENT.modes[k], q: qRaw };
        }
      }
    }
    for (var k2 = 0; k2 < ENT.modes.length; k2++) {
      var mn = keyOf(ENT.modes[k2].n);
      var short = mn.replace(/^第[一二三四五六七八九十\d]+模式/, '');
      if (short.length >= 3 && q.indexOf(short) >= 0) {
        return { type: 'mode', data: ENT.modes[k2], q: qRaw };
      }
    }

    // ④ 期数
    var pm = q.match(/第([一二三四五六七八九十\d]{1,3})期/);
    if (pm) {
      for (var p = 0; p < ENT.periods.length; p++) {
        if (keyOf(ENT.periods[p].n).indexOf('第' + pm[1] + '期') === 0) {
          return { type: 'period', data: ENT.periods[p], q: qRaw };
        }
      }
    }

    // ⑤ 术语别名：阶级/具体词优先于泛类目词（"妖王技能卡"应命中妖王级而非技能卡）
    var GENERIC = { '技能卡': 1, '模式': 1, '机制': 1, '玩法规则': 1, '属性': 1 };
    var hitG = null;
    for (var t = 0; t < ALIAS.length; t++) {
      if (q.indexOf(keyOf(ALIAS[t][0])) >= 0) {
        var name = ALIAS[t][1];
        if (!GENERIC[name]) {
          return { type: 'term', data: { name: name, idx: ENT.terms[name] }, q: qRaw };
        }
        if (!hitG) hitG = name;
      }
    }
    if (hitG) return { type: 'term', data: { name: hitG, idx: ENT.terms[hitG] }, q: qRaw };
    return null;
  }

  /* ---------- 块 -> 答案对象 ---------- */
  function blockInfo(i) {
    var b = BLOCKS[i];
    if (!b) return null;
    var title = b[3] || '', text = b[4] || '';
    var body = text;
    if (title && text.indexOf(title) === 0) body = text.slice(title.length).trim();
    var nm = title.replace(/^\s*\d{1,2}\s*[.、]\s*/, '')
      .replace(/^[一二三四五六七八九十]{1,3}\s*[．.、]\s*/, '')
      .replace(/[：:]\s*$/, '').trim();
    if (!nm) {
      nm = text.slice(0, 34).replace(/\s+/g, '') + (text.length > 34 ? '…' : '');
      body = text;
    }
    var dm = QA.docs[b[0]] || ['', ''];
    return {
      i: i, name: nm, body: body, kind: b[2], title: title,
      docTitle: dm[0], board: dm[1],
      href: '#/d/' + b[0] + '/' + b[1]
    };
  }

  /* 去重（按名称）+ 过滤空块 */
  function infos(list, limit) {
    var out = [], seenI = {}, seenN = {};
    for (var k = 0; k < list.length && out.length < (limit || 30); k++) {
      var i = list[k];
      if (seenI[i]) continue;
      var o = blockInfo(i);
      if (!o) continue;
      if (!o.body && !o.title) continue;
      var nk = keyOf(o.name);
      if (nk && seenN[nk]) continue;
      seenI[i] = 1; if (nk) seenN[nk] = 1;
      out.push(o);
    }
    return out;
  }

  /* ---------- 类目清单 ---------- */
  function modesCardList() {
    return (ENT.modes || []).filter(function (m) { return m.n !== '模式总介绍'; })
      .map(function (m) {
        var b = BLOCKS[(m.b || [])[0]] || [];
        return { name: m.n, tier: '', href: '', body: '', doc: m.d };
      });
  }
  function tierList(name) {
    var t = ENT.tiers[name];
    if (!t) return [];
    var byName = {};
    (ENT.cards || []).forEach(function (c) { byName[c.n] = c; });
    return (t.cards || []).map(function (n) {
      var c = byName[n];
      var first = c ? BLOCKS[c.b[0]] : null;
      return {
        name: n, tier: c ? c.t : '', doc: c ? c.d : '',
        href: c ? '#/d/' + first[0] + '/' + first[1] : '',
        body: c ? (blockInfo(c.b[0]) || {}).body : ''
      };
    });
  }

  /* ---------- 实体作答 ---------- */
  function answerByEntity(qRaw, ent, intent) {
    var t0 = performance.now();
    var out = { q: qRaw, intent: intent, blocks: [], items: [], related: [], note: '', source: '实体匹配' };

    /* 卡名 */
    if (ent.type === 'card') {
      var c = ent.data;
      out.title = c.n + (c.t ? '　·　' + c.t : '');
      out.blocks = infos(c.b, 40).slice(0, 40);
      if (out.blocks.length > 1) {
        var head = out.blocks[0];
        out.blocks = [head];
        out.listTitle = '该条目的完整内容';
        out.items = infos(c.b, 40).slice(1).map(function (o) {
          return { name: o.name, tier: '', href: o.href, body: o.body };
        });
      }
      out.note = '出自《' + c.d + '》';
      out.related = relatedOf(c.b, c.d);
      out.ms = performance.now() - t0;
      return out;
    }

    /* 术语 / 阶级 */
    if (ent.type === 'term') {
      var name = ent.data.name, ix = ent.data.idx || { t: [], b: [] };

      // 「模式」→ 九大模式清单
      if (name === '模式' && (intent === 'list' || intent === 'def' || intent === 'search')) {
        var ml = modesCardList();
        var def = (ix.t || []).slice(0, 3);
        out.title = '游戏目前共 ' + ml.length + ' 个模式';
        out.blocks = infos(def, 3);
        out.listTitle = '全部模式';
        out.items = ml;
        out.note = '按《模式总介绍》的模式目录整理。';
        out.ms = performance.now() - t0;
        return out;
      }
      // 「机制」→ 机制清单
      if (name === '机制' && (intent === 'list' || intent === 'def')) {
        out.title = '机制条目共 ' + ENT.mechs.length + ' 条（资料库中带标题的）';
        out.blocks = infos([7, 10, 12], 3);
        out.listTitle = '已建档的机制条目';
        out.items = ENT.mechs.map(function (m) {
          var b = BLOCKS[m.b[0]];
          return { name: m.n, tier: '', href: '#/d/' + b[0] + '/' + b[1], body: '' };
        });
        out.ms = performance.now() - t0;
        return out;
      }
      // 「技能卡」→ 五大阶级
      if (name === '技能卡' && (intent === 'list' || intent === 'def')) {
        var names = Object.keys(ENT.tiers);
        out.title = '技能卡共五大阶级';
        out.blocks = infos([364, 367, 370, 373, 376], 3);
        out.listTitle = '五大阶级及各阶级卡牌数量';
        out.items = names.map(function (t) {
          return { name: t, tier: '', href: '#/d/m1-001/' + (BLOCKS[364 + names.indexOf(t) * 3] || [])[1], body: '共 ' + ENT.tiers[t].cards.length + ' 张已建档卡牌' };
        });
        out.ms = performance.now() - t0;
        return out;
      }

      // 阶级 / 术语 + 列出意图 → 清单
      var tl = tierList(name);
      if (intent === 'list' && tl.length) {
        out.title = name + '　已建档 ' + tl.length + ' 项';
        var tdefs = (ENT.tiers[name] && ENT.tiers[name].defs) || [];
        out.blocks = infos(tdefs.concat(ix.b || []), 2);
        out.listTitle = '属于「' + name + '」的全部条目';
        out.items = tl;
        out.note = '点任意一条看原文。';
        out.ms = performance.now() - t0;
        return out;
      }

      // 一般术语：先用"打分表"（已按定义度排序并锁定代表块），再补标题命中
      var pool = (ix.b || []).slice();
      (ix.t || []).forEach(function (k) { if (pool.indexOf(k) < 0) pool.push(k); });
      var got = infos(pool, 24);
      if (!got.length && ix.t) got = infos(ix.t, 12);
      if (got.length) {
        out.title = name;
        out.blocks = got.slice(0, 1);
        if (got.length > 1) {
          out.listTitle = '资料库中还找到 ' + (got.length - 1) + ' 处相关记载';
          out.items = got.slice(1, 12).map(function (o) {
            return { name: o.name, tier: '', href: o.href, body: o.body };
          });
        }
        out.ms = performance.now() - t0;
        return out;
      }
      // 术语没内容 → 退到全文检索
      return answerBySearch(qRaw, intent);
    }

    /* 机制 */
    if (ent.type === 'mech') {
      var mb = BLOCKS[ent.data.b[0]];
      var seq = [ent.data.b[0]];
      for (var z = ent.data.b[0] + 1; z < N && seq.length < 6; z++) {
        if (BLOCKS[z][0] !== mb[0]) break;
        seq.push(z);
      }
      out.title = ent.data.n;
      out.blocks = infos(seq, 6);
      out.note = '出自《' + mb[0].replace(/^.*\|/, '') + '》';
      out.ms = performance.now() - t0;
      return out;
    }

    /* 模式 / 期数 */
    if (ent.type === 'mode' || ent.type === 'period') {
      var dd = ent.data;
      var all = infos(dd.b || [], 300);
      out.title = dd.n;
      out.blocks = all.slice(0, 1);
      if (all.length > 1) {
        out.listTitle = '《' + dd.d + '》全部 ' + all.length + ' 节';
        out.items = all.slice(1, 40).map(function (o) {
          return { name: o.name, tier: '', href: o.href, body: o.body };
        });
      }
      out.note = '出自《' + dd.d + '》';
      out.ms = performance.now() - t0;
      return out;
    }

    out.ms = performance.now() - t0;
    return out;
  }

  function relatedOf(anchor, doc) {
    var out = [], seen = {};
    var start = Math.max(0, anchor[0] - 15), end = Math.min(N, anchor[0] + 45);
    for (var i = start; i < end && out.length < 8; i++) {
      if (anchor.indexOf(i) >= 0 || seen[i]) continue;
      if (BLOCKS[i][0] !== doc) continue;
      var o = blockInfo(i);
      if (!o || !o.title || o.title === o.body) continue;
      seen[i] = 1;
      out.push(o);
    }
    return out;
  }

  /* ---------- 全文检索兜底 ---------- */
  var IDF = null, INV = null, ready = false;
  var RE_CJK = /[\u4e00-\u9fff]+/g, RE_LAT = /[A-Za-z][A-Za-z0-9]{1,}/g, RE_NUM = /\d{2,}/g;

  function termsOf(text) {
    var ts = [], m;
    RE_LAT.lastIndex = 0; while ((m = RE_LAT.exec(text))) ts.push(m[0].toLowerCase());
    RE_NUM.lastIndex = 0; while ((m = RE_NUM.exec(text))) ts.push(m[0]);
    RE_CJK.lastIndex = 0;
    while ((m = RE_CJK.exec(text))) {
      var s = m[0], L = s.length, i, n;
      if (L <= 5) ts.push(s);
      for (n = 2; n <= 3; n++) for (i = 0; i + n <= L; i++) ts.push(s.substr(i, n));
    }
    return ts;
  }

  function buildIndex() {
    if (ready) return;
    IDF = {}; INV = {};
    var df = {}, i, j, t;
    for (i = 0; i < N; i++) {
      var ts = termsOf(BLOCKS[i][3] + '\u0001' + BLOCKS[i][4]), seen = {};
      for (j = 0; j < ts.length; j++) { t = ts[j]; if (!seen[t]) { seen[t] = 1; df[t] = (df[t] || 0) + 1; } }
    }
    Object.keys(df).forEach(function (t) {
      var d = df[t];
      if (d > N * 0.5) return;
      if (!(d >= 2 || (t.length >= 3 && /[\u4e00-\u9fff]/.test(t)))) return;
      IDF[t] = Math.log(1 + N / d);
      INV[t] = [];
    });
    for (i = 0; i < N; i++) {
      var ts2 = termsOf(BLOCKS[i][3] + '\u0001' + BLOCKS[i][4]), s2 = {};
      for (j = 0; j < ts2.length; j++) { t = ts2[j]; if (s2[t] || !INV[t]) continue; s2[t] = 1; INV[t].push(i); }
    }
    ready = true;
  }

  function search(q, limit) {
    buildIndex();
    var cl = clean(q) || q;
    var ts = termsOf(cl), w = {}, total = 0;
    ts.forEach(function (t) { if (IDF[t] && !w[t]) { w[t] = IDF[t]; total += IDF[t]; } });
    var low = cl.toLowerCase();
    if (!total) {
      var h0 = [];
      for (var z = 0; z < N; z++) {
        var tt = (BLOCKS[z][3] || '').toLowerCase(), xx = (BLOCKS[z][4] || '').toLowerCase();
        if (tt.indexOf(low) >= 0 || xx.indexOf(low) >= 0) h0.push(z);
        if (h0.length >= (limit || 40)) break;
      }
      return h0;
    }
    var acc = {};
    Object.keys(w).forEach(function (t) {
      var L = INV[t]; if (!L) return;
      for (var k = 0; k < L.length; k++) acc[L[k]] = (acc[L[k]] || 0) + w[t];
    });
    var scored = [];
    Object.keys(acc).forEach(function (k) {
      var i = +k, b = BLOCKS[i];
      var cov = acc[i] / total;
      var s = cov * (0.35 + 0.65 * Math.min(cov * 2.5, 1));
      if (b[2] === 'entry') s *= 1.3;
      if (b[2] === 'head') s *= 1.2;
      var lt = (b[3] || '').toLowerCase();
      if (lt && lt.indexOf(low) >= 0) s *= 3.5;
      else if ((b[4] || '').toLowerCase().indexOf(low) >= 0) s *= 1.6;
      scored.push([i, s]);
    });
    scored.sort(function (a, b) { return b[1] - a[1]; });
    return scored.slice(0, limit || 40).map(function (x) { return x[0]; });
  }

  function answerBySearch(qRaw, intent) {
    var t0 = performance.now();
    var hits = search(qRaw, 30);
    var out = { q: qRaw, intent: intent, blocks: [], items: [], related: [], note: '', source: '全文检索' };
    if (!hits.length) {
      out.title = '没有找到相关内容';
      out.note = '换个更贴近游戏的说法试试，例如「妖王级」「觉醒之战」「能量石」「王者印记」。';
      out.ms = performance.now() - t0;
      return out;
    }
    var got = infos(hits, 24);
    out.title = got[0].name;
    out.blocks = got.slice(0, 1);
    if (got.length > 1) {
      out.listTitle = '另找到 ' + (got.length - 1) + ' 处相关内容';
      out.items = got.slice(1, 12).map(function (o) {
        return { name: o.name, tier: '', href: o.href, body: o.body };
      });
    }
    out.ms = performance.now() - t0;
    return out;
  }

  /* ---------- 对比 ---------- */
  function answerCmp(qRaw) {
    var t0 = performance.now();
    var parts = qRaw.split(/和|与|跟|对比|vs|VS|相比|哪个强|谁强|有什么区别|的区别/)
      .map(function (x) { return x.replace(/[？?。，,、]/g, '').trim(); })
      .filter(function (x) { return x.length >= 2; });
    if (parts.length < 2) return answerBySearch(qRaw, 'search');
    var sides = [];
    for (var i = 0; i < 2; i++) {
      var e = findEntity(parts[i]);
      var o = null;
      if (e) {
        var r = answerByEntity(parts[i], e, 'def');
        if (r.blocks.length) o = r.blocks[0];
        else if (r.items && r.items.length) o = r.items[0];
      }
      if (!o) {
        var h = search(parts[i], 1);
        if (h.length) o = blockInfo(h[0]);
      }
      if (o) sides.push(o);
    }
    var out = { q: qRaw, intent: 'cmp', blocks: [], items: [], related: [], note: '', source: '对比' };
    if (sides.length === 2) {
      out.title = '对比：' + sides[0].name + '　vs　' + sides[1].name;
      out.blocks = sides;
      out.note = '两边内容分别列出，可自行比对。';
    } else {
      return answerBySearch(qRaw, 'search');
    }
    out.ms = performance.now() - t0;
    return out;
  }

  /* ---------- 主入口 ---------- */
  function answer(qRaw) {
    var q = (qRaw || '').trim();
    if (!q) return null;
    var intent = intentOf(q);
    if (intent === 'cmp') return answerCmp(q);
    var ent = findEntity(q);
    if (ent) return answerByEntity(q, ent, intent);
    return answerBySearch(q, intent);
  }

  /* ---------- 随机问题 ---------- */
  function randomQuestions(n) {
    n = n || 4;
    var pool = RAND.slice(), out = [], used = {}, i, k;
    for (i = pool.length - 1; i > 0; i--) { k = Math.floor(Math.random() * (i + 1)); var t = pool[i]; pool[i] = pool[k]; pool[k] = t; }
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
    entityCount: function () { return ENT.cards.length; },
    search: search,
    answer: answer,
    analyze: blockInfo,
    intentOf: intentOf,
    findEntity: findEntity,
    clean: clean,
    randomQuestion: function () { var r = randomQuestions(1); return r.length ? r[0] : null; },
    randomQuestions: randomQuestions,
    blocks: BLOCKS,
    ent: ENT
  };
})();
