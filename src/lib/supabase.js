import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && key
  ? createClient(url, key)
  : { auth: { signInWithPassword: async () => ({ error: new Error("Supabase não configurado."), data: null }), resetPasswordForEmail: async () => ({ error: new Error("Supabase não configurado.") }), signOut: async () => ({}), getSession: async () => ({ data: { session: null } }), getUser: async () => ({ data: { user: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } };
