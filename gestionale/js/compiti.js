// Modulo Compiti e deleghe.
// Tre colonne: Assegnati → Presi in carico → In attesa (con appunti e richiesta di aiuto). Quando è fatto, sparisce.
// Tre punti di vista: assegnati a me, delegati da me (per seguire chi lavora), tutto lo studio (amministratori).
import * as D from "./data.js";
import { e, avviso, stato, campo, leggiForm, dataNonValida } from "./ui.js";
import { parseData } from "./regole.js";
import { fmtData, giorniA, giorniDa, normNome, urgenzaCompito, aperto, STATI_COMPITO, CATEGORIE_COMPITO, GIORNI_FERMO,
  PRIORITA, rangoPriorita, colonnaCompito, statoRichieste, CONTROPARTI, GIORNI_RICHIESTA, tipoPraticaDa, oggiISO, aggiungiGiorni, praticaAperta } from "./regole.js";
import { nuovaPraticaDa, apriPratica } from "./pratiche.js";

let vista = "colonne";     // colonne | elenco
let ambito = "miei";       // miei | delegati | studio
let filtroChi = "";        // in "studio": uid di un collaboratore
let cerca = "";
let mostraFatti = false;

const ETICHETTA_URG = { scaduto: "Scaduto", urgente: "Entro 5 giorni", fermo: `Fermo da ${GIORNI_FERMO}+ giorni` };
const COLONNE = [["assegnato", "Assegnati", "Da prendere in carico"], ["carico", "Presi in carico", "Ci sto lavorando"], ["attesa", "In attesa", "Fermi: appunti, riscontri, aiuto"]];

