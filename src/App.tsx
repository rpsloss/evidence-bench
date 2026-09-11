import { NavLink, Route, Routes } from "react-router-dom";
import { BrandMark } from "./components/BrandMark";
import { levelLabel, normalizeEngagement } from "./lib/engagement.mjs";
import { useAssessment } from "./lib/store";
import type { CmmcStatus } from "./types";
import Home from "./pages/Home";
import Intake from "./pages/Intake";
import Scope from "./pages/Scope";
import Assets from "./pages/Assets";
import Requirements from "./pages/Requirements";
import Evidence from "./pages/Evidence";
import Ssp from "./pages/Ssp";
import Poam from "./pages/Poam";
import ExportPage from "./pages/Export";

function statusLabel(status: CmmcStatus | undefined) {
  if (status === "final-l2-self") return "Final";
  if (status === "conditional-l2-self") return "Conditional";
  if (status === "no-cmmc-status") return "No Status";
  return "Incomplete";
}

function statusClass(status: CmmcStatus | undefined) {
  if (status === "final-l2-self") return "ok";
  if (status === "conditional-l2-self") return "warning";
  if (status === "no-cmmc-status") return "blocker";
  return "info";
}

const links = [
  ["/", "Home"],
  ["/intake", "Intake"],
  ["/scope", "Scope"],
  ["/assets", "Assets"],
  ["/requirements", "Requirements"],
  ["/evidence", "Evidence"],
  ["/ssp", "SSP"],
  ["/poam", "POA&M"],
  ["/export", "Export"],
] as const;

export default function App() {
  const { assessment, score, l1Score, loading, saving, lastSaved, error, warnings, readOnly } = useAssessment();
  const engagement = normalizeEngagement(assessment.engagement);
  const workingL1 = engagement.workingLevel === "level-1-self";

  if (loading) {
    return (
      <div className="main">
        <p>Loading assessment from local disk…</p>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="nav">
        <div className="brand">
          <div className="brand-lockup">
            <BrandMark />
            <div>
              <span className="brand-org">Castleridge</span>
              <strong>Evidence Bench</strong>
              <span>{levelLabel(engagement.workingLevel)} prep</span>
            </div>
          </div>
        </div>
        {links.map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) => `item${isActive ? " active" : ""}`}
          >
            {label}
          </NavLink>
        ))}
        <div className="meta">
          <div>
            SoR: <b>SPRS (human entry)</b>
          </div>
          <div>Not a SPRS submission</div>
          <div className="mono" style={{ marginTop: 8 }}>
            {assessment.organization.name} · CAGE {assessment.organization.cage}
          </div>
          <div style={{ marginTop: 8 }}>
            {readOnly
              ? "Read-only (load failed)"
              : saving
                ? "Saving…"
                : lastSaved
                  ? `Saved ${lastSaved}`
                  : "Local encrypted store"}
          </div>
          {error ? <div style={{ color: "var(--red)", marginTop: 6 }}>{error}</div> : null}
          {warnings.length > 0 ? (
            <div style={{ color: "var(--amber)", marginTop: 6 }}>
              {warnings.map((w) => w.message).join(" ")}
            </div>
          ) : null}
        </div>
      </aside>
      <main className="main">
        <div className="banner">
          <div>
            <div className="chrome-marks">
              <span className="pill">UNCLASSIFIED</span>
              <span className="pill">SAMPLE</span>
              <span className="pill">Not a SPRS submission</span>
              <span className="pill">{levelLabel(engagement.workingLevel)}</span>
              {workingL1 ? (
                <>
                  <span className="pill">
                    {l1Score.met}/{l1Score.total} MET
                  </span>
                  <span className={`pill ${l1Score.status === "final-l1-self" ? "ok" : l1Score.status === "not-met" ? "blocker" : "info"}`}>
                    {l1Score.complianceResult || "Incomplete"}
                  </span>
                </>
              ) : (
                <>
                  <span className="pill">{score ? `${score.raw}/110` : "—"}</span>
                  <span className={`pill ${statusClass(score?.status)}`}>{statusLabel(score?.status)}</span>
                </>
              )}
            </div>
            <strong>UNCLASSIFIED · SAMPLE · Not a SPRS submission.</strong> Fictional seed only. Castleridge
            Solutions is Hawaiʻi-based. This app does not submit, sign, or affirm. Not a C3PAO tool.
          </div>
        </div>
        {readOnly ? (
          <div className="banner conflict">
            <div>
              <strong>On-disk assessment is unreadable.</strong> Editing is disabled so a sample cannot overwrite
              ciphertext. Use Reload Harbor Precision seed to replace it, or restore the local key.
            </div>
          </div>
        ) : null}
        {warnings.length > 0 ? (
          <div className="banner warn">
            <div>
              <strong>Filename warning.</strong> {warnings.map((w) => w.message).join(" ")}
            </div>
          </div>
        ) : null}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/intake" element={<Intake />} />
          <Route path="/scope" element={<Scope />} />
          <Route path="/assets" element={<Assets />} />
          <Route path="/requirements" element={<Requirements />} />
          <Route path="/evidence" element={<Evidence />} />
          <Route path="/ssp" element={<Ssp />} />
          <Route path="/poam" element={<Poam />} />
          <Route path="/export" element={<ExportPage />} />
        </Routes>
        <p className="footer-note">
          Unclassified sample data. Fake CAGE XXXXX. Pointers only — no CUI blobs. NIST SP 800-171 Revision 2.
          Affirmation is a named official’s act in SPRS / PIEE, not in this app.
        </p>
      </main>
    </div>
  );
}
