// Modulo Clienti: elenco e scheda cliente a schede.
import * as D from "./data.js";
import { e, avviso, stato, statoData, campo, leggiForm, dataNonValida } from "./ui.js";
import { fmtData, fmtOre, normNome, statoScadenza, SERVIZI, RUOLI_PERSONA } from "./regole.js";

const STATI_MANDATO = ["Firmato aggiornato", "Da aggiornare", "Mancante"];
const TIPI_MANDATO = ["Contabilità e fiscale", "Amministrazione fiduciaria", "Domiciliazione", "Completo", "Altro"];
const FORME = ["SA", "Sagl", "Ditta individuale", "SNC", "SAc", "Persona fisica", "Associazione", "Fondazione", "Altro"];

function bloccaDate(form) {
  const el = dataNonValida(form);
  if (!el) return false;
  el.focus(); avviso("Data non valida: usa il formato gg.mm.aaaa"); return true;
}

/** Segnale sintetico sul mandato. */
function segnaleMandato(c) {
  const m = c.mandato || {};
  if (m.stato === "Firmato aggiornato") return stato("ok", "Mandato aggiornato");
  const s = statoScadenza(m.aggiornareEntro, 45);
  const testo = m.stato === "Mancante" ? "Mandato mancante" : "Mandato da aggiornare";
  if (!m.stato) return stato("neutro", "Mandato non indicato");
  return stato(s === "scaduto" || s === "urgente" ? s : "neutro", testo);
}

// ======================= ELENCO =======================
export async function vistaClienti(el) {
  el.innerHTML = `<div class="vuoto">Caricamento…</div>`;
  const [clienti, kycP] = await Promise.all([D.listaClienti(), D.listaTuttiKycPersone()]);
  const docPerCliente = {};
  for (const k of kycP) {
    const s = statoScadenza(k.scadenzaDocumento, 60);
    if (s === "scaduto" || s === "urgente") docPerCliente[k.clienteId] = Math.max(docPerCliente[k.clienteId] || 0, s === "scaduto" ? 2 : 1);
  }
  clienti.sort((a, b) => (a.codice || "").localeCompare(b.codice || "") || (a.ragioneSociale || "").localeCompare(b.ragioneSociale || ""));
  const daAggiornare = clienti.filter(c => c.mandato?.stato !== "Firmato aggiornato" && c.codice !== "C000").length;

  el.innerHTML = `
    <div class="testata">
      <div><h1>Clienti</h1><div class="tenue">${clienti.length} clienti · ${daAggiornare} mandati da aggiornare</div></div>
      <div class="barra">
        <input type="search" id="cerca" placeholder="Cerca per nome o codice" aria-label="Cerca cliente">
        <select id="filtro" aria-label="Filtro">
          <option value="">Tutti</option><option value="mandato">Mandato da aggiornare</option>
          ${D.isAdmin() ? '<option value="doc">Documenti in scadenza</option>' : ""}
          <option value="funzione">Con funzione dello studio</option>
        </select>
        ${D.isAdmin() ? '<button class="btn primario" id="nuovo">Nuovo cliente</button>' : ""}
      </div>
    </div>
    <table class="tabella"><thead><tr><th>Codice</th><th>Cliente</th><th>Responsabile</th><th>Servizi</th><th>Segnali</th></tr></thead><tbody id="righe"></tbody></table>`;

  const disegna = () => {
    const q = normNome(el.querySelector("#cerca").value), f = el.querySelector("#filtro").value;
    const righe = clienti.filter(c => {
      if (q && !normNome(`${c.codice} ${c.ragioneSociale}`).includes(q)) return false;
      if (f === "mandato") return c.mandato?.stato !== "Firmato aggiornato" && c.codice !== "C000";
      if (f === "doc") return !!docPerCliente[c.id];
      if (f === "funzione") return !!c.funzione?.tipo;
      return true;
    });
    el.querySelector("#righe").innerHTML = righe.length ? righe.map(c => {
      const nServ = Object.values(c.servizi || {}).filter(Boolean).length;
      const doc = docPerCliente[c.id] ? stato(docPerCliente[c.id] === 2 ? "scaduto" : "urgente", "Documento in scadenza") : "";
      return `<tr class="cliccabile" data-id="${e(c.id)}" tabindex="0"><td>${e(c.codice)}</td><td><strong>${e(c.ragioneSociale)}</strong><div class="tenue">${e([c.forma, c.localita].filter(Boolean).join(" · "))}</div></td>
        <td>${e(c.responsabile || "")}</td><td class="num">${nServ || ""}</td><td><div class="segnali">${c.codice === "C000" ? "" : segnaleMandato(c)}${doc}${c.funzione?.tipo ? stato("info", c.funzione.tipo) : ""}</div></td></tr>`;
    }).join("") : `<tr><td colspan="5" class="vuoto">Nessun cliente trovato.</td></tr>`;
  };
  disegna();
  el.querySelector("#cerca").addEventListener("input", disegna);
  el.querySelector("#filtro").addEventListener("change", disegna);
  const apri = (tr) => tr?.dataset.id && (location.hash = "#/clienti/" + encodeURIComponent(tr.dataset.id));
  el.querySelector("#righe").addEventListener("click", ev => apri(ev.target.closest("tr")));
  el.querySelector("#righe").addEventListener("keydown", ev => { if (ev.key === "Enter") apri(ev.target.closest("tr")); });
  el.querySelector("#nuovo")?.addEventListener("click", async () => {
    const max = clienti.map(c => +String(c.codice || "").replace(/\D/g, "") || 0).reduce((a, b) => Math.max(a, b), 0);
    const id = await D.salvaCliente({ codice: "C" + String(max + 1).padStart(3, "0"), ragioneSociale: "Nuovo cliente", stato: "Attivo", servizi: {}, mandato: { stato: "Mancante" } });
    location.hash = "#/clienti/" + id + "/dati";
  });
}

