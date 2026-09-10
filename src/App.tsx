import { NavLink, Route, Routes } from "react-router-dom";
import { useAssessment } from "./lib/store";
import Home from "./pages/Home";
import Scope from "./pages/Scope";
import Assets from "./pages/Assets";
import Requirements from "./pages/Requirements";
import Evidence from "./pages/Evidence";
import Ssp from "./pages/Ssp";
import Poam from "./pages/Poam";
import ExportPage from "./pages/Export";

const links = [
  ["/", "Home"],
  ["/scope", "Scope"],
  ["/assets", "Assets"],
  ["/requirements", "Requirements"],
  ["/evidence", "Evidence"],
  ["/ssp", "SSP"],
  ["/poam", "POA&M"],
  ["/export", "Export"],
] as const;

export default function App() {
  const { assessment, loading, saving, lastSaved, error } = useAssessment();

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
          <strong>Evidence Bench</strong>
          <span>CMMC L2 Self prep</span>
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
            {saving ? "Saving…" : lastSaved ? `Saved ${lastSaved}` : "Local encrypted store"}
          </div>
          {error ? <div style={{ color: "var(--red)", marginTop: 6 }}>{error}</div> : null}
        </div>
      </aside>
      <main className="main">
        <div className="banner">
          <div>
            <div className="chrome-marks">
              <span className="pill">UNCLASSIFIED</span>
              <span className="pill">SAMPLE</span>
              <span className="pill">Not a SPRS submission</span>
              <span className="pill info">scoring in a later PR</span>
            </div>
            <strong>UNCLASSIFIED · SAMPLE · Not a SPRS submission.</strong> Fictional seed only. Castleridge
            Solutions is Hawaiʻi-based. This app does not submit, sign, or affirm. Not a C3PAO tool.
          </div>
        </div>
        <Routes>
          <Route path="/" element={<Home />} />
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
