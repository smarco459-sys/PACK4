import { generateText } from "ai";

const MAX_CONTEXT = 6000;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método não permitido." });
  try {
    const { workspaceId, symptoms, recentData } = req.body || {};
    if (!workspaceId || !symptoms) return res.status(400).json({ error: "Contexto de diagnóstico incompleto." });

    const { text } = await generateText({
      model: "google/gemini-3.8-flash",
      system: "És o assistente técnico de uma app de gestão de estética. Analisa problemas de funcionamento com objetividade. Nunca inventes dados, nunca peças passwords/tokens e nunca recomendes apagar dados. Responde em português de Portugal com: diagnóstico provável, prioridade (baixa/média/alta), passos seguros e se é necessário suporte técnico. Mantém a resposta abaixo de 180 palavras.",
      prompt: JSON.stringify({ workspaceId, symptoms: String(symptoms).slice(0, MAX_CONTEXT), recentData: String(recentData || "").slice(0, MAX_CONTEXT) }),
    });
    return res.status(200).json({ text });
  } catch (error) {
    console.error("[gemini-diagnose]", error);
    return res.status(502).json({ error: "O assistente Gemini não está disponível neste momento." });
  }
}
