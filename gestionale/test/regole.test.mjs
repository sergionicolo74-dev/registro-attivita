// Test delle regole: node gestionale/test/regole.test.mjs
import assert from "node:assert/strict";
import { fmtData, parseData, fmtNum, fmtOre, normNome, giorniA, statoScadenza } from "../js/regole.js";
import { clientiDaExcel, personeDaExcel, abbinaNome, documentiDaBackup } from "../js/mappa-import.js";

assert.equal(fmtData("2026-11-15"), "15.11.2026");
assert.equal(parseData("15.11.2026"), "2026-11-15");
assert.equal(parseData("1.2.26"), "2026-02-01");
assert.equal(parseData("31.02.2026"), null);
assert.equal(parseData(new Date(2026, 11, 31)), "2026-12-31");
assert.equal(fmtNum(100000), "100'000.00");
assert.equal(fmtNum(2280), "2'280.00");
assert.equal(fmtNum(-1234.5), "-1'234.50");
assert.equal(fmtOre(4255), "70.92");
assert.equal(normNome("  T&MC  Industri SA "), "t&mc industri sa");
const oggi = new Date(2026, 10, 15);
assert.equal(giorniA("2026-11-20", oggi), 5);
assert.equal(statoScadenza("2026-11-10", 30, oggi), "scaduto");
assert.equal(statoScadenza("2026-12-01", 30, oggi), "urgente");
assert.equal(statoScadenza("2027-03-01", 30, oggi), "ok");

const { clienti, errori } = clientiDaExcel([
  { "Codice cliente": "ESEMPIO", "Ragione sociale": "Alfa" },
  { "Codice cliente": "C001", "Ragione sociale": "Beta SA", "IVA": "x", "LPP": "", "Revisione": "X", "Aggiornare entro": new Date(2026, 11, 31), "Forfait annuo CHF": "2'200" },
  { "Codice cliente": "C002", "Ragione sociale": "" }
]);
assert.equal(clienti.length, 1);
assert.equal(clienti[0].servizi.iva, true);
assert.equal(clienti[0].servizi.lpp, false);
assert.equal(clienti[0].revisione, true);
assert.equal(clienti[0].mandato.aggiornareEntro, "2026-12-31");
assert.equal(clienti[0].onorario.forfait, 2200);
assert.equal(errori.length, 1);
const { persone, errori: eP } = personeDaExcel([{ "Codice cliente": "C001", "Cognome": "Rossi", "Contatto principale": "x" }, { "Codice cliente": "C999", "Cognome": "X" }], new Set(["C001"]));
assert.equal(persone.length, 1); assert.equal(persone[0].dati.principale, true); assert.equal(eP.length, 1);
const cl = [{ id: "a", ragioneSociale: "T&MC Industry SA", aliasNomi: ["T&MC Industri SA"] }];
assert.equal(abbinaNome("t&mc industri sa", cl).id, "a");
const docs = documentiDaBackup({ attivita: [{ id: "1", cliente: "X", minuti: 30, data: "2026-11-01" }, { id: "2", cliente: "Y", minuti: 10 }], promemoria: [], deleghe: [] }, { X: "a" }, { uid: "u", nome: "Seo" });
assert.equal(docs.length, 1); assert.equal(docs[0].id, "reg-1"); assert.equal(docs[0].autoreUid, "u");
console.log("Tutti i test superati");
const r2 = await import("../js/regole.js");
assert.equal(r2.lunedi("2026-11-15"), "2026-11-09");
assert.equal(r2.lunedi("2026-11-09"), "2026-11-09");
assert.equal(r2.aggiungiGiorni("2026-12-31", 1), "2027-01-01");
assert.equal(r2.fmtDurata(90), "1h 30");
assert.deepEqual(r2.campiMancanti({ codice: "C001", forma: "SA", servizi: {}, mandato: {} }, 0, null).slice(0, 2), ["IDI", "Responsabile"]);
assert.equal(r2.campiMancanti({ codice: "C000" }, 0, {}).length, 0);
console.log("Test date e completezza superati");
const r3 = await import("../js/regole.js");
const vecchio = { codice: "C001", servizi: { contabilita: true, domiciliazione: true }, mandato: { tipo: "Completo", stato: "Da aggiornare", aggiornareEntro: "2026-12-31" },
  funzione: { tipo: "Amministratore", persona: "Seo" }, onorario: { forfait: 2200, budgetOre: 15 } };
