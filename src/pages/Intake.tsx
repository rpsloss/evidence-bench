import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import {
  confirmIntake,
  informationLabel,
  levelLabel,
  normalizeEngagement,
  phaseLabel,
  uniqueCages,
  type InformationType,
  type WorkingLevel,
} from "../lib/engagement.mjs";
import { useAssessment } from "../lib/store";
import type { Engagement, EngagementClauses, Organization } from "../types";

const INFO_OPTIONS: { value: InformationType; label: string; help: string }[] = [
  { value: "unknown", label: "Unknown", help: "Do not open the 110 board yet." },
  { value: "fci-only", label: "FCI only", help: "Level 1 (Self). No CUI on the contract." },
  { value: "cui", label: "CUI", help: "Level 2 (Self). Level 1 is still the floor." },
  { value: "both", label: "FCI and CUI", help: "Level 2 (Self). FCI systems stay in the story." },
];

function triValue(value: boolean | null) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function fromTri(value: string): boolean | null {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

export default function Intake() {
  const { assessment, setAssessment, readOnly } = useAssessment();
  const org = assessment.organization;
  const engagement = normalizeEngagement(assessment.engagement);
  const official = org.affirmingOfficial ?? { name: "", title: "", email: "" };
  const cages = uniqueCages(org, engagement);
  const l2Allowed = engagement.requiredLevel === "level-2-self";
  const canConfirm = engagement.informationType !== "unknown" && !readOnly;

  function patchEngagement(partial: Partial<Engagement>) {
    setAssessment((a) => ({
      ...a,
      engagement: normalizeEngagement({ ...a.engagement, ...partial }),
    }));
  }

  function patchOrg(partial: Partial<Organization>) {
    setAssessment((a) => ({ ...a, organization: { ...a.organization, ...partial, fictional: true } }));
  }

  function patchOfficial(partial: Partial<{ name: string; title: string; email: string }>) {
    patchOrg({ affirmingOfficial: { ...official, ...partial } });
  }

  function patchClause(key: keyof EngagementClauses, value: boolean | null | string) {
    patchEngagement({
      clauses: { ...engagement.clauses, [key]: value },
    });
  }

  function onCount(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.trim();
    if (raw === "") {
      patchOrg({ employeeCount: null });
      return;
    }
    const n = Number(raw);
    patchOrg({ employeeCount: Number.isFinite(n) ? n : org.employeeCount });
  }

  function onExtraCages(text: string) {
    const additionalCages = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .filter((cage) => cage.toUpperCase() !== org.cage.trim().toUpperCase());
    patchEngagement({ additionalCages });
  }

  return (
    <div>
      <div className="kicker">Intake · engagement</div>
      <h1>Engagement intake</h1>
      <p>
        Decide FCI vs CUI first. CMMC level follows the information, not company size. Clauses are what you saw on the
        contract — not legal advice. SAMPLE data only. This app does not submit, sign, or affirm.
      </p>

      <div className="banner">
        <div>
          <strong>
            Required status: {levelLabel(engagement.requiredLevel)}. Phase: {phaseLabel(engagement.currentPhase)}.
          </strong>{" "}
          Working {levelLabel(engagement.workingLevel)}. Fake CAGE {org.cage || "XXXXX"}.
        </div>
      </div>

      <fieldset className="stack" disabled={readOnly}>
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>What information exists?</h2>
          <p className="helper">
            FCI only → Level 1 (Self). CUI or both → Level 2 (Self). Unknown keeps the engagement in intake.
          </p>
          <div className="row">
            {INFO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={engagement.informationType === opt.value ? "primary" : undefined}
                onClick={() => patchEngagement({ informationType: opt.value })}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <p className="helper">
            {INFO_OPTIONS.find((row) => row.value === engagement.informationType)?.help} Derived required status is{" "}
            {levelLabel(engagement.requiredLevel)}.
          </p>
        </div>

        <div className="grid two" style={{ marginBottom: 16 }}>
          <div className="card">
            <h2>Working level</h2>
            <p className="helper">
              FCI-only cannot open Level 2. CUI shops may still run Level 1 as a floor check. The Level 1 catalog is
              the next slice.
            </p>
            <div className="row">
              <button
                type="button"
                className={engagement.workingLevel === "level-1-self" ? "primary" : undefined}
                onClick={() => patchEngagement({ workingLevel: "level-1-self" satisfies WorkingLevel })}
              >
                Level 1 (Self)
              </button>
              <button
                type="button"
                className={engagement.workingLevel === "level-2-self" ? "primary" : undefined}
                disabled={!l2Allowed}
                onClick={() => patchEngagement({ workingLevel: "level-2-self" satisfies WorkingLevel })}
              >
                Level 2 (Self)
              </button>
            </div>
            {!l2Allowed ? (
              <p className="helper">Level 2 is disabled until intake says CUI (or both) is in play.</p>
            ) : null}
          </div>
          <div className="card">
            <h2>Confirm intake</h2>
            <p className="helper">
              Local stamp only. Not a CMMC Status Date. Not a SPRS submission. Changing information type back to
              Unknown clears it.
            </p>
            <p className="mono">{engagement.intakeNotedAt || "(not confirmed)"}</p>
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={!canConfirm}
                onClick={() => patchEngagement(confirmIntake(engagement))}
              >
                Confirm intake
              </button>
              <button type="button" disabled={!engagement.intakeNotedAt} onClick={() => patchEngagement({ intakeNotedAt: null })}>
                Clear
              </button>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Clauses observed</h2>
          <p className="helper">
            Check what is on the paper in front of you. FAR 52.204-21 (sometimes cited as 52.240-93 after the FAR
            overhaul) is the Level 1 floor. DFARS 252.204-7012 / 7021 point at CUI / CMMC status. Not legal advice.
          </p>
          {(
            [
              ["far5220421", "FAR 52.204-21 / 52.240-93 (FCI basic safeguarding)"],
              ["dfars7012", "DFARS 252.204-7012 (CUI safeguarding / 800-171)"],
              ["dfars7021", "DFARS 252.204-7021 (CMMC status)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              {label}
              <select value={triValue(engagement.clauses[key])} onChange={(e) => patchClause(key, fromTri(e.target.value))}>
                <option value="unknown">Not reviewed</option>
                <option value="yes">Seen on the contract</option>
                <option value="no">Not seen</option>
              </select>
            </label>
          ))}
          <label>
            Notes (unclassified)
            <textarea value={engagement.clauses.notes} onChange={(e) => patchClause("notes", e.target.value)} />
          </label>
        </div>

        <div className="grid two" style={{ marginBottom: 16 }}>
          <div className="card">
            <h2>Organization</h2>
            <label>
              Name
              <input value={org.name} onChange={(e) => patchOrg({ name: e.target.value })} />
            </label>
            <label>
              Primary CAGE
              <input value={org.cage} onChange={(e) => patchOrg({ cage: e.target.value })} />
            </label>
            <p className="helper">Harbor seed is fake CAGE XXXXX. SPRS wants every CAGE on the in-scope systems.</p>
            <label>
              Additional CAGEs (one per line)
              <textarea
                value={engagement.additionalCages.join("\n")}
                onChange={(e) => onExtraCages(e.target.value)}
              />
            </label>
            <p className="helper">In-scope CAGEs: {cages.join(", ") || "—"}</p>
            <label>
              Employees
              <input type="number" min={0} value={org.employeeCount ?? ""} onChange={onCount} />
            </label>
          </div>
          <div className="card">
            <h2>Affirming official (local prep)</h2>
            <p className="helper">Not a PIEE identity. The named official affirms in SPRS, not here.</p>
            <label>
              Name
              <input value={official.name} onChange={(e) => patchOfficial({ name: e.target.value })} />
            </label>
            <label>
              Title
              <input value={official.title} onChange={(e) => patchOfficial({ title: e.target.value })} />
            </label>
            <label>
              Email
              <input value={official.email} onChange={(e) => patchOfficial({ email: e.target.value })} />
            </label>
          </div>
        </div>
      </fieldset>

      <div className="row">
        <Link className="btn primary" to={engagement.currentPhase === "intake" ? "/intake" : engagement.workingLevel === "level-1-self" ? "/intake" : "/scope"}>
          {engagement.currentPhase === "intake" ? "Stay on intake" : "Continue"}
        </Link>
        <Link className="btn" to="/">
          Home
        </Link>
      </div>
      <p className="helper">
        Information: {informationLabel(engagement.informationType)}. Required {levelLabel(engagement.requiredLevel)}.
        Working {levelLabel(engagement.workingLevel)}.
      </p>
    </div>
  );
}
