# Evidence Bench

**UNCLASSIFIED. Sample / fictional data only. Not a SPRS submission. Not a C3PAO tool. Not legal advice.**

Local CMMC Level 2 (Self) assessment workbench for one prep cycle. **SPRS remains the system of record via human entry.** The seeded organization (**Harbor Precision**) is fictional. CAGE `XXXXX` is an obvious fake. The app never submits, signs, or affirms.

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

Home shows an assembler board per NIST family: **unfinished / partial / gapped / present**. That is work status for the person compiling the pack, not a SPRS finding. The punch list under the board is the remaining work for the AO/SCA (unanswered objectives, MET missing pointers, NOT MET missing POA&M, evidence warnings). Export still refuses `sprs-manual-entry.csv` while any objective is unanswered. `POST /api/snapshot` always emits a SAMPLE zip with `HANDOFF.md` (cover sheet + punch list) for the AO/SCA, and omits the SPRS CSV.

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