// ======================= SCHEDA =======================
const SCHEDE = [["persone", "Persone"], ["dati", "Dati e mandato"], ["servizi", "Servizi e scadenze"], ["compiti", "Compiti"], ["ore", "Ore e diario"], ["note", "Note"]];

export async function vistaScheda(el, id) {
  const scheda = location.hash.split("/")[3] || "persone";
  const [c, kyc, persone, kycP] = await Promise.all([D.leggiCliente(id), D.leggiKycCliente(id), D.listaPersone(id), D.listaKycPersone(id)]);
  if (!c) { el.innerHTML = `<div class="pannello">Cliente non trovato. <a href="#/clienti">Torna all'elenco</a></div>`; return; }
  const kycPer = Object.fromEntries(kycP.map(k => [k.id, k]));
  const docScad = kycP.map(k => ({ k, s: statoScadenza(k.scadenzaDocumento, 60) })).filter(x => x.s === "scaduto" || x.s === "urgente");
  const principale = persone.find(p => p.principale) || persone[0];

  el.innerHTML = `
    <a href="#/clienti" class="tenue">← Clienti</a>
    <section class="riepilogo" style="margin-top:10px">
      <div class="titolo">
        <div><div class="tenue">${e(c.codice)}</div><h1>${e(c.ragioneSociale)}</h1></div>
        <div class="segnali">${c.codice === "C000" ? "" : segnaleMandato(c)}
          ${docScad.map(x => stato(x.s, "Documento " + (x.s === "scaduto" ? "scaduto" : "in scadenza"))).join("")}
          ${kyc?.prossimaRevisione ? statoData(kyc.prossimaRevisione, "Revisione KYC", 30) : ""}
          ${c.funzione?.tipo ? stato("info", c.funzione.tipo + (c.funzione.persona ? " · " + c.funzione.persona : "")) : ""}
          ${c.revisione || c.servizi?.revisione ? stato("info", "Revisione") : ""}</div>
      </div>
      <div class="fatti">
        <div><span>Forma</span>${e(c.forma || "–")}</div>
        <div><span>Responsabile</span>${e(c.responsabile || "–")}</div>
        <div><span>Contatto</span>${principale ? e(`${principale.nome || ""} ${principale.cognome || ""}`.trim()) : "–"}</div>
        <div><span>Chiusura esercizio</span>${e(c.chiusuraEsercizio || "–")}</div>
        <div><span>Mandato da aggiornare entro</span>${e(fmtData(c.mandato?.aggiornareEntro) || "–")}</div>
      </div>
    </section>
    <div class="schede" role="tablist">${SCHEDE.map(([k, n]) => `<button role="tab" aria-selected="${k === scheda}" data-k="${k}">${e(n)}${k === "persone" ? ` (${persone.length})` : ""}</button>`).join("")}</div>
    <div id="pannello"></div>`;
  el.querySelectorAll(".schede button").forEach(b => b.addEventListener("click", () => { location.hash = `#/clienti/${encodeURIComponent(id)}/${b.dataset.k}`; }));

  const p = el.querySelector("#pannello");
  const ricarica = () => vistaScheda(el, id);
  if (scheda === "persone") return schedaPersone(p, c, persone, kycPer, ricarica);
  if (scheda === "dati") return schedaDati(p, c, kyc, ricarica);
  if (scheda === "servizi") return schedaServizi(p, c, ricarica);
  if (scheda === "compiti") return schedaCompiti(p, c);
  if (scheda === "ore") return schedaOre(p, c);
  if (scheda === "note") return schedaNote(p, c, ricarica);
}

