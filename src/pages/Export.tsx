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
  sprsPreviewRows,
} from "../lib/exportPack.mjs";
import {
  assemblerPunchList,
  completionLabel,
  familyProgressRows,
  familyWorkCaption,
} from "../lib/familyProgress.mjs";
import { isWorkingLevel1, normalizeEngagement } from "../lib/engagement.mjs";
import {
  canExportL1Zip,
  l1AffirmationChecklist,
  l1ExportReady,
  l1FindingPreviewRows,
  l1SprsPreview,
  markL1ExportReady,
} from "../lib/l1Export.mjs";
import { l1FamilyProgress } from "../lib/l1Score.mjs";
import { reportAssessmentAccess, useAssessment } from "../lib/store";
import WorkingLevelNote from "../components/WorkingLevelNote";

function L1ExportPanel({
  busy,
  readOnly,
  onDownloadZip,
  onDownloadSnapshot,
  onMarkPrep,
}: {
  busy: boolean;
  readOnly: boolean;
  onDownloadZip: () => void;
  onDownloadSnapshot: () => void;
  onMarkPrep: () => void;
}) {
  const { assessment, l1Score } = useAssessment();
  const preview = useMemo(() => l1SprsPreview(assessment), [assessment]);
  const findings = useMemo(() => l1FindingPreviewRows(assessment), [assessment]);
  const checklist = useMemo(() => l1AffirmationChecklist(assessment), [assessment]);
  const families = useMemo(() => l1FamilyProgress(assessment), [assessment]);
  const zipOk = canExportL1Zip(assessment);
  const ready = l1ExportReady(assessment);
  const prep = assessment.prepMarkedAt;

  return (
    <>
      <div className="grid two" style={{ marginBottom: 16 }}>
        <div className="card">
          <h2>Level 1 SAMPLE zip</h2>
          <p className="helper">
            Five SPRS fields in l1-sprs-entry.csv plus the 17 mapped FAR findings. No POA&M. No 110-row CSV. Refused
            while any Level 1 objective is unanswered. NOT MET still exports as NOT MET.
          </p>
          <div className="row">
            <button type="button" className="primary" disabled={!zipOk || busy || readOnly} onClick={onDownloadZip}>
              {busy ? "Building…" : "Download Level 1 SAMPLE zip"}
            </button>
          </div>
          {!zipOk ? (
            <p className="helper">
              {l1Score.unanswered} unanswered Level 1 row(s). Finish them before the typing sheet will emit.
            </p>
          ) : null}
          <p className="helper">
            Assembler snapshot is allowed mid-cycle. It omits l1-sprs-entry.csv. {l1Score.met}/{l1Score.total} FAR rows
            MET.
          </p>
          <div className="row">
            <button type="button" disabled={busy || readOnly} onClick={onDownloadSnapshot}>
              {busy ? "Building…" : "Download Level 1 snapshot"}
            </button>
          </div>
        </div>
        <div className="card">
          <h2>Export-ready (local prep)</h2>
          <p className="helper">
            Requires confirmed intake and no unanswered Level 1 objectives. prepMarkedAt is not a CMMC Status Date.
            The official affirms in SPRS, not here.
          </p>
          <p className="mono">{prep || "(not marked)"}</p>
          <button type="button" disabled={!ready || readOnly} onClick={onMarkPrep}>
            Mark Level 1 pack ready
          </button>
          {!ready ? (
            <p className="helper">Confirm intake and answer every mapped Level 1 objective first.</p>
          ) : null}
        </div>
      </div>

      <h2>Level 1 families</h2>
      <p className="helper">Work status for the six FAR families. Gapped means NOT MET. No POA&M path.</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Family</th>
              <th>Work status</th>
              <th>MET</th>
              <th>Unanswered</th>
              <th>NOT MET</th>
            </tr>
          </thead>
          <tbody>
            {families.map((row) => (
              <tr key={row.family}>
                <td className="mono">
                  <Link to={`/requirements?family=${row.family}`}>{row.family}</Link>
                </td>
                <td>
                  <span
                    className={`pill ${row.completion === "present" ? "ok" : row.completion === "partial" ? "info" : row.completion === "gapped" ? "warning" : "blocker"}`}
                  >
                    {completionLabel(row.completion)}
                  </span>
                </td>
                <td>{row.met}</td>
                <td>{row.unanswered}</td>
                <td>{row.notMet}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>What to type into SPRS</h2>
      <p className="helper">
        {CHECKLIST_PREFIX} These are the 32 CFR 170.15(a)(1)(i) inputs. CMMC Status Date stays blank — type it in SPRS.
        Compliance result is MET or NOT MET. No 110 findings. No POA&M.
      </p>
      <div className="card" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Value to type</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>CMMC Level</td>
              <td className="mono">{preview.cmmcLevel}</td>
            </tr>
            <tr>
              <td>CMMC Status Date</td>
              <td>(type in SPRS — not prepMarkedAt)</td>
            </tr>
            <tr>
              <td>CMMC Assessment Scope</td>
              <td>{preview.assessmentScope}</td>
            </tr>
            <tr>
              <td>CAGE code(s)</td>
              <td className="mono">{preview.cages || "—"}</td>
            </tr>
            <tr className={preview.complianceResult === "MET" ? undefined : "unsatisfied"}>
              <td>Compliance result</td>
              <td className="mono">{preview.complianceResult}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>FAR findings (QC, not SPRS fields)</h2>
      <p className="helper">
        17 mapped 171 rows behind the 15 FAR requirements. Type the five fields above, not these rows.
      </p>
      <div className="card table-scroll" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>CMMC ID</th>
              <th>FAR</th>
              <th>NIST 800-171 ID</th>
              <th>Title</th>
              <th>Finding</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((row) => (
              <tr key={row.reqId} className={row.exportable ? undefined : "unsatisfied"}>
                <td className="mono">{row.cmmcId}</td>
                <td className="mono">{row.farParagraph}</td>
                <td className="mono">{row.reqId}</td>
                <td>{row.title}</td>
                <td>{row.finding}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Affirming-official checklist</h2>
      <p className="helper">
        {CHECKLIST_PREFIX} Read-only projection of this Level 1 pack. Red rows are not yet true. No signature capture.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>What must be true</th>
              <th>Ready?</th>
              <th>Go to</th>
            </tr>
          </thead>
          <tbody>
            {checklist.map((row) => (
              <tr key={row.id} className={row.satisfied ? undefined : "unsatisfied"}>
                <td className="mono">{row.id}</td>
                <td>
                  {row.statement}
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
    </>
  );
}

export default function ExportPage() {
  const { assessment, score, setAssessment, readOnly } = useAssessment();
  const workingL1 = isWorkingLevel1(normalizeEngagement(assessment.engagement));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checklist = useMemo(() => affirmationChecklist(assessment, score), [assessment, score]);
  const reviewsDone = familyReviewsComplete(assessment);
  const zipOk = canExportZip(assessment);
  const punch = useMemo(() => assemblerPunchList(assessment), [assessment]);
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
  const [sheetFilter, setSheetFilter] = useState<"all" | "gaps" | "special">("gaps");
  const previewRows = useMemo(() => sprsPreviewRows(assessment), [assessment]);
  const sheetRows = useMemo(() => {
    if (sheetFilter === "gaps") return previewRows.filter((row) => row.finding !== "Met" || !row.exportable);
    if (sheetFilter === "special") return previewRows.filter((row) => row.reqId === "3.5.3" || row.reqId === "3.13.11");
    return previewRows;
  }, [previewRows, sheetFilter]);

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
    if (workingL1) {
      if (!canExportL1Zip(assessment)) return;
      await downloadNamedZip("/api/export", "evidence-bench-l1-sample.zip", "export");
      return;
    }
    if (!zipOk) return;
    await downloadNamedZip("/api/export", "evidence-bench-sample.zip", "export");
  }

  async function downloadSnapshot() {
    await downloadNamedZip(
      "/api/snapshot",
      workingL1 ? "evidence-bench-l1-snapshot.zip" : "evidence-bench-assembler-snapshot.zip",
      "snapshot",
    );
  }

  function markL1Prep() {
    if (readOnly) return;
    const next = markL1ExportReady(assessment);
    if (!next.ok) {
      setError(
        next.error === "intake"
          ? "Level 1 export-ready requires confirmed intake."
          : "Level 1 export-ready requires every mapped objective to be answered.",
      );
      return;
    }
    setError(null);
    setAssessment(() => next.assessment);
  }

  return (
    <div>
      <div className="kicker">Export · SAMPLE</div>
      <h1>Export and affirmation checklist</h1>
      <WorkingLevelNote />
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

      {workingL1 ? (
        <L1ExportPanel
          busy={busy}
          readOnly={readOnly}
          onDownloadZip={() => void downloadZip()}
          onDownloadSnapshot={() => void downloadSnapshot()}
          onMarkPrep={markL1Prep}
        />
      ) : (
      <>
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
            HANDOFF.md punch list: {punch.counts.unansweredAos} unanswered · {punch.counts.missingPointers} missing
            pointers · {punch.counts.missingPoams} missing POA&M · {punch.counts.warnings} evidence warnings.
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
              <th>Work status</th>
              <th>Consultant reviewed</th>
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
                    <div className="muted">{familyWorkCaption(progress)}</div>
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

      <h2>What to type into SPRS</h2>
      <p className="helper">
        {CHECKLIST_PREFIX} Machine CSV headers stay <span className="mono">cmmcId</span>,{" "}
        <span className="mono">reqId</span>, <span className="mono">finding</span>. The labels below are what those
        columns mean. MFA and FIPS columns are blank except on 3.5.3 and 3.13.11.
      </p>
      <div className="row">
        <button type="button" className={sheetFilter === "gaps" ? "primary" : undefined} onClick={() => setSheetFilter("gaps")}>
          Gaps and unanswered
        </button>
        <button type="button" className={sheetFilter === "special" ? "primary" : undefined} onClick={() => setSheetFilter("special")}>
          MFA and FIPS rows
        </button>
        <button type="button" className={sheetFilter === "all" ? "primary" : undefined} onClick={() => setSheetFilter("all")}>
          All 110
        </button>
      </div>
      <div className="card table-scroll" style={{ marginBottom: 16 }}>
        <table>
          <thead>
            <tr>
              <th>Family</th>
              <th>CMMC practice ID</th>
              <th>NIST 800-171 ID</th>
              <th>Practice title</th>
              <th>Finding to type</th>
              <th>N/A reason</th>
              <th>MFA coverage</th>
              <th>FIPS module</th>
            </tr>
          </thead>
          <tbody>
            {sheetRows.map((row) => (
              <tr key={row.reqId} className={row.exportable ? undefined : "unsatisfied"}>
                <td>
                  <span className="mono">{row.family}</span>
                  <div className="muted">{row.familyName}</div>
                </td>
                <td className="mono">{row.cmmcId}</td>
                <td className="mono">{row.reqId}</td>
                <td>{row.title}</td>
                <td>{row.findingNote}</td>
                <td>{row.naJustification || "—"}</td>
                <td>{row.mfaLabel}</td>
                <td>{row.fipsLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Affirming-official checklist</h2>
      <p className="helper">
        {CHECKLIST_PREFIX} Read-only projection of this pack. Red rows are not yet true. No signature capture.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Check</th>
              <th>What must be true</th>
              <th>Ready?</th>
              <th>Go to</th>
            </tr>
          </thead>
          <tbody>
            {checklist.map((row) => (
              <tr key={row.id} className={row.satisfied ? undefined : "unsatisfied"}>
                <td className="mono">{row.id}</td>
                <td>
                  {row.statement}
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
      </>
      )}
    </div>
  );
}
