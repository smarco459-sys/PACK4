import { useEffect, useMemo, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { Building2, FileSpreadsheet, Pencil, Plus, Search, Trash2, Users, Wrench } from "lucide-react";
import { supabase } from "../lib/supabase";
import { fetchClients, fetchEquipmentByClientId, fetchWorkspaces } from "../lib/maintenance-data";
import { ConfirmActionDialog, EmptyState, ErrorNotice, Modal, PageHeading } from "./maintenance-ui";

const emptyClient = { name: "", contact_name: "", phone: "", email: "", address: "", postal_code: "", city: "", notes: "" };

function normalizeHeader(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-PT").replace(/[^a-z0-9]/g, "");
}

function valueFor(row, aliases) {
  const normalized = new Set(aliases.map(normalizeHeader));
  const entry = Object.entries(row).find(([key]) => normalized.has(normalizeHeader(key)));
  return entry?.[1] ?? "";
}

function cleanCell(value) {
  return value == null ? "" : String(value).trim();
}

export default function ClientsPage({ onShowEquipment }) {
  const { data: clients = [], error, isLoading, mutate } = useSWR("clients", fetchClients);
  const { data: workspaces = [] } = useSWR("workspaces", fetchWorkspaces);
  const { mutate: mutateCache } = useSWRConfig();
  const [query, setQuery] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyClient);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [deleteClient, setDeleteClient] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!workspaceId && workspaces.length) setWorkspaceId(workspaces[0].id);
  }, [workspaceId, workspaces]);

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-PT");
    return clients.filter((client) => {
      const searchable = [client.name, client.contact_name, client.email, client.phone, client.city].filter(Boolean).join(" ").toLocaleLowerCase("pt-PT");
      return (!workspaceId || client.workspace_id === workspaceId) && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [clients, query, workspaceId]);
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? null;

  function startCreate() {
    setEditing(null);
    setForm(emptyClient);
    setFeedback("");
    setFormOpen(true);
  }

  function startEdit(client) {
    setEditing(client);
    setWorkspaceId(client.workspace_id);
    setForm({ ...emptyClient, ...client });
    setFeedback("");
    setFormOpen(true);
  }

  async function saveClient(event) {
    event.preventDefault();
    if (!workspaceId) return setFeedback("Selecione um espaço de trabalho antes de guardar.");
    setSaving(true);
    setFeedback("");
    const payload = {
      name: form.name.trim(),
      contact_name: form.contact_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      postal_code: form.postal_code.trim() || null,
      city: form.city.trim() || null,
      notes: form.notes.trim() || null,
      workspace_id: editing?.workspace_id || workspaceId,
    };
    const query = editing
      ? supabase.from("clients").update(payload).eq("id", editing.id)
      : supabase.from("clients").insert(payload);
    const { error: saveError } = await query;
    setSaving(false);
    if (saveError) return setFeedback("Não foi possível guardar o cliente. Confirme os dados e tente novamente.");
    await mutate();
    setFormOpen(false);
    setSelectedClientId(editing?.id ?? "");
  }

  async function removeClient() {
    if (!deleteClient) return;
    setDeleteBusy(true);
    setDeleteError("");
    const { error: deleteError } = await supabase.from("clients").delete().eq("id", deleteClient.id);
    if (deleteError) {
      setDeleteBusy(false);
      return setDeleteError("Não foi possível eliminar o cliente. Verifique as permissões e tente novamente.");
    }
    setSelectedClientId("");
    await Promise.all([
      mutate(),
      mutateCache("equipment"),
      mutateCache((key) => Array.isArray(key) && key[0] === "client-equipment"),
    ]);
    setDeleteBusy(false);
    setDeleteClient(null);
    setFeedback(`Cliente “${deleteClient.name}” e os equipamentos, planos e históricos associados foram eliminados.`);
  }

  async function parseExcel(file) {
    if (file.size > 10 * 1024 * 1024) throw new Error("O ficheiro ultrapassa o limite de 10 MB.");
    const { read, utils } = await import("xlsx");
    const workbook = read(await file.arrayBuffer(), { type: "array", cellDates: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error("O ficheiro não contém uma folha de dados.");
    const sourceRows = utils.sheet_to_json(sheet, { defval: "" });
    return sourceRows.map((row) => ({
      name: cleanCell(valueFor(row, ["nome", "name", "cliente", "client", "empresa"])),
      contact_name: cleanCell(valueFor(row, ["contacto", "contato", "pessoa de contacto", "contact_name", "contactname"])),
      phone: cleanCell(valueFor(row, ["telefone", "telemovel", "telemóvel", "phone", "tel"])),
      email: cleanCell(valueFor(row, ["email", "e-mail", "mail"])),
      address: cleanCell(valueFor(row, ["morada", "endereco", "endereço", "address"])),
      postal_code: cleanCell(valueFor(row, ["codigo postal", "código postal", "postal_code", "postalcode", "zip"])),
      city: cleanCell(valueFor(row, ["cidade", "localidade", "city"])),
      notes: cleanCell(valueFor(row, ["notas", "observacoes", "observações", "notes"])),
    })).filter((row) => row.name);
  }

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFeedback("");
    setImportFile(file);
    try {
      const rows = await parseExcel(file);
      if (!rows.length) throw new Error("Não foram encontradas linhas com nome de cliente.");
      if (rows.length > 500) throw new Error("Importe até 500 clientes por ficheiro.");
      setImportRows(rows);
    } catch (cause) {
      setImportRows([]);
      setFeedback(cause.message || "Não foi possível ler o Excel.");
    }
  }

  async function importClients() {
    if (!workspaceId || !importRows.length) return;
    setImporting(true);
    setFeedback("");
    const records = importRows.map((row) => ({ ...row, workspace_id: workspaceId }));
    const { error: importError } = await supabase.from("clients").insert(records);
    setImporting(false);
    if (importError) return setFeedback("A importação não foi concluída. Verifique a estrutura do Excel e volte a tentar.");
    await mutate();
    setImportRows([]);
    setImportFile(null);
    setFeedback(`${records.length} cliente${records.length === 1 ? "" : "s"} importado${records.length === 1 ? "" : "s"}.`);
  }

  const workspaceName = (id) => workspaces.find((workspace) => workspace.id === id)?.name ?? "Espaço de trabalho";

  return (
    <div className="page-content">
      <PageHeading
        eyebrow="Base de dados"
        title="Clientes"
        description="Consulte fichas de clientes, importe registos e abra os respetivos equipamentos."
        action={<div className="heading-actions"><input ref={inputRef} className="visually-hidden" type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} aria-label="Importar clientes a partir de Excel" /><button className="button button-secondary" type="button" onClick={() => inputRef.current?.click()}><FileSpreadsheet aria-hidden="true" /> Importar Excel</button><button className="button button-primary" type="button" onClick={startCreate}><Plus aria-hidden="true" /> Novo cliente</button></div>}
      />

      <div className="content-card directory-toolbar">
        <label className="search-field"><Search aria-hidden="true" /><span className="visually-hidden">Pesquisar clientes</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar por nome, email, telefone ou cidade" /></label>
        <label className="workspace-filter"><Building2 aria-hidden="true" /><span className="visually-hidden">Espaço de trabalho</span><select value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}><option value="">Todos os espaços</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
        <span className="record-count">{filteredClients.length} clientes</span>
      </div>

      {error && <ErrorNotice message="Não foi possível carregar os clientes." onRetry={() => mutate()} />}
      <div className={`directory-layout${selectedClient ? " has-selection" : ""}`}>
        <section className="content-card client-list-card" aria-label="Lista de clientes">
          {isLoading ? <div className="loading-line" aria-label="A carregar clientes" /> : filteredClients.length ? (
            <div className="table-scroll"><table className="data-table client-table"><thead><tr><th>Cliente</th><th>Contacto</th><th>Telefone</th><th>Localidade</th><th>Workspace</th><th><span className="visually-hidden">Ações</span></th></tr></thead><tbody>
              {filteredClients.map((client) => <tr key={client.id} className={selectedClientId === client.id ? "selected-row" : ""}>
                <td><button className="client-name-button" type="button" onClick={() => setSelectedClientId(client.id)}><span className="client-monogram">{client.name.slice(0, 1).toLocaleUpperCase("pt-PT")}</span><span><strong>{client.name}</strong><small>{client.email || "Ficha de cliente"}</small></span></button></td>
                <td>{client.contact_name || "—"}</td><td>{client.phone || "—"}</td><td>{client.city || "—"}</td><td>{workspaceName(client.workspace_id)}</td>
                <td><div className="table-actions"><button type="button" className="icon-button" aria-label={`Editar ${client.name}`} title="Editar cliente" onClick={() => startEdit(client)}><Pencil aria-hidden="true" /></button><button type="button" className="icon-button icon-button-danger" aria-label={`Eliminar ${client.name}`} title="Eliminar cliente" onClick={() => { setDeleteClient(client); setDeleteError(""); }}><Trash2 aria-hidden="true" /></button></div></td>
              </tr>)}
            </tbody></table></div>
          ) : <EmptyState icon={Users} title="Ainda não há clientes nesta lista" description={workspaceId ? "Crie um cliente ou importe um ficheiro Excel para começar." : "Crie um espaço de trabalho antes de registar clientes."} action={!workspaces.length ? undefined : <button className="button button-primary" type="button" onClick={startCreate}><Plus aria-hidden="true" /> Novo cliente</button>} />}
        </section>

        {selectedClient && <ClientDetail client={selectedClient} onClose={() => setSelectedClientId("")} onShowEquipment={onShowEquipment} />}
      </div>

      {deleteClient && <ConfirmActionDialog title="Eliminar cliente?" description={`A ficha de “${deleteClient.name}” será removida, juntamente com os equipamentos, planos preventivos e históricos de assistência associados. Os registos de serviços existentes serão mantidos sem ligação ao cliente.`} confirmLabel="Eliminar cliente" busy={deleteBusy} error={deleteError} onCancel={() => { if (!deleteBusy) setDeleteClient(null); }} onConfirm={removeClient} />}

      {importRows.length > 0 && <Modal title="Pré-visualizar importação" onClose={() => { setImportRows([]); setImportFile(null); }} wide>
        <div className="modal-body">
          <p className="modal-intro"><strong>{importFile?.name}</strong> · {importRows.length} linhas válidas para <strong>{workspaceName(workspaceId)}</strong>. Só serão importadas linhas com nome de cliente.</p>
          <div className="table-scroll import-preview-table"><table className="data-table"><thead><tr><th>Cliente</th><th>Contacto</th><th>Email</th><th>Telefone</th><th>Localidade</th></tr></thead><tbody>{importRows.slice(0, 8).map((row, index) => <tr key={`${row.name}-${index}`}><td>{row.name}</td><td>{row.contact_name || "—"}</td><td>{row.email || "—"}</td><td>{row.phone || "—"}</td><td>{row.city || "—"}</td></tr>)}</tbody></table></div>
          {importRows.length > 8 && <p className="muted-text">A pré-visualização mostra as primeiras 8 linhas.</p>}
          <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => { setImportRows([]); setImportFile(null); }}>Cancelar</button><button className="button button-primary" type="button" onClick={importClients} disabled={importing || !workspaceId}>{importing ? "A importar…" : `Importar ${importRows.length} clientes`}</button></div>
        </div>
      </Modal>}

      {formOpen && <Modal title={editing ? "Editar cliente" : "Novo cliente"} onClose={() => setFormOpen(false)}>
        <form className="modal-body form-stack" onSubmit={saveClient}>
          <label>Nome do cliente<input autoFocus required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          <label>Espaço de trabalho<select value={editing?.workspace_id || workspaceId} onChange={(event) => setWorkspaceId(event.target.value)} required><option value="">Selecionar…</option>{workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
          <div className="form-grid"><label>Contacto<input value={form.contact_name} onChange={(event) => setForm({ ...form, contact_name: event.target.value })} /></label><label>Telefone<input type="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label><label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label>Localidade<input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} /></label></div>
          <label>Morada<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
          <label>Notas internas<textarea rows="3" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          {feedback && <p className="form-feedback" role="alert">{feedback}</p>}
          <div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setFormOpen(false)}>Cancelar</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "A guardar…" : "Guardar cliente"}</button></div>
        </form>
      </Modal>}
      {feedback && !formOpen && <p className="inline-feedback" role="status">{feedback}</p>}
    </div>
  );
}

