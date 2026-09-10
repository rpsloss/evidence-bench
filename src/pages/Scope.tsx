import type { ChangeEvent } from "react";
import type { Organization, Scope as ScopeModel, ScopeKind } from "../types";
import { useAssessment } from "../lib/store";

function Field({
  label,
  value,
  onChange,
  textarea,
  helper,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  helper?: string;
}) {
  return (
    <div>
      <label>{label}</label>
      {textarea ? (
        <textarea className="tall" value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {helper ? <div className="helper">{helper}</div> : null}
    </div>
  );
}

export default function Scope() {
  const { assessment, setAssessment, readOnly } = useAssessment();
  const org = assessment.organization;
  const scope = assessment.scope;
  const official = org.affirmingOfficial ?? { name: "", title: "", email: "" };
  const smallEnterprise = scope.kind === "enterprise" && (org.employeeCount ?? 0) <= 50;

  function patchOrg(partial: Partial<Organization>) {
    setAssessment((a) => ({ ...a, organization: { ...a.organization, ...partial, fictional: true } }));
  }

  function patchScope(partial: Partial<ScopeModel>) {
    setAssessment((a) => ({ ...a, scope: { ...a.scope, ...partial } }));
  }

  function patchOfficial(partial: Partial<{ name: string; title: string; email: string }>) {
    patchOrg({ affirmingOfficial: { ...official, ...partial } });
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

  function onCategories(v: string) {
    const cuiCategoriesGeneric = v
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    patchScope({ cuiCategoriesGeneric });
  }

  return (
    <div>
      <div className="kicker">Scope · identity</div>
      <h1>Assessment Scope</h1>
      <p>
        SPRS L2 Self records Enterprise or Enclave plus employee count and CAGE. Default is Enclave. Affirming-official
        fields are local prep only — not a PIEE identity. Generic CUI categories only; never real contract CUI.
      </p>

      {smallEnterprise ? (
        <div className="banner warn">
          <div>
            <strong>Small shop on Enterprise.</strong> Employee count is {org.employeeCount}. Enclave is the usual
            choice for 5–50 person DIB shops. Enterprise is an explicit, expensive expansion of the boundary.
          </div>
        </div>
      ) : null}

      <fieldset className="stack" disabled={readOnly}>
      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Organization</h2>
        <div className="grid two">
          <Field label="Name" value={org.name} onChange={(v) => patchOrg({ name: v })} />
          <Field
            label="CAGE"
            value={org.cage}
            onChange={(v) => patchOrg({ cage: v })}
            helper="Seed is the obvious fake XXXXX. Never claimed as Castleridge."
          />
        </div>
        <div className="grid two">
          <div>
            <label>Employee count</label>
            <input type="number" min={0} value={org.employeeCount ?? ""} onChange={onCount} />
          </div>
          <div>
            <label>Fictional sample</label>
            <input value="true (v1 always)" readOnly />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Affirming official (prep)</h2>
        <p className="helper">Local prep only, not a PIEE identity. The app never submits or affirms.</p>
        <div className="grid two">
          <Field label="Name" value={official.name} onChange={(v) => patchOfficial({ name: v })} />
          <Field label="Title" value={official.title} onChange={(v) => patchOfficial({ title: v })} />
        </div>
        <Field label="Email" value={official.email} onChange={(v) => patchOfficial({ email: v })} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2>Enterprise vs Enclave</h2>
        <label>Assessment Scope (SPRS field)</label>
        <select
          value={scope.kind}
          onChange={(e) => patchScope({ kind: e.target.value as ScopeKind })}
        >
          <option value="enclave">Enclave (default)</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <p className="helper">
          Enclave: a set of system resources in the same security domain behind one continuous perimeter. Enterprise: the
          whole organization boundary.
        </p>
        <Field
          label="Boundary narrative"
          value={scope.narrative}
          onChange={(v) => patchScope({ narrative: v })}
          textarea
        />
        <Field
          label="Isolation summary (how OOS is isolated)"
          value={scope.isolationSummary}
          onChange={(v) => patchScope({ isolationSummary: v })}
          textarea
        />
        <Field
          label="Generic CUI categories (one per line)"
          value={scope.cuiCategoriesGeneric.join("\n")}
          onChange={onCategories}
          textarea
          helper="Example: engineering drawings (generic). Never paste real contract CUI."
        />
        <Field
          label="Diagram URI / evidence id"
          value={scope.diagramEvidenceId ?? ""}
          onChange={(v) => patchScope({ diagramEvidenceId: v.trim() ? v : null })}
          helper="Unclass pointer only. Evidence registry arrives in a later PR."
        />
      </div>
      </fieldset>
    </div>
  );
}