export async function vistaCompiti(el, clienteFiltro) {
  const admin = D.isAdmin(), u = D.utenteCorrente();
  const [compiti, clienti, utenti, pratiche] = await Promise.all([D.listaCompiti(clienteFiltro || null), D.listaClienti(), D.listaUtenti().catch(() => []), D.listaPratiche().catch(() => [])]);
  const praticaPer = Object.fromEntries(pratiche.map(p => [p.id, p]));
  const nomeCli = Object.fromEntries(clienti.map(c => [c.id, `${c.codice} · ${c.ragioneSociale}`]));
  const persone = utenti.filter(x => x.attivo !== false && x.ruolo).map(x => ({ uid: x.id, nome: x.nome || x.id }));
  if (!persone.some(p => p.uid === u.uid)) persone.push({ uid: u.uid, nome: u.nome });
  const nomeDi = uid => persone.find(p => p.uid === uid)?.nome || "";
  if (ambito === "studio" && !admin) ambito = "miei";

  const visibile = k => !(k.visibilita === "privato" && k.autoreUid !== u.uid && k.assegnatoUid !== u.uid);
  const mio = k => k.assegnatoUid === u.uid || (!k.assegnatoUid && k.autoreUid === u.uid);
  const delegato = k => k.autoreUid === u.uid && k.assegnatoUid && k.assegnatoUid !== u.uid;
  const nell = { miei: mio, delegati: delegato, studio: k => !filtroChi || k.assegnatoUid === filtroChi };
  const q = normNome(cerca);
  const base = compiti.filter(k => visibile(k) && (!q || normNome(`${k.titolo} ${nomeCli[k.clienteId] || ""} ${k.tipo} ${k.assegnatoNome || ""}`).includes(q)));
  const conta = a => base.filter(k => aperto(k) && nell[a](k)).length;
  const visibili = base.filter(nell[ambito]);
  const aperti = visibili.filter(aperto);
  const fatti = visibili.filter(k => !aperto(k)).sort((a, b) => String(b.completatoIl || b.aggiornato || "").localeCompare(String(a.completatoIl || a.aggiornato || ""))).slice(0, 30);
  const ordina = (a, b) => (b.aiuto ? 1 : 0) - (a.aiuto ? 1 : 0) || rangoPriorita(a) - rangoPriorita(b) || (a.scadenza || "9999").localeCompare(b.scadenza || "9999");
  const nuovi = base.filter(k => aperto(k) && mio(k) && k.autoreUid !== u.uid && (k.stato || "Da fare") === "Da fare").length;
  const aiuti = base.filter(k => aperto(k) && k.aiuto && (delegato(k) || (admin && !mio(k)))).length;
  const allarmi = { scaduto: 0, urgente: 0 };
  aperti.forEach(k => { const g = urgenzaCompito(k); if (g in allarmi) allarmi[g]++; });
  const daSoll = aperti.reduce((n, k) => n + statoRichieste(k).daSollecitare, 0);

  el.innerHTML = `
  <div class="testata">
    <div><h1>Compiti${clienteFiltro ? ` · ${e(nomeCli[clienteFiltro] || "")}` : ""}</h1><div class="tenue">${aperti.length} aperti</div></div>
    <div class="barra">
      <input type="search" id="cerca-k" placeholder="Cerca" value="${e(cerca)}" aria-label="Cerca compito">
      <div class="segmenti" role="radiogroup" aria-label="Vista"><button type="button" role="radio" data-v="colonne" aria-checked="${vista === "colonne"}">Colonne</button><button type="button" role="radio" data-v="elenco" aria-checked="${vista === "elenco"}">Elenco</button></div>
      <button class="btn primario" id="nuovo-k">Nuovo compito</button>
    </div>
  </div>
  <div class="barra" style="margin-bottom:14px">
    <div class="segmenti grandi" role="radiogroup" aria-label="Quali compiti">
      <button type="button" role="radio" data-a="miei" aria-checked="${ambito === "miei"}">Assegnati a me <span class="conta">${conta("miei")}</span></button>
      <button type="button" role="radio" data-a="delegati" aria-checked="${ambito === "delegati"}">Delegati da me <span class="conta">${conta("delegati")}</span></button>
      ${admin ? `<button type="button" role="radio" data-a="studio" aria-checked="${ambito === "studio"}">Tutto lo studio <span class="conta">${conta("studio")}</span></button>` : ""}
    </div>
    ${ambito === "studio" ? `<select id="chi-k" aria-label="Collaboratore"><option value="">Tutti</option>${persone.map(p => `<option value="${e(p.uid)}"${filtroChi === p.uid ? " selected" : ""}>${e(p.nome)}</option>`).join("")}</select>` : ""}
    <div class="segnali" style="margin-left:auto">
      ${nuovi ? stato("info", `${nuovi} ${nuovi === 1 ? "nuovo assegnato" : "nuovi assegnati"} a te`) : ""}
      ${aiuti ? `<span class="stato aiuto">🙋 ${aiuti} ${aiuti === 1 ? "richiesta" : "richieste"} di aiuto</span>` : ""}
      ${daSoll ? stato("scaduto", `📨 ${daSoll} ${daSoll === 1 ? "richiesta" : "richieste"} da sollecitare`) : ""}
      ${allarmi.scaduto ? stato("scaduto", `${allarmi.scaduto} ${allarmi.scaduto === 1 ? "scaduto" : "scaduti"}`) : ""}
      ${allarmi.urgente ? stato("urgente", `${allarmi.urgente} entro 5 giorni`) : ""}
    </div>
  </div>
  <div id="corpo-k"></div>`;

  const corpo = el.querySelector("#corpo-k");
  const azioniRapide = k => {
    if (!aperto(k)) return "";
    // solo chi ha il compito lo sposta tra le colonne; chi l'ha delegato lo segue e risponde alle richieste di aiuto
    if (k.assegnatoUid !== u.uid) return k.aiuto ? `<div class="azioni-k"><button type="button" class="btn piccolo primario" data-az="aiuto">Rispondi</button></div>` : "";
    const c = colonnaCompito(k), b = [];
    if (c === "assegnato") b.push(`<button type="button" class="btn piccolo primario" data-az="carico">▶ Prendo in carico</button>`);
    if (c === "carico") b.push(`<button type="button" class="btn piccolo" data-az="attesa">⏸ In attesa</button>`);
    if (c === "attesa") b.push(`<button type="button" class="btn piccolo" data-az="carico">▶ Riprendo</button>`);
    if (c !== "assegnato") b.push(`<button type="button" class="btn piccolo" data-az="richiesta" title="Documenti o informazioni chiesti a cliente, banca, uffici">📨 Richiesta</button>`);
    if (c !== "assegnato") b.push(`<button type="button" class="btn piccolo" data-az="fatto">✓ Fatto</button>`);
    return `<div class="azioni-k">${b.join("")}</div>`;
  };
  const scheda = (k) => {
    const g = urgenzaCompito(k), gs = giorniA(k.scadenza), pr = k.priorita || "normale";
    const daAltri = k.autoreUid && k.autoreUid !== k.assegnatoUid;
    const chi = ambito === "miei" ? (daAltri ? `da ${e(nomeDi(k.autoreUid) || "altri")}` : "") : `→ ${e(k.assegnatoNome || nomeDi(k.assegnatoUid))}${daAltri && ambito === "studio" ? ` <span class="tenue">(da ${e(nomeDi(k.autoreUid))})</span>` : ""}`;
    const nuovo = mio(k) && daAltri && (k.stato || "Da fare") === "Da fare" && aperto(k);
    return `<article class="compito pr-${pr} ${g || ""}" data-id="${e(k.id)}" tabindex="0">
      <div class="testa"><strong>${e(k.titolo)}</strong><span class="etich">${pr !== "normale" ? `<span class="prio ${pr}">${pr === "urgente" ? "Urgente" : "Importante"}</span>` : ""}${nuovo ? stato("info", "Nuovo") : ""}</span></div>
      <div class="tenue">${[k.clienteId ? e(nomeCli[k.clienteId] || "") : "Interno studio", chi].filter(Boolean).join(" · ")}</div>
      ${k.aiuto ? `<div class="aiuto-k">🙋 Chiede aiuto${k.aiutoTesto ? `: ${e(k.aiutoTesto)}` : ""}</div>` : ""}
      ${richiesteCard(k)}
      ${k.praticaId ? (() => { const pr = praticaPer[k.praticaId]; return `<div class="prat-k">📁 Pratica: <a href="#" data-prat="${e(k.praticaId)}">${e(pr?.titolo || k.praticaTitolo || "apri")}</a>${pr ? ` · ${e(pr.fase)}` : ""}${pr && !praticaAperta(pr) && aperto(k) ? ` · <strong>conclusa: puoi chiudere il compito</strong>` : ""}</div>`; })() : ""}
      ${colonnaCompito(k) === "attesa" && !k.attesaPerRichieste && (k.appuntiFatto || k.motivoAttesa) ? `<div class="motivo">${k.appuntiFatto ? `<div><b>Fatto:</b> ${e(k.appuntiFatto)}</div>` : ""}${k.motivoAttesa ? `<div><b>${k.stato === "In attesa riscontro" ? "Attende" : "Manca"}:</b> ${e(k.motivoAttesa)}</div>` : ""}</div>` : ""}
      <div class="piede">${k.scadenza ? `<span${g === "scaduto" ? ' class="rosso"' : ""}>Entro ${e(fmtData(k.scadenza))}${aperto(k) && gs != null ? ` (${gs < 0 ? `${-gs} giorni fa` : gs === 0 ? "oggi" : `tra ${gs} giorni`})` : ""}</span>` : "<span>Senza scadenza</span>"}
        ${g === "fermo" ? stato("neutro", ETICHETTA_URG.fermo) : ""}${vista === "elenco" ? stato(k.stato === "Fatto" ? "ok" : "neutro", k.stato || "Da fare") : ""}${k.visibilita === "privato" ? '<span class="tenue">· privato</span>' : ""}</div>
      ${azioniRapide(k)}
    </article>`;
  };

  function richiesteCard(k) {
    const st = statoRichieste(k); if (!st.tot) return "";
    const aperte = (k.richieste || []).filter(x => !x.ricevutaIl);
    return `<div class="rich-k${st.daSollecitare ? " soll" : ""}">📨 ${st.ricevute} di ${st.tot} ricevute${st.daSollecitare ? ` · <strong>${st.daSollecitare} da sollecitare</strong>` : ""}
      ${aperte.length ? `<ul>${aperte.map(x => `<li${x.sollecitareIl && x.sollecitareIl <= oggiISO() ? ' class="rosso"' : ""}>${e(x.a)}: ${e(x.cosa)}${x.sollecitareIl ? ` <span class="tenue">· sollecito ${e(fmtData(x.sollecitareIl))}</span>` : ""}</li>`).join("")}</ul>` : ""}</div>`;
  }
  const vuotoTesto = ambito === "delegati" ? "Non hai delegato compiti ancora aperti. Per delegare: Nuovo compito → Assegna a." : "Nessun compito aperto.";
  if (vista === "colonne") {
    corpo.innerHTML = `<div class="colonne-k">${COLONNE.map(([c, n, sotto]) => {
      const l = aperti.filter(k => colonnaCompito(k) === c).sort(ordina);
      return `<section class="colonna col-${c}"><h2>${e(n)} <span class="tenue">${l.length}</span></h2><div class="tenue sotto">${e(sotto)}</div>${l.map(scheda).join("") || '<div class="tenue" style="padding:8px">Nessuno</div>'}</section>`;
    }).join("")}</div>
    ${aperti.length ? "" : `<div class="pannello vuoto" style="margin-top:12px">${e(vuotoTesto)}</div>`}`;
  } else {
    const gruppi = [["Con richiesta di aiuto", aperti.filter(k => k.aiuto)], ["Urgenti", aperti.filter(k => !k.aiuto && k.priorita === "urgente")],
      ["Scaduti", aperti.filter(k => !k.aiuto && k.priorita !== "urgente" && urgenzaCompito(k) === "scaduto")],
      ["Importanti", aperti.filter(k => !k.aiuto && k.priorita === "importante" && urgenzaCompito(k) !== "scaduto")],
      ["Altri aperti", aperti.filter(k => !k.aiuto && !["urgente", "importante"].includes(k.priorita) && urgenzaCompito(k) !== "scaduto")]];
    corpo.innerHTML = gruppi.filter(([, l]) => l.length).map(([n, l]) => `<section class="gruppo-k"><h2>${e(n)} <span class="tenue">${l.length}</span></h2><div class="elenco-k">${l.sort(ordina).map(scheda).join("")}</div></section>`).join("")
      || `<div class="pannello vuoto">${e(vuotoTesto)}</div>`;
  }
  if (fatti.length) corpo.insertAdjacentHTML("beforeend", `<section class="gruppo-k" style="margin-top:16px"><button type="button" class="btn" id="fatti-k">${mostraFatti ? "Nascondi" : "Mostra"} i fatti di recente (${fatti.length})</button>
    ${mostraFatti ? `<div class="elenco-k" style="margin-top:10px">${fatti.map(scheda).join("")}</div>` : ""}</section>`);

  const ricarica = () => vistaCompiti(el, clienteFiltro);
  el.querySelector("#cerca-k").addEventListener("change", ev => { cerca = ev.target.value; ricarica(); });
  el.querySelector("#chi-k")?.addEventListener("change", ev => { filtroChi = ev.target.value; ricarica(); });
  el.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => { vista = b.dataset.v; ricarica(); }));
  el.querySelectorAll("[data-a]").forEach(b => b.addEventListener("click", () => { ambito = b.dataset.a; ricarica(); }));
  el.querySelector("#fatti-k")?.addEventListener("click", () => { mostraFatti = !mostraFatti; ricarica(); });
  el.querySelector("#nuovo-k").addEventListener("click", () => cassettoCompito({ clienteId: clienteFiltro || null, stato: "Da fare", visibilita: "studio", priorita: "normale",
    assegnatoUid: ambito === "delegati" ? "" : u.uid, assegnatoNome: ambito === "delegati" ? "" : u.nome }, clienti, nomeCli, persone, ricarica));
  const trova = id => compiti.find(x => x.id === id);
  corpo.addEventListener("click", ev => {
    const lp = ev.target.closest("[data-prat]"); if (lp) { ev.preventDefault(); ev.stopPropagation(); apriPratica(lp.dataset.prat); return; }
    const a = ev.target.closest(".compito"); if (!a) return;
    const k = trova(a.dataset.id); if (!k) return;
    const az = ev.target.closest("[data-az]");
    if (!az) return cassettoCompito(k, clienti, nomeCli, persone, ricarica);
    ev.stopPropagation();
    if (az.dataset.az === "attesa") return finestraAttesa(k, ricarica);
    if (az.dataset.az === "aiuto") return cassettoCompito(k, clienti, nomeCli, persone, ricarica);
    if (az.dataset.az === "richiesta") return cassettoCompito(k, clienti, nomeCli, persone, ricarica, { richiesta: true });
    cambiaStato(k, az.dataset.az === "fatto" ? "Fatto" : "Preso in carico", ricarica);
  });
  corpo.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.classList.contains("compito")) { const k = trova(ev.target.dataset.id); if (k) cassettoCompito(k, clienti, nomeCli, persone, ricarica); } });
}

