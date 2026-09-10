/** Graph blockers for Assessment Scope. Does not score requirements. */

const JUSTIFY_CATEGORIES = new Set(["crma", "specialized", "oos"]);

function asList(value) {
  return Array.isArray(value) ? value : [];
}

function str(value) {
  return value == null ? "" : String(value);
}

function assetName(asset, fallbackId) {
  return str(asset?.name).trim() || fallbackId;
}

/**
 * @param {unknown} assessment
 * @returns {{ id: string, severity: "blocker" | "warning" | "info", title: string, detail: string, href: string, citation?: string }[]}
 */
export function scopeBlockers(assessment) {
  if (!assessment || typeof assessment !== "object" || Array.isArray(assessment)) return [];

  const assets = asList(assessment.assets);
  const flows = asList(assessment.flows);
  const byId = new Map();
  for (const asset of assets) {
    if (asset && typeof asset === "object" && str(asset.id)) byId.set(str(asset.id), asset);
  }

  const blockers = [];

  for (const flow of flows) {
    if (!flow || typeof flow !== "object" || flow.inBoundary !== true) continue;
    const flowId = str(flow.id) || "flow";
    for (const end of [flow.fromAssetId, flow.toAssetId]) {
      const id = str(end);
      if (!id) continue;
      const asset = byId.get(id);
      if (!asset || asset.category !== "oos") continue;
      blockers.push({
        id: `oos-in-flow:${flowId}:${id}`,
        severity: "blocker",
        title: "Out-of-scope asset on an in-boundary CUI flow",
        detail: `${assetName(asset, id)} is out of scope but is an endpoint of in-boundary flow ${flowId}.`,
        href: "/assets",
        citation: "32 CFR 170.19",
      });
    }
  }

  for (const asset of assets) {
    if (!asset || typeof asset !== "object") continue;
    const category = str(asset.category);
    if (!JUSTIFY_CATEGORIES.has(category)) continue;
    if (str(asset.justification).trim()) continue;
    const id = str(asset.id) || "asset";
    blockers.push({
      id: `missing-justification:${id}`,
      severity: "blocker",
      title: "Missing required justification",
      detail: `${assetName(asset, id)} (${category}) needs a justification.`,
      href: "/assets",
      citation: "32 CFR 170.19",
    });
  }

  const scope = assessment.scope && typeof assessment.scope === "object" ? assessment.scope : null;
  const diagram = scope ? scope.diagramEvidenceId : null;
  if (!str(diagram).trim()) {
    blockers.push({
      id: "missing-diagram",
      severity: "warning",
      title: "Missing network diagram pointer",
      detail: "No diagram URI / evidence id is set on Scope. Unclass pointer only.",
      href: "/scope",
    });
  }
  if (!str(scope?.narrative).trim()) {
    blockers.push({
      id: "empty-boundary",
      severity: "warning",
      title: "Empty boundary body",
      detail: "Assessment Scope has no boundary narrative. Feeds the SSP boundary stub. Not NLP.",
      href: "/scope",
    });
  }

  return blockers;
}
