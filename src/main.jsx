import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./styles.css";
import { supabase } from "./lib/supabase";

function Root() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    supabase.auth.getSession?.().then(({ data }) => setSession(data?.session ?? null));
    const result = supabase.auth.onAuthStateChange?.((_event, next) => setSession(next));
    return () => result?.data?.subscription?.unsubscribe?.();
  }, []);
  return <App session={session} />;
}

createRoot(document.getElementById("root")).render(<BrowserRouter><Root /></BrowserRouter>);