/** Salvataggio con messaggio chiaro se non riesce (es. permessi). */
async function salvaSicuro(dati) {
  try { await D.salvaCompito(dati); return true; }
  catch (err) {
    const perm = /permission|insufficient/i.test(String(err?.code || err?.message || err));
    avviso(perm ? "Non salvato: il tuo utente non ha il permesso (controlla di aver pubblicato le regole aggiornate in Firebase)" : "Non salvato: " + (err?.message || err));
    console.error(err); return false;
  }
}

async function cambiaStato(k, nuovo, ricarica) {
  const u = D.utenteCorrente(), ora = new Date().toISOString();
  const cron = [...(k.cronologia || []), { quando: ora, nome: u.nome, testo: `${k.stato || "Da fare"} → ${nuovo}` }];
  const ok = await salvaSicuro({ id: k.id, autoreUid: k.autoreUid, stato: nuovo, cronologia: cron, attesaPerRichieste: false,
    ...(nuovo === "Fatto" ? { completatoIl: ora, aiuto: false } : { completatoIl: null }),
    ...(nuovo === "Preso in carico" ? { presoIl: k.presoIl || ora } : {}) });
  if (ok) { avviso(nuovo === "Fatto" ? "Fatto: il compito esce dalle colonne" : "Preso in carico"); ricarica(); }
}

