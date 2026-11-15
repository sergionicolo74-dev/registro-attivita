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
  if (c.servizi?.stipendi && vuoto(c.giornoPaga)) m.push("Giorno di paga");
  if (pf) {
    if (vuoto(c.df?.nascita)) m.push("Data di nascita");
    if (vuoto(c.df?.statoCivile)) m.push("Stato civile");
    if (vuoto(c.df?.comune)) m.push("Comune di domicilio fiscale");
    if (c.servizi?.dichiarazione && !documentiDF(c).length) m.push("Documenti per la dichiarazione");
  }
  if (!nPersone && !pf) m.push("Persone di contatto");
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

// ---------- Scadenziario ----------
// Le scadenze non si inseriscono a mano: si ricavano dai servizi del cliente con le regole qui sotto.
// Nel database si salva solo lo stato di ognuna (fatto, prorogato…), con id = cliente_servizio_periodo.
export const SERVIZI_SCADENZE = [
  ["contabilita", "Contabilità"], ["iva", "IVA"], ["ivaRiconciliazione", "Riconciliazione IVA"], ["stipendi", "Stipendi"],
  ["ifTrimestrale", "IF trimestrale"], ["ifAnnuale", "IF conguaglio"], ["avsLainfIpg", "AVS / LAINF / IPG"], ["lpp", "LPP"],
  ["dichiarazione", "Dichiarazione fiscale"], ["assemblea", "Assemblea ordinaria"], ["revisione", "Revisione"], ["kyc", "Revisione KYC"]
];
export const NOME_SCADENZA = Object.fromEntries(SERVIZI_SCADENZE);
export const STATI_SCADENZA = ["Da fare", "In corso", "In attesa cliente", "Prorogato", "Fatto", "Non dovuto"];
export const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
/** Le scadenze precedenti a questa data non vengono mostrate come arretrate (avvio dello scadenziario). */
export const INIZIO_SCADENZIARIO = "2026-11-15";

const p2 = n => String(n).padStart(2, "0");
const giorniNelMese = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Data ISO; se il giorno non esiste nel mese (es. 31 in giugno) usa l'ultimo giorno. Il mese può superare 12. */
export function dataISO(y, m, d) {
  y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1;
  return `${y}-${p2(m)}-${p2(Math.min(d, giorniNelMese(y, m)))}`;
}
const fineMese = (y, m) => dataISO(y, m, 31);

/** "31.12" -> {g:31, m:12}; vuoto o non valido -> 31.12 */
export function chiusuraDi(c) {
  const r = /^(\d{1,2})[.\/](\d{1,2})/.exec(String(c.chiusuraEsercizio || ""));
  const g = r ? +r[1] : 31, m = r ? +r[2] : 12;
  return m >= 1 && m <= 12 && g >= 1 && g <= 31 ? { g, m } : { g: 31, m: 12 };
}
/** Chiusura dell'esercizio che termina nell'anno y, più n mesi (se la chiusura è a fine mese resta a fine mese). */
function dopoChiusura(ch, y, n) {
  return ch.g >= giorniNelMese(y, ch.m) ? fineMese(y, ch.m + n) : dataISO(y, ch.m + n, ch.g);
}

const ANNUALI = new Set(["ivaRiconciliazione", "ifAnnuale", "avsLainfIpg", "lpp", "dichiarazione", "assemblea", "revisione", "kyc"]);

/**
 * Scadenze di un cliente con data che cade nell'anno indicato.
 * kyc: dati KYC del cliente (solo amministratori), per la revisione KYC.
 */
