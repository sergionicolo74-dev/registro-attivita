// Trasformazioni pure per gli import (testabili senza browser né database).
import { parseData, normNome, mandatiDi, DOCUMENTI_DF } from "./regole.js";

const X = v => String(v ?? "").trim().toLowerCase() === "x";
const T = v => (v == null ? "" : String(v).trim());
const N = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(/'/g, "")); return isNaN(n) ? null : n; };

const MAPPA_SERVIZI = {
  "Contabilità": "contabilita", "IVA": "iva", "Stipendi": "stipendi", "IF trimestrale": "ifTrimestrale",
  "IF conguaglio annuale": "ifAnnuale", "Dichiarazione fiscale": "dichiarazione", "AVS / LAINF / IPG": "avsLainfIpg",
  "LPP": "lpp", "Domiciliazione": "domiciliazione", "Revisione": "revisione"
};

const PREF_MANDATO = { contabilita: "Contabilità", funzione: "Funzione", domiciliazione: "Domiciliazione", intestazione: "Intestazione" };
const chiusuraDa = v => v instanceof Date ? `${String(v.getDate()).padStart(2, "0")}.${String(v.getMonth() + 1).padStart(2, "0")}` : T(v);

/** Figli scritti come "Giulia 01.09.2012; Luca 15.03.2015" */
export function figliDaTesto(t) {
  return T(t).split(/[;\n]/).map(x => x.trim()).filter(Boolean).map(x => {
    const m = /^(.*?)[\s,]+(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})$/.exec(x);
    return m ? { nome: m[1].trim(), nascita: parseData(m[2]), situazione: "" } : { nome: x, nascita: null, situazione: "" };
  });
}