/** "In attesa": cosa ho fatto, cosa manca, ed eventualmente chiedo aiuto a chi ha assegnato il compito. */
function finestraAttesa(k, ricarica) {
  const u = D.utenteCorrente();
  const d = document.createElement("dialog"); d.className = "dlg-attesa";
  const aChi = k.autoreUid && k.autoreUid !== u.uid ? "a chi ti ha assegnato il compito" : "al responsabile";
  d.innerHTML = `<form method="dialog" class="griglia" style="grid-template-columns:1fr">
    <h2 style="font-size:17px">Metti in attesa: ${e(k.titolo)}</h2>
    ${campo("fatto", "Cosa hai fatto finora", k.appuntiFatto || "", "textarea", [], true)}
    ${campo("manca", "Cosa manca o cosa stai aspettando (obbligatorio)", k.motivoAttesa || "", "textarea", [], true)}
    <div class="largo">${campo("aiuto", `Chiedo aiuto ${aChi}`, !!k.aiuto, "checkbox")}</div>
    <div class="largo" id="box-aiuto"${k.aiuto ? "" : " hidden"}>${campo("aiutoTesto", "Su cosa ti serve aiuto?", k.aiutoTesto || "", "textarea", [], true)}</div>
    <div class="azioni"><button type="button" class="btn" data-chiudi>Annulla</button><button class="btn primario" type="submit">Metti in attesa</button></div></form>`;
  document.body.appendChild(d);
  const f = d.querySelector("form");
  f.aiuto.addEventListener("change", () => { d.querySelector("#box-aiuto").hidden = !f.aiuto.checked; });
  d.querySelector("[data-chiudi]").addEventListener("click", () => d.close());
  d.addEventListener("close", () => d.remove());
  f.addEventListener("submit", async ev => {
    ev.preventDefault();
    const manca = f.manca.value.trim(), fatto = f.fatto.value.trim(), aiuto = f.aiuto.checked, aiutoTesto = f.aiutoTesto.value.trim();
    if (!manca) { f.manca.focus(); avviso("Scrivi cosa manca o cosa aspetti"); return; }
    const ora = new Date().toISOString();
    const cron = [...(k.cronologia || []), { quando: ora, nome: u.nome, testo: `In attesa. ${fatto ? "Fatto: " + fatto + ". " : ""}Manca: ${manca}${aiuto ? `. 🙋 Chiede aiuto${aiutoTesto ? ": " + aiutoTesto : ""}` : ""}` }];
    const ok = await salvaSicuro({ id: k.id, autoreUid: k.autoreUid, stato: "In attesa", appuntiFatto: fatto, motivoAttesa: manca, aiuto, aiutoTesto: aiuto ? aiutoTesto : "", cronologia: cron });
    if (ok) { d.close(); avviso(aiuto ? "In attesa, richiesta di aiuto inviata" : "Messo in attesa"); ricarica(); }
  });
  d.showModal(); f.fatto.focus();
}

