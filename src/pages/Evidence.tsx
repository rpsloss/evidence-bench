import { useMemo, useState, type ReactNode } from "react";
import catalogFile from "../data/catalog.json";
import {
  cuiFilenameRisk,
  EVIDENCE_KINDS,
  evidenceGapBoard,
  filter171AAoIds,
  type CatalogRequirement,
  type EvidenceKind,
} from "../lib/rollup.mjs";
import { useAssessment } from "../lib/store";
import type { EvidenceItem } from "../types";

const CATALOG = catalogFile.requirements as CatalogRequirement[];

function newId() {
  return `ev-${crypto.randomUUID().slice(0, 8)}`;
}

function emptyItem(id: string): EvidenceItem {
  return {
    id,
    title: "",
    kind: "policy",
    uri: "file:///unclass/sample/",
    capturedAt: new Date().toISOString(),
    aoIds: [],
    owner: "",
    draft: false,
    notes: "",
  };
}

function dateInput(iso: string | undefined) {
  return iso ? iso.slice(0, 10) : "";
}

function fromDateInput(value: string) {
  return value ? `${value}T00:00:00Z` : "";
}

function parseAoIds(text: string) {
  return text
    .split(/[\s,]+/)
    .map((row) => row.trim())
    .filter(Boolean);
}

function formatAoIds(aoIds: string[]) {
  return aoIds.join("\n");
}

async function sha256HexOfFile(file: File) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function kindLabel(kind: string) {
  if (kind === "esp_crm") return "ESP/CRM";
  if (kind === "log_export") return "log export";
  return kind.replaceAll("_", " ");
}