/** Modello completo (versione 3): mandati separati, persone fisiche, documenti DF. */
function clientiDaExcelV3(righe) {
  const clienti = [], kyc = [], errori = [], senzaCodice = [];
  righe.forEach((r, i) => {
    const codice = T(r["Codice cliente"]);
    if (!codice) { const rs0 = T(r["Ragione sociale"]); if (rs0 && !rs0.startsWith("*")) senzaCodice.push(rs0); return; }
    if (codice.toUpperCase() === "ESEMPIO") return;
    const rs = T(r["Ragione sociale"]);
    if (!rs) { errori.push(`Riga ${i + 3}: manca la ragione sociale (codice ${codice})`); return; }
    const servizi = {};
    for (const [col, k] of Object.entries(MAPPA_SERVIZI)) if (col in r) servizi[k] = X(r[col]);
    const m = (k, extra = {}) => {
      const p = PREF_MANDATO[k];
      return { attivo: X(r[`${p} – mandato attivo`]), stato: T(r[`${p} – stato mandato firmato`]), dataFirma: parseData(r[`${p} – data firma`]),
        aggiornareEntro: parseData(r[`${p} – aggiornare entro`]), budget: N(r[`${p} – onorario annuo CHF`] ?? r[`${p} – forfait annuo CHF`]), fatturazione: T(r[`${p} – fatturazione`]), ...extra };
    };
    const ruolo = T(r["Funzione – ruolo"]), persona = T(r["Funzione – persona dello studio"]);
    const mandati = {
      contabilita: m("contabilita", { tariffa: N(r["Contabilità – tariffa concordata CHF/h"] ?? r["Contabilità – tariffa oraria CHF"]) }),
      funzione: m("funzione", { funzioni: ruolo || persona ? [{ ruolo, persona, firma: T(r["Funzione – diritto di firma"]), inizio: parseData(r["Funzione – dal"]) }] : [] }),
      domiciliazione: m("domiciliazione", { tipo: T(r["Domiciliazione – tipo"]), dal: parseData(r["Domiciliazione – dal"]) }),
      intestazione: m("intestazione", { tipoTitoli: T(r["Intestazione – titoli"]), numero: N(r["Intestazione – numero"]), valoreNominale: N(r["Intestazione – valore nominale CHF"]),
        percentuale: N(r["Intestazione – quota del capitale %"]), intestatario: T(r["Intestazione – intestate a"]), dal: parseData(r["Intestazione – dal"]),
        contratto: T(r["Intestazione – contratto fiduciario"]), iscrizione: T(r["Intestazione – libro azioni / RC"]) })
    };
    if (mandati.domiciliazione.attivo) servizi.domiciliazione = true;
    const forma = T(r["Forma giuridica"]);
    const documenti = {};
    for (const [k, n] of DOCUMENTI_DF) if (X(r[`DF – ${n}`])) documenti[k] = true;
    const coniugeNome = T(r["PF – coniuge cognome e nome"]);
    const df = forma === "Persona fisica" ? {
      nascita: parseData(r["PF – data di nascita"]), statoCivile: T(r["PF – stato civile"]), attivita: T(r["PF – attività"]), tassazione: T(r["PF – tassazione"]),
      comune: T(r["PF – comune di domicilio fiscale"]), note: T(r["PF – note per la dichiarazione"]), figli: figliDaTesto(r["PF – figli"]), documenti,
      coniuge: coniugeNome ? { nome: coniugeNome, nascita: parseData(r["PF – coniuge data di nascita"]), attivita: T(r["PF – coniuge attività"]) } : null
    } : null;
    clienti.push({
      codice, ragioneSociale: rs, nomePrecedente: T(r["Nome precedente"]) || null, forma, idi: T(r["IDI"]), responsabile: T(r["Responsabile interno"]), sostituto: T(r["Sostituto"]),
      stato: T(r["Stato cliente"]) || "Attivo", chiusuraEsercizio: chiusuraDa(r["Chiusura esercizio"]),
      indirizzo: T(r["Indirizzo"]), npa: T(r["NPA"]), localita: T(r["Località"]), cantone: T(r["Cantone"]),
      emailGenerale: T(r["Email generale"]), lingua: T(r["Lingua corrispondenza"]),
      iva: { regime: T(r["Regime IVA"]), periodicita: T(r["Periodicità IVA"]) }, contabilitaPeriodicita: T(r["Contabilità registrata"]),
      giornoPaga: N(r["Giorno di paga"]), dipendenti: N(r["N. dipendenti"]), cassaAvs: T(r["Cassa AVS"]), lainf: T(r["Assicuratore LAINF"]), lpp: T(r["Istituto LPP"]),
      servizi, revisione: !!servizi.revisione, mandati, ...(df ? { df } : {}),
      cartella: T(r["Cartella archivio"]), note: T(r["Note"])
    });
    const fid = T(r["Fiduciante (intestazione fiduciaria)"]);
    kyc.push({ codice, stato: T(r["Stato KYC"]), rischio: T(r["Rischio"]), ultimaVerifica: parseData(r["Ultima verifica KYC"]), prossimaRevisione: parseData(r["Prossima revisione KYC"]),
      ...(fid ? { intestazione: { fiduciante: fid } } : {}) });
  });
  return { clienti, kyc, errori, senzaCodice };
}

