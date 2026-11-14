const MAINTENANCE_CONTEXT = /\b(?:maintenance|manuten[cç][aã]o|service|revis(?:ã|a)o|inspection|inspe[cç][aã]o|lubricat\w*|lubrific\w*|replace\w*|substitu\w*|troca\w*|clean\w*|limp\w*|filter|filtro|inspect\w*|inspecion\w*|check\w*|verifi\w*)\b/i;
const TASK_VERB = /\b(?:replace\w*|substitu\w*|troca\w*|change\w*|clean\w*|limp\w*|lubricat\w*|lubrific\w*|inspect\w*|inspecion\w*|check\w*|verifi\w*|tighten\w*|apert\w*|adjust\w*|ajust\w*|drain\w*|dren\w*|refill\w*|abastec\w*)\b/i;
const NON_CALENDAR_INTERVAL = /\b\d+(?:[.,]\d+)?\s*(?:hours?|horas?|days?|dias?|weeks?|semanas?)\b/i;
const AMOUNT = /\b\d+(?:[.,]\d+)?\s*(?:l|ml|cl|kg|g|un(?:idades?)?|pcs?|units?)\b/i;
const MATERIAL_TERMS = [
  /\b(?:oil|[oó]leo)(?:\s+(?:filter|filtro))?\b/i,
  /\b(?:filter|filtro)(?:\s+(?:de|do|da|de oil|de [oó]leo)\s+[\w-]+)?\b/i,
  /\b(?:coolant|[l-l]iquido de refrigera[cç][aã]o|anticongelante)\b/i,
  /\b(?:grease|lubrificante|massa lubrificante)\b/i,
  /\b(?:spark plug|vela de igni[cç][aã]o)\b/i,
  /\b(?:belt|correia)\b/i,
  /\b(?:seal|vedante|junta)\b/i,
];

function cleanLine(value) {
  return String(value || "").replace(/[\t\u00a0]+/g, " ").replace(/\s+/g, " ").trim();
}

function getLines(text) {
  return String(text || "")
    .split(/[\r\n]+/)
    .map(cleanLine)
    .filter(Boolean);
}

