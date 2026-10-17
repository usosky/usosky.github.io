#!/usr/bin/env python3
"""Add new publications to index.html.

Finds works linked to the ORCID iD below, both on Crossref (where publishers record
the ORCID iD) and in the public ORCID record. A work is added when it has a DOI, was
published on or after the date in data-sync-since (on the papers list), and is not on
the page yet (same DOI or same title). Each new work goes to the top of papers.txt
and to the end of activity.log.

Run every Monday by .github/workflows/sync-pubs.yml. By hand:
    python3 tools/sync_pubs.py            # update index.html
    python3 tools/sync_pubs.py --dry-run  # only show what would be added

Standard library only. Network problems are reported but never fail the run.
"""
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import activity  # noqa: E402

ORCID = "0000-0002-6245-5110"
INDEX = Path(__file__).resolve().parent.parent / "index.html"
USER_AGENT = "usosky.github.io publication sync (+https://github.com/usosky/usosky.github.io)"
PAPERS_MARK = "<!-- sync:papers"
ACTIVITY_MARK = "<!-- sync:activity"


def get_json(url):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)


def norm_doi(doi):
    doi = doi.strip().lower()
    return re.sub(r"^(https?://)?(dx\.)?doi\.org/", "", doi)


def plain(text):
    """Drop tags like <i>N</i>, decode entities, squash whitespace."""
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", text or ""))).strip()


def title_key(text):
    return re.sub(r"[^a-z0-9]+", "", plain(text).lower())


def date_parts(parts):
    return [int(x) for x in (parts or []) if x]


def venue_for(doi, names):
    if doi.startswith("10.26434/chemrxiv"):
        return "ChemRxiv (preprint)"
    return next((n for n in names if n), "")


def from_crossref(item):
    doi = norm_doi(item.get("DOI", ""))
    issued = (item.get("issued") or {}).get("date-parts") or [[]]
    authors = []
    for a in item.get("author", []):
        name = " ".join(x for x in (a.get("given"), a.get("family")) if x) or a.get("name", "")
        if name:
            authors.append(plain(name))
    names = (item.get("short-container-title") or []) + (item.get("container-title") or [])
    return {
        "doi": doi,
        "title": plain((item.get("title") or [""])[0]),
        "venue": plain(venue_for(doi, names)),
        "date": date_parts(issued[0]),
        "authors": authors,
    }


def crossref_works():
    url = (f"https://api.crossref.org/works?filter=orcid:{ORCID}&rows=100"
           "&select=DOI,title,container-title,short-container-title,issued,type,author")
    return [from_crossref(i) for i in get_json(url)["message"]["items"]]


def crossref_work(doi):
    return from_crossref(get_json(f"https://api.crossref.org/works/{urllib.parse.quote(doi, safe='/')}")["message"])


def orcid_works():
    data = get_json(f"https://pub.orcid.org/v3.0/{ORCID}/works")
    works = []
    for group in data.get("group", []):
        summary = group["work-summary"][0]
        ids = (summary.get("external-ids") or {}).get("external-id", [])
        doi = next((i.get("external-id-value") for i in ids if i.get("external-id-type") == "doi"), None)
        if not doi:
            continue
        pub_date = summary.get("publication-date") or {}
        works.append({
            "doi": norm_doi(doi),
            "title": plain(summary["title"]["title"]["value"]),
            "venue": plain(venue_for(norm_doi(doi), [(summary.get("journal-title") or {}).get("value", "")])),
            "date": date_parts([(pub_date.get(k) or {}).get("value") for k in ("year", "month", "day")]),
            "authors": [],
        })
    return works


def fetch_all():
    found = {}
    for name, source in (("Crossref", crossref_works), ("ORCID", orcid_works)):
        try:
            for work in source():
                if work["doi"] and work["doi"] not in found:
                    found[work["doi"]] = work
        except Exception as err:  # keep going with whatever the other source gave
            print(f"warning: {name} lookup failed: {err}")
    for work in found.values():  # ORCID summaries have no author list
        if not work["authors"]:
            try:
                work.update({k: v for k, v in crossref_work(work["doi"]).items() if v})
            except Exception as err:
                print(f"warning: no Crossref record for {work['doi']}: {err}")
    return list(found.values())


