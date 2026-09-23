import React, { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Wrench, CalendarDays, Users, UserRoundCog, Package,
  BarChart3, Settings, LogOut, Plus, Search, RefreshCw, Euro, Clock3,
  CheckCircle2, AlertCircle, CircleDot, X, ChevronRight
} from "lucide-react";
import { supabase } from "./lib/supabase";

const nav = [
  ["/", "Dashboard", LayoutDashboard],
  ["/servicos", "Serviços", Wrench],
  ["/kanban", "Kanban", CircleDot],
  ["/calendario", "Calendário", CalendarDays],
  ["/clientes", "Clientes", Users],
  ["/tecnicos", "Técnicos", UserRoundCog],
  ["/pecas", "Peças", Package],
  ["/relatorios", "Relatórios", BarChart3],
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
    if (error) setError(error.message);
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
      <Routes>
        <Route path="/" element={<Dashboard workspace={workspace} refresh={refresh} />} />
        <Route path="/servicos" element={<Services workspace={workspace} refresh={refresh} setRefresh={setRefresh}/>} />
        <Route path="/kanban" element={<Kanban workspace={workspace} setRefresh={setRefresh}/>} />
        <Route path="/calendario" element={<Calendar workspace={workspace} refresh={refresh}/>} />
        <Route path="/clientes" element={<Clients workspace={workspace} refresh={refresh} setRefresh={setRefresh}/>} />
        <Route path="/tecnicos" element={<Technicians workspace={workspace} refresh={refresh} setRefresh={setRefresh}/>} />
        <Route path="/pecas" element={<Parts workspace={workspace} refresh={refresh} setRefresh={setRefresh}/>} />
        <Route path="/relatorios" element={<Reports workspace={workspace} refresh={refresh}/>} />
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

  return <div>
    <Header title="Dashboard" subtitle="Visão geral do departamento técnico • dados em tempo real"
      action={<button className="icon-btn" onClick={()=>location.reload()}><RefreshCw size={17}/></button>}/>
    <div className="kpis">
      <Kpi icon={Clock3} label="Pendentes" value={m.data?.pending_services ?? "—"}/>
      <Kpi icon={CircleDot} label="Agendados" value={m.data?.scheduled_services ?? "—"}/>
      <Kpi icon={CheckCircle2} label="Concluídos" value={m.data?.completed_services ?? "—"}/>
      <Kpi icon={Euro} label="A faturar" value={m.data?.to_invoice_amount != null ? `€ ${Number(m.data.to_invoice_amount).toLocaleString("pt-PT",{minimumFractionDigits:2})}` : "—"}/>
    </div>
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
    const {data:updated,error}=await supabase.from("services").update({title:data.title,description:data.description,technician_id:data.technician_id||null,status:data.status,priority:data.priority,service_type:data.service_type,machine:data.machine,scheduled_start:data.scheduled_start||null,scheduled_end:data.scheduled_end||null,billable:!!data.billable,amount:data.amount===""?null:Number(data.amount),invoiced:!!data.invoiced,invoice_reference:data.invoice_reference||null,notes:data.notes}).eq("id",data.id).select("*").single();
    setBusy(false); if(error) return alert(error.message); setData(updated); setRefresh?.(x=>x+1); alert("Serviço atualizado.");
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
          <label>Início<input type="datetime-local" value={data.scheduled_start?String(data.scheduled_start).slice(0,16):""} onChange={e=>setData({...data,scheduled_start:e.target.value})}/></label>
          <label>Fim<input type="datetime-local" value={data.scheduled_end?String(data.scheduled_end).slice(0,16):""} onChange={e=>setData({...data,scheduled_end:e.target.value})}/></label>
          <label className="span2">Descrição<textarea value={data.description||""} onChange={e=>setData({...data,description:e.target.value})}/></label>
          <label className="check"><input type="checkbox" checked={!!data.billable} onChange={e=>setData({...data,billable:e.target.checked})}/> A faturar</label>
          <label>Valor<input type="number" step="0.01" value={data.amount??""} onChange={e=>setData({...data,amount:e.target.value})}/></label>
          <label className="check"><input type="checkbox" checked={!!data.invoiced} disabled={data.status!=="completed"} onChange={e=>setData({...data,invoiced:e.target.checked})}/> Faturado</label>
          <label>Referência fatura<input value={data.invoice_reference||""} onChange={e=>setData({...data,invoice_reference:e.target.value})}/></label>
          <label className="span2">Notas<textarea value={data.notes||""} onChange={e=>setData({...data,notes:e.target.value})}/></label>
        </div>
        <div className="modal-actions"><button className="ghost" onClick={close}>Fechar</button><button className="primary" disabled={busy} onClick={save}>{busy?"A guardar…":"Guardar alterações"}</button></div>
      </section>
      <aside className="detail-side">
        <div className="detail-box"><h3>Cliente</h3><strong>{client?.name||service.client_name||"—"}</strong><p>{client?.contact_name||""}</p><p>{client?.phone||""}</p><p>{client?.email||""}</p><p>{client?.address||""}{client?.city?`, ${client.city}`:""}</p></div>
        <div className="detail-box"><h3>Peças necessárias / utilizadas</h3>
          <form className="part-add" onSubmit={addPart}><select value={partId} onChange={e=>setPartId(e.target.value)}><option value="">Adicionar peça…</option>{catalog.map(p=><option key={p.id} value={p.id}>{p.reference?`${p.reference} — `:""}{p.name}</option>)}</select><input type="number" min="1" step="1" value={qty} onChange={e=>setQty(e.target.value)}/><label className="tiny-check"><input type="checkbox" checked={used} onChange={e=>setUsed(e.target.checked)}/> usada</label><button className="primary" type="submit">+</button></form>
          <div className="parts-list">{parts.map(p=><div className="part-row" key={p.part_id}><span><strong>{p.parts?.name}</strong><small>{p.parts?.reference||"Sem referência"} • qtd. {p.quantity}</small></span><span><Status s={p.used?"completed":"pending"}/><button className="icon-btn small" onClick={()=>removePart(p.part_id)}><X size={13}/></button></span></div>)}{!parts.length&&<div className="muted small-text">Ainda não foram adicionadas peças.</div>}</div>
        </div>
        <div className="detail-box"><h3>Histórico</h3>{history.map(h=><div className="history-row" key={h.id}><strong>{h.action==="status_change"?`${h.old_status||"—"} → ${h.new_status||"—"}`:h.action}</strong><small>{new Date(h.created_at).toLocaleString("pt-PT")}</small></div>)}{!history.length&&<div className="muted small-text">Sem alterações registadas.</div>}</div>
      </aside>
    </div>
  </Modal>
}

