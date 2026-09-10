# Evidence Bench

**UNCLASSIFIED. Sample / fictional data only. Not a SPRS submission. Not a C3PAO tool. Not legal advice.**

Local CMMC Level 2 (Self) assessment workbench for one prep cycle. **SPRS remains the system of record via human entry.** The seeded organization (**Harbor Precision**) is fictional. CAGE `XXXXX` is an obvious fake. The app never submits, signs, or affirms.

Castleridge Solutions is Hawaiʻi-based. This product stores **unclassified pointers only** — no CUI blobs, no multipart upload.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). The API listens on **127.0.0.1:8787** (loopback only). CORS is limited to the Vite origin.

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
