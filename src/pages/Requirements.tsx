import { useMemo, useState } from "react";
import catalogFile from "../data/catalog.json";
import {
  applyNa,
  deriveFipsAoFinding,
  effectiveObjectives,
  rollupRequirement,
  type CatalogRequirement,
  type Finding,
} from "../lib/rollup.mjs";
import { useAssessment } from "../lib/store";
import type { Determination } from "../types";

const FAMILIES: { id: string; name: string }[] = [
  { id: "AC", name: "Access Control" },
  { id: "AT", name: "Awareness and Training" },
  { id: "AU", name: "Audit and Accountability" },
  { id: "CM", name: "Configuration Management" },
  { id: "IA", name: "Identification and Authentication" },
  { id: "IR", name: "Incident Response" },
  { id: "MA", name: "Maintenance" },
  { id: "MP", name: "Media Protection" },
  { id: "PS", name: "Personnel Security" },
  { id: "PE", name: "Physical Protection" },
  { id: "RA", name: "Risk Assessment" },
  { id: "CA", name: "Security Assessment" },
  { id: "SC", name: "System and Communications Protection" },
  { id: "SI", name: "System and Information Integrity" },
];

const FINDING_OPTIONS: { value: Finding; label: string }[] = [
  { value: "not-reviewed", label: "Unanswered" },
  { value: "met", label: "MET" },
  { value: "not-met", label: "NOT MET" },
  { value: "na", label: "N/A" },
];

const CATALOG = catalogFile.requirements as CatalogRequirement[];

function findingLabel(finding: Finding) {
  if (finding === "met") return "MET";
  if (finding === "not-met") return "NOT MET";
  if (finding === "na") return "N/A";
  return "not-reviewed";
}

function naMessage(reject: string) {
  if (reject === "na-not-allowed") return "N/A is not allowed on CA.L2-3.12.4.";
  return "N/A requires a justification.";
}

function emptyDet(req: CatalogRequirement): Determination {
  const det: Determination = {
    reqId: req.reqId,
    objectives: req.objectives.map((ao) => ({
      aoId: ao.aoId,
      finding: "not-reviewed",
      rationale: "",
      evidenceIds: [],
      assessedAt: null,
      assessedBy: null,
    })),
    finding: "not-reviewed",
    naJustification: "",
    implementationStub: "",
    owner: "",
    enduringException: false,
    sspCitation: "",
    temporaryDeficiency: false,
  };
  if (req.partialCredit?.kind === "fips") {
    det.fipsOverlay = { enc: "not-reviewed", fips: "not-reviewed" };
  }
  return det;
}

function mergeDet(req: CatalogRequirement, current: Determination | undefined): Determination {
  const base = emptyDet(req);
  const prev = current && typeof current === "object" ? current : base;
  const objectives = effectiveObjectives(req, prev).map((ao) => ({
    aoId: ao.aoId,
    finding: ao.finding,
    rationale: ao.rationale || "",
    evidenceIds: Array.isArray(ao.evidenceIds) ? ao.evidenceIds : [],
    assessedAt: ao.assessedAt ?? null,
    assessedBy: ao.assessedBy ?? null,
  }));
  return {
    ...base,
    ...prev,
    reqId: req.reqId,
    objectives,
    naJustification: prev.naJustification || "",
    implementationStub: prev.implementationStub || "",
    owner: prev.owner || "",
    enduringException: prev.enduringException === true,
    sspCitation: prev.sspCitation || "",
    temporaryDeficiency: prev.temporaryDeficiency === true,
    fipsOverlay: req.partialCredit?.kind === "fips" ? prev.fipsOverlay || base.fipsOverlay : prev.fipsOverlay,
  };
}

function wouldBeAllNa(objectives: { finding: Finding }[], overlay?: { enc: Finding; fips: Finding }) {
  const aosNa = objectives.length > 0 && objectives.every((ao) => ao.finding === "na");
  if (!overlay) return aosNa;
  return aosNa && overlay.enc === "na" && overlay.fips === "na";
}

function FindingSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: Finding;
  onChange: (v: Finding) => void;
  disabled?: boolean;
}) {
  return (
    <select
      id={id}
      aria-label={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Finding)}
    >
      {FINDING_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export default function Requirements() {
  const { assessment, score, setAssessment, readOnly } = useAssessment();
  const [family, setFamily] = useState("AC");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [naError, setNaError] = useState<string | null>(null);

  const familyReqs = useMemo(() => CATALOG.filter((row) => row.family === family), [family]);
  const selected = familyReqs.find((row) => row.reqId === selectedId) ?? null;
  const familyMeta = FAMILIES.find((row) => row.id === family);

  function derivedFinding(req: CatalogRequirement): Finding {
    return rollupRequirement(req, assessment.determinations[req.reqId], assessment.evidence, assessment.operationalPoas)
      .finding;
  }

  function patchDet(req: CatalogRequirement, next: Determination) {
    setNaError(null);
    setAssessment((a) => ({
      ...a,
      determinations: { ...a.determinations, [req.reqId]: next },
    }));
  }

  function currentDet(req: CatalogRequirement) {
    return mergeDet(req, assessment.determinations[req.reqId]);
  }

  function guardNa(req: CatalogRequirement, next: Determination) {
    const overlay = req.partialCredit?.kind === "fips" ? next.fipsOverlay : undefined;
    if (!wouldBeAllNa(next.objectives, overlay) && next.finding !== "na") return { ok: true as const };
    const check = applyNa(req, next.naJustification);
    if (!check.ok) return { ok: false as const, reject: check.reject };
    return { ok: true as const };
  }

  function setAoFinding(req: CatalogRequirement, aoId: string, finding: Finding) {
    const current = currentDet(req);
    const next: Determination = {
      ...current,
      finding: "not-reviewed",
      objectives: current.objectives.map((ao) => (ao.aoId === aoId ? { ...ao, finding } : ao)),
    };
    const gated = guardNa(req, next);
    if (!gated.ok) {
      setNaError(naMessage(gated.reject));
      return;
    }
    patchDet(req, next);
  }

  function setAoRationale(req: CatalogRequirement, aoId: string, rationale: string) {
    const current = currentDet(req);
    patchDet(req, {
      ...current,
      objectives: current.objectives.map((ao) => (ao.aoId === aoId ? { ...ao, rationale } : ao)),
    });
  }

  function setOverlay(req: CatalogRequirement, key: "enc" | "fips", finding: Finding) {
    const current = currentDet(req);
    const overlay = { enc: current.fipsOverlay?.enc ?? "not-reviewed", fips: current.fipsOverlay?.fips ?? "not-reviewed", [key]: finding };
    const derived = deriveFipsAoFinding(overlay);
    const next: Determination = {
      ...current,
      finding: "not-reviewed",
      fipsOverlay: overlay,
      objectives: current.objectives.map((ao) =>
        ao.aoId.endsWith("[a]") || ao.aoId === "3.13.11[a]" ? { ...ao, finding: derived } : ao,
      ),
    };
    const gated = guardNa(req, next);
    if (!gated.ok) {
      setNaError(naMessage(gated.reject));
      return;
    }
    patchDet(req, next);
  }

  function setNaJustification(req: CatalogRequirement, naJustification: string) {
    patchDet(req, { ...currentDet(req), naJustification });
  }

  function markRequirementNa(req: CatalogRequirement) {
    const current = currentDet(req);
    const check = applyNa(req, current.naJustification);
    if (!check.ok) {
      setNaError(naMessage(check.reject));
      return;
    }
    patchDet(req, {
      ...current,
      finding: "na",
      objectives: current.objectives.map((ao) => ({ ...ao, finding: "na" })),
      ...(req.partialCredit?.kind === "fips" ? { fipsOverlay: { enc: "na" as const, fips: "na" as const } } : {}),
    });
  }

  return (
    <div>
      <div className="kicker">Requirements · 171A objectives</div>
      <h1>Requirements</h1>
      <p>
        Findings are per assessment objective. The requirement row is a derived roll-up — you cannot mark a
        requirement MET directly. Requirement N/A needs <span className="mono">naAllowed</span> and a justification.
        MET without evidence stays not-reviewed until the evidence PR. SAMPLE data only.
      </p>

      <div className="family-tabs" role="tablist" aria-label="Requirement families">
        {FAMILIES.map((row) => (
          <button
            key={row.id}
            type="button"
            role="tab"
            aria-selected={family === row.id}
            className={family === row.id ? "active" : ""}
            onClick={() => {
              setFamily(row.id);
              setSelectedId(null);
              setNaError(null);
            }}
          >
            {row.id}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>
          {family} · {familyMeta?.name}
        </h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          {familyReqs.length} requirements. Live score {score ? `${score.raw}/110` : "—"}.
        </p>
      </div>

      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Title</th>
            <th>Weight</th>
            <th>Finding</th>
          </tr>
        </thead>
        <tbody>
          {familyReqs.map((req) => {
            const finding = derivedFinding(req);
            const openObj = req.partialCredit ? "Open Objectives" : "";
            return (
              <tr
                key={req.reqId}
                className={`clickable${selectedId === req.reqId ? " selected" : ""}`}
                onClick={() => {
                  setSelectedId(req.reqId);
                  setNaError(null);
                }}
              >
                <td className="mono">
                  {req.cmmcId}
                  {openObj ? (
                    <>
                      <br />
                      <span className="pill info">{openObj}</span>
                    </>
                  ) : null}
                </td>
                <td>{req.title}</td>
                <td>{req.weight}</td>
                <td>
                  <span className={`pill ${finding}`}>{findingLabel(finding)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {selected ? (
        <RequirementDetail
          req={selected}
          det={currentDet(selected)}
          derived={derivedFinding(selected)}
          naError={naError}
          readOnly={readOnly}
          onAoFinding={setAoFinding}
          onAoRationale={setAoRationale}
          onOverlay={setOverlay}
          onNaJustification={setNaJustification}
          onMarkNa={markRequirementNa}
        />
      ) : (
        <p className="muted">Select a requirement to assess its 171A objectives.</p>
      )}
    </div>
  );
}

function RequirementDetail({
  req,
  det,
  derived,
  naError,
  readOnly,
  onAoFinding,
  onAoRationale,
  onOverlay,
  onNaJustification,
  onMarkNa,
}: {
  req: CatalogRequirement;
  det: Determination;
  derived: Finding;
  naError: string | null;
  readOnly: boolean;
  onAoFinding: (req: CatalogRequirement, aoId: string, finding: Finding) => void;
  onAoRationale: (req: CatalogRequirement, aoId: string, rationale: string) => void;
  onOverlay: (req: CatalogRequirement, key: "enc" | "fips", finding: Finding) => void;
  onNaJustification: (req: CatalogRequirement, value: string) => void;
  onMarkNa: (req: CatalogRequirement) => void;
}) {
  const fips = req.partialCredit?.kind === "fips";
  const mfa = req.partialCredit?.kind === "mfa";
  const overlays = req.partialCredit?.overlayObjectives || [];
  const derivedA = fips ? deriveFipsAoFinding(det.fipsOverlay) : null;

  return (
    <fieldset className="stack" disabled={readOnly} style={{ marginTop: 16 }}>
      <div className="card">
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="pill">{req.cmmcId}</span>
          <span className={`pill ${derived}`}>{findingLabel(derived)}</span>
          <span className="pill">{req.basicOrDerived}</span>
          <span className="pill">weight {req.weight}</span>
          {mfa || fips ? <span className="pill info">Open Objectives</span> : null}
        </div>
        <h2>{req.title}</h2>
        <p>{req.statement}</p>
        <p className="muted">
          Requirement finding is derived. Do not mark MET here. Evidence on 171A letters is required before a MET
          roll-up will stick.
        </p>

        {fips ? (
          <div>
            <h3>Open Objectives · 3.13.11 overlays</h3>
            <p className="muted">
              Edit encryption / FIPS-validated only. 171A [a] is derived and read-only. Overlay keys are not catalog
              objectives and do not need evidence.
            </p>
            {overlays.map((overlay) => (
              <div key={overlay.key} className="ao-block">
                <h3 className="mono">{overlay.key}</h3>
                <p className="muted">Determine if: {overlay.determineIf}</p>
                <div style={{ maxWidth: 160 }}>
                  <FindingSelect
                    id={`overlay-${overlay.key}`}
                    value={det.fipsOverlay?.[overlay.key] ?? "not-reviewed"}
                    onChange={(v) => onOverlay(req, overlay.key, v)}
                  />
                </div>
              </div>
            ))}
            <div className="ao-block">
              <h3 className="mono">3.13.11[a] · derived</h3>
              <p className="muted">Determine if: {req.objectives[0]?.determineIf}</p>
              <span className={`pill ${derivedA || "not-reviewed"}`}>{findingLabel(derivedA || "not-reviewed")}</span>
              <div className="helper">Read-only. Derived from enc / fips overlays.</div>
            </div>
          </div>
        ) : (
          <div>
            <h3>{mfa ? "Open Objectives · 3.5.3 letters a–d" : "Assessment objectives"}</h3>
            {mfa ? (
              <p className="muted">
                MFA letters [a] privileged accounts; [b] MFA local privileged; [c] MFA network privileged; [d] MFA
                network non-privileged. Partial credit is derived — not a score-API enum.
              </p>
            ) : null}
            {effectiveObjectives(req, det).map((ao) => (
              <div key={ao.aoId} className="ao-block">
                <h3 className="mono">
                  {ao.aoId} [{ao.letter}]
                </h3>
                <p className="muted">Determine if: {req.objectives.find((row) => row.aoId === ao.aoId)?.determineIf}</p>
                <div className="finding-row">
                  <FindingSelect
                    id={`ao-${ao.aoId}`}
                    value={ao.finding}
                    onChange={(v) => onAoFinding(req, ao.aoId, v)}
                  />
                  <div>
                    <label htmlFor={`rationale-${ao.aoId}`}>Rationale</label>
                    <textarea
                      id={`rationale-${ao.aoId}`}
                      value={ao.rationale || ""}
                      onChange={(e) => onAoRationale(req, ao.aoId, e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <h3>Requirement N/A</h3>
        <p className="muted">
          Sets every objective to N/A. Allowed only when the catalog says <span className="mono">naAllowed</span> and
          a justification is filled. {req.naAllowed ? "" : "This requirement cannot be N/A."}
        </p>
        <label htmlFor={`na-${req.reqId}`}>N/A justification</label>
        <textarea
          id={`na-${req.reqId}`}
          value={det.naJustification}
          onChange={(e) => onNaJustification(req, e.target.value)}
          placeholder="Required to mark this requirement N/A."
        />
        {naError ? (
          <div className="banner warn">
            <div>
              <strong>N/A rejected.</strong> {naError}
            </div>
          </div>
        ) : null}
        <button type="button" disabled={!req.naAllowed} onClick={() => onMarkNa(req)}>
          Mark requirement N/A
        </button>
      </div>
    </fieldset>
  );
}
