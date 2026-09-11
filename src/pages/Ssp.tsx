import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { scopeBlockers } from "../lib/scope.mjs";
import { generateSspOutline, scopeGraphHash, sspWarnings } from "../lib/sspGenerate.mjs";
import { useAssessment } from "../lib/store";
import type { SspSection } from "../types";
import WorkingLevelNote from "../components/WorkingLevelNote";

function isReqKey(key: string) {
  return key.startsWith("req:");
}

function SectionEditor({
  row,
  tall,
  onChange,
}: {
  row: SspSection;
  tall?: boolean;
  onChange: (key: string, body: string) => void;
}) {
  const gate = row.key === "req:3.12.4";
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <h3>{row.title}</h3>
      <p className="helper">{gate ? "Incomplete-assessment gate. SAMPLE only." : "Generated stub. SAMPLE only. Not CUI."}</p>
      <textarea
        className={tall ? "tall" : undefined}
        value={row.body}
        onChange={(e) => onChange(row.key, e.target.value)}
      />
    </div>
  );
}

export default function Ssp() {
  const { assessment, score, setAssessment, readOnly } = useAssessment();
  const [selReq, setSelReq] = useState("req:3.1.1");
  const [filter, setFilter] = useState("");
  const graph = useMemo(() => scopeBlockers(assessment), [assessment]);
  const warnings = useMemo(() => sspWarnings(assessment), [assessment]);
  const core = assessment.ssp.filter((row) => !isReqKey(row.key));
  const reqs = assessment.ssp.filter((row) => isReqKey(row.key) && row.key !== "req:3.12.4");
  const gate = assessment.ssp.find((row) => row.key === "req:3.12.4");
  const query = filter.trim().toLowerCase();
  const shownReqs = query
    ? reqs.filter((row) => `${row.key} ${row.title}`.toLowerCase().includes(query))
    : reqs;
  const selected = reqs.find((row) => row.key === selReq) ?? shownReqs[0] ?? null;
  const empty = assessment.ssp.length === 0;
  const sspMissing = score ? !score.sspPresent : true;
  const hardGraph = graph.filter((row) => row.severity === "blocker");
  const graphWarn = graph.filter((row) => row.severity !== "blocker");

  function generate() {
    if (!empty) {
      const ok = window.confirm(
        "Regenerate the SSP outline from current scope, assets, and flows? This replaces all section bodies, including the 3.12.4 gate and edited requirement stubs.",
      );
      if (!ok) return;
    }
    setAssessment((a) => ({ ...a, ssp: generateSspOutline(a) }));
  }

  function patchBody(key: string, body: string) {
    setAssessment((a) => {
      const hash = scopeGraphHash(a);
      const scopeRelated = !isReqKey(key);
      return {
        ...a,
        ssp: a.ssp.map((row) => {
          if (row.key === key) return { ...row, body, generatedFrom: hash };
          // Editing a core/scope stub also acknowledges the current graph on boundary.
          if (scopeRelated && row.key === "boundary" && key !== "boundary") {
            return { ...row, generatedFrom: hash };
          }
          return row;
        }),
      };
    });
  }

  return (
    <div>
      <div className="kicker">SSP · living stubs</div>
      <h1>System Security Plan</h1>
      <WorkingLevelNote />
      <p>
        Outline generated from Assessment Scope, assets, CUI flows, and determination stubs. Hard blockers are graph
        only. Stale hash is a warning — the app does not NLP-compare stub text to the boundary. SAMPLE data only. Not a
        SPRS submission.
      </p>

      {sspMissing ? (
        <div className="banner conflict">
          <div>
            <strong>3.12.4 body is empty.</strong> SSP missing or empty. 32 CFR 170.24: an assessment cannot be
            completed without an SSP. Not a SPRS score. Harbor seed includes a body so this gate can be demonstrated by
            clearing it.
          </div>
        </div>
      ) : null}

      {hardGraph.map((row) => (
        <div key={row.id} className="banner conflict">
          <div>
            <strong>{row.title}.</strong> {row.detail} <Link to={row.href}>Open</Link>
            {row.citation ? ` · ${row.citation}` : ""}
          </div>
        </div>
      ))}

      {[...graphWarn, ...warnings].map((row) => (
        <div key={row.id} className="banner warn">
          <div>
            <strong>{row.title}.</strong> {row.detail}
          </div>
        </div>
      ))}

      <fieldset className="stack" disabled={readOnly}>
        <div className="row">
          <button type="button" className="primary" onClick={generate}>
            {empty ? "Generate outline" : "Regenerate"}
          </button>
          <span className="muted">
            {score?.sspPresent ? "3.12.4 body present" : "3.12.4 body empty"}
            {score ? ` · ${score.raw}/110` : ""}
          </span>
        </div>

        {empty ? (
          <div className="card">
            <p>No SSP sections yet. Generate from the current scope, assets, flows, and determination stubs.</p>
          </div>
        ) : (
          <>
            <h2>CA.L2-3.12.4 body</h2>
            <p className="helper">
              This body is the incomplete-assessment gate. Other outline sections do not substitute while this section
              exists. Emptying it marks the assessment incomplete.
            </p>
            {gate ? <SectionEditor row={gate} tall onChange={patchBody} /> : <div className="card">Missing req:3.12.4 section. Regenerate.</div>}

            <h2>Outline</h2>
            {core.map((row) => (
              <SectionEditor key={row.id} row={row} onChange={patchBody} />
            ))}

            <h2>Requirement stubs ({reqs.length})</h2>
            <p className="helper">Determination stubs projected into req:* sections. SAMPLE only. Not CUI.</p>
            <label>Filter</label>
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="req id or title" />
            <div className="split">
              <div className="card" style={{ overflow: "auto", maxHeight: 480 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownReqs.map((row) => (
                      <tr
                        key={row.id}
                        className={`clickable${selected?.key === row.key ? " selected" : ""}`}
                        onClick={() => setSelReq(row.key)}
                      >
                        <td className="mono">{row.key}</td>
                        <td>
                          {row.title}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div>{selected ? <SectionEditor row={selected} tall onChange={patchBody} /> : <div className="card">Select a requirement stub.</div>}</div>
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}
