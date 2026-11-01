import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character])

export default async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" })
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  const resend = new Resend(process.env.RESEND_API_KEY)
  const now = new Date()
  const from = process.env.RESEND_EMAIL_DOMAIN ? `SaaS Marcações <noreply@${process.env.RESEND_EMAIL_DOMAIN}>` : "SaaS Marcações <onboarding@resend.dev>"
  const start = new Date(now.getTime() + 23 * 60 * 60 * 1000)
  const end = new Date(now.getTime() + 25 * 60 * 60 * 1000)
  const { data: bookings, error } = await supabase.from("services").select("id,client_id,title,scheduled_start,technician_id").gte("scheduled_start", start.toISOString()).lt("scheduled_start", end.toISOString()).not("status", "eq", "cancelled")
  if (error) return response.status(500).json({ error: "Não foi possível carregar os lembretes" })
  let sent = 0
  for (const booking of bookings || []) {
    const { data: client } = await supabase.from("clients").select("name,email").eq("id", booking.client_id).maybeSingle()
    if (!client?.email) continue
    const date = new Date(booking.scheduled_start)
    const result = await resend.emails.send({ from, to: [client.email], subject: "Lembrete da sua marcação", html: `<div style="font-family:Arial,sans-serif;color:#122746;line-height:1.6"><h2>Até amanhã</h2><p>Olá ${escapeHtml(client.name)}, este é um lembrete da sua marcação.</p><p><strong>${escapeHtml(booking.title || "Serviço")}</strong><br/>${date.toLocaleDateString("pt-PT")} às ${date.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}</p></div>` }, { idempotencyKey: `booking-reminder/${booking.id}` })
    if (!result.error) sent += 1
  }
  return response.status(200).json({ found: bookings?.length || 0, sent })
}
