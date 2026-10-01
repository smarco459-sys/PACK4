import React, { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wrench, CalendarDays, Users, UserRoundCog, Package,
  BarChart3, Settings, LogOut, Plus, Search, RefreshCw, Euro, Clock3,
  CheckCircle2, AlertCircle, CircleDot, X, ChevronRight, Pencil, Trash2, Upload, FileSpreadsheet, FileText, Download, MapPin, Navigation, Route as RouteIcon
} from "lucide-react";
import { supabase } from "./lib/supabase";

const HOURLY_RATE = 75;
const DISTANCE_RATE = 0.75;
const SERVICE_BASES = [
  { name: "PACK4 Soluções para indústria", lat: 38.9722, lng: -9.2305 },
  { name: "Mafra", lat: 38.9369, lng: -9.3276 },
];

const nav = [
  ["/", "Dashboard", LayoutDashboard],
  ["/servicos", "Serviços", Wrench],
  ["/kanban", "Kanban", CircleDot],
  ["/calendario", "Calendário", CalendarDays],
  ["/clientes", "Clientes", Users],
  ["/tecnicos", "Técnicos", UserRoundCog],
  ["/pecas", "Peças", Package],
  ["/relatorios", "Relatórios", BarChart3],
  ["/mapa", "Mapa operacional", MapPin],
  ["/importacao", "Importar dados", Upload],
  ["/definicoes", "Definições", Settings],
];

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(""); setSent(false);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(/invalid login credentials/i.test(error.message) ? "Email ou password inválidos." : "Não foi possível iniciar sessão. Tente novamente.");
    setBusy(false);
  }

  async function reset() {
    if (!email) return setError("Introduza primeiro o email.");
    setError(""); setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) setError(error.message); else setSent(true);
    setBusy(false);
  }

  return <div className="login-shell">
    <div className="login-card">
      <div className="brand-large">PACK<span>4</span></div>
      <div className="brand-sub">SERVICE MANAGER</div>
      <h1>Entrar</h1>
      <p className="muted">Acesso ao departamento técnico</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>
        {error && <div className="alert danger">{error}</div>}
        {sent && <div className="alert success">Email de recuperação enviado.</div>}
        <button className="primary wide" disabled={busy}>{busy ? "A entrar..." : "Entrar"}</button>
      </form>
      <button className="link-btn" onClick={reset} disabled={busy}>Esqueci-me da password</button>
    </div>
  </div>;
}

