import { useMemo } from "react";
import useSWR from "swr";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, PackageCheck, Users } from "lucide-react";
import { NavLink } from "react-router-dom";
import { fetchClients, fetchEquipment, fetchRecentEquipmentHistory, formatDate, localDateKey, maintenanceStatus } from "../lib/maintenance-data";
import { EmptyState, ErrorNotice, MetricCard, PageHeading, StatusBadge } from "./maintenance-ui";

export default function DashboardPage({ onOpenEquipment }) {
  const clients = useSWR("clients", fetchClients);
  const equipment = useSWR("equipment", fetchEquipment);
  const history = useSWR("equipment-history-recent", fetchRecentEquipmentHistory);
  const rows = equipment.data ?? [];
  const clientRows = clients.data ?? [];
  const equipmentById = useMemo(() => new Map(rows.map((item) => [item.id, item])), [rows]);
  const alerts = useMemo(
    () => rows
      .filter((item) => ["overdue", "soon"].includes(maintenanceStatus(item.next_maintenance_on)))
      .sort((a, b) => String(a.next_maintenance_on).localeCompare(String(b.next_maintenance_on)))
      .slice(0, 8),
    [rows],
  );
  const overdueCount = rows.filter((item) => maintenanceStatus(item.next_maintenance_on) === "overdue").length;
  const upcomingCount = rows.filter((item) => maintenanceStatus(item.next_maintenance_on) === "soon").length;
  const today = localDateKey();

  return (
    <div className="page-content">
      <PageHeading
        eyebrow="PACK4 · Centro de controlo"
        title="Manutenção preventiva"
        description={`Resumo de equipamentos e assistências · ${new Intl.DateTimeFormat("pt-PT", { dateStyle: "long" }).format(new Date())}`}
        action={<button className="button button-secondary" onClick={() => onOpenEquipment?.("")}><PackageCheck aria-hidden="true" /> Ver equipamentos</button>}
      />

      {(equipment.error || clients.error) && <ErrorNotice message="Não foi possível carregar os dados de manutenção." onRetry={() => { equipment.mutate(); clients.mutate(); history.mutate(); }} />}

      <section className="metrics-grid" aria-label="Resumo da manutenção">
        <MetricCard icon={PackageCheck} label="Equipamentos registados" value={equipment.isLoading ? "—" : rows.length} detail="Inventário de clientes" />
        <MetricCard icon={CalendarClock} label="Manutenções próximas" value={equipment.isLoading ? "—" : upcomingCount} detail="Nos próximos 30 dias" tone="teal" />
        <MetricCard icon={AlertTriangle} label="Manutenções atrasadas" value={equipment.isLoading ? "—" : overdueCount} detail={overdueCount ? "Precisam de contacto" : "Sem atrasos registados"} tone={overdueCount ? "warning" : "default"} />
        <MetricCard icon={Users} label="Clientes" value={clients.isLoading ? "—" : clientRows.length} detail="Registos ativos" />
      </section>

      <section className="dashboard-grid">
        <article className="content-card alert-card">
          <div className="section-title-row">
            <div><span className="eyebrow">Acompanhamento</span><h2>Avisos de manutenção</h2></div>
            <span className="section-count">{alerts.length}</span>
          </div>
          {equipment.isLoading ? <div className="loading-line" aria-label="A carregar avisos" /> : alerts.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Equipamento</th><th>Cliente</th><th>Próxima manutenção</th><th>Estado</th><th><span className="sr-only">Ações</span></th></tr></thead>
                <tbody>
                  {alerts.map((item) => {
                    const status = maintenanceStatus(item.next_maintenance_on);
                    return (
                      <tr key={item.id}>
                        <td><strong>{item.brand} {item.model}</strong><small className="table-subline">Série {item.serial_number}</small></td>
                        <td>{item.client?.name ?? "Cliente sem nome"}</td>
                        <td>{formatDate(item.next_maintenance_on)}</td>
                        <td><StatusBadge status={status} /></td>
                        <td><button type="button" className="text-action" onClick={() => onOpenEquipment?.(item.client_id)}>Abrir <ArrowRight aria-hidden="true" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title="Sem avisos nos próximos 30 dias" description="Os equipamentos que precisarem de manutenção preventiva aparecerão aqui." />
          )}
        </article>

        <aside className="content-card dashboard-side-card">
          <div className="section-title-row"><div><span className="eyebrow">Atalhos</span><h2>Áreas de trabalho</h2></div></div>
          <div className="quick-links">
            <NavLink to="/clientes"><Users aria-hidden="true" /><span><strong>Clientes</strong><small>Consultar e importar Excel</small></span><ArrowRight aria-hidden="true" /></NavLink>
            <NavLink to="/equipamentos"><PackageCheck aria-hidden="true" /><span><strong>Equipamentos</strong><small>Pesquisar por cliente e série</small></span><ArrowRight aria-hidden="true" /></NavLink>
            <NavLink to="/manuais"><ClipboardList aria-hidden="true" /><span><strong>Manuais</strong><small>Biblioteca por marca e modelo</small></span><ArrowRight aria-hidden="true" /></NavLink>
          </div>
          <div className="maintenance-note"><CalendarClock aria-hidden="true" /><p>Os avisos usam a data mais próxima calculada pelo plano do manual; sem plano, continuam a usar a data preventiva registada no equipamento.</p></div>
        </aside>

        <article className="content-card history-card">
          <div className="section-title-row">
            <div><span className="eyebrow">Registo técnico</span><h2>Assistências recentes</h2></div>
            <NavLink className="text-action" to="/equipamentos">Ver equipamentos <ArrowRight aria-hidden="true" /></NavLink>
          </div>
          {history.error ? <ErrorNotice message="Não foi possível carregar o histórico recente." onRetry={() => history.mutate()} /> : history.isLoading ? <div className="loading-line" aria-label="A carregar histórico" /> : history.data?.length ? (
            <div className="table-scroll">
              <table className="data-table">
                <thead><tr><th>Data</th><th>Equipamento</th><th>Assistência</th><th>Técnico</th></tr></thead>
                <tbody>{history.data.map((entry) => {
                  const item = equipmentById.get(entry.equipment_id);
                  return <tr key={entry.id}><td>{formatDate(entry.service_date)}</td><td><strong>{item ? `${item.brand} ${item.model}` : "Equipamento"}</strong><small className="table-subline">{item?.client?.name ?? ""}</small></td><td>{entry.service_type}</td><td>{entry.technician || "—"}</td></tr>;
                })}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={ClipboardList} title="Ainda sem assistências registadas" description={`O histórico técnico aparecerá aqui após as intervenções.`} />}
        </article>
      </section>
    </div>
  );
}