export function scadenzeCliente(c, anno, kyc = null) {
  if (!c || c.codice === "C000" || (c.stato && c.stato !== "Attivo")) return [];
  const s = { ...(c.servizi || {}) }, out = [];
  if (c.revisione) s.revisione = true;
  const mm = mandatiDi(c), ch = chiusuraDi(c), pf = c.forma === "Persona fisica";
  const add = (servizio, periodo, etichetta, scadenza, extra = {}) =>
    out.push({ id: `${c.id}_${servizio}_${periodo}`, clienteId: c.id, servizio, periodo, etichetta, scadenza, annuale: ANNUALI.has(servizio), ...extra });

  for (let y = anno - 2; y <= anno + 1; y++) {
    if (s.contabilita) {
      if (c.contabilitaPeriodicita === "Trimestrale") for (let q = 1; q <= 4; q++) add("contabilita", `${y}-T${q}`, `Contabilità ${q}° trimestre ${y}`, dataISO(y, q * 3 + 1, 20));
      else for (let m = 1; m <= 12; m++) add("contabilita", `${y}-${p2(m)}`, `Contabilità ${MESI[m - 1]} ${y}`, dataISO(y, m + 1, 20));
    }
    if (s.iva && c.iva?.regime !== "Non assoggettato") {
      const per = c.iva?.periodicita || "Trimestrale";
      if (per === "Mensile") for (let m = 1; m <= 12; m++) add("iva", `${y}-${p2(m)}`, `IVA ${MESI[m - 1]} ${y}`, aggiungiGiorni(fineMese(y, m), 60));
      else if (per === "Semestrale") for (let h = 1; h <= 2; h++) add("iva", `${y}-S${h}`, `IVA ${h}° semestre ${y}`, aggiungiGiorni(fineMese(y, h * 6), 60));
      else if (per === "Annuale") add("iva", `${y}`, `IVA rendiconto annuale ${y}`, aggiungiGiorni(fineMese(y, 12), 60));
      else for (let q = 1; q <= 4; q++) add("iva", `${y}-T${q}`, `IVA ${q}° trimestre ${y}`, aggiungiGiorni(fineMese(y, q * 3), 60));
      add("ivaRiconciliazione", `${y}`, `Riconciliazione IVA esercizio ${y}`, aggiungiGiorni(dataISO(y, ch.m, ch.g), 240));
    }
    if (s.stipendi) {
      const g = Math.min(Math.max(+c.giornoPaga || 25, 1), 31);
      for (let m = 1; m <= 12; m++) add("stipendi", `${y}-${p2(m)}`, `Stipendi ${MESI[m - 1]} ${y}`, dataISO(y, m, g));
    }
    if (s.ifTrimestrale) for (let q = 1; q <= 3; q++) add("ifTrimestrale", `${y}-T${q}`, `IF ${q}° trimestre ${y}`, dataISO(y, q * 3 + 1, 10));
    if (s.ifAnnuale || s.ifTrimestrale) add("ifAnnuale", `${y}`, `IF conguaglio ${y}${s.ifTrimestrale ? " (con IV trimestre)" : ""}`, dataISO(y + 1, 1, 31));
    if (s.avsLainfIpg) add("avsLainfIpg", `${y}`, `AVS / LAINF / IPG salari ${y}`, dataISO(y + 1, 1, 30));
    if (s.lpp) add("lpp", `${y + 1}`, `LPP annuncio salari ${y + 1}`, dataISO(y, 12, 31));
    // Persone fisiche: 30.04, prorogabile al 30.09 o al 31.12; società: 30.06
    if (s.dichiarazione) add("dichiarazione", `${y}`, pf ? `Dichiarazione fiscale ${y} (persona fisica)` : `Dichiarazione fiscale ${y}`,
      dataISO(y + 1, pf ? 4 : 6, pf ? 30 : 30), pf ? { proroghe: [dataISO(y + 1, 9, 30), dataISO(y + 1, 12, 31)] } : {});
    if (mm.funzione.attivo && !pf) add("assemblea", `${y}`, `Assemblea ordinaria esercizio ${y}`, dopoChiusura(ch, y, 6));
    if (s.revisione && !pf) add("revisione", `${y}`, `Revisione esercizio ${y}`, dopoChiusura(ch, y, 6), { avvisoDal: dopoChiusura(ch, y, 3) });
  }
  if (kyc?.prossimaRevisione) add("kyc", kyc.prossimaRevisione, "Revisione KYC", kyc.prossimaRevisione);
  return out.filter(o => o.scadenza.slice(0, 4) === String(anno));
}

