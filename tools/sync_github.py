#!/usr/bin/env python3
"""Add public GitHub repositories to the activity log in index.html.

Reads data-github-user and data-github-skip from the activity list, asks the GitHub
API for that user's public repositories, and adds one CODE line per repository that
isn't a fork, isn't skipped and isn't in the log yet (matched by its URL). The line
is dated by the day the repository was created; its text is the repository's
description, or the first sentence of its README when the description is empty.

Run every Monday by .github/workflows/weekly-update.yml. By hand:
    python3 tools/sync_github.py            # update index.html
    python3 tools/sync_github.py --dry-run  # only show what would be added

Standard library only. GITHUB_TOKEN, when set, raises the API rate limit.
Network problems are reported but never fail the run.
"""
import html
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import activity  # noqa: E402

INDEX = Path(__file__).resolve().parent.parent / "index.html"


def get(url, raw=False):
    headers = {
        "User-Agent": "usosky.github.io weekly update",
        "Accept": "application/vnd.github.raw" if raw else "application/vnd.github+json",
    }
    if os.environ.get("GITHUB_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['GITHUB_TOKEN']}"
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as resp:
        body = resp.read().decode("utf-8", "replace")
    return body if raw else json.loads(body)


def readme_summary(user, name):
    """First real sentence of the README: no headings, badges, images or HTML."""
    try:
        text = get(f"https://api.github.com/repos/{user}/{name}/readme", raw=True)
    except Exception:
        return ""
    for block in re.split(r"\n\s*\n", text):
        lines = [l for l in block.splitlines() if l.strip() and not l.lstrip().startswith(("#", "!", "<", "[!", "```", "|", ">", "---", "==="))]
        para = " ".join(lines)
        para = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", para)      # images
        para = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", para)   # links -> their text
        para = re.sub(r"[*_`]", "", para)
        para = re.sub(r"\s+", " ", para).strip()
        if len(para) >= 20:
            sentence = re.split(r"(?<=[.!?])\s", para)[0]
            return sentence if len(sentence) <= 140 else sentence[:137].rsplit(" ", 1)[0] + "..."
    return ""


def main(dry_run=False, repos=None):
    page = INDEX.read_text(encoding="utf-8")
    tag = re.search(r'data-src="activity\.log"[^>]*', page)
    if not tag or activity.MARK not in page:
        print("warning: activity list or sync marker not found in index.html; nothing done")
        return 0
    user_m = re.search(r'data-github-user="([^"]+)"', tag.group(0))
    skip_m = re.search(r'data-github-skip="([^"]*)"', tag.group(0))
    if not user_m:
        print("no data-github-user on the activity list; nothing done")
        return 0
    user = user_m.group(1)
    skip = {s.strip().lower() for s in (skip_m.group(1) if skip_m else "").split(",") if s.strip()}

    if repos is None:
        try:
            repos = get(f"https://api.github.com/users/{user}/repos?type=owner&per_page=100&sort=created")
        except Exception as err:
            print(f"warning: GitHub API not reachable: {err}")
            return 0

    esc = lambda s: html.escape(s, quote=True)
    entries = []
    for repo in sorted(repos, key=lambda r: r.get("created_at") or ""):
        name, url = repo.get("name") or "", repo.get("html_url") or ""
        if not name or not url or repo.get("fork") or repo.get("private") or name.lower() in skip or url in page:
            continue
        about = (repo.get("description") or "").strip() or readme_summary(user, name)
        date = (repo.get("created_at") or "")[:10]
        text = f'<a href="{esc(url)}">{esc(name)}</a>' + (f": {esc(about)}" if about else "")
        entries.append((date, f'<li data-date="{date}" data-tag="CODE">{text}</li>'))
        print(f"+ {date} {name}: {about}")

    if not entries:
        print("No new GitHub projects.")
        return 0
    page = activity.add_lines(page, entries)
    if dry_run:
        print("(dry run: index.html not changed)")
    else:
        INDEX.write_text(page, encoding="utf-8")
        print(f"index.html updated with {len(entries)} project(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main(dry_run="--dry-run" in sys.argv))
