import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";
import { supabase } from "./lib/supabase";

const PACK4_LOGO = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Log%C3%B3tipo%20PACK4%20Laranja%20com%20Tagline-hE0b5NAlsuEqNIp2rRuAkyBLWxDroA.png";

function StartupScreen() {
  return (
    <main className="startup-screen" aria-label="A iniciar PACK4">
      <div className="startup-logo-frame"><img src={PACK4_LOGO} alt="PACK4 — Empowering Industry" /></div>
      <span className="startup-progress" aria-hidden="true"><span /></span>
    </main>
  );
}

function Root() {
  const [session, setSession] = useState(undefined);
  const [startupComplete, setStartupComplete] = useState(false);
  useEffect(() => {
    const startupTimer = window.setTimeout(() => setStartupComplete(true), 2200);
    supabase.auth.getSession?.().then(({ data }) => setSession(data?.session ?? null)).catch(() => setSession(null));
    const result = supabase.auth.onAuthStateChange?.((_event, next) => setSession(next));
    return () => {
      window.clearTimeout(startupTimer);
      result?.data?.subscription?.unsubscribe?.();
    };
  }, []);
  if (!startupComplete || session === undefined) return <StartupScreen />;
  return <App session={session} />;
}

createRoot(document.getElementById("root")).render(<BrowserRouter><Root /></BrowserRouter>);
