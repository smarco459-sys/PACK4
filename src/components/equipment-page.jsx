import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { CalendarClock, Plus, Search, Wrench } from "lucide-react";
import { supabase } from "../lib/supabase";
import { addYearToDateKey, fetchClients, fetchEquipment, fetchEquipmentHistory, formatDate, localDateKey, maintenanceStatus } from "../lib/maintenance-data";
import { EmptyState, ErrorNotice, Modal, PageHeading, StatusBadge } from "./maintenance-ui";

const newEquipmentForm = { client_id: "", brand: "", model: "", serial_number: "", installed_on: "", last_maintenance_on: "", notes: "" };
const newHistoryForm = { service_date: localDateKey(), service_type: "Manutenção preventiva", description: "", technician: "", parts_replaced: "" };

export default function EquipmentPage({ preferredClientId = "", onClearPreferredClient }) {
  const { data: equipment = [], error, isLoading, mutate } = useSWR("equipment", fetchEquipment);
  const { data: clients = [] } = useSWR("clients", fetchClients);
  const [search, setSearch] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(preferredClientId);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ ...newEquipmentForm, client_id: preferredClientId });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
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

  async function saveEquipment(event) {
    event.preventDefault();
    const client = clients.find((item) => item.id === form.client_id);
    if (!client) return setFeedback("Selecione o cliente ao qual o equipamento pertence.");
    setSaving(true);
    setFeedback("");
    const nextDate = addYearToDateKey(form.last_maintenance_on || form.installed_on);
    const { data: authData } = await supabase.auth.getUser();
    const { error: saveError } = await supabase.from("equipment").insert({
      workspace_id: client.workspace_id,
      client_id: client.id,
      brand: form.brand.trim(),
      model: form.model.trim(),
      serial_number: form.serial_number.trim(),
      installed_on: form.installed_on || null,
      last_maintenance_on: form.last_maintenance_on || null,
      next_maintenance_on: nextDate || null,
      notes: form.notes.trim() || null,
      created_by: authData.user?.id ?? null,
    });
    setSaving(false);
    if (saveError) return setFeedback(saveError.code === "23505" ? "Já existe um equipamento com esse número de série neste espaço de trabalho." : "Não foi possível guardar o equipamento. Verifique os dados e tente novamente.");
    await mutate();
    setSelectedClientId(client.id);
    setForm({ ...newEquipmentForm, client_id: client.id });
    setFormOpen(false);
  }

  function clearClientFilter() {
    setSelectedClientId("");
    setSearch("");
    onClearPreferredClient?.();
  }

  const selectedClientName = clients.find((client) => client.id === selectedClientId)?.name;

  return (
    <div className="page-content">
      <PageHeading eyebrow="Inventário técnico" title="Equipamentos" description="Pesquise pelo nome do cliente para ver todos os equipamentos, números de série e datas de manutenção." action={<button className="button button-primary" type="button" onClick={() => { setFeedback(""); setFormOpen(true); }}><Plus aria-hidden="true" /> Registar equipamento</button>} />

      <section className="content-card equipment-search-panel">
        <label className="search-field equipment-search"><Search aria-hidden="true" /><span className="visually-hidden">Pesquisar equipamento ou cliente</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Pesquisar nome do cliente, marca, modelo ou número de série" /></label>
        {selectedClientId && <div className="active-client-filter"><span>Cliente: <strong>{selectedClientName || "selecionado"}</strong></span><button type="button" className="text-action" onClick={clearClientFilter}>Limpar pesquisa</button></div>}
      </section>

      {error && <ErrorNotice message="Não foi possível carregar os equipamentos." onRetry={() => mutate()} />}
      <section className="content-card equipment-results" aria-label="Resultados de equipamentos">
        <div className="section-title-row"><div><span className="eyebrow">Resultados</span><h2>{filtered.length} equipamento{filtered.length === 1 ? "" : "s"}</h2></div><span className="subtle-label"><CalendarClock aria-hidden="true" /> Manutenção preventiva anual</span></div>
        {isLoading ? <div className="loading-line" aria-label="A carregar equipamentos" /> : filtered.length ? (
          <div className="table-scroll"><table className="data-table equipment-table"><thead><tr><th>Cliente</th><th>Marca / Modelo</th><th>Número de série</th><th>Última manutenção</th><th>Próxima manutenção</th><th>Estado</th></tr></thead><tbody>
            {filtered.map((item) => <tr key={item.id}>
              <td><strong>{item.client?.name ?? "Cliente sem nome"}</strong></td><td><button type="button" className="equipment-open-button" onClick={() => setSelectedEquipment(item)}><strong>{item.brand}</strong><small className="table-subline">{item.model}</small></button></td><td><code>{item.serial_number}</code></td><td>{formatDate(item.last_maintenance_on)}</td><td>{formatDate(item.next_maintenance_on)}</td><td><StatusBadge status={maintenanceStatus(item.next_maintenance_on)} /></td>
            </tr>)}
          </tbody></table></div>
        ) : <EmptyState icon={Wrench} title={search || selectedClientId ? "Nenhum equipamento encontrado" : "Ainda não há equipamentos registados"} description={search || selectedClientId ? "Experimente outro nome de cliente, marca, modelo ou série." : "Registe equipamentos para começar a acompanhar a manutenção preventiva anual."} action={!clients.length ? undefined : <button className="button button-primary" type="button" onClick={() => setFormOpen(true)}><Plus aria-hidden="true" /> Registar equipamento</button>} />}
      </section>

      {formOpen && <Modal title="Registar equipamento" onClose={() => setFormOpen(false)}>
        <form className="modal-body form-stack" onSubmit={saveEquipment}>
          <label>Cliente<select required value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })}><option value="">Selecionar cliente…</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
          <div className="form-grid"><label>Marca<input required value={form.brand} onChange={(event) => setForm({ ...form, brand: event.target.value })} /></label><label>Modelo<input required value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></label></div>
          <label>Número de série<input required value={form.serial_number} onChange={(event) => setForm({ ...form, serial_number: event.target.value })} /></label>
          <div className="form-grid"><label>Data de instalação<input type="date" value={form.installed_on} onChange={(event) => setForm({ ...form, installed_on: event.target.value })} /></label><label>Última manutenção<input type="date" value={form.last_maintenance_on} onChange={(event) => setForm({ ...form, last_maintenance_on: event.target.value })} /></label></div>
          <p className="form-hint">A próxima manutenção preventiva é calculada para um ano após a última manutenção, ou após a instalação se ainda não existir histórico.</p>
          <label>Notas<textarea rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          {feedback && <p className="form-feedback" role="alert">{feedback}</p>}
          <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setFormOpen(false)}>Cancelar</button><button className="button button-primary" type="submit" disabled={saving || !clients.length}>{saving ? "A guardar…" : "Guardar equipamento"}</button></div>
        </form>
      </Modal>}
      {selectedEquipment && <EquipmentDetails equipment={selectedEquipment} onClose={() => setSelectedEquipment(null)} onEquipmentChanged={() => mutate()} />}
    </div>
  );
}