// ---------- Persone ----------
function schedaPersone(p, c, persone, kycPer, ricarica) {
  const admin = D.isAdmin();
  persone.sort((a, b) => (b.principale ? 1 : 0) - (a.principale ? 1 : 0) || (a.cognome || "").localeCompare(b.cognome || ""));
  p.innerHTML = `<div class="pannello">
    <div class="testata" style="margin-bottom:12px"><h2 style="font-size:16px">Persone e contatti</h2><button class="btn" id="nuova">Aggiungi persona</button></div>
    <div class="elenco-persone">${persone.length ? persone.map(x => {
      const k = kycPer[x.id];
      return `<div class="persona"><div class="testa"><div><strong>${e(`${x.nome || ""} ${x.cognome || ""}`.trim() || "Senza nome")}</strong> <span class="tenue">· ${e(x.ruolo || "")}</span></div>
        <div class="segnali">${x.principale ? stato("info", "Contatto principale") : ""}${admin && k?.scadenzaDocumento ? statoData(k.scadenzaDocumento, (k.tipoDocumento || "Documento") + " scade", 60) : ""}
        <button class="btn piccolo" data-mod="${e(x.id)}">Modifica</button></div></div>
        <div class="tenue">${[x.email && `✉ ${e(x.email)}`, x.telefono && `☎ ${e(x.telefono)}`, x.canale && `Preferisce: ${e(x.canale)}`, x.lingua && e(x.lingua), x.firma && `Firma: ${e(x.firma)}`].filter(Boolean).join(" · ")}</div></div>`;
    }).join("") : `<div class="vuoto">Nessuna persona inserita.</div>`}</div></div>`;
  p.querySelector("#nuova").addEventListener("click", () => cassettoPersona({ clienteId: c.id }, null, ricarica));
  p.querySelectorAll("[data-mod]").forEach(b => b.addEventListener("click", () => {
    const x = persone.find(y => y.id === b.dataset.mod); cassettoPersona(x, kycPer[x.id] || {}, ricarica);
  }));
}