function findLabeledValue(lines, pattern) {
  for (const line of lines) {
    const match = line.match(pattern);
    if (!match) continue;
    const value = cleanLine(match[1]).replace(/\s+(?:marca|brand|fabricante|manufacturer|modelo|model|type|tipo|ref(?:er[eê]ncia)?)\s*[:#-].*$/i, "").replace(/[;,|]+$/g, "").trim();
    if (value.length >= 2 && value.length <= 100 && !/^(?:n\/?a|none|unknown|desconhecido)$/i.test(value)) {
      return { value, line };
    }
  }
  return { value: "", line: "" };
}

function getIdentity(text, fallbackTitle = "") {
  const lines = getLines(text);
  const brand = findLabeledValue(lines, /^\s*(?:marca|brand|fabricante|manufacturer|made\s+by|fabricado\s+por)\b\s*[:#\-–]?\s*(.+)$/i);
  const model = findLabeledValue(lines, /^\s*(?:modelo|model(?:\s*(?:number|no\.?|name|nr\.?))?|refer[eê]ncia|ref\.?|tipo|type)\b\s*[:#\-–]?\s*(.+)$/i);
  const evidence = [brand.line, model.line].filter(Boolean).join(" · ").slice(0, 360);
  const title = lines.find((line) => line.length > 3 && !/^(?:marca|brand|fabricante|manufacturer|modelo|model|type|tipo)\b/i.test(line)) || fallbackTitle || "Manual técnico";
  const confidence = brand.value && model.value ? "high" : brand.value || model.value ? "medium" : "review";

  return {
    brand: brand.value,
    model: model.value,
    title: title.slice(0, 140),
    confidence,
    evidence,
  };
}

function getCalendarInterval(line) {
  const normalized = cleanLine(line).toLocaleLowerCase("pt-PT");
  const wordNumbers = { one: 1, two: 2, three: 3, four: 4, six: 6, twelve: 12, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, seis: 6, doze: 12 };
  const periodWords = [
    { pattern: /\b(?:monthly|mensalmente|todos os meses|every month|cada m[eê]s)\b/i, months: 1 },
    { pattern: /\b(?:bimonthly|bimestralmente|a cada dois meses)\b/i, months: 2 },
    { pattern: /\b(?:quarterly|trimestralmente|a cada trimestre)\b/i, months: 3 },
    { pattern: /\b(?:semi[- ]?annually|semi[- ]?annual|semestralmente|a cada semestre|twice a year)\b/i, months: 6 },
    { pattern: /\b(?:annually|annual|yearly|anualmente|anual|todos os anos|once a year)\b/i, months: 12 },
  ];

  for (const period of periodWords) {
    if (period.pattern.test(normalized)) return period.months;
  }

  const numericMatch = normalized.match(/\b(\d{1,3}|one|two|three|four|six|twelve|um|uma|dois|duas|tres|quatro|seis|doze)\s*(?:-|\s)?(months?|mes(?:es)?|years?|anos?)\b/i);
  if (!numericMatch) return null;
  const amount = Number(numericMatch[1]) || wordNumbers[numericMatch[1]];
  if (!amount) return null;
  const unit = numericMatch[2];
  const months = /^(?:years?|anos?)$/i.test(unit) ? amount * 12 : amount;
  return Number.isInteger(months) && months >= 1 && months <= 120 ? months : null;
}

function extractMaterials(lines) {
  const materials = new Map();
  for (const line of lines) {
    if (!TASK_VERB.test(line)) continue;
    for (const pattern of MATERIAL_TERMS) {
      const match = line.match(pattern);
      if (!match) continue;
      const name = cleanLine(match[0]).slice(0, 80);
      const key = name.toLocaleLowerCase("pt-PT");
      if (!materials.has(key)) materials.set(key, { name, quantity: line.match(AMOUNT)?.[0] || "" });
    }
  }
  return [...materials.values()];
}

function extractEvents(text) {
  const lines = getLines(text);
  const events = [];
  const seen = new Set();

  for (let index = 0; index < lines.length; index += 1) {
    const intervalMonths = getCalendarInterval(lines[index]);
    if (!intervalMonths) continue;

    const contextLines = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2));
    if (!contextLines.some((line) => MAINTENANCE_CONTEXT.test(line))) continue;

    const taskLines = contextLines.filter((line) => TASK_VERB.test(line));
    const evidence = contextLines.join(" · ").slice(0, 420);
    const dedupeKey = `${intervalMonths}:${evidence.toLocaleLowerCase("pt-PT")}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const taskTitle = taskLines[0] || contextLines.find((line) => MAINTENANCE_CONTEXT.test(line)) || "Revisão preventiva";
    events.push({
      title: taskTitle.slice(0, 90),
      interval_months: intervalMonths,
      tasks: taskLines.map((line) => line.slice(0, 240)),
      materials: extractMaterials(taskLines),
      evidence,
      confidence: "review",
    });
    if (events.length >= 20) break;
  }

  return events;
}

export function identifyManual(text, fallbackTitle = "") {
  return getIdentity(text, fallbackTitle);
}

export function analyzeMaintenance(text) {
  const identity = getIdentity(text);
  const events = extractEvents(text);
  const hasNonCalendarInterval = NON_CALENDAR_INTERVAL.test(String(text || ""));
  const summary = events.length
    ? `Extração local sem serviços externos: encontrei ${events.length} ciclo(s) com intervalo explícito em meses ou anos. A análise por regras é preliminar; confirma as tarefas e evidências antes de guardar.${hasNonCalendarInterval ? " Também existem intervalos em horas, dias ou semanas, que não foram convertidos em meses." : ""}`
    : `Extração local sem serviços externos: não encontrei ciclos preventivos com intervalos explícitos em meses ou anos. ${hasNonCalendarInterval ? "O manual contém intervalos em horas, dias ou semanas, que não podem ser convertidos em meses com segurança. " : ""}Confirma o texto reconhecido e introduz os ciclos manualmente, se necessário.`;

  return {
    brand: identity.brand,
    model: identity.model,
    identity_evidence: identity.evidence,
    summary,
    events,
  };
}
