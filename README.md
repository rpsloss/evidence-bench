# Evidence Bench

**UNCLASSIFIED. Sample / fictional data only. Not a SPRS submission. Not a C3PAO tool. Not legal advice.**

Local Castleridge **Evidence Bench** for walking one fictional shop through **CMMC Level 1 (Self) then Level 2 (Self)**. **SPRS remains the system of record via human entry.** Intake decides FCI vs CUI before the 110-practice board. The seeded organization (**Harbor Precision**) is fictional CUI → Level 2. CAGE `XXXXX` is an obvious fake. The app never submits, signs, or affirms.

GitHub: [rpsloss/evidence-bench](https://github.com/rpsloss/evidence-bench).

Castleridge Solutions is Hawaiʻi-based. This product stores **unclassified pointers only** — no CUI blobs, no multipart upload.

License: MIT. Local assessment files under `data/` (encrypted JSON, key, audit log) are gitignored and must never be committed.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API listens on **127.0.0.1:8787** (loopback only). CORS is limited to the Vite origin.

Home is the consultant playbook: next work item, plain-language SPRS blockers, and annual clocks (local stamps — not a CMMC Status Date, not an affirmation). Information type, required CMMC Status, working level, and phase still sit above the assembler board. Intake is first. Working Level 1 uses a frozen catalog of **15 FAR 52.204-21 requirements / 17 mapped 171 IDs / 59 171A objectives** (FCI substituted for CUI). All must be MET. No POA&M. **Promote to Level 2** keeps org/assets/evidence and credits those 17; the punch list is the L2 delta (the other 93). Load **L1-first Harbor** to demo that path. The full Harbor seed stays a finished L2 sample. The 14-family assembler board is Level 2 tooling and stays parked while working Level 1. That completion status is not a SPRS finding. The punch list is remaining L2 work for the AO/SCA. Export still refuses `sprs-manual-entry.csv` while any L2 objective is unanswered. Working Level 1 emits `l1-sprs-entry.csv` instead (CMMC Level, Status Date blank, Assessment Scope, CAGE(s), compliance result). That zip has no POA&M and no 110-row CSV. `POST /api/snapshot` omits the typing sheet. POA&M is disabled on Level 1 (32 CFR 170.21(a)(1)).

CSV **header names stay frozen** (`cmmcId`, `reqId`, `mfaState`, …). `COLUMNS.md` in the zip is the plain-language glossary. The Export screen shows the same labels: CMMC practice ID, NIST 800-171 ID, finding to type.

Production-style (after `npm run build`):

```bash
npm start
```

Then open [http://127.0.0.1:8787](http://127.0.0.1:8787).

## What this is not

- Not a SPRS submission and not connected to SPRS / PIEE
- Not a C3PAO assessment or certification
- Not an auto-affirmation
- Not a CUI archive (six-year artifact retention stays with the OSA)

## Data

Assessment JSON under `data/` is encrypted at rest (AES-256-GCM). The key is `data/.package-key` on this machine and is gitignored. Access events append counts-only lines to `data/audit.log`. Logs never include CUI, PII, rationale text, or key material.

| Path | Purpose |
| --- | --- |
| `data/assessment.json.enc` | Autosaved assessment (encrypted at rest) |
| `data/.package-key` | Local AES-256-GCM key (gitignored) |
| `data/audit.log` | Access audit (timestamp, action, outcome, bytes) |
