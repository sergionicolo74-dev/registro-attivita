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

/** Dati mancanti di un cliente, per la tabella "Da completare". kyc = null se l'utente non è amministratore. */
export function campiMancanti(c, nPersone, kyc) {
  if (c.codice === "C000") return [];
  const m = [];
  const vuoto = v => v == null || String(v).trim() === "";
  const pf = c.forma === "Persona fisica";
  if (vuoto(c.forma)) m.push("Forma giuridica");
  if (!pf && vuoto(c.idi)) m.push("IDI");
  if (vuoto(c.responsabile)) m.push("Responsabile");
  if (vuoto(c.indirizzo) || vuoto(c.npa) || vuoto(c.localita)) m.push("Indirizzo");
  if (!pf && vuoto(c.chiusuraEsercizio)) m.push("Chiusura esercizio");
  const mm = mandatiDi(c);
  const attivi = TIPI_MANDATO.filter(([k]) => mm[k].attivo);
  if (!attivi.length) m.push("Mandati");
  for (const [k, n] of attivi) if (vuoto(mm[k].stato)) m.push(`Stato mandato ${n}`);
  if (mm.funzione.attivo && !mm.funzione.funzioni.some(f => f.ruolo)) m.push("Ruolo nella funzione societaria");
  if (mm.domiciliazione.attivo && vuoto(mm.domiciliazione.tipo)) m.push("Tipo di domiciliazione");
  if (!Object.values(c.servizi || {}).some(Boolean)) m.push("Servizi");
  if (c.servizi?.iva && vuoto(c.iva?.periodicita)) m.push("Periodicità IVA");
  if (!nPersone) m.push("Persone di contatto");
  if (kyc !== null && (vuoto(kyc?.stato) || vuoto(kyc?.rischio))) m.push("KYC e rischio");
  return m;
}

/** Data di oggi in ISO, ora locale. */
export function oggiISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** Aggiunge giorni a una data ISO. */
export function aggiungiGiorni(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
/** Lunedì della settimana di una data ISO. */
export function lunedi(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const g = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domenica
  return aggiungiGiorni(iso, g === 0 ? -6 : 1 - g);
}
/** 90 -> "1h 30", 45 -> "0h 45" */
export function fmtDurata(min) {
  min = Math.round(min || 0);
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}`;
}
export const GIORNI = ["Lu", "Ma", "Me", "Gi", "Ve", "Sa", "Do"];

// ---------- Mandati ----------
// Un cliente può avere fino a tre mandati, ognuno con stato, date e budget propri.
export const TIPI_MANDATO = [
  ["contabilita", "Contabilità e Tax"],
  ["funzione", "Funzione societaria"],
  ["domiciliazione", "Domiciliazione"]
];
export const NOME_MANDATO = Object.fromEntries(TIPI_MANDATO);
export const STATI_MANDATO = ["Firmato aggiornato", "Da aggiornare", "Mancante"];
export const RUOLI_FUNZIONE = ["Amministratore unico", "Membro CdA", "Presidente CdA", "Gerente", "Presidente dei gerenti", "Direttore", "Nessuna funzione (responsabile)"];
export const TIPI_DOMICILIO = ["Domicilio con ufficio proprio", "Recapito c/o"];

const RUOLO_VECCHIO = { "Amministratore": "Amministratore unico", "Membro CdA / gerenza": "Membro CdA", "Senza funzione - responsabile": "Nessuna funzione (responsabile)" };

/** Mandati del cliente nella struttura nuova; ricava quelli dei dati vecchi (mandato/funzione/onorario/servizi). */
export function mandatiDi(c) {
  const base = { attivo: false, stato: "", dataFirma: null, aggiornareEntro: null, budget: null, note: "" };
  if (c.mandati) {
    return {
      contabilita: { ...base, budgetOre: null, tariffa: null, fatturazione: "", ...c.mandati.contabilita },
      funzione: { ...base, ...c.mandati.funzione, funzioni: c.mandati.funzione?.funzioni || [] },
      domiciliazione: { ...base, tipo: "", dal: null, ...c.mandati.domiciliazione }
    };
  }
  const m = c.mandato || {}, s = c.servizi || {}, o = c.onorario || {}, f = c.funzione || {};
  const comune = { stato: m.stato || "", dataFirma: m.dataFirma || null, aggiornareEntro: m.aggiornareEntro || null };
  const conTipo = (...t) => t.includes(m.tipo);
  return {
    contabilita: { ...base, ...comune, attivo: !!(s.contabilita || s.dichiarazione || s.iva || s.stipendi || conTipo("Contabilità e fiscale", "Completo")),
      budget: o.forfait ?? null, budgetOre: o.budgetOre ?? null, tariffa: o.tariffa ?? null, fatturazione: o.fatturazione || "" },
    funzione: { ...base, ...(conTipo("Amministrazione fiduciaria", "Completo") ? comune : { aggiornareEntro: m.aggiornareEntro || null }),
      attivo: !!(f.tipo || conTipo("Amministrazione fiduciaria", "Completo")),
      funzioni: f.tipo ? [{ ruolo: RUOLO_VECCHIO[f.tipo] || f.tipo, persona: f.persona || "", firma: f.firma || "", inizio: f.inizio || null }] : [] },
    domiciliazione: { ...base, ...(conTipo("Domiciliazione", "Completo") ? comune : { aggiornareEntro: m.aggiornareEntro || null }),
      attivo: !!(s.domiciliazione || conTipo("Domiciliazione", "Completo")), tipo: "", dal: null }
  };
}

/** Stato sintetico di un mandato attivo: ok | urgente | scaduto | neutro (da aggiornare/mancante senza urgenza). */
export function statoMandato(m, oggi = new Date()) {
  if (!m.attivo) return null;
  if (m.stato === "Firmato aggiornato") return "ok";
  const s = statoScadenza(m.aggiornareEntro, 45, oggi);
  return s === "scaduto" || s === "urgente" ? s : "neutro";
}
export const daAggiornare = (m) => m.attivo && m.stato !== "Firmato aggiornato";
export const budgetTotale = (mm) => TIPI_MANDATO.reduce((s, [k]) => s + (mm[k].attivo ? Number(mm[k].budget) || 0 : 0), 0);

// ---------- Compiti ----------
export const STATI_COMPITO = ["Da fare", "Preso in carico", "In attesa", "In attesa riscontro", "Fatto"];
export const CATEGORIE_COMPITO = ["Promemoria", "Delega", "Reclamo fiscale", "Richiesta documenti", "Pratica amministrativa",
  "Apertura conto", "Presentazione", "Attesa riscontro", "Richiesta interna", "Da fare", "Altro"];
export const GIORNI_FERMO = 5;
export const aperto = (k) => k.stato !== "Fatto" && !k.completatoIl;

/** Giorni da un istante ISO (data e ora) a oggi. */
export function giorniDa(istante, oggi = new Date()) {
  if (!istante) return null;
  return giorniA(String(istante).slice(0, 10), oggi) * -1;
}

/** Urgenza di un compito aperto: scaduto | urgente (<= 5 giorni) | fermo (nessun aggiornamento da 5 giorni) | null */
export function urgenzaCompito(k, oggi = new Date()) {
  if (!aperto(k)) return null;
  const g = giorniA(k.scadenza, oggi);
  if (g != null && g < 0) return "scaduto";
  if (g != null && g <= 5) return "urgente";
  const f = giorniDa(k.aggiornato || k.creato, oggi);
  if (f != null && f >= GIORNI_FERMO && k.stato !== "In attesa riscontro") return "fermo";
  return null;
}