/** Righe del foglio "Clienti" (oggetti con le intestazioni come chiavi) -> { clienti, kyc, errori }. Riconosce il modello completo e quello precedente. */
export function clientiDaExcel(righe) {
  if (righe.some(r => "Contabilità – mandato attivo" in r)) {
    const out = clientiDaExcelV3(righe), visti = new Set();
    for (const c of out.clienti) { if (visti.has(c.codice)) out.errori.push(`Codice ${c.codice} ripetuto`); visti.add(c.codice); }
    return out;
  }
  const clienti = [], kyc = [], errori = [], senzaCodice = [];
  righe.forEach((r, i) => {
    const codice = T(r["Codice cliente"]);
    if (!codice) { const rs0 = T(r["Ragione sociale"]); if (rs0 && !rs0.startsWith("*")) senzaCodice.push(rs0); return; }
    if (codice.toUpperCase() === "ESEMPIO") return;
    const rs = T(r["Ragione sociale"]);
    if (!rs) { errori.push(`Riga ${i + 2}: manca la ragione sociale (codice ${codice})`); return; }
    const servizi = {};
    for (const [col, k] of Object.entries(MAPPA_SERVIZI)) servizi[k] = X(r[col]);
    const chiusura = r["Chiusura esercizio"] instanceof Date
      ? `${String(r["Chiusura esercizio"].getDate()).padStart(2, "0")}.${String(r["Chiusura esercizio"].getMonth() + 1).padStart(2, "0")}`
      : T(r["Chiusura esercizio"]);
    clienti.push({
      codice, ragioneSociale: rs, nomePrecedente: T(r["Nome precedente"]) || null, forma: T(r["Forma giuridica"]), idi: T(r["IDI"]),
      responsabile: T(r["Responsabile interno"]), sostituto: T(r["Sostituto"]), stato: T(r["Stato mandato"]) || "Attivo",
      inizioMandato: parseData(r["Inizio mandato"]), chiusuraEsercizio: chiusura,
      indirizzo: T(r["Indirizzo"]), npa: T(r["NPA"]), localita: T(r["Località"]), cantone: T(r["Cantone"]),
      emailGenerale: T(r["Email generale"]), lingua: T(r["Lingua corrispondenza"]),
      mandato: { tipo: T(r["Tipo mandato"]), stato: T(r["Stato mandato firmato"]), dataFirma: parseData(r["Data firma mandato"]), aggiornareEntro: parseData(r["Aggiornare entro"]) },
      iva: { regime: T(r["Regime IVA"]), periodicita: T(r["Periodicità IVA"]) },
      dipendenti: N(r["N. dipendenti"]), cassaAvs: T(r["Cassa AVS"]), lainf: T(r["Assicuratore LAINF"]), lpp: T(r["Istituto LPP"]),
      servizi, revisione: servizi.revisione,
      funzione: { tipo: T(r["Funzione societaria"]), persona: T(r["Persona con la funzione"]), firma: T(r["Diritto di firma"]), inizio: parseData(r["Inizio funzione"]) },
      onorario: { tipo: T(r["Tipo onorario"]), forfait: N(r["Forfait annuo CHF"]), tariffa: N(r["Tariffa oraria CHF"]), budgetOre: N(r["Budget ore annue"]), fatturazione: T(r["Fatturazione"]) },
      cartella: T(r["Cartella archivio"]), note: T(r["Note"])
    });
    const ultimo = clienti[clienti.length - 1];
    ultimo.mandati = mandatiDi(ultimo);
    kyc.push({ codice, stato: T(r["Stato KYC"]), rischio: T(r["Rischio"]), ultimaVerifica: parseData(r["Ultima verifica KYC"]), prossimaRevisione: parseData(r["Prossima revisione KYC"]) });
  });
  const visti = new Set();
  for (const c of clienti) { if (visti.has(c.codice)) errori.push(`Codice ${c.codice} ripetuto`); visti.add(c.codice); }
  return { clienti, kyc, errori, senzaCodice };
}

/** Righe del foglio "Persone" -> { persone: [{codice, dati, kyc}], errori } */
export function personeDaExcel(righe, codiciValidi) {
  const persone = [], errori = [];
  let senzaCodice = 0;
  righe.forEach((r, i) => {
    const codice = T(r["Codice cliente"]);
    if (!codice) { if (T(r["Cognome"]) || T(r["Nome"])) senzaCodice++; return; }
    if (codice.toUpperCase() === "ESEMPIO") return;
    if (!T(r["Cognome"]) && !T(r["Nome"])) return;
    if (codiciValidi && !codiciValidi.has(codice)) { errori.push(`Persone, riga ${i + 2}: codice cliente ${codice} non trovato`); return; }
    const codicePF = T(r["Cliente persona fisica (DF)"]);
    if (codicePF && codiciValidi && !codiciValidi.has(codicePF)) errori.push(`Persone, riga ${i + 2}: cliente persona fisica ${codicePF} non trovato`);
    persone.push({
      codice, codicePF: codicePF && (!codiciValidi || codiciValidi.has(codicePF)) ? codicePF : "",
      dati: { cognome: T(r["Cognome"]), nome: T(r["Nome"]), ruolo: T(r["Ruolo"]), principale: X(r["Contatto principale"]), firma: T(r["Diritto di firma"]),
        email: T(r["Email"]), telefono: T(r["Telefono"]), canale: T(r["Canale preferito"]), lingua: T(r["Lingua"]), note: T(r["Note"]) },
      kyc: { nazionalita: T(r["Nazionalità"]), domicilio: T(r["Paese di domicilio"]), tipoDocumento: T(r["Tipo documento"]),
        scadenzaDocumento: parseData(r["Scadenza documento"]), copiaArchivio: X(r["Copia documento in archivio"]) }
    });
  });
  return { persone, errori, senzaCodice };
}

