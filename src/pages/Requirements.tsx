import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import catalogFile from "../data/catalog.json";
import {
  FAMILIES,
  allFamiliesReviewed,
  reviewForFamily,
  upsertFamilyReview,
} from "../lib/familyReview.mjs";
import { completionLabel, familyProgressRows } from "../lib/familyProgress.mjs";
import {
  deriveFipsAoFinding,
  effectiveObjectives,
  evidenceCoversAo,
  guardNaWrite,
  rollupRequirement,
  type CatalogRequirement,
  type Finding,
} from "../lib/rollup.mjs";
import { useAssessment } from "../lib/store";
import type { Determination, EvidenceItem, FamilyReview } from "../types";

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

function PointerHelper({
  aoId,
  finding,
  evidence,
}: {
  aoId: string;
  finding: Finding;
  evidence: EvidenceItem[];
}) {
  const linked = evidence.filter((item) => (item.aoIds || []).includes(aoId)).length;
  const covering = evidence.filter((item) => evidenceCoversAo(item, aoId)).length;
  return (
    <div className="helper">
      Linked pointers: {linked || "none"}
      {linked > 0 && covering !== linked ? ` · covering: ${covering}` : ""}
      {finding === "met" && covering === 0
        ? " — MET will stay not-reviewed until a non-draft, non-interview pointer is mapped."
        : ""}
    </div>
  );
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

function FindingSelect({
  id,
  value,
  onChange,
  disabled,
  allowNa = true,
}: {
  id: string;
  value: Finding;
  onChange: (v: Finding) => void;
  disabled?: boolean;
  allowNa?: boolean;
}) {
  const options = allowNa ? FINDING_OPTIONS : FINDING_OPTIONS.filter((opt) => opt.value !== "na");
  return (
    <select
      id={id}
      aria-label={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Finding)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

export default function Requirements() {
  const { assessment, score, setAssessment, readOnly } = useAssessment();
  const [params] = useSearchParams();
  const [family, setFamily] = useState("AC");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [naError, setNaError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  useEffect(() => {
    const wanted = (params.get("family") || "").trim().toUpperCase();
    if (FAMILIES.some((row) => row.id === wanted)) {
      setFamily(wanted);
      setSelectedId(null);
      setNaError(null);
      setReviewError(null);
    }
  }, [params]);

  const familyReqs = useMemo(() => CATALOG.filter((row) => row.family === family), [family]);
  const selected = familyReqs.find((row) => row.reqId === selectedId) ?? null;
  const familyMeta = FAMILIES.find((row) => row.id === family);
  const familyReview = reviewForFamily(assessment.familyReviews, family);
  const progressByFamily = useMemo(
    () => new Map(familyProgressRows(assessment).map((row) => [row.family, row])),
    [assessment],
  );
  const familyProgress = progressByFamily.get(family);

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

  function setAoFinding(req: CatalogRequirement, aoId: string, finding: Finding) {
    const current = currentDet(req);
    const next: Determination = {
      ...current,
      finding: "not-reviewed",
      objectives: current.objectives.map((ao) => (ao.aoId === aoId ? { ...ao, finding } : ao)),
    };
    const gated = guardNaWrite(req, next);
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
    const gated = guardNaWrite(req, next);
    if (!gated.ok) {
      setNaError(naMessage(gated.reject));
      return;
    }
    patchDet(req, next);
  }

  function setNaJustification(req: CatalogRequirement, naJustification: string) {
    const next = { ...currentDet(req), naJustification };
    const gated = guardNaWrite(req, next);
    if (!gated.ok) {
      setNaError(naMessage(gated.reject));
      return;
    }
    patchDet(req, next);
  }

  function patchFamilyReview(partial: Partial<FamilyReview>) {
    setAssessment((a) => {
      const prev = reviewForFamily(a.familyReviews, family);
      const familyReviews = upsertFamilyReview(a.familyReviews, { ...prev, ...partial, family });
      return {
        ...a,
        familyReviews,
        prepMarkedAt: allFamiliesReviewed(familyReviews) ? a.prepMarkedAt : null,
      };
    });
  }

  function setFamilyReviewed(checked: boolean) {
    const current = reviewForFamily(assessment.familyReviews, family);
    if (checked && !current.reviewer.trim()) {
      setReviewError("Enter a reviewer name before marking this family reviewed.");
      return;
    }
    setReviewError(null);
    patchFamilyReview({
      reviewed: checked,
      reviewedAt: checked ? new Date().toISOString() : null,
    });
  }

  function markRequirementNa(req: CatalogRequirement) {
    const current = currentDet(req);
    const next: Determination = {
      ...current,
      finding: "na",
      objectives: current.objectives.map((ao) => ({ ...ao, finding: "na" })),
      ...(req.partialCredit?.kind === "fips" ? { fipsOverlay: { enc: "na" as const, fips: "na" as const } } : {}),
    };
    const check = guardNaWrite(req, next);
    if (!check.ok) {
      setNaError(naMessage(check.reject));
      return;
    }
    patchDet(req, next);
  }

  return (
    <div>
      <div className="kicker">Requirements · 171A objectives</div>
      <h1>Requirements</h1>
      <p>
        Findings are per assessment objective. The requirement row is a derived roll-up — you cannot mark a
        requirement MET directly. Requirement N/A needs <span className="mono">naAllowed</span> and a justification.
        MET without a non-draft, non-interview 171A pointer stays not-reviewed (32 CFR 170.24(b)(1)). SAMPLE data only.
      </p>

      <div className="family-tabs" role="tablist" aria-label="Requirement families">
        {FAMILIES.map((row) => {
          const reviewed = reviewForFamily(assessment.familyReviews, row.id).reviewed;
          const progress = progressByFamily.get(row.id);
          const completion = progress?.completion || "unfinished";
          return (
            <button
              key={row.id}
              type="button"
              role="tab"
              aria-selected={family === row.id}
              title={`${row.id} ${completionLabel(completion)}${reviewed ? " · reviewed" : ""}`}
              className={`${family === row.id ? "active" : ""}${reviewed ? " reviewed" : ""} ${completion}`}
              onClick={() => {
                setFamily(row.id);
                setSelectedId(null);
                setNaError(null);
                setReviewError(null);
              }}
            >
              {row.id}
              {reviewed ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>
          {family} · {familyMeta?.name}
        </h2>
        <p className="muted" style={{ marginBottom: 0 }}>
          {familyReqs.length} requirements. Live score {score ? `${score.raw}/110` : "—"}. Completion:{" "}
          {completionLabel(familyProgress?.completion || "unfinished")}
          {familyProgress
            ? ` · ${familyProgress.unansweredAos} of ${familyProgress.aoCount} objectives unanswered`
            : ""}
          {familyProgress?.evidenceGaps ? ` · ${familyProgress.evidenceGaps} evidence gaps` : ""}.
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

      <fieldset className="stack" disabled={readOnly} style={{ marginTop: 16 }}>
        <div className="card">
          <h2>
            Consultant review · {family}
          </h2>
          <p>
            Review flag only. It does not submit, affirm, or call SPRS. All 14 families must be reviewed before
            Export-ready.
          </p>
          <label className="check" htmlFor={`reviewed-${family}`}>
            <input
              id={`reviewed-${family}`}
              type="checkbox"
              checked={familyReview.reviewed}
              onChange={(e) => setFamilyReviewed(e.target.checked)}
            />
            Consultant reviewed this family
          </label>
          <label htmlFor={`reviewer-${family}`}>Reviewer name</label>
          <input
            id={`reviewer-${family}`}
            value={familyReview.reviewer}
            onChange={(e) => {
              const reviewer = e.target.value;
              if (familyReview.reviewed && !reviewer.trim()) {
                setReviewError("Reviewer name is required to keep this family reviewed.");
              } else {
                setReviewError(null);
              }
              patchFamilyReview({ reviewer });
            }}
            placeholder="Consultant name (sample)"
          />
          <div className="muted" style={{ marginBottom: 12 }}>
            {familyReview.reviewed && familyReview.reviewedAt
              ? `Reviewed ${new Date(familyReview.reviewedAt).toLocaleString()}`
              : "Not reviewed · no timestamp"}
          </div>
          <label htmlFor={`review-notes-${family}`}>Notes (unclassified)</label>
          <textarea
            id={`review-notes-${family}`}
            value={familyReview.notes}
            onChange={(e) => patchFamilyReview({ notes: e.target.value })}
            placeholder="Optional QC notes. SAMPLE only."
          />
          {reviewError ? (
            <div className="banner warn">
              <div>
                <strong>Review not marked.</strong> {reviewError}
              </div>
            </div>
          ) : null}
        </div>
      </fieldset>

      {selected ? (
        <RequirementDetail
          req={selected}
          det={currentDet(selected)}
          derived={derivedFinding(selected)}
          evidence={assessment.evidence}
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
  evidence,
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
  evidence: EvidenceItem[];
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
                    allowNa={req.naAllowed}
                  />
                </div>
              </div>
            ))}
            <div className="ao-block">
              <h3 className="mono">3.13.11[a] · derived</h3>
              <p className="muted">Determine if: {req.objectives[0]?.determineIf}</p>
              <span className={`pill ${derivedA || "not-reviewed"}`}>{findingLabel(derivedA || "not-reviewed")}</span>
              <div className="helper">
                Read-only. Derived from enc / fips overlays. Evidence is required on [a] when derived MET, not on
                enc/fips.
              </div>
              <PointerHelper aoId="3.13.11[a]" finding={derivedA || "not-reviewed"} evidence={evidence} />
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
            {effectiveObjectives(req, det, evidence).map((ao) => (
              <div key={ao.aoId} className="ao-block">
                <h3 className="mono">{ao.aoId}</h3>
                <p className="muted">Determine if: {req.objectives.find((row) => row.aoId === ao.aoId)?.determineIf}</p>
                <div className="finding-row">
                  <FindingSelect
                    id={`ao-${ao.aoId}`}
                    value={ao.finding}
                    onChange={(v) => onAoFinding(req, ao.aoId, v)}
                    allowNa={req.naAllowed}
                  />
                  <div>
                    <label htmlFor={`rationale-${ao.aoId}`}>Rationale</label>
                    <textarea
                      id={`rationale-${ao.aoId}`}
                      value={ao.rationale || ""}
                      onChange={(e) => onAoRationale(req, ao.aoId, e.target.value)}
                    />
                    <PointerHelper aoId={ao.aoId} finding={ao.finding} evidence={evidence} />
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
