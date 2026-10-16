# usosky.github.io

Terminal-style portfolio of Denis Usosky — <https://usosky.github.io>

Plain HTML, CSS and JavaScript: no build step, GitHub Pages serves the files as they are.

## Editing the text

Everything visitors read is plain HTML in `index.html`. Each `<section class="step">` is one command
of the terminal session that gets replayed on load:

- `.cmd` — the command that is typed out
- `.out` — what the command prints

Change the text in place and keep the tags. The ASCII art lives in the two `<pre>` blocks (banner and
face); keep the face's line widths so the summary next to it stays lined up.

The title, description and link-preview (`og:`) tags are at the top of `index.html`.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | content, title, description, link-preview tags |
| `css/terminal.css` | colours, font sizes, phone layout |
| `js/terminal.js` | replays the session (a click or any key skips it; off for "reduce motion") |
| `fonts/` | Inconsolata (SIL Open Font License, see `fonts/OFL.txt`), served from here instead of Google Fonts |
| `img/og-image.png` | 1200×630 preview image used by LinkedIn, messengers etc. |
| `favicon.svg`, `favicon-32.png`, `apple-touch-icon.png` | browser-tab and home-screen icons |
| `.nojekyll` | tells GitHub Pages to serve the files as they are |

## Previewing locally

Double-click `index.html` — no build step or server needed.

## After changing the description or preview image

LinkedIn caches link previews. Paste the URL into <https://www.linkedin.com/post-inspector/> to refresh it.
