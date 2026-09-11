import { isWorkingLevel1, normalizeEngagement } from "../lib/engagement.mjs";
import { useAssessment } from "../lib/store";

export default function WorkingLevelNote({ page }: { page?: string }) {
  const { assessment } = useAssessment();
  const engagement = normalizeEngagement(assessment.engagement);
  if (!isWorkingLevel1(engagement)) return null;
  const poam = page === "poam";
  return (
    <div className={poam ? "banner conflict" : "banner warn"}>
      <div>
        <strong>{poam ? "POA&M is not permitted at Level 1." : "Working Level 1 (Self)."}</strong>{" "}
        {poam
          ? "32 CFR 170.21(a)(1). This register is Level 2 tooling. Insert is disabled while the engagement is on Level 1."
          : "Level 1 is 15 FAR 52.204-21 requirements mapped to 17 NIST 800-171 IDs, assessed at 171A grain with FCI in place of CUI. All MET. No POA&M. The 110-practice board, SSP, and L2 SPRS CSV stay Level 2 tooling."}
      </div>
    </div>
  );
}
