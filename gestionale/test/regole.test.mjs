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
