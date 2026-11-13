import { useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { BookOpen, Download, FileText, FolderOpen, Pencil, Plus, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { supabase } from "../lib/supabase";
import { extractPdfText } from "../lib/manual-pdf";
import { addYearToDateKey, fetchEquipment, fetchManuals, MANUALS_BUCKET } from "../lib/maintenance-data";
import { ConfirmActionDialog, EmptyState, ErrorNotice, Modal, PageHeading, StatusBadge } from "./maintenance-ui";
import ManualMaintenanceReview from "./manual-maintenance-review";

function slug(value) {
  return String(value || "manual")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "manual";
}

export default function ManualsPage() {
  const { data: manuals = [], error, isLoading, mutate } = useSWR("equipment-manuals", fetchManuals);
  const { data: equipment = [], mutate: mutateEquipment } = useSWR("equipment", fetchEquipment);
  const { mutate: mutateCache } = useSWRConfig();
  const [search, setSearch] = useState("");
  const [activeManual, setActiveManual] = useState(null);
  const [editingManual, setEditingManual] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteManual, setDeleteManual] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [orphanedPdf, setOrphanedPdf] = useState(null);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [planManual, setPlanManual] = useState(null);
  const [feedback, setFeedback] = useState("");
  const inputRef = useRef(null);

  const groups = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-PT");
    const filtered = manuals.filter((manual) => `${manual.brand} ${manual.model} ${manual.title} ${manual.file_name}`.toLocaleLowerCase("pt-PT").includes(term));
    return filtered.reduce((brands, manual) => {
      brands[manual.brand] ??= {};
      brands[manual.brand][manual.model] ??= [];
      brands[manual.brand][manual.model].push(manual);
      return brands;
    }, {});
  }, [manuals, search]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFeedback("");
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) return setFeedback("Por agora, a biblioteca aceita manuais em PDF.");
    if (file.size > 50 * 1024 * 1024) return setFeedback("O PDF ultrapassa o limite de 50 MB.");
    const draft = { file, brand: "", model: "", title: file.name.replace(/\.pdf$/i, ""), confidence: "review", evidence: "" };
    setActiveManual(draft);
    setIdentifying(true);
    try {
      const text = await extractPdfText(file);
      if (text.length < 30) {
        setFeedback("Este PDF parece não ter texto pesquisável. Preencha a marca e o modelo manualmente.");
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("A sessão expirou. Inicie sessão novamente.");
      const response = await fetch("/api/manual-identify", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ text }),
      });
      const responseText = await response.text();
      let result = null;
      try {
        result = responseText ? JSON.parse(responseText) : null;
      } catch {
        result = null;
      }
      if (!response.ok) {
        throw new Error(result?.error || `O serviço de identificação não respondeu corretamente (HTTP ${response.status}). Pode preencher a marca e o modelo manualmente.`);
      }
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error("O serviço de identificação devolveu uma resposta vazia ou inválida. Pode preencher a marca e o modelo manualmente.");
      }
      setActiveManual((current) => current ? { ...current, ...result } : current);
    } catch (cause) {
      setFeedback(cause.message || "Não foi possível identificar automaticamente. Pode preencher os campos manualmente.");
    } finally {
      setIdentifying(false);
    }
  }

  async function saveManual(event) {
    event.preventDefault();
    if (!activeManual?.brand.trim() || !activeManual?.model.trim()) return setFeedback("Indique a marca e o modelo antes de guardar.");
    setBusy(true);
    setFeedback("");
    const { data: authData } = await supabase.auth.getUser();
    const id = crypto.randomUUID();
    const safeFileName = activeManual.file.name.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-110);
    const storagePath = `${slug(activeManual.brand)}/${slug(activeManual.model)}/${id}-${safeFileName}`;
    const { error: uploadError } = await supabase.storage.from(MANUALS_BUCKET).upload(storagePath, activeManual.file, { contentType: "application/pdf", upsert: false });
    if (uploadError) {
      setBusy(false);
      return setFeedback("Não foi possível guardar o PDF. Verifique a ligação e tente novamente.");
    }
    const { error: insertError } = await supabase.from("equipment_manuals").insert({
      brand: activeManual.brand.trim(),
      model: activeManual.model.trim(),
      title: activeManual.title.trim() || activeManual.file.name,
      file_name: activeManual.file.name,
      storage_path: storagePath,
      mime_type: "application/pdf",
      file_size: activeManual.file.size,
      identification_confidence: activeManual.confidence || "review",
      extracted_reference: activeManual.evidence?.trim() || null,
      created_by: authData.user?.id ?? null,
    });
    if (insertError) {
      await supabase.storage.from(MANUALS_BUCKET).remove([storagePath]);
      setBusy(false);
      return setFeedback("O PDF foi carregado, mas não foi possível guardar a ficha do manual.");
    }
    setBusy(false);
    setActiveManual(null);
    setFeedback("Manual adicionado à biblioteca.");
    await mutate();
  }

  async function saveManualEdits(event) {
    event.preventDefault();
    if (!editingManual) return;
    setEditBusy(true);
    setEditError("");
    const { error: updateError } = await supabase.from("equipment_manuals").update({
      brand: editingManual.brand.trim(),
      model: editingManual.model.trim(),
      title: editingManual.title.trim(),
    }).eq("id", editingManual.id);
    setEditBusy(false);
    if (updateError) return setEditError("Não foi possível atualizar o manual. Tente novamente.");
    await mutate();
    setEditingManual(null);
    setFeedback("Dados do manual atualizados.");
  }

  async function removeManual() {
    if (!deleteManual) return;
    setDeleteBusy(true);
    setDeleteError("");
    const { data: linkedPlans, error: plansReadError } = await supabase
      .from("equipment_maintenance_plans")
      .select("equipment_id")
      .eq("manual_id", deleteManual.id);
    if (plansReadError) {
      setDeleteBusy(false);
      return setDeleteError("Não foi possível verificar os planos associados; o manual não foi eliminado.");
    }

    const equipmentIds = [...new Set((linkedPlans || []).map((plan) => plan.equipment_id).filter(Boolean))];
    const { error: deleteError } = await supabase.from("equipment_manuals").delete().eq("id", deleteManual.id);
    if (deleteError) {
      setDeleteBusy(false);
      return setDeleteError("Não foi possível eliminar o manual. Verifique as permissões e tente novamente.");
    }

    const { error: storageError } = deleteManual.storage_path
      ? await supabase.storage.from(MANUALS_BUCKET).remove([deleteManual.storage_path])
      : { error: null };
    if (storageError) setOrphanedPdf({ path: deleteManual.storage_path, title: deleteManual.title });

    let scheduleWarning = false;
    if (equipmentIds.length) {
      const { data: linkedEquipment, error: equipmentReadError } = await supabase
        .from("equipment")
        .select("id,installed_on,last_maintenance_on")
        .in("id", equipmentIds);
      if (equipmentReadError) {
        scheduleWarning = true;
      } else {
        const scheduleUpdates = await Promise.all((linkedEquipment || []).map(async (item) => {
          const { data: remainingPlans, error: remainingPlansError } = await supabase
            .from("equipment_maintenance_plans")
            .select("next_due_on")
            .eq("equipment_id", item.id)
            .order("next_due_on", { ascending: true })
            .limit(1);
          if (remainingPlansError) return remainingPlansError;
          const nextDate = remainingPlans?.[0]?.next_due_on || addYearToDateKey(item.last_maintenance_on || item.installed_on);
          const { error: updateError } = await supabase.from("equipment")
            .update({ next_maintenance_on: nextDate || null })
            .eq("id", item.id);
          return updateError;
        }));
        scheduleWarning = scheduleUpdates.some(Boolean);
      }
    }

    await Promise.all([
      mutate(),
      mutateEquipment(),
      mutateCache((key) => Array.isArray(key) && key[0] === "equipment-maintenance-plans"),
    ]);
    setDeleteBusy(false);
    setDeleteManual(null);
    setFeedback([
      storageError && "O manual e os planos foram eliminados, mas não foi possível remover o PDF do armazenamento.",
      scheduleWarning && "Não foi possível recalcular algumas datas de manutenção.",
    ].filter(Boolean).join(" ") || "Manual, PDF e planos preventivos associados eliminados.");
  }

  async function retryPdfCleanup() {
    if (!orphanedPdf?.path) return;
    setCleanupBusy(true);
    const { error: cleanupError } = await supabase.storage.from(MANUALS_BUCKET).remove([orphanedPdf.path]);
    setCleanupBusy(false);
    if (cleanupError) return setFeedback("O PDF continua no armazenamento. Tente novamente mais tarde.");
    setOrphanedPdf(null);
    setFeedback("PDF removido do armazenamento.");
  }

  async function openManual(manual) {
    const { data, error: urlError } = await supabase.storage.from(MANUALS_BUCKET).createSignedUrl(manual.storage_path, 60);
    if (urlError || !data?.signedUrl) return setFeedback("Não foi possível abrir este manual.");
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  const count = Object.values(groups).reduce((total, models) => total + Object.values(models).reduce((sum, items) => sum + items.length, 0), 0);

  return (
    <div className="page-content">
      <PageHeading eyebrow="Biblioteca técnica" title="Manuais de equipamentos" description="Organize os PDFs por marca e modelo. A identificação automática é uma sugestão e deve ser confirmada antes de guardar." action={<><input ref={inputRef} className="visually-hidden" type="file" accept="application/pdf,.pdf" onChange={handleFile} aria-label="Importar manual PDF" /><button className="button button-primary" type="button" onClick={() => inputRef.current?.click()}><Upload aria-hidden="true" /> Importar manual</button></>} />
      <section className="content-card directory-toolbar"><label className="search-field"><Search aria-hidden="true" /><span className="visually-hidden">Pesquisar manuais</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar por marca, modelo ou nome do manual" /></label><span className="record-count">{count} manuais</span></section>
      {feedback && !activeManual && <p className="inline-feedback" role="status">{feedback}</p>}
      {orphanedPdf && <div className="storage-cleanup-notice" role="status"><span>O ficheiro PDF de “{orphanedPdf.title}” ainda está no armazenamento.</span><button className="button button-quiet" type="button" onClick={retryPdfCleanup} disabled={cleanupBusy}>{cleanupBusy ? "A tentar…" : "Tentar remover PDF"}</button></div>}
      {error && <ErrorNotice message="Não foi possível carregar a biblioteca de manuais." onRetry={() => mutate()} />}
      {isLoading ? <div className="content-card loading-panel"><div className="loading-line" aria-label="A carregar manuais" /></div> : Object.keys(groups).length ? (
        <div className="manual-brand-list">
          {Object.entries(groups).sort(([a], [b]) => a.localeCompare(b, "pt-PT")).map(([brand, models]) => (
            <section className="content-card brand-folder" key={brand}>
              <header className="brand-folder-header"><div className="folder-icon"><FolderOpen aria-hidden="true" /></div><div><span className="eyebrow">Marca</span><h2>{brand}</h2></div><span className="record-count">{Object.values(models).reduce((sum, items) => sum + items.length, 0)} manuais</span></header>
              {Object.entries(models).sort(([a], [b]) => a.localeCompare(b, "pt-PT")).map(([model, items]) => <section className="model-folder" key={model}><div className="model-folder-title"><div><span className="eyebrow">Modelo</span><h3>{model}</h3></div><span className="section-count">{items.length}</span></div><div className="manual-list">{items.map((manual) => <article className="manual-row" key={manual.id}><div className="manual-file-icon"><FileText aria-hidden="true" /></div><div className="manual-file-details"><strong>{manual.title}</strong><span>{manual.file_name} · {(manual.file_size / (1024 * 1024)).toFixed(1)} MB</span></div><StatusBadge status={manual.identification_confidence || "review"} /><button type="button" className="button button-quiet" onClick={() => setPlanManual(manual)}><Sparkles aria-hidden="true" /> Analisar plano</button><button type="button" className="button button-quiet" onClick={() => openManual(manual)}><Download aria-hidden="true" /> Abrir PDF</button><button type="button" className="button button-quiet" onClick={() => { setEditingManual({ ...manual }); setEditError(""); }} aria-label={`Editar o manual ${manual.title}`}><Pencil aria-hidden="true" /> Editar</button><button type="button" className="button button-quiet button-danger-quiet" onClick={() => { setDeleteManual(manual); setDeleteError(""); }} aria-label={`Eliminar o manual ${manual.title}`}><Trash2 aria-hidden="true" /> Eliminar</button></article>)}</div></section>)}
            </section>
          ))}
        </div>
      ) : <div className="content-card"><EmptyState icon={BookOpen} title={search ? "Nenhum manual encontrado" : "A biblioteca ainda está vazia"} description={search ? "Experimente procurar por outra marca ou modelo." : "Importe um manual PDF para começar a organizar a biblioteca por marca e modelo."} action={!search && <button className="button button-primary" type="button" onClick={() => inputRef.current?.click()}><Plus aria-hidden="true" /> Importar primeiro manual</button>} /></div>}

      {editingManual && <Modal title="Editar manual" onClose={() => { if (!editBusy) setEditingManual(null); }}>
        <form className="modal-body form-stack" onSubmit={saveManualEdits}>
          <label>Marca<input autoFocus required value={editingManual.brand} onChange={(event) => setEditingManual({ ...editingManual, brand: event.target.value })} /></label>
          <label>Modelo<input required value={editingManual.model} onChange={(event) => setEditingManual({ ...editingManual, model: event.target.value })} /></label>
          <label>Nome do manual<input required value={editingManual.title} onChange={(event) => setEditingManual({ ...editingManual, title: event.target.value })} /></label>
          {editError && <p className="form-feedback" role="alert">{editError}</p>}
          <div className="modal-actions"><button className="button button-secondary" type="button" disabled={editBusy} onClick={() => setEditingManual(null)}>Cancelar</button><button className="button button-primary" type="submit" disabled={editBusy}>{editBusy ? "A guardar…" : "Guardar alterações"}</button></div>
        </form>
      </Modal>}
      {deleteManual && <ConfirmActionDialog title="Eliminar manual?" description={`O manual “${deleteManual.title}” e o PDF serão removidos. Os planos preventivos que o usam também serão eliminados; os equipamentos e o histórico de assistências serão mantidos.`} confirmLabel="Eliminar manual" busy={deleteBusy} error={deleteError} onCancel={() => { if (!deleteBusy) setDeleteManual(null); }} onConfirm={removeManual} />}
      {planManual && <ManualMaintenanceReview manual={planManual} equipment={equipment} onClose={() => setPlanManual(null)} onSaved={() => mutateEquipment()} />}
      {activeManual && <Modal title="Confirmar dados do manual" onClose={() => { if (!busy) setActiveManual(null); }}>
        <form className="modal-body form-stack" onSubmit={saveManual}>
          <div className="manual-review-file"><FileText aria-hidden="true" /><div><strong>{activeManual.file.name}</strong><span>{(activeManual.file.size / (1024 * 1024)).toFixed(1)} MB · PDF</span></div></div>
          {identifying ? <div className="identification-progress" role="status"><span className="spinner" /><span>A analisar o texto do manual…</span></div> : <div className="identification-result"><Sparkles aria-hidden="true" /><span>{activeManual.brand && activeManual.model ? "Sugestão automática pronta — confirme os campos antes de guardar." : "Complete ou corrija a marca e o modelo identificados."}</span><StatusBadge status={activeManual.confidence || "review"} /></div>}
          {activeManual.evidence && <p className="evidence-note">Referência encontrada: “{activeManual.evidence}”</p>}
          <label>Marca<input autoFocus required value={activeManual.brand} onChange={(event) => setActiveManual({ ...activeManual, brand: event.target.value })} /></label>
          <label>Modelo<input required value={activeManual.model} onChange={(event) => setActiveManual({ ...activeManual, model: event.target.value })} /></label>
          <label>Nome do manual<input required value={activeManual.title} onChange={(event) => setActiveManual({ ...activeManual, title: event.target.value })} /></label>
          {feedback && <p className="form-feedback" role="alert">{feedback}</p>}
          <p className="form-hint">A extração automática pode não funcionar em PDFs digitalizados. Os dados só são guardados depois da sua confirmação.</p>
          <div className="modal-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={() => setActiveManual(null)}>Cancelar</button><button className="button button-primary" type="submit" disabled={busy || identifying}>{busy ? "A guardar…" : "Confirmar e guardar"}</button></div>
        </form>
      </Modal>}
    </div>
  );
}