/** Unisce la scadenza calcolata con lo stato salvato. */
export function conStato(o, salvato) {
  const s = salvato || {};
  return { ...o, stato: s.stato || "Da fare", nuovaData: s.nuovaData || null, responsabileUid: s.responsabileUid || null, responsabileNome: s.responsabileNome || "",
    note: s.note || "", cronologia: s.cronologia || [], fattoIl: s.fattoIl || null, fattoDa: s.fattoDa || "", salvato: !!salvato,
    documenti: s.documenti || {}, data: (s.stato === "Prorogato" && s.nuovaData) ? s.nuovaData : o.scadenza };
}
export const chiusa = o => o.stato === "Fatto" || o.stato === "Non dovuto";

/**
 * Urgenza di una scadenza aperta: scaduto | urgente (-5/-2 giorni) | preavviso (-30 giorni per le annuali, o dal 31.03 per la revisione) | null
 */
export function urgenzaScadenza(o, oggi = new Date()) {
  if (chiusa(o)) return null;
  const g = giorniA(o.data, oggi);
  if (g < 0) return "scaduto";
  if (g <= 5) return "urgente";
  if (o.annuale && g <= 30) return "preavviso";
  if (o.avvisoDal && giorniA(o.avvisoDal, oggi) <= 0) return "preavviso";
  return null;
}

// ---------- Presenze (registrazione semplificata, art. 73b OLL 1) ----------
// Si registra solo la durata giornaliera del lavoro. Il motivo delle assenze non si registra.
export const TIPI_ASSENZA = ["Vacanza", "Vacanza mezza giornata", "Assenza", "Assenza mezza giornata", "Recupero ore"];

/** Domenica di Pasqua (calendario gregoriano). */
export function pasqua(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
    g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
    l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31), giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return dataISO(y, mese, giorno);
}
/** I 15 giorni festivi ufficiali del Cantone Ticino (Legge concernente i giorni festivi ufficiali, 843.200). Venerdì Santo escluso. */
export function festiviTicino(y) {
  const p = pasqua(y);
  return {
    [dataISO(y, 1, 1)]: "Capodanno", [dataISO(y, 1, 6)]: "Epifania", [dataISO(y, 3, 19)]: "San Giuseppe",
    [aggiungiGiorni(p, 1)]: "Lunedì di Pasqua", [dataISO(y, 5, 1)]: "Primo maggio", [aggiungiGiorni(p, 39)]: "Ascensione",
    [aggiungiGiorni(p, 50)]: "Lunedì di Pentecoste", [aggiungiGiorni(p, 60)]: "Corpus Domini", [dataISO(y, 6, 29)]: "SS. Pietro e Paolo",
    [dataISO(y, 8, 1)]: "Festa nazionale", [dataISO(y, 8, 15)]: "Assunzione", [dataISO(y, 11, 1)]: "Ognissanti",
    [dataISO(y, 12, 8)]: "Immacolata", [dataISO(y, 12, 25)]: "Natale", [dataISO(y, 12, 26)]: "Santo Stefano"
  };
}
/** 0 = lunedì … 6 = domenica */
export function giornoSettimana(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}
/** Minuti dovuti in un giorno secondo il profilo orario (ore settimanali su 5 giorni × percentuale). */
export function minutiDovuti(profilo, iso) {
  if (giornoSettimana(iso) >= 5 || festiviTicino(+iso.slice(0, 4))[iso]) return 0;
  const ore = Number(profilo?.oreSettimanali) || 42, perc = profilo?.percentuale == null || profilo.percentuale === "" ? 100 : Number(profilo.percentuale);
  return Math.round(ore * 60 / 5 * perc / 100);
}
/** "8:30", "8.5", "8,5", "8h30", "8 h", "510m" -> minuti; vuoto -> null; non valido -> NaN */
export function parseOre(v) {
  const s = String(v ?? "").trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  let m = /^(\d{1,2})[:h](\d{1,2})?$/.exec(s);
  if (m) return +m[1] * 60 + (+m[2] || 0) <= 24 * 60 && (+m[2] || 0) < 60 ? +m[1] * 60 + (+m[2] || 0) : NaN;
  m = /^(\d{1,3})m(in)?$/.exec(s);
  if (m) return +m[1] <= 1440 ? +m[1] : NaN;
  m = /^(\d{1,2})([.,]\d+)?$/.exec(s);
  if (m) { const n = Math.round(parseFloat(s.replace(",", ".")) * 60); return n <= 1440 ? n : NaN; }
  return NaN;
}
/** Credito di un'assenza: giornata intera = dovuto, mezza = metà, recupero ore = 0 (usa il saldo). */
export function minutiCredito(tipo, dovuti) {
  if (tipo === "Vacanza" || tipo === "Assenza") return dovuti;
  if (tipo === "Vacanza mezza giornata" || tipo === "Assenza mezza giornata") return Math.round(dovuti / 2);
  return 0;
}
/**
 * Riepilogo di un periodo [da, a] (ISO incluse).
 * presenze: oggetto data -> {minuti, assenza}. Da "dal" in poi si contano le ore dovute (inizio registrazione).
 */
