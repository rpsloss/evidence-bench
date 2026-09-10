import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  affirmationChecklist,
  canExportZip,
  CHECKLIST_PREFIX,
  FAMILY_IDS,
  familyReviewsComplete,
  markExportReady,
  SAMPLE_WATERMARK,
} from "../lib/exportPack.mjs";
import { completionLabel, familyProgressRows } from "../lib/familyProgress.mjs";
import { reportAssessmentAccess, useAssessment } from "../lib/store";

export default function ExportPage() {
  const { assessment, score, setAssessment, readOnly } = useAssessment();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checklist = useMemo(() => affirmationChecklist(assessment, score), [assessment, score]);
  const reviewsDone = familyReviewsComplete(assessment);
  const zipOk = canExportZip(assessment);
  const prep = assessment.prepMarkedAt;
  const reviewByFamily = useMemo(() => {
    const map = new Map<string, { reviewed: boolean; reviewer: string }>();
    for (const row of assessment.familyReviews) {
      map.set(row.family, { reviewed: row.reviewed === true, reviewer: row.reviewer || "" });
    }
    return map;
  }, [assessment.familyReviews]);
  const progressByFamily = useMemo(
    () => new Map(familyProgressRows(assessment).map((row) => [row.family, row])),
    [assessment],
  );

  function markPrep() {
    if (readOnly) return;
    const next = markExportReady(assessment);
    if (!next.ok) {
      setError("Export-ready requires a consultant review of all 14 families.");
      return;
    }
    setError(null);
    setAssessment(() => next.assessment);
  }

  async function downloadNamedZip(path: string, fallbackName: string, action: "export" | "snapshot") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (data.error === "not-reviewed") {
          setError("Export refused: a requirement is still not-reviewed. CSV never writes Met for those rows.");
        } else {
          setError(typeof data.error === "string" ? data.error : `Export failed (HTTP ${res.status}).`);
        }
        return;
      }
      const blob = await res.blob();
      reportAssessmentAccess(action, blob.size);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fallbackName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(false);
    }
  }

  async function downloadZip() {
    if (!zipOk) return;
    await downloadNamedZip("/api/export", "evidence-bench-sample.zip", "export");
  }

  async function downloadSnapshot() {
    await downloadNamedZip("/api/snapshot", "evidence-bench-assembler-snapshot.zip", "snapshot");
  }

  return (
    <div>
      <div className="kicker">Export · SAMPLE</div>
      <h1>Export and affirmation checklist</h1>
      <p>
        {CHECKLIST_PREFIX} Markdown + CSV pack a human types into SPRS. There is no SPRS affirmation control and no
        submit. SAMPLE watermark is always on.
      </p>

      <div className="banner">
        <div>
          <strong>{SAMPLE_WATERMARK}</strong> Fake CAGE XXXXX. Fictional Harbor Precision seed. This app does not
          submit, sign, or affirm.
        </div>
      </div>

      {error ? (
        <div className="banner conflict">
          <div>
            <strong>Export blocked.</strong> {error}
          </div>
        </div>
      ) : null}

      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>SAMPLE zip</h2>
          <p className="helper">
            MD + sprs-manual-entry.csv + scope.csv + poam.csv + JSON. Refused while any catalog AO or FIPS overlay is
            unanswered, or a requirement is still not-reviewed. Never exports Met for evidence-failed rows.
          </p>
          <div className="row">
            <button type="button" className="primary" disabled={!zipOk || busy || readOnly} onClick={() => void downloadZip()}>
              {busy ? "Building…" : "Download SAMPLE zip"}
            </button>
          </div>
          {!zipOk ? (
            <p className="helper">
              Finish unanswered objectives and evidence-failed MET rows before the pack will emit. Keeper Not Met (for
              example a temporary deficiency without an operational POA) is exportable.
            </p>
          ) : null}
          <p className="helper">
            Assembler snapshot is allowed while families are unfinished or partial. It omits sprs-manual-entry.csv.
          </p>
          <div className="row">
            <button type="button" disabled={busy || readOnly} onClick={() => void downloadSnapshot()}>
              {busy ? "Building…" : "Download assembler snapshot"}
            </button>
          </div>
        </div>
        <div className="card">
          <h2>Export-ready (local prep)</h2>
          <p className="helper">
            prepMarkedAt is local prep only. It is not a CMMC Status Date and does not start the 180-day Conditional
            clock. Closeout is a later version.
          </p>
          <p className="mono">{prep || "(not marked)"}</p>
          <button type="button" disabled={!reviewsDone || readOnly} onClick={markPrep}>
            Mark export-ready
          </button>
          {!reviewsDone ? (
            <p className="helper">
              Requires all 14 family reviews. familyReviews may be empty on this branch — the gate still holds.
            </p>
          ) : null}
        </div>
      </div>

      <h2>Family reviews</h2>
      <p className="helper">Consultant review of every family is required for Export-ready. Not an Affirm control.</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Family</th>
              <th>Completion</th>
              <th>Reviewed</th>
              <th>Reviewer</th>
            </tr>
          </thead>
          <tbody>
            {FAMILY_IDS.map((id) => {
              const row = reviewByFamily.get(id);
              const progress = progressByFamily.get(id);
              const ok = row?.reviewed === true;
              const completion = progress?.completion || "unfinished";
              return (
                <tr key={id} className={ok ? undefined : "unsatisfied"}>
                  <td className="mono">
                    <Link to={`/requirements?family=${id}`}>{id}</Link>
                  </td>
                  <td>
                    <span
                      className={`pill ${completion === "present" ? "ok" : completion === "partial" ? "info" : completion === "gapped" ? "warning" : "blocker"}`}
                    >
                      {completionLabel(completion)}
                    </span>
                  </td>
                  <td>
                    <span className={`pill ${ok ? "ok" : "blocker"}`}>{ok ? "reviewed" : "not reviewed"}</span>
                  </td>
                  <td>{row?.reviewer || "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h2>Frozen affirmation checklist</h2>
      <p className="helper">
        Read-only projection of this pack. {CHECKLIST_PREFIX} Red rows are unsatisfied. No signature capture.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Id</th>
              <th>Statement</th>
              <th>Satisfied</th>
              <th>Open</th>
            </tr>
          </thead>
          <tbody>
            {checklist.map((row) => (
              <tr key={row.id} className={row.satisfied ? undefined : "unsatisfied"}>
                <td className="mono">{row.id}</td>
                <td>
                  {CHECKLIST_PREFIX} {row.statement}
                  {row.citation ? <div className="muted">{row.citation}</div> : null}
                </td>
                <td>
                  <span className={`pill ${row.satisfied ? "ok" : "blocker"}`}>
                    {row.satisfied ? "yes" : "no"}
                  </span>
                </td>
                <td>
                  <Link to={row.href}>{row.href}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
