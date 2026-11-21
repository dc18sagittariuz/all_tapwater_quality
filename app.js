const MAX_SITES = 8, MAX_PARAMS = 6, ALL_SITES = 'ทุกสถานที่ในตัวกรอง';
function siteList(p) { return p.sites ? p.sites.split('|') : []; }
function cpList(p) { return p.cps ? p.cps.split(',') : []; }

dash.calc('picked', {
  title: 'ตัวอย่างตามตัวกรอง',
  description: 'ตัวอย่างน้ำที่ตรงกับช่วงวันที่ ประเภทงาน สาขา และสถานที่ที่ติ๊กเลือก (ไม่เลือก = ทุกสถานที่)',
  inputs: ['samples'],
  fn: (samples) => {
    const p = dash.params();
    const sites = new Set(siteList(p));
    return samples.filter((s) => (!p.from || s.date >= p.from) && (!p.to || s.date <= p.to) &&
      (!p.job || s.job === p.job) && (!p.branch || s.branch === p.branch) && (!sites.size || sites.has(s.site)));
  },
});

dash.calc('stats', {
  title: 'สถิติรายพารามิเตอร์',
  description: 'จำนวนผล ค่าต่ำสุด มัธยฐาน เฉลี่ย สูงสุด และจำนวนผลที่ไม่เป็นไปตามเกณฑ์ ของพารามิเตอร์ที่เลือก รวมทุกสถานที่ที่เลือก',
  inputs: ['picked', 'criteria'],
  fn: (picked, criteria) => {
    const ps = dash.params().ps || '';
    const chosen = ps.split(',');
    const r4 = (v) => (v == null ? null : Number(v.toPrecision(4)));
    return criteria.filter((c) => ps === '' || chosen.includes(c.key)).map((c) => {
      const vals = picked.map((s) => s[c.key]).filter((v) => v != null);
      const row = {key: c.key, name: c.name, unit: c.unit, n: vals.length};
      if (c.kind === 'found') {
        const hit = vals.filter((v) => v === 'พบ').length;
        return {...row, nd: vals.length - hit, min: null, median: null, mean: null, max: null, limit: 'ไม่พบ', exceed: hit};
      }
      const over = (v) => (typeof v === 'string' && v[0] === '>' ? Number(v.slice(1)) : null);
      const nums = vals.map((v) => (typeof v === 'number' ? v : over(v))).filter((v) => v != null);
      const hasLimit = c.lo != null || c.hi != null;
      const bad = vals.filter((v) => (typeof v === 'number'
        ? (c.lo != null && v < c.lo) || (c.hi != null && v > c.hi)
        : over(v) != null && c.hi != null && over(v) >= c.hi)).length;
      return {...row, nd: vals.length - nums.length,
        min: r4(d3.min(nums)), median: r4(d3.median(nums)), mean: r4(d3.mean(nums)), max: r4(d3.max(nums)),
        limit: !hasLimit ? '' : c.lo != null ? c.lo + '–' + c.hi : '≤ ' + c.hi,
        exceed: hasLimit ? bad : null};
    });
  },
});

dash.calc('overview', {
  title: 'ภาพรวมตามตัวกรอง',
  description: 'จำนวนตัวอย่าง สถานที่ ช่วงวันที่ และจำนวนผลที่ไม่เป็นไปตามเกณฑ์',
  inputs: ['picked', 'stats'],
  fn: (picked, stats) => {
    const bad = stats.filter((r) => r.exceed > 0).sort((a, b) => b.exceed - a.exceed);
    return [{samples: picked.length, sites: new Set(picked.map((s) => s.site)).size,
      first: d3.min(picked, (s) => s.date) || null, last: d3.max(picked, (s) => s.date) || null,
      params: stats.length, exceed: d3.sum(bad, (r) => r.exceed), exceedParams: bad.length,
      top: bad.length ? bad[0].name : null, topCount: bad.length ? bad[0].exceed : null}];
  },
});

dash.calc('series', {
  title: 'เส้นในกราฟ',
  description: 'สถานที่ที่ติ๊กเลือก ลำดับสี และจำนวนตัวอย่างของแต่ละแห่งในตัวกรอง',
  inputs: ['picked'],
  fn: (picked) => {
    const sites = siteList(dash.params());
    if (!sites.length) return [{series: ALL_SITES, color: 0, samples: picked.length}];
    const n = d3.rollup(picked, (g) => g.length, (s) => s.site);
    return sites.map((name, i) => ({series: name, color: i, samples: n.get(name) || 0}));
  },
});

dash.calc('trend', {
  title: 'ค่าเฉลี่ยรายเดือนแยกสถานที่',
  description: 'ค่าเฉลี่ย ต่ำสุด สูงสุด และจำนวนผลไม่ผ่านเกณฑ์รายเดือน ของแต่ละพารามิเตอร์ในกราฟและแต่ละสถานที่ที่เลือก จากผลที่เป็นตัวเลข',
  inputs: ['picked', 'criteria'],
  fn: (picked, criteria) => {
    const p = dash.params();
    const bySite = siteList(p).length > 0;
    const r4 = (v) => Number(v.toPrecision(4));
    const out = [];
    cpList(p).map((k) => criteria.find((c) => c.key === k)).filter((c) => c && c.kind === 'num').forEach((c) => {
      const rows = picked.filter((s) => typeof s[c.key] === 'number');
      d3.rollups(rows, (g) => {
        const v = g.map((s) => s[c.key]);
        return {n: v.length, mean: r4(d3.mean(v)), min: d3.min(v), max: d3.max(v),
          bad: v.filter((x) => (c.lo != null && x < c.lo) || (c.hi != null && x > c.hi)).length};
      }, (s) => (bySite ? s.site : ALL_SITES), (s) => s.date.slice(0, 7)).forEach(([series, months]) =>
        months.forEach(([month, o]) => out.push({key: c.key + '|' + series + '|' + month, param: c.key, series, month, ...o})));
    });
    return out.sort((a, b) => d3.ascending(a.param, b.param) || d3.ascending(a.series, b.series) || d3.ascending(a.month, b.month));
  },
});

dash.calc('micro', {
  title: 'ผลตรวจพบ/ไม่พบรายเดือน',
  description: 'จำนวนตัวอย่างที่ตรวจและจำนวนที่พบ อี.โคไล และโคลิฟอร์มแบคทีเรีย รายเดือน แยกตามสถานที่ที่เลือก',
  inputs: ['picked', 'criteria'],
  fn: (picked, criteria) => {
    const bySite = siteList(dash.params()).length > 0;
    const out = [];
    criteria.filter((c) => c.kind === 'found').forEach((c) => {
      const tested = picked.filter((s) => s[c.key] === 'พบ' || s[c.key] === 'ไม่พบ');
      d3.rollups(tested, (g) => ({n: g.length, found: g.filter((s) => s[c.key] === 'พบ').length}),
        (s) => (bySite ? s.site : ALL_SITES), (s) => s.date.slice(0, 7)).forEach(([series, months]) =>
        months.forEach(([month, o]) => out.push({key: c.key + '|' + series + '|' + month, param: c.key, series, month, ...o})));
    });
    return out.sort((a, b) => d3.ascending(a.param, b.param) || d3.ascending(a.series, b.series) || d3.ascending(a.month, b.month));
  },
});

