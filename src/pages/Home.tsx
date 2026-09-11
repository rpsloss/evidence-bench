import { Link } from "react-router-dom";
import { combinedBlockers, topBlockers } from "../lib/blockers.mjs";
import {
  engagementNextAction,
  informationLabel,
  isWorkingLevel1,
  levelLabel,
  normalizeEngagement,
  phaseLabel,
  uniqueCages,
} from "../lib/engagement.mjs";
import {
  allFamiliesReviewed,
  familyReviewRows,
  reviewedFamilyCount,
} from "../lib/familyReview.mjs";
import {
  assemblerPunchList,
  completionLabel,
  familyProgressBoard,
  familyWorkCaption,
  punchListHomeItems,
} from "../lib/familyProgress.mjs";
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
  const board = familyProgressBoard(assessment);
  const punch = assemblerPunchList(assessment);
  const punchItems = punchListHomeItems(punch);
  const engagement = normalizeEngagement(assessment.engagement);
  const next = engagementNextAction(engagement, board.next);
  const workingL1 = isWorkingLevel1(engagement);
  const cages = uniqueCages(org, engagement);

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
      <div className="kicker">Home · engagement</div>
      <h1>{org.name}</h1>
      <p>
        Fictional Castleridge engagement. Sample data only. Not a SPRS submission. Level follows FCI vs CUI, not
        headcount. Live L2 score is local math from the 110 catalog — SPRS remains the system of record via human
        entry.
      </p>
      <div className="row">
        <Link className="btn primary" to={next.href}>
          {next.title}
        </Link>
        <Link className="btn" to="/intake">
          Intake
        </Link>
        <button type="button" onClick={loadSample}>
          Reload Harbor Precision seed
        </button>
        <Link className="btn" to="/export">
          Export
        </Link>
        {!workingL1 ? (
          <Link className="btn" to={board.next.href}>
            {board.next.title}
          </Link>
        ) : null}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Engagement</h2>
        <p>
          {next.detail} Consultant work starts at intake. The assembler board below is Level 2 tooling
          {workingL1 ? " and is parked while this engagement is on Level 1" : ""}.
        </p>
        <div className="grid kpi" style={{ marginBottom: 12 }}>
          <div className="card kpi">
            <div className="label">Information</div>
            <div className="value" style={{ fontSize: "1.25rem" }}>
              {informationLabel(engagement.informationType)}
            </div>
            <div className="muted">Not company size</div>
          </div>
          <div className="card kpi">
            <div className="label">Required status</div>
            <div className="value" style={{ fontSize: "1.25rem" }}>
              {levelLabel(engagement.requiredLevel)}
            </div>
            <div className="muted">Working {levelLabel(engagement.workingLevel)}</div>
          </div>
          <div className="card kpi">
            <div className="label">Phase</div>
            <div className="value" style={{ fontSize: "1.25rem" }}>{phaseLabel(engagement.currentPhase)}</div>
            <div className="muted">{engagement.intakeNotedAt ? "Intake confirmed" : "Intake open"}</div>
          </div>
          <div className="card kpi">
            <div className="label">CAGEs</div>
            <div className="value" style={{ fontSize: "1.25rem" }}>{cages.length}</div>
            <div className="muted">{cages.join(" · ") || "unset"}</div>
          </div>
        </div>
        {workingL1 ? (
          <div className="banner warn" style={{ marginBottom: 0 }}>
            <div>
              <strong>Level 1 catalog is the next slice.</strong> Do not treat the 110-practice board as Level 1.
              POA&M is not permitted on a Level 1 self-assessment (32 CFR 170.21(a)(1)).
            </div>
          </div>
        ) : null}
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

      {!workingL1 ? (
      <>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Assembler board</h2>
        <p>
          Completion is unfinished, partial, gapped, or present — not a SPRS finding. {board.next.detail} Consultant
          review is a separate flag.
        </p>
        <div className="grid kpi" style={{ marginBottom: 12 }}>
          <div className="card kpi">
            <div className="label">Present</div>
            <div className="value">{board.counts.present}</div>
          </div>
          <div className="card kpi">
            <div className="label">Partial</div>
            <div className="value">{board.counts.partial}</div>
          </div>
          <div className="card kpi">
            <div className="label">Gapped</div>
            <div className="value">{board.counts.gapped}</div>
          </div>
          <div className="card kpi">
            <div className="label">Unfinished</div>
            <div className="value">{board.counts.unfinished}</div>
          </div>
        </div>
        <div className="grid families">
          {board.families.map((row) => (
            <Link
              key={row.family}
              className={`family-cell ${row.completion}`}
              to={`/requirements?family=${row.family}`}
            >
              <span className="mono">{row.family}</span>
              <span className={`pill ${row.completion === "present" ? "ok" : row.completion === "partial" ? "info" : row.completion === "gapped" ? "warning" : "blocker"}`}>
                {completionLabel(row.completion)}
              </span>
              <span className="muted">{familyWorkCaption(row)}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Punch list</h2>
        <p>
          Remaining assembler work for the AO/SCA. Not a SPRS finding. Consultant reviews stay in the table below.
          Stale pointers are freshness warnings — they do not break MET.
        </p>
        <div className="grid kpi" style={{ marginBottom: 12 }}>
          <div className="card kpi">
            <div className="label">Unanswered</div>
            <div className="value">{punch.counts.unansweredAos}</div>
          </div>
          <div className="card kpi">
            <div className="label">Missing pointers</div>
            <div className="value">{punch.counts.missingPointers}</div>
          </div>
          <div className="card kpi">
            <div className="label">Missing POA&M</div>
            <div className="value">{punch.counts.missingPoams}</div>
          </div>
          <div className="card kpi">
            <div className="label">Evidence warnings</div>
            <div className="value">{punch.counts.warnings}</div>
          </div>
        </div>
        {punch.counts.work === 0 ? (
          <p className="helper">
            Family work is present. Remaining: {punch.counts.openReviews} consultant review
            {punch.counts.openReviews === 1 ? "" : "s"}
            {punch.counts.warnings ? ` and ${punch.counts.warnings} evidence warning${punch.counts.warnings === 1 ? "" : "s"}` : ""}.
          </p>
        ) : null}
        <div className="list">
          {punchItems.length === 0 ? (
            <div className="card">Punch list is empty. Mark Export-ready, then type CSV into SPRS by hand.</div>
          ) : (
            punchItems.map((row) => (
              <Link key={row.id} className="blocker-item" to={row.href}>
                <span className={`pill ${row.severity}`}>{row.kind}</span>
                <h3>{row.title}</h3>
                <div className="muted">{row.detail}</div>
              </Link>
            ))
          )}
        </div>
      </div>
      </>
      ) : null}

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