function EquipmentDetails({ equipment, onClose, onEquipmentChanged }) {
  const { data: history = [], error, isLoading, mutate } = useSWR(["equipment-history", equipment.id], ([, id]) => fetchEquipmentHistory(id));
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
    setSaving(false);
    if (saveError) return setFeedback("Não foi possível registar a assistência. Tente novamente.");
    setForm(newHistoryForm);
    await mutate();
    onEquipmentChanged?.();
  }

  return (
    <Modal title="Ficha do equipamento" onClose={onClose} wide>
      <div className="modal-body equipment-detail-body">
        <div className="equipment-detail-header"><div className="equipment-detail-icon"><Wrench aria-hidden="true" /></div><div><span className="eyebrow">{equipment.client?.name ?? "Cliente"}</span><h3>{equipment.brand} {equipment.model}</h3><p>Número de série <strong>{equipment.serial_number}</strong></p></div><StatusBadge status={maintenanceStatus(equipment.next_maintenance_on)} /></div>
        <div className="equipment-facts"><div><span>Instalado em</span><strong>{formatDate(equipment.installed_on)}</strong></div><div><span>Última manutenção</span><strong>{formatDate(equipment.last_maintenance_on)}</strong></div><div><span>Próxima manutenção</span><strong>{formatDate(equipment.next_maintenance_on)}</strong></div></div>
        <div className="history-layout">
          <section className="history-list"><div className="section-title-row"><div><span className="eyebrow">Registo técnico</span><h3>Histórico de assistências</h3></div><span className="section-count">{history.length}</span></div>
            {error ? <ErrorNotice message="Não foi possível carregar o histórico." onRetry={() => mutate()} /> : isLoading ? <div className="loading-line" aria-label="A carregar histórico" /> : history.length ? history.map((entry) => <article className="history-entry" key={entry.id}><div className="history-entry-date">{formatDate(entry.service_date)}</div><div><strong>{entry.service_type}</strong><p>{entry.description}</p>{entry.parts_replaced && <small>Peças: {entry.parts_replaced}</small>}{entry.technician && <small>Técnico: {entry.technician}</small>}</div></article>) : <EmptyState icon={Wrench} title="Sem assistências registadas" description="Registe a primeira intervenção técnica deste equipamento." />}
          </section>
          <form className="history-form form-stack" onSubmit={addHistory}><div><span className="eyebrow">Nova intervenção</span><h3>Registar assistência</h3></div><label>Data<input type="date" required value={form.service_date} onChange={(event) => setForm({ ...form, service_date: event.target.value })} /></label><label>Tipo de assistência<select value={form.service_type} onChange={(event) => setForm({ ...form, service_type: event.target.value })}><option>Manutenção preventiva</option><option>Assistência técnica</option><option>Reparação</option><option>Inspeção</option></select></label><label>Descrição<textarea required rows="3" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label><label>Técnico<input value={form.technician} onChange={(event) => setForm({ ...form, technician: event.target.value })} /></label><label>Peças substituídas<textarea rows="2" value={form.parts_replaced} onChange={(event) => setForm({ ...form, parts_replaced: event.target.value })} /></label>{feedback && <p className="form-feedback" role="alert">{feedback}</p>}<button className="button button-primary button-block" type="submit" disabled={saving}>{saving ? "A guardar…" : "Guardar assistência"}</button><p className="form-hint">Ao guardar, a próxima manutenção fica agendada para um ano depois desta intervenção.</p></form>
        </div>
      </div>
    </Modal>
  );
}
