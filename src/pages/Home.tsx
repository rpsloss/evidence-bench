import { Link } from "react-router-dom";
import { combinedBlockers, topBlockers } from "../lib/blockers.mjs";
import {
  allFamiliesReviewed,
  familyReviewRows,
  reviewedFamilyCount,
} from "../lib/familyReview.mjs";
import { useAssessment } from "../lib/store";
import type { CmmcStatus } from "../types";

function statusLabel(status: CmmcStatus | undefined) {
  if (status === "final-l2-self") return "Final";
  if (status === "conditional-l2-self") return "Conditional";
  if (status === "no-cmmc-status") return "No Status";
  return "Incomplete";
}

function when(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

export default function Home() {
  const { assessment, score, loadSample, setAssessment, readOnly } = useAssessment();
  const org = assessment.organization;
  const chips = topBlockers(assessment, score, 5);
  const all = combinedBlockers(assessment, score);
  const official = org.affirmingOfficial;
  const incomplete = !score || score.status === "assessment-incomplete";
  const reviews = familyReviewRows(assessment.familyReviews);
  const reviewedCount = reviewedFamilyCount(assessment.familyReviews);
  const allReviewed = allFamiliesReviewed(assessment.familyReviews);
  const remaining = reviews.length - reviewedCount;
  const prepReady = allReviewed && Boolean(assessment.prepMarkedAt);

  function markPrep() {
    setAssessment((a) => {
      if (!allFamiliesReviewed(a.familyReviews)) return a;
      return { ...a, prepMarkedAt: new Date().toISOString() };
    });
  }

  function clearPrep() {
    setAssessment((a) => ({ ...a, prepMarkedAt: null }));
  }

  return (
    <div>
      <div className="kicker">Home · readiness</div>
      <h1>{org.name}</h1>
      <p>
        Fictional CMMC Level 2 (Self) prep package. Sample data only. Not a SPRS submission. Live score is local
        math from the catalog — SPRS remains the system of record via human entry.
      </p>
      <div className="row">
        <Link className="btn primary" to="/scope">
          Resume
        </Link>
        <button type="button" onClick={loadSample}>
          Reload Harbor Precision seed
        </button>
        <Link className="btn" to="/export">
          Export
        </Link>
      </div>
      <div className="grid kpi">
        <div className="card kpi">
          <div className="label">CAGE</div>
          <div className="value">{org.cage}</div>
          <div className="muted">Fake seed. Not Castleridge.</div>
        </div>
        <div className="card kpi">
          <div className="label">Employees</div>
          <div className="value">{org.employeeCount ?? "—"}</div>
          <div className="muted">Scope default is Enclave</div>
        </div>
        <div className="card kpi">
          <div className="label">Assessment Scope</div>
          <div className="value" style={{ fontSize: "1.25rem" }}>
            {assessment.scope.kind === "enclave" ? "Enclave" : "Enterprise"}
          </div>
          <div className="muted">
            {assessment.assets.length} assets · {assessment.flows.length} CUI flows
          </div>
        </div>
        <div className="card kpi">
          <div className="label">Score</div>
          <div className="value">{score ? score.raw : "—"}</div>
          <div className="muted">
            {statusLabel(score?.status)} · max 110
            {incomplete ? " · not a SPRS score" : ""}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Identity</h2>
        <p>
          {org.fictional ? "Fictional organization." : "Unexpected non-sample org."} Affirming official (local prep
          only, not a PIEE identity): {official?.name || "unset"} · {official?.title || "no title"}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Consultant family reviews</h2>
        <p>
          {reviewedCount} of 14 families reviewed. All 14 are required before Export-ready. These flags do not
          submit, affirm, or call SPRS. OSA may still open other screens.
        </p>
        <table>
          <thead>
            <tr>
              <th>Family</th>
              <th>Status</th>
              <th>Reviewer</th>
              <th>When</th>
            </tr>
          </thead>
          <tbody>
            {reviews.map((row) => (
              <tr key={row.family}>
                <td>
                  <span className="mono">{row.family}</span> · {row.name}
                </td>
                <td>
                  <span className={`pill ${row.reviewed ? "ok" : "warning"}`}>
                    {row.reviewed ? "Reviewed" : "Not reviewed"}
                  </span>
                </td>
                <td>{row.reviewer.trim() || "—"}</td>
                <td className="muted">{when(row.reviewedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: 12 }}>
          {prepReady
            ? `Local Export-ready ${when(assessment.prepMarkedAt)}. Not a CMMC Status Date. Not a SPRS submission.`
            : allReviewed
              ? "All 14 families reviewed. You may mark this pack ready to type into SPRS. That stamp is local prep only."
              : `Not ready to type into SPRS. ${remaining} of 14 families still need a consultant review.`}
        </p>
        <div className="row" style={{ marginBottom: 0 }}>
          <button type="button" className="primary" disabled={readOnly || !allReviewed} onClick={markPrep}>
            Mark ready to type into SPRS
          </button>
          <button type="button" disabled={readOnly || !assessment.prepMarkedAt} onClick={clearPrep}>
            Clear Export-ready flag
          </button>
          <Link className="btn" to="/requirements">
            Open Requirements
          </Link>
        </div>
      </div>

      <h2>Top blockers</h2>
      <p>
        Score chips plus scope-graph chips. MET needs a non-draft, non-interview URI pointer per 171A objective.
        {all.length > chips.length ? ` Showing 5 of ${all.length}.` : ""}
      </p>
      <div className="list">
        {chips.length === 0 ? (
          <div className="card">No blockers on the current pack.</div>
        ) : (
          chips.map((b) => (
            <Link key={b.id} className="blocker-item" to={b.href}>
              <span className={`pill ${b.severity}`}>{b.severity}</span>
              <h3>{b.title}</h3>
              <div className="muted">{b.detail}</div>
              {b.citation ? <div className="muted">{b.citation}</div> : null}
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