function cassettoPersona(x, k, ricarica) {
  const admin = D.isAdmin();
  const velo = document.createElement("div"); velo.className = "velo";
  const box = document.createElement("aside"); box.className = "cassetto"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Persona");
  box.innerHTML = `<form><h2 style="font-size:18px;margin-bottom:14px">${x.id ? "Modifica persona" : "Nuova persona"}</h2>
    <div class="griglia">
      ${campo("cognome", "Cognome", x.cognome)}${campo("nome", "Nome", x.nome)}
      ${campo("ruolo", "Ruolo", x.ruolo, "select", RUOLI_PERSONA)}${campo("firma", "Diritto di firma", x.firma, "select", ["Individuale", "Collettiva a due", "Nessuno"])}
      ${campo("email", "Email", x.email, "email")}${campo("telefono", "Telefono", x.telefono, "tel")}
      ${campo("canale", "Canale preferito", x.canale, "select", ["Email", "Telefono", "WhatsApp", "Posta"])}${campo("lingua", "Lingua", x.lingua, "select", ["Italiano", "Tedesco", "Francese", "Inglese"])}
      ${campo("principale", "Contatto principale", x.principale, "checkbox", [], true)}
      ${campo("note", "Note", x.note, "textarea", [], true)}
    </div>
    ${admin ? `<div class="sezione riservato"><h3>Identificazione (KYC)</h3><div class="griglia">
      ${campo("k.nazionalita", "Nazionalità", k?.nazionalita)}${campo("k.domicilio", "Paese di domicilio", k?.domicilio)}
      ${campo("k.tipoDocumento", "Tipo documento", k?.tipoDocumento, "select", ["Passaporto", "Carta d'identità", "Permesso B", "Permesso C", "Permesso G", "Permesso L", "Altro"])}
      ${campo("k.scadenzaDocumento", "Scadenza documento", k?.scadenzaDocumento, "date")}
      ${campo("k.copiaArchivio", "Copia del documento in archivio", k?.copiaArchivio, "checkbox", [], true)}
      <p class="tenue largo" style="margin:0;font-size:12px">Il numero del documento non si registra qui: resta solo nella copia in archivio.</p></div></div>` : ""}
    <div class="azioni">${x.id ? '<button type="button" class="btn" id="elimina" style="margin-right:auto">Elimina</button>' : ""}<button type="button" class="btn" id="annulla">Annulla</button><button class="btn primario">Salva</button></div></form>`;
  document.body.append(velo, box);
  const chiudi = () => { velo.remove(); box.remove(); };
  velo.addEventListener("click", chiudi); box.querySelector("#annulla").addEventListener("click", chiudi);
  box.querySelector("#elimina")?.addEventListener("click", async () => {
    if (!confirm("Eliminare questa persona?")) return;
    await D.eliminaPersona(x.id); chiudi(); avviso("Persona eliminata"); ricarica();
  });
  box.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault();
    if (bloccaDate(ev.target)) return;
    const { k: kd, ...dati } = leggiForm(ev.target);
    const id = await D.salvaPersona({ ...x, ...dati });
    if (admin && kd) await D.salvaKycPersona(id, { ...kd, clienteId: x.clienteId });
    chiudi(); avviso("Persona salvata"); ricarica();
  });
  box.querySelector("input,select")?.focus();
}