def iso(parts):
    return "-".join(f"{p:02d}" if i else str(p) for i, p in enumerate(parts))


def main(dry_run=False, works=None):
    page = INDEX.read_text(encoding="utf-8")
    if PAPERS_MARK not in page or ACTIVITY_MARK not in page:
        print("warning: sync markers not found in index.html; nothing done")
        return 0

    since_match = re.search(r'data-sync-since="(\d{4})-(\d{2})-(\d{2})"', page)
    since = tuple(int(x) for x in since_match.groups()) if since_match else (1900, 1, 1)
    known_dois = {norm_doi(d) for d in re.findall(r'data-doi="([^"]+)"', page)}
    known_dois |= {norm_doi(d) for d in re.findall(r'doi\.org/([^"\s<>]+)', page)}
    known_titles = {title_key(t) for t in re.findall(r"<cite>(.*?)</cite>", page, re.S)}
    papers_block = page.split(PAPERS_MARK, 1)[1].split("</ol>", 1)[0]
    numbers = [int(n) for n in re.findall(r'data-n="(\d+)"', papers_block)]

    works = fetch_all() if works is None else works
    esc = lambda s: html.escape(s, quote=True)

    # a paper already listed without a DOI (e.g. a preprint) gets its DOI link once one appears
    linked = 0
    for w in works:
        if not w["doi"] or w["doi"] in known_dois or not w["title"]:
            continue
        for li in re.findall(r"<li data-n=[^\n]*?</li>", page):
            if "doi.org/" in li or "data-doi=" in li:
                continue
            cite = re.search(r"<cite>(.*?)</cite>", li, re.S)
            if cite and title_key(cite.group(1)) == title_key(w["title"]):
                doi = esc(w["doi"])
                patched = li.replace("<li ", f'<li data-doi="{doi}" ', 1)
                patched = patched[: -len("</li>")] + f' <a href="https://doi.org/{doi}">doi:{doi}</a></li>'
                page = page.replace(li, patched, 1)
                known_dois.add(w["doi"])
                linked += 1
                print(f"~ linked an existing entry to doi:{w['doi']} ({w['title'][:60]})")
                break

    new = []
    for w in works:
        if not w["doi"] or not w["title"] or not w["date"]:
            continue
        padded = tuple(w["date"] + [1, 1])[:3]
        if padded < since or w["doi"] in known_dois or title_key(w["title"]) in known_titles:
            continue
        new.append(w)
    new.sort(key=lambda w: tuple(w["date"] + [0, 0])[:3])
    if not new:
        if linked and not dry_run:
            INDEX.write_text(page, encoding="utf-8")
            print(f"index.html updated: {linked} DOI link(s) added.")
        else:
            print("No new publications.")
        return 0

    n = max(numbers, default=0)
    paper_lines, log_lines = [], []
    for w in new:
        n += 1
        doi = esc(w["doi"])
        paper_lines.append(
            f'<li data-n="{n}"><span class="authors">{esc(", ".join(w["authors"]))}</span>. '
            f'<cite>{esc(w["title"])}</cite>. <span class="venue">{esc(w["venue"])}</span>, '
            f'<span class="year">{w["date"][0]}</span>. <a href="https://doi.org/{doi}">doi:{doi}</a></li>')
        log_lines.append((iso(w["date"]),
            f'<li data-date="{iso(w["date"])}" data-tag="PUB">{esc(w["venue"] or "New paper")}: '
            f'<a href="https://doi.org/{doi}">{esc(w["title"])}</a></li>'))
        print(f"+ [{n}] {iso(w['date'])} {w['venue']}: {w['title']} (doi:{w['doi']})")

    # papers: just below the marker, newest first
    start = page.index(PAPERS_MARK)
    indent = page[page.rfind("\n", 0, start) + 1:start]
    at = page.index("\n", start) + 1
    page = page[:at] + "".join(f"{indent}{line}\n" for line in reversed(paper_lines)) + page[at:]
    # activity log: in date order
    page = activity.add_lines(page, log_lines)
    if dry_run:
        print("(dry run: index.html not changed)")
    else:
        INDEX.write_text(page, encoding="utf-8")
        print(f"index.html updated with {len(new)} publication(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main(dry_run="--dry-run" in sys.argv))