export default function Evidence() {
  const { assessment, setAssessment, readOnly } = useAssessment();
  const [selectedId, setSelectedId] = useState<string | null>(assessment.evidence[0]?.id ?? null);
  const [reqPick, setReqPick] = useState(CATALOG[0]?.reqId ?? "");
  const [hashError, setHashError] = useState<string | null>(null);

  const item = assessment.evidence.find((row) => row.id === selectedId);
  const gaps = useMemo(
    () => evidenceGapBoard(CATALOG, assessment.determinations, assessment.evidence),
    [assessment.determinations, assessment.evidence],
  );
  const filenameWarn = item ? cuiFilenameRisk(item.uri) : false;
  const shaWarn = item?.sha256 && !/^[0-9a-f]{64}$/i.test(item.sha256);

  function patchItem(id: string, partial: Partial<EvidenceItem>) {
    setAssessment((a) => ({
      ...a,
      evidence: a.evidence.map((row) => {
        if (row.id !== id) return row;
        const next: EvidenceItem = { ...row, ...partial };
        if (!next.expiresAt) delete next.expiresAt;
        if (!next.sha256) delete next.sha256;
        if (partial.aoIds !== undefined) next.aoIds = filter171AAoIds(partial.aoIds, CATALOG);
        return next;
      }),
    }));
  }

  function addItem(seed?: Partial<EvidenceItem>) {
    const n = { ...emptyItem(newId()), ...seed };
    n.aoIds = filter171AAoIds(n.aoIds, CATALOG);
    setAssessment((a) => ({ ...a, evidence: [...a.evidence, n] }));
    setSelectedId(n.id);
  }

  function removeItem(id: string) {
    setAssessment((a) => ({ ...a, evidence: a.evidence.filter((row) => row.id !== id) }));
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  function addReqAos() {
    if (!item) return;
    const req = CATALOG.find((row) => row.reqId === reqPick);
    if (!req) return;
    patchItem(item.id, { aoIds: [...item.aoIds, ...req.objectives.map((ao) => ao.aoId)] });
  }

  async function onHashOnly(file: File | undefined) {
    setHashError(null);
    if (!item || !file) return;
    try {
      const sha256 = await sha256HexOfFile(file);
      patchItem(item.id, { sha256 });
    } catch {
      setHashError("Could not hash that file in the browser.");
    }
  }

  return (
    <div>
      <div className="kicker">Evidence · URI register</div>
      <h1>Evidence</h1>
      <p>
        Pointers only — URI + optional SHA-256. No upload, no multipart, no <span className="mono">storedName</span>.
        Attach via 171A <span className="mono">aoIds</span>. Draft and interview-only items cannot support MET
        (32 CFR 170.24(b)(1)). SAMPLE data only. Not a SPRS submission.
      </p>

      <div className="grid gaps" style={{ marginBottom: 16 }}>
        <GapCard
          title="Missing"
          count={gaps.missing.length}
          severity="blocker"
          hint="MET AOs with no non-draft pointer"
        >
          {gaps.missing.slice(0, 8).map((row) => (
            <button
              key={row.aoId}
              type="button"
              className="gap-link"
              onClick={() => addItem({ title: `Pointer for ${row.aoId}`, aoIds: [row.aoId] })}
            >
              {row.aoId}
            </button>
          ))}
          {gaps.missing.length > 8 ? <div className="muted">+{gaps.missing.length - 8} more</div> : null}
        </GapCard>
        <GapCard title="Stale" count={gaps.stale.length} severity="warning" hint="Warning — not a MET breaker">
          {gaps.stale.map((row) => (
            <button key={row.id} type="button" className="gap-link" onClick={() => setSelectedId(row.id)}>
              {row.title || row.id}
            </button>
          ))}
        </GapCard>
        <GapCard title="Unmapped" count={gaps.unmapped.length} severity="warning" hint="Empty aoIds never credit MET">
          {gaps.unmapped.map((row) => (
            <button key={row.id} type="button" className="gap-link" onClick={() => setSelectedId(row.id)}>
              {row.title || row.id}
            </button>
          ))}
        </GapCard>
        <GapCard title="Draft" count={gaps.draft.length} severity="blocker" hint="Cannot support MET">
          {gaps.draft.map((row) => (
            <button key={row.id} type="button" className="gap-link" onClick={() => setSelectedId(row.id)}>
              {row.title || row.id}
            </button>
          ))}
        </GapCard>
        <GapCard title="Missing SHA-256" count={gaps.missingSha256.length} severity="info" hint="Optional; gap-board warning">
          {gaps.missingSha256.slice(0, 8).map((row) => (
            <button key={row.id} type="button" className="gap-link" onClick={() => setSelectedId(row.id)}>
              {row.title || row.id}
            </button>
          ))}
          {gaps.missingSha256.length > 8 ? <div className="muted">+{gaps.missingSha256.length - 8} more</div> : null}
        </GapCard>
      </div>

      {gaps.cuiRisk.length > 0 ? (
        <div className="banner warn">
          <div>
            <strong>CUI-like filename.</strong> Basename matches /cui|fouo|itar/i. Point at an unclassified URI. This
            is a warning, not a detector.
          </div>
        </div>
      ) : null}

      <fieldset className="stack" disabled={readOnly}>
        <div className="row">
          <button type="button" className="primary" onClick={() => addItem()}>
            Add URI pointer
          </button>
        </div>

        <div className="split">
          <div className="card">
            <h2>Registry</h2>
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Kind</th>
                  <th>AOs</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {assessment.evidence.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No pointers yet.
                    </td>
                  </tr>
                ) : (
                  assessment.evidence.map((row) => {
                    const flags = [];
                    if (row.draft) flags.push("draft");
                    if (!row.aoIds.length) flags.push("unmapped");
                    if (!row.sha256) flags.push("no-hash");
                    if (gaps.stale.some((s) => s.id === row.id)) flags.push("stale");
                    if (cuiFilenameRisk(row.uri)) flags.push("cui-name");
                    return (
                      <tr
                        key={row.id}
                        className={`clickable${selectedId === row.id ? " selected" : ""}`}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <td>{row.title || row.id}</td>
                        <td>{kindLabel(row.kind)}</td>
                        <td className="mono">{row.aoIds.length}</td>
                        <td>
                          {flags.length === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            flags.map((f) => (
                              <span key={f} className={`pill ${f === "draft" || f === "cui-name" ? "blocker" : "warning"}`}>
                                {f}
                              </span>
                            ))
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Pointer</h2>
            {item ? (
              <>
                <label htmlFor="ev-title">Title</label>
                <input
                  id="ev-title"
                  value={item.title}
                  onChange={(e) => patchItem(item.id, { title: e.target.value })}
                />
                <label htmlFor="ev-kind">Kind</label>
                <select
                  id="ev-kind"
                  value={item.kind}
                  onChange={(e) => patchItem(item.id, { kind: e.target.value as EvidenceKind })}
                >
                  {EVIDENCE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kindLabel(kind)}
                    </option>
                  ))}
                </select>
                <label htmlFor="ev-uri">URI (unclassified pointer)</label>
                <input
                  id="ev-uri"
                  className="mono"
                  value={item.uri}
                  onChange={(e) => patchItem(item.id, { uri: e.target.value })}
                  placeholder="file:///unclass/sample/policy.pdf"
                />
                {filenameWarn ? (
                  <div className="helper" style={{ color: "var(--amber)" }}>
                    Filename looks CUI-like. Point at an unclassified URI. Warning only.
                  </div>
                ) : (
                  <div className="helper">file:// or https://. Never paste CUI into the path.</div>
                )}
                <label htmlFor="ev-sha">SHA-256 (optional hex)</label>
                <input
                  id="ev-sha"
                  className="mono"
                  value={item.sha256 || ""}
                  onChange={(e) => patchItem(item.id, { sha256: e.target.value.trim().toLowerCase() || undefined })}
                  placeholder="64-char hex; never uploaded"
                />
                {shaWarn ? <div className="helper">SHA-256 should be 64 hex characters.</div> : null}
                <label htmlFor="hash-only-picker">Hash a local file (bytes never leave the browser)</label>
                <input
                  id="hash-only-picker"
                  type="file"
                  aria-label="Hash a local file. Bytes are not uploaded."
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    void onHashOnly(file);
                  }}
                />
                <div className="helper">
                  Hash-only picker. Reads locally, writes hex to sha256, keeps URI as the pointer. Not an upload
                  route.
                </div>
                {hashError ? <div className="helper">{hashError}</div> : null}
                <div className="grid two">
                  <div>
                    <label htmlFor="ev-captured">Captured</label>
                    <input
                      id="ev-captured"
                      type="date"
                      value={dateInput(item.capturedAt)}
                      onChange={(e) => patchItem(item.id, { capturedAt: fromDateInput(e.target.value) })}
                    />
                  </div>
                  <div>
                    <label htmlFor="ev-expires">Expires (optional)</label>
                    <input
                      id="ev-expires"
                      type="date"
                      value={dateInput(item.expiresAt)}
                      onChange={(e) => patchItem(item.id, { expiresAt: fromDateInput(e.target.value) || undefined })}
                    />
                  </div>
                </div>
                <label htmlFor="ev-owner">Owner</label>
                <input
                  id="ev-owner"
                  value={item.owner}
                  onChange={(e) => patchItem(item.id, { owner: e.target.value })}
                />
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={item.draft === true}
                    onChange={(e) => patchItem(item.id, { draft: e.target.checked })}
                  />
                  Draft (cannot support MET)
                </label>
                <label htmlFor="ev-aos">aoIds (171A only, one per line)</label>
                <textarea
                  id="ev-aos"
                  className="mono"
                  value={formatAoIds(item.aoIds)}
                  onChange={(e) => patchItem(item.id, { aoIds: parseAoIds(e.target.value) })}
                  placeholder="3.1.1[a]"
                />
                <div className="helper">Empty aoIds is an unmapped gap, not credit. Overlay keys enc/fips are dropped.</div>
                <div className="row">
                  <select
                    aria-label="Requirement whose AOs to attach"
                    value={reqPick}
                    onChange={(e) => setReqPick(e.target.value)}
                    style={{ maxWidth: 280 }}
                  >
                    {CATALOG.map((req) => (
                      <option key={req.reqId} value={req.reqId}>
                        {req.cmmcId} {req.title}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={addReqAos}>
                    Attach this requirement&apos;s AOs
                  </button>
                </div>
                <label htmlFor="ev-notes">Notes (unclassified)</label>
                <textarea
                  id="ev-notes"
                  value={item.notes}
                  onChange={(e) => patchItem(item.id, { notes: e.target.value })}
                />
                <button type="button" className="danger" onClick={() => removeItem(item.id)}>
                  Remove pointer
                </button>
              </>
            ) : (
              <p className="muted">Select a pointer or add one. This app stores URIs, not files.</p>
            )}
          </div>
        </div>
      </fieldset>
    </div>
  );
}

function GapCard({
  title,
  count,
  severity,
  hint,
  children,
}: {
  title: string;
  count: number;
  severity: "blocker" | "warning" | "info";
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="card kpi">
      <div className="label">{title}</div>
      <div className="value">{count}</div>
      <span className={`pill ${severity}`}>{hint}</span>
      <div className="gap-list">{count === 0 ? <div className="muted">None</div> : children}</div>
    </div>
  );
}