const mm = r3.mandatiDi(vecchio);
assert.equal(mm.contabilita.attivo, true); assert.equal(mm.contabilita.budget, 2200);
assert.equal(mm.funzione.funzioni[0].ruolo, "Amministratore unico");
assert.equal(mm.domiciliazione.attivo, true); assert.equal(mm.domiciliazione.stato, "Da aggiornare");
assert.equal(r3.budgetTotale(mm), 2200);
const nuovo = r3.mandatiDi({ mandati: { funzione: { attivo: true, budget: 3000, stato: "Firmato aggiornato", funzioni: [{ ruolo: "Presidente CdA" }] } } });
assert.equal(nuovo.contabilita.attivo, false); assert.equal(r3.statoMandato(nuovo.funzione), "ok"); assert.equal(r3.budgetTotale(nuovo), 3000);
assert.ok(r3.campiMancanti({ codice: "C002", forma: "SA", servizi: {} }, 1, null).includes("Mandati"));
console.log("Test mandati superati");
const mi = await import("../js/mappa-import.js");
const ex = { id: "a", codice: "C001", idi: "CHE-1", servizi: { iva: true }, mandati: { funzione: { attivo: true } }, iva: { regime: "Effettivo" } };
const u = mi.unisciCliente(ex, { codice: "C001", idi: "", localita: "Lugano", servizi: { iva: false, lpp: true }, mandati: { contabilita: { attivo: true } }, iva: { regime: "", periodicita: "Trimestrale" } });
assert.equal(u.idi, "CHE-1"); assert.equal(u.localita, "Lugano"); assert.equal(u.servizi.iva, true); assert.equal(u.servizi.lpp, true);
assert.equal(u.mandati.funzione.attivo, true); assert.equal(u.iva.regime, "Effettivo"); assert.equal(u.iva.periodicita, "Trimestrale"); assert.equal(u.id, "a");
console.log("Test unione import superati");
const r4 = await import("../js/regole.js");
const o4 = new Date(2026, 10, 15);
assert.equal(r4.urgenzaCompito({ stato: "Da fare", scadenza: "2026-11-14" }, o4), "scaduto");
assert.equal(r4.urgenzaCompito({ stato: "Da fare", scadenza: "2026-11-20" }, o4), "urgente");
assert.equal(r4.urgenzaCompito({ stato: "Preso in carico", scadenza: "2026-12-20", aggiornato: "2026-11-09T10:00:00Z" }, o4), "fermo");
assert.equal(r4.urgenzaCompito({ stato: "In attesa riscontro", scadenza: "2026-12-20", aggiornato: "2026-11-01T10:00:00Z" }, o4), null);
assert.equal(r4.urgenzaCompito({ stato: "Fatto", scadenza: "2026-11-01" }, o4), null);
console.log("Test compiti superati");

