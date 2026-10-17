/*
  usr/usosky — toys for the terminal.

  Commands (listed first in `help`): neofetch, weather, co2, theme, crt, matrix.
  Unlisted: coffee, tea. Also: the theme button in the top-right corner, a short
  boot screen on the first visit of a browser session, text that "decrypts"
  while a tab replays, and the Bilbao weather and Mauna Loa CO2 reading in the
  status bar. Builds on js/terminal.js (window.usosky). Animations stay off for
  visitors who switched on "reduce motion".
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

  /* ================= Mauna Loa CO2 (written into index.html weekly by tools/update_co2.py) ================= */
  const co2El = document.querySelector('.tmux .co2');
  const co2 = co2El && co2El.dataset.ppm ? {
    ppm: parseFloat(co2El.dataset.ppm),
    week: co2El.dataset.week,
    y1: parseFloat(co2El.dataset.ppm1y),
    y10: parseFloat(co2El.dataset.ppm10y),
  } : null;
  if (co2El && !co2) co2El.hidden = true;

  /* ================= neofetch (edit these lines freely) ================= */
  const RESEARCH_SINCE = 2018;
  function neofetchLines() {
    const { PAPERS, PROCEEDINGS } = T.data();
    const count = (n) => {
      const m = String(n).match(/^(\d+)-(\d+)$/);
      return m ? Number(m[2]) - Number(m[1]) + 1 : 1;
    };
    const talks = PROCEEDINGS.reduce((sum, p) => sum + count(p.n), 0);
    const lines = [
      ['OS', 'Chemical Engineering / Thermodynamics'],
      ['Host', 'IDOM, Bilbao: MSCA Postdoctoral Fellow (AuSpire)'],
      ['Kernel', 'PhD, UST / KIST School, 2024'],
      ['Uptime', `${new Date().getFullYear() - RESEARCH_SINCE} years in research`],
      ['Packages', `${PAPERS.length} papers, ${talks} conference contributions`],
      ['Shell', 'usosky-sh 2.0'],
      ['Research', 'CO2 capture and utilization'],
      ['Tools', 'Aspen Plus, COSMO-RS, PC-SAFT, Python'],
      ['Locale', 'Bilbao, ES (Europe/Madrid)'],
    ];
    if (co2) lines.push(['CO2', `${co2.ppm.toFixed(1)} ppm at Mauna Loa (week of ${co2.week})`]);
    return lines;
  }

  T.command('neofetch', () => {
    const pic = el('div', 'neo-pic');
    pic.setAttribute('role', 'img');
    pic.setAttribute('aria-label', 'Portrait of Denis Usosky');
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
    ['--dim', '--fg', '--user', '--dir', '--yellow', '--aqua', '--purple', '--orange', '--pink', '--bright'].forEach((v) => {
      const s = el('span', 'swatch', '\u00a0\u00a0\u00a0');
      s.style.background = `var(${v})`;
      swatches.append(s);
    });
    info.append(el('p', null, '\u00a0'), swatches);
    const box = el('div', 'neo');
    box.append(pic, info);
    T.emit(box);
  }, ['neofetch', 'a quick profile card']);

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
      el('p', null, '\u00a0'),
      el('p', 'pub-title', `Bilbao, Spain: ${wx.temp}°C, ${WMO[wx.code] || `code ${wx.code}`}`),
      el('p', 'comment', `# updated ${at} local time · data: Open-Meteo`),
    );
    const box = el('div', 'neo wx');
    box.append(art, info);
    T.emit(box);
    return true;
  }, ['weather', 'the weather in Bilbao right now']);

  /* ================= co2 ================= */
  T.command('co2', () => {
    if (!co2) return T.fail('co2: no reading yet. The weekly update fills it in');
    const scale = 12.5; // ppm per #
    const bar = (label, v, cls) => {
      const p = el('p', 'keep');
      p.append(label.padEnd(11), el('span', cls, '#'.repeat(Math.round(v / scale))), ` ${v.toFixed(1)}`);
      return p;
    };
    const lines = [el('p', 'keep', `Mauna Loa CO2, weekly mean, week of ${co2.week}: ${co2.ppm.toFixed(2)} ppm`), el('p', null, '\u00a0')];
    lines.push(bar('pre-1800', 280, 'co2-old'));
    if (Number.isFinite(co2.y10)) lines.push(bar('10 yrs ago', co2.y10, 'co2-past'));
    if (Number.isFinite(co2.y1)) lines.push(bar('1 yr ago', co2.y1, 'co2-past'));
    lines.push(bar('this week', co2.ppm, 'co2-now'));
    lines.push(el('p', null, '\u00a0'), el('p', 'comment', '# pre-industrial ≈ 280 ppm · source: NOAA Global Monitoring Laboratory'));
    T.emit(lines);
    return true;
  }, ['co2', 'the latest Mauna Loa CO2 reading']);

  /* ================= themes, CRT mode and the theme button ================= */
  const THEMES = {
    default: 'the original colours',
    green: 'P1 green phosphor',
    amber: 'P3 amber phosphor',
    ibm: 'IBM PC with VGA colours',
  };
  const currentTheme = () => root.dataset.theme || 'default';
  const listeners = [];
  const setThemeColor = () => {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = cssVar('--bg') || '#161719';
  };
  setThemeColor(); // the theme may have been restored from an earlier visit

  function applyTheme(name) {
    if (name === 'default') delete root.dataset.theme;
    else root.dataset.theme = name;
    local.set('usosky-theme', name === 'default' ? '' : name);
    setThemeColor();
    listeners.forEach((fn) => fn());
  }

  function applyCrt(on) {
    root.classList.toggle('crt', on);
    local.set('usosky-crt', on ? 'on' : '');
    listeners.forEach((fn) => fn());
  }

  T.command('theme', (args) => {
    const name = (args[0] || '').toLowerCase();
    if (!name) {
      const lines = Object.entries(THEMES).map(([k, v]) => el('p', 'keep', `${k === currentTheme() ? '*' : ' '} ${k.padEnd(8)} ${v}`));
      lines.push(el('p', 'comment', '# theme <name> switches · crt on|off adds scanlines and glow · or use the button top right'));
      T.emit(lines);
      return true;
    }
    if (!Object.prototype.hasOwnProperty.call(THEMES, name)) return T.fail(`theme: no theme "${name}" (try: ${Object.keys(THEMES).join(', ')})`);
    applyTheme(name);
    T.note(`theme ${name}: ${THEMES[name]}`);
    return true;
  }, ['theme [name]', 'colours: default, green, amber, ibm (also the button top right)']);

  T.command('crt', (args) => {
    const arg = (args[0] || '').toLowerCase();
    const on = arg === 'on' ? true : arg === 'off' ? false : !root.classList.contains('crt');
    applyCrt(on);
    T.note(on ? 'crt on: scanlines and phosphor glow (crt off to stop)' : 'crt off');
    return true;
  }, ['crt [on|off]', 'scanlines and phosphor glow']);

  // the button in the top-right corner
  (function themeButton() {
    const btn = el('button', 'theme-btn');
    btn.type = 'button';
    btn.title = 'Colour theme';
    btn.setAttribute('aria-label', 'Colour theme');
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor"/></svg>';
    const menu = el('div', 'theme-menu');
    menu.id = 'theme-menu';
    menu.hidden = true;
    menu.setAttribute('role', 'menu');
    btn.setAttribute('aria-controls', menu.id);
    menu.append(el('p', 'theme-menu-head', 'theme'));
    const options = Object.keys(THEMES).map((name) => {
      const opt = el('button', 'theme-opt');
      opt.type = 'button';
      opt.setAttribute('role', 'menuitemradio');
      opt.dataset.theme = name;
      opt.addEventListener('click', () => { applyTheme(name); close(); });
      menu.append(opt);
      return opt;
    });
    const crt = el('button', 'theme-opt');
    crt.type = 'button';
    crt.setAttribute('role', 'menuitemcheckbox');
    crt.addEventListener('click', () => { applyCrt(!root.classList.contains('crt')); close(); });
    menu.append(el('p', 'theme-menu-rule', '-'.repeat(12)), crt);

    const sync = () => {
      options.forEach((opt) => {
        const on = opt.dataset.theme === currentTheme();
        opt.textContent = `${on ? '*' : ' '} ${opt.dataset.theme}`;
        opt.setAttribute('aria-checked', String(on));
      });
      const crtOn = root.classList.contains('crt');
      crt.textContent = `[${crtOn ? 'x' : ' '}] crt`;
      crt.setAttribute('aria-checked', String(crtOn));
    };
    listeners.push(sync);
    sync();

    function open() {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      (options.find((o) => o.dataset.theme === currentTheme()) || options[0]).focus();
    }
    function close(refocus) {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      if (refocus) btn.focus();
    }
    btn.addEventListener('click', () => (menu.hidden ? open() : close()));
    document.addEventListener('pointerdown', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) close();
    });
    menu.addEventListener('keydown', (e) => {
      const items = [...menu.querySelectorAll('button')];
      const i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); close(true); }
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    });
    document.body.append(btn, menu);
  })();

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
        ctx.fillStyle = Math.random() < 0.1 ? head : body;
        ctx.fillText(d.word[d.i % d.word.length], c * size * 0.7, d.y * size);
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
      T.note('back in the terminal');
      resolve(true);
    };
    const timer = setTimeout(stop, 9000);
    setTimeout(() => {
      addEventListener('keydown', stop, true);
      addEventListener('pointerdown', stop, true);
    }, 300);
    addEventListener('resize', fit);
  }), ['matrix', 'molecules raining down (any key stops it)']);

  /* ================= unlisted: coffee and tea ================= */
  const TEAPOT = String.raw`
             _
          __(_)__
      .--'       '--.
 .--./               \    __
( (_|   I'M A TEAPOT  |__/ /
 \__|       418       |___/
     \               /
      '-._________.-'`.slice(1);

  T.command('coffee', () => {
    T.emit([
      el('p', null, "HTTP/1.1 418 I'm a teapot"),
      el('p', null, ' '),
      el('pre', 'art teapot', TEAPOT),
      el('p', null, ' '),
      el('p', 'comment', '# RFC 2324: this server only brews tea. Try: tea'),
    ]);
  });

  // two frames of steam, swapped while the tea brews
  const STEAM = [
    String.raw`
         (  (  (
          )  )  )
         (  (  (`.slice(1),
    String.raw`
          )  )  )
         (  (  (
          )  )  )`.slice(1),
  ];
  const CUP = String.raw`
     .-------------.
     |             |--.
     |     tea     |  |
     |             |--'
      \___________/
   '-----------------'`.slice(1);

  T.command('tea', () => new Promise((resolve) => {
    const art = el('pre', 'art tea');
    const steam = el('span', 'steam');
    art.append(steam, '\n', el('span', 'cup', CUP));
    let frame = 0;
    const show = () => { steam.textContent = STEAM[frame % STEAM.length]; };
    show();
    const box = T.emit([art]);
    let finished = false;
    let timer = 0;
    const done = () => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      removeEventListener('keydown', done, true);
      removeEventListener('pointerdown', done, true);
      box.append(el('p', null, ' '), el('p', 'comment', '# 3 minutes at 95 °C. Enjoy.'));
      resolve(true);
    };
    if (reduceMotion) { done(); return; }
    timer = setInterval(() => {
      frame += 1;
      show();
      if (frame >= 12) done();
    }, 280);
    // a key or a click pours it early (listening a moment later, so the Enter that ran `tea` doesn't count)
    setTimeout(() => {
      if (finished) return;
      addEventListener('keydown', done, true);
      addEventListener('pointerdown', done, true);
    }, 50);
  }));

  /* ================= boot screen: first visit of a browser session ================= */
  const BOOT = [
    ['usoskyBIOS v2.0', ''],
    ['CPU: thermodynamics @ 298.15 K', 'OK'],
    ['Memory test: 640K', 'OK'],
    ['Loading NRTL-HOC, UNIQUAC, PC-SAFT', 'OK'],
    ['Mounting /home/usosky', 'OK'],
    ['Starting usosky-sh 2.0', 'OK'],
  ];

  T.hooks.boot = async () => {
    if (reduceMotion || session.get('usosky-booted')) return;
    session.set('usosky-booted', '1');
    T.clear();
    const lines = BOOT.map(([text, status]) => {
      const p = el('p', 'boot-line keep', text);
      if (status) p.append(` ${'.'.repeat(Math.max(3, 38 - text.length))} `, el('span', 'boot-ok', `[ ${status} ]`));
      return p;
    });
    await T.stream(lines, T.id, 70);
    await T.sleep(350);
    T.clear();
  };

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

  /* ================= status bar: weather once the page has settled ================= */
  setTimeout(showWeatherInBar, 1500);
  setInterval(() => { if (!document.hidden) showWeatherInBar(); }, 30 * 60 * 1000);
})();
