import { Link } from "react-router-dom";
import { combinedBlockers, topBlockers } from "../lib/blockers.mjs";
import { useAssessment } from "../lib/store";
import type { CmmcStatus } from "../types";

function statusLabel(status: CmmcStatus | undefined) {
  if (status === "final-l2-self") return "Final";
  if (status === "conditional-l2-self") return "Conditional";
  if (status === "no-cmmc-status") return "No Status";
  return "Incomplete";
}

export default function Home() {
  const { assessment, score, loadSample } = useAssessment();
  const org = assessment.organization;
  const chips = topBlockers(assessment, score, 5);
  const all = combinedBlockers(assessment, score);
  const official = org.affirmingOfficial;
  const incomplete = !score || score.status === "assessment-incomplete";

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
