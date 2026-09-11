import { useState } from "react";
import { scopeBlockers } from "../lib/scope.mjs";
import { useAssessment } from "../lib/store";
import WorkingLevelNote from "../components/WorkingLevelNote";
import type { Asset, AssetCategory, CuiFlow, FlowChannel, SpecializedKind } from "../types";

const CATEGORIES: AssetCategory[] = ["cui", "spa", "crma", "specialized", "oos"];
const CHANNELS: FlowChannel[] = ["email", "file", "cad", "removable-media", "saas", "other"];
const SPECIALIZED: SpecializedKind[] = ["ot", "iiot", "iot", "gfe", "restricted-is", "test-equipment"];

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function emptyAsset(id: string): Asset {
  return { id, name: "", category: "cui", justification: "", notes: "" };
}

function emptyFlow(id: string, fromAssetId: string, toAssetId: string): CuiFlow {
  return { id, fromAssetId, toAssetId, channel: "email", inBoundary: true, notes: "" };
}

export default function Assets() {
  const { assessment, setAssessment, readOnly } = useAssessment();
  const [selAsset, setSelAsset] = useState<string | null>(assessment.assets[0]?.id ?? null);
  const [selFlow, setSelFlow] = useState<string | null>(assessment.flows[0]?.id ?? null);
  const asset = assessment.assets.find((a) => a.id === selAsset);
  const flow = assessment.flows.find((f) => f.id === selFlow);
  const conflicts = scopeBlockers(assessment).filter((b) => b.id.startsWith("oos-in-flow"));

  function patchAsset(id: string, partial: Partial<Asset>) {
    setAssessment((a) => ({
      ...a,
      assets: a.assets.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }

  function patchFlow(id: string, partial: Partial<CuiFlow>) {
    setAssessment((a) => ({
      ...a,
      flows: a.flows.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    }));
  }

  function nameOf(id: string) {
    return assessment.assets.find((a) => a.id === id)?.name || id;
  }

  return (
    <div>
      <div className="kicker">Assets &amp; CUI flows</div>
      <h1>Assets and flows</h1>
      <WorkingLevelNote />
      <p>
        Five CMMC L2 asset categories. Specialized mill in the Harbor seed is OT and is <em>not</em> on a CUI flow.
        An out-of-scope asset as an endpoint of an in-boundary flow is a hard graph blocker.
      </p>

      {conflicts.length > 0 ? (
        <div className="banner conflict">
          <div>
            <strong>OOS on an in-boundary CUI flow.</strong>{" "}
            {conflicts.map((c) => c.detail).join(" ")}
          </div>
        </div>
      ) : null}

      <fieldset className="stack" disabled={readOnly}>
      <div className="row">
        <button
          type="button"
          className="primary"
          onClick={() => {
            const n = emptyAsset(newId("asset"));
            setAssessment((a) => ({ ...a, assets: [...a.assets, n] }));
            setSelAsset(n.id);
          }}
        >
          Add asset
        </button>
        <button
          type="button"
          onClick={() => {
            const from = assessment.assets[0]?.id ?? "";
            const to = assessment.assets[1]?.id ?? from;
            const n = emptyFlow(newId("flow"), from, to);
            setAssessment((a) => ({ ...a, flows: [...a.flows, n] }));
            setSelFlow(n.id);
          }}
        >
          Add CUI flow
        </button>
      </div>

      <h2>Assets ({assessment.assets.length})</h2>
      <div className="split">
        <div className="card" style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {assessment.assets.map((row) => (
                <tr
                  key={row.id}
                  className="clickable"
                  onClick={() => setSelAsset(row.id)}
                >
                  <td>{row.name || row.id}</td>
                  <td>
                    <span className={`pill ${row.category}`}>{row.category}</span>
                    {row.specializedKind ? ` · ${row.specializedKind}` : ""}
                  </td>
                  <td className="muted">{row.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          {asset ? (
            <>
              <h3>Selected asset</h3>
              <label>Name</label>
              <input value={asset.name} onChange={(e) => patchAsset(asset.id, { name: e.target.value })} />
              <label>Category</label>
              <select
                value={asset.category}
                onChange={(e) => {
                  const category = e.target.value as AssetCategory;
                  patchAsset(asset.id, {
                    category,
                    specializedKind: category === "specialized" ? asset.specializedKind ?? "ot" : undefined,
                  });
                }}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {asset.category === "specialized" ? (
                <>
                  <label>Specialized kind</label>
                  <select
                    value={asset.specializedKind ?? "ot"}
                    onChange={(e) => patchAsset(asset.id, { specializedKind: e.target.value as SpecializedKind })}
                  >
                    {SPECIALIZED.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </>
              ) : null}
              <label>
                Justification
                {asset.category === "crma" || asset.category === "specialized" || asset.category === "oos"
                  ? " (required)"
                  : ""}
              </label>
              <textarea value={asset.justification} onChange={(e) => patchAsset(asset.id, { justification: e.target.value })} />
              <label>Notes (unclassified)</label>
              <textarea value={asset.notes} onChange={(e) => patchAsset(asset.id, { notes: e.target.value })} />
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setAssessment((a) => ({ ...a, assets: a.assets.filter((row) => row.id !== asset.id) }));
                  setSelAsset(null);
                }}
              >
                Remove asset
              </button>
            </>
          ) : (
            <p>Select an asset.</p>
          )}
        </div>
      </div>

      <h2 style={{ marginTop: 24 }}>CUI flows ({assessment.flows.length})</h2>
      <div className="split">
        <div className="card" style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th>To</th>
                <th>Channel</th>
                <th>In boundary</th>
              </tr>
            </thead>
            <tbody>
              {assessment.flows.map((row) => (
                <tr key={row.id} className="clickable" onClick={() => setSelFlow(row.id)}>
                  <td>{nameOf(row.fromAssetId)}</td>
                  <td>{nameOf(row.toAssetId)}</td>
                  <td>{row.channel}</td>
                  <td>{row.inBoundary ? "yes" : "no"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          {flow ? (
            <>
              <h3>Selected flow</h3>
              <label>From</label>
              <select
                value={flow.fromAssetId}
                onChange={(e) => patchFlow(flow.id, { fromAssetId: e.target.value })}
              >
                {assessment.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.id}
                  </option>
                ))}
              </select>
              <label>To</label>
              <select value={flow.toAssetId} onChange={(e) => patchFlow(flow.id, { toAssetId: e.target.value })}>
                {assessment.assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name || a.id}
                  </option>
                ))}
              </select>
              <label>Channel</label>
              <select
                value={flow.channel}
                onChange={(e) => patchFlow(flow.id, { channel: e.target.value as FlowChannel })}
              >
                {CHANNELS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <label>
                <input
                  type="checkbox"
                  checked={flow.inBoundary}
                  onChange={(e) => patchFlow(flow.id, { inBoundary: e.target.checked })}
                  style={{ width: "auto", marginRight: 8 }}
                />
                In assessment boundary
              </label>
              <label>Notes (unclassified)</label>
              <textarea value={flow.notes} onChange={(e) => patchFlow(flow.id, { notes: e.target.value })} />
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setAssessment((a) => ({ ...a, flows: a.flows.filter((row) => row.id !== flow.id) }));
                  setSelFlow(null);
                }}
              >
                Remove flow
              </button>
            </>
          ) : (
            <p>Select a flow.</p>
          )}
        </div>
      </div>
      </fieldset>
    </div>
  );
}
