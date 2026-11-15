// Regole e formati: funzioni pure, senza Firebase né interfaccia.
// Si possono riusare in qualsiasi altro sistema e sono coperte da test (test/regole.test.mjs).

/** "2026-11-15" -> "15.11.2026" */
export function fmtData(iso) {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso);
}

/** "15.11.2026" o "15.11.26" -> "2026-11-15"; accetta anche ISO e Date. Ritorna null se non valida. */
export function parseData(v) {
  if (v == null || v === "") return null;
  if (v instanceof Date && !isNaN(v)) {
    const y = v.getFullYear(), mo = v.getMonth() + 1, d = v.getDate();
    return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})$/.exec(s);
  if (!m) return null;
  let y = +m[3]; if (y < 100) y += 2000;
  const d = +m[1], mo = +m[2];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 100000 -> "100'000.00" */
export function fmtNum(n, dec = 2) {
  if (n == null || n === "" || isNaN(n)) return "";
  const neg = n < 0;
  const [int, fr] = Math.abs(Number(n)).toFixed(dec).split(".");
  const intF = int.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return (neg ? "-" : "") + intF + (dec > 0 ? "." + fr : "");
}

/** minuti -> "1.25" ore */
export function fmtOre(min) { return fmtNum((min || 0) / 60, 2); }

/** Normalizza un nome per confronti: minuscole, senza spazi doppi né punteggiatura finale. */
export function normNome(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9&]+/g, " ").trim();
}

/** Giorni tra oggi e una data ISO (negativo = passata). */
export function giorniA(iso, oggi = new Date()) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const o = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate());
  return Math.round((t - o) / 864e5);
}

/** Stato di una data di scadenza: scaduto, urgente (<= soglia giorni), ok. */
export function statoScadenza(iso, soglia = 30, oggi = new Date()) {
  const g = giorniA(iso, oggi);
  if (g == null) return null;
  if (g < 0) return "scaduto";
  if (g <= soglia) return "urgente";
  return "ok";
}

// Servizi dello studio: chiave interna -> etichetta (stessi nomi delle colonne Excel)
export const SERVIZI = [
  ["contabilita", "Contabilità"], ["iva", "IVA"], ["stipendi", "Stipendi"],
  ["ifTrimestrale", "IF trimestrale"], ["ifAnnuale", "IF conguaglio annuale"],
  ["dichiarazione", "Dichiarazione fiscale"], ["avsLainfIpg", "AVS / LAINF / IPG"],
  ["lpp", "LPP"], ["domiciliazione", "Domiciliazione"], ["revisione", "Revisione"]
];

export const RUOLI_PERSONA = ["Socio", "Amministratore", "Socio e amministratore", "Gerente", "Socio e gerente",
  "Membro CdA", "Direttore", "Avente diritto economico", "Procuratore", "Contatto contabilità", "Contatto salari", "Altro"];
