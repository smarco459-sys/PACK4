import { lazy, Suspense, useState } from "react";
import { BookOpen, LayoutDashboard, LogOut, PackageCheck, ShieldCheck, Users } from "lucide-react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
const ClientsPage = lazy(() => import("./clients-page"));
const DashboardPage = lazy(() => import("./dashboard-page"));
const EquipmentPage = lazy(() => import("./equipment-page"));
const ManualsPage = lazy(() => import("./manuals-page"));

const navigation = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/equipamentos", label: "Equipamentos", icon: PackageCheck },
  { to: "/manuais", label: "Manuais", icon: BookOpen },
];

const pageTitles = {
  "/dashboard": "Centro de manutenção",
  "/clientes": "Base de clientes",
  "/equipamentos": "Inventário de equipamentos",
  "/manuais": "Biblioteca técnica",
};

export default function MaintenanceApp({ session }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [preferredClientId, setPreferredClientId] = useState("");
  const currentTitle = pageTitles[location.pathname] ?? "PACK4";

  async function logout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  function showClientEquipment(clientId = "") {
    setPreferredClientId(clientId);
    navigate("/equipamentos");
  }

  return (
    <div className="app-layout">
      <aside className="app-sidebar" aria-label="Navegação principal">
        <div className="sidebar-brand"><span className="brand-mark">P4</span><span><strong>PACK4</strong><small>Manutenção industrial</small></span></div>
        <div className="sidebar-section-label">Área de gestão</div>
        <nav className="sidebar-navigation">
          {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}><Icon aria-hidden="true" /><span>{label}</span></NavLink>)}
        </nav>
        <div className="sidebar-footer"><ShieldCheck aria-hidden="true" /><span>Área protegida<br /><strong>Master Admin</strong></span></div>
      </aside>

      <div className="app-main-column">
        <header className="topbar">
          <div className="topbar-mobile-brand"><span className="brand-mark">P4</span><strong>PACK4</strong></div>
          <div className="breadcrumb"><span>PACK4</span><span aria-hidden="true">/</span><strong>{currentTitle}</strong></div>
          <div className="topbar-account"><span className="account-avatar">{(session.user.email || "P").slice(0, 1).toUpperCase()}</span><span className="account-email">{session.user.email}</span><button type="button" className="button button-quiet logout-button" onClick={logout}><LogOut aria-hidden="true" /> Sair</button></div>
        </header>
        <main className="app-main" id="main-content">
          <Suspense fallback={<div className="route-loading" role="status"><span className="spinner" /><span>A carregar área…</span></div>}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage onOpenEquipment={showClientEquipment} />} />
              <Route path="/clientes" element={<ClientsPage onShowEquipment={showClientEquipment} />} />
              <Route path="/equipamentos" element={<EquipmentPage preferredClientId={preferredClientId} onClearPreferredClient={() => setPreferredClientId("")} />} />
              <Route path="/manuais" element={<ManualsPage />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
