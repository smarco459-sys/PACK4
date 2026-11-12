import { useState } from "react";
import { ArrowRight, LockKeyhole, ShieldAlert } from "lucide-react";
import { supabase } from "./lib/supabase";
import { MASTER_ADMIN_EMAIL } from "./lib/maintenance-data";
import MaintenanceApp from "./components/maintenance-app";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [resetSent, setResetSent] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMessage(/invalid login credentials/i.test(error.message) ? "Email ou password inválidos." : "Não foi possível iniciar sessão. Tente novamente.");
  }

  async function resetPassword() {
    if (!email.trim()) return setMessage("Introduza o email da conta para recuperar a password.");
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
    setBusy(false);
    if (error) setMessage("Não foi possível enviar o email de recuperação. Tente novamente.");
    else setResetSent(true);
  }

  return (
    <main className="login-screen">
      <a className="login-corner-brand" href="/" aria-label="PACK4 — início">
        <img src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Screenshot_20261112_222216_Chrome-o68zNU9vfGZ4vbZnYrsm6PLX8dM8U4.jpg" alt="PACK4 — Empowering Industry" />
      </a>
      <section className="login-form-panel" aria-labelledby="login-title">
        <div className="login-form-wrap">
          <span className="eyebrow">Master Admin</span>
          <h2 id="login-title">Iniciar sessão</h2>
          <p>Aceda ao painel central de manutenção preventiva.</p>
          <form className="form-stack login-form" onSubmit={submit}>
            <label>Email<input type="email" autoComplete="username" inputMode="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {message && <p className="form-feedback" role="alert">{message}</p>}
            {resetSent && <p className="success-notice" role="status">Email de recuperação enviado.</p>}
            <button className="button button-primary button-block login-submit" type="submit" disabled={busy}>{busy ? "A entrar…" : "Entrar"}<ArrowRight aria-hidden="true" /></button>
          </form>
          <button className="text-action reset-link" type="button" disabled={busy} onClick={resetPassword}>Esqueci-me da password</button>
          <p className="login-security-note"><LockKeyhole aria-hidden="true" /> Acesso reservado à conta de Master Admin.</p>
        </div>
      </section>
    </main>
  );
}

function AccessDenied() {
  async function logout() {
    await supabase.auth.signOut();
  }
  return <main className="access-denied"><div className="access-denied-card"><ShieldAlert aria-hidden="true" /><span className="eyebrow">Acesso restrito</span><h1>Esta área é exclusiva do Master Admin.</h1><p>A conta autenticada não tem permissão para consultar os dados de manutenção da PACK4.</p><button type="button" className="button button-primary" onClick={logout}>Terminar sessão</button></div></main>;
}

export default function App({ session }) {
  if (session === undefined) return <main className="app-loading" aria-label="A verificar sessão"><span className="spinner" /></main>;
  if (!session) return <Login />;
  if (session.user.email?.toLowerCase() !== MASTER_ADMIN_EMAIL) return <AccessDenied />;
  return <MaintenanceApp session={session} />;
}
