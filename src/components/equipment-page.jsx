import { useEffect, useMemo, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { CalendarClock, PackageCheck, Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";
import { supabase } from "../lib/supabase";
import { addMonthsToDateKey, addYearToDateKey, fetchClients, fetchEquipment, fetchEquipmentHistory, fetchEquipmentMaintenancePlans, formatDate, localDateKey, maintenanceStatus } from "../lib/maintenance-data";
import { ConfirmActionDialog, EmptyState, ErrorNotice, Modal, PageHeading, StatusBadge } from "./maintenance-ui";

const newEquipmentForm = { client_id: "", brand: "", model: "", serial_number: "", installed_on: "", last_maintenance_on: "", notes: "" };
const newHistoryForm = { service_date: localDateKey(), service_type: "Manutenção preventiva", description: "", technician: "", parts_replaced: "" };

export default function EquipmentPage({ preferredClientId = "", onClearPreferredClient }) {
  const { data: equipment = [], error, isLoading, mutate } = useSWR("equipment", fetchEquipment);
  const { data: clients = [] } = useSWR("clients", fetchClients);
  const { mutate: mutateCache } = useSWRConfig();
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(preferredClientId);
  const [formOpen, setFormOpen] = useState(false);
  const [editingEquipment, setEditingEquipment] = useState(null);
  const [form, setForm] = useState({ ...newEquipmentForm, client_id: preferredClientId });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [deleteEquipment, setDeleteEquipment] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [selectedEquipment, setSelectedEquipment] = useState(null);

  useEffect(() => {
    if (preferredClientId) {
      setSelectedClientId(preferredClientId);
      setForm((current) => ({ ...current, client_id: preferredClientId }));
    }
  }, [preferredClientId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-PT");
    return equipment.filter((item) => {
      const clientName = item.client?.name ?? "";
      const matchesClient = !selectedClientId || item.client_id === selectedClientId;
      const text = `${clientName} ${item.brand} ${item.model} ${item.serial_number}`.toLocaleLowerCase("pt-PT");
      return matchesClient && (!term || text.includes(term));
    });
  }, [equipment, search, selectedClientId]);

  function startCreateEquipment() {
    setEditingEquipment(null);
    setForm({ ...newEquipmentForm, client_id: preferredClientId || selectedClientId });
    setFeedback("");
    setFormOpen(true);
  }

  function startEditEquipment(item) {
    setEditingEquipment(item);
    setForm({
      client_id: item.client_id,
      brand: item.brand || "",
      model: item.model || "",
      serial_number: item.serial_number || "",
      installed_on: item.installed_on || "",
      last_maintenance_on: item.last_maintenance_on || "",
      notes: item.notes || "",
    });
    setFeedback("");
    setFormOpen(true);
  }

  async function saveEquipment(event) {
    event.preventDefault();
    const client = clients.find((item) => item.id === form.client_id);
    if (!client) return setFeedback("Selecione o cliente ao qual o equipamento pertence.");
    setSaving(true);
    setFeedback("");
    const baseDate = form.last_maintenance_on || form.installed_on || null;
    let linkedPlans = [];
    if (editingEquipment) {
      const { data: plans, error: plansError } = await supabase.from("equipment_maintenance_plans")
        .select("id,interval_months")
        .eq("equipment_id", editingEquipment.id);
      if (plansError) {
        setSaving(false);
        return setFeedback("Não foi possível validar o plano preventivo deste equipamento.");
      }
      linkedPlans = plans || [];
      if (linkedPlans.length && !baseDate) {
        setSaving(false);
        return setFeedback("Indique a data da última manutenção ou da instalação para recalcular o plano.");
      }
    }
    const planDates = linkedPlans.map((plan) => addMonthsToDateKey(baseDate, plan.interval_months)).filter(Boolean).sort();
    const nextDate = planDates[0] || addYearToDateKey(baseDate);
    const payload = {
      workspace_id: client.workspace_id,
      client_id: client.id,
      brand: form.brand.trim(),
      model: form.model.trim(),
      serial_number: form.serial_number.trim(),
      installed_on: form.installed_on || null,
      last_maintenance_on: form.last_maintenance_on || null,
      next_maintenance_on: nextDate || null,
      notes: form.notes.trim() || null,
    };

    let saveError;
    if (editingEquipment) {
      ({ error: saveError } = await supabase.from("equipment").update(payload).eq("id", editingEquipment.id));
    } else {
      const { data: authData } = await supabase.auth.getUser();
      ({ error: saveError } = await supabase.from("equipment").insert({ ...payload, created_by: authData.user?.id ?? null }));
    }
    if (saveError) {
      setSaving(false);
      return setFeedback(saveError.code === "23505" ? "Já existe um equipamento com esse número de série neste espaço de trabalho." : "Não foi possível guardar o equipamento. Verifique os dados e tente novamente.");
    }

    let planWarning = false;
    if (editingEquipment && linkedPlans.length) {
      const planUpdates = await Promise.all(linkedPlans.map((plan) => supabase.from("equipment_maintenance_plans")
        .update({
          base_date: baseDate,
          next_due_on: addMonthsToDateKey(baseDate, plan.interval_months),
          updated_at: new Date().toISOString(),
        })
        .eq("id", plan.id)));
      planWarning = planUpdates.some((result) => result.error);
    }
    await Promise.all([
      mutate(),
      mutateCache((key) => Array.isArray(key) && (key[0] === "client-equipment" || key[0] === "equipment-maintenance-plans")),
    ]);
    setSaving(false);
    setSelectedClientId(client.id);
    setForm({ ...newEquipmentForm, client_id: client.id });
    setFormOpen(false);
    setEditingEquipment(null);
    setFeedback(planWarning ? "Equipamento atualizado; algumas datas do plano não foram atualizadas e devem ser revistas." : editingEquipment ? "Dados do equipamento atualizados." : "Equipamento registado.");
  }

  async function removeEquipment() {
    if (!deleteEquipment) return;
    setDeleteBusy(true);
    setDeleteError("");
    const { error: removalError } = await supabase.from("equipment").delete().eq("id", deleteEquipment.id);
    if (removalError) {
      setDeleteBusy(false);
      return setDeleteError("Não foi possível eliminar o equipamento. Verifique as permissões e tente novamente.");
    }
    const deletedId = deleteEquipment.id;
    await Promise.all([
      mutate(),
      mutateCache((key) => Array.isArray(key) && ["client-equipment", "equipment-history", "equipment-maintenance-plans"].includes(key[0])),
    ]);
    setSelectedEquipment((current) => current?.id === deletedId ? null : current);
    setDeleteBusy(false);
    setDeleteEquipment(null);
    setFeedback("Equipamento, plano preventivo e histórico de assistência associados eliminados.");
  }

  function clearClientFilter() {
    setSelectedClientId("");
    setSearch("");
    onClearPreferredClient?.();
  }

  const selectedClientName = clients.find((client) => client.id === selectedClientId)?.name;

  return (
    <div className="page-content">
      <PageHeading eyebrow="Inventário técnico" title="Equipamentos" description="Pesquise pelo nome do cliente para ver todos os equipamentos, números de série e datas de manutenção." action={<button className="button button-primary" type="button" onClick={startCreateEquipment}><Plus aria-hidden="true" /> Registar equipamento</button>} />

      <section className="content-card equipment-search-panel">
        <label className="search-field equipment-search"><Search aria-hidden="true" /><span className="visually-hidden">Pesquisar equipamento ou cliente</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar nome do cliente, marca, modelo ou número de série" /></label>
        {selectedClientId && <div className="active-client-filter"><span>Cliente: <strong>{selectedClientName || "selecionado"}</strong></span><button type="button" className="text-action" onClick={clearClientFilter}>Limpar pesquisa</button></div>}
      </section>

      {feedback && !formOpen && <p className="inline-feedback" role="status">{feedback}</p>}
      {error && <ErrorNotice message="Não foi possível carregar os equipamentos." onRetry={() => mutate()} />}
      <section className="content-card equipment-results" aria-label="Resultados de equipamentos">
        <div className="section-title-row"><div><span className="eyebrow">Resultados</span><h2>{filtered.length} equipamento{filtered.length === 1 ? "" : "s"}</h2></div><span className="subtle-label"><CalendarClock aria-hidden="true" /> Plano por manual ou intervalo anual</span></div>
        {isLoading ? <div className="loading-line" aria-label="A carregar equipamentos" /> : filtered.length ? (
          <div className="table-scroll"><table className="data-table equipment-table"><thead><tr><th>Cliente</th><th>Marca / Modelo</th><th>Número de série</th><th>Última manutenção</th><th>Próxima manutenção</th><th>Estado</th><th><span className="visually-hidden">Ações</span></th></tr></thead><tbody>
            {filtered.map((item) => <tr key={item.id}>
              <td><strong>{item.client?.name ?? "Cliente sem nome"}</strong></td><td><button type="button" className="equipment-open-button" onClick={() => setSelectedEquipment(item)}><strong>{item.brand}</strong><small className="table-subline">{item.model}</small></button></td><td><code>{item.serial_number}</code></td><td>{formatDate(item.last_maintenance_on)}</td><td>{formatDate(item.next_maintenance_on)}</td><td><StatusBadge status={maintenanceStatus(item.next_maintenance_on)} /></td><td><div className="table-actions"><button type="button" className="icon-button" aria-label={`Editar ${item.brand} ${item.model}`} title="Editar equipamento" onClick={() => startEditEquipment(item)}><Pencil aria-hidden="true" /></button><button type="button" className="icon-button icon-button-danger" aria-label={`Eliminar ${item.brand} ${item.model}`} title="Eliminar equipamento" onClick={() => { setDeleteEquipment(item); setDeleteError(""); }}><Trash2 aria-hidden="true" /></button></div></td>
            </tr>)}
          </tbody></table></div>
        ) : <EmptyState icon={Wrench} title={search || selectedClientId ? "Nenhum equipamento encontrado" : "Ainda não há equipamentos registados"} description={search || selectedClientId ? "Experimente outro nome de cliente, marca, modelo ou série." : "Registe equipamentos para começar a acompanhar a manutenção preventiva anual."} action={!clients.length ? undefined : <button className="button button-primary" type="button" onClick={startCreateEquipment}><Plus aria-hidden="true" /> Registar equipamento</button>} />}
      </section>

      {formOpen && <Modal title={editingEquipment ? "Editar equipamento" : "Registar equipamento"} onClose={() => { if (!saving) { setFormOpen(false); setEditingEquipment(null); } }}>
        <form className="modal-body form-stack" onSubmit={saveEquipment}>
          <label>Cliente<select required value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })}><option value="">Selecionar cliente…</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <div className="form-grid"><label>Marca<input required value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></label><label>Modelo<input required value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></label></div>
          <label>Número de série<input required value={form.serial_number} onChange={(event) => setForm({ ...form, serial_number: event.target.value })} /></label>
          <div className="form-grid"><label>Data de instalação<input type="date" value={form.installed_on} onChange={(event) => setForm({ ...form, installed_on: event.target.value })} /></label><label>Última manutenção<input type="date" value={form.last_maintenance_on} onChange={(event) => setForm({ ...form, last_maintenance_on: event.target.value })} /></label></div>
          <p className="form-hint">Sem um plano extraído de manual, a aplicação usa um intervalo anual. Quando existir um plano, as datas passam a seguir as periodicidades indicadas no manual.</p>
          <label>Notas<textarea rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          {feedback && <p className="form-feedback" role="alert">{feedback}</p>}
          <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => { setFormOpen(false); setEditingEquipment(null); }}>Cancelar</button><button className="button button-primary" type="submit" disabled={saving || !clients.length}>{saving ? "A guardar…" : editingEquipment ? "Guardar alterações" : "Guardar equipamento"}</button></div>
        </form>
      </Modal>}
      {deleteEquipment && <ConfirmActionDialog title="Eliminar equipamento?" description={`O equipamento “${deleteEquipment.brand} ${deleteEquipment.model}” será removido, juntamente com o histórico de assistências e os planos preventivos associados. O manual ficará na biblioteca.`} confirmLabel="Eliminar equipamento" busy={deleteBusy} error={deleteError} onCancel={() => { if (!deleteBusy) setDeleteEquipment(null); }} onConfirm={removeEquipment} />}
      {selectedEquipment && <EquipmentDetails equipment={selectedEquipment} onClose={() => setSelectedEquipment(null)} onEquipmentChanged={(changes) => { mutate(); if (changes) setSelectedEquipment((current) => current ? { ...current, ...changes } : current); }} />}
    </div>
  );
}

