# usosky.github.io

Terminal-style portfolio of Denis Usosky — <https://usosky.github.io>

Plain HTML, CSS and JavaScript: no build step, GitHub Pages serves the files as they are.

## What visitors get

- **Tabs** in a tmux-style status bar: `0:about`, `1:activity`, `2:pubs`. Each has its own link
  (`#about`, `#activity`, `#pubs`) and the back button works.
- **A live prompt** after each tab's replay. `help` lists the commands: `ls`, `cd`, `cat`, `tail`, `head`,
  `grep`, `cite <n>` (BibTeX from Crossref, copied to the clipboard), `open`, `history`, `clear`, `pwd`,
  `whoami`, `date`, `echo`, `banner`. Tab completes, ↑/↓ recall, Ctrl+L clears, Ctrl+B then 0–2 switches tabs.
- **Toys**:

  | Command | What it does |
  | --- | --- |
  | `neofetch` | the face and a few facts |
  | `theme default\|green\|amber\|ibm` | colour schemes, remembered per visitor |
  | `crt on\|off` | scanlines and phosphor glow |
  | `weather` | Bilbao weather |
  | `co2` | latest Mauna Loa CO2 reading |
  | `mccabe --alpha 2.5` | ASCII McCabe–Thiele diagram, with Rmin, stages and feed stage |
  | `matrix` | molecules raining down |
  | `reboot` | the boot screen again |

  There are a few unlisted ones too.
- **The face** in `0:about` turns toward the mouse pointer (on phones, the last tap). It blinks, winks at links,
  laughs when clicked, falls asleep when idle, looks sad when the pointer leaves, and has a Konami-code surprise.
- **Effects**:
  - a short boot screen on the first visit of a browser session
  - text that decrypts while a tab replays
  - links that glitch on hover

  All animations stay off for visitors who switched on "reduce motion".
- **Status bar**:
  - Bilbao time
  - the weather, which the visitor's browser fetches from Open-Meteo (no key, no cookies), cached for 30 minutes
  - the weekly Mauna Loa CO2 reading
- **Without JavaScript** the same content shows as one long terminal session.

## Editing the content

Everything visitors read is plain HTML inside `<div class="source">` in `index.html`:

- **about**: the banner (ASCII art), `welcome.txt`, and `aboutme.txt` (the face and the links).
  Keep the face's line widths so the summary next to it stays lined up; if you redraw the face, update
  `FEATURES` at the top of `js/face.js`.
- **activity.log**: one `<li>` per entry, oldest first, so add new entries at the bottom:

  ```html
  <li data-date="2026-11-03" data-tag="POST"><a href="https://www.linkedin.com/feed/update/...">one-line summary</a></li>
  ```

  `data-date` is `YYYY`, `YYYY-MM` or `YYYY-MM-DD`. `data-tag` is one of `PUB`, `CONF`, `TALK`, `POST`, `JOB`,
  `EDU`, `AWARD`, `NEWS`. The tab shows the last 10 entries; `cat activity.log` shows all.
- **papers.txt** and **proceedings.txt**: one `<li>` per item, newest first. `data-n` is the number shown,
  which `cite <n>` and `open <n>` use.
- **neofetch** lines are at the top of `js/extras.js`.

The title, description and link-preview (`og:`) tags are at the top of `index.html`.

## Weekly update

`.github/workflows/weekly-update.yml` runs every Monday:

- **Papers** (`tools/sync_pubs.py`): looks up works linked to the ORCID iD on Crossref and ORCID.
  - A paper is added to papers.txt and activity.log when it has a DOI, was published after `data-sync-since`
    on the papers list, and isn't listed yet.
  - A listed paper without a DOI, such as a preprint, gets its DOI link once one appears.
- **CO2** (`tools/update_co2.py`): writes the latest weekly Mauna Loa reading from NOAA's Global Monitoring
  Laboratory into the status bar.

To run it now, go to **Actions → Weekly update → Run workflow**. GitHub pauses scheduled workflows after
60 days without commits; the Actions tab shows a button to switch it back on.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | all content, title, description, link-preview tags |
| `css/terminal.css` | colours, themes, font sizes, phone layout, status bar |
| `js/terminal.js` | tabs, replays and the live prompt |
| `js/face.js` | the face that follows the pointer |
| `js/extras.js` | toys, boot screen, effects, weather and CO2 |
| `tools/`, `.github/workflows/weekly-update.yml` | the weekly update |
| `fonts/` | Inconsolata (SIL Open Font License, see `fonts/OFL.txt`), served from here instead of Google Fonts |
| `img/og-image.png` | 1200×630 preview image used by LinkedIn, messengers etc. |
| `favicon.ico`, `favicon-32.png`, `favicon-96.png`, `apple-touch-icon.png` | browser-tab and home-screen icons |
| `.nojekyll` | tells GitHub Pages to serve the files as they are |

## Previewing locally

Double-click `index.html`. No build step or server needed.

## After changing the description or preview image

LinkedIn caches link previews. Paste the URL into <https://www.linkedin.com/post-inspector/> to refresh it.
