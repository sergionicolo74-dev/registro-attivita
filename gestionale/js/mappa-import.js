// Trasformazioni pure per gli import (testabili senza browser né database).
import { parseData, normNome } from "./regole.js";

const X = v => String(v ?? "").trim().toLowerCase() === "x";
const T = v => (v == null ? "" : String(v).trim());
const N = v => { if (v == null || v === "") return null; const n = Number(String(v).replace(/'/g, "")); return isNaN(n) ? null : n; };

const MAPPA_SERVIZI = {
  "Contabilità": "contabilita", "IVA": "iva", "Stipendi": "stipendi", "IF trimestrale": "ifTrimestrale",
  "IF conguaglio annuale": "ifAnnuale", "Dichiarazione fiscale": "dichiarazione", "AVS / LAINF / IPG": "avsLainfIpg",
  "LPP": "lpp", "Domiciliazione": "domiciliazione", "Revisione": "revisione"
};

/** Righe del foglio "Clienti" (oggetti con le intestazioni come chiavi) -> { clienti, kyc, errori } */
export function clientiDaExcel(righe) {
  const clienti = [], kyc = [], errori = [];
  righe.forEach((r, i) => {
    const codice = T(r["Codice cliente"]);
    if (!codice || codice.toUpperCase() === "ESEMPIO") return;
    const rs = T(r["Ragione sociale"]);
    if (!rs) { errori.push(`Riga ${i + 2}: manca la ragione sociale (codice ${codice})`); return; }
    const servizi = {};
    for (const [col, k] of Object.entries(MAPPA_SERVIZI)) servizi[k] = X(r[col]);
    const chiusura = r["Chiusura esercizio"] instanceof Date
      ? `${String(r["Chiusura esercizio"].getDate()).padStart(2, "0")}.${String(r["Chiusura esercizio"].getMonth() + 1).padStart(2, "0")}`
      : T(r["Chiusura esercizio"]);
    clienti.push({
      codice, ragioneSociale: rs, forma: T(r["Forma giuridica"]), idi: T(r["IDI"]),
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
    kyc.push({ codice, stato: T(r["Stato KYC"]), rischio: T(r["Rischio"]), ultimaVerifica: parseData(r["Ultima verifica KYC"]), prossimaRevisione: parseData(r["Prossima revisione KYC"]) });
  });
  const visti = new Set();
  for (const c of clienti) { if (visti.has(c.codice)) errori.push(`Codice ${c.codice} ripetuto`); visti.add(c.codice); }
  return { clienti, kyc, errori };
}

/** Righe del foglio "Persone" -> { persone: [{codice, dati, kyc}], errori } */
export function personeDaExcel(righe, codiciValidi) {
  const persone = [], errori = [];
  righe.forEach((r, i) => {
    const codice = T(r["Codice cliente"]);
    if (!codice || codice.toUpperCase() === "ESEMPIO") return;
    if (!T(r["Cognome"]) && !T(r["Nome"])) return;
    if (codiciValidi && !codiciValidi.has(codice)) { errori.push(`Persone, riga ${i + 2}: codice cliente ${codice} non trovato`); return; }
    persone.push({
      codice,
      dati: { cognome: T(r["Cognome"]), nome: T(r["Nome"]), ruolo: T(r["Ruolo"]), principale: X(r["Contatto principale"]), firma: T(r["Diritto di firma"]),
        email: T(r["Email"]), telefono: T(r["Telefono"]), canale: T(r["Canale preferito"]), lingua: T(r["Lingua"]), note: T(r["Note"]) },
      kyc: { nazionalita: T(r["Nazionalità"]), domicilio: T(r["Paese di domicilio"]), tipoDocumento: T(r["Tipo documento"]),
        scadenzaDocumento: parseData(r["Scadenza documento"]), copiaArchivio: X(r["Copia documento in archivio"]) }
    });
  });
  return { persone, errori };
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
