// Livello dati: l'UNICO file che parla con il database.
// Per spostare il gestionale su un altro sistema (es. server proprio) si riscrive solo questo file,
// mantenendo gli stessi nomi di funzione. Il modello dati è descritto in docs/modello-dati.md.

import { AMBIENTI } from "./config.js";

const V = "10.12.2";
let fb = null;          // moduli Firebase caricati
let db = null, auth = null;
let demo = null;        // archivio in memoria per l'ambiente demo
let utente = null;      // { uid, email, nome, ruolo }
let authListeners = [];
let appMod = null, configFb = null; // per creare account senza uscire dalla sessione dell'amministratore

const ADMIN = () => utente && utente.ruolo === "admin";

export async function init(env) {
  if (!AMBIENTI[env].firebase) { demo = creaDemo(); return; }
  const [app, a, f] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
  ]);
  fb = { ...a, ...f }; appMod = app; configFb = AMBIENTI[env].firebase;
  const fapp = app.initializeApp(AMBIENTI[env].firebase);
  auth = a.getAuth(fapp);
  db = f.getFirestore(fapp);
  a.onAuthStateChanged(auth, async (u) => {
    if (!u) { utente = null; authListeners.forEach(cb => cb(null)); return; }
    let prof = null;
    try { prof = (await f.getDoc(f.doc(db, "utenti", u.uid))).data() || null; } catch (e) { prof = null; }
    utente = { uid: u.uid, email: u.email, nome: prof?.nome || u.email, ruolo: prof?.ruolo || null, attivo: prof?.attivo !== false, fatturazione: prof?.fatturazione === true };
    authListeners.forEach(cb => cb(utente));
  });
}

export function onAuth(cb) {
  authListeners.push(cb);
  if (demo) setTimeout(() => cb(utente), 0);
}

export async function login(email, password) {
  // Demo: un indirizzo che inizia con "anna" entra come utente normale (per provare i permessi)
  // "marco…" entra come utente normale senza fatturazione
  if (demo) { utente = /^anna/i.test(email) ? { uid: "u2", email, nome: "Anna", ruolo: "utente", attivo: true, fatturazione: true }
    : /^marco/i.test(email) ? { uid: "u3", email, nome: "Marco", ruolo: "utente", attivo: true }
    : { uid: "demo", email, nome: "Utente demo", ruolo: "admin", attivo: true }; authListeners.forEach(cb => cb(utente)); return; }
  await fb.signInWithEmailAndPassword(auth, email, password);
}
export async function logout() {
  if (demo) { utente = null; authListeners.forEach(cb => cb(null)); return; }
  await fb.signOut(auth);
}
export async function recuperaPassword(email) {
  if (demo) return;
  await fb.sendPasswordResetEmail(auth, email);
}
export const utenteCorrente = () => utente;
export const isAdmin = ADMIN;
/** Può vedere i report e segnare le fatture: amministratori e chi ha il permesso "fatturazione". */
export const puoFatturare = () => !!utente && (utente.ruolo === "admin" || utente.fatturazione === true);

// ---------- primitive comuni ----------
function nuovoId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const ora = () => new Date().toISOString();