// ---------- Scadenziario ----------
{
  const R = await import("../js/regole.js");
  const cli = { id: "x", codice: "C001", forma: "SA", stato: "Attivo", chiusuraEsercizio: "31.12",
    servizi: { contabilita: true, iva: true, stipendi: true, ifTrimestrale: true, avsLainfIpg: true, lpp: true, dichiarazione: true, revisione: true },
    iva: { regime: "Effettivo", periodicita: "Trimestrale" }, giornoPaga: 31,
    mandati: { funzione: { attivo: true, funzioni: [{ ruolo: "Amministratore unico" }] } } };
  const l = R.scadenzeCliente(cli, 2026);
  const per = (s, p) => l.find(o => o.servizio === s && o.periodo === p)?.scadenza;
  const ok = (a, b, n) => { if (a !== b) { console.error("FALLITO", n, a, "≠", b); process.exitCode = 1; } else console.log("ok", n); };
  ok(per("iva", "2026-T1"), "2026-05-30", "IVA T1 = 30.05");
  ok(per("iva", "2026-T2"), "2026-08-29", "IVA T2 = 29.08");
  ok(per("iva", "2026-T3"), "2026-11-29", "IVA T3 = 29.11");
  ok(per("iva", "2025-T4"), "2026-03-01", "IVA T4 2025 = 01.03.2026");
  ok(per("ivaRiconciliazione", "2025"), "2026-08-28", "Riconciliazione IVA 2025 = 28.08.2026");
  ok(per("contabilita", "2026-10"), "2026-11-20", "Contabilità ottobre = 20.11");
  ok(per("contabilita", "2025-12"), "2026-01-20", "Contabilità dicembre 2025 = 20.01.2026");
  ok(per("stipendi", "2026-02"), "2026-02-28", "Stipendi febbraio con paga il 31 = 28.02");
  ok(per("ifTrimestrale", "2026-T1"), "2026-04-10", "IF T1 = 10.04");
  ok(per("ifTrimestrale", "2026-T3"), "2026-10-10", "IF T3 = 10.10");
  ok(l.some(o => o.servizio === "ifTrimestrale" && o.periodo.endsWith("T4")), false, "IF T4 non separato");
  ok(per("ifAnnuale", "2025"), "2026-01-31", "IF conguaglio 2025 = 31.01.2026");
  ok(per("avsLainfIpg", "2025"), "2026-01-30", "AVS 2025 = 30.01.2026");
  ok(per("lpp", "2027"), "2026-12-31", "LPP salari 2027 = 31.12.2026");
  ok(per("dichiarazione", "2025"), "2026-06-30", "Dichiarazione 2025 = 30.06.2026");
  ok(per("assemblea", "2025"), "2026-06-30", "Assemblea 2025 = 30.06.2026");
  const rev = l.find(o => o.servizio === "revisione" && o.periodo === "2025");
  ok(rev?.scadenza + "/" + rev?.avvisoDal, "2026-06-30/2026-03-31", "Revisione: allerta 31.03, entro 30.06");
  // anno bisestile: T4 2027 + 60 giorni = 29.02.2028
  ok(R.scadenzeCliente(cli, 2028).find(o => o.servizio === "iva" && o.periodo === "2027-T4")?.scadenza, "2028-02-29", "IVA T4 2027 = 29.02.2028");
  // chiusura al 30.06
  const c2 = { ...cli, chiusuraEsercizio: "30.06" };
  ok(R.scadenzeCliente(c2, 2026).find(o => o.servizio === "assemblea" && o.periodo === "2026")?.scadenza, "2026-12-31", "Assemblea con chiusura 30.06 = 31.12");
  // persona fisica: niente assemblea né revisione; cliente cessato: nulla
  ok(R.scadenzeCliente({ ...cli, forma: "Persona fisica" }, 2026).some(o => o.servizio === "assemblea" || o.servizio === "revisione"), false, "Persona fisica senza assemblea");
  ok(R.scadenzeCliente({ ...cli, stato: "Cessato" }, 2026).length, 0, "Cliente cessato senza scadenze");
  // urgenza
  const oggi = new Date(2026, 10, 15);
  const u = (data, annuale, stato = "Da fare", avvisoDal) => R.urgenzaScadenza({ data, annuale, stato, avvisoDal }, oggi);
  ok(u("2026-11-14", false), "scaduto", "scaduta ieri");
  ok(u("2026-11-20", false), "urgente", "entro 5 giorni");
  ok(u("2026-11-21", false), null, "6 giorni: nessun avviso");
  ok(u("2026-12-10", true), "preavviso", "annuale entro 30 giorni");
  ok(u("2026-11-01", false, "Fatto"), null, "fatta");
  ok(u("2027-06-30", true, "Da fare", "2026-11-01"), "preavviso", "revisione dopo data di allerta");
  const pr = R.conStato({ scadenza: "2026-06-30" }, { stato: "Prorogato", nuovaData: "2026-12-31" });
  ok(pr.data, "2026-12-31", "proroga sposta la data");
}

