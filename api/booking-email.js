import { Resend } from "resend";

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Método não permitido" });
  const { email, name, service, collaborator, date, time } = request.body || {};
  if (!email || !name || !service || !date || !time) return response.status(400).json({ error: "Dados de email incompletos" });
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from = `SaaS Marcações <noreply@${process.env.RESEND_EMAIL_DOMAIN || "resend.dev"}>`;
  const { data, error } = await resend.emails.send({
    from,
    to: [email],
    subject: "Confirmação da sua marcação",
    html: `<div style="font-family:Arial,sans-serif;color:#122746;line-height:1.6"><h2>Marcação confirmada</h2><p>Olá ${escapeHtml(name)},</p><p>A sua marcação foi registada com sucesso.</p><ul><li><strong>Serviço:</strong> ${escapeHtml(service)}</li><li><strong>Colaborador:</strong> ${escapeHtml(collaborator || "A confirmar")}</li><li><strong>Data:</strong> ${escapeHtml(date)}</li><li><strong>Hora:</strong> ${escapeHtml(time)}</li></ul><p>Enviaremos um lembrete antes da sua marcação.</p></div>`,
  }, { idempotencyKey: `booking-confirmation/${email}-${date}-${time}` });
  if (error) return response.status(502).json({ error: "Não foi possível enviar o email" });
  return response.status(200).json({ id: data?.id });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]);
}
