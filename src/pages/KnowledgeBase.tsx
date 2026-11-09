import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../utils/api";

type KbFertilizer = {
  id: number;
  name: string;
  category: string;
  composition: string;
  what_it_does: string;
  how_to_use: string;
  default_unit: string;
};

type KbPesticide = {
  id: number;
  name: string;
  target: string;
  what_it_does: string;
  advice: string;
  cycle_notes: string;
};

type KbSchedule = {
  id: number;
  source_key: string;
  crop_type: string;
  name: string;
  summary: string;
  steps: Array<{
    step_order: number;
    title: string;
    summary: string;
    details: string;
  }>;
};

type KnowledgeBase = {
  fertilizers: KbFertilizer[];
  pesticides: KbPesticide[];
  schedules: KbSchedule[];
};

type Tab = "fertilizers" | "pesticides" | "schedules";

export default function KnowledgeBase() {
  const navigate = useNavigate();
  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("fertilizers");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/getKnowledgeBase");
        if (res.status === 401) {
          navigate("/login");
          return;
        }
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as KnowledgeBase;
        if (!cancelled) setKb(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Could not load knowledge base");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen px-4 py-6 relative overflow-hidden">
      <div className="absolute inset-0 gold-sheen pointer-events-none opacity-20" />
      <div className="max-w-5xl mx-auto relative z-10">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <button className="glass-btn" onClick={() => navigate("/dashboard")}>
            ← Dashboard
          </button>
          <p className="eyebrow">Shared knowledge</p>
        </div>

        <h1 className="font-display text-4xl text-gold glow-text mb-2">
          Crop Knowledge Base
        </h1>
        <p className="text-gold-muted text-sm mb-6 max-w-2xl">
          General agronomic guidance shared by every farm — fertilizer and
          pesticide references and recommended application cycles. This is
          knowledge only: your private inventory, amounts and prices stay in your
          own ledger and are never shown here.
        </p>

        <div className="flex gap-2 mb-6 flex-wrap">
          <button
            className={`glass-btn ${tab === "fertilizers" ? "gold-btn" : ""}`}
            onClick={() => setTab("fertilizers")}
          >
            Fertilizers
          </button>
          <button
            className={`glass-btn ${tab === "pesticides" ? "gold-btn" : ""}`}
            onClick={() => setTab("pesticides")}
          >
            Pesticides
          </button>
          <button
            className={`glass-btn ${tab === "schedules" ? "gold-btn" : ""}`}
            onClick={() => setTab("schedules")}
          >
            Application cycles
          </button>
        </div>

        {loading && <p className="text-gold-muted">Loading knowledge…</p>}
        {error && <p className="text-red-400">{error}</p>}

        {kb && tab === "fertilizers" && (
          <div className="grid gap-4 md:grid-cols-2">
            {kb.fertilizers.map((f) => (
              <div key={f.id} className="glass-card">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-gold text-lg font-semibold">{f.name}</h3>
                  <span className="text-xs text-gold-muted">{f.category}</span>
                </div>
                {f.composition && (
                  <p className="text-sm text-gold-muted mt-1">{f.composition}</p>
                )}
                {f.what_it_does && (
                  <p className="text-sm mt-2">{f.what_it_does}</p>
                )}
                {f.how_to_use && (
                  <p className="text-sm text-gold-muted mt-2">
                    <span className="text-gold">How to use: </span>
                    {f.how_to_use}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {kb && tab === "pesticides" && (
          <div className="grid gap-4 md:grid-cols-2">
            {kb.pesticides.map((p) => (
              <div key={p.id} className="glass-card">
                <h3 className="text-gold text-lg font-semibold">{p.name}</h3>
                {p.target && (
                  <p className="text-sm text-gold-muted mt-1">
                    <span className="text-gold">Targets: </span>
                    {p.target}
                  </p>
                )}
                {p.what_it_does && (
                  <p className="text-sm mt-2">{p.what_it_does}</p>
                )}
                {p.advice && (
                  <p className="text-sm text-gold-muted mt-2">
                    <span className="text-gold">Advice: </span>
                    {p.advice}
                  </p>
                )}
                {p.cycle_notes && (
                  <p className="text-sm text-gold-muted mt-2">
                    <span className="text-gold">Cycle: </span>
                    {p.cycle_notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {kb && tab === "schedules" && (
          <div className="grid gap-4">
            {kb.schedules.map((s) => (
              <div key={s.id} className="glass-card">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="text-gold text-lg font-semibold">{s.name}</h3>
                  <span className="text-xs text-gold-muted">{s.crop_type}</span>
                </div>
                {s.summary && <p className="text-sm mt-1">{s.summary}</p>}
                <div className="mt-3 space-y-3">
                  {s.steps.map((step) => (
                    <div
                      key={step.step_order}
                      className="border-l-2 border-gold/30 pl-3"
                    >
                      <p className="text-gold text-sm font-semibold">
                        {step.title}
                      </p>
                      {step.summary && (
                        <p className="text-sm text-gold-muted mt-1">
                          {step.summary}
                        </p>
                      )}
                      {step.details && (
                        <pre className="text-xs text-gold-muted mt-1 whitespace-pre-wrap font-sans">
                          {step.details}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