function EquipmentDetails({ equipment, onClose, onEquipmentChanged }) {
  const { data: history = [], error, isLoading, mutate } = useSWR(["equipment-history", equipment.id], ([, id]) => fetchEquipmentHistory(id));
  const { data: plans = [], error: plansError, isLoading: plansLoading } = useSWR(["equipment-maintenance-plans", equipment.id], ([, id]) => fetchEquipmentMaintenancePlans(id));
  const [form, setForm] = useState(newHistoryForm);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  async function addHistory(event) {
    event.preventDefault();
    setSaving(true);
    setFeedback("");
    const { data: authData } = await supabase.auth.getUser();
    const { error: saveError } = await supabase.from("equipment_service_history").insert({
      ...form,
      equipment_id: equipment.id,
      workspace_id: equipment.workspace_id,
      description: form.description.trim(),
      technician: form.technician.trim() || null,
      parts_replaced: form.parts_replaced.trim() || null,
      created_by: authData.user?.id ?? null,
    });
    if (saveError) {
      setSaving(false);
      return setFeedback("Não foi possível registar a assistência. Tente novamente.");
    }

    let scheduleWarning = "";
    let equipmentChanges = null;
    if (form.service_type === "Manutenção preventiva") {
      const { data: plans, error: plansError } = await supabase
        .from("equipment_maintenance_plans")
        .select("id,interval_months")
        .eq("equipment_id", equipment.id);
      let nextDate = addYearToDateKey(form.service_date);
      if (plansError) {
        scheduleWarning = "A assistência foi registada, mas não foi possível recalcular o plano preventivo.";
      } else if (plans?.length) {
        const reschedules = await Promise.all(plans.map((plan) => supabase
          .from("equipment_maintenance_plans")
          .update({
            base_date: form.service_date,
            next_due_on: addMonthsToDateKey(form.service_date, plan.interval_months),
            updated_at: new Date().toISOString(),
          })
          .eq("id", plan.id)));
        const failedReschedule = reschedules.some((result) => result.error);
        if (failedReschedule) scheduleWarning = "A assistência foi registada, mas algumas datas do plano não foram atualizadas.";
        const nextDates = plans.map((plan) => addMonthsToDateKey(form.service_date, plan.interval_months)).sort();
        nextDate = nextDates[0] || nextDate;
      }
      const { error: equipmentError } = await supabase
        .from("equipment")
        .update({ last_maintenance_on: form.service_date, next_maintenance_on: nextDate })
        .eq("id", equipment.id);
      if (equipmentError) scheduleWarning = "A assistência foi registada, mas a próxima data do equipamento não foi atualizada.";
      else equipmentChanges = { last_maintenance_on: form.service_date, next_maintenance_on: nextDate };
    }

    setSaving(false);
    setForm(newHistoryForm);
    setFeedback(scheduleWarning);
    await mutate();
    onEquipmentChanged?.(equipmentChanges);
  }

  return (
    <Modal title="Ficha do equipamento" onClose={onClose} wide>
      <div className="modal-body equipment-detail-body">
        <div className="equipment-detail-header"><div className="equipment-detail-icon"><Wrench aria-hidden="true" /></div><div><span className="eyebrow">{equipment.client?.name ?? "Cliente"}</span><h3>{equipment.brand} {equipment.model}</h3><p>Número de série <strong>{equipment.serial_number}</strong></p></div><StatusBadge status={maintenanceStatus(equipment.next_maintenance_on)} /></div>
        <div className="equipment-facts"><div><span>Instalado em</span><strong>{formatDate(equipment.installed_on)}</strong></div><div><span>Última manutenção</span><strong>{formatDate(equipment.last_maintenance_on)}</strong></div><div><span>Próxima manutenção</span><strong>{formatDate(equipment.next_maintenance_on)}</strong></div></div>
        <section className="maintenance-plan-section" aria-labelledby="maintenance-plan-title">
          <div className="section-title-row"><div><span className="eyebrow">Com base no manual</span><h3 id="maintenance-plan-title">Plano preventivo e materiais</h3></div><span className="section-count">{plans.length}</span></div>
          {plansError ? <ErrorNotice message="Não foi possível carregar o plano preventivo." /> : plansLoading ? <div className="loading-line" aria-label="A carregar plano preventivo" /> : plans.length ? <div className="maintenance-plan-list">{plans.map((plan) => <article className="maintenance-plan-item" key={plan.id}>
            <div className="maintenance-plan-review-heading"><div><strong>{plan.task_title}</strong><span><CalendarClock aria-hidden="true" /> A cada {plan.interval_months} {plan.interval_months === 1 ? "mês" : "meses"} · próxima: {formatDate(plan.next_due_on)}</span></div><StatusBadge status={plan.confidence} /></div>
            {plan.tasks.length > 0 && <ul>{plan.tasks.map((task, index) => <li key={`${task}-${index}`}>{task}</li>)}</ul>}
            {plan.materials.length > 0 ? <div className="maintenance-materials"><strong><PackageCheck aria-hidden="true" /> Materiais / peças</strong><ul>{plan.materials.map((material, index) => <li key={`${material.name}-${index}`}>{material.name}{material.quantity ? ` — ${material.quantity}` : ""}</li>)}</ul></div> : <p className="muted-text">O manual não especifica peças a substituir neste ciclo.</p>}
            <details className="maintenance-evidence"><summary>Ver referência do manual</summary><p>“{plan.source_excerpt}”</p></details>
          </article>)}</div> : <p className="muted-text">Ainda não existe um plano extraído de manual para este equipamento. Analise o PDF na Biblioteca técnica.</p>}
        </section>
        <div className="history-layout">
          <section className="history-list"><div className="section-title-row"><div><span className="eyebrow">Registo técnico</span><h3>Histórico de assistências</h3></div><span className="section-count">{history.length}</span></div>
            {error ? <ErrorNotice message="Não foi possível carregar o histórico." onRetry={() => mutate()} /> : isLoading ? <div className="loading-line" aria-label="A carregar histórico" /> : history.length ? history.map((entry) => <article className="history-entry" key={entry.id}><div className="history-entry-date">{formatDate(entry.service_date)}</div><div><strong>{entry.service_type}</strong><p>{entry.description}</p>{entry.parts_replaced && <small>Peças: {entry.parts_replaced}</small>}{entry.technician && <small>Técnico: {entry.technician}</small>}</div></article>) : <EmptyState icon={Wrench} title="Sem assistências registadas" description="Registe a primeira intervenção técnica deste equipamento." />}
          </section>
          <form className="history-form form-stack" onSubmit={addHistory}><div><span className="eyebrow">Nova intervenção</span><h3>Registar assistência</h3></div><label>Data<input type="date" required value={form.service_date} onChange={(event) => setForm({ ...form, service_date: event.target.value })} /></label><label>Tipo de assistência<select value={form.service_type} onChange={(event) => setForm({ ...form, service_type: event.target.value })}><option>Manutenção preventiva</option><option>Assistência técnica</option><option>Reparação</option><option>Inspeção</option></select></label><label>Descrição<textarea required rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label>Técnico<input value={form.technician} onChange={(event) => setForm({ ...form, technician: event.target.value })} /></label><label>Peças substituídas<textarea rows="2" value={form.parts_replaced} onChange={(event) => setForm({ ...form, parts_replaced: event.target.value })} /></label>{feedback && <p className="form-feedback" role="alert">{feedback}</p>}<button className="button button-primary button-block" type="submit" disabled={saving}>{saving ? "A guardar…" : "Guardar assistência"}</button><p className="form-hint">Com um plano extraído do manual, esta intervenção recalcula os ciclos e as próximas datas. Sem plano, é aplicado o intervalo anual.</p></form>
        </div>
      </div>
    </Modal>
  );
}
