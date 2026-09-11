import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import catalogFile from "../data/catalog.json";
import catalogMeta from "../data/catalog.meta.json";
import { buildHarborPrecision } from "../data/harbor-precision.mjs";
import type { CatalogRequirement } from "./rollup.mjs";
import { CatalogHashMismatch, scoreFromAssessment, type AssessmentScore } from "./score.mjs";
import { l1ScoreFromAssessment, type L1Score } from "./l1Score.mjs";
import type { Assessment } from "../types";

export type SaveWarning = { field: string; message: string };

const CATALOG = catalogFile.requirements as CatalogRequirement[];
const CATALOG_HASH = catalogMeta.catalogSha256;

export function liveScore(assessment: Assessment): AssessmentScore | null {
  try {
    return scoreFromAssessment(assessment, CATALOG, CATALOG_HASH);
  } catch (err) {
    if (err instanceof CatalogHashMismatch) return null;
    throw err;
  }
}

type Store = {
  assessment: Assessment;
  score: AssessmentScore | null;
  l1Score: L1Score;
  loading: boolean;
  saving: boolean;
  lastSaved: string | null;
  error: string | null;
  warnings: SaveWarning[];
  readOnly: boolean;
  setAssessment: (updater: (current: Assessment) => Assessment) => void;
  loadSample: () => void;
};

const Ctx = createContext<Store | null>(null);

export function reportAssessmentAccess(action: "export" | "snapshot" | "reload-sample", bytes = 0) {
  if (action !== "export" && action !== "snapshot" && action !== "reload-sample") return;
  const n = typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? Math.floor(bytes) : 0;
  void fetch("/api/access-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, outcome: "ok", bytesIn: 0, bytesOut: n }),
  }).catch(() => {});
}

function saveErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return fallback;
  const rec = data as { error?: unknown; reqId?: unknown };
  const err = typeof rec.error === "string" ? rec.error : fallback;
  const reqId = typeof rec.reqId === "string" ? rec.reqId.trim() : "";
  return reqId ? `${err} (${reqId})` : err;
}

function warningList(data: unknown): SaveWarning[] {
  if (!data || typeof data !== "object" || Array.isArray(data)) return [];
  const raw = (data as { warnings?: unknown }).warnings;
  if (!Array.isArray(raw)) return [];
  return raw.filter((row): row is SaveWarning => {
    if (!row || typeof row !== "object") return false;
    const rec = row as { field?: unknown; message?: unknown };
    return typeof rec.field === "string" && typeof rec.message === "string";
  });
}

async function fetchAssessment(): Promise<Assessment | null> {
  const res = await fetch("/api/assessment");
  if (!res.ok) throw new Error("Could not load assessment (HTTP " + res.status + ").");
  const data = await res.json();
  return data.assessment ?? null;
}

export function AssessmentProvider({ children }: { children: ReactNode }) {
  const [assessment, setAssessmentState] = useState<Assessment>(() => buildHarborPrecision());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<SaveWarning[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const skip = useRef(true);
  const readOnlyRef = useRef(false);
  readOnlyRef.current = readOnly;
  const score = useMemo(() => liveScore(assessment), [assessment]);
  const l1Score = useMemo(() => l1ScoreFromAssessment(assessment), [assessment]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await fetchAssessment();
        if (cancelled) return;
        if (existing) {
          setAssessmentState(existing);
          setReadOnly(false);
          return;
        }
        const sample = buildHarborPrecision();
        setAssessmentState(sample);
        const putRes = await fetch("/api/assessment", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assessment: sample }),
        });
        const putData = await putRes.json().catch(() => ({}));
        if (!putRes.ok) throw new Error(saveErrorMessage(putData, "Could not save initial assessment (HTTP " + putRes.status + ")."));
        if (cancelled) return;
        setWarnings(warningList(putData));
        setReadOnly(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Load failed");
          setReadOnly(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading || readOnly) return;
    if (skip.current) {
      skip.current = false;
      return;
    }
    const t = setTimeout(() => {
      setSaving(true);
      fetch("/api/assessment", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assessment }),
      })
        .then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(saveErrorMessage(data, "Save failed"));
          setLastSaved(new Date().toLocaleTimeString());
          setWarnings(warningList(data));
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Save failed"))
        .finally(() => setSaving(false));
    }, 450);
    return () => clearTimeout(t);
  }, [assessment, loading, readOnly]);

  const setAssessment = useCallback((updater: (current: Assessment) => Assessment) => {
    if (readOnlyRef.current) return;
    setAssessmentState((current) => updater(current));
  }, []);

  const loadSample = useCallback(() => {
    void (async () => {
      try {
        const res = await fetch("/api/seed", { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Seed failed");
        const sample: Assessment = data.assessment ?? buildHarborPrecision();
        reportAssessmentAccess("reload-sample", new TextEncoder().encode(JSON.stringify(sample)).length);
        skip.current = true;
        setAssessmentState(sample);
        setReadOnly(false);
        setWarnings([]);
        setError(null);
        setLastSaved(new Date().toLocaleTimeString());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Seed failed");
      }
    })();
  }, []);

  const value = useMemo(
    () => ({
      assessment,
      score,
      l1Score,
      loading,
      saving,
      lastSaved,
      error,
      warnings,
      readOnly,
      setAssessment,
      loadSample,
    }),
    [assessment, score, l1Score, loading, saving, lastSaved, error, warnings, readOnly, setAssessment, loadSample],
  );

  return createElement(Ctx.Provider, { value }, children);
}

export function useAssessment(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssessment must be inside AssessmentProvider");
  return ctx;
}
