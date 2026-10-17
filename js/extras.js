/*
  usr/usosky — toys for the terminal.

  Commands: neofetch, theme, crt, weather, co2, mccabe, matrix, reboot
  (and a couple of unlisted ones). Also: a short boot screen on the first visit
  of a browser session, text that "decrypts" while a tab replays, and the Bilbao
  weather and the latest Mauna Loa CO2 reading in the status bar.
  Builds on js/terminal.js (window.usosky). Animations stay off for visitors
  who switched on "reduce motion".
*/
(() => {
  'use strict';
  const T = window.usosky;
  if (!T) return;
  const { el } = T;
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = (area) => ({
    get: (k) => { try { return window[area].getItem(k); } catch { return null; } },
    set: (k, v) => { try { window[area].setItem(k, v); } catch { /* private mode */ } },
  });
  const local = store('localStorage');
  const session = store('sessionStorage');
  const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();

  /* ================= neofetch (edit these lines freely) ================= */
  const RESEARCH_SINCE = 2018;
  function neofetchLines() {
    const { PAPERS, PROCEEDINGS } = T.data();
    const count = (n) => {
      const m = String(n).match(/^(\d+)-(\d+)$/);
      return m ? Number(m[2]) - Number(m[1]) + 1 : 1;
    };
    const talks = PROCEEDINGS.reduce((sum, p) => sum + count(p.n), 0);
    return [
      ['OS', 'Chemical Engineering / Thermodynamics'],
      ['Host', 'IDOM, Bilbao: MSCA Postdoctoral Fellow (AuSpire)'],
      ['Kernel', 'PhD, UST / KIST School, 2024'],
      ['Uptime', `${new Date().getFullYear() - RESEARCH_SINCE} years in research`],
      ['Packages', `${PAPERS.length} papers, ${talks} conference contributions`],
      ['Shell', 'usosky-sh 2.0'],
      ['Resolution', 'vapor-liquid equilibria'],
      ['CPU', 'CO2 capture and utilization'],
      ['GPU', 'Aspen Plus, COSMO-RS, PC-SAFT, Python'],
      ['Locale', 'Bilbao, ES (Europe/Madrid)'],
    ];
  }

  T.command('neofetch', () => {
    const art = document.querySelector('.source .face');
    const face = el('pre', 'face', art ? art.textContent : '');
    face.setAttribute('aria-hidden', 'true');
    const info = el('div', 'neo-info');
    const title = el('p');
    title.append(el('b', 'user', 'visitor'), el('b', null, '@'), el('b', 'user', 'terminal.usosky'));
    info.append(title, el('p', null, '-'.repeat(23)));
    neofetchLines().forEach(([k, v]) => {
      const p = el('p');
      p.append(el('b', 'neo-key', `${k}: `), v);
      info.append(p);
    });
    const swatches = el('p', 'swatches');
    ['--dim', '--fg', '--user', '--dir', '--yellow', '--aqua', '--purple', '--orange', '--bright'].forEach((v) => {
      const s = el('span', 'swatch', '   ');
      s.style.background = `var(${v})`;
      swatches.append(s);
    });
    info.append(el('p', null, ' '), swatches);
    const box = el('div', 'neo');
    box.append(face, info);
    T.emit(box);
  }, true);

  /* ================= themes and CRT mode ================= */
  const THEMES = {
    default: 'the original colours',
    green: 'P1 green phosphor',
    amber: 'P3 amber phosphor',
    ibm: 'IBM PC with VGA colours',
  };
  const setThemeColor = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = cssVar('--bg') || '#161719';
  };

  T.command('theme', (args) => {
    const name = (args[0] || '').toLowerCase();
    const current = root.dataset.theme || 'default';
    if (!name) {
      const lines = Object.entries(THEMES).map(([k, v]) => el('p', 'keep', `${k === current ? '*' : ' '} ${k.padEnd(8)} ${v}`));
      lines.push(el('p', 'comment', '# theme <name> switches · crt on|off adds scanlines and glow'));
      T.emit(lines);
      return true;
    }
    if (!Object.prototype.hasOwnProperty.call(THEMES, name)) return T.fail(`theme: no theme "${name}" (try: ${Object.keys(THEMES).join(', ')})`);
    if (name === 'default') delete root.dataset.theme;
    else root.dataset.theme = name;
    local.set('usosky-theme', name === 'default' ? '' : name);
    setThemeColor();
    T.note(`theme ${name}: ${THEMES[name]}`);
    return true;
  }, true);

  T.command('crt', (args) => {
    const arg = (args[0] || '').toLowerCase();
    const on = arg === 'on' ? true : arg === 'off' ? false : !root.classList.contains('crt');
    root.classList.toggle('crt', on);
    local.set('usosky-crt', on ? 'on' : '');
    T.note(on ? 'crt on: scanlines and phosphor glow (crt off to stop)' : 'crt off');
    return true;
  }, true);
  setThemeColor();

  /* ================= boot screen ================= */
  const BOOT = [
    ['usoskyBIOS v2.0', ''],
    ['CPU: thermodynamics @ 298.15 K', 'OK'],
    ['Memory test: 640K', 'OK'],
    ['Loading NRTL-HOC, UNIQUAC, PC-SAFT', 'OK'],
    ['Mounting /home/usosky', 'OK'],
    ['Starting usosky-sh 2.0', 'OK'],
  ];

  async function boot() {
    T.clear();
    const lines = BOOT.map(([text, status]) => {
      const p = el('p', 'boot-line keep', text);
      if (status) p.append(` ${'.'.repeat(Math.max(3, 38 - text.length))} `, el('span', 'boot-ok', `[ ${status} ]`));
      return p;
    });
    await T.stream(lines, T.id, 70);
    await T.sleep(350);
    T.clear();
  }

  // first visit of this browser session: boot before the about window
  T.hooks.boot = async () => {
    if (reduceMotion || session.get('usosky-booted')) return;
    session.set('usosky-booted', '1');
    await boot();
  };

  T.command('reboot', async () => {
    await boot();
    if (location.hash !== '#about') history.pushState(null, '', '#about');
    T.showView('about', { fast: T.fast });
  }, true);

  /* ================= text that decrypts while a tab replays ================= */
  const GLYPHS = '!<>-_\\/[]{}=+*^?#%&01';
  const jobs = new Set();
  let rafId = 0;

  T.hooks.decorate = (node) => {
    if (reduceMotion || T.fast) return;
    const texts = [];
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: (t) => (!t.nodeValue.trim() || t.parentElement.closest('pre, .ps1') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (walker.nextNode()) texts.push({ node: walker.currentNode, text: walker.currentNode.nodeValue });
    if (!texts.length) return;
    jobs.add({ texts, start: performance.now(), duration: 420 });
    if (!rafId) rafId = requestAnimationFrame(tick);
  };

  function tick(now) {
    rafId = 0;
    jobs.forEach((job) => {
      const p = (now - job.start) / job.duration;
      const done = p >= 1 || T.fast || !job.texts[0].node.isConnected;
      job.texts.forEach(({ node, text }) => {
        if (done) { node.nodeValue = text; return; }
        let out = '';
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          const keep = ch === ' ' || ch.charCodeAt(0) > 126 || i / text.length < p;
          out += keep ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
        }
        node.nodeValue = out;
      });
      if (done) jobs.delete(job);
    });
    if (jobs.size) rafId = requestAnimationFrame(tick);
  }

  /* ================= mccabe: McCabe–Thiele for a binary column ================= */
  function mccabe(o) {
    const { alpha: a, xd, xb, zf, q } = o;
    const yEq = (x) => (a * x) / (1 + (a - 1) * x);
    const xEq = (y) => y / (a - (a - 1) * y);
    const isSatLiquid = Math.abs(q - 1) < 1e-9;
    const qLine = (x) => (q / (q - 1)) * x - zf / (q - 1);
    // pinch: q-line meets the equilibrium curve
    let xp = zf;
    if (!isSatLiquid) {
      let lo = q > 1 ? zf : 0;
      let hi = q > 1 ? 1 : zf;
      for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        const f = yEq(mid) - qLine(mid);
        if ((f > 0) === (q > 1)) lo = mid; else hi = mid;
      }
      xp = (lo + hi) / 2;
    }
    const yp = yEq(xp);
    const rmin = (xd - yp) / (yp - xp);
    const r = o.r != null ? o.r : o.factor * rmin;
    const rect = (x) => (r / (r + 1)) * x + xd / (r + 1);
    const xi = isSatLiquid ? zf : (xd / (r + 1) + zf / (q - 1)) / (q / (q - 1) - r / (r + 1));
    const yi = rect(xi);
    const slope = (yi - xb) / (xi - xb);
    const strip = (x) => xb + slope * (x - xb);
    const steps = [];
    let x = xd;
    let y = xd;
    let feed = 0;
    while (steps.length < 60) {
      const x2 = xEq(y);
      const step = { x, y, x2, y2: null };
      steps.push(step);
      if (x2 <= xb) break;
      const rectifying = x2 > xi;
      if (!rectifying && !feed) feed = steps.length;
      step.y2 = rectifying ? rect(x2) : strip(x2);
      x = x2;
      y = step.y2;
    }
    const nmin = Math.log((xd / (1 - xd)) * ((1 - xb) / xb)) / Math.log(a);
    return { yEq, xEq, rect, strip, rmin, r, xi, yi, steps, feed: feed || steps.length, nmin };
  }

  function mccabePlot(o, res) {
    // as wide as the screen allows (31-65 columns), roughly square on screen
    const fs = parseFloat(getComputedStyle(root).fontSize) || 16;
    const screenEl = document.querySelector('.screen');
    const avail = Math.floor((screenEl ? screenEl.clientWidth : innerWidth) / (fs * 0.5)) - 6;
    const W = Math.max(31, Math.min(65, avail));
    const H = Math.max(15, Math.round((W * 0.5) / 1.04));
    const grid = Array.from({ length: H }, () => Array.from({ length: W }, () => [' ', '']));
    const col = (x) => Math.round(Math.max(0, Math.min(1, x)) * (W - 1));
    const row = (y) => Math.round((1 - Math.max(0, Math.min(1, y))) * (H - 1));
    const put = (x, y, ch, cls) => { grid[row(y)][col(x)] = [ch, cls]; };
    const line = (x1, y1, x2, y2, ch, cls) => {
      const n = Math.max(Math.abs(col(x2) - col(x1)), Math.abs(row(y2) - row(y1)), 1) * 2;
      for (let i = 0; i <= n; i++) put(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, ch, cls);
    };
    line(0, 0, 1, 1, '.', 'mt-dim');
    for (let i = 0; i <= 400; i++) put(i / 400, res.yEq(i / 400), '*', 'mt-eq');
    line(o.xb, o.xb, res.xi, res.yi, ':', 'mt-op');
    line(res.xi, res.yi, o.xd, o.xd, ':', 'mt-op');
    line(o.zf, o.zf, res.xi, res.yi, ':', 'mt-q');
    res.steps.forEach((s) => {
      line(s.x2, s.y, s.x, s.y, '-', 'mt-step');
      if (s.y2 != null) line(s.x2, s.y, s.x2, s.y2, '|', 'mt-step');
      put(s.x2, s.y, '+', 'mt-step');
    });
    const pre = el('pre', 'mt');
    const add = (text, cls) => pre.append(cls ? el('span', cls, text) : text);
    grid.forEach((cells, r) => {
      add(r === 0 ? '1.0 |' : r === H - 1 ? '  0 |' : r === Math.floor(H / 2) ? ' y  |' : '    |', 'mt-dim');
      let run = '';
      let runCls = null;
      cells.forEach(([ch, cls]) => {
        if (cls !== runCls) { if (run) add(run, runCls); run = ''; runCls = cls; }
        run += ch;
      });
      if (run) add(run, runCls);
      add('\n');
    });
    add(`    +${'-'.repeat(W)}\n`, 'mt-dim');
    add(`     0${' '.repeat(Math.floor(W / 2) - 2)}x${' '.repeat(W - Math.floor(W / 2) - 3)}1`, 'mt-dim');
    return pre;
  }

  T.command('mccabe', (args) => {
    const o = { alpha: 2.5, xd: 0.95, xb: 0.05, zf: 0.5, q: 1, factor: 1.5, r: null };
    const keys = { '--alpha': 'alpha', '-a': 'alpha', '--xd': 'xd', '--xb': 'xb', '--zf': 'zf', '--q': 'q', '--r': 'r', '--factor': 'factor' };
    for (let i = 0; i < args.length; i++) {
      const [flag, inline] = args[i].split('=');
      if (keys[flag]) o[keys[flag]] = parseFloat(inline != null ? inline : args[++i]);
      else if (/^[\d.]+$/.test(args[i])) o.alpha = parseFloat(args[i]);
    }
    const bad = [o.alpha, o.xd, o.xb, o.zf, o.q, o.factor].some((v) => !Number.isFinite(v)) || (o.r != null && !Number.isFinite(o.r));
    if (bad || o.alpha <= 1 || !(o.xb > 0 && o.xb < o.zf && o.zf < o.xd && o.xd < 1)) {
      return T.fail('usage: mccabe [--alpha 2.5] [--xd 0.95] [--xb 0.05] [--zf 0.5] [--q 1] [--r R | --factor 1.5]  (alpha > 1, 0 < xb < zf < xd < 1)');
    }
    const res = mccabe(o);
    if (!(res.r > res.rmin)) return T.fail(`mccabe: R = ${res.r.toFixed(2)} is not above Rmin = ${res.rmin.toFixed(2)}: the column would need infinite stages`);
    const f = (v) => (Math.round(v * 100) / 100).toString();
    const qText = Math.abs(o.q - 1) < 1e-9 ? 'saturated liquid feed' : `q = ${f(o.q)}`;
    const head = el('p', 'keep', `McCabe–Thiele · α = ${f(o.alpha)} · xD = ${f(o.xd)} · xB = ${f(o.xb)} · zF = ${f(o.zf)} · ${qText}`);
    const summary = [
      el('p', 'keep', `Rmin = ${f(res.rmin)}   R = ${f(res.r)}${o.r == null ? ` (${f(o.factor)} × Rmin)` : ''}   Nmin (Fenske) = ${f(res.nmin)}`),
      el('p', 'keep', `${res.steps.length} theoretical stages incl. the reboiler · feed on stage ${res.feed}`),
      el('p', 'comment', '# * equilibrium  : operating lines  -| stages · try mccabe --alpha 1.6'),
    ];
    T.emit([head, el('p', null, ' '), mccabePlot(o, res), el('p', null, ' '), ...summary]);
    return true;
  }, true);

  /* ================= matrix: molecules raining down ================= */
  const MOLECULES = ['CO2', 'H2O', 'CH4', 'N2', 'O2', 'H2', 'NH3', 'HCOOH', 'CH3OH', 'MEA', 'K2CO3', 'CaCO3', 'CaO', 'NaOH', 'PZ', 'DAC', 'eSAF', 'VLE'];

  T.command('matrix', () => new Promise((resolve) => {
    if (reduceMotion) { T.say('matrix: off while "reduce motion" is switched on'); resolve(false); return; }
    const canvas = el('canvas', 'matrix');
    canvas.setAttribute('aria-hidden', 'true');
    document.body.append(canvas);
    const ctx = canvas.getContext('2d');
    const size = 16;
    const head = cssVar('--bright') || '#fff';
    const body = cssVar('--user') || '#87c38a';
    const bg = cssVar('--bg') || '#161719';
    let drops = [];
    let w = 0;
    let h = 0;
    const pick = () => MOLECULES[(Math.random() * MOLECULES.length) | 0];
    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = innerWidth;
      h = innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      drops = Array.from({ length: Math.ceil(w / (size * 0.7)) }, () => ({ y: -Math.random() * (h / size), word: pick(), i: 0 }));
    };
    fit();
    ctx.font = `${size}px Inconsolata, monospace`;
    let last = 0;
    let frame = 0;
    const draw = (now) => {
      frame = requestAnimationFrame(draw);
      if (now - last < 55) return;
      last = now;
      ctx.fillStyle = `${bg}26`;
      ctx.fillRect(0, 0, w, h);
      ctx.font = `${size}px Inconsolata, monospace`;
      drops.forEach((d, c) => {
        const ch = d.word[d.i % d.word.length];
        ctx.fillStyle = Math.random() < 0.1 ? head : body;
        ctx.fillText(ch, c * size * 0.7, d.y * size);
        d.y += 1;
        d.i += 1;
        if (d.y * size > h && Math.random() > 0.96) {
          d.y = 0;
          d.word = pick();
          d.i = 0;
        }
      });
    };
    frame = requestAnimationFrame(draw);
    const stop = () => {
      cancelAnimationFrame(frame);
      canvas.remove();
      removeEventListener('keydown', stop, true);
      removeEventListener('pointerdown', stop, true);
      removeEventListener('resize', fit);
      clearTimeout(timer);
      T.note('back in the terminal. Press any key to leave the rain early next time');
      resolve(true);
    };
    const timer = setTimeout(stop, 9000);
    setTimeout(() => {
      addEventListener('keydown', stop, true);
      addEventListener('pointerdown', stop, true);
    }, 300);
    addEventListener('resize', fit);
  }), true);

  /* ================= unlisted ================= */
  T.command('coffee', () => {
    T.emit([el('p', null, "HTTP/1.1 418 I'm a teapot"), el('p', 'comment', '# RFC 2324. Try tea.')]);
  });
  T.command('tea', () => { T.say('Steeping at 85 °C for 3 minutes... done. Enjoy.'); });

  /* ================= weather (Open-Meteo, no key, no cookies) ================= */
  const WX_URL = 'https://api.open-meteo.com/v1/forecast?latitude=43.263&longitude=-2.935&current=temperature_2m,weather_code&timezone=Europe%2FMadrid';
  const WMO = {
    0: 'clear', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 48: 'rime fog',
    51: 'light drizzle', 53: 'drizzle', 55: 'heavy drizzle', 56: 'freezing drizzle', 57: 'freezing drizzle',
    61: 'light rain', 63: 'rain', 65: 'heavy rain', 66: 'freezing rain', 67: 'freezing rain',
    71: 'light snow', 73: 'snow', 75: 'heavy snow', 77: 'snow grains', 80: 'showers', 81: 'showers',
    82: 'heavy showers', 85: 'snow showers', 86: 'snow showers', 95: 'thunderstorm', 96: 'thunderstorm, hail', 99: 'thunderstorm, hail',
  };
  const ICONS = {
    sun: ['    \\   /', '     .-.', '  - (   ) -', "     `-'", '    /   \\'],
    cloud: ['', '     .--.', '  .-(    ).', ' (___.__)__)', ''],
    rain: ['     .--.', '  .-(    ).', ' (___.__)__)', "   ' ' ' '", "  ' ' ' '"],
    snow: ['     .--.', '  .-(    ).', ' (___.__)__)', '   *  *  *', '  *  *  *'],
    fog: ['', ' _ - _ - _ -', '  _ - _ - _', ' _ - _ - _ -', ''],
    storm: ['     .--.', '  .-(    ).', ' (___.__)__)', '    /_  /_', '     /   /'],
  };
  const iconFor = (code) => {
    if (code === 0 || code === 1) return 'sun';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 95) return 'storm';
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
    if (code >= 51) return 'rain';
    return 'cloud';
  };

  async function getWeather() {
    try {
      const cached = JSON.parse(session.get('usosky-wx') || 'null');
      if (cached && Date.now() - cached.t < 30 * 60 * 1000) return cached;
    } catch { /* ignore */ }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch(WX_URL, { signal: ctl.signal });
      if (!res.ok) return null;
      const json = await res.json();
      const wx = { t: Date.now(), temp: Math.round(json.current.temperature_2m), code: json.current.weather_code };
      session.set('usosky-wx', JSON.stringify(wx));
      return wx;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function showWeatherInBar() {
    const slot = document.querySelector('.tmux .weather');
    if (!slot) return;
    const wx = await getWeather();
    if (!wx) return;
    slot.replaceChildren(el('span', 'wx-temp', `${wx.temp}°C`), ' ', el('span', 'wx-text', WMO[wx.code] || ''));
  }

  T.command('weather', async () => {
    const wx = await getWeather();
    if (!wx) return T.fail('weather: Open-Meteo did not answer. Try again in a minute');
    const kind = iconFor(wx.code);
    const art = el('pre', `wx-icon wx-${kind}`, ICONS[kind].join('\n'));
    const info = el('div', 'neo-info');
    const at = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(wx.t));
    info.append(
      el('p', null, ' '),
      el('p', 'pub-title', `Bilbao, Spain: ${wx.temp}°C, ${WMO[wx.code] || `code ${wx.code}`}`),
      el('p', 'comment', `# updated ${at} local time · data: Open-Meteo`),
    );
    const box = el('div', 'neo wx');
    box.append(art, info);
    T.emit(box);
    return true;
  }, true);

  /* ================= Mauna Loa CO2 (written into index.html weekly by tools/update_co2.py) ================= */
  const co2El = document.querySelector('.tmux .co2');
  const co2 = co2El && co2El.dataset.ppm ? {
    ppm: parseFloat(co2El.dataset.ppm),
    week: co2El.dataset.week,
    y1: parseFloat(co2El.dataset.ppm1y),
    y10: parseFloat(co2El.dataset.ppm10y),
  } : null;

  T.command('co2', () => {
    if (!co2) return T.fail('co2: no reading yet. The weekly update fills it in');
    const scale = 12.5; // ppm per #
    const bar = (label, v, cls) => {
      const p = el('p', 'keep');
      p.append(label.padEnd(11), el('span', cls, '#'.repeat(Math.round(v / scale))), ` ${v.toFixed(1)}`);
      return p;
    };
    const lines = [el('p', 'keep', `Mauna Loa CO2, weekly mean, week of ${co2.week}: ${co2.ppm.toFixed(2)} ppm`), el('p', null, ' ')];
    lines.push(bar('pre-1800', 280, 'mt-dim'));
    if (Number.isFinite(co2.y10)) lines.push(bar('10 yrs ago', co2.y10, 'mt-op'));
    if (Number.isFinite(co2.y1)) lines.push(bar('1 yr ago', co2.y1, 'mt-op'));
    lines.push(bar('this week', co2.ppm, 'mt-eq'));
    lines.push(el('p', null, ' '), el('p', 'comment', '# pre-industrial ≈ 280 ppm · source: NOAA Global Monitoring Laboratory'));
    T.emit(lines);
    return true;
  }, true);

  // status bar: weather once the page has settled; CO2 is already in the HTML
  if (co2El && !co2) co2El.hidden = true;
  setTimeout(showWeatherInBar, 1500);
  setInterval(() => { if (!document.hidden) showWeatherInBar(); }, 30 * 60 * 1000);
})();