export function riepilogoPresenze(presenze, profilo, da, a, dal = da, oggi = oggiISO()) {
  const r = { dovute: 0, lavorate: 0, credito: 0, saldo: 0, vacanze: 0, assenze: 0, daCompilare: 0 };
  for (let d = da; d <= a; d = aggiungiGiorni(d, 1)) {
    const p = presenze[d] || {}, dov = d >= dal ? minutiDovuti(profilo, d) : 0;
    r.lavorate += p.minuti || 0;
    const cr = minutiCredito(p.assenza, dov);
    r.credito += cr; r.dovute += dov;
    if (p.assenza === "Vacanza") r.vacanze += 1; else if (p.assenza === "Vacanza mezza giornata") r.vacanze += 0.5;
    if (p.assenza === "Assenza") r.assenze += 1; else if (p.assenza === "Assenza mezza giornata") r.assenze += 0.5;
    if (dov && d < oggi && p.minuti == null && !p.assenza) r.daCompilare += 1;
  }
  r.saldo = r.lavorate + r.credito - r.dovute;
  return r;
}
/** Minuti con segno in ore: -90 -> "-1h 30" */
export const fmtSaldo = (min) => (min < 0 ? "−" : min > 0 ? "+" : "") + fmtDurata(Math.abs(min));

/** Orario del giorno: "8", "8:00", "08.15", "815", "0815" -> minuti dalla mezzanotte; vuoto -> null; non valido -> NaN */
export function parseOrario(v) {
  const s = String(v ?? "").trim().replace(/\s+/g, "");
  if (!s) return null;
  let m = /^(\d{1,2})(?:[:.h](\d{2}))?$/.exec(s) || /^(\d{1,2})(\d{2})$/.exec(s);
  if (!m) return NaN;
  const h = +m[1], mi = +(m[2] || 0);
  return h <= 23 && mi <= 59 ? h * 60 + mi : (h === 24 && mi === 0 ? 1440 : NaN);
}
/** 510 -> "08:30" */
export const fmtOrario = (min) => min == null || Number.isNaN(min) ? "" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** Minuti lavorati da entrata, uscita e pausa (minuti). null se manca un orario; NaN se l'uscita non è dopo l'entrata più la pausa. */
export function minutiDaOrari(entrata, uscita, pausa = 0) {
  if (entrata == null || uscita == null) return null;
  const n = uscita - entrata - (pausa || 0);
  return uscita > entrata && n > 0 ? n : NaN;
}
/** Pausa minima secondo l'art. 15 LL: oltre 5½ ore 15 min, oltre 7 ore 30 min, oltre 9 ore 1 ora. */
export function pausaMinima(minutiLavoro) {
  return minutiLavoro > 540 ? 60 : minutiLavoro > 420 ? 30 : minutiLavoro > 330 ? 15 : 0;
}

