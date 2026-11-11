"""Rebuild the notes index (section -> PDF page) and full-text page index from the unit PDFs.

Usage (from EV-MASTER-LAB):  python scripts/extract_notes.py ..   (folder containing Unit_*_EVSE_UG.pdf)
Requires: pypdf and poppler's pdftotext on PATH. Page numbers are read from each PDF's own table of contents
and the printed page footers ("School of Electrical and Electronics Engineering  N"); nothing is guessed.
"""
import json, re, subprocess, sys
from collections import Counter
from pathlib import Path
from pypdf import PdfReader

src = Path(sys.argv[1] if len(sys.argv) > 1 else "..")
out_index, out_pages = {}, {}
for u in range(1, 5):
    fn = src / f"Unit_{u}___EVSE_UG.pdf"
    n = len(PdfReader(str(fn)).pages)
    pages = [subprocess.run(["pdftotext", "-layout", "-f", str(i), "-l", str(i), str(fn), "-"], capture_output=True, text=True).stdout for i in range(1, n + 1)]
    offs = []
    for i, p in enumerate(pages):
        foot = [l for l in p.splitlines() if "School of Electrical and Electronics" in l]
        m = re.search(r"(\d+)\s*$", foot[-1]) if foot else None
        if m: offs.append(i + 1 - int(m.group(1)))
    off = Counter(offs).most_common(1)[0][0]
    rx = re.compile(r"^\s*(\d+(?:\.\d+)+)\s+(.+?)[\s.]*?(\d+)\s*$")
    secs, seen = [], set()
    for p in pages[1:12]:
        for line in p.splitlines():
            m = rx.match(line)
            if m and ". ." in line:
                if m.group(1) in seen: break
                seen.add(m.group(1)); secs.append({"n": m.group(1), "t": re.sub(r"[\s.]+$", "", m.group(2)), "p": int(m.group(3)) + off})
    out_index[u] = {"pages": n, "sections": secs}
    full = subprocess.run(["pdftotext", str(fn), "-"], capture_output=True, text=True).stdout.split("\f")
    out_pages[u] = [re.sub(r"\s+", " ", t).strip() for t in full[:n]]
Path("data/notes_index.json").write_text(json.dumps(out_index, separators=(",", ":")))
Path("data/notes_pages.json").write_text(json.dumps(out_pages, separators=(",", ":"), ensure_ascii=False))
print("written data/notes_index.json and data/notes_pages.json")
