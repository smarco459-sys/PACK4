import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function PageHeading({ eyebrow, title, description, action }) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div className="page-heading-action">{action}</div>}
    </header>
  );
}

export function MetricCard({ icon: Icon, label, value, detail, tone = "default" }) {
  return (
    <article className={`metric-card metric-${tone}`}>
      <div className="metric-icon"><Icon aria-hidden="true" /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}
export function StatusBadge({ status, children }) {
  const labels = {
    overdue: "Atrasada",
    soon: "Até 30 dias",
    ok: "Em dia",
    unscheduled: "Sem data",
    high: "Confiança alta",
    medium: "Rever dados",
    low: "Rever manualmente",
    review: "Revisão necessária",
  };
  return <span className={`status-badge status-${status}`}>{children ?? labels[status] ?? status}</span>;
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="empty-state">
      {Icon && <div className="empty-icon"><Icon aria-hidden="true" /></div>}
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorNotice({ message, onRetry }) {
  return (
    <div className="error-notice" role="alert">
      <span>{message || "Não foi possível carregar os dados. Verifique a ligação e tente novamente."}</span>
      {onRetry && <button type="button" className="button button-quiet" onClick={onRetry}>Tentar novamente</button>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide = false, dialogRole = "dialog", describedBy }) {
  const dialogRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className={`modal-card${wide ? " modal-wide" : ""}`}
        role={dialogRole}
        aria-modal="true"
        aria-label={title}
        aria-describedby={describedBy}
        tabIndex={-1}
        onKeyDown={(event) => event.key === "Escape" && onClose()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar janela"><X aria-hidden="true" /></button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ConfirmActionDialog({ title, description, confirmLabel = "Eliminar", busy = false, error = "", onCancel, onConfirm }) {
  return (
    <Modal title={title} onClose={onCancel} dialogRole="alertdialog" describedBy="confirm-action-description">
      <div className="modal-body">
        <p id="confirm-action-description" className="modal-intro">{description}</p>
        {error && <p className="form-feedback" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="button button-secondary" type="button" onClick={onCancel} disabled={busy}>Cancelar</button>
          <button className="button button-danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? "A eliminar…" : confirmLabel}</button>
        </div>
      </div>
    </Modal>
  );
}