// ---------- Vacanze ----------
export const TIPI_VACANZA = ["Vacanza", "Recupero ore", "Assenza"];
export const STATI_VACANZA = ["Richiesta", "Approvata", "Rifiutata"];
/** Giorni lavorativi (lunedì–venerdì, esclusi i festivi ticinesi) tra due date incluse. */
export function giorniLavorativi(da, a) {
  let n = 0;
  for (let d = da; d && a && d <= a; d = aggiungiGiorni(d, 1)) if (giornoSettimana(d) < 5 && !festiviTicino(+d.slice(0, 4))[d]) n++;
  return n;
}
/** Giorni che una richiesta consuma: mezza giornata = 0.5 */
export const giorniRichiesta = (v) => v.mezza ? (giorniLavorativi(v.dal, v.dal) ? 0.5 : 0) : giorniLavorativi(v.dal, v.al);
/** Giorni di vacanza approvati di un utente in un anno (le richieste a cavallo d'anno contano per la parte nell'anno). */
export function vacanzeUsate(vacanze, uid, anno) {
  return vacanze.filter(v => v.uid === uid && v.stato === "Approvata" && v.tipo === "Vacanza").reduce((s, v) => {
    if (v.mezza) return s + (v.dal.startsWith(String(anno)) ? giorniRichiesta(v) : 0);
    const da = v.dal > `${anno}-01-01` ? v.dal : `${anno}-01-01`, a = v.al < `${anno}-12-31` ? v.al : `${anno}-12-31`;
    return s + (da <= a ? giorniLavorativi(da, a) : 0);
  }, 0);
}
/** Aggiunge alle presenze i giorni di vacanza/assenza approvati che non hanno già una registrazione. */
export function conVacanze(pres, vacanze, uid) {
  const out = { ...pres };
  for (const v of vacanze) {
    if (v.uid !== uid || v.stato !== "Approvata") continue;
    const tipo = v.tipo === "Vacanza" ? (v.mezza ? "Vacanza mezza giornata" : "Vacanza") : v.tipo === "Assenza" ? (v.mezza ? "Assenza mezza giornata" : "Assenza") : "Recupero ore";
    for (let d = v.dal; d <= (v.mezza ? v.dal : v.al); d = aggiungiGiorni(d, 1)) {
      if (giornoSettimana(d) >= 5 || festiviTicino(+d.slice(0, 4))[d] || out[d]) continue;
      out[d] = { data: d, assenza: tipo, minuti: null, daPiano: true };
    }
  }
  return out;
}

