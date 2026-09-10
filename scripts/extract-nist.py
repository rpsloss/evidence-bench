#!/usr/bin/env python3
"""Extract NIST SP 800-171 Rev 2 statements and 800-171A June 2018 AOs.

PDF is normative for determine-if text. The official CSV is used only as a
typesetting fallback when the alphanumeric-normalized strings match.
"""

from __future__ import annotations

import csv
import json
import re
import ssl
import sys
import urllib.request
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print("pip install pypdf", file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parent.parent
VENDOR = Path(__file__).resolve().parent / "vendor"
SRC_DIR = Path("/tmp/cmmc-catalog-src")

PDFS = {
    "171a.pdf": "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-171a.pdf",
    "171r2.pdf": "https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-171r2.pdf",
}


def fetch_pdfs() -> None:
    SRC_DIR.mkdir(parents=True, exist_ok=True)
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    for name, url in PDFS.items():
        dest = SRC_DIR / name
        if dest.exists() and dest.stat().st_size > 10000:
            continue
        print(f"downloading {url}")
        req = urllib.request.Request(url, headers={"User-Agent": "cmmc-evidence-bench-catalog-extract"})
        with urllib.request.urlopen(req, context=ctx, timeout=60) as resp:
            dest.write_bytes(resp.read())


def clean_page(text: str, pub: str) -> str:
    lines = []
    for line in (text or "").splitlines():
        s = line.strip()
        if not s:
            lines.append("")
            continue
        if s.startswith(pub):
            continue
        if s.startswith("This publication is available free of charge"):
            continue
        if re.fullmatch(r"PAGE [ivx0-9]+", s, re.I):
            continue
        if re.fullmatch(r"CHAPTER THREE\s+PAGE \d+", s):
            continue
        if s.startswith("____"):
            continue
        if s.startswith("SP 800-171, REVISION 2"):
            continue
        if s.startswith("PROTECTING CONTROLLED UNCLASSIFIED INFORMATION"):
            continue
        lines.append(line)
    return "\n".join(lines)


def pdf_chapter(path: Path, pub: str, start_re: str, end_marker: str) -> str:
    reader = PdfReader(str(path))
    cleaned = "\n".join(clean_page(p.extract_text() or "", pub) for p in reader.pages)
    matches = list(re.finditer(start_re, cleaned))
    if not matches:
        raise SystemExit(f"chapter start not found in {path}")
    start = None
    for m in matches:
        window = cleaned[m.end() : m.end() + 120]
        if "Basic Security Requirements" in window or "3.1.1 SECURITY REQUIREMENT" in window:
            start = m.start()
            break
    if start is None:
        start = matches[-1].start()
    end = cleaned.find(end_marker, start)
    if end < 0:
        raise SystemExit(f"chapter end not found in {path}")
    return cleaned[start:end]


def squash(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"(\w) -(\w)", r"\1-\2", s)
    s = re.sub(r"(\w)- (\w)", r"\1-\2", s)
    return s


def alnum(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def strip_footnotes(s: str) -> str:
    s = re.sub(r"\.(\d+)(?:\s+\d+)*$", ".", s)
    s = re.sub(r"(?:\s+\d+){1,3}$", "", s)
    return s.strip()


def prefer_typesetting(pdf_text: str, csv_text: str | None) -> str:
    pdf_text = squash(pdf_text)
    if not csv_text:
        return pdf_text
    csv_text = squash(csv_text)
    if alnum(pdf_text) == alnum(csv_text):
        return csv_text
    return pdf_text


def load_csv(path: Path):
    with path.open(newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    statements = {}
    aos = {}
    unlettered = {}
    for row in rows:
        ident = (row.get("Identifier") or "").replace("\t", " ").strip().replace(" ", "")
        ident = re.sub(r"\.\[", "[", ident)
        m = re.match(r"^(\d+\.\d+\.\d+)(?:\[([a-z]+)\])?$", ident)
        if not m:
            continue
        req, letter = m.group(1), m.group(2)
        ao = squash(row.get("Assessment Objective") or "")
        stmt = squash(row.get("Security Requirement") or "")
        if letter:
            aos.setdefault(req, {})[letter] = ao
        else:
            if stmt:
                statements[req] = stmt
            unlettered[req] = ao
    return statements, aos, unlettered


def parse_171a(chapter: str, csv_aos: dict, csv_unlettered: dict):
    req_starts = list(re.finditer(r"(?m)^(3\.\d+\.\d+)\s+SECURITY REQUIREMENT\s*$", chapter))
    out = {}
    for i, m in enumerate(req_starts):
        req = m.group(1)
        block = chapter[m.end() : (req_starts[i + 1].start() if i + 1 < len(req_starts) else len(chapter))]
        am = re.search(r"ASSESSMENT OBJECTIVE", block)
        pm = re.search(r"POTENTIAL ASSESSMENT METHODS", block)
        if not am or not pm:
            raise SystemExit(f"missing AO block for {req}")
        ao = squash(block[am.end() : pm.start()])
        parts = re.split(rf"({re.escape(req)}\[[a-zA-Z0-9]+\])", ao)
        objs = []
        if len(parts) > 1:
            j = 1
            while j < len(parts) - 1:
                letter = re.search(r"\[([a-zA-Z0-9]+)\]", parts[j]).group(1).lower()
                txt = parts[j + 1].strip().strip(";").strip()
                txt = re.sub(r"\s+and$", "", txt).strip()
                csv_txt = csv_aos.get(req, {}).get(letter)
                txt = prefer_typesetting(txt, csv_txt)
                if txt and not txt.endswith("."):
                    txt += "."
                objs.append({"letter": letter, "determineIf": txt})
                j += 2
        else:
            txt = re.sub(r"^Determine if:?\s*", "", ao, flags=re.I).strip()
            csv_txt = csv_unlettered.get(req, "")
            csv_txt = re.sub(r"^Determine if:?\s*", "", csv_txt, flags=re.I).strip()
            txt = prefer_typesetting(txt, csv_txt)
            if txt and not txt.endswith("."):
                txt += "."
            objs.append({"letter": "a", "determineIf": txt})
        out[req] = objs
    return out


def parse_171r2(chapter: str, csv_statements: dict):
    lines = chapter.splitlines()
    mode = None
    reqs = []
    current = None

    def flush():
        nonlocal current
        if not current:
            return
        stmt = squash(" ".join(current["stmt"]))
        stmt = re.split(r"\sDISCUSSION\b", stmt, maxsplit=1)[0].strip()
        stmt = strip_footnotes(stmt)
        if stmt.endswith("."):
            pass
        elif stmt:
            stmt += "."
        csv_stmt = csv_statements.get(current["reqId"])
        current["statement"] = prefer_typesetting(stmt, csv_stmt)
        if current["statement"] and not current["statement"].endswith("."):
            current["statement"] += "."
        reqs.append(current)
        current = None

    for line in lines:
        s = line.strip()
        if re.fullmatch(r"3\.\d+\s+[A-Z].*", s) and not re.match(r"3\.\d+\.\d+", s):
            flush()
            continue
        if s.lower() == "basic security requirements":
            mode = "basic"
            continue
        if s.lower() == "derived security requirements":
            mode = "derived"
            continue
        m = re.match(r"^(3\.\d+\.\d+)\s+(.*)$", s)
        if m and mode:
            flush()
            current = {"reqId": m.group(1), "basicOrDerived": mode, "stmt": [m.group(2)]}
            continue
        if current:
            if s.upper().startswith("DISCUSSION"):
                flush()
                continue
            if re.match(r"^3\.\d+\.\d+\s+", s):
                flush()
                continue
            letters = re.sub(r"[^A-Za-z]", "", s)
            if letters and letters.isupper() and len(letters) > 8:
                flush()
                continue
            if s:
                current["stmt"].append(s)
    flush()
    return reqs


def main() -> None:
    fetch_pdfs()
    pdf_a = SRC_DIR / "171a.pdf"
    pdf_r2 = SRC_DIR / "171r2.pdf"
    csv_path = VENDOR / "sp800-171a-assessment-procedures.csv"
    if not pdf_a.exists() or not pdf_r2.exists():
        raise SystemExit(f"PDFs not found under {SRC_DIR}")
    csv_statements, csv_aos, csv_unlettered = load_csv(csv_path)
    chapter_a = pdf_chapter(
        pdf_a,
        "NIST SP 800-171A",
        r"3\.1\s+ACCESS CONTROL",
        "APPENDIX A",
    )
    chapter_r2 = pdf_chapter(
        pdf_r2,
        "SP 800-171, REVISION 2",
        r"3\.1\s+ACCESS CONTROL",
        "APPENDIX A",
    )
    aos = parse_171a(chapter_a, csv_aos, csv_unlettered)
    reqs = parse_171r2(chapter_r2, csv_statements)
    if len(reqs) != 110:
        raise SystemExit(f"expected 110 requirements, got {len(reqs)}")
    missing = [r["reqId"] for r in reqs if r["reqId"] not in aos]
    if missing:
        raise SystemExit(f"missing AOs for {missing}")
    payload = {
        "standard": "NIST-SP-800-171-R2",
        "assessmentGuide": "NIST-SP-800-171A-2018-06",
        "requirements": [
            {
                "reqId": r["reqId"],
                "basicOrDerived": r["basicOrDerived"],
                "statement": r["statement"],
                "objectives": aos[r["reqId"]],
            }
            for r in reqs
        ],
    }
    out = VENDOR / "nist-171-extracted.json"
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    ao_n = sum(len(r["objectives"]) for r in payload["requirements"])
    print(f"wrote {out} reqs={len(payload['requirements'])} aos={ao_n}")


if __name__ == "__main__":
    main()