// ---------- Presenze ----------
{
  const R = await import("../js/regole.js");
  const ok = (a, b, n) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) { console.error("FALLITO", n, x, "≠", y); process.exitCode = 1; } else console.log("ok", n); };
  ok(R.pasqua(2026), "2026-04-05", "Pasqua 2026 = 05.04");
  ok(R.pasqua(2027), "2027-03-28", "Pasqua 2027 = 28.03");
  ok(R.pasqua(2025), "2025-04-20", "Pasqua 2025 = 20.04");
  const f = R.festiviTicino(2026);
  ok(Object.keys(f).length, 15, "15 festivi in Ticino");
  ok([f["2026-04-06"], f["2026-05-14"], f["2026-05-25"], f["2026-06-04"]], ["Lunedì di Pasqua", "Ascensione", "Lunedì di Pentecoste", "Corpus Domini"], "festivi mobili 2026");
  ok(f["2026-04-03"], undefined, "Venerdì Santo non festivo");
  ok(R.minutiDovuti({ oreSettimanali: 42 }, "2026-11-16"), 504, "42 h settimanali = 8h24 al giorno");
  ok(R.minutiDovuti({ oreSettimanali: 42, percentuale: 50 }, "2026-11-16"), 252, "50%");
  ok(R.minutiDovuti({}, "2026-11-15"), 0, "domenica");
  ok(R.minutiDovuti({}, "2026-12-08"), 0, "Immacolata");
  ok([R.parseOre("8:30"), R.parseOre("8.5"), R.parseOre("8,25"), R.parseOre("8h"), R.parseOre("7h45"), R.parseOre("90m"), R.parseOre("")], [510, 510, 495, 480, 465, 90, null], "lettura ore");
  ok([isNaN(R.parseOre("25:00")), isNaN(R.parseOre("8:75")), isNaN(R.parseOre("abc"))], [true, true, true], "ore non valide");
  // settimana 16–20.11.2026, 42h: lun 9h, mar 8h, mer vacanza, gio mezza vacanza + 4h, ven vuoto (passato)
  const pres = { "2026-11-16": { minuti: 540 }, "2026-11-17": { minuti: 480 }, "2026-11-18": { assenza: "Vacanza" }, "2026-11-19": { minuti: 240, assenza: "Vacanza mezza giornata" } };
  const r = R.riepilogoPresenze(pres, { oreSettimanali: 42 }, "2026-11-16", "2026-11-22", "2026-11-16", "2026-11-23");
  ok([r.dovute, r.lavorate, r.credito, r.saldo, r.vacanze, r.daCompilare], [2520, 1260, 756, -504, 1.5, 1], "riepilogo settimana");
  ok(R.fmtSaldo(-504), "−8h 24", "saldo negativo");
}

// ---------- Orari di entrata e uscita ----------
{
  const R = await import("../js/regole.js");
  const ok = (a, b, n) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) { console.error("FALLITO", n, x, "≠", y); process.exitCode = 1; } else console.log("ok", n); };
  ok(["8", "8:00", "08.15", "815", "0815", "17:30", ""].map(R.parseOrario), [480, 480, 495, 495, 495, 1050, null], "lettura orari");
  ok(["25:00", "8:60", "abc", "8:5"].map(v => Number.isNaN(R.parseOrario(v))), [true, true, true, true], "orari non validi");
  ok(R.minutiDaOrari(480, 1050, 60), 510, "08:00–17:30 con 1 h di pausa = 8h30");
  ok(R.minutiDaOrari(480, null, 60), null, "manca l'uscita");
  ok(Number.isNaN(R.minutiDaOrari(1050, 480, 0)), true, "uscita prima dell'entrata");
  ok([R.pausaMinima(330), R.pausaMinima(331), R.pausaMinima(420), R.pausaMinima(421), R.pausaMinima(541)], [0, 15, 15, 30, 60], "pause minime art. 15 LL");
  ok(R.fmtOrario(495), "08:15", "formato orario");
}