// ---------- Periodi per la Dashboard ----------
export const PERIODI = [["settimana", "Settimana"], ["mese", "Mese"], ["trimestre", "Trimestre"], ["anno", "Anno"]];
/** Inizio, fine ed etichetta del periodo che contiene la data rif. */
export function periodoDi(tipo, rif) {
  const y = +rif.slice(0, 4), m = +rif.slice(5, 7);
  if (tipo === "settimana") { const da = lunedi(rif), a = aggiungiGiorni(da, 6); return { da, a, etichetta: `${fmtData(da).slice(0, 5)} – ${fmtData(a)}` }; }
  if (tipo === "mese") return { da: dataISO(y, m, 1), a: fineMese(y, m), etichetta: `${MESI[m - 1]} ${y}` };
  if (tipo === "trimestre") { const q = Math.ceil(m / 3); return { da: dataISO(y, q * 3 - 2, 1), a: fineMese(y, q * 3), etichetta: `${q}° trimestre ${y}` }; }
  return { da: `${y}-01-01`, a: `${y}-12-31`, etichetta: String(y) };
}
/** Data di riferimento spostata di n periodi. */
export function spostaPeriodo(tipo, rif, n) {
  const y = +rif.slice(0, 4), m = +rif.slice(5, 7);
  if (tipo === "settimana") return aggiungiGiorni(rif, 7 * n);
  if (tipo === "mese") return dataISO(y, m + n, 1);
  if (tipo === "trimestre") return dataISO(y, m + 3 * n, 1);
  return dataISO(y + n, 1, 1);
}
/** Colonne dell'andamento: giorni (settimana, mese), settimane (trimestre), mesi (anno). */
export function colonnePeriodo(tipo, da, a) {
  const out = [];
  if (tipo === "settimana" || tipo === "mese") for (let d = da; d <= a; d = aggiungiGiorni(d, 1)) out.push({ da: d, a: d, etichetta: tipo === "settimana" ? GIORNI[giornoSettimana(d)] + " " + +d.slice(8) : String(+d.slice(8)), libero: giornoSettimana(d) >= 5 || !!festiviTicino(+d.slice(0, 4))[d] });
  else if (tipo === "trimestre") for (let d = lunedi(da); d <= a; d = aggiungiGiorni(d, 7)) out.push({ da: d < da ? da : d, a: aggiungiGiorni(d, 6) > a ? a : aggiungiGiorni(d, 6), etichetta: fmtData(d < da ? da : d).slice(0, 5) });
  else for (let m = 1; m <= 12; m++) out.push({ da: dataISO(+da.slice(0, 4), m, 1), a: fineMese(+da.slice(0, 4), m), etichetta: MESI[m - 1].slice(0, 3) });
  return out;
}
/** Copertura: ore registrate sui mandati rispetto alle ore di presenza. ok >= 95%, quasi >= 80%, poi mancano. */
export function statoCopertura(reg, pres) {
  if (!pres) return null;
  const p = reg / pres;
  return p >= 0.95 ? "ok" : p >= 0.8 ? "urgente" : "scaduto";
}

// ---------- Colori dei collaboratori ----------
// Otto colori in ordine fisso (verificati per il daltonismo); il colore segue la persona, non la posizione in elenco.
export const COLORI_PERSONA = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
/** id utente -> colore. Usa il colore scelto (utente.colore = 1..8) o l'ordine di creazione. */
export function coloriUtenti(utenti) {
  const out = {}, usati = new Set();
  for (const u of utenti) if (u.colore >= 1 && u.colore <= 8) { out[u.id] = COLORI_PERSONA[u.colore - 1]; usati.add(u.colore - 1); }
  const liberi = COLORI_PERSONA.map((_, i) => i).filter(i => !usati.has(i));
  [...utenti].filter(u => !out[u.id]).sort((a, b) => String(a.creato || "").localeCompare(String(b.creato || "")) || String(a.id).localeCompare(String(b.id)))
    .forEach((u, i) => { out[u.id] = COLORI_PERSONA[liberi.length ? liberi[i % liberi.length] : i % 8]; });
  return out;
}