// ---------- Dati e mandato ----------
function schedaDati(p, c, kyc, ricarica) {
  const admin = D.isAdmin(), m = c.mandato || {}, f = c.funzione || {}, o = c.onorario || {};
  p.innerHTML = `<form class="pannello"><fieldset ${admin ? "" : "disabled"} style="border:0;padding:0;margin:0">
    <h3 style="font-size:14px;margin-bottom:10px">Società</h3>
    <div class="griglia">
      ${campo("codice", "Codice cliente", c.codice)}${campo("ragioneSociale", "Ragione sociale", c.ragioneSociale)}
      ${campo("forma", "Forma giuridica", c.forma, "select", FORME)}${campo("idi", "IDI", c.idi)}
      ${campo("responsabile", "Responsabile interno", c.responsabile)}${campo("sostituto", "Sostituto", c.sostituto)}
      ${campo("stato", "Stato", c.stato, "select", ["Attivo", "Sospeso", "Cessato"])}${campo("chiusuraEsercizio", "Chiusura esercizio (gg.mm)", c.chiusuraEsercizio)}
      ${campo("indirizzo", "Indirizzo", c.indirizzo)}${campo("npa", "NPA", c.npa)}${campo("localita", "Località", c.localita)}${campo("cantone", "Cantone", c.cantone)}
      ${campo("emailGenerale", "Email generale", c.emailGenerale, "email")}${campo("lingua", "Lingua corrispondenza", c.lingua, "select", ["Italiano", "Tedesco", "Francese", "Inglese"])}
    </div>
    <div class="sezione"><h3>Mandato</h3><div class="griglia">
      ${campo("mandato.tipo", "Tipo mandato", m.tipo, "select", TIPI_MANDATO)}${campo("mandato.stato", "Stato mandato firmato", m.stato, "select", STATI_MANDATO)}
      ${campo("mandato.dataFirma", "Data firma", m.dataFirma, "date")}${campo("mandato.aggiornareEntro", "Aggiornare entro", m.aggiornareEntro, "date")}
      ${campo("inizioMandato", "Inizio rapporto", c.inizioMandato, "date")}
    </div></div>
    <div class="sezione"><h3>Funzione dello studio nella società</h3><div class="griglia">
      ${campo("funzione.tipo", "Funzione", f.tipo, "select", ["Amministratore", "Gerente", "Membro CdA / gerenza", "Direttore", "Senza funzione - responsabile"])}
      ${campo("funzione.persona", "Persona con la funzione", f.persona)}${campo("funzione.firma", "Diritto di firma", f.firma, "select", ["Individuale", "Collettiva a due", "Nessuno"])}
      ${campo("funzione.inizio", "Inizio funzione", f.inizio, "date")}
    </div></div>
    <div class="sezione"><h3>Onorario</h3><div class="griglia">
      ${campo("onorario.tipo", "Tipo onorario", o.tipo, "select", ["Forfait", "A ore", "Misto"])}${campo("onorario.forfait", "Forfait annuo CHF", o.forfait, "number")}
      ${campo("onorario.tariffa", "Tariffa oraria CHF", o.tariffa, "number")}${campo("onorario.budgetOre", "Budget ore annue", o.budgetOre, "number")}
      ${campo("onorario.fatturazione", "Fatturazione", o.fatturazione, "select", ["Mensile", "Trimestrale", "Annuale"])}
      ${campo("cartella", "Cartella archivio (percorso)", c.cartella, "text", [], true)}
    </div></div>
    </fieldset>
    ${admin ? `<div class="sezione riservato"><h3>KYC e rischio</h3><div class="griglia">
      ${campo("kyc.stato", "Stato KYC", kyc?.stato, "select", ["Completo", "Da completare", "Da aggiornare"])}${campo("kyc.rischio", "Rischio", kyc?.rischio, "select", ["Basso", "Medio", "Elevato"])}
      ${campo("kyc.ultimaVerifica", "Ultima verifica", kyc?.ultimaVerifica, "date")}${campo("kyc.prossimaRevisione", "Prossima revisione", kyc?.prossimaRevisione, "date")}
    </div></div><div class="azioni"><button class="btn primario">Salva</button></div>` : `<p class="tenue" style="margin-top:14px">Solo gli amministratori possono modificare questi dati.</p>`}
  </form>`;
  if (!admin) return;
  p.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault();
    if (bloccaDate(ev.target)) return;
    const { kyc: k, ...dati } = leggiForm(ev.target);
    await D.salvaCliente({ ...c, ...dati, mandato: { ...c.mandato, ...dati.mandato }, funzione: { ...c.funzione, ...dati.funzione }, onorario: { ...c.onorario, ...dati.onorario } });
    await D.salvaKycCliente(c.id, k);
    avviso("Dati salvati"); ricarica();
  });
}

// ---------- Servizi ----------
function schedaServizi(p, c, ricarica) {
  const admin = D.isAdmin(), s = c.servizi || {};
  p.innerHTML = `<form class="pannello"><fieldset ${admin ? "" : "disabled"} style="border:0;padding:0;margin:0">
    <h3 style="font-size:14px;margin-bottom:10px">Servizi svolti dallo studio</h3>
    <div class="servizi">${SERVIZI.map(([k, n]) => `<label><input type="checkbox" name="servizi.${k}" ${s[k] || (k === "revisione" && c.revisione) ? "checked" : ""}> ${e(n)}</label>`).join("")}</div>
    <div class="sezione"><h3>Dati per il calcolo delle scadenze</h3><div class="griglia">
      ${campo("iva.regime", "Regime IVA", c.iva?.regime, "select", ["Non assoggettato", "Effettivo", "Aliquote saldo", "Aliquote forfetarie"])}
      ${campo("iva.periodicita", "Periodicità IVA", c.iva?.periodicita, "select", ["Trimestrale", "Semestrale", "Mensile"])}
      ${campo("dipendenti", "N. dipendenti", c.dipendenti, "number")}${campo("cassaAvs", "Cassa AVS", c.cassaAvs)}
      ${campo("lainf", "Assicuratore LAINF", c.lainf)}${campo("lpp", "Istituto LPP", c.lpp)}
    </div></div></fieldset>
    <p class="tenue" style="margin-top:14px">Le scadenze di questi servizi verranno generate in automatico dallo scadenziario (fase 2).</p>
    ${admin ? '<div class="azioni"><button class="btn primario">Salva</button></div>' : ""}</form>`;
  if (!admin) return;
  p.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault();
    const d = leggiForm(ev.target);
    await D.salvaCliente({ ...c, ...d, revisione: !!d.servizi.revisione, iva: { ...c.iva, ...d.iva } });
    avviso("Servizi salvati"); ricarica();
  });
}

