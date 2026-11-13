import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, FileText, PackageCheck, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase";
import { addMonthsToDateKey, formatDate } from "../lib/maintenance-data";
import { extractPdfText } from "../lib/manual-pdf";
import { ErrorNotice, Modal, StatusBadge } from "./maintenance-ui";

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-PT");
}

export default function ManualMaintenanceReview({ manual, equipment, onClose, onSaved }) {
  const matchingEquipment = useMemo(
    () => equipment.find((item) => normalize(item.brand) === normalize(manual.brand) && normalize(item.model) === normalize(manual.model)),
    [equipment, manual],
  );
  const [equipmentId, setEquipmentId] = useState(matchingEquipment?.id ?? "");
  const [baseDate, setBaseDate] = useState(matchingEquipment?.last_maintenance_on || matchingEquipment?.installed_on || "");
  const [analysis, setAnalysis] = useState(null);
  const [phase, setPhase] = useState("ready");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const selectedEquipment = equipment.find((item) => item.id === equipmentId);

  async function analyzeManual() {
    setPhase("analyzing");
    setError("");
    try {
      const { data: signed, error: signedError } = await supabase.storage.from("pack4-equipment-manuals").createSignedUrl(manual.storage_path, 60);
      if (signedError || !signed?.signedUrl) throw new Error("Não foi possível abrir o PDF guardado.");
      const pdfResponse = await fetch(signed.signedUrl);
      if (!pdfResponse.ok) throw new Error("Não foi possível transferir o PDF para análise.");
      const text = await extractPdfText(await pdfResponse.blob());
      if (text.length < 100) throw new Error("Este PDF parece digitalizado ou não tem texto pesquisável suficiente. É necessário aplicar OCR antes da análise.");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("A sessão expirou. Inicie sessão novamente.");
      const response = await fetch("/api/manual-maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text, brand: manual.brand, model: manual.model }),
      });
      const responseText = await response.text();
      let result = null;
      try {
        result = responseText ? JSON.parse(responseText) : null;
      } catch {
        result = null;
      }
      if (!response.ok) {
        throw new Error(result?.error || `O serviço de análise não respondeu corretamente (HTTP ${response.status}).`);
      }
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error("O serviço de análise devolveu uma resposta vazia ou inválida.");
      }
      setAnalysis(result);
      const identityDiffers = result.brand && result.model && (normalize(result.brand) !== normalize(manual.brand) || normalize(result.model) !== normalize(manual.model));
      if (identityDiffers) {
        const identifiedEquipment = equipment.find((item) => normalize(item.brand) === normalize(result.brand) && normalize(item.model) === normalize(result.model));
        setEquipmentId(identifiedEquipment?.id ?? "");
        setBaseDate(identifiedEquipment?.last_maintenance_on || identifiedEquipment?.installed_on || "");
      }
      setPhase("review");
    } catch (cause) {
      setError(cause.message || "Não foi possível analisar este manual.");
      setPhase("ready");
    }
  }

  async function savePlan(event) {
    event.preventDefault();
    if (!selectedEquipment) return setError("Selecione o equipamento a que este manual se aplica.");
    if (!baseDate) return setError("Indique a data da última manutenção ou, se ainda não ocorreu, a data de instalação.");
    if (!analysis?.events?.length) return setError("O manual não contém ciclos preventivos com intervalos claros para guardar.");

    setSaving(true);
    setError("");
    const rows = analysis.events.map((item) => ({
      equipment_id: selectedEquipment.id,
      manual_id: manual.id,
      task_title: item.title.trim(),
      interval_months: item.interval_months,
      tasks: item.tasks,
      materials: item.materials,
      source_excerpt: item.evidence,
      confidence: item.confidence,
      base_date: baseDate,
      next_due_on: addMonthsToDateKey(baseDate, item.interval_months),
      updated_at: new Date().toISOString(),
    }));
    const { error: saveError } = await supabase.from("equipment_maintenance_plans").upsert(rows, {
      onConflict: "equipment_id,manual_id,task_title,interval_months",
    });
    if (saveError) {
      setSaving(false);
      return setError("Não foi possível guardar o plano preventivo. Verifique as permissões e tente novamente.");
    }

    const { data: storedPlans, error: plansError } = await supabase
      .from("equipment_maintenance_plans")
      .select("next_due_on")
      .eq("equipment_id", selectedEquipment.id)
      .order("next_due_on", { ascending: true });
    if (plansError || !storedPlans?.length) {
      setSaving(false);
      return setError("O plano foi guardado, mas não foi possível atualizar o aviso do equipamento. Atualize a página e tente novamente.");
    }
    const { error: equipmentError } = await supabase.from("equipment").update({ next_maintenance_on: storedPlans[0].next_due_on }).eq("id", selectedEquipment.id);
    if (equipmentError) {
      setSaving(false);
      return setError("O plano foi guardado, mas não foi possível atualizar a próxima data no equipamento.");
    }
    setSaving(false);
    await onSaved?.();
    onClose();
  }

  function changeEquipment(event) {
    const nextEquipment = equipment.find((item) => item.id === event.target.value);
    setEquipmentId(event.target.value);
    setBaseDate(nextEquipment?.last_maintenance_on || nextEquipment?.installed_on || "");
    setError("");
  }

  return (
    <Modal title="Plano preventivo do manual" onClose={() => !saving && onClose()} wide>
      <div className="modal-body form-stack">
        <div className="manual-review-file"><FileText aria-hidden="true" /><div><strong>{manual.title}</strong><span>{manual.brand} · {manual.model}</span></div></div>
        {phase === "analyzing" && <div className="identification-progress" role="status"><span className="spinner" /><span>A ler o manual e a localizar ciclos, tarefas e materiais…</span></div>}
        {phase === "ready" && <><p className="modal-intro">A análise procura apenas intervalos e materiais indicados explicitamente no PDF. Confirme os resultados antes de os associar ao equipamento.</p><button className="button button-primary" type="button" onClick={analyzeManual}><Sparkles aria-hidden="true" /> Analisar este manual</button></>}
        {phase === "review" && <form className="form-stack" onSubmit={savePlan}>
          <div className="identification-result"><CheckCircle2 aria-hidden="true" /><span>Revise as recomendações extraídas. A data não é estimada: indique a última manutenção ou a instalação.</span></div>
          <div className="manual-detected-identity"><div><span>Marca detetada</span><strong>{analysis.brand || "Não identificada"}</strong></div><div><span>Modelo detetado</span><strong>{analysis.model || "Não identificado"}</strong></div>{analysis.identity_evidence && <p>Fonte do manual: “{analysis.identity_evidence}”</p>}</div>
          {analysis.brand && analysis.model && (normalize(analysis.brand) !== normalize(manual.brand) || normalize(analysis.model) !== normalize(manual.model)) && <p className="identity-mismatch" role="status">A identificação do PDF difere da ficha do manual. Confirme o equipamento correto na lista antes de guardar o plano.</p>}
          <p className="modal-intro">{analysis.summary}</p>
          {analysis.events.length ? <div className="maintenance-plan-review-list">{analysis.events.map((item, index) => <article className="maintenance-plan-review-item" key={`${item.title}-${item.interval_months}-${index}`}>
            <div className="maintenance-plan-review-heading"><div><strong>{item.title}</strong><span><CalendarClock aria-hidden="true" /> A cada {item.interval_months} {item.interval_months === 1 ? "mês" : "meses"}</span></div><StatusBadge status={item.confidence} /></div>
            {item.tasks.length > 0 && <ul>{item.tasks.map((task, taskIndex) => <li key={`${task}-${taskIndex}`}>{task}</li>)}</ul>}
            {item.materials.length > 0 ? <div className="maintenance-materials"><strong><PackageCheck aria-hidden="true" /> Materiais / peças</strong><ul>{item.materials.map((material, materialIndex) => <li key={`${material.name}-${materialIndex}`}>{material.name}{material.quantity ? ` — ${material.quantity}` : ""}</li>)}</ul></div> : <p className="muted-text">O manual não especifica peças a substituir neste ciclo.</p>}
            <p className="evidence-note">Fonte do manual: “{item.evidence}”</p>
          </article>)}</div> : <div className="empty-state"><strong>Não encontrei intervalos preventivos explícitos</strong><p>{analysis.summary || "O manual não apresenta uma periodicidade que possa ser calculada com segurança."}</p></div>}
          <label>Equipamento<select required value={equipmentId} onChange={changeEquipment}><option value="">Selecionar equipamento…</option>{equipment.map((item) => <option key={item.id} value={item.id}>{item.brand} {item.model} · {item.serial_number}</option>)}</select></label>
          {matchingEquipment && matchingEquipment.id !== equipmentId && <p className="form-hint">Equipamento com a mesma marca e modelo encontrado: {matchingEquipment.brand} {matchingEquipment.model}.</p>}
          <label>Data de referência (última manutenção ou instalação)<input required type="date" value={baseDate} onChange={(event) => setBaseDate(event.target.value)} /></label>
          {selectedEquipment && analysis.events.length > 0 && baseDate && <p className="form-hint">Próximas datas previstas: {analysis.events.map((item) => `${item.title}: ${formatDate(addMonthsToDateKey(baseDate, item.interval_months))}`).join(" · ")}</p>}
          {error && <p className="form-feedback" role="alert">{error}</p>}
          <div className="modal-actions"><button className="button button-secondary" type="button" disabled={saving} onClick={() => { setAnalysis(null); setPhase("ready"); setError(""); }}>Voltar</button><button className="button button-primary" type="submit" disabled={saving || !analysis.events.length}>{saving ? "A guardar plano…" : "Confirmar plano e datas"}</button></div>
        </form>}
        {error && phase === "ready" && <ErrorNotice message={error} />}
      </div>
    </Modal>
  );
}