async function lista(col, filtri = []) {
  if (demo) return Object.values(demo[col] || {}).filter(d => filtri.every(([k, , v]) => d[k] === v)).map(x => ({ ...x }));
  const q = fb.query(fb.collection(db, col), ...filtri.map(([k, op, v]) => fb.where(k, op, v)));
  const s = await fb.getDocs(q);
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function leggi(col, id) {
  if (demo) return demo[col]?.[id] ? { ...demo[col][id] } : null;
  const s = await fb.getDoc(fb.doc(db, col, id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
/** Toglie i campi "undefined" (anche annidati): Firestore li rifiuta e il salvataggio fallirebbe. */
function pulisci(v) {
  if (Array.isArray(v)) return v.map(pulisci);
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    const o = {}; for (const [k, x] of Object.entries(v)) if (x !== undefined) o[k] = pulisci(x); return o;
  }
  return v;
}
async function scrivi(col, obj) {
  const id = obj.id || nuovoId();
  const { id: _, ...dati } = pulisci(obj);
  dati.aggiornato = ora();
  dati.aggiornatoDa = utente?.uid || null;
  if (demo) { demo[col] = demo[col] || {}; demo[col][id] = { ...(demo[col][id] || {}), ...dati, id }; return id; }
  await fb.setDoc(fb.doc(db, col, id), dati, { merge: true });
  return id;
}
async function elimina(col, id) {
  if (demo) { delete demo[col]?.[id]; return; }
  await fb.deleteDoc(fb.doc(db, col, id));
}
/** Scrittura a blocchi (max 400 per lotto) per gli import. docs: [{col, id?, ...dati}] */
export async function scriviMolti(docs, avanzamento = () => {}) {
  let fatti = 0;
  for (let i = 0; i < docs.length; i += 400) {
    const parte = docs.slice(i, i + 400);
    if (demo) { for (const d of parte) { const { col, ...r } = d; await scrivi(col, r); } }
    else {
      const b = fb.writeBatch(db);
      for (const d of parte) {
        const { col, id, ...r } = pulisci(d);
        b.set(fb.doc(db, col, id || nuovoId()), { ...r, aggiornato: ora(), aggiornatoDa: utente.uid }, { merge: true });
      }
      await b.commit();
    }
    fatti += parte.length; avanzamento(fatti, docs.length);
  }
}

// ---------- utenti ----------
export const listaUtenti = () => lista("utenti");

/**
 * Crea l'account di un collaboratore (solo amministratori) e gli invia l'email per scegliere la password.
 * Usa una seconda istanza di Firebase, così l'amministratore resta collegato.
 */
export async function creaCollaboratore({ nome, email, ruolo }) {
  if (!ADMIN()) throw new Error("Solo un amministratore può creare utenti");
  if (demo) { const id = "u" + Date.now().toString(36); const occ = Object.values(demo.utenti).map(x => x.colore); demo.utenti[id] = { id, nome, email, ruolo, attivo: true, colore: [1, 2, 3, 4, 5, 6, 7, 8].find(n => !occ.includes(n)) || 1 }; return id; }
  const nomeApp = "creazione-utenti";
  const sec = appMod.getApps().find(x => x.name === nomeApp) || appMod.initializeApp(configFb, nomeApp);
  const secAuth = fb.getAuth(sec);
  const pw = crypto.getRandomValues(new Uint32Array(4)).join("-") + "Aa!";
  const cred = await fb.createUserWithEmailAndPassword(secAuth, email, pw);
  const uid = cred.user.uid;
  await fb.signOut(secAuth);
  const occupati = (await lista("utenti")).filter(x => x.attivo !== false).map(x => x.colore);
  const colore = [1, 2, 3, 4, 5, 6, 7, 8].find(n => !occupati.includes(n)) || 1;
  await scrivi("utenti", { id: uid, nome, email, ruolo, attivo: true, creato: ora(), colore, oreSettimanali: 42, percentuale: 100, pausaStandard: 60, entrataStandard: "08:00" });
  await fb.sendPasswordResetEmail(auth, email);
  return uid;
}
/** Aggiorna nome, ruolo, stato attivo (solo amministratori). */
export const salvaUtente = (u) => scrivi("utenti", u);

// ---------- clienti ----------
export const listaClienti = () => lista("clienti");
export const leggiCliente = (id) => leggi("clienti", id);
export const salvaCliente = (c) => scrivi("clienti", c);
/** Elimina un cliente (solo amministratori), con i suoi dati KYC. Va usato solo per clienti vuoti. */
export async function eliminaCliente(id) { await elimina("clienti", id); await elimina("clienti_kyc", id).catch(() => {}); }
export const leggiKycCliente = (id) => ADMIN() ? leggi("clienti_kyc", id) : Promise.resolve(null);
export const salvaKycCliente = (id, k) => scrivi("clienti_kyc", { ...k, id });
export const listaTuttiKycClienti = () => ADMIN() ? lista("clienti_kyc") : Promise.resolve([]);

// ---------- persone ----------
export const listaPersone = (clienteId) => lista("persone", [["clienteId", "==", clienteId]]);
/** Persone (contatti di società) collegate a un cliente persona fisica per la dichiarazione fiscale privata. */
export const listaPersoneCollegate = (clientePF) => lista("persone", [["clientePF", "==", clientePF]]);
export const salvaPersona = (p) => scrivi("persone", p);
export async function eliminaPersona(id) { await elimina("persone", id); if (ADMIN()) await elimina("persone_kyc", id); }
export const listaTuttePersone = () => lista("persone");
export const listaKycPersone = (clienteId) => ADMIN() ? lista("persone_kyc", [["clienteId", "==", clienteId]]) : Promise.resolve([]);
export const listaTuttiKycPersone = () => ADMIN() ? lista("persone_kyc") : Promise.resolve([]);
export const salvaKycPersona = (id, k) => scrivi("persone_kyc", { ...k, id });

// ---------- registrazioni (ore e diario) ----------
// Un utente normale vede solo le proprie: il filtro è obbligatorio anche per le regole di Firestore.
export function listaRegistrazioni(clienteId) {
  const f = [];
  if (clienteId) f.push(["clienteId", "==", clienteId]);
  if (!ADMIN()) f.push(["autoreUid", "==", utente.uid]);
  return lista("registrazioni", f);
}
/** Registrazioni tra due date (ISO, incluse). Utente normale: solo le proprie (filtro data lato app, nessun indice composto). */
export async function listaRegistrazioniPeriodo(da, a, tutte = false) {
  if (ADMIN() || (tutte && puoFatturare())) {
    if (demo) return (await lista("registrazioni")).filter(r => r.data >= da && r.data <= a);
    const q = fb.query(fb.collection(db, "registrazioni"), fb.where("data", ">=", da), fb.where("data", "<=", a));
    return (await fb.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return (await lista("registrazioni", [["autoreUid", "==", utente.uid]])).filter(r => r.data >= da && r.data <= a);
}
export const eliminaRegistrazione = (id) => elimina("registrazioni", id);
/** Aggiorna solo alcuni campi (es. fatturataIl, voceFattura) di più registrazioni: per chi fattura. */
export async function aggiornaRegistrazioni(ids, campi) {
  await scriviMolti(ids.map(id => ({ col: "registrazioni", id, ...campi })));
}

// ---------- spese (da riaddebitare ai clienti o a carico dello studio) ----------
// La ricevuta (immagine compressa) sta in "ricevute/{id spesa}" e si legge solo quando la si apre.
export async function listaSpese(da = "2000-01-01", a = "2999-12-31") {
  const l = puoFatturare() ? await lista("spese") : await lista("spese", [["autoreUid", "==", utente.uid]]);
  return l.filter(x => x.data >= da && x.data <= a);
}
export const salvaSpesa = (x) => scrivi("spese", { autoreUid: utente.uid, autoreNome: utente.nome, ...x });
export async function eliminaSpesa(id) { await elimina("ricevute", id).catch(() => {}); await elimina("spese", id); }
export async function aggiornaSpese(ids, campi) { await scriviMolti(ids.map(id => ({ col: "spese", id, ...campi }))); }
export const leggiRicevuta = (id) => leggi("ricevute", id);
export const salvaRicevuta = (id, r) => scrivi("ricevute", { ...r, id });
export const eliminaRicevuta = (id) => elimina("ricevute", id);

// ---------- fatture dei forfait (stato per cliente, mandato e periodo) ----------
export const listaFatture = () => lista("fatture");
export const salvaFattura = (f) => scrivi("fatture", f);
export const eliminaFattura = (id) => elimina("fatture", id);
export const salvaRegistrazione = (r) => scrivi("registrazioni", { autoreUid: utente.uid, autoreNome: utente.nome, ...r });

// ---------- compiti ----------
export async function listaCompiti(clienteId) {
  const base = clienteId ? [["clienteId", "==", clienteId]] : [];
  if (ADMIN()) return lista("compiti", base);
  // i propri + tutti quelli visibili allo studio (le deleghe di tutti); i privati degli altri no
  const [a, b, c] = await Promise.all([
    lista("compiti", [...base, ["assegnatoUid", "==", utente.uid]]),
    lista("compiti", [...base, ["autoreUid", "==", utente.uid]]),
    lista("compiti", [...base, ["visibilita", "==", "studio"]]).catch(() => [])
  ]);
  const m = new Map([...a, ...b, ...c].map(x => [x.id, x]));
  return [...m.values()];
}
export const eliminaCompito = (id) => elimina("compiti", id);
export const salvaCompito = (c) => scrivi("compiti", { ...(c.id ? {} : { visibilita: "studio" }), autoreUid: utente.uid, ...c });

// ---------- scadenze (solo lo stato: le scadenze si calcolano dalle regole) ----------
/** Stati salvati delle scadenze con data originale negli anni indicati. Visibili a tutti gli utenti attivi. */
export async function listaScadenzeSalvate(anni) {
  if (demo) return (await lista("scadenze")).filter(x => anni.includes(x.anno));
  const q = fb.query(fb.collection(db, "scadenze"), fb.where("anno", "in", anni));
  return (await fb.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
}
export const salvaScadenza = (s) => scrivi("scadenze", s);

// ---------- presenze (art. 73b OLL 1: durata giornaliera del lavoro) ----------
// id = uid_data. Un utente normale vede e scrive solo le proprie (filtro data lato app, nessun indice composto).
export async function listaPresenze(uid, da, a) {
  return (await lista("presenze", [["uid", "==", uid]])).filter(p => p.data >= da && p.data <= a);
}
/** Tutte le presenze dello studio nel periodo (solo amministratori). */
export async function listaPresenzeStudio(da, a) {
  if (!ADMIN()) return [];
  if (demo) return (await lista("presenze")).filter(p => p.data >= da && p.data <= a);
  const q = fb.query(fb.collection(db, "presenze"), fb.where("data", ">=", da), fb.where("data", "<=", a));
  return (await fb.getDocs(q)).docs.map(d => ({ id: d.id, ...d.data() }));
}
export const salvaPresenza = (p) => scrivi("presenze", { ...p, id: `${p.uid}_${p.data}` });
export const eliminaPresenza = (uid, data) => elimina("presenze", `${uid}_${data}`);
export const leggiProfilo = (uid) => leggi("utenti", uid);
/** Profilo orario di un collaboratore (solo amministratori). */
export const salvaProfilo = (uid, dati) => scrivi("utenti", { ...dati, id: uid });

// ---------- pratiche amministrative (fuori mandato; visibili a tutti gli utenti attivi) ----------
export const listaPratiche = (clienteId) => lista("pratiche", clienteId ? [["clienteId", "==", clienteId]] : []);
export const salvaPratica = (p) => scrivi("pratiche", p);
export const eliminaPratica = (id) => elimina("pratiche", id);

// ---------- vacanze (visibili a tutti; ognuno chiede le proprie, l'amministratore approva) ----------
export const listaVacanze = () => lista("vacanze");
export const salvaVacanza = (v) => scrivi("vacanze", v);
export const eliminaVacanza = (id) => elimina("vacanze", id);

// ---------- dati demo (inventati) ----------
function creaDemo() {
  const oggiPiu = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const t = new Date(), oggi = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const c = (id, codice, rs, forma, extra = {}) => [id, { id, codice, ragioneSociale: rs, forma, stato: "Attivo", responsabile: "Utente demo",
    servizi: { contabilita: true, iva: true, dichiarazione: true, stipendi: true, avsLainfIpg: true, lpp: true }, iva: { regime: "Effettivo", periodicita: "Trimestrale" }, giornoPaga: 25, mandato: { tipo: "Contabilità e fiscale", stato: "Da aggiornare", aggiornareEntro: "2026-12-31" }, ...extra }];
  const clienti = Object.fromEntries([
    c("d1", "C001", "Alfa Servizi SA", "SA", { localita: "Lugano", cantone: "TI", mandati: {
      contabilita: { attivo: true, stato: "Da aggiornare", aggiornareEntro: "2026-12-31", budget: 2200, budgetOre: 15 },
      funzione: { attivo: true, stato: "Firmato aggiornato", dataFirma: "2025-05-01", budget: 3000, funzioni: [{ ruolo: "Amministratore unico", persona: "Utente demo", firma: "Collettiva a due" }] },
      domiciliazione: { attivo: true, stato: "Mancante", aggiornareEntro: "2026-12-31", budget: 1200, tipo: "Recapito c/o" },
      intestazione: { attivo: true, stato: "Firmato aggiornato", budget: 1500, tipoTitoli: "Azioni", numero: 100, valoreNominale: 1000, percentuale: 100, intestatario: "Studio demo SA", contratto: "Firmato", iscrizione: "Libro delle azioni aggiornato" } } }),
    c("d2", "C002", "Beta Consulenze Sagl", "Sagl", { responsabile: "Anna", localita: "Bellinzona", cantone: "TI", mandati: {
      contabilita: { attivo: true, stato: "Firmato aggiornato", dataFirma: "2026-03-01", budget: 4000, budgetOre: 25, fatturazione: "Trimestrale" } } }),
    c("d3", "C003", "Gamma Costruzioni SA", "SA", { localita: "Mendrisio", cantone: "TI", revisione: true, mandati: {
      contabilita: { attivo: true, stato: "Da aggiornare", aggiornareEntro: "2026-12-31", budget: 1800 },
      domiciliazione: { attivo: true, stato: "Firmato aggiornato", budget: 900, tipo: "Domicilio con ufficio proprio" } } }),
    ["d4", { id: "d4", codice: "C004", ragioneSociale: "Rossi Laura", forma: "Persona fisica", stato: "Attivo", responsabile: "Anna", localita: "Lugano", cantone: "TI",
      servizi: { dichiarazione: true }, mandati: { contabilita: { attivo: true, stato: "Firmato aggiornato", budget: 450 } },
      df: { nascita: "1978-04-12", statoCivile: "Coniugato/a", comune: "Lugano", tassazione: "Ordinaria", attivita: "Dipendente", coniuge: { nome: "Rossi Marco", attivita: "Indipendente" },
        figli: [{ nome: "Giulia", nascita: "2012-09-01", situazione: "A carico, a scuola" }], documenti: { salario: true, conti: true, immobili: true, pilastro3a: true, cassaMalati: true } } }],
    ["d0", { id: "d0", codice: "C000", ragioneSociale: "Clienti occasionali", forma: "Altro", stato: "Attivo", servizi: {}, mandato: {} }]
  ]);
  return {
    clienti,
    clienti_kyc: { d1: { id: "d1", stato: "Da aggiornare", rischio: "Medio", prossimaRevisione: "2026-12-15" } },
    persone: {
      p1: { id: "p1", clienteId: "d1", cognome: "Esempio", nome: "Mario", ruolo: "Socio e amministratore", principale: true, email: "mario@example.com", telefono: "+41 79 000 00 00", canale: "Email", lingua: "Italiano" },
      p2: { id: "p2", clienteId: "d1", cognome: "Prova", nome: "Lucia", ruolo: "Contatto contabilità", principale: false, email: "lucia@example.com", canale: "WhatsApp", lingua: "Italiano" }
    },
    persone_kyc: { p1: { id: "p1", clienteId: "d1", nazionalita: "Italia", domicilio: "Italia", tipoDocumento: "Passaporto", scadenzaDocumento: "2026-12-20", copiaArchivio: true } },
    registrazioni: {
      // ore della settimana scorsa, per provare la Dashboard (circa l'85% della presenza)
      ...Object.fromEntries([-1, -2, -3, -4, -5, -6, -7].map(n => oggiPiu(n)).filter(d => { const g = new Date(d + "T12:00:00").getDay(); return g > 0 && g < 6; })
        .flatMap((d, i) => [
          ["demo", "Utente demo", [["d1", 150, true, "contabilita"], ["d2", 120, true, "contabilita"], ["d1", 60, true, "funzione"], ["d3", 45, false, "contabilita"], ["d0", 30, false, null]]],
          ["u2", "Anna", [["d2", 120, true, "contabilita"], ["d3", 60 + (i % 2) * 60, true, "domiciliazione"], ["d1", 15, false, "contabilita"]]]
        ].flatMap(([uid, nome, voci]) => i === 2 && uid === "demo" ? [] : voci.map(([cli, min, fat, mand], j) => [`g_${uid}_${d}_${j}`,
          { id: `g_${uid}_${d}_${j}`, clienteId: cli, data: d, minuti: min - (i === 4 && uid === "demo" ? 30 : 0), fatturabile: fat, tipo: "lavoro", mandato: mand, descrizione: "Lavoro di esempio", autoreUid: uid, autoreNome: nome }])))),
      r6: { id: "r6", clienteId: "d1", data: oggiPiu(-4), minuti: 75, fatturabile: true, extra: true, tipo: "lavoro", mandato: "contabilita", descrizione: "allora ho guardato con il cliente la questione del leasing della macchina nuova e abbiamo deciso di fare il contratto a nome della società, poi ho preparato la lettera per la banca", autoreUid: "demo", autoreNome: "Utente demo" },
      r7: { id: "r7", clienteId: "d2", data: "2026-09-20", minuti: 600, fatturabile: true, tipo: "lavoro", mandato: "contabilita", descrizione: "Contabilità luglio-settembre", autoreUid: "u2", autoreNome: "Anna" },
      r8: { id: "r8", clienteId: "d1", data: "2026-08-12", minuti: 180, fatturabile: true, fatturataIl: "2026-10-05", fatturaRif: "d1_contabilita_2026-T3", tipo: "lavoro", mandato: "contabilita", descrizione: "Contabilità trimestre", autoreUid: "demo", autoreNome: "Utente demo" },
      r5: { id: "r5", clienteId: "d2", praticaId: "pr2", data: oggiPiu(-3), minuti: 60, fatturabile: true, tipo: "lavoro", descrizione: "Preparata richiesta di rateizzazione", autoreUid: "u2", autoreNome: "Anna" },
      r1: { id: "r1", clienteId: "d1", data: "2026-11-10", minuti: 45, fatturabile: true, tipo: "lavoro", descrizione: "Contabilità ottobre", autoreUid: "demo", autoreNome: "Utente demo" },
      r3: { id: "r3", clienteId: "d2", data: oggi, minuti: 90, fatturabile: true, tipo: "lavoro", descrizione: "Rendiconto IVA Q3", autoreUid: "demo", autoreNome: "Utente demo", creato: "1" },
      r4: { id: "r4", clienteId: "d3", data: oggi, minuti: 30, fatturabile: false, tipo: "lavoro", descrizione: "Telefonata di cortesia", autoreUid: "demo", autoreNome: "Utente demo", creato: "2" },
      r2: { id: "r2", clienteId: "d1", data: "2026-11-12", minuti: 0, fatturabile: false, tipo: "nota", descrizione: "Deciso di passare alla contabilità mensile", autoreUid: "demo", autoreNome: "Utente demo" }
    },
    compiti: {
      k1: { id: "k1", clienteId: "d1", titolo: "Aggiornare mandato", tipo: "Pratica amministrativa", stato: "Da fare", scadenza: "2026-12-31", visibilita: "studio", autoreUid: "demo", assegnatoUid: "demo", assegnatoNome: "Utente demo", aggiornato: new Date().toISOString() },
      k2: { id: "k2", clienteId: "d2", titolo: "Reclamo tassazione 2024", tipo: "Reclamo fiscale", stato: "Preso in carico", scadenza: oggiPiu(3), visibilita: "studio", autoreUid: "demo", assegnatoUid: "u2", assegnatoNome: "Anna", aggiornato: new Date().toISOString() },
      k3: { id: "k3", clienteId: "d3", titolo: "Estratto conto AVS richiesto", tipo: "Attesa riscontro", stato: "In attesa riscontro", scadenza: oggiPiu(-2), visibilita: "studio", autoreUid: "demo", assegnatoUid: "demo", assegnatoNome: "Utente demo", aggiornato: "2026-10-20T09:00:00Z" },
      k4: { id: "k4", clienteId: null, titolo: "Rinnovo licenza software", tipo: "Richiesta interna", stato: "In attesa", motivoAttesa: "Attendo preventivo fornitore", scadenza: oggiPiu(20), visibilita: "studio", autoreUid: "demo", assegnatoUid: "demo", assegnatoNome: "Utente demo", aggiornato: "2026-11-01T09:00:00Z",
        cronologia: [{ quando: "2026-11-01T09:00:00Z", nome: "Utente demo", testo: "Chiesto preventivo" }] }
    },
    presenze: Object.fromEntries([-1, -2, -3, -4, -5, -6, -7].map(n => oggiPiu(n)).filter(d => { const g = new Date(d + "T12:00:00").getDay(); return g > 0 && g < 6; })
      .flatMap((d, i) => [[`demo_${d}`, { id: `demo_${d}`, uid: "demo", nome: "Utente demo", data: d, ...(i === 2 ? { minuti: null, assenza: "Vacanza" } : { entrata: 480, pausa: 60, uscita: 540 + 480 + i * 15, minuti: 480 + i * 15, assenza: "" }) }],
        [`u2_${d}`, { id: `u2_${d}`, uid: "u2", nome: "Anna", data: d, entrata: 510, pausa: 0, uscita: 762, minuti: 252 }]])),
    pratiche: {
      pr1: { id: "pr1", clienteId: "d1", titolo: "Assegni figli per Mario Esempio", tipo: "Assegni familiari", ente: "Cassa assegni familiari", fase: "In attesa dell'ente",
        apertaIl: oggiPiu(-40), inviataIl: oggiPiu(-35), prossimoControllo: oggiPiu(-3), concludereEntro: oggiPiu(20), solleciti: 0, responsabileUid: "demo", responsabileNome: "Utente demo",
        fatturazione: { modo: "Forfait", importo: 250, stato: "Da fatturare" },
        passi: [{ quando: oggiPiu(-40) + "T09:00:00Z", nome: "Utente demo", testo: "Pratica aperta", fase: "In preparazione" }, { quando: oggiPiu(-35) + "T09:00:00Z", nome: "Utente demo", testo: "Richiesta inviata all'ente", fase: "In attesa dell'ente" }] },
      pr2: { id: "pr2", clienteId: "d2", titolo: "Rateizzazione imposte 2025", tipo: "Rateizzazione imposte", ente: "Ufficio esazione e condoni", fase: "Documenti richiesti",
        apertaIl: oggiPiu(-20), inviataIl: oggiPiu(-18), prossimoControllo: oggiPiu(2), solleciti: 0, responsabileUid: "u2", responsabileNome: "Anna", fatturazione: { modo: "A ore", stato: "Da fatturare" },
        passi: [{ quando: oggiPiu(-20) + "T09:00:00Z", nome: "Anna", testo: "Pratica aperta", fase: "In preparazione" }, { quando: oggiPiu(-3) + "T09:00:00Z", nome: "Anna", testo: "Chiesti estratti conto degli ultimi 3 mesi", fase: "Documenti richiesti" }] },
      pr3: { id: "pr3", clienteId: "d3", titolo: "Estratto conto individuale AVS", tipo: "Estratto conto individuale AVS", ente: "Cassa AVS", fase: "Conclusa", apertaIl: oggiPiu(-60), conclusaIl: oggiPiu(-5),
        solleciti: 1, responsabileUid: "demo", responsabileNome: "Utente demo", fatturazione: { modo: "Forfait", importo: 120, stato: "Da fatturare" }, passi: [] }
    },
    spese: {
      s1: { id: "s1", clienteId: "d1", data: oggiPiu(-3), categoria: "pasto", descrizione: "Pranzo di lavoro con il CdA", importo: 86.5, riaddebito: true, autoreUid: "demo", autoreNome: "Utente demo" },
      s2: { id: "s2", clienteId: "d1", data: oggiPiu(-2), categoria: "posta", descrizione: "Raccomandata all'Ufficio di tassazione", importo: 6.5, riaddebito: true, autoreUid: "u2", autoreNome: "Anna", anticipataDa: "u2", anticipataNome: "Anna" },
      s3: { id: "s3", clienteId: "d2", data: oggiPiu(-6), categoria: "trasferta", descrizione: "Lugano – Bellinzona e ritorno, riunione", km: 56, importo: 42, riaddebito: true, autoreUid: "demo", autoreNome: "Utente demo" },
      s4: { id: "s4", clienteId: "d2", data: oggiPiu(-6), categoria: "emolumenti", descrizione: "Estratto del registro di commercio", importo: 50, riaddebito: true, autoreUid: "demo", autoreNome: "Utente demo" }
    },
    vacanze: {
      v1: { id: "v1", uid: "u2", nome: "Anna", dal: oggiPiu(8), al: oggiPiu(15), tipo: "Vacanza", stato: "Approvata", creato: "2026-11-01T09:00:00Z" },
      v2: { id: "v2", uid: "u3", nome: "Marco", dal: oggiPiu(3), al: oggiPiu(4), tipo: "Vacanza", stato: "Richiesta", creato: "2026-11-10T09:00:00Z" },
      v3: { id: "v3", uid: "demo", nome: "Utente demo", dal: "2026-12-24", al: "2026-12-31", tipo: "Vacanza", stato: "Approvata", creato: "2026-10-01T09:00:00Z" }
    },
    scadenze: {
      "d1_contabilita_2026-09": { id: "d1_contabilita_2026-09", clienteId: "d1", servizio: "contabilita", periodo: "2026-09", anno: 2026, stato: "Fatto", fattoIl: oggi, fattoDa: "Utente demo" },
      "d2_dichiarazione_2025": { id: "d2_dichiarazione_2025", clienteId: "d2", servizio: "dichiarazione", periodo: "2025", anno: 2026, stato: "Prorogato", nuovaData: oggiPiu(12),
        cronologia: [{ quando: "2026-06-20T09:00:00Z", nome: "Utente demo", testo: "Proroga concessa con lettera del 18.06.2026" }] },
      "d3_iva_2026-T3": { id: "d3_iva_2026-T3", clienteId: "d3", servizio: "iva", periodo: "2026-T3", anno: 2026, stato: "In attesa cliente", note: "Mancano estratti conto" }
    },
    utenti: { demo: { id: "demo", nome: "Utente demo", ruolo: "admin", oreSettimanali: 42, percentuale: 100, accordo73b: "2026-11-02", giorniVacanza: 25, inizioPresenze: oggiPiu(-7) },
      u2: { id: "u2", nome: "Anna", ruolo: "utente", fatturazione: true, oreSettimanali: 42, percentuale: 80, giorniLavoro: [0, 1, 2, 3], giorniVacanza: 25, pausaStandard: 0, inizioPresenze: oggiPiu(-7) }, u3: { id: "u3", nome: "Marco", ruolo: "utente" } }
  };
}
