import { Link } from "react-router-dom";
import { scopeBlockers } from "../lib/scope.mjs";
import { useAssessment } from "../lib/store";

export default function Home() {
  const { assessment, loadSample } = useAssessment();
  const org = assessment.organization;
  const blockers = scopeBlockers(assessment);
  const block = blockers.filter((b) => b.severity === "blocker");
  const warn = blockers.filter((b) => b.severity === "warning");
  const info = blockers.filter((b) => b.severity === "info");
  const official = org.affirmingOfficial;

  return (
    <div>
      <div className="kicker">Home · readiness</div>
      <h1>{org.name}</h1>
      <p>
        Fictional CMMC Level 2 (Self) prep package. Sample data only. Scoring, catalog, and export arrive in later
        PRs.
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
          <div className="muted">{assessment.assets.length} assets · {assessment.flows.length} CUI flows</div>
        </div>
        <div className="card kpi">
          <div className="label">Score</div>
          <div className="value" style={{ fontSize: "1.05rem" }}>
            later PR
          </div>
          <div className="muted">No live SPRS math yet</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Identity</h2>
        <p>
          {org.fictional ? "Fictional organization." : "Unexpected non-sample org."} Affirming official (local prep
          only, not a PIEE identity): {official?.name || "unset"} · {official?.title || "no title"}
        </p>
      </div>

      <h2>Scope-graph blockers</h2>
      <p>Graph checks only (OOS on an in-boundary flow, missing justifications). Not a SPRS score.</p>
      <div className="list">
        {blockers.length === 0 ? (
          <div className="card">No scope-graph blockers on the current assets and flows.</div>
        ) : (
          [...block, ...warn, ...info].map((b) => (
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
