import { useState } from "react";
import { AlertCircle, CheckCircle2, Sparkles } from "lucide-react";

export default function GeminiDiagnostics({ workspaceId, stats }) {
  const [state, setState] = useState("idle");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  async function diagnose() {
    setState("loading");
    setError("");
    try {
      const response = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          symptoms: stats?.error || "Faz uma verificação preventiva da operação atual.",
          recentData: JSON.stringify({ pendentes: stats?.pending, agendados: stats?.scheduled, atrasados: stats?.overdue }),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Não foi possível analisar.");
      setResult(data.text);
      setState("done");
    } catch (cause) {
      setError(cause.message);
      setState("error");
    }
  }

  return <section className="gemini-panel" aria-live="polite">
    <div className="gemini-panel-head">
      <div className="gemini-mark"><Sparkles size={17}/></div>
      <div><span className="eyebrow">Assistente inteligente</span><h2>Gemini Health Check</h2><p>Analisa sinais da operação e sugere correções seguras.</p></div>
      <button className="primary gemini-action" onClick={diagnose} disabled={state === "loading"}>{state === "loading" ? "A analisar…" : "Analisar agora"}</button>
    </div>
    {state === "idle" && <div className="gemini-empty"><CheckCircle2 size={18}/> Pronto para verificar a operação.</div>}
    {state === "error" && <div className="gemini-result danger"><AlertCircle size={18}/><span>{error}</span></div>}
    {state === "done" && <div className="gemini-result"><Sparkles size={16}/><p>{result}</p></div>}
  </section>;
}
