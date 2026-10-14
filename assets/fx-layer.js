/* ==========================================================================
   fx-layer.js —— 语义分层「渲染层」
   --------------------------------------------------------------------------
   注意：语义类型（data-kind）现在由 build.py 在生成时判定并写入 HTML，
        这里只负责把它们「渲染得更清楚」：
          · 技能卡标题 → 卡名 + 阶级徽章 分离
          · 字段行     → 标签胶囊 + 内容
          · 技能卡内联正文 → 拆行
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- 阶级规范化 ---------- */
  var TIER_MAP = [
    [/妖神级别?|^妖神$/, '妖神级'], [/妖王级|^妖王$/, '妖王级'],
    [/特权级?/, '特权级'], [/活动级?/, '活动级'], [/常规级?/, '常规级'],
    [/专属限定|限定/, '专属限定'], [/年卡/, '年卡限定'], [/神兽竞技/, '神兽竞技']
  ];
  function normTier(s) {
    for (var i = 0; i < TIER_MAP.length; i++) if (TIER_MAP[i][0].test(s)) return TIER_MAP[i][1];
    return s;
  }

  /* 卡名 + 阶级：从「一．驱魔一式：妖王级」里拆出「驱魔一式」和「妖王级」 */
  var RE_SPLIT = /^(?:[一二三四五六七八九十]{1,3}\s*[．.、]\s*|\d{1,2}\s*[.、]\s*)?(.{2,20}?)\s*[：:]\s*(?:机制限定[^：:]*[：:]\s*)?(妖神级别?|妖神|妖王级|妖王|特权级|特权|活动级|活动|常规级|常规|专属限定|限定|年卡(?:限定)?|神兽竞技级?|神兽技|第[一二三四五六七八九十]代妖神)\s*$/;

  function splitCardTitle(h) {
    if (h.dataset.split) return;
    var badge = h.querySelector('.e-no');
    var badgeHtml = badge ? badge.outerHTML : '';
    var raw = h.textContent || '';
    var txt = badge ? raw.replace(badge.textContent, '') : raw;
    txt = txt.trim();
    var probe = txt.replace(/\s+/g, '');
    h.dataset.dbgRaw = raw.slice(0, 24);
    h.dataset.dbgTxt = probe.slice(0, 24);
    var m = RE_SPLIT.exec(probe);
    h.dataset.dbgHit = m ? (m[1] + '|' + m[2]) : 'NO';
    if (!m) return;
    h.dataset.split = '1';
    h.innerHTML = badgeHtml +
      '<span class="card-name">' + m[1] + '</span>' +
      '<span class="tier-badge" data-t="' + normTier(m[2]) + '">' + normTier(m[2]) + '</span>';
  }

  /* ---------- 字段行：标签 + 内容 ---------- */
  var RE_FIELD = /^(定义|说明|条件|注意|效果|获得|限制|备注|序言|备案|解析|攻略|亮点|定位|类型|价格|收益|评分|设计|优点|缺点|代价|触发|前置|奖励|来源|性质|作用|玩法|配置|阵容|建议|结论|总结|评价|背景|由来|目的|意义|原则|规则|数据|数值|属性|时间|地点|参与|门槛|难度|强度|风险|贺词|序词|谨记|提示|警告)\s*[：:]\s*([\s\S]*)$/;
  var WARN_F = /^(注意|备注|限制|风险|缺点|代价|警告|谨记)$/;
  var KEY_F = /^(定义|机制|效果|触发|获得|奖励|条件|前置)$/;

  function splitFields(root) {
    $$('p.para, p.para.ti', root).forEach(function (p) {
      if (p.dataset.split) return;
      var raw = p.textContent.trim();
      if (!raw || raw.length > 160) return;
      var m = RE_FIELD.exec(raw);
      if (!m) return;
      p.dataset.split = '1';
      p.classList.add('field-line');
      if (WARN_F.test(m[1])) p.classList.add('warn');
      if (KEY_F.test(m[1])) p.classList.add('key');
      p.textContent = '';
      var a = document.createElement('span'); a.className = 'f-label'; a.textContent = m[1];
      var b = document.createElement('span'); b.className = 'f-body'; b.textContent = m[2];
      p.appendChild(a); p.appendChild(b);
    });
  }

  /* ---------- 技能卡正文里的「单字技名」拆行 ---------- */
  var RE_SK = /^([\u4e00-\u9fff]{1,2})\s*[：:]\s*(.+)$/;
  function splitSkillLines(root) {
    $$('.entry-b p.para', root).forEach(function (p) {
      if (p.dataset.split) return;
      var raw = p.textContent.trim();
      if (!raw || raw.length > 140) return;
      var m = RE_SK.exec(raw);
      if (!m) return;
      if (/^(定义|说明|条件|注意|效果|获得|限制|备注|序言|备案|解析|攻略|亮点|定位|类型|价格|收益|评分|设计|优点|缺点|代价|触发|前置|奖励|来源|性质|作用|玩法|配置|阵容|建议|结论|总结|评价|背景|由来|目的|意义|原则|规则|数据|数值|属性|时间|地点|参与|门槛|难度|强度|风险|贺词|序词)$/.test(m[1])) return;
      p.dataset.split = '1';
      p.classList.add('skill-line');
      p.textContent = '';
      var a = document.createElement('span'); a.className = 'sk-label'; a.textContent = m[1];
      var b = document.createElement('span'); b.className = 'sk-body'; b.textContent = m[2];
      p.appendChild(a); p.appendChild(b);
    });
  }

  window.LJFX_LAYER = {
    apply: function (root) {
      if (!root) return;
      $$('.entry[data-kind="card"] .entry-h, .entry-h[data-kind="card"]', root).forEach(splitCardTitle);
      splitFields(root);
      splitSkillLines(root);
    }
  };
})();
