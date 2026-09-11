import { useMemo, useState, type FormEvent } from "react";
import catalogFile from "../data/catalog.json";
import { citationForIllegal, type PoamItem } from "../lib/poamGuard.mjs";
import { storedFinding, type CatalogRequirement, type EvidenceItem } from "../lib/rollup.mjs";
import { isWorkingLevel1, normalizeEngagement } from "../lib/engagement.mjs";
import { useAssessment } from "../lib/store";
import type { OperationalPoaItem } from "../types";
import WorkingLevelNote from "../components/WorkingLevelNote";

const catalog = (catalogFile as { requirements: CatalogRequirement[] }).requirements;

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function reqOf(reqId: string) {
  return catalog.find((row) => row.reqId === reqId);
}

function labelOf(reqId: string) {
  const req = reqOf(reqId);
  if (!req) return reqId;
  return `${req.cmmcId} · ${req.title}`;
}

export default function Poam() {
  const { assessment, setAssessment, readOnly } = useAssessment();
  const workingL1 = isWorkingLevel1(normalizeEngagement(assessment.engagement));
  const [form, setForm] = useState({
    reqId: "",
    weakness: "",
    tasks: "",
    owner: "",
    due: "",
    status: "open" as PoamItem["status"],
  });
  const [opForm, setOpForm] = useState({
    reqId: "3.12.2",
    deficiency: "",
    progress: "",
    reviewedAt: "",
    owner: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const taken = useMemo(() => new Set(assessment.poams.map((row) => row.reqId)), [assessment.poams]);

  const findings = useMemo(() => {
    const map = new Map<string, ReturnType<typeof storedFinding>>();
    for (const req of catalog) {
      map.set(
        req.reqId,
        storedFinding(
          req,
          assessment.determinations[req.reqId],
          assessment.evidence as unknown as EvidenceItem[],
          assessment.operationalPoas,
        ),
      );
    }
    return map;
  }, [assessment.determinations, assessment.evidence, assessment.operationalPoas]);

  const insertChoices = useMemo(
    () => catalog.filter((req) => findings.get(req.reqId) === "not-met" && !taken.has(req.reqId)),
    [findings, taken],
  );

  const selectedReqId = insertChoices.some((req) => req.reqId === form.reqId)
    ? form.reqId
    : (insertChoices[0]?.reqId ?? "");
  const canInsert = Boolean(selectedReqId) && !readOnly && !busy && !workingL1;

  async function insertRegister(e: FormEvent) {
    e.preventDefault();
    if (!canInsert || !insertChoices.some((req) => req.reqId === selectedReqId)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/poam", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reqId: selectedReqId,
          weakness: form.weakness,
          tasks: form.tasks,
          owner: form.owner,
          due: form.due,
          status: form.status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : `Insert failed (HTTP ${res.status}).`);
        return;
      }
      const item = data.item as PoamItem;
      setAssessment((a) => ({ ...a, poams: [...a.poams, item] }));
      setForm({ reqId: "", weakness: "", tasks: "", owner: "", due: "", status: "open" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Insert failed");
    } finally {
      setBusy(false);
    }
  }

  function addOperational(e: FormEvent) {
    e.preventDefault();
    if (readOnly || workingL1) return;
    const row: OperationalPoaItem = {
      id: newId("opoam"),
      reqId: opForm.reqId.trim() || "3.12.2",
      deficiency: opForm.deficiency,
      progress: opForm.progress,
      reviewedAt: opForm.reviewedAt.trim() || new Date().toISOString(),
      owner: opForm.owner,
    };
    setAssessment((a) => ({ ...a, operationalPoas: [...a.operationalPoas, row] }));
    setOpForm({ reqId: "3.12.2", deficiency: "", progress: "", reviewedAt: "", owner: "" });
  }

  return (
    <div>
      <div className="kicker">POA&amp;M · SAMPLE</div>
      <h1>POA&amp;M register</h1>
      <WorkingLevelNote page="poam" />
      <p>
        Two lists: the 32 CFR 170.21 Conditional register (every NOT MET) and the CA.L2-3.12.2 operational plan of
        action (temporary deficiencies that still score MET). SAMPLE data only. Not a SPRS submission. Not legal advice.
      </p>
      <div className="banner">
        <div>
          <strong>180-day clock is copy only.</strong> Conditional Level 2 (Self) is valid 180 days from the CMMC
          Status Date in SPRS. Closeout is a second self-assessment of POA&amp;M items, not a spreadsheet note. This app
          does not start that clock and does not treat prepMarkedAt as the origin.
        </div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>170.21 Conditional register</h2>
          <p className="helper">
            Insert is allowed for any NOT MET. Banned, weight&gt;1, and FIPS-none rows still save; they stay on the
            register with a citation chip and block Conditional.
          </p>
          {error ? (
            <div className="banner conflict">
              <div>
                <strong>Insert rejected.</strong> {error}
              </div>
            </div>
          ) : null}
          <fieldset className="stack" disabled={readOnly || busy || !canInsert}>
            <form onSubmit={insertRegister}>
              <label>Requirement</label>
              <select
                value={selectedReqId}
                onChange={(e) => setForm((f) => ({ ...f, reqId: e.target.value }))}
                disabled={!insertChoices.length}
              >
                {insertChoices.length === 0 ? (
                  <option value="">No remaining NOT MET gaps</option>
                ) : (
                  insertChoices.map((req) => (
                    <option key={req.reqId} value={req.reqId}>
                      {req.cmmcId} · {req.title} ({req.weight}-pt
                      {req.poamBannedForConditional ? ", banned" : ""})
                    </option>
                  ))
                )}
              </select>
              {insertChoices.length === 0 ? (
                <div className="helper">
                  Every current NOT MET is already on the register. Insert stays disabled so a MET or unanswered row
                  cannot be posted.
                </div>
              ) : null}
              <label>Weakness</label>
              <textarea value={form.weakness} onChange={(e) => setForm((f) => ({ ...f, weakness: e.target.value }))} />
              <label>Tasks</label>
              <textarea value={form.tasks} onChange={(e) => setForm((f) => ({ ...f, tasks: e.target.value }))} />
              <div className="grid two">
                <div>
                  <label>Owner</label>
                  <input value={form.owner} onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))} />
                </div>
                <div>
                  <label>Due</label>
                  <input value={form.due} onChange={(e) => setForm((f) => ({ ...f, due: e.target.value }))} />
                </div>
              </div>
              <label>Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as PoamItem["status"] }))}
              >
                <option value="open">open</option>
                <option value="in-progress">in-progress</option>
                <option value="closed">closed</option>
              </select>
              <button type="submit" className="primary" disabled={!canInsert}>
                Record NOT MET
              </button>
            </form>
          </fieldset>

          <table>
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Conditional</th>
                <th>Owner / due</th>
                <th>Weakness</th>
              </tr>
            </thead>
            <tbody>
              {assessment.poams.length === 0 ? (
                <tr>
                  <td colSpan={4} className="muted">
                    No register rows yet. OSA must have a POA&amp;M for each NOT MET (170.24(c)(2)(i)(6)).
                  </td>
                </tr>
              ) : (
                assessment.poams.map((row) => {
                  const legal = row.conditionalLegal === true;
                  const citation = legal ? null : citationForIllegal(row.illegalCode, row.reqId);
                  return (
                    <tr key={row.id || row.reqId}>
                      <td>
                        <div className="mono">{labelOf(row.reqId)}</div>
                        <div className="muted">{row.status}</div>
                      </td>
                      <td>
                        {legal ? (
                          <span className="pill ok">170.21-legal</span>
                        ) : (
                          <span className="pill blocker">{row.illegalCode || "not-legal"}</span>
                        )}
                        {citation ? (
                          <div className="muted" style={{ marginTop: 6 }}>
                            <span className="pill warning">{citation}</span>
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <div>{row.owner || "—"}</div>
                        <div className="muted">{row.due || "—"}</div>
                      </td>
                      <td>
                        <div>{row.weakness || "—"}</div>
                        <div className="muted">{row.tasks}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h2>Operational POA (3.12.2)</h2>
          <p className="helper">
            Temporary deficiencies that still score MET. This is not the 170.21 Conditional register. A MET row with
            temporaryDeficiency needs a reviewed operational item.
          </p>
          <fieldset className="stack" disabled={readOnly || workingL1}>
            <form onSubmit={addOperational}>
              <label>Requirement</label>
              <input value={opForm.reqId} onChange={(e) => setOpForm((f) => ({ ...f, reqId: e.target.value }))} />
              <label>Deficiency</label>
              <textarea
                value={opForm.deficiency}
                onChange={(e) => setOpForm((f) => ({ ...f, deficiency: e.target.value }))}
              />
              <label>Progress</label>
              <textarea
                value={opForm.progress}
                onChange={(e) => setOpForm((f) => ({ ...f, progress: e.target.value }))}
              />
              <div className="grid two">
                <div>
                  <label>Reviewed at (ISO-8601)</label>
                  <input
                    value={opForm.reviewedAt}
                    onChange={(e) => setOpForm((f) => ({ ...f, reviewedAt: e.target.value }))}
                    placeholder="2026-01-15T00:00:00Z"
                  />
                </div>
                <div>
                  <label>Owner</label>
                  <input value={opForm.owner} onChange={(e) => setOpForm((f) => ({ ...f, owner: e.target.value }))} />
                </div>
              </div>
              <button type="submit">Add operational item</button>
            </form>
          </fieldset>

          <table>
            <thead>
              <tr>
                <th>Requirement</th>
                <th>Reviewed</th>
                <th>Deficiency</th>
              </tr>
            </thead>
            <tbody>
              {assessment.operationalPoas.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No operational POA items. Temporary deficiencies without a reviewed row cannot stay MET.
                  </td>
                </tr>
              ) : (
                assessment.operationalPoas.map((row) => (
                  <tr key={row.id || `${row.reqId}-${row.reviewedAt}`}>
                    <td>
                      <div className="mono">{labelOf(row.reqId)}</div>
                      <div className="muted">{row.owner || "—"}</div>
                    </td>
                    <td className="mono">{row.reviewedAt || "—"}</td>
                    <td>
                      <div>{row.deficiency || "—"}</div>
                      <div className="muted">{row.progress}</div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
