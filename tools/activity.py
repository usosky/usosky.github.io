"""Shared by the weekly update scripts: adding lines to the activity log in index.html."""
import re

MARK = "<!-- sync:activity"


def date_key(date):
    """'2024' -> '2024-00-00', '2024-06' -> '2024-06-00': year-only entries sort first in their year."""
    parts = (date.split("-") + ["00", "00"])[:3]
    return "-".join(p.zfill(4 if i == 0 else 2) for i, p in enumerate(parts))


def add_lines(page, entries):
    """Insert (date, html) pairs into the activity list, keeping it in date order (oldest first)."""
    for date, line in entries:
        start = page.index('data-src="activity.log"')
        end = page.index(MARK, start)
        later = next(
            (m for m in re.finditer(r'\n([ \t]*)<li data-date="([^"]*)"', page[start:end]) if date_key(m.group(2)) > date_key(date)),
            None,
        )
        if later:  # above the first entry that is newer
            pos = start + later.start() + 1
            indent = later.group(1)
        else:  # at the end, just above the marker line
            pos = page.rfind("\n", 0, end) + 1
            indent = page[pos:end]
        page = page[:pos] + f"{indent}{line}\n" + page[pos:]
    return page