const DAY = new Intl.DateTimeFormat('th-TH', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
const MON = new Intl.DateTimeFormat('th-TH', {month: 'short', year: '2-digit', timeZone: 'UTC'});
const fd = (s) => (s ? DAY.format(new Date(s)) : '—');
const fm = (s) => MON.format(new Date(s + '-01'));
const fv = (v) => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('en-US', {maximumSignificantDigits: 6}) : String(v));
const ok = (id) => { const d = dash.data(id); return d.status === 'ok' ? d.data : null; };
const h = (tag, props, ...kids) => { const el = Object.assign(document.createElement(tag), props || {}); el.append(...kids); return el; };
const root = document.querySelector('.wq') || document;
const all = (sel) => [...root.querySelectorAll(sel)];
const col = (i) => dash.colors[i % dash.colors.length];
const limText = (c) => (c.lo != null ? 'เกณฑ์ ' + c.lo + '–' + c.hi : c.hi != null ? 'เกณฑ์ ≤ ' + c.hi : '');
const tOf = (r) => new Date(r.month + '-01');
const limLabel = (c, v) => (c.lo != null ? (v === c.lo ? 'เกณฑ์ขีดล่าง ' : 'เกณฑ์ขีดบน ') : 'เกณฑ์ ≤ ') + fv(v) + (c.unit ? ' ' + c.unit : '');
const swatch = (i) => { const s = h('span', {className: 'wq-sw'}); s.style.background = col(i); return s; };
const DASH = [[], [6, 4], [2, 3], [9, 3, 2, 3], [14, 4], [4, 2, 1, 2]];
const dashOf = (i) => DASH[i % DASH.length];
const lineSample = (color, dash) => {
  const s = d3.create('svg').attr('class', 'wq-ls').attr('width', 24).attr('height', 10).attr('aria-hidden', 'true');
  s.append('line').attr('x1', 1).attr('x2', 23).attr('y1', 5).attr('y2', 5).attr('stroke-width', 2)
    .attr('stroke-dasharray', dash.length ? dash.join(' ') : null).style('stroke', color);
  return s.node();
};
const chartParams = (p, crit) => cpList(p).map((k) => crit.find((c) => c.key === k)).filter((c) => c && c.kind === 'num');
const layoutOf = (p) => (p.layout === 'combined' ? 'combined' : 'split');
const yscaleOf = (p) => (['pct', 'log', 'linear'].includes(p.yscale) ? p.yscale : 'pct');