function Shell({ session }) {
  const [profile, setProfile] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from("profiles").select("*").eq("id", session.user.id).maybeSingle();
      setProfile(p);
      const { data: m } = await supabase.from("workspace_members")
        .select("workspace_id, role, workspaces(id,name)")
        .eq("user_id", session.user.id).limit(1).maybeSingle();
      if (m) setWorkspace({ ...m.workspaces, role: m.role });
    }
    load();
  }, [session.user.id, refresh]);

  useEffect(() => {
    if (!workspace?.id) return;
    const tables = ["clients", "technicians", "parts", "services", "technician_availability"];
    const channel = supabase.channel(`workspace-live-${workspace.id}`);
    const refreshData = () => setRefresh((value) => value + 1);
    tables.forEach((table) => {
      channel.on("postgres_changes", {
        event: "*", schema: "public", table,
        filter: `workspace_id=eq.${workspace.id}`,
      }, refreshData);
    });
    // Estas tabelas não têm workspace_id; a autorização é feita pela relação com services.
    ["service_parts", "service_history"].forEach((table) => {
      channel.on("postgres_changes", {
        event: "*", schema: "public", table,
      }, refreshData);
    });
    channel.on("postgres_changes", {
      event: "*", schema: "public", table: "workspace_members",
      filter: `workspace_id=eq.${workspace.id}`,
    }, refreshData);
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [workspace?.id]);

  async function logout() {
    await supabase.auth.signOut();
    navigate("/login");
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="logo">PACK<span>4</span><small>SERVICE MANAGER</small></div>
      <div className="live"><i/> DADOS EM TEMPO REAL</div>
      <nav>{nav.map(([to,label,Icon]) =>
        <NavLink key={to} to={to} end={to==="/"} className={({isActive})=>isActive?"active":""}>
          <Icon size={18}/><span>{label}</span>
        </NavLink>
      )}</nav>
      <div className="sidebar-bottom">
        <div className="user-mini">
          <div className="avatar">{(profile?.full_name || session.user.email || "P").slice(0,1).toUpperCase()}</div>
          <div><strong>{profile?.full_name || session.user.email}</strong><small>{workspace?.role || "utilizador"}</small></div>
        </div>
        <button className="ghost wide" onClick={logout}><LogOut size={16}/> Sair</button>
      </div>
    </aside>
    <main className="main">
      <Routes location={undefined} key={refresh}>
        <Route path="/" element={<Dashboard workspace={workspace} refresh={refresh} />} />
        <Route path="/servicos" element={<Services workspace={workspace} refresh={refresh} setRefresh={setRefresh}/>} />
        <Route path="/kanban" element={<Kanban workspace={workspace} setRefresh={setRefresh}/>} />
        <Route path="/calendario" element={<Calendar workspace={workspace} refresh={refresh}/>} />
        <Route path="/clientes" element={<Clients workspace={workspace} refresh={refresh} setRefresh={setRefresh}/>} />
        <Route path="/tecnicos" element={<Technicians workspace={workspace} refresh={refresh} setRefresh={setRefresh}/>} />
        <Route path="/pecas" element={<Parts workspace={workspace} refresh={refresh} setRefresh={setRefresh}/>} />
        <Route path="/relatorios" element={<Reports workspace={workspace} refresh={refresh}/>} />
        <Route path="/mapa" element={<OperationsMap workspace={workspace} refresh={refresh}/>} />
        <Route path="/importacao" element={<ImportCenter workspace={workspace} onRefresh={()=>setRefresh(x=>x+1)}/>} />
        <Route path="/definicoes" element={<SettingsPage session={session} workspace={workspace} onRefresh={()=>setRefresh(x=>x+1)}/>} />
        <Route path="*" element={<Navigate to="/" replace/>}/>
      </Routes>
    </main>
  </div>;
}

function Header({title, subtitle, action}) {
  return <header className="page-head"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>;
}

function useData(loader, deps=[]) {
  const [state,setState]=useState({data:null,error:null,loading:true});
  const run=async()=>{setState(s=>({...s,loading:true})); try { const data=await loader(); setState({data,error:null,loading:false}); } catch(e){setState({data:null,error:e,loading:false});} };
  useEffect(()=>{run()},deps);
  return {...state,reload:run};
}

async function getMetrics(workspaceId) {
  if (!workspaceId) return null;
  const { data, error } = await supabase.from("service_dashboard_metrics").select("*").eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw error; return data;
}

function Dashboard({workspace}) {
  const m=useData(()=>getMetrics(workspace?.id),[workspace?.id]);
  const recent=useData(async()=>{
    if(!workspace?.id) return [];
    const {data,error}=await supabase.from("service_board").select("*").eq("workspace_id",workspace.id).order("created_at",{ascending:false}).limit(8);
    if(error) throw error; return data||[];
  },[workspace?.id]);
  const technicians=useData(async()=>{
  if(!workspace?.id) return [];
  const {data,error}=await supabase.from("technician_workload").select("*").eq("workspace_id",workspace.id).eq("active",true).order("open_services",{ascending:false});
  if(error) throw error; return data||[];
  },[workspace?.id]);
  const operational=useData(async()=>{
  if(!workspace?.id) return {today:[],all:[]};
  const {data,error}=await supabase.from("service_board").select("*").eq("workspace_id",workspace.id);
  if(error) throw error;
  const all=data||[], todayKey=localDateKey(new Date());
  return {all,today:all.filter(row=>row.scheduled_start&&localDateKey(row.scheduled_start)===todayKey)};
  },[workspace?.id]);
  const today=operational.data?.today||[], allServices=operational.data?.all||[];
  const overdue=allServices.filter(row=>row.scheduled_start&&new Date(row.scheduled_start)<new Date()&&!['completed','invoiced','cancelled'].includes(row.board_status)).length;
  const busyTechnicians=new Set(today.filter(row=>row.technician_id).map(row=>String(row.technician_id))).size;
  const billed=allServices.filter(row=>row.invoiced).reduce((sum,row)=>sum+Number(row.amount||0),0);
  const completedValue=allServices.filter(row=>['completed','invoiced'].includes(row.board_status)).reduce((sum,row)=>sum+Number(row.amount||0),0);
  const averageValue=allServices.length?completedValue/allServices.length:0;
  const technicianBreakdown=[...allServices.reduce((map,row)=>{const key=row.technician_name||"Por atribuir";map.set(key,(map.get(key)||0)+1);return map},new Map())].sort((a,b)=>b[1]-a[1]).slice(0,5);
  const clientBreakdown=[...allServices.reduce((map,row)=>{const key=row.client_name||"Sem cliente";map.set(key,(map.get(key)||0)+1);return map},new Map())].sort((a,b)=>b[1]-a[1]).slice(0,5);
  const money=value=>`€ ${Number(value||0).toLocaleString("pt-PT",{minimumFractionDigits:2})}`;
  return <div>
  <Header title="Dashboard gestor" subtitle="A situação operacional da PACK4 em 10 segundos"
  action={<button className="icon-btn" onClick={()=>location.reload()}><RefreshCw size={17}/></button>}/>
  <div className="kpis">
  <Kpi icon={Clock3} label="Pendentes" value={m.data?.pending_services ?? "—"}/>
  <Kpi icon={CircleDot} label="Agendados" value={m.data?.scheduled_services ?? "—"}/>
  <Kpi icon={CheckCircle2} label="Concluídos" value={m.data?.completed_services ?? "—"}/>
  <Kpi icon={Euro} label="A faturar" value={m.data?.to_invoice_amount != null ? money(m.data.to_invoice_amount) : "—"}/>
  </div>
  <section className="dashboard-section"><div className="section-heading"><div><span className="eyebrow">Hoje</span><h2>Operação do dia</h2></div><span className="section-caption">Atualizado em tempo real</span></div><div className="manager-metrics"><Metric label="Serviços hoje" value={today.length}/><Metric label="Técnicos ocupados" value={busyTechnicians}/><Metric label="Técnicos disponíveis" value={Math.max(0,(technicians.data||[]).length-busyTechnicians)}/><Metric label="Serviços atrasados" value={overdue} tone={overdue>0?"danger":"good"}/></div></section>
  <section className="dashboard-section"><div className="section-heading"><div><span className="eyebrow">Financeiro</span><h2>Visão financeira</h2></div></div><div className="manager-metrics financial"><Metric label="€ faturados" value={money(billed)}/><Metric label="€ em concluídos" value={money(completedValue)}/><Metric label="Valor médio / serviço" value={money(averageValue)}/></div></section>
  <section className="dashboard-section"><div className="section-heading"><div><span className="eyebrow">Operação</span><h2>Distribuição de serviços</h2></div></div><div className="dashboard-breakdowns"><Breakdown title="Serviços por técnico" rows={technicianBreakdown}/><Breakdown title="Serviços por cliente" rows={clientBreakdown}/></div></section>
  <div className="grid-2">
      <section className="panel"><div className="panel-head"><h2>Serviços recentes</h2><NavLink to="/servicos">Ver todos <ChevronRight size={15}/></NavLink></div>
        {recent.loading ? <Loading/> : recent.error ? <ErrorBox e={recent.error}/> : <ServiceTable rows={recent.data}/>}
      </section>
      <section className="panel"><div className="panel-head"><h2>Carga por técnico</h2><NavLink to="/tecnicos">Ver técnicos <ChevronRight size={15}/></NavLink></div>
        <div className="workload">{technicians.data?.map(t=><div className="work-row" key={t.technician_id}><div className="work-name"><strong>{t.name}</strong><span>{t.open_services} em aberto</span></div><div className="bar"><i style={{width:`${Math.min(100,(t.active_services||0)*18)}%`}}/></div></div>)}</div>
      </section>
    </div>
  </div>;
}

  function Kpi({icon:Icon,label,value}) { return <div className="kpi"><div className="kpi-icon"><Icon size={18}/></div><div><span>{label}</span><strong>{value}</strong></div></div> }
  function Metric({label,value,tone="default"}) { return <div className={`manager-metric ${tone}`}><span>{label}</span><strong>{value}</strong></div> }
  function Breakdown({title,rows}) { return <div className="breakdown"><h3>{title}</h3>{rows.length?rows.map(([label,count])=><div className="breakdown-row" key={label}><span>{label}</span><strong>{count}</strong></div>):<div className="muted small-text">Sem dados disponíveis.</div>}</div> }
  function Loading(){return <div className="loading">A carregar…</div>}
function ErrorBox({e}){return <div className="alert danger">{e?.message || "Ocorreu um erro."}</div>}

function ServiceTable({rows=[],onSelect}) {
  return <div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Serviço</th><th>Técnico</th><th>Estado</th><th>Valor</th></tr></thead><tbody>
    {rows.map(r=><tr key={r.id} onClick={()=>onSelect?.(r)} className={onSelect?"click-row":""}><td><strong>{r.client_name || "—"}</strong></td><td>{r.title}</td><td>{r.technician_name || "—"}</td><td><Status s={r.board_status}/></td><td>{r.billable ? `€ ${Number(r.amount||0).toLocaleString("pt-PT",{minimumFractionDigits:2})}`:"—"}</td></tr>)}
    {!rows.length && <tr><td colSpan="5" className="empty">Sem serviços.</td></tr>}
  </tbody></table></div>
}
function Status({s}) { const map={pending:["Pendente","gray"],scheduled:["Agendado","blue"],in_progress:["Em curso","orange"],completed:["Concluído","green"],invoiced:["Faturado","purple"],cancelled:["Cancelado","red"]}; const [t,c]=map[s]||[s,"gray"]; return <span className={`status ${c}`}>{t}</span> }

function ServiceDetail({service, workspace, close, setRefresh}) {
  const [data,setData]=useState(service);
  const [client,setClient]=useState(null),[parts,setParts]=useState([]),[catalog,setCatalog]=useState([]),[history,setHistory]=useState([]);
  const [partId,setPartId]=useState(""),[qty,setQty]=useState(1),[used,setUsed]=useState(false),[busy,setBusy]=useState(false);
  async function load(){
    if(!service?.id)return;
    const [c,p,cat,h]=await Promise.all([
      supabase.from("clients").select("*").eq("id",service.client_id).maybeSingle(),
      supabase.from("service_parts").select("service_id,part_id,quantity,used,notes,parts(id,name,reference,unit_cost,stock_quantity)").eq("service_id",service.id),
      supabase.from("parts").select("id,name,reference,stock_quantity,unit_cost").eq("workspace_id",workspace.id).order("name"),
      supabase.from("service_history").select("id,action,old_status,new_status,notes,created_at,user_id").eq("service_id",service.id).order("created_at",{ascending:false})
    ]);
    setClient(c.data||null); setParts(p.data||[]); setCatalog(cat.data||[]); setHistory(h.data||[]);
  }
  useEffect(()=>{load()},[service?.id]);
  async function save(){
    setBusy(true);
    const {data:updated,error}=await supabase.from("services").update({title:data.title,description:data.description,technician_id:data.technician_id||null,status:data.status,priority:data.priority,service_type:data.service_type,machine:data.machine,scheduled_start:localDateTimeToIso(data.scheduled_start),scheduled_end:localDateTimeToIso(data.scheduled_end),billable:!!data.billable,amount:data.amount===""?null:Number(data.amount),invoiced:!!data.invoiced,invoice_reference:data.invoice_reference||null,notes:data.notes}).eq("id",data.id).select("*").single();
    setBusy(false); if(error) return alert(error.message); setData(updated); setRefresh?.(x=>x+1); alert("Serviço atualizado.");
  }
  async function removeService(){
    if(!window.confirm("Eliminar este serviço? Esta ação não pode ser anulada.")) return;
    setBusy(true);
    const {error}=await supabase.from("services").delete().eq("id",service.id);
    setBusy(false);
    if(error) return alert(error.message);
    setRefresh?.(x=>x+1); close();
  }
  async function addPart(e){
    e.preventDefault(); if(!partId)return;
    const {error}=await supabase.from("service_parts").upsert({service_id:service.id,part_id:partId,quantity:Number(qty),used,notes:null});
    if(error) return alert(error.message); setPartId("");setQty(1);setUsed(false);load();setRefresh?.(x=>x+1);
  }
  async function removePart(id){const {error}=await supabase.from("service_parts").delete().eq("service_id",service.id).eq("part_id",id);if(error)alert(error.message);else load()}
  return <Modal title={`Serviço — ${service.client_name||"Cliente"}`} close={close}>
    <div className="detail-grid">
      <section className="detail-main">
        <div className="detail-status"><Status s={data.invoiced&&data.status==="completed"?"invoiced":data.status}/><span>Prioridade: <strong>{({low:"Baixa",normal:"Normal",high:"Alta",urgent:"Urgente"})[data.priority]||data.priority}</strong></span></div>
        <div className="form-grid">
          <label>Título<input value={data.title||""} onChange={e=>setData({...data,title:e.target.value})}/></label>
          <label>Estado<select value={data.status||"pending"} onChange={e=>setData({...data,status:e.target.value,invoiced:e.target.value==="completed"?data.invoiced:false})}><option value="pending">Pendente</option><option value="scheduled">Agendado</option><option value="in_progress">Em curso</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></label>
          <label>Tipo<input value={data.service_type||""} onChange={e=>setData({...data,service_type:e.target.value})}/></label>
          <label>Máquina/equipamento<input value={data.machine||""} onChange={e=>setData({...data,machine:e.target.value})}/></label>
          <label>Início<input type="datetime-local" value={isoToLocalInput(data.scheduled_start)} onChange={e=>setData({...data,scheduled_start:e.target.value})}/></label>
          <label>Fim<input type="datetime-local" value={isoToLocalInput(data.scheduled_end)} onChange={e=>setData({...data,scheduled_end:e.target.value})}/></label>
          <label className="span2">Descrição<textarea value={data.description||""} onChange={e=>setData({...data,description:e.target.value})}/></label>
          <label className="check"><input type="checkbox" checked={!!data.billable} onChange={e=>setData({...data,billable:e.target.checked})}/> A faturar</label>
          <label>Valor<input type="number" step="0.01" value={data.amount??""} onChange={e=>setData({...data,amount:e.target.value})}/></label>
          <label className="check"><input type="checkbox" checked={!!data.invoiced} disabled={data.status!=="completed"} onChange={e=>setData({...data,invoiced:e.target.checked})}/> Faturado</label>
          <label>Referência fatura<input value={data.invoice_reference||""} onChange={e=>setData({...data,invoice_reference:e.target.value})}/></label>
  <label className="span2">Notas<textarea value={data.notes||""} onChange={e=>setData({...data,notes:e.target.value})}/></label>
  <fieldset className="checklist-fieldset span2"><legend>Checklist técnica</legend><div className="service-checklist">{["Contacto com cliente","Diagnóstico","Peças necessárias","Peças disponíveis","Serviço realizado","Teste da máquina","Relatório enviado","Faturado"].map(item=><label key={item}><input type="checkbox" checked={String(data.notes||"").includes(`[${item}]`)} onChange={e=>{const marker=`[${item}]`;const notes=String(data.notes||"");setData({...data,notes:e.target.checked?(notes?`${notes}\n${marker}`:marker):notes.replace(marker," ").replace(/\n\s*\n/g,"\n")})}}/> {item}</label>)}</div></fieldset>
  </div>
        <div className="modal-actions"><button className="danger-btn" type="button" onClick={removeService} disabled={busy}><Trash2 size={15}/> Eliminar serviço</button><span className="modal-actions-spacer"/><button className="ghost" onClick={close}>Fechar</button><button className="primary" disabled={busy} onClick={save}>{busy?"A guardar…":"Guardar alterações"}</button></div>
      </section>
      <aside className="detail-side">
        <div className="detail-box"><h3>Cliente</h3><strong>{client?.name||service.client_name||"—"}</strong><p>{client?.contact_name||""}</p><p>{client?.phone||""}</p><p>{client?.email||""}</p><p>{client?.address||""}{client?.city?`, ${client.city}`:""}</p></div>
        <div className="detail-box"><h3>Peças necessárias / utilizadas</h3>
          <form className="part-add" onSubmit={addPart}><select value={partId} onChange={e=>setPartId(e.target.value)}><option value="">Adicionar peça…</option>{catalog.map(p=><option key={p.id} value={p.id}>{p.reference?`${p.reference} — `:""}{p.name}</option>)}</select><input type="number" min="1" step="1" value={qty} onChange={e=>setQty(e.target.value)}/><label className="tiny-check"><input type="checkbox" checked={used} onChange={e=>setUsed(e.target.checked)}/> usada</label><button className="primary" type="submit">+</button></form>
          <div className="parts-list">{parts.map(p=><div className="part-row" key={p.part_id}><span><strong>{p.parts?.name}</strong><small>{p.parts?.reference||"Sem referência"} • qtd. {p.quantity}</small></span><span><Status s={p.used?"completed":"pending"}/><button className="icon-btn small" onClick={()=>removePart(p.part_id)}><X size={13}/></button></span></div>)}{!parts.length&&<div className="muted small-text">Ainda não foram adicionadas peças.</div>}</div>
        </div>
        <div className="detail-box"><h3>Histórico de atividade</h3>{history.map(h=>{const labels={status_change:"Alterou estado",technician_change:"Alterou técnico",part_added:"Adicionou peça",part_removed:"Removeu peça",service_created:"Criou serviço",service_updated:"Atualizou serviço"};const action=labels[h.action]||h.action||"Atividade";const transition=h.action==="status_change"?`${h.old_status||"—"} → ${h.new_status||"—"}`:h.notes;return <div className="history-row" key={h.id}><div><strong>{action}</strong>{transition&&<span>{transition}</span>}</div><small>{new Date(h.created_at).toLocaleString("pt-PT")}</small></div>})}{!history.length&&<div className="muted small-text">Sem alterações registadas.</div>}</div>
      </aside>
    </div>
  </Modal>
}

function OperationsMap({workspace, refresh}) {
  const [services, setServices] = useState([]);
  const [filter, setFilter] = useState("all");
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const geocodeCache = React.useRef(new Map());
  const mapRef = React.useRef(null);
  const mapInstance = React.useRef(null);
  const geocoderRef = React.useRef(null);
  const markersRef = React.useRef([]);
  const directionsRenderersRef = React.useRef([]);
  const [routeBase, setRouteBase] = useState("PACK4 Soluções para indústria");
  const [routeTechnician, setRouteTechnician] = useState("all");
  const [routeDate, setRouteDate] = useState(new Date().toISOString().slice(0, 10));
  const [routeBusy, setRouteBusy] = useState(false);
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeMessage, setRouteMessage] = useState("");
  const [plannedRoutes, setPlannedRoutes] = useState([]);
  const [routeSummary, setRouteSummary] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!workspace?.id) return;
      setError("");
      const [servicesResult, clientsResult] = await Promise.all([
        supabase.from("service_board").select("*").eq("workspace_id", workspace.id),
        // Do not depend on optional coordinate columns: the operational map geocodes
        // the address stored on the client record (address + postal code + city).
        supabase.from("clients").select("*").eq("workspace_id", workspace.id),
      ]);
      if (cancelled) return;
      if (servicesResult.error) {
        setError(`Não foi possível carregar os serviços: ${servicesResult.error.message}`);
        setServices([]);
        return;
      }
      if (clientsResult.error) {
        setError(`Não foi possível carregar as fichas de cliente: ${clientsResult.error.message}`);
        setServices(servicesResult.data || []);
        return;
      }
      const locations = new Map((clientsResult.data || []).map(client => [String(client.id), client]));
      setServices((servicesResult.data || []).map(service => {
        const client = locations.get(String(service.client_id)) || {};
        // Keep the service identity intact: spreading the client row here can replace
        // the service id and makes markers/links point to the wrong record.
        const firstValue = (...values) => values.find(value => value != null && String(value).trim() !== "") || "";
        return {
          ...service,
          client_name: firstValue(service.client_name, client.name, client.company_name, "Cliente"),
          address: firstValue(service.address, service.street, service.street_address, service.morada, service.rua, client.address, client.street, client.street_address, client.morada, client.rua),
          postal_code: firstValue(service.postal_code, service.postcode, service.zip_code, service.zipcode, service.codigo_postal, service.codigoPostal, client.postal_code, client.postcode, client.zip_code, client.zipcode, client.codigo_postal, client.codigoPostal),
          city: firstValue(service.city, service.locality, service.municipality, service.cidade, service.concelho, client.city, client.locality, client.municipality, client.cidade, client.concelho),
          client_address: client,
        };
      }));
    }
    load();
    return () => { cancelled = true; };
  }, [workspace?.id, refresh]);

  useEffect(() => {
    if (window.google?.maps) { setMapReady(true); return; }
    const key = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!key) { setError("Configure a chave do Google Maps para ativar o mapa."); return; }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=geometry`;
    script.async = true; script.defer = true; script.onload = () => setMapReady(true); script.onerror = () => setError("Não foi possível carregar o Google Maps.");
    document.head.appendChild(script);
    return () => { if (script.parentNode) script.parentNode.removeChild(script); };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.google?.maps) return;
    let cancelled = false;
    const map = new window.google.maps.Map(mapRef.current, { center: { lat: 39.5, lng: -8 }, zoom: 7, mapTypeControl: false, streetViewControl: false, fullscreenControl: true });
    mapInstance.current = map;
    geocoderRef.current = new window.google.maps.Geocoder();
    const colors = { pending: "#667085", scheduled: "#2d74da", in_progress: "#e08a18", completed: "#21a366", invoiced: "#7652c9", cancelled: "#c24141" };
    const clean = value => String(value || "").trim();
    const addressPartsOf = item => [clean(item.address), clean(item.postal_code), clean(item.city)].filter(Boolean);
    const addressOf = item => [...addressPartsOf(item), "Portugal"].filter(Boolean).join(", ");
    const addressQueriesOf = item => {
      const address = clean(item.address || item.street || item.street_address || item.morada || item.rua);
      const postalCode = clean(item.postal_code || item.postcode || item.zip_code || item.zipcode || item.codigo_postal || item.codigoPostal).replace(/\s+/g, "");
      const city = clean(item.city || item.locality || item.municipality || item.cidade || item.concelho);
      const postalVariants = [...new Set([postalCode, postalCode.replace("-", " "), postalCode.replace("-", "")].filter(Boolean))];
      const queries = [
        ...postalVariants.map(postal => [address, postal, city, "Portugal"].filter(Boolean).join(", ")),
        [address, city, "Portugal"].filter(Boolean).join(", "),
        ...postalVariants.map(postal => [postal, city, "Portugal"].filter(Boolean).join(", ")),
        [city, "Portugal"].filter(Boolean).join(", "),
      ];
      return [...new Set(queries.filter(query => query.length > "Portugal".length))];
    };
    const escapeHtml = value => String(value || "").replace(/[&<>'"]/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;","\"":"&quot;"}[character]));
    async function resolvePosition(service) {
      const queries = addressQueriesOf(service);
      const cacheKey = queries.join(" | ");
      if (geocodeCache.current.has(cacheKey)) return geocodeCache.current.get(cacheKey);
      for (const address of queries) {
        const result = await new Promise(resolve => geocoderRef.current.geocode({
          address,
          region: "PT",
          componentRestrictions: { country: "PT" },
        }, (results, status) => resolve(status === "OK" && results[0] ? results[0].geometry.location.toJSON() : null)));
        if (result) {
          geocodeCache.current.set(cacheKey, result);
          return result;
        }
      }
      // Coordinates are only a legacy fallback when the client has no usable address.
      const lat = Number(service.latitude); const lng = Number(service.longitude);
      const fallback = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      geocodeCache.current.set(cacheKey, fallback);
      return fallback;
    }
    async function renderMarkers() {
      markersRef.current.forEach(marker => marker.setMap(null));
      markersRef.current = [];
      const candidates = services.filter(service => filter === "all" || service.board_status === filter);
      const resolved = await Promise.all(candidates.map(async service => ({ service, position: await resolvePosition(service) })));
      if (cancelled) return;
      const visible = resolved.filter(item => item.position);
      const bounds = new window.google.maps.LatLngBounds();
      visible.forEach(({ service, position }) => {
        const statusColor = colors[service.board_status] || colors.pending;
        const marker = new window.google.maps.Marker({ map, position, title: `${service.client_name || "Cliente"} — ${service.title}`, icon: { path: window.google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: statusColor, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 } });
        const info = new window.google.maps.InfoWindow({ content: `<div class="map-info"><strong>${escapeHtml(service.client_name || "Cliente")}</strong><span>${escapeHtml(service.title || "Serviço")}</span><small>${escapeHtml(service.technician_name || "Por atribuir")} · ${escapeHtml(service.board_status || "pendente")}<br/>${escapeHtml(addressOf(service) || "Coordenadas guardadas")}</small></div>` });
        marker.addListener("click", () => info.open({ map, anchor: marker }));
        markersRef.current.push(marker); bounds.extend(position);
      });
      if (visible.length) map.fitBounds(bounds, 70);
    }
    renderMarkers();
    return () => { cancelled = true; markersRef.current.forEach(marker => marker.setMap(null)); };
  }, [mapReady, services, filter]);

  async function planRoutes() {
    if (!mapInstance.current || !geocoderRef.current || !window.google?.maps) return;
    setRouteBusy(true); setRouteMessage(""); setError(""); setPlannedRoutes([]); setRouteSummary(null);
    directionsRenderersRef.current.forEach(renderer => renderer.setMap(null));
    directionsRenderersRef.current = [];
    const selectedBase = SERVICE_BASES.find(base => base.name === routeBase) || SERVICE_BASES[0];
    const candidates = services.filter(service => {
      const serviceDay = service.scheduled_start ? new Date(service.scheduled_start).toISOString().slice(0, 10) : "";
      return service.technician_id && serviceDay === routeDate && (routeTechnician === "all" || String(service.technician_id) === String(routeTechnician)) && (service.address || service.postal_code || service.city);
    });
    const technicians = [...new Map(candidates.map(service => [String(service.technician_id), { id: service.technician_id, name: service.technician_name || "Técnico" }])).values()];
    if (!candidates.length) { setRouteMessage("Não existem serviços atribuídos para este técnico e dia com morada válida."); setRouteBusy(false); return; }
    const clean = value => String(value || "").trim();
    const addressQueriesOf = service => {
      const address = clean(service.address || service.street || service.street_address || service.morada || service.rua);
      const postalCode = clean(service.postal_code || service.postcode || service.zip_code || service.zipcode || service.codigo_postal || service.codigoPostal).replace(/\s+/g, "");
      const city = clean(service.city || service.locality || service.municipality || service.cidade || service.concelho);
      const postalVariants = [...new Set([postalCode, postalCode.replace("-", " "), postalCode.replace("-", "")].filter(Boolean))];
      return [...new Set([
        ...postalVariants.map(postal => [address, postal, city, "Portugal"].filter(Boolean).join(", ")),
        [address, city, "Portugal"].filter(Boolean).join(", "),
        ...postalVariants.map(postal => [postal, city, "Portugal"].filter(Boolean).join(", ")),
        [city, "Portugal"].filter(Boolean).join(", "),
      ].filter(query => query.length > "Portugal".length))];
    };
    const addressOf = service => addressQueriesOf(service)[0] || "";
    const geocode = async service => {
      const queries = addressQueriesOf(service);
      const key = queries.join(" | ");
      if (geocodeCache.current.has(key)) return geocodeCache.current.get(key);
      for (const query of queries) {
        const position = await new Promise(resolve => geocoderRef.current.geocode({ address: query, region: "PT", componentRestrictions: { country: "PT" } }, (results, status) => resolve(status === "OK" && results[0] ? results[0].geometry.location : null)));
        if (position) { geocodeCache.current.set(key, position); return position; }
      }
      geocodeCache.current.set(key, null);
      return null;
    };
    const planned = [];
    let unresolved = 0;
    for (const technician of technicians) {
      const technicianServices = candidates.filter(service => String(service.technician_id) === String(technician.id));
      const resolvedPoints = await Promise.all(technicianServices.map(async service => ({ service, position: await geocode(service) })));
      unresolved += resolvedPoints.filter(item => !item.position).length;
      const points = resolvedPoints.filter(item => item.position);
      if (!points.length) continue;
      const renderer = new window.google.maps.DirectionsRenderer({ map: mapInstance.current, suppressMarkers: true, polylineOptions: { strokeColor: "#173f7a", strokeOpacity: .82, strokeWeight: 5 } });
      const route = await new Promise(resolve => new window.google.maps.DirectionsService().route({ origin: selectedBase, destination: selectedBase, waypoints: points.map(point => ({ location: point.position, stopover: true })), optimizeWaypoints: true, travelMode: window.google.maps.TravelMode.DRIVING }, (result, status) => resolve(status === "OK" ? result : null)));
      if (!route) continue;
      renderer.setDirections(route); directionsRenderersRef.current.push(renderer);
      const legs = route.routes[0].legs || [];
      const distanceMeters = legs.reduce((sum, leg) => sum + (leg.distance?.value || 0), 0);
      const durationSeconds = legs.reduce((sum, leg) => sum + (leg.duration?.value || 0), 0);
      const ordered = (route.routes[0].waypoint_order || points.map((_, index) => index)).map(index => points[index].service);
      planned.push({ technician, services: ordered, distanceKm: distanceMeters / 1000, durationMinutes: durationSeconds / 60 });
    }
    setPlannedRoutes(planned);
    const total = planned.reduce((sum, route) => sum + route.services.length, 0);
    const distanceKm = planned.reduce((sum, route) => sum + route.distanceKm, 0);
    const durationMinutes = planned.reduce((sum, route) => sum + route.durationMinutes, 0);
    setRouteSummary({ total, distanceKm, durationMinutes });
    setRouteMessage(`${total} serviço${total === 1 ? "" : "s"} planeado${total === 1 ? "" : "s"} para ${routeDate.split("-").reverse().join("/")}. ${unresolved ? `${unresolved} morada${unresolved === 1 ? "" : "s"} não foi${unresolved === 1 ? "" : "ram"} reconhecida${unresolved === 1 ? "" : "s"}; reveja a morada, código postal e localidade.` : "Todas as moradas foram reconhecidas."} A rota já está visível no mapa.`);
    setRouteBusy(false);
  }

  async function authorizeRouteOrder() {
    if (!plannedRoutes.length) return;
    setRouteSaving(true); setRouteMessage("");
    try {
      for (const route of plannedRoutes) {
        const original = route.services.slice().sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
        for (let index = 0; index < route.services.length; index += 1) {
          const current = route.services[index];
          const slot = original[index];
          const duration = Math.max(30, (new Date(slot.scheduled_end || slot.scheduled_start).getTime() - new Date(slot.scheduled_start).getTime()) / 60000 || 60);
          const start = new Date(slot.scheduled_start);
          const end = new Date(start.getTime() + duration * 60000);
          const { error: updateError } = await supabase.from("services").update({ scheduled_start: start.toISOString(), scheduled_end: end.toISOString() }).eq("id", current.id);
          if (updateError) throw updateError;
        }
      }
      setRouteMessage("Ordem autorizada e atualizada na agenda. A rota mantém-se visível no mapa.");
    } catch (updateError) {
      setError(`Não foi possível atualizar a agenda: ${updateError.message}`);
    } finally { setRouteSaving(false); }
  }

  async function searchLocation(event) {
    event.preventDefault();
    const query = search.trim();
    if (!query || !geocoderRef.current || !mapInstance.current) return;
    setSearching(true); setError("");
    geocoderRef.current.geocode({ address: query, region: "PT", componentRestrictions: { country: "PT" } }, (results, status) => {
      setSearching(false);
      if (status === "OK" && results[0]) { mapInstance.current.setCenter(results[0].geometry.location); mapInstance.current.setZoom(16); }
      else setError(`Não foi possível encontrar “${query}”. Tente morada, código postal e localidade.`);
    });
  }

  const statusLabels = { pending: "Pendentes", scheduled: "Agendados", in_progress: "Em curso", completed: "Concluídos", invoiced: "Faturados", cancelled: "Cancelados" };
  const colors = { pending: "#667085", scheduled: "#2d74da", in_progress: "#e08a18", completed: "#21a366", invoiced: "#7652c9", cancelled: "#c24141" };
  const counts = Object.keys(statusLabels).map(status => ({ status, count: services.filter(service => service.board_status === status).length }));
  const available = services.filter(service => service.address || service.postal_code || service.city || (Number.isFinite(Number(service.latitude)) && Number.isFinite(Number(service.longitude)))).length;
  return <div><Header title="Mapa operacional" subtitle="Pesquise por morada ou código postal e veja os serviços por estado" action={<select className="map-filter" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos os estados</option>{Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select>}/>
    <div className="map-summary">{counts.map(({status, count}) => <div className={`map-stat ${status}`} key={status} style={{"--status-color": colors[status]}}><i/><span>{statusLabels[status]}</span><strong>{count}</strong></div>)}</div>
    <section className="panel operations-map"><div className="map-toolbar"><div><strong>Serviços geolocalizados</strong><span>{available} localizações disponíveis</span></div><form className="map-search" onSubmit={searchLocation}><input aria-label="Pesquisar morada ou código postal" value={search} onChange={e => setSearch(e.target.value)} placeholder="Pesquisar morada ou código postal…"/><button className="primary" type="submit" disabled={searching}>{searching ? "A procurar…" : "Pesquisar"}</button></form></div><div className="route-planner"><div className="route-planner-title"><RouteIcon size={18}/><div><strong>Planeador de rotas</strong><span>Seleciona o dia e otimiza a sequência de visitas por técnico</span></div></div><label>Dia da agenda<input type="date" value={routeDate} onChange={e => { setRouteDate(e.target.value); setPlannedRoutes([]); }}/></label><label>Base de partida<select value={routeBase} onChange={e => setRouteBase(e.target.value)}>{SERVICE_BASES.map(base => <option key={base.name} value={base.name}>{base.name}</option>)}</select></label><label>Técnico<select value={routeTechnician} onChange={e => setRouteTechnician(e.target.value)}><option value="all">Todos os técnicos</option>{[...new Map(services.filter(service => service.technician_id).map(service => [String(service.technician_id), { id: service.technician_id, name: service.technician_name || "Técnico" }])).values()].map(tech => <option key={tech.id} value={tech.id}>{tech.name}</option>)}</select></label><button className="primary route-button" type="button" onClick={planRoutes} disabled={routeBusy}><Navigation size={16}/>{routeBusy ? "A calcular…" : "Planear rotas"}</button>{plannedRoutes.length > 0 && <button className="secondary route-button" type="button" onClick={authorizeRouteOrder} disabled={routeSaving}>{routeSaving ? "A atualizar agenda…" : "Autorizar ordem na agenda"}</button>}</div>{routeMessage && <div className="map-message alert success">{routeMessage}</div>}{routeSummary && <div className="route-summary"><Metric label="Serviços" value={routeSummary.total}/><Metric label="Distância total" value={`${routeSummary.distanceKm.toFixed(1)} km`}/><Metric label="Tempo estimado" value={`${Math.floor(routeSummary.durationMinutes/60)}h ${Math.round(routeSummary.durationMinutes%60)}m`}/><Metric label="Custo deslocação (0,75 €/km)" value={`€ ${(routeSummary.distanceKm*DISTANCE_RATE).toLocaleString("pt-PT",{minimumFractionDigits:2})}`}/></div>}{error && <div className="map-message alert danger">{error}</div>}{plannedRoutes.length > 0 && <div className="route-results">{plannedRoutes.map(route => <div className="route-result" key={route.technician.id}><strong>{route.technician.name}</strong><div className="route-result-meta"><span>{route.services.length} serviço{route.services.length===1?"":"s"}</span><span>{route.distanceKm.toFixed(1)} km</span><span>{Math.floor(route.durationMinutes/60)}h {Math.round(route.durationMinutes%60)}m</span><span>€ {(route.distanceKm*DISTANCE_RATE).toLocaleString("pt-PT",{minimumFractionDigits:2})}</span></div><ol>{route.services.map(service => <li key={service.id}>{service.client_name || "Cliente"}<span>{service.title}</span></li>)}</ol></div>)}</div>}<div ref={mapRef} className="google-map" aria-label="Mapa dos serviços técnicos"/></section>
    <p className="map-note">A localização é obtida automaticamente através da morada, código postal e cidade da ficha do cliente. As coordenadas guardadas são usadas apenas como alternativa quando não existe morada.</p>
  </div>;
}
function Services({workspace, setRefresh}) {
  const [q,setQ]=useState(""); const [open,setOpen]=useState(false); const [detail,setDetail]=useState(null); const [status,setStatus]=useState("all");
  const [rows,setRows]=useState([]),[clients,setClients]=useState([]),[techs,setTechs]=useState([]);
  const blank={title:"",description:"",client_id:"",technician_id:"",status:"pending",priority:"normal",service_type:"",machine:"",scheduled_start:"",scheduled_end:"",billable:false,amount:"",notes:""};
  const [form,setForm]=useState(blank);
  async function load(){
    if(!workspace?.id)return;
    const [a,b,c]=await Promise.all([
      supabase.from("service_board").select("*").eq("workspace_id",workspace.id).order("scheduled_start",{ascending:true,nullsFirst:false}).order("created_at",{ascending:false}),
      // Use the complete client row: older databases may not have optional coordinate columns.
      supabase.from("clients").select("*").eq("workspace_id",workspace.id).order("name"),
      supabase.from("technicians").select("id,name").eq("workspace_id",workspace.id).eq("active",true).order("name")
    ]);
    if(a.error) console.error("[v0] Erro ao carregar serviços:",a.error);
    if(b.error) console.error("[v0] Erro ao carregar clientes:",b.error);
    if(c.error) console.error("[v0] Erro ao carregar técnicos:",c.error);
    setRows(a.data||[]);
    setClients(b.data||[]);
    setTechs(c.data||[]);
  }
  useEffect(()=>{load()},[workspace?.id]);
  useEffect(()=>{if(!workspace?.id)return;const ch=supabase.channel("services-live-list").on("postgres_changes",{event:"*",schema:"public",table:"services",filter:`workspace_id=eq.${workspace.id}`},load).subscribe();return()=>supabase.removeChannel(ch)},[workspace?.id]);
  const filtered=rows.filter(r=>(status==="all"||r.board_status===status)&&((r.client_name||"")+" "+(r.title||"")+" "+(r.technician_name||"")).toLowerCase().includes(q.toLowerCase()));
  const selectedClient=clients.find(client=>String(client.id)===String(form.client_id));
  const estimate=serviceEstimate(selectedClient,form.scheduled_start,form.scheduled_end);
  async function save(e){e.preventDefault();const payload={...form,workspace_id:workspace.id,created_by:(await supabase.auth.getUser()).data.user?.id,technician_id:form.technician_id||null,amount:Number(estimate.amount.toFixed(2)),billable:true,scheduled_start:localDateTimeToIso(form.scheduled_start),scheduled_end:localDateTimeToIso(form.scheduled_end),status:form.scheduled_start&&form.status==="pending"?"scheduled":form.status};const {error}=await supabase.from("services").insert(payload);if(error)return alert(error.message);setOpen(false);setForm(blank);load();setRefresh?.(x=>x+1)}
  async function move(id,newStatus){const {error}=await supabase.from("services").update({status:newStatus,invoiced:newStatus==="completed"?false:false}).eq("id",id);if(error)alert(error.message);else{load();setRefresh?.(x=>x+1)}}
  return <div><Header title="Serviços" subtitle="Gestão operacional e acompanhamento das intervenções" action={<button className="primary" onClick={()=>setOpen(true)}><Plus size={17}/> Novo serviço</button>}/>
    <div className="toolbar"><div className="search"><Search size={17}/><input placeholder="Pesquisar cliente, serviço ou técnico…" value={q} onChange={e=>setQ(e.target.value)}/></div><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos os estados</option><option value="pending">Pendente</option><option value="scheduled">Agendado</option><option value="in_progress">Em curso</option><option value="completed">Concluído</option><option value="invoiced">Faturado</option></select></div>
    <div className="panel"><ServiceTable rows={filtered} onSelect={setDetail}/><div className="quick-actions">{filtered.slice(0,10).map(r=><div className="quick-row" key={r.id}><button className="table-link" onClick={()=>setDetail(r)}>{r.client_name} — {r.title}</button><div><select value={r.status} onChange={e=>move(r.id,e.target.value)}><option value="pending">Pendente</option><option value="scheduled">Agendado</option><option value="in_progress">Em curso</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></div></div>)}</div></div>
    {open&&<Modal title="Novo serviço" close={()=>setOpen(false)}><form onSubmit={save} className="form-grid service-form"><label>Título<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label><label>Cliente<select required value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}><option value="">Selecionar…</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Técnico<select value={form.technician_id} onChange={e=>setForm({...form,technician_id:e.target.value||null})}><option value="">Por atribuir</option>{techs.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Tipo<input value={form.service_type} onChange={e=>setForm({...form,service_type:e.target.value})}/></label><label>Máquina/equipamento<input value={form.machine} onChange={e=>setForm({...form,machine:e.target.value})}/></label><label>Prioridade<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label>Início<input type="datetime-local" value={form.scheduled_start} onChange={e=>setForm({...form,scheduled_start:e.target.value})}/></label><label>Fim<input type="datetime-local" value={form.scheduled_end} onChange={e=>setForm({...form,scheduled_end:e.target.value})}/></label><label className="span2">Descrição<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label className="check"><input type="checkbox" checked={form.billable} onChange={e=>setForm({...form,billable:e.target.checked})}/> A faturar</label><label>Valor calculado<input type="number" step="0.01" value={estimate.amount.toFixed(2)} readOnly/><small className="field-help">{estimate.durationHours.toFixed(2)} h × € {HOURLY_RATE.toFixed(2)}{estimate.distanceKm!=null?` + ${estimate.distanceKm.toFixed(1)} km (ida e volta) × € ${DISTANCE_RATE.toFixed(2)} · origem: ${estimate.base}`:" · indique coordenadas do cliente para calcular deslocação"}</small></label><label className="span2">Notas<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="modal-actions span2"><button type="button" className="ghost" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary">Criar serviço</button></div></form></Modal>}
    {detail&&<ServiceDetail service={detail} workspace={workspace} close={()=>setDetail(null)} setRefresh={setRefresh}/>} 
  </div>
}

function Kanban({workspace,setRefresh}) {
  const [rows,setRows]=useState([]),[detail,setDetail]=useState(null),[q,setQ]=useState(""),[priority,setPriority]=useState("all"),[technician,setTechnician]=useState("all"),[date,setDate]=useState("all");
  const cols=[['pending','PENDENTE'],['scheduled','AGENDADO'],['in_progress','EM CURSO'],['completed','CONCLUÍDO'],['invoiced','FATURADO']];
  async function load(){if(!workspace?.id)return;const {data,error}=await supabase.from("service_board").select("*").eq("workspace_id",workspace.id).order("scheduled_start",{ascending:true,nullsFirst:false});if(error)alert(error.message);else setRows(data||[])}
  useEffect(()=>{load()},[workspace?.id]);
  useEffect(()=>{if(!workspace?.id)return;const ch=supabase.channel(`services-live-kanban-${workspace.id}`).on("postgres_changes",{event:"*",schema:"public",table:"services",filter:`workspace_id=eq.${workspace.id}`},load).subscribe();return()=>supabase.removeChannel(ch)},[workspace?.id]);
  async function drop(target){const id=window.__dragServiceId;if(!id)return;const row=rows.find(x=>x.id===id);if(!row||row.board_status===target)return;const allowed={pending:["scheduled","cancelled"],scheduled:["pending","in_progress","cancelled"],in_progress:["scheduled","completed"],completed:["invoiced","in_progress"],invoiced:[]};if(!allowed[row.board_status]?.includes(target)){alert(`Movimento inválido: ${row.board_status} → ${target}.`);return}if(target==="completed"&&!window.confirm("Confirmar que este serviço foi concluído?"))return;const payload=target==="invoiced"?{status:"completed",invoiced:true}:{status:target,invoiced:false};const {error}=await supabase.from("services").update(payload).eq("id",id);if(error)alert(error.message);else{load();setRefresh?.(x=>x+1)}}
  const technicians=[...new Set(rows.map(r=>r.technician_name).filter(Boolean))];
  const visible=rows.filter(r=>{const text=((r.client_name||"")+" "+(r.title||"")+" "+(r.technician_name||"")).toLowerCase();const matchesDate=date==="all"||(date==="today"&&r.scheduled_start&&localDateKey(r.scheduled_start)===localDateKey(new Date()));return text.includes(q.toLowerCase())&&(priority==="all"||r.priority===priority)&&(technician==="all"||r.technician_name===technician)&&matchesDate});
  return <div><Header title="Kanban operacional" subtitle="Visão completa do fluxo técnico, com prioridades e controlo de estado"/><div className="toolbar kanban-filters"><div className="search"><Search size={17}/><input aria-label="Pesquisar no Kanban" placeholder="Cliente, serviço ou técnico…" value={q} onChange={e=>setQ(e.target.value)}/></div><select aria-label="Filtrar prioridade" value={priority} onChange={e=>setPriority(e.target.value)}><option value="all">Todas as prioridades</option><option value="urgent">Urgente</option><option value="high">Alta</option><option value="normal">Normal</option><option value="low">Baixa</option></select><select aria-label="Filtrar técnico" value={technician} onChange={e=>setTechnician(e.target.value)}><option value="all">Todos os técnicos</option>{technicians.map(name=><option key={name}>{name}</option>)}</select><select aria-label="Filtrar data" value={date} onChange={e=>setDate(e.target.value)}><option value="all">Todas as datas</option><option value="today">Hoje</option></select></div><div className="kanban">{cols.map(([key,label])=>{const cards=visible.filter(r=>r.board_status===key);return <section className="kanban-col" key={key} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(key)}><div className="kanban-head"><h2>{label}</h2><span>{cards.length}</span></div><div className="kanban-body">{cards.map(r=><article className={`kanban-card ${r.scheduled_start&&new Date(r.scheduled_start)<new Date()&&!['completed','invoiced'].includes(r.board_status)?"is-late":""}`} key={r.id} draggable onDragStart={()=>window.__dragServiceId=r.id} onClick={()=>setDetail(r)}><div className="card-top"><Status s={r.board_status}/><span className={`priority ${r.priority}`}>{({low:"Baixa",normal:"Normal",high:"Alta",urgent:"Urgente"})[r.priority]}</span></div><strong>{r.client_name||"Sem cliente"}</strong><p>{r.title||"Serviço técnico"}</p><small>🔧 {r.technician_name||"Por atribuir"}</small><small>📅 {r.scheduled_start?new Date(r.scheduled_start).toLocaleString("pt-PT",{dateStyle:"short",timeStyle:"short"}):"Sem data"}</small>{r.machine&&<small>🏭 {r.machine}</small>}{r.billable&&<div className="card-value">€ {Number(r.amount||0).toLocaleString("pt-PT",{minimumFractionDigits:2})}</div>}<button className="card-open" type="button" onClick={e=>{e.stopPropagation();setDetail(r)}}>Abrir serviço</button></article>)}{!cards.length&&<div className="kanban-empty">Sem serviços neste filtro</div>}</div></section>})}</div>{detail&&<ServiceDetail service={detail} workspace={workspace} close={()=>setDetail(null)} setRefresh={setRefresh}/>}</div>
}

function Modal({title,close,children}){return <div className="modal-back"><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={close}><X size={18}/></button></div>{children}</div></div>}

function Clients({workspace,setRefresh}) {
  const [rows,setRows]=useState([]),[open,setOpen]=useState(false),[q,setQ]=useState(""),[editing,setEditing]=useState(null),[busy,setBusy]=useState(false),[profile,setProfile]=useState(null),[profileServices,setProfileServices]=useState([]);
  const emptyClient={name:"",contact_name:"",phone:"",email:"",address:"",postal_code:"",city:"",notes:""};
  const [form,setForm]=useState(emptyClient);
  async function load(){if(!workspace?.id)return; const {data}=await supabase.from("clients").select("*").eq("workspace_id",workspace.id).order("name");setRows(data||[])}
  useEffect(()=>{load()},[workspace?.id]);
  useEffect(()=>{if(!workspace?.id)return;const channel=supabase.channel(`clients-live-${workspace.id}`).on("postgres_changes",{event:"*",schema:"public",table:"clients",filter:`workspace_id=eq.${workspace.id}`},load).subscribe();return()=>supabase.removeChannel(channel)},[workspace?.id]);
  async function save(e){
    e.preventDefault(); setBusy(true);
    const query=editing ? supabase.from("clients").update(form).eq("id",editing.id) : supabase.from("clients").insert({...form,workspace_id:workspace.id});
    const {error}=await query; setBusy(false);
    if(error) return alert(error.message);
    setOpen(false); setEditing(null); setForm(emptyClient); load(); setRefresh?.(x=>x+1);
  }
  async function removeClient(client){
    if(!window.confirm(`Eliminar o cliente “${client.name}”? Os serviços associados podem ficar sem cliente.`)) return;
    setBusy(true); const {error}=await supabase.from("clients").delete().eq("id",client.id); setBusy(false);
    if(error) return alert(error.message); load(); setRefresh?.(x=>x+1);
  }
  function editClient(client){setEditing(client);setForm({...emptyClient,...client});setOpen(true)}
  async function openProfile(client){setProfile(client);const {data}=await supabase.from("service_board").select("*").eq("workspace_id",workspace.id).eq("client_id",client.id).order("scheduled_start",{ascending:false});setProfileServices(data||[])}
  const f=rows.filter(x=>(x.name+" "+(x.city||"")+" "+(x.phone||"")).toLowerCase().includes(q.toLowerCase()));
  function maps(c){const query=[c.address,c.postal_code,c.city].filter(Boolean).join(", ");return query?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`:null}
  return <div><Header title="Clientes" subtitle="Clientes, contactos, moradas e localização" action={<button className="primary" onClick={()=>setOpen(true)}><Plus size={17}/> Novo cliente</button>}/>
    <div className="toolbar"><div className="search"><Search size={17}/><input placeholder="Pesquisar cliente…" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    <div className="panel"><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th>Telefone</th><th>Cidade</th><th>Morada</th><th>Mapa</th><th aria-label="Ações"></th></tr></thead><tbody>{f.map(c=><tr key={c.id} onClick={()=>openProfile(c)} className="click-row"><td><strong>{c.name}</strong></td><td>{c.contact_name||"—"}</td><td>{c.phone||"—"}</td><td>{c.city||"—"}</td><td>{c.address||"—"}</td><td>{maps(c)?<a className="table-link" href={maps(c)} target="_blank" rel="noreferrer">Abrir mapa</a>:"—"}</td><td><div className="row-actions"><button className="icon-btn small" aria-label={`Editar ${c.name}`} onClick={()=>editClient(c)}><Pencil size={14}/></button><button className="icon-btn small danger-icon" aria-label={`Eliminar ${c.name}`} onClick={()=>removeClient(c)} disabled={busy}><Trash2 size={14}/></button></div></td></tr>)}{!f.length&&<tr><td colSpan="7" className="empty">Sem clientes.</td></tr>}</tbody></table></div></div>
    {open&&<Modal title={editing?"Editar cliente":"Novo cliente"} close={()=>{setOpen(false);setEditing(null);setForm(emptyClient)}}><form onSubmit={save} className="form-grid client-form"><div className="form-section-heading span2"><span className="form-section-icon"><Users size={16}/></span><div><strong>Dados do cliente</strong><small>Identificação e contactos principais</small></div></div>{["name","contact_name","phone","email","address","postal_code","city"].map(k=><label key={k}>{({name:"Nome completo",contact_name:"Pessoa de contacto",phone:"Telefone",email:"Email",address:"Morada",postal_code:"Código postal",city:"Cidade"})[k]}<input required={k==="name"} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<label className="span2">Notas internas<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="modal-actions span2"><button type="button" className="ghost" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary" disabled={busy}>{busy?"A guardar…":editing?"Guardar alterações":"Criar cliente"}</button></div></form></Modal>}
  {profile&&<Modal title={profile.name} close={()=>setProfile(null)}><div className="client-profile"><div className="client-profile-grid"><div><span>Serviços em aberto</span><strong>{profileServices.filter(item=>!['completed','invoiced','cancelled'].includes(item.board_status)).length}</strong></div><div><span>Total de serviços</span><strong>{profileServices.length}</strong></div><div><span>Contacto</span><strong>{profile.contact_name||"—"}</strong></div><div><span>Telefone</span><strong>{profile.phone||"—"}</strong></div><div><span>Email</span><strong>{profile.email||"—"}</strong></div><div><span>Morada</span><strong>{[profile.address,profile.postal_code,profile.city].filter(Boolean).join(", ")||"—"}</strong></div></div><h3>Histórico de assistência</h3><ServiceTable rows={profileServices} onSelect={()=>{}}/></div></Modal>}</div>
}

function Technicians({workspace}) {
  const d=useData(async()=>{
    if(!workspace?.id)return[];
    const monday=new Date(); monday.setHours(0,0,0,0); const day=monday.getDay(); monday.setDate(monday.getDate()+(day===0?-6:1-day));
    const friday=new Date(monday); friday.setDate(friday.getDate()+5);
    const defaultTechnicianNames=["Fabio Silva","Jorge Monteiro","Ruben Gonçalves","Tiago Vieira","Valerii","Orlando","Menassa"];
    const existingResult=await supabase.from("technicians").select("name").eq("workspace_id",workspace.id);
    if(existingResult.error)throw existingResult.error;
    const existingNames=new Set((existingResult.data||[]).map(t=>t.name.trim().toLocaleLowerCase("pt-PT")));
    const missingNames=defaultTechnicianNames.filter(name=>!existingNames.has(name.toLocaleLowerCase("pt-PT")));
    if(missingNames.length){const {error}=await supabase.from("technicians").insert(missingNames.map(name=>({workspace_id:workspace.id,name,active:true})));if(error)throw error;}
    const [techResult,serviceResult]=await Promise.all([
      supabase.from("technicians").select("id,name,active,email,phone").eq("workspace_id",workspace.id).order("name"),
      supabase.from("services").select("technician_id,status,scheduled_start,invoiced").eq("workspace_id",workspace.id).gte("scheduled_start",monday.toISOString()).lt("scheduled_start",friday.toISOString())
    ]);
    if(techResult.error)throw techResult.error; if(serviceResult.error)throw serviceResult.error;
    const start=todayStart(); const end=new Date(start); end.setDate(end.getDate()+1);
    return (techResult.data||[]).map(t=>{const rows=(serviceResult.data||[]).filter(s=>s.technician_id===t.id);return {...t,technician_id:t.id,open_services:rows.filter(s=>!['completed','cancelled'].includes(s.status)&&!s.invoiced).length,active_services:rows.filter(s=>s.status==='in_progress').length,week_services:rows.length,today_services:rows.filter(s=>s.scheduled_start&&new Date(s.scheduled_start)>=start&&new Date(s.scheduled_start)<end).length};});
  },[workspace?.id]);
  const [editing,setEditing]=useState(null),[form,setForm]=useState({name:"",email:"",phone:"",active:true}),[busy,setBusy]=useState(false);
  function startEdit(t){setEditing(t);setForm({name:t.name||"",email:t.email||"",phone:t.phone||"",active:t.active!==false});}
  async function save(e){e.preventDefault();setBusy(true);const {error}=await supabase.from("technicians").update(form).eq("id",editing.id);setBusy(false);if(error)return alert(error.message);setEditing(null);d.reload();}
  async function remove(t){if(!window.confirm(`Eliminar o técnico “${t.name}”?`))return;setBusy(true);const {error}=await supabase.from("technicians").delete().eq("id",t.id);setBusy(false);if(error)return alert(error.message);d.reload();}
  useEffect(()=>{if(!workspace?.id)return;const channel=supabase.channel(`technicians-live-${workspace.id}`).on("postgres_changes",{event:"*",schema:"public",table:"services",filter:`workspace_id=eq.${workspace.id}`},d.reload).on("postgres_changes",{event:"*",schema:"public",table:"technicians",filter:`workspace_id=eq.${workspace.id}`},d.reload).subscribe();return()=>supabase.removeChannel(channel)},[workspace?.id]);
  return <div><Header title="Técnicos" subtitle="Carga semanal, disponibilidade e serviços em aberto"/><div className="cards-grid">{d.data?.map(t=><div className="panel tech-card" key={t.technician_id}><div className="tech-title"><div className="avatar big">{t.name.slice(0,1)}</div><div><h2>{t.name}</h2><span className={`status ${!t.active?'red':t.active_services>0?'orange':'green'}`}>{!t.active?'Indisponível':t.active_services>0?'Ocupado':'Disponível'}</span></div><div className="row-actions"><button className="icon-btn" title="Editar técnico" onClick={()=>startEdit(t)}><Pencil size={15}/></button><button className="icon-btn danger-icon" title="Eliminar técnico" onClick={()=>remove(t)}><Trash2 size={15}/></button></div></div><div className="statline"><span>Em curso</span><strong>{t.active_services}</strong></div><div className="statline"><span>Hoje</span><strong>{t.today_services}</strong></div><div className="tech-load-bar"><i style={{width:`${Math.min(100,(t.week_services||0)*8)}%`}}/></div><div className="statline"><span>Semana de trabalho</span><strong>{t.week_services}</strong></div><div className="statline"><span>Em aberto</span><strong>{t.open_services}</strong></div><div className="tech-contact">{t.email||"Sem email"} · {t.phone||"Sem telefone"}</div></div>)}{!d.data?.length&&!d.loading&&<div className="panel empty">Ainda não existem técnicos associados ao workspace.</div>}</div>{editing&&<Modal title="Editar técnico" close={()=>setEditing(null)}><form onSubmit={save} className="form-grid"><label>Nome<input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Email<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Telefone<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Estado<select value={form.active?"true":"false"} onChange={e=>setForm({...form,active:e.target.value==="true"})}><option value="true">Ativo</option><option value="false">Inativo</option></select></label><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setEditing(null)}>Cancelar</button><button className="primary" disabled={busy}>{busy?"A guardar…":"Guardar alterações"}</button></div></form></Modal>}</div>
}

function todayStart(){const d=new Date();d.setHours(0,0,0,0);return d}

function distanceKm(a,b){
  const earthRadius=6371;
  const lat1=a.lat*Math.PI/180, lat2=b.lat*Math.PI/180;
  const dLat=(b.lat-a.lat)*Math.PI/180, dLng=(b.lng-a.lng)*Math.PI/180;
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return earthRadius*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}

function serviceEstimate(client,start,end){
  const lat=Number(client?.latitude), lng=Number(client?.longitude);
  const durationHours=start&&end ? Math.max(0,(new Date(end)-new Date(start))/3600000) : 0;
  if(!Number.isFinite(lat)||!Number.isFinite(lng)) return {durationHours, distanceKm:null, amount:durationHours*HOURLY_RATE, base:null};
  const origin={lat,lng};
  const nearest=SERVICE_BASES.map(base=>({...base,distance:distanceKm(origin,base)})).sort((a,b)=>a.distance-b.distance)[0];
  const roundTripKm=nearest.distance*2;
  return {durationHours,distanceKm:roundTripKm,amount:durationHours*HOURLY_RATE+roundTripKm*DISTANCE_RATE,base:nearest.name};
}

function localDateKey(value){
  if(!value)return "";
  const text=String(value);
  if(!/[zZ]|[+-]\d{2}:?\d{2}$/.test(text))return text.slice(0,10);
  const date=new Date(value);
  return Number.isNaN(date.getTime())?text.slice(0,10):`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

function localDateTimeToIso(value){
  if(!value)return null;
  const date=new Date(value);
  return Number.isNaN(date.getTime())?null:date.toISOString();
}

function isoToLocalInput(value){
  if(!value)return "";
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return String(value).slice(0,16);
  const pad=number=>String(number).padStart(2,"0");
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoWeek(date){const d=new Date(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate()));const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));return Math.ceil((((d-yearStart)/86400000)+1)/7)}

function Parts({workspace}) {
  const d=useData(async()=>{if(!workspace?.id)return[];const {data,error}=await supabase.from("part_usage_summary").select("*").eq("workspace_id",workspace.id).order("name");if(error)throw error;return data||[]},[workspace?.id]);
  const lowStock=(d.data||[]).filter(p=>Number(p.stock_quantity||0)<=Number(p.minimum_stock??p.min_stock??5));
  const totalValue=(d.data||[]).reduce((sum,p)=>sum+Number(p.stock_quantity||0)*Number(p.unit_cost||0),0);
  return <div><Header title="Peças e stock" subtitle="Disponibilidade, utilização e alertas de reposição"/><div className="parts-summary"><Metric label="Referências" value={d.data?.length||0}/><Metric label="Stock baixo" value={lowStock.length} tone={lowStock.length?"danger":"good"}/><Metric label="Valor em stock" value={`€ ${totalValue.toLocaleString("pt-PT",{minimumFractionDigits:2})}`}/></div><div className="panel"><div className="table-wrap"><table><thead><tr><th>Referência</th><th>Peça</th><th>Stock atual</th><th>Mínimo</th><th>Estado</th><th>Custo</th><th>Utilizada</th><th>Serviços</th></tr></thead><tbody>{d.data?.map(p=>{const minimum=Number(p.minimum_stock??p.min_stock??5),stock=Number(p.stock_quantity||0),low=stock<=minimum;return <tr key={p.part_id} className={low?"stock-low":""}><td>{p.reference||"—"}</td><td><strong>{p.name}</strong></td><td>{stock}</td><td>{minimum}</td><td><span className={`status ${low?"red":"green"}`}>{low?"Repor":"Disponível"}</span></td><td>€ {Number(p.unit_cost||0).toFixed(2)}</td><td>{p.quantity_used||0}</td><td>{p.service_count||0}</td></tr>})}</tbody></table></div></div></div>
}

function Calendar({workspace,refresh}) {
  const [weekStart,setWeekStart]=useState(()=>{const d=new Date();d.setHours(0,0,0,0);const day=d.getDay();const diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);return d});
  const [services,setServices]=useState([]),[techs,setTechs]=useState([]),[availability,setAvailability]=useState([]),[loading,setLoading]=useState(true),[filterTech,setFilterTech]=useState("all"),[moving,setMoving]=useState(false);
  const days=useMemo(()=>Array.from({length:5},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d}),[weekStart]);
  const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const weekLabel=`Semana ${isoWeek(weekStart)} · ${weekStart.toLocaleDateString("pt-PT",{day:"2-digit",month:"short"})} – ${days[days.length-1]?.toLocaleDateString("pt-PT",{day:"2-digit",month:"short",year:"numeric"})}`;
  async function load(){
    if(!workspace?.id)return;
    setLoading(true);
    const from=iso(days[0]); const queryEnd=new Date(days[days.length-1]); queryEnd.setDate(queryEnd.getDate()+1); const to=iso(queryEnd);
    const [s,t,a,c]=await Promise.all([
      supabase.from("services").select("*").eq("workspace_id",workspace.id).not("scheduled_start","is",null).order("scheduled_start"),
      supabase.from("technicians").select("id,name,active").eq("workspace_id",workspace.id).eq("active",true).order("name"),
      supabase.from("technician_availability").select("*").eq("workspace_id",workspace.id).gte("availability_date",from).lt("availability_date",to),
      supabase.from("clients").select("id,name").eq("workspace_id",workspace.id)
    ]);
    if (s.error || t.error || a.error || c.error) throw s.error || t.error || a.error || c.error;
    const technicianNames=new Map((t.data||[]).map(tech=>[String(tech.id),tech.name]));
    const clientNames=new Map((c.data||[]).map(client=>[String(client.id),client.name]));
    const weekServices=(s.data||[]).filter(service=>localDateKey(service.scheduled_start)>=from&&localDateKey(service.scheduled_start)<to);
    setServices(weekServices.map(service=>({...service,client_name:service.client_name||clientNames.get(String(service.client_id))||"Cliente",technician_name:service.technician_name||technicianNames.get(String(service.technician_id))||"Por atribuir"})));
    setTechs(t.data||[]);setAvailability(a.data||[]);setLoading(false);
  }
  useEffect(()=>{load()},[workspace?.id,weekStart.toISOString(),refresh]);
  function servicesFor(techId,date){return services.filter(x=>String(x.technician_id)===String(techId)&&localDateKey(x.scheduled_start)===iso(date))}
  function unavailable(techId,date){const a=availability.find(x=>String(x.technician_id)===String(techId)&&String(x.availability_date).slice(0,10)===iso(date));return a?.start_time==null&&a?.end_time==null?a:null}
  async function moveService(service, targetTech, targetDate){
    if(!service||unavailable(targetTech,targetDate)) return alert("Este técnico está indisponível nesse dia.");
    setMoving(true);
    const original=new Date(service.scheduled_start); const next=new Date(`${iso(targetDate)}T${String(original.getHours()).padStart(2,"0")}:${String(original.getMinutes()).padStart(2,"0")}:00`);
    const duration=Math.max(30,(new Date(service.scheduled_end||service.scheduled_start)-new Date(service.scheduled_start))/60000||60);
    const end=new Date(next.getTime()+duration*60000);
    const conflict=services.find(item=>item.id!==service.id&&String(item.technician_id)===String(targetTech)&&localDateKey(item.scheduled_start)===iso(targetDate)&&new Date(item.scheduled_start)<end&&new Date(item.scheduled_end||item.scheduled_start).getTime()>next.getTime());
    if(conflict&&!window.confirm(`Conflito de horário com ${conflict.client_name||"outro serviço"}. Pretende continuar?`)){setMoving(false);return}
    const {error}=await supabase.from("services").update({technician_id:targetTech,scheduled_start:next.toISOString(),scheduled_end:end.toISOString()}).eq("id",service.id);
    setMoving(false); if(error) return alert(error.message); load();
  }
  return <div><Header title="Calendário" subtitle="Planeamento semanal por técnico e disponibilidade" action={<div className="calendar-nav"><button className="ghost" aria-label="Semana anterior" onClick={()=>setWeekStart(new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate()-7))}>‹ <span>Anterior</span></button><button className="today-btn" onClick={()=>{const d=new Date();d.setHours(0,0,0,0);const day=d.getDay();const diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);setWeekStart(d)}}>Hoje</button><button className="ghost" aria-label="Próxima semana" onClick={()=>setWeekStart(new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate()+7))}><span>Próxima</span> ›</button></div>}/> 
    <div className="calendar-toolbar"><div><span className="eyebrow">Planeamento</span><strong>{weekLabel}</strong></div><div className="calendar-controls"><label>Técnico<select value={filterTech} onChange={e=>setFilterTech(e.target.value)}><option value="all">Todos os técnicos</option>{techs.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><span className="calendar-count">{services.length} {services.length===1?"serviço agendado":"serviços agendados"}</span></div></div>
    <div className="calendar-legend"><span><i className="legend-dot booked"/> Serviço marcado</span><span><i className="legend-dot unavailable"/> Técnico indisponível</span><span><i className="legend-euro">€</i> A faturar</span></div>
    <div className="panel calendar-board">
      <div className="calendar-grid-header"><div className="day-label-cell">Data</div>{techs.filter(t=>filterTech==="all"||String(t.id)===String(filterTech)).map(t=><div key={t.id} className="tech-head"><span className="tech-avatar">{t.name.slice(0,1).toUpperCase()}</span><strong>{t.name}</strong></div>)}</div>
      {loading?<Loading/>:days.map(d=><div className="calendar-grid-row" key={iso(d)}><div className={`day-head ${iso(d)===iso(new Date())?"today":""}`}><strong>{d.toLocaleDateString("pt-PT",{weekday:"short"})}</strong><span>{d.getDate().toString().padStart(2,"0")}/{(d.getMonth()+1).toString().padStart(2,"0")}</span></div>{techs.filter(t=>filterTech==="all"||String(t.id)===String(filterTech)).map(t=>{const items=servicesFor(t.id,d),off=unavailable(t.id,d);return <div key={t.id} className={`day-cell ${off?"day-off":""}`} title={off?.reason||""} onDragOver={e=>e.preventDefault()} onDrop={()=>moveService(window.__calendarDragService,t.id,d)}>{off?<div className="off-label">INDISPONÍVEL{off.reason?` • ${off.reason}`:""}</div>:items.map(x=><div className="cal-card" key={x.id} draggable onDragStart={()=>{window.__calendarDragService=x}} onClick={()=>window.dispatchEvent(new CustomEvent("open-service",{detail:x}))}><strong>{x.client_name}</strong><span>{x.scheduled_start?new Date(x.scheduled_start).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"}):"—"} · {x.title}</span>{x.billable&&<b>€ {Number(x.amount||0).toLocaleString("pt-PT",{minimumFractionDigits:2})}</b>}</div>)}{!off&&!items.length&&<span className="empty-slot">—</span>}</div>})}</div>)}
    </div>
  </div>
}

function Reports({workspace}) {
  const d=useData(async()=>{if(!workspace?.id)return[];const {data,error}=await supabase.from("client_service_summary").select("*").eq("workspace_id",workspace.id).order("to_invoice_amount",{ascending:false});if(error)throw error;return data||[]},[workspace?.id]);
  return <div><Header title="Relatórios" subtitle="Resumo por cliente e faturação"/><div className="panel"><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Total de serviços</th><th>A faturar</th></tr></thead><tbody>{d.loading?<tr><td colSpan="3"><Loading/></td></tr>:d.error?<tr><td colSpan="3"><ErrorBox e={d.error}/></td></tr>:d.data?.map(x=><tr key={x.client_id}><td><strong>{x.name}</strong></td><td>{x.service_count}</td><td>€ {Number(x.to_invoice_amount||0).toLocaleString("pt-PT",{minimumFractionDigits:2})}</td></tr>)}{!d.loading&&!d.error&&!d.data?.length&&<tr><td colSpan="3" className="empty">Sem dados.</td></tr>}</tbody></table></div></div></div>
}

function ImportCenter({workspace,onRefresh}) {
  const [file,setFile]=useState(null),[kind,setKind]=useState("clients"),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const aliases={name:["name","nome","cliente","client","empresa"],contact_name:["contact_name","contacto","contato","responsável","responsavel"],phone:["phone","telefone","telemóvel","telemovel","tel"],email:["email","e-mail","mail"],address:["address","morada","endereço","endereco"],postal_code:["postal_code","código postal","codigo postal","cp"],city:["city","cidade"],title:["title","título","titulo","serviço","servico","descrição","descricao"],description:["description","descrição","descricao","detalhes"],status:["status","estado"],priority:["priority","prioridade"],service_type:["service_type","tipo","tipo de serviço","tipo de servico"],machine:["machine","máquina","maquina","equipamento"],amount:["amount","valor","preço","preco","total"]};
  const normalize=(value)=>String(value??"").trim().toLocaleLowerCase("pt-PT").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"");
  function mapRow(row){const out={};Object.entries(aliases).forEach(([key,names])=>{const found=Object.keys(row).find(k=>names.some(n=>normalize(k)===normalize(n)||normalize(k).includes(normalize(n))));if(found)out[key]=row[found]});return out}
  async function readPdf(blob){const { getDocument }=await import("pdfjs-dist");const pdf=await getDocument({data:await blob.arrayBuffer()}).promise;let text="";for(let i=1;i<=pdf.numPages;i++){const page=await pdf.getPage(i);const content=await page.getTextContent();text+=content.items.map(x=>x.str).join(" ")+"\\n"}return text.split(/\\n|(?=\\b(?:cliente|nome)\\s*[:;-])/i).map(line=>{const email=line.match(/[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}/)?.[0]||"";const phone=line.match(/(?:\\+351\\s*)?9\\d{2}[\\s-]?\\d{3}[\\s-]?\\d{3}/)?.[0]||"";return {name:line.replace(email,"").replace(phone,"").replace(/^(cliente|nome)\\s*[:;-]?/i,"").trim(),email,phone}}).filter(x=>x.name||x.email||x.phone)}
  async function parse(blob){setMessage("");const ext=blob.name.split(".").pop().toLowerCase();if(ext==="pdf")return readPdf(blob);const { read, utils }=await import("xlsx");const workbook=read(await blob.arrayBuffer(),{type:"array",cellDates:true});const all=[];workbook.SheetNames.forEach(sheet=>utils.sheet_to_json(workbook.Sheets[sheet],{defval:""}).forEach(row=>all.push(mapRow(row))));return all.filter(row=>Object.values(row).some(Boolean))}
  async function onFile(e){const selected=e.target.files?.[0];if(!selected)return;setFile(selected);try{const parsed=await parse(selected);setRows(parsed);setMessage(`${parsed.length} registos reconhecidos em ${selected.name}.`)}catch(error){setRows([]);setMessage(`Não foi possível ler o ficheiro: ${error.message}`)}}
  async function importRows(){if(!workspace?.id||!rows.length)return;setBusy(true);const user=(await supabase.auth.getUser()).data.user?.id;const cleaned=rows.map(r=>kind==="clients"?{name:r.name||r.client||"Cliente importado",contact_name:r.contact_name||null,phone:r.phone||null,email:r.email||null,address:r.address||null,postal_code:r.postal_code||null,city:r.city||null,notes:r.notes||null,workspace_id:workspace.id}:{title:r.title||"Serviço importado",description:r.description||null,status:["pending","scheduled","in_progress","completed","cancelled"].includes(normalize(r.status).replace(" ","_"))?normalize(r.status).replace(" ","_"):"pending",priority:["low","normal","high","urgent"].includes(normalize(r.priority))?normalize(r.priority):"normal",service_type:r.service_type||null,machine:r.machine||null,amount:r.amount?Number(String(r.amount).replace(",",".")):null,workspace_id:workspace.id,created_by:user,client_id:null});const {error}=await supabase.from(kind).insert(cleaned);setBusy(false);if(error)return setMessage(`Importação interrompida: ${error.message}`);setMessage(`${cleaned.length} ${kind==="clients"?"clientes":"serviços"} importados com sucesso.`);setRows([]);setFile(null);onRefresh?.(x=>x+1)}
  async function downloadTemplate(){const { utils, writeFile }=await import("xlsx");const sample=kind==="clients"?[{Nome:"Empresa Exemplo",Contacto:"João Silva",Telefone:"912 345 678",Email:"geral@empresa.pt",Morada:"Rua Central 1",Cidade:"Porto","Código postal":"4000-000"}]:[{Título:"Manutenção preventiva",Estado:"pending",Prioridade:"normal",Tipo:"Manutenção",Equipamento:"Máquina 1",Valor:"120"}];const sheet=utils.json_to_sheet(sample);const book=utils.book_new();utils.book_append_sheet(book,sheet,"Importação");writeFile(book,`modelo-${kind}.xlsx`)}
  return <div><Header title="Importar dados" subtitle="Traga informação de clientes e serviços para o PACK4 com validação e pré-visualização"/><div className="import-layout"><section className="panel import-card"><div className="import-icon"><Upload size={22}/></div><h2>Importar ficheiro</h2><p className="muted">Aceitamos Excel (.xlsx, .xls) e PDF. Os dados são lidos localmente antes de serem enviados.</p><label className="file-drop"><input type="file" accept=".xlsx,.xls,.pdf" onChange={onFile}/><FileSpreadsheet size={24}/><strong>{file?file.name:"Escolher ficheiro"}</strong><span>Clique para selecionar ou arraste para aqui</span></label><div className="import-options"><label>Tipo de dados<select value={kind} onChange={e=>setKind(e.target.value)}><option value="clients">Clientes</option><option value="services">Serviços</option></select></label><button className="ghost" onClick={downloadTemplate}><Download size={16}/> Descarregar modelo</button></div>{message&&<div className={`alert ${message.includes("sucesso")?"success":"info"}`}>{message}</div>}</section><section className="panel import-preview"><div className="panel-head"><div><h2>Pré-visualização</h2><p className="muted">Confirme os dados antes de importar.</p></div><span className="status blue">{rows.length} linhas</span></div>{rows.length?<><div className="import-table"><table><thead><tr>{Object.keys(rows[0]).slice(0,6).map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{rows.slice(0,8).map((row,i)=><tr key={i}>{Object.keys(rows[0]).slice(0,6).map(k=><td key={k}>{String(row[k]||"—")}</td>)}</tr>)}</tbody></table></div><button className="primary wide" onClick={importRows} disabled={busy}>{busy?"A importar…":`Importar ${rows.length} ${kind==="clients"?"clientes":"serviços"}`}</button></>:<div className="import-empty"><FileText size={28}/><strong>A pré-visualização aparecerá aqui</strong><span>Use um modelo ou carregue um ficheiro existente.</span></div>}</section></div></div>
}


function SettingsPage({session,workspace,onRefresh}) {
  return <div><Header title="Definições" subtitle="Conta, workspace e integrações"/><div className="grid-2"><div className="panel"><h2>Conta</h2><div className="setting"><span>Email</span><strong>{session.user.email}</strong></div><div className="setting"><span>Workspace</span><strong>{workspace?.name||"Sem workspace atribuído"}</strong></div><div className="setting"><span>Permissão</span><strong>{workspace?.role||"—"}</strong></div></div><div className="panel"><h2>Integrações</h2><div className="integration"><b>Google Sheets</b><span>Preparado para sincronização de leitura, sem alterar a folha original.</span></div><div className="integration"><b>Google Maps</b><span>Preparado para clientes com coordenadas.</span></div><div className="integration"><b>PHC</b><span>Integração futura.</span></div><div className="integration"><b>Supabase Auth</b><span className="status green">Ligado</span></div></div></div></div>
}

export default function App({session}) {
  if (!session) return <Routes><Route path="*" element={<Login/>}/></Routes>;
  return <Shell session={session}/>;
}
