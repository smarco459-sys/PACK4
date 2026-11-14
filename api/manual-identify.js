import { createClient } from "@supabase/supabase-js";
import { identifyManual } from "../src/lib/manual-analysis.js";

const MASTER_ADMIN_EMAIL = "smarco459@gmail.com";
const MAX_TEXT_LENGTH = 30000;

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Método não permitido." });

  const authorization = request.headers.authorization;
  if (!authorization?.startsWith("Bearer ")) return response.status(401).json({ error: "Sessão necessária." });

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return response.status(503).json({ error: "Serviço de identificação indisponível." });

  try {
    const authClient = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: authError } = await authClient.auth.getUser();
    if (authError || userData.user?.email?.toLowerCase() !== MASTER_ADMIN_EMAIL) {
      return response.status(403).json({ error: "Acesso reservado ao Master Admin." });
    }

    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT_LENGTH) : "";
    const title = typeof body?.title === "string" ? body.title.trim().slice(0, 140) : "";
    if (text.length < 30) return response.status(400).json({ error: "O PDF não contém texto suficiente para identificação." });

    return response.status(200).json(identifyManual(text, title));
  } catch {
    return response.status(502).json({ error: "Não foi possível identificar o manual. Pode preencher a marca e o modelo manualmente." });
  }
}
