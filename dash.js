// Small runtime for the dashboard page: loads the data files, keeps the filter state
// (in the URL after #, so a copied link opens the same view), runs calculations and redraws.
(function () {
  const SOURCES = {samples: 'data/samples.json', criteria: 'data/criteria.json'};
  const DEFAULTS = {from: '', to: '', job: '', branch: '', sites: '', ps: '', cps: 'cl', layout: 'split', yscale: 'pct'};

  const rows = {}, status = {}, errors = {};
  const calcs = {}, draws = {}, listeners = [];
  let cache = {};
  let params = Object.assign({}, DEFAULTS, readHash());

  function readHash() {
    const out = {};
    try {
      new URLSearchParams(location.hash.slice(1)).forEach((v, k) => { if (k in DEFAULTS) out[k] = v; });
    } catch (e) { /* ignore a malformed hash */ }
    return out;
  }
  function writeHash() {
    const q = new URLSearchParams();
    Object.keys(params).forEach((k) => { if (params[k] !== DEFAULTS[k]) q.set(k, params[k]); });
    const s = q.toString();
    try { history.replaceState(null, '', s ? '#' + s : location.pathname + location.search); } catch (e) { /* file:// */ }
  }

  function safe(fn) { try { fn(); } catch (e) { console.error(e); } }

  function data(id) {
    if (id in SOURCES) {
      if (status[id] === 'ok') return {status: 'ok', data: rows[id]};
      return {status: status[id] || 'loading', data: [], message: errors[id]};
    }
    const c = calcs[id];
    if (!c) return {status: 'missing', data: null};
    const inputs = c.inputs.map(data);
    const bad = inputs.find((d) => d.status !== 'ok');
    if (bad) return {status: bad.status, data: null, message: bad.message};
    if (!(id in cache)) cache[id] = c.fn(...inputs.map((d) => d.data));
    return {status: 'ok', data: cache[id]};
  }

  function drawOne(name) {
    const fn = draws[name];
    if (!fn) return;
    document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => {
      if (!el.closest('[hidden]')) safe(() => fn(el));
    });
  }
  function run() {
    cache = {};
    listeners.forEach((fn) => safe(fn));
    Object.keys(draws).forEach(drawOne);
  }

  window.dash = {
    colors: ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)', 'var(--c7)', 'var(--c8)'],
    data,
    calc(id, def) { calcs[id] = def; },
    loader() { /* not used here */ },
    onData(fn) { listeners.push(fn); },
    draw(name, fn) { if (fn) draws[name] = fn; else drawOne(name); },
    params() { return Object.assign({}, params); },
    setParams(next) {
      Object.keys(next).forEach((k) => { params[k] = next[k] == null ? '' : String(next[k]); });
      writeHash();
      run();
    },
    resetParams() { params = Object.assign({}, DEFAULTS); writeHash(); run(); },
    refresh() { /* data files are static */ },
    setLink() { /* not used here */ },
  };

  let timer = null;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(run, 150); });
  window.addEventListener('hashchange', () => { params = Object.assign({}, DEFAULTS, readHash()); run(); });

  Object.keys(SOURCES).forEach((id) => {
    fetch(SOURCES[id], {cache: 'no-cache'})
      .then((r) => { if (!r.ok) throw new Error(r.status + ' ' + r.statusText); return r.json(); })
      .then((j) => { rows[id] = Array.isArray(j) ? j : j.rows; status[id] = 'ok'; })
      .catch((e) => {
        status[id] = 'error'; errors[id] = String(e);
        const box = document.getElementById('load-error');
        if (box) box.hidden = false;
      })
      .finally(run);
  });
})();
