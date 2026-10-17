/*
  usr/usosky — the interactive terminal.

  All the content lives in index.html (the .source block). This script:
    • shows it as three tmux-style windows — 0:about, 1:activity, 2:pubs —
      switched from the status bar, by links like #pubs, or with the back button
    • replays a short session for each window (a click or any key skips it)
    • then leaves a live prompt: type `help`
  Without JavaScript the same content shows as one long terminal session.
*/
(() => {
  'use strict';
  window.termStarted = true;

  /* ---------- settings ---------- */
  const TYPE_MS = 30;          // per typed character, as in the original
  const LINE_MS = 25;          // between printed lines of a list
  const TAIL_N = 10;           // lines `tail` / `head` show by default
  const HOME = '/home/usosky';
  const TZ = 'Europe/Madrid';  // the status-bar clock shows Bilbao time

  const VIEWS = {
    about: { win: 0 },
    activity: { win: 1 },
    pubs: { win: 2 },
  };
  const VIEW_NAMES = Object.keys(VIEWS);
  // what a window prints after you `cd` into it
  const SHOW = { about: 'cat aboutme.txt', activity: 'tail activity.log', pubs: 'cat *.txt' };

  // the virtual file system; '' is the home directory (~)
  const TREE = {
    '': { dirs: ['about', 'activity', 'pubs'], files: ['welcome.txt'] },
    about: { dirs: [], files: ['aboutme.txt'] },
    activity: { dirs: [], files: ['activity.log'] },
    pubs: { dirs: [], files: ['papers.txt', 'proceedings.txt'] },
  };
  const HEADS = {
    'pubs/papers.txt': 'papers.txt: journal papers and preprints, newest first · cite <n> copies BibTeX',
    'pubs/proceedings.txt': 'proceedings.txt: conference talks and posters, newest first',
  };

  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  /* ---------- small helpers ---------- */
  const $ = (sel, scope = document) => scope.querySelector(sel);
  const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  };
  const squash = (s) => s.replace(/\s+/g, ' ').trim();
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  /* ---------- state ---------- */
  let SRC, LOG, PAPERS, PROCEEDINGS, LINKS;
  let screen, wins, sessionEl, clockEl;
  let cwd = '';               // '', 'about', 'activity' or 'pubs'
  let currentView = null;
  let activeWin = -1;
  let lastWin = -1;
  let runId = 0;              // bumps whenever a window starts: older animations stop
  let fast = false;           // a click or a key during a replay: finish it instantly
  let busy = false;           // something is still printing: no prompt yet
  let inputLine = null;
  let inputEl = null;
  const hist = [];
  let histPos = 0;
  let draft = '';
  let prefixTimer = null;
  let inView = false;         // a window's replay is printing (extras may decorate it)
  const hooks = {};           // filled in by js/extras.js: boot(), decorate(node)
  const toys = [];            // extra commands listed by `help`

  const sleep = (ms) => (fast || reduceMotion ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)));

  function fallBack() {
    root.classList.remove('js'); // show the plain version
    if (screen) screen.remove();
  }

  /* ---------- start-up: read the content from index.html ---------- */
  function init() {
    const main = $('.term');
    const source = $('.source', main);
    SRC = {};
    $$('[data-src]', source).forEach((node) => { SRC[node.dataset.src] = node; });

    LOG = $$('li', SRC['activity.log']).map((li) => ({
      date: li.dataset.date || '',
      tag: (li.dataset.tag || '').toUpperCase(),
      html: li.innerHTML.trim(),
      text: squash(`${li.dataset.date || ''} [${li.dataset.tag || ''}] ${li.textContent}`),
    }));
    PAPERS = readPubs(SRC['papers.txt']);
    PROCEEDINGS = readPubs(SRC['proceedings.txt']);
    LINKS = {};
    $$('a', SRC['aboutme.txt']).forEach((a) => { LINKS[a.textContent.trim().toLowerCase()] = a.href; });

    screen = el('div', 'screen');
    main.append(screen);

    const nav = $('.tmux');
    sessionEl = $('.session', nav);
    clockEl = $('.clock', nav);
    wins = $$('a.win', nav);
    wins.forEach((a, i) => { a.dataset.view = VIEW_NAMES[i]; });
    nav.addEventListener('click', onNavClick);
    startClock();

    if (coarse) setupZoomFix();
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', onPointerDown, true);
    screen.addEventListener('click', onScreenClick);
    addEventListener('popstate', onHistory);
    addEventListener('hashchange', onHistory);

    // the small API js/face.js and js/extras.js build on
    window.usosky = {
      el,
      emit,
      say,
      fail,
      clone,
      sleep: (ms) => sleep(ms),
      stream: (nodes, id, delay) => stream(nodes, id, delay),
      note: (text) => emit(el('p', 'comment', `# ${text}`)),
      clear: () => { screen.textContent = ''; },
      command(name, fn, help) {
        COMMANDS[name] = fn;
        if (help) toys.push(name);
      },
      hooks,
      go,
      showView,
      data: () => ({ SRC, LOG, PAPERS, PROCEEDINGS, LINKS }),
      input: () => inputEl,
      get busy() { return busy; },
      get fast() { return fast; },
      get id() { return runId; },
      get view() { return currentView; },
    };

    // start once every deferred script has run, so extras can hook in first
    let started = false;
    const start = async () => {
      if (started) return;
      started = true;
      const name = viewFromHash();
      busy = true;
      if (hooks.boot && name === 'about') {
        try {
          await hooks.boot();
        } catch (err) {
          console.error(err);
        }
      }
      showView(name, { fast });
    };
    if (document.readyState === 'complete') start();
    else {
      addEventListener('DOMContentLoaded', start, { once: true });
      addEventListener('load', start, { once: true });
    }
  }

  function readPubs(list) {
    return $$('li', list).map((li) => {
      const doiLink = $('a[href*="doi.org/"]', li);
      const doi = li.dataset.doi || (doiLink ? doiLink.getAttribute('href').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : '');
      const link = doiLink || $('a', li);
      const part = (sel) => squash(($(sel, li) || { textContent: '' }).textContent);
      return {
        n: li.dataset.n || '',
        authors: part('.authors'),
        title: part('cite'),
        venue: part('.venue'),
        year: part('.year'),
        doi,
        url: doi ? `https://doi.org/${doi}` : (link ? link.href : ''),
        text: squash(li.textContent),
      };
    });
  }

  /* ---------- windows (tabs) ---------- */
  function viewFromHash() {
    const name = decodeURIComponent(location.hash.slice(1)).toLowerCase();
    return has(VIEWS, name) ? name : 'about';
  }

  function scriptFor(name) {
    if (name === 'about') {
      const intro = ['banner', 'cat welcome.txt', 'cd about', 'cat aboutme.txt'];
      return cwd ? ['cd', ...intro] : intro;
    }
    return [`cd ~/${name}`, SHOW[name]];
  }

  async function showView(name, opts = {}) {
    if (!has(VIEWS, name)) name = 'about';
    const id = ++runId;
    currentView = name;
    fast = Boolean(opts.fast);
    busy = true;
    dropInput();
    screen.textContent = '';
    scrollTo(0, 0);
    setWin(VIEWS[name].win);
    inView = true;
    try {
      for (const cmd of scriptFor(name)) {
        if (!(await typeCommand(cmd, id))) return;
        await execute(cmd, id, true);
        if (id !== runId) return;
      }
    } catch (err) {
      console.error(err);
      fallBack();
      return;
    }
    if (id !== runId) return;
    inView = false;
    busy = false;
    showInput({ focus: !coarse, scroll: false });
  }

  function go(name) {
    if (location.hash !== `#${name}`) history.pushState(null, '', `#${name}`);
    showView(name);
  }

  function onNavClick(e) {
    const a = e.target.closest('a.win');
    if (!a) return;
    e.preventDefault();
    go(a.dataset.view);
  }

  function onHistory() {
    const name = viewFromHash();
    if (name !== currentView) showView(name);
  }

  function setWin(i) {
    if (i === activeWin) return;
    if (activeWin >= 0) lastWin = activeWin;
    activeWin = i;
    wins.forEach((a, j) => {
      if (j === i) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
      a.classList.toggle('last', j === lastWin && j !== i);
    });
  }

  const viewOfDir = (dir) => (dir ? dir : 'about'); // the home directory belongs to window 0

  /* ---------- printing ---------- */
  function promptLine(dir) {
    const p = el('p', 'line');
    p.innerHTML = `<span class="ps1"><b><span class="user">visitor@terminal.usosky</span>:<span class="dir">${dir ? `~/${dir}` : '~/'}</span></b>$</span>`;
    return p;
  }

  async function typeCommand(text, id) {
    const line = promptLine(cwd);
    const cmd = el('span', 'cmd');
    line.append(' ', cmd);
    screen.append(line);
    if (!fast && !reduceMotion) {
      cmd.classList.add('typing');
      for (let i = 1; i <= text.length; i++) {
        if (id !== runId) return false;
        if (fast) break;
        cmd.textContent = text.slice(0, i);
        await sleep(TYPE_MS);
      }
      cmd.classList.remove('typing');
    }
    cmd.textContent = text;
    return id === runId;
  }

  // one command's output, followed by a blank line (as in the original)
  function emit(nodes, cls) {
    const box = el('div', cls ? `out ${cls}` : 'out');
    box.append(...[].concat(nodes));
    if (inputLine && inputLine.parentNode === screen) screen.insertBefore(box, inputLine);
    else screen.append(box);
    if (inView && hooks.decorate && box.firstChild) hooks.decorate(box);
    return box;
  }
  const say = (text) => emit(el('p', 'keep', text));
  const fail = (text) => { say(text); return false; };

  // print a list line by line
  async function stream(nodes, id, delay = LINE_MS) {
    const box = emit([]);
    for (const node of nodes) {
      if (id !== runId) return false;
      box.append(node);
      if (inView && hooks.decorate) hooks.decorate(node);
      if (!fast && !reduceMotion) await sleep(delay);
    }
    return id === runId;
  }

  function clone(node) {
    const copy = node.cloneNode(true);
    copy.classList.remove('out');
    copy.removeAttribute('data-src');
    copy.removeAttribute('id');
    $$('[id]', copy).forEach((n) => n.removeAttribute('id'));
    return copy;
  }

  function external(a) {
    if (/^https?:/i.test(a.getAttribute('href') || '')) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
  }

  function logLine(entry) {
    const p = el('p', 'log-line');
    const text = el('span', 'log-text');
    text.innerHTML = entry.html; // written by the site owner in index.html
    $$('a', text).forEach(external);
    p.append(el('span', 'log-date', entry.date), ' ', el('span', `log-tag tag-${entry.tag.toLowerCase()}`, `[${entry.tag}]`), ' ', text);
    return p;
  }

  function pubBlock(pub) {
    const box = el('div', 'pub');
    const head = el('p', 'pub-head');
    head.append(el('span', 'pub-n', `[${pub.n}]`), ' ', el('span', 'pub-year', pub.year), ` · ${pub.venue}`);
    const authors = el('p', 'pub-authors');
    pub.authors.split(/(Denis Usosky|Usosky Denis)/).forEach((part, i) => authors.append(i % 2 ? el('b', 'me', part) : part));
    box.append(head, el('p', 'pub-title', pub.title), authors);
    if (pub.url) {
      const a = el('a', null, pub.doi ? `doi:${pub.doi}` : pub.url);
      a.href = pub.url;
      external(a);
      const line = el('p', 'pub-link');
      line.append(a);
      box.append(line);
    }
    return box;
  }

  // every file is a list of records; cat prints all of them, tail/head/grep pick some
  function records(key) {
    switch (key) {
      case 'welcome.txt':
        return $$('p', SRC['welcome.txt']).map((p) => ({ node: clone(p), text: squash(p.textContent) }));
      case 'about/aboutme.txt':
        return [{ node: clone(SRC['aboutme.txt']), text: squash(SRC['aboutme.txt'].textContent) }];
      case 'activity/activity.log':
        return LOG.map((e) => ({ node: logLine(e), text: e.text }));
      case 'pubs/papers.txt':
        return PAPERS.map((p) => ({ node: pubBlock(p), text: p.text }));
      case 'pubs/proceedings.txt':
        return PROCEEDINGS.map((p) => ({ node: pubBlock(p), text: p.text }));
      default:
        return [];
    }
  }

  function highlight(node, pattern) {
    const re = new RegExp(escapeRe(pattern), 'gi');
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) texts.push(walker.currentNode);
    texts.forEach((t) => {
      const s = t.nodeValue;
      re.lastIndex = 0;
      if (!re.test(s)) return;
      re.lastIndex = 0;
      const frag = document.createDocumentFragment();
      let last = 0;
      let m;
      while ((m = re.exec(s))) {
        frag.append(s.slice(last, m.index), el('mark', null, m[0]));
        last = m.index + m[0].length;
      }
      frag.append(s.slice(last));
      t.replaceWith(frag);
    });
    return node;
  }

  /* ---------- paths ---------- */
  function resolve(path) {
    let p = path || '';
    let parts;
    if (p === '~' || p.startsWith('~/') || p.startsWith('/')) {
      parts = [];
      p = p.replace(/^~\/?/, '').replace(/^\/(home\/usosky\/?)?/, '');
    } else {
      parts = cwd ? [cwd] : [];
    }
    for (const seg of p.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    if (parts.length === 0) return { type: 'dir', dir: '' };
    const [a, b] = parts;
    if (parts.length === 1 && a && has(TREE, a)) return { type: 'dir', dir: a };
    if (parts.length === 1 && TREE[''].files.includes(a)) return { type: 'file', key: a };
    if (parts.length === 2 && a && has(TREE, a) && TREE[a].files.includes(b)) return { type: 'file', key: `${a}/${b}` };
    return null;
  }

  // expand * and ? in arguments, like the shell does
  function expand(args) {
    const out = [];
    args.forEach((arg) => {
      if (!/[*?]/.test(arg)) { out.push(arg); return; }
      const slash = arg.lastIndexOf('/');
      const dirPart = slash >= 0 ? arg.slice(0, slash + 1) : '';
      const re = new RegExp(`^${escapeRe(arg.slice(slash + 1)).replace(/\\\*/g, '.*').replace(/\\\?/g, '.')}$`);
      const dir = resolve(dirPart || '.');
      const hits = dir && dir.type === 'dir'
        ? [...TREE[dir.dir].dirs, ...TREE[dir.dir].files].filter((n) => re.test(n)).map((n) => dirPart + n)
        : [];
      out.push(...(hits.length ? hits : [arg]));
    });
    return out;
  }

  function allFiles() {
    return [
      ...TREE[''].files.map((f) => `~/${f}`),
      ...TREE[''].dirs.flatMap((d) => TREE[d].files.map((f) => `~/${d}/${f}`)),
    ];
  }

  /* ---------- running commands ---------- */
  function splitChain(line) {
    const parts = [];
    let buf = '';
    let quote = null;
    let op = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (quote) {
        if (c === quote) quote = null;
        buf += c;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; buf += c; continue; }
      const two = line.slice(i, i + 2);
      if (two === '&&' || two === '||') { parts.push({ op, text: buf }); op = two; buf = ''; i++; continue; }
      if (c === ';') { parts.push({ op, text: buf }); op = ';'; buf = ''; continue; }
      buf += c;
    }
    parts.push({ op, text: buf });
    return parts.filter((p) => p.text.trim());
  }

  function tokenize(s) {
    const out = [];
    let cur = '';
    let quote = null;
    let quoted = false;
    for (const c of s) {
      if (quote) {
        if (c === quote) quote = null;
        else cur += c;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; quoted = true; continue; }
      if (/\s/.test(c)) {
        if (cur || quoted) out.push(cur);
        cur = '';
        quoted = false;
        continue;
      }
      cur += c;
    }
    if (cur || quoted) out.push(cur);
    return out;
  }

  async function execute(line, id, scripted = false) {
    let ok = true;
    for (const { op, text } of splitChain(line)) {
      if (op === '&&' && !ok) continue;
      if (op === '||' && ok) continue;
      if (/(^|[^|])\|([^|]|$)/.test(text)) { ok = fail('usosky-sh: pipes are not supported here (yet)'); continue; }
      const [name, ...args] = tokenize(text);
      if (!name) continue;
      ok = has(COMMANDS, name)
        ? (await COMMANDS[name](args, { id, scripted })) !== false
        : fail(`bash: ${name}: command not found`);
      if (id !== runId) return ok;
    }
    return ok;
  }

  async function slice(args, id, mode) {
    let n = TAIL_N;
    const files = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '-n') { n = parseInt(args[++i], 10); continue; }
      if (/^-n?\d+$/.test(a)) { n = parseInt(a.replace(/^-n?/, ''), 10); continue; }
      if (a.startsWith('-')) continue; // -f and friends: ignored here
      files.push(a);
    }
    if (!Number.isFinite(n) || n < 0) return fail(`${mode}: invalid number of lines`);
    if (!files.length) return fail(`${mode}: missing file operand (try: ${mode} activity.log)`);
    let ok = true;
    for (const name of expand(files)) {
      const r = resolve(name);
      if (!r) { ok = fail(`${mode}: cannot open '${name}' for reading: No such file or directory`); continue; }
      if (r.type === 'dir') { ok = fail(`${mode}: error reading '${name}': Is a directory`); continue; }
      const all = records(r.key);
      const part = mode === 'tail' ? all.slice(Math.max(0, all.length - n)) : all.slice(0, n);
      const nodes = part.map((x) => x.node);
      const hidden = all.length - part.length;
      if (hidden > 0) nodes.push(el('p', 'comment', `# ${hidden} ${mode === 'tail' ? 'earlier' : 'more'} ${hidden === 1 ? 'entry' : 'entries'} · cat ${name} shows all`));
      if (!(await stream(nodes, id))) return ok;
    }
    return ok;
  }

  const COMMANDS = {
    help() {
      const rows = [
        ['ls [dir]', 'list files'],
        ['cd <dir>', 'change directory: about, activity, pubs'],
        ['cat <file>', 'print a file, e.g. cat welcome.txt'],
        ['tail [-n N] <file>', 'last lines, e.g. tail activity.log'],
        ['head [-n N] <file>', 'first lines'],
        ['grep <text> [file]', 'search, e.g. grep formic'],
        ['cite <n>', 'copy the BibTeX of paper n'],
        ['open <n|name>', 'open paper n, or linkedin, scholar, orcid, email, matrix'],
        ['history', 'what you typed (↑ ↓ bring it back)'],
        ['clear', 'clear the screen (Ctrl+L)'],
      ];
      const grid = el('div', 'help');
      grid.append(el('p', 'wide', 'usosky-sh, version 2.0'), el('p', 'wide', ' '));
      rows.forEach(([k, v]) => grid.append(el('p', 'k', k), el('p', null, v)));
      grid.append(el('p', 'wide k', 'pwd  whoami  date  echo  banner'));
      if (toys.length) grid.append(el('p', 'wide', ' '), el('p', 'k', 'toys'), el('p', null, toys.join('  ')));
      grid.append(
        el('p', 'wide', ' '),
        el('p', 'wide comment', '# Tab completes names · switch tabs with the bar below, cd <dir>, or Ctrl+B then 0-2'),
      );
      emit(grid);
    },

    ls(args) {
      const paths = args.filter((a) => !a.startsWith('-'));
      const targets = paths.length ? expand(paths) : ['.'];
      const nodes = [];
      let ok = true;
      targets.forEach((t) => {
        const r = resolve(t);
        if (!r) { ok = false; nodes.push(el('p', null, `ls: cannot access '${t}': No such file or directory`)); return; }
        if (r.type === 'file') { nodes.push(el('p', null, t)); return; }
        if (targets.length > 1) nodes.push(el('p', null, `${t}:`));
        const p = el('p', 'keep');
        TREE[r.dir].dirs.forEach((d) => p.append(el('span', 'ls-dir', `${d}/`), '  '));
        TREE[r.dir].files.forEach((f) => p.append(f, '  '));
        nodes.push(p);
      });
      emit(nodes);
      return ok;
    },

    async cd(args, { id, scripted }) {
      const target = args[0] || '~';
      let r = resolve(target);
      // like CDPATH=~ in bash: `cd pubs` works from any directory
      if (!r && !target.includes('/') && target && has(TREE, target)) r = { type: 'dir', dir: target };
      if (!r) return fail(`bash: cd: ${target}: No such file or directory`);
      if (r.type !== 'dir') return fail(`bash: cd: ${target}: Not a directory`);
      cwd = r.dir;
      const view = viewOfDir(cwd);
      setWin(VIEWS[view].win);
      if (scripted) return true;
      if (view !== currentView) {
        currentView = view;
        history.pushState(null, '', `#${view}`);
      }
      if (SHOW[cwd] && (await typeCommand(SHOW[cwd], id))) await execute(SHOW[cwd], id, true);
      return true;
    },

    async cat(args, { id }) {
      if (!args.length) return fail('cat: missing file operand (try: ls)');
      let ok = true;
      for (const name of expand(args)) {
        const r = resolve(name);
        if (!r) { ok = fail(`cat: ${name}: No such file or directory`); continue; }
        if (r.type === 'dir') { ok = fail(`cat: ${name}: Is a directory`); continue; }
        const nodes = records(r.key).map((x) => x.node);
        if (HEADS[r.key]) nodes.unshift(el('p', 'comment file-head', `# ${HEADS[r.key]}`));
        if (!(await stream(nodes, id))) return ok;
      }
      return ok;
    },

    tail: (args, { id }) => slice(args, id, 'tail'),
    head: (args, { id }) => slice(args, id, 'head'),

    async grep(args, { id }) {
      const words = args.filter((a) => !/^-[a-zA-Z]+$/.test(a));
      const pattern = words[0];
      if (!pattern) return fail('usage: grep <text> [file...]   e.g. grep formic');
      const files = words.length > 1 ? expand(words.slice(1)) : allFiles(); // no file given: search the whole site
      const needle = pattern.toLowerCase();
      const nodes = [];
      let hits = 0;
      files.forEach((name) => {
        const r = resolve(name);
        if (!r) { nodes.push(el('p', null, `grep: ${name}: No such file or directory`)); return; }
        if (r.type === 'dir') { nodes.push(el('p', null, `grep: ${name}: Is a directory`)); return; }
        const found = records(r.key).filter((x) => x.text.toLowerCase().includes(needle));
        if (!found.length) return;
        hits += found.length;
        if (files.length > 1) nodes.push(el('p', 'comment file-head', `# ${name}`));
        found.forEach((x) => nodes.push(highlight(x.node, pattern)));
      });
      if (!hits) nodes.push(el('p', 'comment', `# no matches for "${pattern}"`));
      await stream(nodes, id);
      return hits > 0;
    },

    async cite(args) {
      const n = (args[0] || '').replace(/^\[|\]$/g, '');
      const pub = PAPERS.find((p) => p.n === n);
      if (!pub) return fail(`cite: no paper "${n}". Papers are numbered ${PAPERS.map((p) => p.n).join(', ')} (see: cat ~/pubs/papers.txt)`);
      let bib = '';
      if (pub.doi) {
        const wait = emit(el('p', 'comment', '# fetching BibTeX from Crossref…'));
        bib = await crossrefBibtex(pub.doi);
        wait.remove();
      }
      bib = bib || localBibtex(pub);
      const box = emit(el('pre', 'bib', bib));
      const copied = await copyText(bib);
      box.append(el('p', 'comment', copied ? '# copied to the clipboard' : '# select the entry above to copy it'));
      return true;
    },

    open(args) {
      const t = (args[0] || '').toLowerCase().replace(/^\[|\]$/g, '');
      const named = {
        linkedin: LINKS.linkedin,
        scholar: LINKS.googlescholar,
        googlescholar: LINKS.googlescholar,
        orcid: LINKS.orcid,
        email: LINKS.email,
        mail: LINKS.email,
        matrix: LINKS.matrix,
      };
      const pub = PAPERS.find((p) => p.n === t);
      if (pub && !pub.url) return fail(`open: paper ${t} has no link yet`);
      const url = pub ? pub.url : has(named, t) && named[t];
      if (!url) return fail(`open: ${args[0] || '?'}: try open <n>, linkedin, scholar, orcid, email or matrix`);
      say(`opening ${url.replace(/^mailto:/, '')}`);
      if (url.startsWith('mailto:')) location.href = url;
      else window.open(url, '_blank', 'noopener');
      return true;
    },

    history() {
      emit(hist.map((h, i) => el('p', 'keep', `${String(i + 1).padStart(4)}  ${h}`)));
    },

    clear() {
      screen.textContent = '';
      scrollTo(0, 0);
    },

    pwd() { say(HOME + (cwd ? `/${cwd}` : '')); },
    whoami() { say('visitor'); },
    date() { say(unixDate(new Date())); },
    echo(args) { say(args.join(' ')); },
    banner() { emit(clone(SRC.banner)); },
    sudo() { return fail('visitor is not in the sudoers file. This incident will be reported.'); },
    exit() { emit([el('p', null, 'logout'), el('p', 'comment', '# this terminal stays open. Try help')]); },
  };
  COMMANDS.logout = COMMANDS.exit;

  /* ---------- BibTeX ---------- */
  async function crossrefBibtex(doi) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 6000);
      const res = await fetch(`https://api.crossref.org/works/${encodeURI(doi)}/transform/application/x-bibtex`, { signal: ctl.signal });
      clearTimeout(timer);
      if (!res.ok) return '';
      const raw = (await res.text()).trim();
      // Crossref sends one line: @article{Key, title={…}, …} — put one field per line
      return raw.startsWith('@') ? raw.replace(/,\s*([a-zA-Z]+)\s*=\s*/g, ',\n  $1 = ').replace(/\}\s*$/, '\n}') : '';
    } catch {
      return '';
    }
  }

  function localBibtex(pub) {
    const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    const firstAuthor = plain(pub.authors.split(',')[0].trim().split(/\s+/).pop() || 'usosky').toLowerCase().replace(/[^a-z]/g, '');
    const word = (plain(pub.title).toLowerCase().match(/[a-z]{4,}/) || ['paper'])[0];
    const fields = [
      ['title', pub.title],
      ['author', pub.authors.split(/\s*,\s*/).filter(Boolean).join(' and ')],
      [pub.doi ? 'journal' : 'howpublished', pub.venue],
      ['year', pub.year],
    ];
    if (pub.doi) fields.push(['doi', pub.doi]);
    return `@${pub.doi ? 'article' : 'misc'}{${firstAuthor}${pub.year}${word},\n${fields.map(([k, v]) => `  ${k} = {${v}}`).join(',\n')}\n}`;
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      try {
        const ta = el('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.append(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
      } catch {
        return false;
      }
    }
  }

  function unixDate(d) {
    const parts = new Intl.DateTimeFormat('en-US', {
      weekday: 'short', month: 'short', day: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short',
    }).formatToParts(d);
    const g = (type) => (parts.find((p) => p.type === type) || {}).value || '';
    return `${g('weekday')} ${g('month')} ${g('day')} ${g('hour')}:${g('minute')}:${g('second')} ${g('timeZoneName')} ${g('year')}`;
  }

  /* ---------- the live prompt ---------- */
  function showInput({ focus = false, scroll = true } = {}) {
    dropInput();
    const line = promptLine(cwd);
    line.classList.add('input-line');
    const wrap = el('span', 'input-wrap');
    const input = el('input', 'cmd-input');
    input.type = 'text';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('autocapitalize', 'none');
    input.setAttribute('autocorrect', 'off');
    input.setAttribute('enterkeyhint', 'go');
    input.setAttribute('aria-label', 'Command line: type help and press Enter');
    if (!hist.length) input.placeholder = "try 'help'";
    input.addEventListener('keydown', onInputKey);
    wrap.append(input);
    line.append(wrap);
    screen.append(line);
    inputLine = line;
    inputEl = input;
    if (focus) input.focus({ preventScroll: true });
    if (scroll) line.scrollIntoView({ block: 'nearest' });
  }

  function dropInput() {
    if (inputLine) inputLine.remove();
    inputLine = null;
    inputEl = null;
  }

  // turn the input line into a normal line showing what was typed
  function freezeInput(text) {
    if (!inputLine) return;
    $('.input-wrap', inputLine).replaceWith(' ', el('span', 'cmd', text));
    inputLine.classList.remove('input-line');
    inputLine = null;
    inputEl = null;
  }

  async function submit(text, hadFocus) {
    freezeInput(text);
    if (text.trim() && hist[hist.length - 1] !== text) hist.push(text);
    histPos = hist.length;
    draft = '';
    const id = runId;
    fast = false;
    busy = true;
    try {
      await execute(text, id);
    } catch (err) {
      console.error(err);
      say('usosky-sh: something went wrong');
    }
    if (id !== runId) return;
    busy = false;
    showInput({ focus: hadFocus || !coarse, scroll: true });
  }

  function onInputKey(e) {
    const input = e.currentTarget;
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      submit(input.value, document.activeElement === input);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      recall(e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (e.key === 'Tab' && !e.shiftKey && input.value.trim()) {
      e.preventDefault();
      complete();
      return;
    }
    if (e.ctrlKey && !e.altKey && !e.metaKey) {
      const k = e.key.toLowerCase();
      if (k === 'c' && input.selectionStart === input.selectionEnd) {
        e.preventDefault();
        freezeInput(`${input.value}^C`);
        showInput({ focus: true });
      } else if (k === 'l') {
        e.preventDefault();
        const value = input.value;
        screen.textContent = '';
        inputLine = null;
        scrollTo(0, 0);
        showInput({ focus: true });
        inputEl.value = value;
      } else if (k === 'u') {
        e.preventDefault();
        input.value = input.value.slice(input.selectionEnd);
        input.setSelectionRange(0, 0);
      }
    }
  }

  function recall(step) {
    if (!inputEl || !hist.length) return;
    if (histPos === hist.length) draft = inputEl.value;
    histPos = Math.min(hist.length, Math.max(0, histPos + step));
    inputEl.value = histPos === hist.length ? draft : hist[histPos];
    const end = inputEl.value.length;
    inputEl.setSelectionRange(end, end);
  }

  function complete() {
    const input = inputEl;
    const value = input.value;
    const caret = input.selectionStart;
    const before = value.slice(0, caret);
    const word = before.match(/\S*$/)[0];
    const start = caret - word.length;
    const segment = before.slice(0, start).split(/&&|\|\||;/).pop();
    const cmd = tokenize(segment)[0];
    let options;
    if (!cmd) {
      options = Object.keys(COMMANDS).filter((c) => c.startsWith(word)).map((c) => `${c} `);
    } else if (cmd === 'open' || cmd === 'cite') {
      const nums = PAPERS.filter((p) => cmd === 'cite' || p.url).map((p) => p.n);
      const names = cmd === 'open' ? ['linkedin', 'scholar', 'orcid', 'email', 'matrix'] : [];
      options = [...names, ...nums].filter((o) => o.startsWith(word)).map((o) => `${o} `);
    } else {
      options = pathOptions(word, cmd === 'cd');
    }
    if (!options.length) return;
    let insert = options[0];
    if (options.length > 1) {
      insert = commonPrefix(options);
      if (insert.length <= word.length) { listOptions(options); return; }
    }
    input.value = value.slice(0, start) + insert + value.slice(caret);
    const pos = start + insert.length;
    input.setSelectionRange(pos, pos);
  }

  function pathOptions(word, dirsOnly) {
    const slash = word.lastIndexOf('/');
    const dirPart = slash >= 0 ? word.slice(0, slash + 1) : '';
    const base = word.slice(slash + 1);
    const dir = resolve(dirPart || '.');
    if (!dir || dir.type !== 'dir') return [];
    const node = TREE[dir.dir];
    const names = [...node.dirs.map((d) => `${d}/`), ...(dirsOnly ? [] : node.files.map((f) => `${f} `))];
    return names.filter((n) => n.startsWith(base)).map((n) => dirPart + n);
  }

  function commonPrefix(list) {
    let prefix = list[0];
    list.forEach((s) => { while (!s.startsWith(prefix)) prefix = prefix.slice(0, -1); });
    return prefix;
  }

  // two or more matches: show them, like bash does on Tab Tab
  function listOptions(options) {
    const line = promptLine(cwd);
    line.append(' ', el('span', 'cmd', inputEl.value));
    const p = el('p', 'keep');
    options.forEach((o) => p.append(o.trim(), '  '));
    const box = el('div', 'out');
    box.append(p);
    screen.insertBefore(line, inputLine);
    screen.insertBefore(box, inputLine);
  }

  /* ---------- keyboard, mouse, touch ---------- */
  function onKey(e) {
    // tmux prefix: Ctrl+B, then 0-2, n (next), p (previous) or l (last)
    if (prefixTimer && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
      e.preventDefault();
      disarm();
      const k = e.key.toLowerCase();
      let i = -1;
      if (/^[0-9]$/.test(k)) i = Number(k);
      else if (k === 'n') i = (activeWin + 1) % VIEW_NAMES.length;
      else if (k === 'p') i = (activeWin + VIEW_NAMES.length - 1) % VIEW_NAMES.length;
      else if (k === 'l') i = lastWin;
      if (VIEW_NAMES[i]) go(VIEW_NAMES[i]);
      return;
    }
    if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      arm();
      return;
    }
    if (busy) {
      if (!['Shift', 'Control', 'Alt', 'Meta', 'Tab'].includes(e.key)) fast = true;
      return;
    }
    // typing anywhere goes to the prompt
    if (!inputEl || document.activeElement === inputEl || e.ctrlKey || e.metaKey || e.altKey) return;
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.closest && focused.closest('a, button, input, textarea, select')) return;
    if ((e.key.length === 1 && e.key !== ' ') || e.key === 'Backspace') inputEl.focus();
  }

  function arm() {
    disarm();
    sessionEl.classList.add('armed');
    prefixTimer = setTimeout(disarm, 2000);
  }

  function disarm() {
    clearTimeout(prefixTimer);
    prefixTimer = null;
    sessionEl.classList.remove('armed');
  }

  function onPointerDown(e) {
    if (busy && !e.target.closest('.tmux')) fast = true;
  }

  function onScreenClick(e) {
    if (busy || !inputEl) return;
    if (e.target.closest('a, button, input, textarea')) return;
    if (String(getSelection() || '')) return;              // selecting text
    if (coarse && !e.target.closest('.input-line')) return; // phones: only the prompt line opens the keyboard
    inputEl.focus({ preventScroll: true });
  }

  // iOS zooms in on inputs with text under 16px: draw the input at 16px and scale it down
  function setupZoomFix() {
    const update = () => {
      const fs = parseFloat(getComputedStyle(root).fontSize);
      root.classList.toggle('zoomfix', fs < 16);
      root.style.setProperty('--input-scale', String(Math.min(1, fs / 16)));
    };
    update();
    addEventListener('resize', update);
  }

  /* ---------- status-bar clock (Bilbao time) ---------- */
  function startClock() {
    if (!clockEl) return;
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const day = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: 'short', year: '2-digit' });
    const t = $('.clock-time', clockEl) || clockEl.appendChild(el('span', 'clock-time'));
    const d = $('.clock-date', clockEl) || clockEl.appendChild(el('span', 'clock-date'));
    const tick = () => {
      const now = new Date();
      t.textContent = `Bilbao ${time.format(now)}`;
      d.textContent = day.format(now).replace(/ /g, '-');
    };
    tick();
    setInterval(tick, 15000);
  }

  try {
    init();
  } catch (err) {
    console.error(err);
    fallBack();
  }
})();