// ---------- Compiti ----------
async function schedaCompiti(p, c) {
  const comp = (await D.listaCompiti(c.id)).sort((a, b) => (a.completatoIl ? 1 : 0) - (b.completatoIl ? 1 : 0) || (a.scadenza || "9").localeCompare(b.scadenza || "9"));
  p.innerHTML = `<div class="pannello"><h3 style="font-size:14px;margin-bottom:10px">Compiti del cliente</h3>
    ${comp.length ? `<table class="tabella"><thead><tr><th>Compito</th><th>Assegnato</th><th>Scadenza</th><th>Stato</th></tr></thead><tbody>${comp.map(k => `<tr>
      <td>${e(k.titolo)}</td><td>${e(k.assegnatoNome || "")}</td><td>${e(fmtData(k.scadenza))}</td>
      <td>${k.completatoIl ? stato("ok", "Fatto") : k.scadenza ? statoData(k.scadenza, "Entro", 5) : stato("neutro", k.stato || "Aperto")}</td></tr>`).join("")}</tbody></table>`
      : `<div class="vuoto">Nessun compito.</div>`}
    <p class="tenue" style="margin-top:12px">Creazione e gestione dei compiti arrivano con il modulo Compiti (fase 2).</p></div>`;
}

// ---------- Ore e diario ----------
async function schedaOre(p, c) {
  const reg = (await D.listaRegistrazioni(c.id)).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  const tot = reg.reduce((s, r) => s + (r.minuti || 0), 0), fat = reg.filter(r => r.fatturabile).reduce((s, r) => s + (r.minuti || 0), 0);
  p.innerHTML = `<div class="pannello">
    <div class="fatti" style="margin-bottom:14px"><div><span>Ore registrate</span><strong>${fmtOre(tot)}</strong></div><div><span>Di cui fatturabili</span><strong>${fmtOre(fat)}</strong></div><div><span>Voci</span>${reg.length}</div></div>
    ${reg.length ? `<table class="tabella"><thead><tr><th>Data</th><th>Descrizione</th><th>Chi</th><th class="num">Ore</th></tr></thead><tbody>${reg.map(r => `<tr>
      <td style="white-space:nowrap">${e(fmtData(r.data))}</td><td>${r.tipo === "nota" ? stato("info", "Nota") + " " : ""}${e(r.descrizione).replace(/\n/g, "<br>")}</td>
      <td>${e(r.autoreNome || "")}</td><td class="num">${r.minuti ? fmtOre(r.minuti) : ""}${r.fatturabile === false && r.minuti ? '<div class="tenue">non fatt.</div>' : ""}</td></tr>`).join("")}</tbody></table>`
      : `<div class="vuoto">Nessuna registrazione.</div>`}
    <p class="tenue" style="margin-top:12px">${D.isAdmin() ? "" : "Vedi solo le tue registrazioni. "}L'inserimento delle ore passa nel nuovo Registro ore (fase 2).</p></div>`;
}

// ---------- Note ----------
function schedaNote(p, c, ricarica) {
  const admin = D.isAdmin();
  p.innerHTML = `<form class="pannello"><label for="f_note">Note sul cliente</label><textarea id="f_note" name="note" rows="8" ${admin ? "" : "disabled"}>${e(c.note)}</textarea>
    ${admin ? '<div class="azioni"><button class="btn primario">Salva</button></div>' : ""}</form>`;
  if (!admin) return;
  p.querySelector("form").addEventListener("submit", async ev => {
    ev.preventDefault(); await D.salvaCliente({ ...c, note: ev.target.note.value }); avviso("Note salvate"); ricarica();
  });
}