/** Trova il cliente per nome (ragione sociale o nomi precedenti). */
export function abbinaNome(nome, clienti) {
  const n = normNome(nome);
  return clienti.find(c => normNome(c.ragioneSociale) === n || (c.aliasNomi || []).some(a => normNome(a) === n)) || null;
}

/** Backup del vecchio registro -> documenti per la nuova struttura.
 *  abbinamenti: { "nome nel backup": clienteId }  autore: { uid, nome } */
export function documentiDaBackup(backup, abbinamenti, autore) {
  const docs = [];
  for (const a of backup.attivita || []) {
    const clienteId = abbinamenti[a.cliente];
    if (!clienteId) continue;
    docs.push({ col: "registrazioni", id: "reg-" + a.id, clienteId, data: a.data, minuti: a.minuti || 0, fatturabile: a.fatturabile !== false,
      tipo: "lavoro", descrizione: a.descrizione || "", autoreUid: autore.uid, autoreNome: autore.nome, migratoDa: "registro-attivita", creato: a.creato || null });
  }
  for (const p of backup.promemoria || []) {
    docs.push({ col: "compiti", id: "pro-" + p.id, clienteId: abbinamenti[p.cliente] || null, titolo: p.testo || "", tipo: "Promemoria",
      stato: p.fatto ? "Fatto" : "Da fare", scadenza: p.scadenza || null, completatoIl: p.completatoIl ? new Date(p.completatoIl).toISOString() : null,
      visibilita: "privato", autoreUid: autore.uid, assegnatoUid: autore.uid, assegnatoNome: autore.nome, migratoDa: "registro-attivita", creato: p.creato || null });
  }
  for (const d of backup.deleghe || []) {
    docs.push({ col: "compiti", id: "del-" + d.id, clienteId: abbinamenti[d.cliente] || null, titolo: d.descrizione || "", tipo: "Delega",
      stato: d.fatto ? "Fatto" : "Da fare", scadenza: d.scadenza || null, completatoIl: d.completatoIl ? new Date(d.completatoIl).toISOString() : null,
      visibilita: "studio", autoreUid: autore.uid, assegnatoUid: null, assegnatoNome: d.collaboratore || "", migratoDa: "registro-attivita", creato: d.creato || null });
  }
  return docs;
}

const vuoto = v => v == null || v === "" || v === false || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && Object.values(v).every(vuoto));

/** Aggiorna un cliente esistente con i dati dell'Excel senza cancellare ciò che è già stato inserito nel gestionale:
 *  le celle vuote non sovrascrivono, i mandati già impostati nel gestionale restano. */
export function unisciCliente(esistente, nuovo) {
  const out = { ...esistente };
  for (const [k, v] of Object.entries(nuovo)) {
    // mandati: le celle compilate aggiornano, quelle vuote non toccano ciò che è già nel gestionale
    if (k === "mandati") { out.mandati = esistente.mandati && Object.keys(esistente.mandati).length ? unisciCliente(mandatiDi(esistente), v) : v; continue; }
    if (vuoto(v)) continue;
    if (typeof v === "object" && !Array.isArray(v) && esistente[k] && typeof esistente[k] === "object") out[k] = unisciCliente(esistente[k], v);
    else out[k] = v;
  }
  return out;
}

/** Stesso cliente con il nome scritto un po' diverso? (es. "T&MC Industri SA" / "T&MC INDUSTRY SA") */
export function nomiSimili(a, b) {
  const x = normNome(a).replace(/\s+/g, ""), y = normNome(b).replace(/\s+/g, "");
  return !!x && !!y && (x.slice(0, 6) === y.slice(0, 6) || x.includes(y) || y.includes(x));
}