// ---------- Pratiche amministrative (fuori mandato) ----------
// Ogni tipo ha un ente abituale e un'attesa standard in giorni prima di controllare/sollecitare (modificabile per pratica).
export const TIPI_PRATICA = [
  ["Assegni familiari", "Cassa assegni familiari", 30], ["Estratto conto individuale AVS", "Cassa AVS", 30],
  ["Affiliazione AVS", "Cassa AVS", 30], ["Rateizzazione imposte", "Ufficio esazione e condoni", 20],
  ["Richiesta di proroga", "Ufficio di tassazione", 20], ["Reclamo / ricorso", "Ufficio di tassazione", 60],
  ["Permesso di lavoro / dimora", "Ufficio della migrazione", 45], ["Iscrizione / modifica a Registro di commercio", "Registro di commercio", 15],
  ["Rimborso imposta preventiva", "AFC", 45], ["Certificato / estratto", "", 15], ["Altro", "", 21]
];
export const ATTESA_TIPO = Object.fromEntries(TIPI_PRATICA.map(([t, , g]) => [t, g]));
export const ENTE_TIPO = Object.fromEntries(TIPI_PRATICA.map(([t, en]) => [t, en]));
export const FASI_PRATICA = ["In preparazione", "In attesa dell'ente", "Documenti richiesti", "Conclusa", "Annullata"];
export const GIORNI_SOLLECITO = 10;     // dopo un sollecito si ricontrolla dopo 10 giorni
export const GIORNI_DOCUMENTI = 5;      // documenti richiesti: da inviare entro 5 giorni
export const praticaAperta = (p) => p.fase !== "Conclusa" && p.fase !== "Annullata";

/** Urgenza: sollecitare (controllo scaduto) | oggi (controllo entro 2 giorni) | ritardo (oltre la data di conclusione prevista) | null */
export function urgenzaPratica(p, oggi = new Date()) {
  if (!praticaAperta(p)) return null;
  const c = giorniA(p.prossimoControllo, oggi);
  if (c != null && c < 0) return "sollecitare";
  if (c != null && c <= 2) return "oggi";
  const f = giorniA(p.concludereEntro, oggi);
  if (f != null && f < 0) return "ritardo";
  return null;
}
/** Importo da fatturare: forfait, oppure ore registrate sulla pratica × tariffa. */
export function importoPratica(p, minutiRegistrati = 0, tariffaDefault = 150) {
  const f = p.fatturazione || {};
  if (f.modo === "Non fatturare") return 0;
  if (f.modo === "Forfait") return Number(f.importo) || 0;
  return Math.round(minutiRegistrati / 60 * (Number(f.tariffa) || tariffaDefault) * 100) / 100;
}


// ---------- Persone fisiche: dati per la dichiarazione fiscale ----------
export const STATI_CIVILI = ["Celibe / nubile", "Coniugato/a", "Unione domestica registrata", "Separato/a", "Divorziato/a", "Vedovo/a"];
export const TASSAZIONE_PF = ["Ordinaria", "Alla fonte con tassazione ordinaria ulteriore", "Alla fonte – richiesta di rettifica", "Frontaliere / quasi residente"];
export const ATTIVITA_PF = ["Dipendente", "Indipendente", "Pensionato/a", "Senza attività lucrativa", "In formazione"];
/** Documenti che il cliente deve consegnare ogni anno: si scelgono una volta nell'anagrafica e si spuntano per ogni dichiarazione. */
export const DOCUMENTI_DF = [
  ["salario", "Certificati di salario"], ["rendite", "Attestati rendite AVS / AI / LPP"], ["indennita", "Indennità (disoccupazione, IPG, assicurazioni)"],
  ["indipendente", "Conti dell'attività indipendente"], ["conti", "Estratti conti e titoli al 31.12, con interessi"], ["immobili", "Immobili: valore di stima, affitti, spese"],
  ["ipoteche", "Debiti e ipoteche: saldo e interessi"], ["pilastro3a", "Attestato 3° pilastro A"], ["riscattiLpp", "Riscatti LPP"],
  ["cassaMalati", "Premi cassa malati e spese mediche non rimborsate"], ["figli", "Spese di custodia e formazione dei figli"], ["alimenti", "Alimenti versati o ricevuti"],
  ["donazioni", "Donazioni"], ["veicoli", "Veicoli (anno e valore)"], ["estero", "Redditi e sostanza all'estero"]
];
/** Chiavi dei documenti scelti nell'anagrafica del cliente. */
export const documentiDF = (c) => DOCUMENTI_DF.map(([k]) => k).filter(k => c.df?.documenti?.[k]);