/** Calcola stato e motivo d'attesa in base alle richieste aperte. */
function conRichieste(k, richieste) {
  const aperte = richieste.filter(x => !x.ricevutaIl);
  const st = k.stato || "Da fare";
  if (aperte.length && (st === "Da fare" || st === "Preso in carico" || (st === "In attesa" && k.attesaPerRichieste)))
    return { richieste, stato: "In attesa", attesaPerRichieste: true, motivoAttesa: aperte.map(x => `${x.a}: ${x.cosa}`).join("; ") };
  if (!aperte.length && st === "In attesa" && k.attesaPerRichieste) return { richieste, stato: "Preso in carico", attesaPerRichieste: false, motivoAttesa: "" };
  return { richieste };
}

function cassettoCompito(k, clienti, nomeCli, persone, ricarica, opz = {}) {
  const u = D.utenteCorrente(), admin = D.isAdmin();
  const puoEliminare = admin || k.autoreUid === u.uid || !k.id;
  const velo = document.createElement("div"); velo.className = "velo";
  const box = document.createElement("aside"); box.className = "cassetto"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Compito");
  const cron = (k.cronologia || []).slice().reverse();
  const nomeDi = uid => persone.find(p => p.uid === uid)?.nome || "";
  const pr = k.priorita || "normale";
  box.innerHTML = `<form><h2 style="font-size:18px;margin-bottom:6px">${k.id ? "Compito" : "Nuovo compito"}</h2>
    ${k.id && k.autoreUid ? `<p class="tenue" style="font-size:13px;margin-bottom:12px">Creato da ${e(nomeDi(k.autoreUid) || "–")}${k.creato ? " il " + e(fmtData(String(k.creato).slice(0, 10))) : ""}</p>` : ""}
    ${k.aiuto ? `<div class="aiuto-k" style="margin-bottom:12px">🙋 ${e(k.assegnatoNome || "")} chiede aiuto${k.aiutoTesto ? `: ${e(k.aiutoTesto)}` : ""}<br><span style="font-weight:400">Rispondi negli aggiornamenti qui sotto e togli la spunta "Chiede aiuto".</span></div>` : ""}
    <div class="griglia">
      ${campo("titolo", "Cosa c'è da fare", k.titolo, "text", [], true)}
      <div class="largo"><label id="lbl-prio">Priorità</label><input type="hidden" name="priorita" value="${e(pr)}">
        <div class="segmenti" role="radiogroup" aria-labelledby="lbl-prio">${PRIORITA.slice().reverse().map(([c, n]) => `<button type="button" role="radio" data-pr="${c}" aria-checked="${c === pr}">${e(n)}</button>`).join("")}</div></div>
      <div><label for="f_assK">Assegna a</label><select id="f_assK" name="assegnatoUid">${k.assegnatoUid ? "" : '<option value="">– scegli –</option>'}${persone.map(p => `<option value="${e(p.uid)}"${p.uid === k.assegnatoUid ? " selected" : ""}>${e(p.nome)}${p.uid === u.uid ? " (io)" : ""}</option>`).join("")}</select></div>
      ${campo("scadenza", k.stato === "In attesa riscontro" ? "Risposta attesa entro" : "Entro il", k.scadenza, "date")}
      <div class="largo"><label for="f_cliK">Cliente (vuoto = interno studio)</label><input id="f_cliK" list="lista-cli-k" autocomplete="off" value="${e(k.clienteId ? nomeCli[k.clienteId] || "" : "")}">
        <datalist id="lista-cli-k">${clienti.map(c => `<option value="${e(nomeCli[c.id])}"></option>`).join("")}</datalist></div>
      ${campo("dettagli", "Dettagli e istruzioni", k.dettagli, "textarea", [], true)}
      ${k.id ? campo("stato", "Stato", k.stato || "Da fare", "select", STATI_COMPITO) : ""}
      <div><label for="f_tipoK">Categoria</label><input id="f_tipoK" name="tipo" list="lista-tipi-k" value="${e(k.tipo || "")}" placeholder="Facoltativa">
        <datalist id="lista-tipi-k">${CATEGORIE_COMPITO.map(t => `<option value="${e(t)}"></option>`).join("")}</datalist></div>
      <div class="largo" id="box-motivo"${k.stato === "In attesa" && !k.attesaPerRichieste ? "" : " hidden"}>
        ${campo("appuntiFatto", "Cosa è stato fatto", k.appuntiFatto || "", "textarea", [], true)}
        ${campo("motivoAttesa", "Cosa manca o cosa si aspetta (obbligatorio)", k.motivoAttesa, "textarea", [], true)}</div>
      ${k.id ? `<div class="largo">${campo("aiuto", "Chiede aiuto", !!k.aiuto, "checkbox")}</div>` : ""}
      ${campo("visibilita", "Visibile a", k.visibilita === "privato" ? "Solo a chi lo crea e a chi è assegnato" : "Studio", "select", ["Studio", "Solo a chi lo crea e a chi è assegnato"])}
    </div>
    ${k.id ? `<div class="sezione" id="sez-rich"><h3>Richieste in sospeso</h3>
      <p class="tenue" style="font-size:13px;margin-bottom:8px">Documenti o informazioni chiesti a cliente, banca, uffici. Finché una richiesta è aperta il compito sta "In attesa"; quando arriva l'ultima torna "Preso in carico".</p>
      ${(k.richieste || []).length ? `<ul class="richieste">${(k.richieste || []).map((x, i) => `<li class="${x.ricevutaIl ? "ok" : x.sollecitareIl && x.sollecitareIl <= oggiISO() ? "soll" : ""}">
        <div><strong>${e(x.a)}</strong>: ${e(x.cosa)}<div class="tenue" style="font-size:12px">chiesta il ${e(fmtData(x.chiestaIl))}${x.solleciti ? ` · ${x.solleciti} ${x.solleciti === 1 ? "sollecito" : "solleciti"}` : ""}${x.ricevutaIl ? ` · ricevuta il ${e(fmtData(x.ricevutaIl))}` : x.sollecitareIl ? ` · sollecitare il ${e(fmtData(x.sollecitareIl))}` : ""}</div></div>
        ${x.ricevutaIl ? stato("ok", "Ricevuta") : `<span class="barra"><button type="button" class="btn piccolo primario" data-ric="${i}">✓ Ricevuta</button><button type="button" class="btn piccolo" data-sol="${i}">↻ Sollecitato</button></span>`}</li>`).join("")}</ul>` : ""}
      <div class="nuova-rich">
        <select id="r_a" aria-label="A chi">${CONTROPARTI.map(c => `<option>${e(c)}</option>`).join("")}</select>
        <input id="r_cosa" placeholder="Cosa hai chiesto (es. estratti conto 2025)" aria-label="Cosa hai chiesto">
        <label class="tenue" style="font-size:12px;display:flex;align-items:center;gap:4px;white-space:nowrap">sollecito il <input id="r_soll" value="${fmtData(aggiungiGiorni(oggiISO(), GIORNI_RICHIESTA))}" placeholder="gg.mm.aaaa" style="width:110px"></label>
        <button type="button" class="btn" id="r_agg">+ Aggiungi</button></div>
    </div>
    <div class="sezione"><h3>Pratica collegata</h3>
      ${k.praticaId ? `<p>📁 <a href="#" id="vai-prat">${e(k.praticaTitolo || "Apri la pratica")}</a> <span class="tenue">· il rapporto con l'ente e la fatturazione si seguono nella pratica</span></p>`
        : `<p class="tenue" style="font-size:13px;margin-bottom:8px">Se il lavoro è una procedura con un ente (reclamo, assegni, rateizzazione…) o va fatturato a parte, crea la pratica: resta collegata a questo compito.</p>
        <button type="button" class="btn" id="crea-prat"${k.clienteId ? "" : " disabled title=\"Indica prima il cliente\""}>📁 Crea pratica collegata</button>`}
    </div>` : ""}
    <div class="sezione"><h3>Aggiornamenti</h3>
      ${campo("nuovaNota", "Aggiungi un aggiornamento (es. telefonato, mancano documenti, risposta alla richiesta di aiuto…)", "", "textarea", [], true)}
      ${cron.length ? `<ul class="cronologia">${cron.map(x => `<li><span class="tenue">${e(fmtData(String(x.quando).slice(0, 10)))} · ${e(x.nome || "")}</span><div>${e(x.testo)}</div></li>`).join("")}</ul>` : '<p class="tenue" style="font-size:13px">Nessun aggiornamento.</p>'}
      ${k.aggiornato ? `<p class="tenue" style="font-size:12px">Ultimo aggiornamento: ${e(fmtData(String(k.aggiornato).slice(0, 10)))} (${giorniDa(k.aggiornato) ? giorniDa(k.aggiornato) + " giorni fa" : "oggi"})</p>` : ""}
    </div>
    <div class="azioni">${k.id && puoEliminare ? '<button type="button" class="btn" id="elimina-k" style="margin-right:auto">Elimina</button>' : ""}
      ${k.id && aperto(k) ? '<button type="button" class="btn" id="fatto-k">✓ Fatto</button>' : ""}
      <button type="button" class="btn" id="annulla-k">Chiudi</button><button class="btn primario">${k.id ? "Salva" : "Crea compito"}</button></div></form>`;
  document.body.append(velo, box);
  const form = box.querySelector("form");
  const chiudi = () => { velo.remove(); box.remove(); };
  velo.addEventListener("click", chiudi); box.querySelector("#annulla-k").addEventListener("click", chiudi);
  form.stato?.addEventListener("change", () => { box.querySelector("#box-motivo").hidden = form.stato.value !== "In attesa"; });
  form.querySelectorAll("[data-pr]").forEach(b => b.addEventListener("click", () => {
    form.priorita.value = b.dataset.pr; form.querySelectorAll("[data-pr]").forEach(x => x.setAttribute("aria-checked", x === b));
  }));

  const salva = async (forzaFatto) => {
    if (dataNonValida(form)) { avviso("Data non valida: usa gg.mm.aaaa"); return; }
    const d = leggiForm(form);
    if (!d.titolo) { form.titolo.focus(); avviso("Scrivi cosa c'è da fare"); return; }
    if (!d.assegnatoUid) { form.assegnatoUid.focus(); avviso("Scegli a chi assegnarlo"); return; }
    const testoCli = box.querySelector("#f_cliK").value.trim();
    const cli = testoCli ? clienti.find(c => nomeCli[c.id] === testoCli || normNome(c.ragioneSociale) === normNome(testoCli)) : null;
    if (testoCli && !cli) { box.querySelector("#f_cliK").focus(); avviso("Scegli un cliente dall'elenco o lascia vuoto"); return; }
    const nuovoStato = forzaFatto ? "Fatto" : (d.stato || k.stato || "Da fare");
    if (nuovoStato === "In attesa" && !d.motivoAttesa) { box.querySelector("#box-motivo").hidden = false; form.motivoAttesa.focus(); avviso("Indica cosa manca o cosa si aspetta"); return; }
    const ass = persone.find(p => p.uid === d.assegnatoUid);
    const cronologia = [...(k.cronologia || [])];
    const ora = new Date().toISOString();
    if (!k.id && d.assegnatoUid !== u.uid) cronologia.push({ quando: ora, nome: u.nome, testo: `Assegnato a ${ass?.nome || ""}` });
    if (k.id && nuovoStato !== (k.stato || "Da fare")) cronologia.push({ quando: ora, nome: u.nome, testo: `${k.stato || "Da fare"} → ${nuovoStato}${nuovoStato === "In attesa" ? ` (manca: ${d.motivoAttesa})` : ""}` });
    if (k.id && d.assegnatoUid !== k.assegnatoUid) cronologia.push({ quando: ora, nome: u.nome, testo: `Riassegnato a ${ass?.nome || ""}` });
    if (k.id && (d.priorita || "normale") !== (k.priorita || "normale")) cronologia.push({ quando: ora, nome: u.nome, testo: `Priorità: ${d.priorita}` });
    if (k.aiuto && !d.aiuto) cronologia.push({ quando: ora, nome: u.nome, testo: "Richiesta di aiuto risolta" });
    if (d.nuovaNota) cronologia.push({ quando: ora, nome: u.nome, testo: d.nuovaNota });
    const riassegnato = k.id && d.assegnatoUid !== k.assegnatoUid;
    const ok = await salvaSicuro({ ...(k.id ? { id: k.id, autoreUid: k.autoreUid } : { creato: ora, autoreNome: u.nome }),
      titolo: d.titolo, clienteId: cli?.id || null, tipo: d.tipo || (d.assegnatoUid !== u.uid ? "Delega" : "Da fare"), priorita: d.priorita || "normale",
      assegnatoUid: d.assegnatoUid, assegnatoNome: ass?.nome || "",
      scadenza: d.scadenza, stato: riassegnato && nuovoStato !== "Fatto" ? "Da fare" : nuovoStato,
      motivoAttesa: nuovoStato === "In attesa" ? d.motivoAttesa : (k.stato === "In attesa riscontro" ? k.motivoAttesa || "" : ""),
      appuntiFatto: nuovoStato === "In attesa" ? (d.appuntiFatto || "") : (k.appuntiFatto || ""),
      aiuto: nuovoStato === "Fatto" ? false : !!d.aiuto, aiutoTesto: d.aiuto ? (k.aiutoTesto || "") : "",
      visibilita: d.visibilita === "Studio" ? "studio" : "privato", dettagli: d.dettagli, cronologia,
      completatoIl: nuovoStato === "Fatto" ? (k.completatoIl || ora) : null });
    if (!ok) return;
    chiudi(); avviso(nuovoStato === "Fatto" ? "Compito chiuso" : !k.id && d.assegnatoUid !== u.uid ? `Delegato a ${ass?.nome || ""}: lo trovi in "Delegati da me"` : "Compito salvato"); ricarica();
  };
  // --- richieste: si salvano subito ---
  const riapri = (campi, testo) => async () => {
    const ora = new Date().toISOString();
    const nuovo = { ...k, ...campi, cronologia: [...(k.cronologia || []), { quando: ora, nome: u.nome, testo }] };
    if (campi.stato && campi.stato !== (k.stato || "Da fare")) nuovo.cronologia.push({ quando: ora, nome: u.nome, testo: `${k.stato || "Da fare"} → ${campi.stato}` });
    const { id, autoreUid, ...resto } = nuovo;
    if (!(await salvaSicuro({ id, autoreUid, richieste: resto.richieste, stato: resto.stato || "Da fare", attesaPerRichieste: !!resto.attesaPerRichieste,
      motivoAttesa: resto.motivoAttesa || "", cronologia: resto.cronologia, praticaId: resto.praticaId || null, praticaTitolo: resto.praticaTitolo || null }))) return;
    chiudi(); ricarica(); cassettoCompito(nuovo, clienti, nomeCli, persone, ricarica, { richiesta: !!campi.richieste });
  };
  box.querySelector("#r_agg")?.addEventListener("click", () => {
    const a = box.querySelector("#r_a").value, cosa = box.querySelector("#r_cosa").value.trim(), soll = parseData(box.querySelector("#r_soll").value) || null;
    if (!cosa) { box.querySelector("#r_cosa").focus(); avviso("Scrivi cosa hai chiesto"); return; }
    const l = [...(k.richieste || []), { a, cosa, chiestaIl: oggiISO(), sollecitareIl: soll, solleciti: 0 }];
    riapri(conRichieste(k, l), `📨 Richiesta a ${a}: ${cosa}`)();
  });
  box.querySelector("#r_cosa")?.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); box.querySelector("#r_agg").click(); } });
  box.querySelectorAll("[data-ric]").forEach(b => b.addEventListener("click", () => {
    const i = +b.dataset.ric, l = (k.richieste || []).map((x, j) => j === i ? { ...x, ricevutaIl: oggiISO() } : x);
    riapri(conRichieste(k, l), `✓ Ricevuto da ${l[i].a}: ${l[i].cosa}`)();
  }));
  box.querySelectorAll("[data-sol]").forEach(b => b.addEventListener("click", () => {
    const i = +b.dataset.sol, l = (k.richieste || []).map((x, j) => j === i ? { ...x, solleciti: (x.solleciti || 0) + 1, sollecitareIl: aggiungiGiorni(oggiISO(), GIORNI_RICHIESTA) } : x);
    riapri({ richieste: l }, `↻ Sollecitato ${l[i].a}: ${l[i].cosa}`)();
  }));
  box.querySelector("#vai-prat")?.addEventListener("click", ev => { ev.preventDefault(); chiudi(); apriPratica(k.praticaId); });
  box.querySelector("#crea-prat")?.addEventListener("click", () => {
    const tipo = tipoPraticaDa(`${k.titolo} ${k.dettagli || ""}`);
    chiudi();
    nuovaPraticaDa({ clienteId: k.clienteId, tipo, titolo: k.titolo, responsabileUid: k.assegnatoUid || u.uid, responsabileNome: k.assegnatoNome || u.nome,
      compitoId: k.id, compitoTitolo: k.titolo }, async (idP, info) => {
      if (!idP) return;
      await salvaSicuro({ id: k.id, autoreUid: k.autoreUid, praticaId: idP, praticaTitolo: info?.titolo || k.titolo,
        cronologia: [...(k.cronologia || []), { quando: new Date().toISOString(), nome: u.nome, testo: `📁 Creata la pratica collegata: ${info?.titolo || k.titolo}` }] });
      avviso("Pratica creata e collegata al compito"); ricarica();
    });
  });
  if (opz.richiesta) { box.querySelector("#sez-rich")?.scrollIntoView({ block: "center" }); box.querySelector("#r_cosa")?.focus(); }

  form.addEventListener("submit", ev => { ev.preventDefault(); salva(false); });
  box.querySelector("#fatto-k")?.addEventListener("click", () => salva(true));
  box.querySelector("#elimina-k")?.addEventListener("click", async () => {
    if (!confirm("Eliminare questo compito?")) return;
    try { await D.eliminaCompito(k.id); } catch (err) { avviso("Non eliminato: " + (err?.message || err)); return; }
    chiudi(); avviso("Compito eliminato"); ricarica();
  });
  if (!opz.richiesta) form.titolo.focus();
}
