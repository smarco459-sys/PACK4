import { supabase } from "./supabase";

export const MANUALS_BUCKET = "pack4-equipment-manuals";
export const MASTER_ADMIN_EMAIL = "smarco459@gmail.com";

async function unwrap(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function fetchWorkspaces() {
  return unwrap(supabase.from("workspaces").select("id,name").order("name"));
}

export async function fetchClients() {
  return unwrap(
    supabase
      .from("clients")
      .select("id,workspace_id,name,contact_name,phone,email,address,postal_code,city,notes,created_at")
      .order("name"),
  );
}

export async function fetchEquipment() {
  const [equipment, clients] = await Promise.all([
    unwrap(
      supabase
        .from("equipment")
        .select("id,workspace_id,client_id,brand,model,serial_number,installed_on,last_maintenance_on,next_maintenance_on,notes,created_at")
        .order("next_maintenance_on", { ascending: true, nullsFirst: false }),
    ),
    fetchClients(),
  ]);
  const clientsById = new Map(clients.map((client) => [client.id, client]));
  return equipment.map((item) => ({ ...item, client: clientsById.get(item.client_id) ?? null }));
}

export async function fetchEquipmentByClientId(clientId) {
  const rows = await unwrap(
    supabase
      .from("equipment")
      .select("id,workspace_id,client_id,brand,model,serial_number,installed_on,last_maintenance_on,next_maintenance_on,notes,created_at")
      .eq("client_id", clientId)
      .order("brand")
      .order("model"),
  );
  return rows;
}

export async function fetchEquipmentHistory(equipmentId) {
  return unwrap(
    supabase
      .from("equipment_service_history")
      .select("id,equipment_id,workspace_id,service_date,service_type,description,technician,parts_replaced,created_at")
      .eq("equipment_id", equipmentId)
      .order("service_date", { ascending: false }),
  );
}

export async function fetchRecentEquipmentHistory() {
  return unwrap(
    supabase
      .from("equipment_service_history")
      .select("id,equipment_id,service_date,service_type,description,technician")
      .order("service_date", { ascending: false })
      .limit(8),
  );
}

export async function fetchManuals() {
  return unwrap(
    supabase
      .from("equipment_manuals")
      .select("id,brand,model,title,file_name,storage_path,mime_type,file_size,identification_confidence,extracted_reference,created_at")
      .order("brand")
      .order("model"),
  );
}

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDaysToDateKey(dateKey, amount) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateKey(date);
}

export function addYearToDateKey(dateKey) {
  if (!dateKey) return "";
  const date = new Date(`${dateKey}T12:00:00`);
  date.setFullYear(date.getFullYear() + 1);
  return localDateKey(date);
}

export function formatDate(dateKey) {
  if (!dateKey) return "Sem data definida";
  const date = new Date(`${String(dateKey).slice(0, 10)}T12:00:00`);
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function maintenanceStatus(dateKey) {
  if (!dateKey) return "unscheduled";
  const today = localDateKey();
  if (dateKey < today) return "overdue";
  if (dateKey <= addDaysToDateKey(today, 30)) return "soon";
  return "ok";
}