function ClientDetail({ client, onClose, onShowEquipment }) {
  const [tab, setTab] = useState("details");
  const { data: equipment = [], error, isLoading, mutate } = useSWR(["client-equipment", client.id], ([, clientId]) => fetchEquipmentByClientId(clientId));
  return (
    <aside className="client-detail content-card" aria-label={`Ficha de ${client.name}`}>
      <div className="client-detail-head"><div className="client-monogram client-monogram-large">{client.name.slice(0, 1).toLocaleUpperCase("pt-PT")}</div><div><span className="eyebrow">Ficha do cliente</span><h2>{client.name}</h2><p>{client.contact_name || client.email || "Cliente PACK4"}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Fechar ficha">×</button></div>
      <div className="detail-tabs" role="tablist" aria-label="Separadores da ficha"><button type="button" id="client-tab-details" role="tab" aria-controls="client-panel-details" aria-selected={tab === "details"} className={tab === "details" ? "active" : ""} onClick={() => setTab("details")}>Dados</button><button type="button" id="client-tab-equipment" role="tab" aria-controls="client-panel-equipment" aria-selected={tab === "equipment"} className={tab === "equipment" ? "active" : ""} onClick={() => setTab("equipment")}>Equipamentos <span>{equipment.length}</span></button></div>
      {tab === "details" ? <dl id="client-panel-details" role="tabpanel" aria-labelledby="client-tab-details" className="client-facts"><div><dt>Contacto</dt><dd>{client.contact_name || "—"}</dd></div><div><dt>Telefone</dt><dd>{client.phone || "—"}</dd></div><div><dt>Email</dt><dd>{client.email || "—"}</dd></div><div><dt>Morada</dt><dd>{[client.address, client.postal_code, client.city].filter(Boolean).join(", ") || "—"}</dd></div></dl> : <div id="client-panel-equipment" role="tabpanel" aria-labelledby="client-tab-equipment" className="client-equipment-list">
        {error ? <ErrorNotice message="Não foi possível carregar os equipamentos." onRetry={() => mutate()} /> : isLoading ? <div className="loading-line" aria-label="A carregar equipamentos" /> : equipment.length ? equipment.map((item) => <article key={item.id} className="equipment-mini-card"><Wrench aria-hidden="true" /><div><strong>{item.brand} {item.model}</strong><span>Série {item.serial_number}</span></div></article>) : <EmptyState icon={Wrench} title="Sem equipamentos registados" description="Adicione o primeiro equipamento deste cliente na pesquisa de equipamentos." />}
        <button className="button button-secondary button-block" type="button" onClick={() => onShowEquipment?.(client.id)}>Abrir pesquisa de equipamentos</button>
      </div>}
    </aside>
  );
}