dash.onData(() => {
  const o = (ok('overview') || [])[0];
  const show = (id, on) => all('#' + id).forEach((el) => { el.hidden = !on; });
  show('lead-some', o && o.exceed > 0);
  show('lead-none', o && o.samples > 0 && o.exceed === 0);
  show('lead-empty', o && o.samples === 0);
  const p = dash.params(), lay = layoutOf(p), ys = yscaleOf(p);
  all('[data-set]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.set === 'layout' ? lay : ys) === b.dataset.val)));
  show('yscale-ctl', lay === 'combined');
  show('note-split', lay === 'split');
  ['pct', 'log', 'linear'].forEach((m) => show('note-' + m, lay === 'combined' && ys === m));
  all('input[data-param]').forEach((el) => { if (document.activeElement !== el) el.value = p[el.dataset.param] || ''; });
});

all('input[data-param]').forEach((el) => {
  el.addEventListener('change', () => { if (!el.value || el.validity.valid) dash.setParams({[el.dataset.param]: el.value}); });
  el.addEventListener('blur', () => { el.value = dash.params()[el.dataset.param] || ''; });
});
all('input[data-search]').forEach((el) => el.addEventListener('input', () => dash.draw(el.dataset.search)));
all('[data-set]').forEach((b) => b.addEventListener('click', () => dash.setParams({[b.dataset.set]: b.dataset.val})));
all('[data-act="reset"]').forEach((b) => b.addEventListener('click', () => dash.resetParams()));
all('[data-act="clear-sites"]').forEach((b) => b.addEventListener('click', () => dash.setParams({sites: ''})));
all('[data-ps]').forEach((b) => b.addEventListener('click', () => {
  const crit = (ok('criteria') || []).filter((c) => c.kind === 'found' || c.lo != null || c.hi != null).map((c) => c.key);
  dash.setParams({ps: b.dataset.ps === 'all' ? '' : b.dataset.ps === 'crit' ? crit.join(',') : 'none'});
}));

dash.draw('ov', (el) => {
  const o = (ok('overview') || [])[0];
  const f = el.dataset.field;
  const v = o ? o[f] : null;
  el.textContent = f === 'first' || f === 'last' ? fd(v) : fv(v);
});

dash.draw('count', (el) => {
  const p = dash.params(), n = siteList(p).length;
  el.textContent = el.dataset.kind === 'sites' ? (n ? 'เลือกอยู่ ' + n + ' แห่ง' : 'ทุกสถานที่') : String(cpList(p).length);
});

const picker = (field, label) => dash.draw(field, (sel) => {
  const p = dash.params();
  const pool = (ok('samples') || []).filter((s) => field === 'job' || !p.job || s.job === p.job);
  const counts = d3.rollups(pool, (g) => g.length, (s) => s[field]).sort((a, b) => b[1] - a[1]);
  sel.replaceChildren(new Option(label, ''), ...counts.map(([k, n]) => new Option(k + ' (' + n + ')', k)));
  sel.value = p[field] || '';
  sel.onchange = () => dash.setParams(field === 'job' ? {job: sel.value, branch: '', sites: ''} : {branch: sel.value, sites: ''});
});
picker('job', 'ทุกประเภทงาน');
picker('branch', 'ทุกสาขา');

const searchText = (box) => {
  const el = box.closest('details') && box.closest('details').querySelector('input[data-search]');
  return el ? el.value.trim().toLowerCase() : '';
};

dash.draw('sitelist', (box) => {
  const p = dash.params(), chosen = siteList(p), q = searchText(box);
  const pool = (ok('samples') || []).filter((s) => (!p.from || s.date >= p.from) && (!p.to || s.date <= p.to) &&
    (!p.job || s.job === p.job) && (!p.branch || s.branch === p.branch));
  const counts = d3.rollups(pool, (g) => g.length, (s) => s.site).sort((a, b) => b[1] - a[1] || d3.ascending(a[0], b[0]));
  const n = new Map(counts);
  const others = counts.filter(([k]) => !chosen.includes(k) && (!q || k.toLowerCase().includes(q)));
  const shown = others.slice(0, 60), full = chosen.length >= MAX_SITES;
  const item = (name, on, i) => h('label', {className: 'wq-chk'},
    h('input', {type: 'checkbox', value: name, checked: on, disabled: !on && full}), on ? swatch(i) : '', name + ' (' + (n.get(name) || 0) + ')');
  box.replaceChildren(...chosen.map((k, i) => item(k, true, i)), ...shown.map(([k]) => item(k, false)),
    ...(others.length > shown.length ? [h('p', {className: 'wq-muted'}, 'แสดง ' + shown.length + ' จาก ' + others.length + ' แห่ง พิมพ์ค้นหาเพื่อหาแห่งอื่น')] : []),
    ...(!counts.length ? [h('p', {className: 'wq-muted'}, 'ไม่มีสถานที่ในตัวกรองที่เลือก')] : []));
  box.onchange = (ev) => {
    const t = ev.target, cur = siteList(dash.params());
    if (t.type !== 'checkbox') return;
    dash.setParams({sites: (t.checked ? [...cur, t.value].slice(0, MAX_SITES) : cur.filter((k) => k !== t.value)).join('|')});
  };
});

dash.draw('cplist', (box) => {
  const crit = (ok('criteria') || []).filter((c) => c.kind === 'num');
  const chosen = cpList(dash.params()), q = searchText(box), full = chosen.length >= MAX_PARAMS;
  const list = crit.filter((c) => chosen.includes(c.key) || !q || c.name.toLowerCase().includes(q));
  box.replaceChildren(...list.map((c) => h('label', {className: 'wq-chk'},
    h('input', {type: 'checkbox', value: c.key, checked: chosen.includes(c.key), disabled: !chosen.includes(c.key) && full}),
    c.name + (c.unit ? ' (' + c.unit + ')' : ''))));
  box.onchange = (ev) => {
    const t = ev.target, cur = cpList(dash.params());
    if (t.type !== 'checkbox') return;
    dash.setParams({cps: (t.checked ? [...cur, t.value].slice(0, MAX_PARAMS) : cur.filter((k) => k !== t.value)).join(',')});
  };
});

dash.draw('plist', (box) => {
  const crit = ok('criteria') || [];
  const ps = dash.params().ps || '';
  const chosen = ps.split(',');
  box.replaceChildren(...d3.groups(crit, (c) => c.group).map(([group, items]) => h('fieldset', {className: 'wq-group'},
    h('legend', {}, group),
    ...items.map((c) => h('label', {className: 'wq-chk'},
      h('input', {type: 'checkbox', value: c.key, checked: ps === '' || chosen.includes(c.key)}), c.name)))));
  box.onchange = () => {
    const boxes = [...box.querySelectorAll('input')];
    const keys = boxes.filter((i) => i.checked).map((i) => i.value);
    dash.setParams({ps: keys.length === boxes.length ? '' : keys.length ? keys.join(',') : 'none'});
  };
});

dash.draw('legend', (box) => {
  const ser = ok('series'), crit = ok('criteria');
  if (!ser || !crit) { box.replaceChildren(); return; }
  const p = dash.params(), combined = layoutOf(p) === 'combined', multi = ser.length > 1;
  const items = [];
  if (!combined || multi) items.push(...ser.map((s) => h('span', {className: 'wq-leg'}, swatch(s.color), s.series + ' · ' + fv(s.samples) + ' ตัวอย่าง')));
  if (combined) {
    items.push(...chartParams(p, crit).map((c, i) => h('span', {className: 'wq-leg'},
      lineSample(multi ? 'var(--color-fg-muted)' : col(i), multi ? dashOf(i) : []), c.name + (c.unit ? ' (' + c.unit + ')' : ''))));
  }
  box.replaceChildren(...items);
});

dash.draw('rows', (tb) => {
  const rows = ok('stats') || [];
  const cols = [...tb.closest('table').querySelectorAll('th')].map((th) => th.dataset.field);
  tb.replaceChildren(...rows.map((r) => {
    const tr = h('tr', {className: r.exceed > 0 ? 'wq-bad' : ''});
    tr.dataset.key = r.key;
    cols.forEach((c) => tr.append(h('td', {className: c === 'name' || c === 'unit' ? '' : 'wq-num'},
      c === 'name' ? r.name : c === 'unit' || c === 'limit' ? r[c] || '' : fv(r[c]))));
    return tr;
  }));
});

// One parameter's scales. With one line the y range covers min–max bars; with several, the monthly means.
const panelScales = (rows, c, single, t, x0, x1, y0, y1) => {
  const lo = d3.min(rows, (r) => (single ? r.min : r.mean)), top = d3.max(rows, (r) => (single ? r.max : r.mean));
  const lims = [c.lo, c.hi].filter((v) => v != null);
  return {lims, x: d3.scaleUtc().domain(t).range([x0, x1]),
    y: d3.scaleLinear().domain([d3.min([lo, ...lims]), d3.max([top, ...lims])]).nice().range([y0, y1])};
};
const timeDomain = (rows) => {
  const t = d3.extent(rows, tOf);
  if (+t[0] === +t[1]) t[1] = new Date(+t[1] + 31 * 864e5);
  return t;
};

const drawPanel = (panel, c, rows, t, colorOf, single) => {
  if (!rows.length) { panel.append(h('p', {className: 'wq-muted'}, 'ไม่มีผลที่เป็นตัวเลขในตัวกรองที่เลือก')); return; }
  const W = Math.max(260, panel.clientWidth || 420), H = 220;
  const svg = d3.create('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img')
    .attr('aria-label', 'ค่าเฉลี่ยรายเดือนของ' + c.name + (single ? '' : ' แยกตามสถานที่'));
  const tip = h('div', {className: 'wq-tip', hidden: true});
  panel.append(svg.node(), tip);
  let s = panelScales(rows, c, single, t, 0, W, H - 26, 10);
  const gy = svg.append('g').attr('class', 'wq-axis').call(d3.axisLeft(s.y).ticks(4));
  const ml = d3.max(gy.selectAll('text').nodes(), (n) => n.getComputedTextLength()) + 14;
  gy.attr('transform', 'translate(' + ml + ',0)');
  s = panelScales(rows, c, single, t, ml, W - 12, H - 26, 10);
  const X = (r) => s.x(tOf(r));
  svg.append('g').attr('class', 'wq-grid').selectAll('line').data(s.y.ticks(4)).join('line')
    .attr('x1', ml).attr('x2', W - 12).attr('y1', s.y).attr('y2', s.y);
  svg.append('g').attr('class', 'wq-axis').attr('transform', 'translate(0,' + (H - 26) + ')')
    .call(d3.axisBottom(s.x).ticks(Math.max(2, Math.floor(W / 130))).tickFormat((d) => MON.format(d)).tickSizeOuter(0));
  svg.append('g').selectAll('line').data(s.lims).join('line').attr('x1', ml).attr('x2', W - 12).attr('y1', s.y).attr('y2', s.y)
    .attr('stroke-dasharray', '6 4').attr('stroke-width', 1.25).style('stroke', 'var(--cds-chart-status-critical)');
  svg.append('g').selectAll('text').data(s.lims).join('text').attr('class', 'wq-lim-label')
    .attr('x', W - 14).attr('y', (v) => (s.y(v) < 22 ? s.y(v) + 14 : s.y(v) - 5)).attr('text-anchor', 'end')
    .style('fill', 'var(--cds-chart-status-critical)').style('font-size', 'var(--cds-font-size-caption)').style('font-family', 'var(--font-anthropic-sans)')
    .style('paint-order', 'stroke').style('stroke', 'var(--color-panel)').style('stroke-width', 3).text((v) => limLabel(c, v));
  if (single) {
    svg.append('g').selectAll('line').data(rows).join('line').attr('x1', X).attr('x2', X)
      .attr('y1', (r) => s.y(r.min)).attr('y2', (r) => s.y(r.max)).style('stroke', 'var(--cds-chart-muted)');
  }
  const groups = d3.groups(rows, (r) => r.series);
  groups.forEach(([series, rs]) => {
    const color = col(colorOf.get(series) || 0);
    svg.append('path').datum(rs).attr('fill', 'none').attr('stroke-width', 1.75).style('stroke', color)
      .attr('d', d3.line().x(X).y((r) => s.y(r.mean)));
    svg.append('g').selectAll('circle').data(rs).join('circle').attr('cx', X).attr('cy', (r) => s.y(r.mean))
      .attr('r', (r) => (r.bad ? 3.5 : 2.5)).style('fill', (r) => (r.bad ? 'var(--cds-chart-status-critical)' : color));
  });
  const guide = svg.append('line').attr('y1', 10).attr('y2', H - 26).style('stroke', 'var(--cds-chart-axis)').attr('visibility', 'hidden');
  svg.on('pointermove', (ev) => {
    const px = d3.pointer(ev)[0];
    const near = d3.least(rows, (r) => Math.abs(X(r) - px));
    const here = rows.filter((r) => r.month === near.month).sort((a, b) => (colorOf.get(a.series) || 0) - (colorOf.get(b.series) || 0));
    guide.attr('x1', X(near)).attr('x2', X(near)).attr('visibility', 'visible');
    tip.replaceChildren(h('b', {}, fm(near.month)), ...here.map((r) => h('div', {className: 'wq-leg'}, swatch(colorOf.get(r.series) || 0),
      (single ? '' : r.series + ': ') + 'เฉลี่ย ' + fv(r.mean) + (c.unit ? ' ' + c.unit : '') +
      (single ? ' · ต่ำสุด–สูงสุด ' + fv(r.min) + '–' + fv(r.max) : '') + ' · ' + r.n + ' ผล' + (r.bad ? ' · ไม่ผ่าน ' + r.bad : ''))));
    tip.hidden = false;
    const k = panel.clientWidth / W, left = X(near) * k;
    tip.style.left = Math.max(0, Math.min(panel.clientWidth - tip.offsetWidth, left + 12 - (left > panel.clientWidth / 2 ? tip.offsetWidth + 24 : 0))) + 'px';
    tip.style.top = '28px';
  }).on('pointerleave', () => { tip.hidden = true; guide.attr('visibility', 'hidden'); });
};

// Combined chart: one line per parameter (and per site). Color = site when several sites, else parameter; dash = parameter.
const combinedModel = (rows, params, ser, mode) => {
  const multi = ser.length > 1, colorOf = new Map(ser.map((s) => [s.series, s.color]));
  const lines = [], refs = [], skipped = [];
  params.forEach((c, pi) => {
    if (mode === 'pct' && c.hi == null) { skipped.push(c.name); return; }
    d3.groups(rows.filter((r) => r.param === c.key), (r) => r.series).forEach(([series, rs]) => {
      const pts = rs.map((r) => ({month: r.month, raw: r.mean, n: r.n, bad: r.bad, y: mode === 'pct' ? r.mean / c.hi * 100 : r.mean}))
        .filter((q) => mode !== 'log' || q.y > 0);
      if (pts.length) lines.push({c, series, color: multi ? colorOf.get(series) || 0 : pi, dash: multi ? dashOf(pi) : [], pts});
    });
    if (mode !== 'pct') [c.lo, c.hi].filter((v) => v != null).forEach((v) => refs.push({y: v, c, color: multi ? null : pi, dash: multi ? dashOf(pi) : [5, 4]}));
  });
  if (mode === 'pct') refs.push({y: 100, c: null, color: null, dash: [5, 4]});
  const dropped = mode === 'log' ? params.filter((c) => rows.some((r) => r.param === c.key && r.mean <= 0)).map((c) => c.name) : [];
  return {lines, refs, skipped, dropped, multi};
};
const combinedNote = (m) => [m.skipped.length ? 'ไม่มีเกณฑ์ จึงไม่แสดงในโหมด %: ' + m.skipped.join(', ') : '',
  m.dropped.length ? 'บางเดือนไม่แสดงเพราะค่าเฉลี่ยเป็น 0 หรือติดลบ: ' + m.dropped.join(', ') : ''].filter(Boolean).join(' · ');
const combinedScales = (model, mode, t, x0, x1, y0, y1) => {
  const ys = model.lines.flatMap((l) => l.pts.map((q) => q.y));
  const lo = d3.min(ys), hi = d3.max(ys);
  const refs = model.refs.filter((r) => (mode === 'pct' ? true : mode === 'log' ? r.y > 0 : r.y <= Math.max(hi, 1e-12) * 3));
  const dom = mode === 'pct' ? [0, Math.max(hi, 100)] : mode === 'log' ? [d3.min([lo, ...refs.map((r) => r.y)]), d3.max([hi, ...refs.map((r) => r.y)])]
    : [Math.min(0, lo), d3.max([hi, ...refs.map((r) => r.y)])];
  const y = (mode === 'log' ? d3.scaleLog() : d3.scaleLinear()).domain(dom).nice().range([y0, y1]);
  let ticks = y.ticks(5);
  if (mode === 'log') {
    const [a, b] = y.domain();
    ticks = d3.range(Math.ceil(Math.log10(a)), Math.floor(Math.log10(b)) + 1).map((e) => 10 ** e);
    if (ticks.length < 2) ticks = y.ticks(4);
  }
  const fmt = (v) => (mode === 'pct' ? fv(v) + '%' : fv(v));
  return {x: d3.scaleUtc().domain(t).range([x0, x1]), y, ticks, fmt, refs};
};
const refName = (r) => (r.c ? r.c.name + ' · ' + limLabel(r.c, r.y) : 'เกณฑ์ (100% ของค่าเกณฑ์)');
const tipLine = (l, q, mode) => (l.series && l.series !== ALL_SITES ? l.series + ' · ' : '') + l.c.name + ': ' + fv(q.raw) +
  (l.c.unit ? ' ' + l.c.unit : '') + (mode === 'pct' ? ' (' + fv(Math.round(q.y)) + '% ของเกณฑ์)' : '') + ' · ' + q.n + ' ผล' + (q.bad ? ' · ไม่ผ่าน ' + q.bad : '');

const drawCombined = (box, rows, params, ser, mode) => {
  const model = combinedModel(rows, params, ser, mode);
  const wrap = h('div', {className: 'wq-combined', id: 'chart-combined'});
  box.replaceChildren(wrap);
  const msg = combinedNote(model);
  if (msg) wrap.append(h('p', {className: 'wq-muted', style: 'margin-bottom:6px'}, msg));
  if (!model.lines.length) { wrap.append(h('p', {className: 'wq-muted'}, 'ไม่มีข้อมูลที่แสดงได้ในโหมดแกนนี้ ลองเลือกแกนแบบอื่นหรือพารามิเตอร์อื่น')); return; }
  const W = Math.max(280, wrap.clientWidth || 600), H = 320, t = timeDomain(rows);
  const svg = d3.create('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img')
    .attr('aria-label', 'ค่าเฉลี่ยรายเดือนของ ' + params.map((c) => c.name).join(', ') + ' ในกราฟเดียว');
  const tip = h('div', {className: 'wq-tip', hidden: true});
  wrap.append(svg.node(), tip);
  let s = combinedScales(model, mode, t, 0, W, H - 26, 10);
  const gy = svg.append('g').attr('class', 'wq-axis').call(d3.axisLeft(s.y).tickValues(s.ticks).tickFormat(s.fmt));
  const ml = d3.max(gy.selectAll('text').nodes(), (n) => n.getComputedTextLength()) + 14;
  gy.attr('transform', 'translate(' + ml + ',0)');
  s = combinedScales(model, mode, t, ml, W - 12, H - 26, 10);
  const X = (q) => s.x(tOf(q));
  svg.append('g').attr('class', 'wq-grid').selectAll('line').data(s.ticks).join('line').attr('x1', ml).attr('x2', W - 12).attr('y1', s.y).attr('y2', s.y);
  svg.append('g').attr('class', 'wq-axis').attr('transform', 'translate(0,' + (H - 26) + ')')
    .call(d3.axisBottom(s.x).ticks(Math.max(2, Math.floor(W / 130))).tickFormat((d) => MON.format(d)).tickSizeOuter(0));
  const refColor = (r) => (r.color == null ? 'var(--cds-chart-reference)' : col(r.color));
  svg.append('g').selectAll('line').data(s.refs).join('line').attr('x1', ml).attr('x2', W - 12).attr('y1', (r) => s.y(r.y)).attr('y2', (r) => s.y(r.y))
    .attr('stroke-dasharray', (r) => (r.dash.length ? r.dash.join(' ') : '5 4')).attr('stroke-width', 1).style('stroke', refColor).style('opacity', 0.8);
  let lastY = 1e9;
  [...s.refs].sort((a, b) => s.y(b.y) - s.y(a.y)).forEach((r) => {
    const yy = s.y(r.y) - 4;
    if (lastY - yy < 13 || yy < 12) return;
    lastY = yy;
    svg.append('text').attr('class', 'wq-ref-label').attr('x', W - 14).attr('y', yy).attr('text-anchor', 'end').text(refName(r));
  });
  model.lines.forEach((l) => {
    const color = col(l.color);
    svg.append('path').datum(l.pts).attr('fill', 'none').attr('stroke-width', 1.75).attr('stroke-dasharray', l.dash.length ? l.dash.join(' ') : null)
      .style('stroke', color).attr('d', d3.line().x(X).y((q) => s.y(q.y)));
    svg.append('g').selectAll('circle').data(l.pts).join('circle').attr('cx', X).attr('cy', (q) => s.y(q.y)).attr('r', (q) => (q.bad ? 3.5 : 2.2))
      .style('fill', (q) => (q.bad ? 'var(--cds-chart-status-critical)' : color));
  });
  const guide = svg.append('line').attr('y1', 10).attr('y2', H - 26).style('stroke', 'var(--cds-chart-axis)').attr('visibility', 'hidden');
  const flat = model.lines.flatMap((l) => l.pts.map((q) => ({l, q})));
  svg.on('pointermove', (ev) => {
    const px = d3.pointer(ev)[0] * (W / (wrap.clientWidth || W));
    const near = d3.least(flat, (d) => Math.abs(X(d.q) - px));
    const here = flat.filter((d) => d.q.month === near.q.month);
    guide.attr('x1', X(near.q)).attr('x2', X(near.q)).attr('visibility', 'visible');
    tip.replaceChildren(h('b', {}, fm(near.q.month)), ...here.map((d) => h('div', {className: 'wq-leg'}, lineSample(col(d.l.color), d.l.dash), tipLine(d.l, d.q, mode))));
    tip.hidden = false;
    const k = wrap.clientWidth / W, left = X(near.q) * k;
    tip.style.left = Math.max(0, Math.min(wrap.clientWidth - tip.offsetWidth, left + 12 - (left > wrap.clientWidth / 2 ? tip.offsetWidth + 24 : 0))) + 'px';
    tip.style.top = '28px';
  }).on('pointerleave', () => { tip.hidden = true; guide.attr('visibility', 'hidden'); });
};

dash.draw('trend', (box) => {
  const rows = ok('trend'), crit = ok('criteria'), ser = ok('series');
  if (!rows || !crit || !ser) { box.textContent = '—'; return; }
  const params = cpList(dash.params()).map((k) => crit.find((c) => c.key === k)).filter((c) => c && c.kind === 'num');
  if (!params.length) { box.replaceChildren(h('p', {className: 'wq-muted'}, 'ติ๊กพารามิเตอร์อย่างน้อย 1 รายการเพื่อแสดงกราฟ')); return; }
  const p = dash.params();
  if (layoutOf(p) === 'combined') {
    if (!rows.length) { box.replaceChildren(h('p', {className: 'wq-muted'}, 'ไม่มีผลที่เป็นตัวเลขในตัวกรองที่เลือก')); return; }
    drawCombined(box, rows, params, ser, yscaleOf(p));
    return;
  }
  const colorOf = new Map(ser.map((s) => [s.series, s.color]));
  const t = rows.length ? timeDomain(rows) : null;
  const panels = params.map((c) => {
    const panel = h('div', {className: 'wq-panel', id: 'chart-' + c.key},
      h('div', {className: 'wq-panel-h'}, c.name + (c.unit ? ' (' + c.unit + ')' : '') + ' ', h('span', {}, limText(c))));
    return panel;
  });
  box.replaceChildren(...panels);
  params.forEach((c, i) => drawPanel(panels[i], c, rows.filter((r) => r.param === c.key), t, colorOf, ser.length === 1));
});

// Found / not-found results: monthly bars of samples tested (stacked by site), red marker on months with any "found".
const microLayout = (rows, ser, t, x0, x1, y0, y1) => {
  const keys = ser.map((s) => s.series);
  const months = d3.groups(rows, (r) => r.month).map(([month, rs]) => {
    const by = new Map(rs.map((r) => [r.series, r]));
    return {month, by, n: d3.sum(rs, (r) => r.n), found: d3.sum(rs, (r) => r.found)};
  });
  const stack = d3.stack().keys(keys).value((d, k) => (d.by.get(k) ? d.by.get(k).n : 0))(months);
  const pad = 16 * 864e5;
  const x = d3.scaleUtc().domain([new Date(+t[0] - pad), new Date(+t[1] + pad)]).range([x0, x1]);
  const span = Math.max(1, d3.utcMonth.count(t[0], t[1]) + 1);
  const bw = Math.max(1.5, Math.min(16, (x1 - x0) / span * 0.7));
  const y = d3.scaleLinear().domain([0, Math.max(1, d3.max(months, (m) => m.n))]).nice().range([y0, y1]);
  const ticks = y.ticks(3).filter((v) => Number.isInteger(v));
  return {months, stack, x, y, bw, ticks};
};
const microSummary = (rows) => {
  const n = d3.sum(rows, (r) => r.n), f = d3.sum(rows, (r) => r.found);
  return 'เกณฑ์: ไม่พบ · ตรวจ ' + fv(n) + ' ตัวอย่าง · พบ ' + fv(f) + ' ครั้ง';
};

const drawMicro = (panel, c, rows, t, colorOf, ser) => {
  if (!rows.length) { panel.append(h('p', {className: 'wq-muted'}, 'ไม่มีผลตรวจในตัวกรองที่เลือก')); return; }
  const single = ser.length === 1;
  const W = Math.max(260, panel.clientWidth || 420), H = 170;
  const svg = d3.create('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('role', 'img')
    .attr('aria-label', 'จำนวนตัวอย่างที่ตรวจ' + c.name + 'รายเดือน และเดือนที่ตรวจพบ');
  const tip = h('div', {className: 'wq-tip', hidden: true});
  panel.append(svg.node(), tip);
  let L = microLayout(rows, ser, t, 0, W, H - 26, 16);
  const gy = svg.append('g').attr('class', 'wq-axis').call(d3.axisLeft(L.y).tickValues(L.ticks).tickFormat(d3.format('d')));
  const ml = d3.max(gy.selectAll('text').nodes(), (n) => n.getComputedTextLength()) + 14;
  gy.attr('transform', 'translate(' + ml + ',0)');
  L = microLayout(rows, ser, t, ml, W - 12, H - 26, 16);
  const X = (m) => L.x(tOf(m));
  svg.append('g').attr('class', 'wq-grid').selectAll('line').data(L.ticks).join('line').attr('x1', ml).attr('x2', W - 12).attr('y1', L.y).attr('y2', L.y);
  svg.append('g').attr('class', 'wq-axis').attr('transform', 'translate(0,' + (H - 26) + ')')
    .call(d3.axisBottom(L.x).ticks(Math.max(2, Math.floor(W / 130))).tickFormat((d) => MON.format(d)).tickSizeOuter(0));
  L.stack.forEach((layer) => {
    const fill = single ? 'var(--cds-chart-muted)' : col(colorOf.get(layer.key) || 0);
    svg.append('g').selectAll('rect').data(layer.filter((d) => d[1] > d[0])).join('rect')
      .attr('x', (d) => X(d.data) - L.bw / 2).attr('width', L.bw).attr('y', (d) => L.y(d[1])).attr('height', (d) => L.y(d[0]) - L.y(d[1]))
      .style('fill', fill);
  });
  const hits = L.months.filter((m) => m.found > 0);
  svg.append('g').selectAll('circle').data(hits).join('circle').attr('cx', X).attr('cy', (m) => L.y(m.n) - 7).attr('r', 4.5)
    .style('fill', 'var(--cds-chart-status-critical)');
  svg.append('g').selectAll('text').data(hits).join('text').attr('x', (m) => X(m) + 7).attr('y', (m) => L.y(m.n) - 3)
    .style('fill', 'var(--cds-chart-status-critical)').style('font-size', 'var(--cds-font-size-caption)').style('font-family', 'var(--font-anthropic-sans)')
    .text((m) => 'พบ ' + m.found);
  const guide = svg.append('line').attr('y1', 16).attr('y2', H - 26).style('stroke', 'var(--cds-chart-axis)').attr('visibility', 'hidden');
  svg.on('pointermove', (ev) => {
    const px = d3.pointer(ev)[0] * (W / (panel.clientWidth || W));
    const m = d3.least(L.months, (d) => Math.abs(X(d) - px));
    guide.attr('x1', X(m)).attr('x2', X(m)).attr('visibility', 'visible');
    const lines = ser.filter((s) => m.by.get(s.series)).map((s) => {
      const r = m.by.get(s.series);
      return h('div', {className: 'wq-leg'}, single ? '' : swatch(s.color), (single ? '' : s.series + ': ') + 'ตรวจ ' + r.n + ' · ' + (r.found ? 'พบ ' + r.found : 'ไม่พบ'));
    });
    tip.replaceChildren(h('b', {}, fm(m.month)), ...lines);
    tip.hidden = false;
    const k = panel.clientWidth / W, left = X(m) * k;
    tip.style.left = Math.max(0, Math.min(panel.clientWidth - tip.offsetWidth, left + 12 - (left > panel.clientWidth / 2 ? tip.offsetWidth + 24 : 0))) + 'px';
    tip.style.top = '28px';
  }).on('pointerleave', () => { tip.hidden = true; guide.attr('visibility', 'hidden'); });
};

dash.draw('micro', (box) => {
  const rows = ok('micro'), crit = ok('criteria'), ser = ok('series');
  if (!rows || !crit || !ser) { box.textContent = '—'; return; }
  const params = crit.filter((c) => c.kind === 'found');
  const colorOf = new Map(ser.map((s) => [s.series, s.color]));
  const t = rows.length ? timeDomain(rows) : null;
  const panels = params.map((c) => h('div', {className: 'wq-panel', id: 'micro-' + c.key},
    h('div', {className: 'wq-panel-h'}, c.name + ' ', h('span', {}, microSummary(rows.filter((r) => r.param === c.key))))));
  box.replaceChildren(...panels);
  params.forEach((c, i) => drawMicro(panels[i], c, rows.filter((r) => r.param === c.key), t, colorOf, ser));
});

// Canvas colors: dash.colors are CSS variables, so read their current values.
const FALLBACK = ['#2a6fb0', '#e67e22', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#b7950b', '#5d6d7e'];
const canvasColor = (i) => {
  const v = col(i) || '', m = /var\((--[^),\s]+)/.exec(v);
  const got = m ? getComputedStyle(root === document ? document.documentElement : root).getPropertyValue(m[1]).trim() : v;
  return got || FALLBACK[i % FALLBACK.length];
};

const makeImage = () => {
  const o = ok('overview')[0], rows = ok('stats') || [], tr = ok('trend') || [], ser = ok('series') || [], p = dash.params();
  const crit = ok('criteria') || [];
  const params = cpList(p).map((k) => crit.find((c) => c.key === k)).filter((c) => c && c.kind === 'num');
  const sites = siteList(p), single = ser.length === 1, colorOf = new Map(ser.map((s) => [s.series, s.color]));
  const W = 1240, H = 1754, M = 64, R = W - M, INK = '#1a1a1a', DIM = '#666', LINE = '#d9d9d9', BAD = '#c0392b';
  const cv = h('canvas', {width: W, height: H}), g = cv.getContext('2d');
  const font = getComputedStyle(root === document ? document.body : root).fontFamily || 'sans-serif';
  const setFont = (size, weight) => { g.font = (weight || 400) + ' ' + size + 'px ' + font; };
  const T = (text, x, y, size, color, align, weight) => {
    setFont(size, weight); g.fillStyle = color || INK; g.textAlign = align || 'left'; g.fillText(text, x, y);
  };
  const fit = (text, size, width) => {
    setFont(size); if (g.measureText(text).width <= width) return text;
    let s = text; while (s.length > 1 && g.measureText(s + '…').width > width) s = s.slice(0, -1);
    return s + '…';
  };
  const rule = (x1, y1, x2, y2, color, dashes, wid) => {
    g.beginPath(); g.setLineDash(dashes || []); g.strokeStyle = color; g.lineWidth = wid || 1; g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.setLineDash([]);
  };
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  let y = M + 30;
  T('สรุปสถิติคุณภาพน้ำประปา', M, y, 38, INK, 'left', 600); y += 40;
  T('ช่วงวันที่รับตัวอย่าง: ' + fd(o.first) + ' – ' + fd(o.last), M, y, 19, DIM); y += 28;
  T('ประเภทงาน: ' + (p.job || 'ทุกประเภทงาน') + '   ·   สาขา: ' + (p.branch || 'ทุกสาขา') + '   ·   สถานที่: ' +
    (sites.length ? 'เปรียบเทียบ ' + sites.length + ' แห่ง' : 'ทุกสถานที่'), M, y, 19, DIM); y += 26;
  const tiles = [['ตัวอย่างน้ำ', o.samples], ['สถานที่เก็บตัวอย่าง', o.sites], ['พารามิเตอร์ในตาราง', o.params], ['ผลไม่เป็นไปตามเกณฑ์ (รายการ)', o.exceed]];
  const tw = (R - M - 3 * 16) / 4;
  tiles.forEach(([label, v], i) => {
    const x = M + i * (tw + 16);
    g.strokeStyle = LINE; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, tw, 92);
    T(label, x + 16, y + 30, 16, DIM); T(fv(v), x + 16, y + 74, 34, i === 3 && v > 0 ? BAD : INK);
  });
  y += 92 + 30;
  const combined = layoutOf(p) === 'combined', mode = yscaleOf(p);
  if (sites.length) {
    const lw = (R - M) / 2;
    ser.forEach((s, i) => {
      const x = M + (i % 2) * lw, yy = y + Math.floor(i / 2) * 24;
      g.fillStyle = canvasColor(s.color); g.fillRect(x, yy - 12, 14, 14);
      T(fit(s.series + ' · ' + fv(s.samples) + ' ตัวอย่าง', 16, lw - 30), x + 22, yy, 16);
    });
    y += Math.ceil(ser.length / 2) * 24 + 14;
  }
  if (combined && params.length) {
    const lw = (R - M) / 3;
    params.forEach((c, i) => {
      const x = M + (i % 3) * lw, yy = y + Math.floor(i / 3) * 24;
      g.beginPath(); g.setLineDash(sites.length ? dashOf(i) : []); g.strokeStyle = sites.length ? DIM : canvasColor(i); g.lineWidth = 2.5;
      g.moveTo(x, yy - 5); g.lineTo(x + 26, yy - 5); g.stroke(); g.setLineDash([]);
      T(fit(c.name + (c.unit ? ' (' + c.unit + ')' : ''), 16, lw - 40), x + 34, yy, 16);
    });
    y += Math.ceil(params.length / 3) * 24 + 14;
  }
  const foot = H - M;
  const cols = params.length > 1 ? 2 : 1, nr = Math.ceil(params.length / cols);
  const ph = nr === 1 ? 250 : nr === 2 ? 210 : 180;
  const tableNeed = 30 + (rows.length + 1) * 14;
  const mic = ok('micro') || [], microNeed = mic.length ? 210 : 0;
  const chartsH = params.length && tr.length ? (combined ? Math.max(360, Math.min(620, foot - 40 - y - tableNeed - microNeed)) : nr * (ph + 46)) : 0;
  let note = '';
  if (chartsH && combined && y + chartsH + tableNeed <= foot - 20) {
    const model = combinedModel(tr, params, ser, mode);
    const axisName = mode === 'pct' ? '% ของเกณฑ์ขีดบน' : mode === 'log' ? 'ค่าจริง แกน log (หน่วยของแต่ละพารามิเตอร์)' : 'ค่าจริง (หน่วยของแต่ละพารามิเตอร์)';
    T('ค่าเฉลี่ยรายเดือน · แกน Y: ' + axisName, M, y + 4, 17, INK, 'left', 600);
    if (combinedNote(model)) T(fit(combinedNote(model), 14, R - M), M, y + 26, 14, DIM);
    if (model.lines.length) {
      const top = y + 40, bottom = y + chartsH - 30, t = timeDomain(tr);
      setFont(13);
      let s = combinedScales(model, mode, t, M, R, bottom, top);
      const ml = d3.max(s.ticks, (v) => g.measureText(s.fmt(v)).width) + 14;
      s = combinedScales(model, mode, t, M + ml, R, bottom, top);
      const X = (q) => s.x(tOf(q));
      s.ticks.forEach((v) => { rule(M + ml, s.y(v), R, s.y(v), '#eee'); T(s.fmt(v), M + ml - 8, s.y(v) + 5, 13, DIM, 'right'); });
      s.x.ticks(8).forEach((d) => T(MON.format(d), s.x(d), bottom + 20, 13, DIM, 'center'));
      s.refs.forEach((r) => rule(M + ml, s.y(r.y), R, s.y(r.y), r.color == null ? BAD : canvasColor(r.color), r.dash.length ? r.dash : [6, 5]));
      let lastY = 1e9;
      [...s.refs].sort((a, b) => s.y(b.y) - s.y(a.y)).forEach((r) => {
        const yy = s.y(r.y) - 5; if (lastY - yy < 15 || yy < top) return; lastY = yy;
        T(refName(r), R - 2, yy, 13, DIM, 'right');
      });
      model.lines.forEach((l) => {
        const color = canvasColor(l.color);
        g.beginPath(); g.setLineDash(l.dash); g.strokeStyle = color; g.lineWidth = 2;
        l.pts.forEach((q, j) => (j ? g.lineTo(X(q), s.y(q.y)) : g.moveTo(X(q), s.y(q.y)))); g.stroke(); g.setLineDash([]);
        l.pts.forEach((q) => { g.beginPath(); g.fillStyle = q.bad ? BAD : color; g.arc(X(q), s.y(q.y), q.bad ? 4 : 2.6, 0, 7); g.fill(); });
      });
    } else T('ไม่มีข้อมูลที่แสดงได้ในโหมดแกนนี้', M, y + 60, 15, DIM);
    y += chartsH + 30;
  } else if (chartsH && !combined && y + chartsH + tableNeed <= foot - 20) {
    const t = timeDomain(tr), pw = (R - M - (cols - 1) * 32) / cols;
    params.forEach((c, i) => {
      const px = M + (i % cols) * (pw + 32), py = y + Math.floor(i / cols) * (ph + 46);
      T(fit(c.name + (c.unit ? ' (' + c.unit + ')' : '') + (limText(c) ? '  ·  ' + limText(c) : ''), 17, pw), px, py + 4, 17, INK, 'left', 600);
      const rs = tr.filter((r) => r.param === c.key);
      if (!rs.length) { T('ไม่มีผลที่เป็นตัวเลข', px, py + 40, 14, DIM); return; }
      const top = py + 18, bottom = top + ph - 24, s = panelScales(rs, c, single, t, px + 62, px + pw, bottom, top + 6);
      const X = (r) => s.x(tOf(r));
      s.y.ticks(4).forEach((v) => { rule(px + 62, s.y(v), px + pw, s.y(v), '#eee'); T(fv(v), px + 54, s.y(v) + 5, 13, DIM, 'right'); });
      s.x.ticks(Math.max(3, Math.floor(pw / 110))).forEach((d) => T(MON.format(d), s.x(d), bottom + 20, 13, DIM, 'center'));
      s.lims.forEach((v) => {
        rule(px + 62, s.y(v), px + pw, s.y(v), BAD, [6, 5], 1.5);
        T(limLabel(c, v), px + pw - 2, s.y(v) < top + 20 ? s.y(v) + 15 : s.y(v) - 5, 13, BAD, 'right');
      });
      if (single) rs.forEach((r) => rule(X(r), s.y(r.min), X(r), s.y(r.max), '#c8c8c8'));
      d3.groups(rs, (r) => r.series).forEach(([series, list]) => {
        const color = canvasColor(colorOf.get(series) || 0);
        g.beginPath(); g.strokeStyle = color; g.lineWidth = 2;
        list.forEach((r, j) => (j ? g.lineTo(X(r), s.y(r.mean)) : g.moveTo(X(r), s.y(r.mean)))); g.stroke();
        list.forEach((r) => { g.beginPath(); g.fillStyle = r.bad ? BAD : color; g.arc(X(r), s.y(r.mean), r.bad ? 4 : 3, 0, 7); g.fill(); });
      });
    });
    y += chartsH + 6;
  } else if (chartsH) {
    note = 'ไม่ได้ใส่กราฟเพราะตารางมีพารามิเตอร์มากเกินกว่าจะพอในหน้าเดียว ลดพารามิเตอร์ในตารางเพื่อให้มีกราฟ';
  }
  if (note) { T(note, M, y, 15, DIM); y += 30; }
  if (microNeed && y + microNeed + tableNeed <= foot - 20) {
    const mparams = crit.filter((c) => c.kind === 'found'), t = timeDomain(mic), pw = (R - M - 32) / 2;
    mparams.forEach((c, i) => {
      const px = M + i * (pw + 32), rs = mic.filter((r) => r.param === c.key);
      T(fit(c.name + '  ·  ' + microSummary(rs), 15, pw), px, y + 4, 15, INK, 'left', 600);
      if (!rs.length) { T('ไม่มีผลตรวจในตัวกรองที่เลือก', px, y + 40, 14, DIM); return; }
      const top = y + 24, bottom = y + microNeed - 50;
      setFont(13);
      let L = microLayout(rs, ser, t, px + 40, px + pw, bottom, top);
      const X = (m) => L.x(tOf(m));
      L.ticks.forEach((v) => { rule(px + 40, L.y(v), px + pw, L.y(v), '#eee'); T(String(v), px + 32, L.y(v) + 5, 13, DIM, 'right'); });
      L.x.ticks(Math.max(3, Math.floor(pw / 120))).forEach((d) => T(MON.format(d), L.x(d), bottom + 20, 13, DIM, 'center'));
      L.stack.forEach((layer) => {
        g.fillStyle = single ? '#c4c2bc' : canvasColor(colorOf.get(layer.key) || 0);
        layer.forEach((d) => { if (d[1] > d[0]) g.fillRect(X(d.data) - L.bw / 2, L.y(d[1]), L.bw, L.y(d[0]) - L.y(d[1])); });
      });
      L.months.filter((m) => m.found > 0).forEach((m) => {
        g.beginPath(); g.fillStyle = BAD; g.arc(X(m), L.y(m.n) - 8, 5, 0, 7); g.fill();
        T('พบ ' + m.found, X(m) + 8, L.y(m.n) - 4, 13, BAD);
      });
    });
    y += microNeed;
  }
  const rh = Math.min(30, (foot - 30 - y) / (rows.length + 1)), fs = Math.max(9, Math.min(15, rh * 0.62));
  const heads = ['จำนวนผล', 'ต่ำกว่าขีดวัด', 'ต่ำสุด', 'มัธยฐาน', 'เฉลี่ย', 'สูงสุด', 'เกณฑ์', 'ไม่ผ่านเกณฑ์'];
  const keys = ['n', 'nd', 'min', 'median', 'mean', 'max', 'limit', 'exceed'];
  const x0 = M + 340, hs = Math.min(fs, 13), cw = (R - x0 - 70) / 8, cx = (i) => x0 + 70 + (i + 1) * cw;
  T('พารามิเตอร์' + (sites.length ? ' (รวมทุกสถานที่ที่เลือก)' : ''), M, y, hs, DIM, 'left', 600); T('หน่วย', x0, y, hs, DIM, 'left', 600);
  heads.forEach((t, i) => T(t, cx(i), y, hs, DIM, 'right', 600));
  rule(M, y + rh * 0.35, R, y + rh * 0.35, INK);
  rows.forEach((r) => {
    y += rh;
    T(r.name, M, y, fs); T(r.unit || '', x0, y, fs, DIM);
    keys.forEach((k, i) => T(k === 'limit' ? r.limit || '—' : fv(r[k]), cx(i), y, fs, k === 'exceed' && r.exceed > 0 ? BAD : INK, 'right', k === 'exceed' && r.exceed > 0 ? 600 : 400));
    rule(M, y + rh * 0.35, R, y + rh * 0.35, '#ececec');
  });
  T('ที่มา: เคมีใหญ่.xlsx · เกณฑ์กำหนดคุณภาพน้ำประปา การประปานครหลวง ประกาศ 11 ต.ค. 2565 · สถิติคำนวณจากผลที่รายงานเป็นตัวเลข', M, foot + 6, 14, DIM);
  return cv;
};

let want = false, shown = '';
all('[data-act="export"]').forEach((b) => b.addEventListener('click', () => { want = true; dash.draw('export'); }));
dash.draw('export', (box) => {
  const sig = JSON.stringify(dash.params());
  if (!want) { if (sig !== shown) { box.replaceChildren(); shown = ''; } return; }
  want = false;
  const o = (ok('overview') || [])[0];
  if (!o || !o.samples) { box.replaceChildren(h('p', {className: 'wq-muted'}, 'ไม่มีตัวอย่างน้ำในตัวกรองที่เลือก จึงยังสร้างรูปภาพไม่ได้')); shown = sig; return; }
  const url = makeImage().toDataURL('image/png');
  const link = h('a', {className: 'wq-btn', href: url, download: 'water-quality-summary_' + o.first + '_' + o.last + '.png'}, 'ดาวน์โหลดรูปภาพ (PNG)');
  link.style.marginTop = 'var(--cds-gap-md)';
  box.replaceChildren(link, h('img', {className: 'wq-preview', src: url, alt: 'รูปภาพสรุปสถิติคุณภาพน้ำประปาหนึ่งหน้า'}));
  shown = sig;
  link.click();
});
