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
import { buildHarborPrecision } from "../data/harbor-precision";
import type { Assessment } from "../types";

type Store = {
  assessment: Assessment;
  loading: boolean;
  saving: boolean;
  lastSaved: string | null;
  error: string | null;
  setAssessment: (updater: (current: Assessment) => Assessment) => void;
  loadSample: () => void;
};

const Ctx = createContext<Store | null>(null);

export function reportAssessmentAccess(action: "export" | "reload-sample", bytes = 0) {
  if (action !== "export" && action !== "reload-sample") return;
  const n = typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0 ? Math.floor(bytes) : 0;
  void fetch("/api/access-audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, outcome: "ok", bytesIn: 0, bytesOut: n }),
  }).catch(() => {});
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
  const skip = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const existing = await fetchAssessment();
        if (cancelled) return;
        if (existing) setAssessmentState(existing);
        else {
          const sample = buildHarborPrecision();
          setAssessmentState(sample);
          await fetch("/api/assessment", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assessment: sample }),
          });
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return;
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
        .then((r) => {
          if (!r.ok) throw new Error("Save failed");
          setLastSaved(new Date().toLocaleTimeString());
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Save failed"))
        .finally(() => setSaving(false));
    }, 450);
    return () => clearTimeout(t);
  }, [assessment, loading]);

  const setAssessment = useCallback((updater: (current: Assessment) => Assessment) => {
    setAssessmentState((current) => updater(current));
  }, []);

  const loadSample = useCallback(() => {
    skip.current = false;
    void (async () => {
      try {
        const res = await fetch("/api/seed", { method: "POST" });
        if (!res.ok) throw new Error("Seed failed");
        const data = await res.json();
        const sample: Assessment = data.assessment ?? buildHarborPrecision();
        reportAssessmentAccess("reload-sample", new TextEncoder().encode(JSON.stringify(sample)).length);
        setAssessmentState(sample);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Seed failed");
      }
    })();
  }, []);

  const value = useMemo(
    () => ({ assessment, loading, saving, lastSaved, error, setAssessment, loadSample }),
    [assessment, loading, saving, lastSaved, error, setAssessment, loadSample],
  );

  return createElement(Ctx.Provider, { value }, children);
}

export function useAssessment(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssessment must be inside AssessmentProvider");
  return ctx;
}
