/*
  usr/usosky — replays the terminal session written in index.html:
  each prompt appears, its command is typed out, then its output is printed.
  A click or any key skips to the end; visitors with "reduce motion" switched on
  get the finished page straight away. Without this script the page still shows
  everything — all the text lives in index.html.
*/
(() => {
  'use strict';
  window.termStarted = true;

  const TYPE_MS = 30; // per typed command character, as in the original

  const term = document.querySelector('.term');
  const steps = [...term.querySelectorAll('.step')];
  const end = term.querySelector('.prompt-end');
  const cmds = steps.map((step) => step.querySelector('.cmd'));
  const skipEvents = ['keydown', 'pointerdown'];
  let finished = false;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const show = (el) => el && el.classList.add('shown');

  // Keep each command's text, then clear it so it can be typed out.
  cmds.forEach((cmd) => {
    if (!cmd) return;
    cmd.dataset.text = cmd.textContent;
    cmd.textContent = '';
  });

  function finish() {
    if (finished) return;
    finished = true;
    steps.forEach((step, i) => {
      show(step);
      show(step.querySelector('.out'));
      const cmd = cmds[i];
      if (cmd) {
        cmd.textContent = cmd.dataset.text;
        cmd.classList.remove('typing');
      }
    });
    show(end);
    skipEvents.forEach((type) => removeEventListener(type, finish));
  }

  async function type(cmd) {
    const text = cmd.dataset.text;
    cmd.classList.add('typing');
    for (let n = 1; n <= text.length; n++) {
      if (finished) return;
      cmd.textContent = text.slice(0, n);
      await sleep(TYPE_MS);
    }
    cmd.classList.remove('typing');
  }

  async function play() {
    for (let i = 0; i < steps.length; i++) {
      if (finished) return;
      show(steps[i]);
      if (cmds[i]) await type(cmds[i]);
      if (finished) return;
      show(steps[i].querySelector('.out'));
    }
    finish();
  }

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
  } else {
    skipEvents.forEach((type) => addEventListener(type, finish));
    play();
  }
})();