// ---------- Vacanze ----------
{
  const R = await import("../js/regole.js");
  const ok = (a, b, n) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) { console.error("FALLITO", n, x, "≠", y); process.exitCode = 1; } else console.log("ok", n); };
  ok(R.giorniLavorativi("2026-12-21", "2027-01-08"), 12, "Natale-Epifania: 12 giorni lavorativi");
  ok(R.giorniLavorativi("2026-11-16", "2026-11-22"), 5, "una settimana = 5 giorni");
  ok(R.giorniRichiesta({ dal: "2026-11-16", al: "2026-11-16", mezza: true }), 0.5, "mezza giornata");
  const v = [{ uid: "a", stato: "Approvata", tipo: "Vacanza", dal: "2026-12-28", al: "2027-01-08" }, { uid: "a", stato: "Richiesta", tipo: "Vacanza", dal: "2026-07-01", al: "2026-07-10" }];
  ok([R.vacanzeUsate(v, "a", 2026), R.vacanzeUsate(v, "a", 2027)], [4, 4], "vacanza a cavallo d'anno");
  const p = R.conVacanze({ "2026-12-29": { minuti: 120 } }, v, "a");
  ok([p["2026-12-28"]?.assenza, p["2026-12-29"]?.minuti, p["2027-01-01"], p["2027-01-06"]], ["Vacanza", 120, undefined, undefined], "vacanze nelle presenze, festivi esclusi, registrazioni rispettate");
}

// ---------- Periodi ----------
{
  const R = await import("../js/regole.js");
  const ok = (a, b, n) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) { console.error("FALLITO", n, x, "≠", y); process.exitCode = 1; } else console.log("ok", n); };
  ok(R.periodoDi("settimana", "2026-11-15"), { da: "2026-11-09", a: "2026-11-15", etichetta: "09.11 – 15.11.2026" }, "settimana");
  ok([R.periodoDi("trimestre", "2026-11-15").da, R.periodoDi("trimestre", "2026-11-15").a], ["2026-10-01", "2026-12-31"], "trimestre");
  ok(R.periodoDi("mese", "2026-02-10").a, "2026-02-28", "fine febbraio");
  ok(R.spostaPeriodo("trimestre", "2026-11-01", 1), "2027-02-01", "trimestre successivo");
  ok(R.colonnePeriodo("anno", "2026-01-01", "2026-12-31").length, 12, "12 mesi");
  ok(R.colonnePeriodo("trimestre", "2026-10-01", "2026-12-31")[0], { da: "2026-10-01", a: "2026-10-04", etichetta: "01.10" }, "prima settimana del trimestre");
  ok([R.statoCopertura(38, 40), R.statoCopertura(33, 40), R.statoCopertura(20, 40), R.statoCopertura(5, 0)], ["ok", "urgente", "scaduto", null], "copertura");
}
{
  const R = await import("../js/regole.js");
  const c = R.coloriUtenti([{ id: "b", creato: "2026-02" }, { id: "a", creato: "2026-01" }, { id: "c", colore: 1 }]);
  const ok = (a, b, n) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FALLITO", n, a, b); process.exitCode = 1; } else console.log("ok", n); };
  ok([c.c, c.a, c.b], ["#2a78d6", "#eb6834", "#1baf7a"], "colori: scelto e poi ordine di creazione");
}

// ---------- Pratiche ----------
{
  const R = await import("../js/regole.js");
  const ok = (a, b, n) => { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) { console.error("FALLITO", n, x, "≠", y); process.exitCode = 1; } else console.log("ok", n); };
  const oggi = new Date(2026, 10, 15);
  const u = (p) => R.urgenzaPratica({ fase: "In attesa dell'ente", ...p }, oggi);
  ok(u({ prossimoControllo: "2026-11-14" }), "sollecitare", "controllo passato: sollecitare");
  ok(u({ prossimoControllo: "2026-11-17" }), "oggi", "controllo entro 2 giorni");
  ok(u({ prossimoControllo: "2026-12-01", concludereEntro: "2026-11-10" }), "ritardo", "oltre la conclusione prevista");
  ok(u({ prossimoControllo: "2026-12-01" }), null, "nei tempi");
  ok(R.urgenzaPratica({ fase: "Conclusa", prossimoControllo: "2026-01-01" }, oggi), null, "conclusa");
  ok([R.importoPratica({ fatturazione: { modo: "Forfait", importo: 250 } }, 600), R.importoPratica({ fatturazione: { modo: "A ore" } }, 90), R.importoPratica({ fatturazione: { modo: "A ore", tariffa: 120 } }, 45), R.importoPratica({ fatturazione: { modo: "Non fatturare" } }, 60)],
    [250, 225, 90, 0], "importi: forfait, 1h30 a 150, 45 min a 120, non fatturare");
}
