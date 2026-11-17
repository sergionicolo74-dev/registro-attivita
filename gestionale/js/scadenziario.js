// Modulo Scadenziario: scadenze ricorrenti calcolate dai servizi di ogni cliente.
// Nel database si salva solo lo stato di ogni scadenza (collection "scadenze").
import * as D from "./data.js";
import { e, avviso, stato, campo, leggiForm, dataNonValida } from "./ui.js";
import { fmtData, giorniA, normNome, oggiISO, aggiungiGiorni, scadenzeCliente, conStato, urgenzaScadenza, chiusa,
  SERVIZI_SCADENZE, NOME_SCADENZA, STATI_SCADENZA, INIZIO_SCADENZIARIO, DOCUMENTI_DF, documentiDF } from "./regole.js";

/** Documenti DF da raccogliere per questa scadenza: [ricevuti, totali] oppure null. */
function contaDoc(o) {
  if (o.servizio !== "dichiarazione" || o.cliente?.forma !== "Persona fisica") return null;
  const l = documentiDF(o.cliente);
  return l.length ? [l.filter(k => o.documenti?.[k]).length, l.length] : null;
}

let vista = "elenco";     // elenco | griglia
let filtroChi = null;     // null = predefinito (admin: tutti, utente: me) | me | tutti | <uid>
let filtroServ = "";
let filtroKpi = "";       // scaduto | urgente | preavviso | attesa | fatte
let cerca = "";
let annoGriglia = new Date().getFullYear();

const ETICHETTA_URG = { scaduto: "Scaduta", urgente: "Entro 5 giorni", preavviso: "Preavviso" };
const GIORNI_ELENCO = 60;

/** Carica clienti, utenti e stati salvati e costruisce le scadenze degli anni indicati. */
export async function carica(anni) {
  const admin = D.isAdmin();
  const [clienti, utenti, salvate, kyc] = await Promise.all([D.listaClienti(), D.listaUtenti().catch(() => []),
    D.listaScadenzeSalvate(anni), admin ? D.listaTuttiKycClienti() : Promise.resolve([])]);
  const perId = Object.fromEntries(salvate.map(s => [s.id, s]));
  const kycDi = Object.fromEntries(kyc.map(k => [k.id, k]));
  const persone = utenti.filter(x => x.attivo !== false).map(x => ({ uid: x.id, nome: x.nome || x.id }));
  const u = D.utenteCorrente();
  if (!persone.some(p => p.uid === u.uid)) persone.push({ uid: u.uid, nome: u.nome });
  // Il responsabile del cliente è un nome scritto a mano: lo abbiniamo a un utente se il nome coincide
  const uidDaNome = (n) => {
    const k = normNome(n); if (!k) return null;
    return (persone.find(p => normNome(p.nome) === k) || persone.find(p => normNome(p.nome).split(" ")[0] === k.split(" ")[0]))?.uid || null;
  };
  const cliPer = Object.fromEntries(clienti.map(c => [c.id, c]));
  const tutte = [];
  for (const c of clienti) for (const a of anni) for (const o of scadenzeCliente(c, a, kycDi[c.id])) {
    const x = conStato(o, perId[o.id]);
    x.respUid = x.responsabileUid || uidDaNome(c.responsabile);
    x.respNome = x.responsabileNome || persone.find(p => p.uid === x.respUid)?.nome || c.responsabile || "";
    x.cliente = c;
    tutte.push(x);
  }
  return { clienti, cliPer, persone, tutte };
}

