/** SAMPLE zip emit. Not eMASS working papers. No SPRS submit. */

import { createHash } from "node:crypto";
import catalogFile from "../src/data/catalog.json" with { type: "json" };
import catalogMeta from "../src/data/catalog.meta.json" with { type: "json" };
import { isWorkingLevel1, normalizeEngagement } from "../src/lib/engagement.mjs";
import { buildL1ExportPack, buildL1Snapshot } from "../src/lib/l1Export.mjs";
import { buildAssemblerSnapshot, buildExportPack, SAMPLE_WATERMARK } from "../src/lib/exportPack.mjs";

export { SAMPLE_WATERMARK };

function hashManifest(pack) {
  if (!pack.ok || !pack.zip || !pack.files || !pack.manifest) return pack;
  const files = pack.manifest.files.map((row) => {
    const text = pack.files[row.name] || "";
    return {
      ...row,
      sha256: createHash("sha256").update(text, "utf8").digest("hex"),
    };
  });
  return { ...pack, manifest: { ...pack.manifest, files } };
}

export function emitSampleExport(assessment, options = {}) {
  if (isWorkingLevel1(normalizeEngagement(assessment?.engagement))) {
    return hashManifest(buildL1ExportPack({ assessment, createdAt: options.createdAt }));
  }
  const pack = buildExportPack({
    assessment,
    catalog: options.catalog || catalogFile.requirements,
    expectedCatalogHash: options.expectedCatalogHash === undefined ? catalogMeta.catalogSha256 : options.expectedCatalogHash,
    createdAt: options.createdAt,
  });
  return hashManifest(pack);
}

export function emitAssemblerSnapshot(assessment, options = {}) {
  if (isWorkingLevel1(normalizeEngagement(assessment?.engagement))) {
    return hashManifest(buildL1Snapshot({ assessment, createdAt: options.createdAt }));
  }
  const pack = buildAssemblerSnapshot({
    assessment,
    catalog: options.catalog || catalogFile.requirements,
    expectedCatalogHash: options.expectedCatalogHash === undefined ? catalogMeta.catalogSha256 : options.expectedCatalogHash,
    createdAt: options.createdAt,
  });
  return hashManifest(pack);
}

export function sendExportResponse(res, pack) {
  if (!pack?.ok || !pack.zip) {
    const error = pack?.error || "export-refused";
    const status = error === "not-reviewed" ? 409 : error === "assessment-missing" ? 400 : 400;
    res.status(status).json({
      error,
      errorClass: "ExportRefused",
      watermark: SAMPLE_WATERMARK,
      checklist: pack?.checklist || [],
      exportReady: pack?.exportReady === true,
    });
    return;
  }
  const zip = Buffer.from(pack.zip);
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${pack.filename || "evidence-bench-sample.zip"}"`);
  res.status(200).end(zip);
}
