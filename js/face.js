/*
  usr/usosky — the ASCII face in 0:about.

  Its eyes and mouth shift toward the mouse pointer (or the last tap on a phone),
  so the head seems to turn. Moods: it blinks, winks while you hover a link,
  laughs when clicked, falls asleep after a while without input, looks sad when
  the pointer leaves the window, and wears sunglasses after the Konami code
  (↑ ↑ ↓ ↓ ← → ← → b a).

  The art itself is the <pre class="face"> in index.html. If you redraw it,
  update FEATURES below: the box that holds the eyes and the mouth.
*/
(() => {
  'use strict';
  const source = document.querySelector('.source .face');
  if (!source) return;

  const FEATURES = { top: 5, bottom: 11, left: 6, right: 31 }; // rows/columns of the eyes and mouth
  const EYE_ROWS = [5, 6];   // right eye on row 5, left eye on row 6
  const LEFT_EYE_ROW = 6;
  const MAX_DX = 2;          // how far the features may move (columns)
  const MAX_DY = 1;          // (rows)
  const SLEEP_AFTER = 25000; // ms without input

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lines = source.textContent.split('\n');
  const width = Math.max(...lines.map((l) => l.length));
  const base = lines.map((l) => l.padEnd(width).split(''));

  // split the art into the outline (fixed) and the features (moving)
  const features = [];
  for (let r = FEATURES.top; r <= FEATURES.bottom; r++) {
    for (let c = FEATURES.left; c <= FEATURES.right; c++) {
      if (base[r] && base[r][c] && base[r][c] !== ' ') features.push({ r, c, ch: base[r][c] });
    }
  }
  const outline = base.map((row) => row.slice());
  features.forEach(({ r, c }) => { outline[r][c] = ' '; });

  const eyes = features.filter((f) => EYE_ROWS.includes(f.r));
  const mouth = features.filter((f) => !EYE_ROWS.includes(f.r));
  const rightEye = eyes.filter((f) => f.r !== LEFT_EYE_ROW);
  const leftEye = eyes.filter((f) => f.r === LEFT_EYE_ROW);
  const as = (list, ch) => list.map((f) => ({ ...f, ch }));
  const mouthTop = Math.min(...mouth.map((f) => f.r));
  const mouthBottom = Math.max(...mouth.map((f) => f.r));
  // upside-down mouth without its flat top line: a frown
  const frown = mouth.filter((f) => f.r !== mouthTop).map((f) => ({ ...f, r: mouthTop + mouthBottom - f.r }));
  const span = (r, from, to, ch) => Array.from({ length: to - from + 1 }, (_, i) => ({ r, c: from + i, ch }));
  const glasses = [
    ...span(6, 8, 14, '@'), ...span(7, 9, 13, '@'),     // left lens
    ...span(5, 26, 32, '@'), ...span(6, 27, 31, '@'),   // right lens
    ...span(6, 15, 26, '-'),                            // bridge
  ];
  const zzz = [{ r: 4, c: 25, ch: 'z' }, { r: 3, c: 27, ch: 'z' }, { r: 2, c: 28, ch: 'Z' }];
  const sleepyMouth = [{ r: 10, c: 20, ch: 'o' }];

  let dx = 0;
  let dy = 0;
  let mood = 'normal';      // normal | blink | wink | laugh | sad | sleep
  let laughFrame = 0;
  let zCount = 0;
  let cool = false;
  let last = '';
  let target = null;
  let raf = 0;
  let idleTimer = 0;
  let zTimer = 0;
  let laughTimer = 0;

  try { cool = sessionStorage.getItem('usosky-cool') === '1'; } catch { /* private mode */ }

  const faces = () => [...document.querySelectorAll('.screen .face')];

  function sprites() {
    let e = cool ? glasses : eyes;
    let m = mouth;
    let fixed = [];
    if (mood === 'blink' || mood === 'sleep') e = cool ? glasses : as(eyes, '-');
    if (mood === 'wink' && !cool) e = [...rightEye, ...as(leftEye, '-')];
    if (mood === 'laugh') {
      if (!cool) e = as(eyes, '^');
      if (laughFrame) m = mouth.map((f) => ({ ...f, r: f.r + 1 }));
    }
    if (mood === 'sad') m = frown;
    if (mood === 'sleep') {
      m = sleepyMouth;
      fixed = zzz.slice(0, zCount);
    }
    return { moving: [...e, ...m], fixed };
  }

  function render(force) {
    const grid = outline.map((row) => row.slice());
    const { moving, fixed } = sprites();
    const still = mood === 'sleep' || mood === 'sad';
    const ox = still ? 0 : dx;
    const oy = still ? 0 : dy;
    moving.forEach(({ r, c, ch }) => {
      const row = grid[r + oy];
      if (row && row[c + ox] === ' ') row[c + ox] = ch;
    });
    fixed.forEach(({ r, c, ch }) => {
      if (grid[r] && grid[r][c] === ' ') grid[r][c] = ch;
    });
    const text = grid.map((row) => row.join('').trimEnd()).join('\n');
    if (text === last && !force) return;
    last = text;
    faces().forEach((f) => { if (f.textContent !== text) f.textContent = text; });
  }

  function setMood(next) {
    if (mood === next) return;
    mood = next;
    render();
  }

  /* ---------- looking at the pointer ---------- */
  function look(x, y) {
    target = { x, y };
    if (!raf) raf = requestAnimationFrame(aim);
  }

  function aim() {
    raf = 0;
    const list = faces();
    const face = list[list.length - 1];
    if (!face || !target) return;
    const box = face.getBoundingClientRect();
    if (!box.width) return;
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height * 0.42; // about eye level
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const nx = Math.round(clamp((target.x - cx) / (box.width * 0.9)) * MAX_DX);
    const ny = Math.round(clamp((target.y - cy) / (box.height * 0.9)) * MAX_DY);
    if (nx !== dx || ny !== dy) {
      dx = nx;
      dy = ny;
      render();
    }
  }

  /* ---------- moods ---------- */
  function wake() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(sleep, SLEEP_AFTER);
    if (mood === 'sleep') {
      clearInterval(zTimer);
      setMood('normal');
      blink();
    }
  }

  function sleep() {
    if (!faces().length || mood === 'laugh') return;
    zCount = reduceMotion ? zzz.length : 0;
    setMood('sleep');
    if (!reduceMotion) {
      zTimer = setInterval(() => {
        zCount = (zCount % zzz.length) + 1;
        render();
      }, 700);
    }
  }

  function blink() {
    if (mood !== 'normal') return;
    setMood('blink');
    setTimeout(() => { if (mood === 'blink') setMood('normal'); }, 140);
  }

  function blinkLoop() {
    setTimeout(() => {
      if (!document.hidden) blink();
      blinkLoop();
    }, 2500 + Math.random() * 4000);
  }

  function laugh() {
    clearInterval(laughTimer);
    laughFrame = 0;
    setMood('laugh');
    let n = 0;
    laughTimer = setInterval(() => {
      n++;
      laughFrame = reduceMotion ? 0 : n % 2;
      render();
      if (n >= 8) {
        clearInterval(laughTimer);
        laughFrame = 0;
        setMood('normal');
      }
    }, 150);
  }

  /* ---------- Konami code: sunglasses ---------- */
  const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a'];
  let konami = 0;
  function onKonamiKey(e) {
    const k = e.key.toLowerCase();
    konami = k === KONAMI[konami] ? konami + 1 : (k === KONAMI[0] ? 1 : 0);
    if (konami < KONAMI.length) return;
    konami = 0;
    cool = !cool;
    try { sessionStorage.setItem('usosky-cool', cool ? '1' : ''); } catch { /* private mode */ }
    render(true);
    const term = window.usosky;
    const input = term && term.input();
    // the code's "b" already went into the prompt; keep the "a" out and remove the "b"
    e.preventDefault();
    if (input && /b$/i.test(input.value)) input.value = input.value.slice(0, -1);
    if (term && !term.busy) term.note(cool ? '😎 cool mode on (look at the face in 0:about)' : 'cool mode off');
  }

  /* ---------- wiring ---------- */
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'touch') look(e.clientX, e.clientY);
    if (mood === 'sad') setMood('normal');
    wake();
  }, { passive: true });
  addEventListener('pointerdown', (e) => { look(e.clientX, e.clientY); wake(); }, { passive: true });
  addEventListener('keydown', (e) => { wake(); onKonamiKey(e); });
  addEventListener('scroll', () => { if (target) look(target.x, target.y); }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => {
    dx = 0;
    dy = 0;
    if (mood !== 'sleep') setMood('sad');
  });
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'mouse' && e.target.closest && e.target.closest('a') && (mood === 'normal' || mood === 'sad')) setMood('wink');
  });
  document.addEventListener('pointerout', (e) => {
    if (mood === 'wink' && e.target.closest && e.target.closest('a')) setMood('normal');
  });
  document.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.screen .face')) laugh();
  });

  // draw on every face that appears (each `cat aboutme.txt`, neofetch…)
  const screenObserver = new MutationObserver((records) => {
    if (records.some((r) => [...r.addedNodes].some((n) => n.nodeType === 1 && (n.matches('.face') || n.querySelector('.face'))))) render(true);
  });
  const watch = () => {
    const screen = document.querySelector('.screen');
    if (screen) screenObserver.observe(screen, { childList: true, subtree: true });
    else setTimeout(watch, 100);
  };
  watch();

  wake();
  if (!reduceMotion) blinkLoop();
})();
