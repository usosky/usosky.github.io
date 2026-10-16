# usosky.github.io

Terminal-style portfolio of Denis Usosky — <https://usosky.github.io>

Plain HTML, CSS and JavaScript: no build step, GitHub Pages serves the files as they are.

## What visitors get

- **Tabs** in a tmux-style status bar: `0:about`, `1:activity`, `2:pubs`. Each has its own link
  (`#about`, `#activity`, `#pubs`) and the back button works.
- **A live prompt** after each tab's replay. `help` lists the commands: `ls`, `cd`, `cat`, `tail`, `head`,
  `grep`, `cite <n>` (BibTeX from Crossref, copied to the clipboard), `open`, `history`, `clear`, `pwd`,
  `whoami`, `date`, `echo`, `banner`. Tab completes, ↑/↓ recall, Ctrl+L clears, Ctrl+B then 0–2 switches tabs.
- **Without JavaScript** the same content shows as one long terminal session.

## Editing the content

Everything visitors read is plain HTML inside `<div class="source">` in `index.html`:

- **about**: the banner (ASCII art), `welcome.txt`, and `aboutme.txt` (the face and the links).
  Keep the face's line widths so the summary next to it stays lined up.
- **activity.log**: one `<li>` per entry, oldest first, so add new entries at the bottom:

  ```html
  <li data-date="2026-11-03" data-tag="POST"><a href="https://www.linkedin.com/posts/...">one-line summary</a></li>
  ```

  `data-date` is `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. `data-tag` is one of `PUB`, `CONF`, `TALK`, `POST`, `JOB`,
  `EDU`, `AWARD`, `NEWS`. The tab shows the last 10 entries; `cat activity.log` shows all.
- **papers.txt** and **proceedings.txt**: one `<li>` per item, newest first. `data-n` is the number shown,
  which `cite <n>` and `open <n>` use.

The title, description and link-preview (`og:`) tags are at the top of `index.html`.

## New papers are added automatically

`.github/workflows/sync-pubs.yml` runs `tools/sync_pubs.py` every Monday. It looks up works linked to the
ORCID iD on Crossref and ORCID. A paper is added to papers.txt and activity.log when:

- it has a DOI
- it was published after `data-sync-since` on the papers list
- it isn't listed yet (same DOI or same title)

To run it now, go to **Actions → Sync publications → Run workflow**. GitHub pauses scheduled workflows after
60 days without commits; the Actions tab shows a button to switch it back on.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | all content, title, description, link-preview tags |
| `css/terminal.css` | colours, font sizes, phone layout, status bar |
| `js/terminal.js` | tabs, replays and the live prompt |
| `tools/sync_pubs.py`, `.github/workflows/sync-pubs.yml` | the weekly publication sync |
| `fonts/` | Inconsolata (SIL Open Font License, see `fonts/OFL.txt`), served from here instead of Google Fonts |
| `img/og-image.png` | 1200×630 preview image used by LinkedIn, messengers etc. |
| `favicon.ico`, `favicon-32.png`, `favicon-96.png`, `apple-touch-icon.png` | browser-tab and home-screen icons |
| `.nojekyll` | tells GitHub Pages to serve the files as they are |

## Previewing locally

Double-click `index.html`. No build step or server needed.

## After changing the description or preview image

LinkedIn caches link previews. Paste the URL into <https://www.linkedin.com/post-inspector/> to refresh it.