function Services({workspace, setRefresh}) {
  const [q,setQ]=useState(""); const [open,setOpen]=useState(false); const [detail,setDetail]=useState(null); const [status,setStatus]=useState("all");
  const [rows,setRows]=useState([]),[clients,setClients]=useState([]),[techs,setTechs]=useState([]);
  const blank={title:"",description:"",client_id:"",technician_id:"",status:"pending",priority:"normal",service_type:"",machine:"",scheduled_start:"",scheduled_end:"",billable:false,amount:"",notes:""};
  const [form,setForm]=useState(blank);
  async function load(){if(!workspace?.id)return;const [a,b,c]=await Promise.all([supabase.from("service_board").select("*").eq("workspace_id",workspace.id).order("scheduled_start",{ascending:true,nullsFirst:false}).order("created_at",{ascending:false}),supabase.from("clients").select("id,name").eq("workspace_id",workspace.id).order("name"),supabase.from("technicians").select("id,name").eq("workspace_id",workspace.id).eq("active",true).order("name")]);setRows(a.data||[]);setClients(b.data||[]);setTechs(c.data||[])}
  useEffect(()=>{load()},[workspace?.id]);
  useEffect(()=>{if(!workspace?.id)return;const ch=supabase.channel("services-live-list").on("postgres_changes",{event:"*",schema:"public",table:"services",filter:`workspace_id=eq.${workspace.id}`},load).subscribe();return()=>supabase.removeChannel(ch)},[workspace?.id]);
  const filtered=rows.filter(r=>(status==="all"||r.board_status===status)&&((r.client_name||"")+" "+(r.title||"")+" "+(r.technician_name||"")).toLowerCase().includes(q.toLowerCase()));
  async function save(e){e.preventDefault();const payload={...form,workspace_id:workspace.id,created_by:(await supabase.auth.getUser()).data.user?.id,technician_id:form.technician_id||null,amount:form.amount?Number(form.amount):null,scheduled_start:form.scheduled_start||null,scheduled_end:form.scheduled_end||null};const {error}=await supabase.from("services").insert(payload);if(error)return alert(error.message);setOpen(false);setForm(blank);load();setRefresh?.(x=>x+1)}
  async function move(id,newStatus){const {error}=await supabase.from("services").update({status:newStatus,invoiced:newStatus==="completed"?false:false}).eq("id",id);if(error)alert(error.message);else{load();setRefresh?.(x=>x+1)}}
  return <div><Header title="Serviços" subtitle="Gestão operacional e acompanhamento das intervenções" action={<button className="primary" onClick={()=>setOpen(true)}><Plus size={17}/> Novo serviço</button>}/>
    <div className="toolbar"><div className="search"><Search size={17}/><input placeholder="Pesquisar cliente, serviço ou técnico…" value={q} onChange={e=>setQ(e.target.value)}/></div><select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Todos os estados</option><option value="pending">Pendente</option><option value="scheduled">Agendado</option><option value="in_progress">Em curso</option><option value="completed">Concluído</option><option value="invoiced">Faturado</option></select></div>
    <div className="panel"><ServiceTable rows={filtered} onSelect={setDetail}/><div className="quick-actions">{filtered.slice(0,10).map(r=><div className="quick-row" key={r.id}><button className="table-link" onClick={()=>setDetail(r)}>{r.client_name} — {r.title}</button><div><select value={r.status} onChange={e=>move(r.id,e.target.value)}><option value="pending">Pendente</option><option value="scheduled">Agendado</option><option value="in_progress">Em curso</option><option value="completed">Concluído</option><option value="cancelled">Cancelado</option></select></div></div>)}</div></div>
    {open&&<Modal title="Novo serviço" close={()=>setOpen(false)}><form onSubmit={save} className="form-grid"><label>Título<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label><label>Cliente<select required value={form.client_id} onChange={e=>setForm({...form,client_id:e.target.value})}><option value="">Selecionar…</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Técnico<select value={form.technician_id} onChange={e=>setForm({...form,technician_id:e.target.value||null})}><option value="">Por atribuir</option>{techs.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Tipo<input value={form.service_type} onChange={e=>setForm({...form,service_type:e.target.value})}/></label><label>Máquina/equipamento<input value={form.machine} onChange={e=>setForm({...form,machine:e.target.value})}/></label><label>Prioridade<select value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Baixa</option><option value="normal">Normal</option><option value="high">Alta</option><option value="urgent">Urgente</option></select></label><label>Início<input type="datetime-local" value={form.scheduled_start} onChange={e=>setForm({...form,scheduled_start:e.target.value})}/></label><label>Fim<input type="datetime-local" value={form.scheduled_end} onChange={e=>setForm({...form,scheduled_end:e.target.value})}/></label><label className="span2">Descrição<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label className="check"><input type="checkbox" checked={form.billable} onChange={e=>setForm({...form,billable:e.target.checked})}/> A faturar</label><label>Valor<input type="number" step="0.01" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label><label className="span2">Notas<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="modal-actions span2"><button type="button" className="ghost" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary">Criar serviço</button></div></form></Modal>}
    {detail&&<ServiceDetail service={detail} workspace={workspace} close={()=>setDetail(null)} setRefresh={setRefresh}/>} 
  </div>
}

function Kanban({workspace,setRefresh}) {
  const [rows,setRows]=useState([]),[detail,setDetail]=useState(null),[q,setQ]=useState("");
  const cols=[['pending','PENDENTE'],['scheduled','AGENDADO'],['in_progress','EM CURSO'],['completed','CONCLUÍDO'],['invoiced','FATURADO']];
  async function load(){if(!workspace?.id)return;const {data,error}=await supabase.from("service_board").select("*").eq("workspace_id",workspace.id).order("scheduled_start",{ascending:true,nullsFirst:false});if(error)alert(error.message);else setRows(data||[])}
  useEffect(()=>{load()},[workspace?.id]);
  useEffect(()=>{if(!workspace?.id)return;const ch=supabase.channel("services-live-kanban").on("postgres_changes",{event:"*",schema:"public",table:"services",filter:`workspace_id=eq.${workspace.id}`},load).subscribe();return()=>supabase.removeChannel(ch)},[workspace?.id]);
  async function drop(target){const id=window.__dragServiceId;if(!id)return;const row=rows.find(x=>x.id===id);if(!row)return;const payload=target==="invoiced"?{status:"completed",invoiced:true}:{status:target,invoiced:false};const {error}=await supabase.from("services").update(payload).eq("id",id);if(error)alert(error.message);else{load();setRefresh?.(x=>x+1)}}
  const visible=rows.filter(r=>((r.client_name||"")+" "+(r.title||"")+" "+(r.technician_name||"")).toLowerCase().includes(q.toLowerCase()));
  return <div><Header title="Kanban" subtitle="Pipeline operacional: pendente → agendado → em curso → concluído → faturado"/><div className="toolbar"><div className="search"><Search size={17}/><input placeholder="Pesquisar no Kanban…" value={q} onChange={e=>setQ(e.target.value)}/></div></div><div className="kanban">{cols.map(([key,label])=>{const cards=visible.filter(r=>r.board_status===key);return <section className="kanban-col" key={key} onDragOver={e=>e.preventDefault()} onDrop={()=>drop(key)}><div className="kanban-head"><h2>{label}</h2><span>{cards.length}</span></div><div className="kanban-body">{cards.map(r=><article className="kanban-card" key={r.id} draggable onDragStart={()=>window.__dragServiceId=r.id} onClick={()=>setDetail(r)}><div className="card-top"><Status s={r.board_status}/><span className={`priority ${r.priority}`}>{({low:"Baixa",normal:"Normal",high:"Alta",urgent:"Urgente"})[r.priority]}</span></div><strong>{r.client_name||"Sem cliente"}</strong><p>{r.title}</p><small>{r.technician_name||"Por atribuir"}{r.scheduled_start?` • ${new Date(r.scheduled_start).toLocaleDateString("pt-PT")}`:""}</small>{r.billable&&<div className="card-value">€ {Number(r.amount||0).toLocaleString("pt-PT",{minimumFractionDigits:2})}</div>}</article>)}{!cards.length&&<div className="kanban-empty">Arraste serviços para aqui</div>}</div></section>})}</div>{detail&&<ServiceDetail service={detail} workspace={workspace} close={()=>setDetail(null)} setRefresh={setRefresh}/>}</div>
}

function Modal({title,close,children}){return <div className="modal-back"><div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={close}><X size={18}/></button></div>{children}</div></div>}

function Clients({workspace,setRefresh}) {
  const [rows,setRows]=useState([]),[open,setOpen]=useState(false),[q,setQ]=useState("");
  const [form,setForm]=useState({name:"",contact_name:"",phone:"",email:"",address:"",postal_code:"",city:"",notes:""});
  async function load(){if(!workspace?.id)return; const {data}=await supabase.from("clients").select("*").eq("workspace_id",workspace.id).order("name");setRows(data||[])}
  useEffect(()=>{load()},[workspace?.id]);
  async function save(e){e.preventDefault();const {error}=await supabase.from("clients").insert({...form,workspace_id:workspace.id});if(error)alert(error.message);else{setOpen(false);setForm({name:"",contact_name:"",phone:"",email:"",address:"",postal_code:"",city:"",notes:""});load();setRefresh?.(x=>x+1)}}
  const f=rows.filter(x=>(x.name+" "+(x.city||"")+" "+(x.phone||"")).toLowerCase().includes(q.toLowerCase()));
  function maps(c){const query=[c.address,c.postal_code,c.city].filter(Boolean).join(", ");return query?`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`:null}
  return <div><Header title="Clientes" subtitle="Clientes, contactos, moradas e localização" action={<button className="primary" onClick={()=>setOpen(true)}><Plus size={17}/> Novo cliente</button>}/>
    <div className="toolbar"><div className="search"><Search size={17}/><input placeholder="Pesquisar cliente…" value={q} onChange={e=>setQ(e.target.value)}/></div></div>
    <div className="panel"><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Contacto</th><th>Telefone</th><th>Cidade</th><th>Morada</th><th>Mapa</th></tr></thead><tbody>{f.map(c=><tr key={c.id}><td><strong>{c.name}</strong></td><td>{c.contact_name||"—"}</td><td>{c.phone||"—"}</td><td>{c.city||"—"}</td><td>{c.address||"—"}</td><td>{maps(c)?<a className="table-link" href={maps(c)} target="_blank" rel="noreferrer">Abrir mapa</a>:"—"}</td></tr>)}{!f.length&&<tr><td colSpan="6" className="empty">Sem clientes.</td></tr>}</tbody></table></div></div>
    {open&&<Modal title="Novo cliente" close={()=>setOpen(false)}><form onSubmit={save} className="form-grid">{["name","contact_name","phone","email","address","postal_code","city"].map(k=><label key={k}>{({name:"Nome",contact_name:"Contacto",phone:"Telefone",email:"Email",address:"Morada",postal_code:"Código postal",city:"Cidade"})[k]}<input required={k==="name"} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>)}<label className="span2">Notas<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><div className="modal-actions span2"><button type="button" className="ghost" onClick={()=>setOpen(false)}>Cancelar</button><button className="primary">Criar cliente</button></div></form></Modal>}
  </div>
}

function Technicians({workspace}) {
  const d=useData(async()=>{if(!workspace?.id)return[];const {data,error}=await supabase.from("technician_workload").select("*").eq("workspace_id",workspace.id).order("name");if(error)throw error;return data||[]},[workspace?.id]);
  return <div><Header title="Técnicos" subtitle="Carga, disponibilidade e serviços em aberto"/><div className="cards-grid">{d.data?.map(t=><div className="panel tech-card" key={t.technician_id}><div className="tech-title"><div className="avatar big">{t.name.slice(0,1)}</div><div><h2>{t.name}</h2><span className="status green">Ativo</span></div></div><div className="statline"><span>Em curso</span><strong>{t.active_services}</strong></div><div className="statline"><span>Hoje</span><strong>{t.today_services}</strong></div><div className="statline"><span>Esta semana</span><strong>{t.week_services}</strong></div><div className="statline"><span>Em aberto</span><strong>{t.open_services}</strong></div></div>)}{!d.data?.length&&!d.loading&&<div className="panel empty">Ainda não existem técnicos associados ao workspace.</div>}</div></div>
}

function Parts({workspace}) {
  const d=useData(async()=>{if(!workspace?.id)return[];const {data,error}=await supabase.from("part_usage_summary").select("*").eq("workspace_id",workspace.id).order("name");if(error)throw error;return data||[]},[workspace?.id]);
  return <div><Header title="Peças" subtitle="Stock, referências e utilização em serviços"/><div className="panel"><div className="table-wrap"><table><thead><tr><th>Referência</th><th>Peça</th><th>Stock</th><th>Custo</th><th>Utilizada</th><th>Serviços</th></tr></thead><tbody>{d.data?.map(p=><tr key={p.part_id}><td>{p.reference||"—"}</td><td><strong>{p.name}</strong></td><td>{p.stock_quantity}</td><td>€ {Number(p.unit_cost||0).toFixed(2)}</td><td>{p.quantity_used||0}</td><td>{p.service_count||0}</td></tr>)}</tbody></table></div></div></div>
}

function Calendar({workspace}) {
  const [weekStart,setWeekStart]=useState(()=>{const d=new Date();d.setHours(0,0,0,0);const day=d.getDay();const diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);return d});
  const [services,setServices]=useState([]),[techs,setTechs]=useState([]),[availability,setAvailability]=useState([]),[loading,setLoading]=useState(true);
  const days=useMemo(()=>Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setDate(d.getDate()+i);return d}),[weekStart]);
  const iso=d=>d.toISOString().slice(0,10);
  async function load(){
    if(!workspace?.id)return;
    setLoading(true);
    const from=iso(days[0]), to=iso(days[6]);
    const [s,t,a]=await Promise.all([
      supabase.from("service_calendar").select("*").eq("workspace_id",workspace.id).gte("scheduled_start",from+"T00:00:00").lt("scheduled_start",to+"T23:59:59").order("scheduled_start"),
      supabase.from("technicians").select("id,name,active").eq("workspace_id",workspace.id).eq("active",true).order("name"),
      supabase.from("technician_availability").select("*").eq("workspace_id",workspace.id).gte("availability_date",from).lte("availability_date",to)
    ]);
    setServices(s.data||[]);setTechs(t.data||[]);setAvailability(a.data||[]);setLoading(false);
  }
  useEffect(()=>{load()},[workspace?.id,weekStart.toISOString()]);
  function servicesFor(techId,date){return services.filter(x=>x.technician_id===techId&&x.scheduled_start?.slice(0,10)===iso(date))}
  function unavailable(techId,date){const a=availability.find(x=>x.technician_id===techId&&x.availability_date===iso(date));return a?.available===false?a:null}
  return <div><Header title="Calendário" subtitle="Planeamento semanal por técnico e disponibilidade" action={<div className="calendar-nav"><button className="ghost" onClick={()=>setWeekStart(new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate()-7))}>‹ Semana anterior</button><button className="ghost" onClick={()=>{const d=new Date();d.setHours(0,0,0,0);const day=d.getDay();const diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);setWeekStart(d)}}>Hoje</button><button className="ghost" onClick={()=>setWeekStart(new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate()+7))}>Próxima semana ›</button></div>}/>
    <div className="calendar-legend"><span><i className="legend-dot booked"/> Serviço marcado</span><span><i className="legend-dot unavailable"/> Técnico indisponível</span><span><i className="legend-euro">€</i> A faturar</span></div>
    <div className="panel calendar-board">
      <div className="calendar-grid-header"><div className="tech-cell">Técnico</div>{days.map(d=><div key={iso(d)} className={`day-head ${iso(d)===iso(new Date())?"today":""}`}><strong>{d.toLocaleDateString("pt-PT",{weekday:"short"})}</strong><span>{d.getDate().toString().padStart(2,"0")}/{(d.getMonth()+1).toString().padStart(2,"0")}</span></div>)}</div>
      {loading?<Loading/>:techs.map(t=><div className="calendar-grid-row" key={t.id}><div className="tech-cell"><strong>{t.name}</strong></div>{days.map(d=>{const items=servicesFor(t.id,d),off=unavailable(t.id,d);return <div key={iso(d)} className={`day-cell ${off?"day-off":""}`} title={off?.reason||""}>{off?<div className="off-label">INDISPONÍVEL{off.reason?` • ${off.reason}`:""}</div>:items.map(x=><div className="cal-card" key={x.id}><strong>{x.client_name}</strong><span>{x.scheduled_start?new Date(x.scheduled_start).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"}):"—"} · {x.title}</span>{x.billable&&<b>€ {Number(x.amount||0).toLocaleString("pt-PT",{minimumFractionDigits:2})}</b>}</div>)}{!off&&!items.length&&<span className="empty-slot">—</span>}</div>})}</div>)}
    </div>
  </div>
}

function Reports({workspace}) {
  const d=useData(async()=>{if(!workspace?.id)return[];const {data,error}=await supabase.from("client_service_summary").select("*").eq("workspace_id",workspace.id).order("to_invoice_amount",{ascending:false});if(error)throw error;return data||[]},[workspace?.id]);
  return <div><Header title="Relatórios" subtitle="Resumo por cliente e faturação"/><div className="panel"><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Total</th><th>Em aberto</th><th>Concluídos</th><th>A faturar</th></tr></thead><tbody>{d.data?.map(x=><tr key={x.client_id}><td><strong>{x.client_name}</strong></td><td>{x.total_services}</td><td>{x.open_services}</td><td>{x.completed_services}</td><td>€ {Number(x.to_invoice_amount||0).toLocaleString("pt-PT",{minimumFractionDigits:2})}</td></tr>)}</tbody></table></div></div></div>
}

function SettingsPage({session,workspace,onRefresh}) {
  return <div><Header title="Definições" subtitle="Conta, workspace e integrações"/><div className="grid-2"><div className="panel"><h2>Conta</h2><div className="setting"><span>Email</span><strong>{session.user.email}</strong></div><div className="setting"><span>Workspace</span><strong>{workspace?.name||"Sem workspace atribuído"}</strong></div><div className="setting"><span>Permissão</span><strong>{workspace?.role||"—"}</strong></div></div><div className="panel"><h2>Integrações</h2><div className="integration"><b>Google Sheets</b><span>Preparado para sincronização de leitura, sem alterar a folha original.</span></div><div className="integration"><b>Google Maps</b><span>Preparado para clientes com coordenadas.</span></div><div className="integration"><b>PHC</b><span>Integração futura.</span></div><div className="integration"><b>Supabase Auth</b><span className="status green">Ligado</span></div></div></div></div>
}

export default function App({session}) {
  if (!session) return <Routes><Route path="*" element={<Login/>}/></Routes>;
  return <Shell session={session}/>;
}
