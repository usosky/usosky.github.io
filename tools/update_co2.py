#!/usr/bin/env python3
"""Write the latest weekly Mauna Loa CO2 reading into index.html.

Reads the weekly file of NOAA's Global Monitoring Laboratory and rewrites the
<span class="co2"> in the status bar (the `co2` command reads it too).
Run every Monday by .github/workflows/weekly-update.yml. By hand:
    python3 tools/update_co2.py
Standard library only. If NOAA can't be reached, index.html stays as it is.
"""
import re
import sys
import urllib.request
from pathlib import Path

URL = "https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_weekly_mlo.txt"
INDEX = Path(__file__).resolve().parent.parent / "index.html"
SPAN = re.compile(r'<span class="co2"[^>]*>.*?</span>', re.S)


def latest(text):
    """Columns: year, month, day, decimal year, ppm, days, ppm 1 yr ago, ppm 10 yrs ago, increase since 1800."""
    best = None
    for line in text.splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        f = line.split()
        if len(f) < 8:
            continue
        try:
            year, month, day, ppm = int(f[0]), int(f[1]), int(f[2]), float(f[4])
            y1, y10 = float(f[6]), float(f[7])
        except ValueError:
            continue
        if ppm > 0:  # -999.99 means no data that week
            best = {"week": f"{year:04d}-{month:02d}-{day:02d}", "ppm": ppm, "y1": y1, "y10": y10}
    return best


def span(r):
    attrs = [f'data-ppm="{r["ppm"]:.2f}"', f'data-week="{r["week"]}"']
    if r["y1"] > 0:
        attrs.append(f'data-ppm1y="{r["y1"]:.2f}"')
    if r["y10"] > 0:
        attrs.append(f'data-ppm10y="{r["y10"]:.2f}"')
    title = f"Mauna Loa CO2, weekly mean for the week of {r['week']} (NOAA GML). Type co2 for more."
    return f'<span class="co2" {" ".join(attrs)} title="{title}">CO2 {r["ppm"]:.1f} ppm</span>'


def main(text=None):
    page = INDEX.read_text(encoding="utf-8")
    if not SPAN.search(page):
        print('warning: no <span class="co2"> in index.html; nothing done')
        return 0
    if text is None:
        try:
            req = urllib.request.Request(URL, headers={"User-Agent": "usosky.github.io weekly update"})
            with urllib.request.urlopen(req, timeout=30) as resp:
                text = resp.read().decode("utf-8", "replace")
        except Exception as err:
            print(f"warning: NOAA not reachable: {err}")
            return 0
    reading = latest(text)
    if not reading:
        print("warning: no reading found in the NOAA file")
        return 0
    updated = SPAN.sub(lambda _: span(reading), page, count=1)
    if updated == page:
        print("CO2 reading unchanged.")
    else:
        INDEX.write_text(updated, encoding="utf-8")
        print(f"CO2 {reading['ppm']:.2f} ppm, week of {reading['week']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