export async function vistaScadenziario(el, clienteFiltro) {
  const admin = D.isAdmin(), u = D.utenteCorrente();
  if (filtroChi == null) filtroChi = admin ? "tutti" : "me";
  const oggi = oggiISO(), anno = new Date().getFullYear();
  const anni = vista === "griglia" ? [annoGriglia] : [anno - 1, anno, anno + 1];
  const { cliPer, persone, tutte } = await carica(anni);
  const nomeCli = c => `${c.codice} · ${c.ragioneSociale}`;

  const q = normNome(cerca);
  const filtrate = tutte.filter(o => {
    if (clienteFiltro && o.clienteId !== clienteFiltro) return false;
    if (filtroChi === "me" && o.respUid !== u.uid) return false;
    if (filtroChi !== "me" && filtroChi !== "tutti" && o.respUid !== filtroChi) return false;
    if (filtroServ && o.servizio !== filtroServ) return false;
    if (q && !normNome(`${o.etichetta} ${nomeCli(o.cliente)}`).includes(q)) return false;
    return true;
  });
  // Prima dell'avvio dello scadenziario non mostriamo arretrati, salvo che siano già stati gestiti
  const visibili = filtrate.filter(o => o.data >= INIZIO_SCADENZIARIO || o.salvato);
  const aperte = visibili.filter(o => !chiusa(o));
  const meseOra = oggi.slice(0, 7);
  const kpi = {
    scaduto: aperte.filter(o => urgenzaScadenza(o) === "scaduto"),
    urgente: aperte.filter(o => urgenzaScadenza(o) === "urgente"),
    preavviso: aperte.filter(o => urgenzaScadenza(o) === "preavviso"),
    attesa: aperte.filter(o => o.stato === "In attesa cliente"),
    fatte: visibili.filter(o => o.stato === "Fatto" && String(o.fattoIl || "").slice(0, 7) === meseOra)
  };
  const servPresenti = SERVIZI_SCADENZE.filter(([k]) => tutte.some(o => o.servizio === k));

  el.innerHTML = `
  <div class="testata">
    <div><h1>Scadenziario${clienteFiltro && cliPer[clienteFiltro] ? ` · ${e(nomeCli(cliPer[clienteFiltro]))}` : ""}</h1>
      <div class="tenue">${clienteFiltro ? '<a href="#/scadenziario">Tutti i clienti</a> · ' : ""}Calcolato dai servizi di ogni cliente</div></div>
    <div class="barra">
      <input type="search" id="cerca-s" placeholder="Cerca cliente o scadenza" value="${e(cerca)}" aria-label="Cerca">
      <select id="chi-s" aria-label="Responsabile"><option value="me"${filtroChi === "me" ? " selected" : ""}>Le mie</option>
        <option value="tutti"${filtroChi === "tutti" ? " selected" : ""}>Tutto lo studio</option>
        ${persone.filter(p => p.uid !== u.uid).map(p => `<option value="${e(p.uid)}"${filtroChi === p.uid ? " selected" : ""}>${e(p.nome)}</option>`).join("")}</select>
      <select id="serv-s" aria-label="Servizio"><option value="">Tutti i servizi</option>${servPresenti.map(([k, n]) => `<option value="${k}"${filtroServ === k ? " selected" : ""}>${e(n)}</option>`).join("")}</select>
      <div class="segmenti" role="radiogroup" aria-label="Vista"><button type="button" role="radio" data-v="elenco" aria-checked="${vista === "elenco"}">Elenco</button><button type="button" role="radio" data-v="griglia" aria-checked="${vista === "griglia"}">Griglia</button></div>
    </div>
  </div>
  ${vista === "elenco" ? `<div class="kpi-s" role="group" aria-label="Riepilogo">
    ${[["scaduto", "Scadute", "scaduto"], ["urgente", "Entro 5 giorni", "urgente"], ["preavviso", "Preavviso annuali", "info"], ["attesa", "In attesa cliente", "neutro"], ["fatte", "Fatte questo mese", "ok"]]
      .map(([k, n, t]) => `<button type="button" class="kpi-b ${t}${filtroKpi === k ? " scelto" : ""}" data-kpi="${k}" aria-pressed="${filtroKpi === k}"><span class="stato ${t}">${e(n)}</span><strong>${kpi[k].length}</strong></button>`).join("")}
  </div>` : ""}
  <div id="corpo-s"></div>`;

  const corpo = el.querySelector("#corpo-s");
  const ricarica = () => vistaScadenziario(el, clienteFiltro);
  const trova = id => tutte.find(o => o.id === id);

  if (vista === "elenco") {
    const fino = aggiungiGiorni(oggi, GIORNI_ELENCO);
    const riga = o => {
      const g = urgenzaScadenza(o), gg = giorniA(o.data);
      const quando = chiusa(o) ? "" : gg < 0 ? `${-gg} ${-gg === 1 ? "giorno" : "giorni"} fa` : gg === 0 ? "oggi" : `tra ${gg} ${gg === 1 ? "giorno" : "giorni"}`;
      return `<tr class="cliccabile" data-id="${e(o.id)}" tabindex="0">
        <td style="white-space:nowrap"><strong>${e(fmtData(o.data))}</strong><div class="tenue">${e(quando)}</div></td>
        <td>${e(o.etichetta)}${contaDoc(o) ? ` <span class="doc-c${contaDoc(o)[0] === contaDoc(o)[1] ? " tutti" : ""}">Documenti ${contaDoc(o)[0]}/${contaDoc(o)[1]}</span>` : ""}${o.stato === "Prorogato" ? `<div class="tenue">Prorogata (prevista ${e(fmtData(o.scadenza))})</div>` : ""}</td>
        <td><a href="#/clienti/${encodeURIComponent(o.clienteId)}" class="link-cli">${e(nomeCli(o.cliente))}</a></td>
        <td>${e(o.respNome)}</td>
        <td>${chiusa(o) ? stato("ok", o.stato) : `${g ? stato(g === "preavviso" ? "info" : g, ETICHETTA_URG[g]) + " " : ""}${o.stato !== "Da fare" ? stato("neutro", o.stato) : ""}`}</td>
        <td class="num">${chiusa(o) ? "" : `<button type="button" class="btn piccolo" data-fatto="${e(o.id)}" aria-label="Segna come fatta: ${e(o.etichetta)}">✓ Fatto</button>`}</td></tr>`;
    };
    const tabella = (titolo, l) => l.length ? `<section class="gruppo-k"><h2>${e(titolo)} <span class="tenue">${l.length}</span></h2>
      <table class="tabella"><thead><tr><th>Data</th><th>Scadenza</th><th>Cliente</th><th>Responsabile</th><th>Stato</th><th></th></tr></thead>
      <tbody>${l.sort((a, b) => a.data.localeCompare(b.data) || a.cliente.codice.localeCompare(b.cliente.codice)).map(riga).join("")}</tbody></table></section>` : "";
    let html;
    if (filtroKpi) {
      const nomi = { scaduto: "Scadute", urgente: "Entro 5 giorni", preavviso: "In preavviso", attesa: "In attesa del cliente", fatte: "Fatte questo mese" };
      html = tabella(nomi[filtroKpi], kpi[filtroKpi]) || `<div class="pannello vuoto">Nessuna scadenza in questo gruppo.</div>`;
    } else {
      const altre = aperte.filter(o => !urgenzaScadenza(o) && o.data <= fino);
      html = tabella("Scadute", kpi.scaduto) + tabella("Entro 5 giorni", kpi.urgente) + tabella("Preavviso (scadenze annuali entro 30 giorni, revisione dal 31.03)", kpi.preavviso)
        + tabella(`Prossimi ${GIORNI_ELENCO} giorni`, altre)
        || `<div class="pannello vuoto">Nessuna scadenza nei prossimi ${GIORNI_ELENCO} giorni. Le scadenze si generano dai servizi spuntati nella scheda di ogni cliente (Servizi e scadenze).</div>`;
    }
    corpo.innerHTML = html;
  } else {
    const righe = Object.values(cliPer).filter(c => filtrate.some(o => o.clienteId === c.id)).sort((a, b) => a.codice.localeCompare(b.codice));
    const cols = SERVIZI_SCADENZE.filter(([k]) => filtrate.some(o => o.servizio === k));
    const segno = o => {
      const g = urgenzaScadenza(o);
      const cl = o.stato === "Fatto" ? "ok" : o.stato === "Non dovuto" ? "nd" : o.data < INIZIO_SCADENZIARIO && !o.salvato ? "prima" : g === "scaduto" ? "scaduto" : g === "urgente" ? "urgente" : g === "preavviso" ? "info"
        : o.stato === "Da fare" ? "futuro" : "corso";
      // Prorogata: "P" sempre ben visibile (rossa se scaduta anche la proroga, arancio se entro 5 giorni)
      const pro = o.stato === "Prorogato" && cl !== "prima";
      const cls = pro ? `prorogata${g === "scaduto" ? " p-scad" : g === "urgente" ? " p-urg" : ""}` : cl === "corso" ? (o.stato === "In corso" ? "lavoro" : "corso") : cl;
      const sim = pro ? "P" : { ok: "✓", nd: "–", scaduto: "!", urgente: "⏰", info: "i", futuro: "○", corso: "…", lavoro: "▶", prima: "·" }[cls];
      return `<button type="button" class="seg ${cls}" data-id="${e(o.id)}" title="${e(`${o.etichetta} · ${fmtData(o.data)} · ${o.stato}`)}" aria-label="${e(`${o.etichetta}, ${fmtData(o.data)}, ${o.stato}`)}">${sim}</button>`;
    };
    corpo.innerHTML = `<div class="barra" style="margin-bottom:10px"><label for="anno-s" class="tenue">Anno</label>
        <select id="anno-s">${[anno - 1, anno, anno + 1].map(a => `<option${a === annoGriglia ? " selected" : ""}>${a}</option>`).join("")}</select>
        <span class="tenue">Date di scadenza nell'anno ${annoGriglia}</span></div>
      ${righe.length ? `<div class="scorri"><table class="tabella griglia-s"><thead><tr><th>Cliente</th>${cols.map(([, n]) => `<th>${e(n)}</th>`).join("")}</tr></thead><tbody>
      ${righe.map(c => `<tr><td class="cli"><a href="#/clienti/${encodeURIComponent(c.id)}">${e(c.codice)}</a> ${e(c.ragioneSociale)}</td>${cols.map(([k]) => {
        const l = filtrate.filter(o => o.clienteId === c.id && o.servizio === k).sort((a, b) => a.scadenza.localeCompare(b.scadenza));
        return `<td>${l.map(segno).join("")}</td>`;
      }).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="legenda">${[["ok", "✓", "Fatta"], ["scaduto", "!", "Scaduta"], ["urgente", "⏰", "Entro 5 giorni"], ["info", "i", "Preavviso"], ["prorogata", "P", "Prorogata"], ["corso", "…", "In attesa / da depositare"], ["lavoro", "▶", "In corso"], ["futuro", "○", "Da fare"], ["nd", "–", "Non dovuta"], ["prima", "·", "Prima dell'avvio dello scadenziario"]]
        .map(([c, s, n]) => `<span><span class="seg ${c}" aria-hidden="true">${s}</span> ${n}</span>`).join("")}</p>`
      : `<div class="pannello vuoto">Nessuna scadenza per l'anno ${annoGriglia}.</div>`}`;
    corpo.querySelector("#anno-s")?.addEventListener("change", ev => { annoGriglia = +ev.target.value; ricarica(); });
  }

  el.querySelector("#cerca-s").addEventListener("change", ev => { cerca = ev.target.value; ricarica(); });
  el.querySelector("#chi-s").addEventListener("change", ev => { filtroChi = ev.target.value; ricarica(); });
  el.querySelector("#serv-s").addEventListener("change", ev => { filtroServ = ev.target.value; ricarica(); });
  el.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => { vista = b.dataset.v; ricarica(); }));
  el.querySelectorAll("[data-kpi]").forEach(b => b.addEventListener("click", () => { filtroKpi = filtroKpi === b.dataset.kpi ? "" : b.dataset.kpi; ricarica(); }));
  corpo.addEventListener("click", async ev => {
    if (ev.target.closest(".link-cli")) return;
    const f = ev.target.closest("[data-fatto]");
    if (f) { ev.stopPropagation(); await segnaFatto(trova(f.dataset.fatto)); avviso("Segnata come fatta"); ricarica(); return; }
    const r = ev.target.closest("[data-id]");
    if (r && trova(r.dataset.id)) cassettoScadenza(trova(r.dataset.id), persone, ricarica);
  });
  corpo.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.matches("tr[data-id]")) cassettoScadenza(trova(ev.target.dataset.id), persone, ricarica); });
}

function datiDaSalvare(o, cambi) {
  return { id: o.id, clienteId: o.clienteId, servizio: o.servizio, periodo: o.periodo, anno: +o.scadenza.slice(0, 4), scadenzaPrevista: o.scadenza,
    stato: o.stato, nuovaData: o.nuovaData, responsabileUid: o.responsabileUid, responsabileNome: o.responsabileNome,
    cronologia: o.cronologia, fattoIl: o.fattoIl, fattoDa: o.fattoDa, documenti: o.documenti || {}, ...cambi };
}

async function segnaFatto(o) {
  const u = D.utenteCorrente(), ora = new Date().toISOString();
  await D.salvaScadenza(datiDaSalvare(o, { stato: "Fatto", fattoIl: ora, fattoDa: u.nome,
    cronologia: [...o.cronologia, { quando: ora, nome: u.nome, testo: `Stato: ${o.stato} → Fatto` }] }));
}

function cassettoScadenza(o, persone, ricarica) {
  const u = D.utenteCorrente();
  const velo = document.createElement("div"); velo.className = "velo";
  const box = document.createElement("aside"); box.className = "cassetto"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Scadenza");
  const cron = o.cronologia.slice().reverse(), g = urgenzaScadenza(o);
  box.innerHTML = `<form><h2 style="font-size:18px;margin-bottom:4px">${e(o.etichetta)}</h2>
    <p class="tenue" style="margin-bottom:12px"><a href="#/clienti/${encodeURIComponent(o.clienteId)}">${e(o.cliente.codice)} · ${e(o.cliente.ragioneSociale)}</a> · ${e(NOME_SCADENZA[o.servizio])}</p>
    <div class="fatti" style="margin-bottom:14px"><div><span>Scadenza secondo la regola</span><strong>${e(fmtData(o.scadenza))}</strong></div>
      ${o.stato === "Prorogato" && o.nuovaData ? `<div><span>Prorogata al</span><strong>${e(fmtData(o.nuovaData))}</strong></div>` : ""}
      ${o.avvisoDal ? `<div><span>Allerta dal</span>${e(fmtData(o.avvisoDal))}</div>` : ""}
      <div><span>Situazione</span>${chiusa(o) ? stato("ok", o.stato) : g ? stato(g === "preavviso" ? "info" : g, ETICHETTA_URG[g]) : stato("neutro", "Nei termini")}</div></div>
    <div class="griglia">
      ${campo("stato", "Stato", o.stato, "select", STATI_SCADENZA)}
      <div><label for="f_respS">Responsabile</label><select id="f_respS" name="responsabileUid"><option value="">${e(o.cliente.responsabile ? `Come il cliente (${o.cliente.responsabile})` : "Nessuno")}</option>
        ${persone.map(p => `<option value="${e(p.uid)}"${p.uid === o.responsabileUid ? " selected" : ""}>${e(p.nome)}</option>`).join("")}</select></div>
      <div class="largo" id="box-proroga"${o.stato === "Prorogato" ? "" : " hidden"}>${campo("nuovaData", "Nuova data (dalla lettera di proroga) — obbligatoria", o.nuovaData, "date")}</div>
    </div>
    ${o.proroghe?.length && !chiusa(o) ? `<div class="azioni-rapide" style="margin-top:10px">${o.proroghe.map(d => `<button type="button" class="btn" data-proroga="${d}"${o.stato === "Prorogato" && o.nuovaData === d ? " disabled" : ""}>Proroga al ${e(fmtData(d))}</button>`).join("")}</div>` : ""}
    ${contaDoc(o) ? `<div class="sezione"><h3>Documenti ricevuti dal cliente <span class="tenue">${contaDoc(o)[0]}/${contaDoc(o)[1]}</span></h3>
      <div class="servizi">${documentiDF(o.cliente).map(k => `<label><input type="checkbox" name="doc.${k}"${o.documenti?.[k] ? " checked" : ""}> ${e(Object.fromEntries(DOCUMENTI_DF)[k])}</label>`).join("")}</div></div>`
      : o.servizio === "dichiarazione" && o.cliente?.forma === "Persona fisica" ? `<p class="tenue" style="font-size:13px;margin-top:10px">Per avere l'elenco dei documenti da raccogliere, sceglili nella scheda del cliente (Dati personali e DF).</p>` : ""}
    <div class="sezione"><h3>Aggiornamenti</h3>
      ${campo("nuovaNota", "Aggiungi un aggiornamento (es. chiesti documenti, inviata al cliente…)", "", "textarea", [], true)}
      ${cron.length ? `<ul class="cronologia">${cron.map(x => `<li><span class="tenue">${e(fmtData(String(x.quando).slice(0, 10)))} · ${e(x.nome || "")}</span><div>${e(x.testo)}</div></li>`).join("")}</ul>` : '<p class="tenue" style="font-size:13px">Nessun aggiornamento.</p>'}
    </div>
    <div class="azioni">${!chiusa(o) ? '<button type="button" class="btn" id="fatto-s" style="margin-right:auto">✓ Segna come fatta</button>' : ""}
      <button type="button" class="btn" id="annulla-s">Chiudi</button><button class="btn primario">Salva</button></div></form>`;
  document.body.append(velo, box);
  const form = box.querySelector("form");
  const chiudi = () => { velo.remove(); box.remove(); };
  velo.addEventListener("click", chiudi); box.querySelector("#annulla-s").addEventListener("click", chiudi);
  form.stato.addEventListener("change", () => { box.querySelector("#box-proroga").hidden = form.stato.value !== "Prorogato"; });

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (dataNonValida(form)) { avviso("Data non valida: usa gg.mm.aaaa"); return; }
    const d = leggiForm(form);
    if (d.stato === "Prorogato" && !d.nuovaData) { box.querySelector("#box-proroga").hidden = false; form.nuovaData.focus(); avviso("Indica la nuova data della proroga"); return; }
    const ora = new Date().toISOString(), cronologia = [...o.cronologia];
    const resp = persone.find(p => p.uid === d.responsabileUid);
    if (d.stato !== o.stato) cronologia.push({ quando: ora, nome: u.nome, testo: `Stato: ${o.stato} → ${d.stato}${d.stato === "Prorogato" ? ` al ${fmtData(d.nuovaData)}` : ""}` });
    else if (d.stato === "Prorogato" && d.nuovaData !== o.nuovaData) cronologia.push({ quando: ora, nome: u.nome, testo: `Nuova proroga al ${fmtData(d.nuovaData)}` });
    if ((d.responsabileUid || null) !== (o.responsabileUid || null)) cronologia.push({ quando: ora, nome: u.nome, testo: `Responsabile: ${resp?.nome || "come il cliente"}` });
    if (d.nuovaNota) cronologia.push({ quando: ora, nome: u.nome, testo: d.nuovaNota });
    const documenti = d.doc ? { ...o.documenti, ...d.doc } : o.documenti;
    const nuoviDoc = d.doc ? Object.entries(d.doc).filter(([k, v]) => v && !o.documenti?.[k]).map(([k]) => Object.fromEntries(DOCUMENTI_DF)[k]) : [];
    if (nuoviDoc.length) cronologia.push({ quando: ora, nome: u.nome, testo: `Ricevuti: ${nuoviDoc.join(", ")}` });
    await D.salvaScadenza(datiDaSalvare(o, { documenti, stato: d.stato, nuovaData: d.stato === "Prorogato" ? d.nuovaData : o.nuovaData,
      responsabileUid: d.responsabileUid || null, responsabileNome: resp?.nome || "", cronologia,
      fattoIl: d.stato === "Fatto" ? (o.fattoIl || ora) : null, fattoDa: d.stato === "Fatto" ? (o.fattoDa || u.nome) : "" }));
    chiudi(); avviso("Scadenza aggiornata"); ricarica();
  });
  box.querySelectorAll("[data-proroga]").forEach(b => b.addEventListener("click", () => {
    form.stato.value = "Prorogato"; box.querySelector("#box-proroga").hidden = false; form.nuovaData.value = fmtData(b.dataset.proroga);
    form.requestSubmit();
  }));
  box.querySelector("#fatto-s")?.addEventListener("click", async () => { await segnaFatto(o); chiudi(); avviso("Segnata come fatta"); ricarica(); });
  form.stato.focus();
}

/** Prossime scadenze aperte di un cliente (per la scheda cliente). */
export async function prossimeDelCliente(c, n = 8) {
  const anno = new Date().getFullYear();
  const kyc = D.isAdmin() ? await D.leggiKycCliente(c.id) : null;
  const salvate = await D.listaScadenzeSalvate([anno - 1, anno, anno + 1]);
  const perId = Object.fromEntries(salvate.map(s => [s.id, s]));
  return [anno - 1, anno, anno + 1].flatMap(a => scadenzeCliente(c, a, kyc)).map(o => conStato(o, perId[o.id]))
    .filter(o => !chiusa(o) && (o.data >= INIZIO_SCADENZIARIO || o.salvato)).sort((a, b) => a.data.localeCompare(b.data)).slice(0, n);
}
