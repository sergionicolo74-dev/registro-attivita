// Modulo Clienti: elenco e scheda cliente a schede.
import * as D from "./data.js";
import { e, avviso, stato, statoData, campo, leggiForm, dataNonValida } from "./ui.js";
import { fmtData, fmtOre, fmtNum, normNome, statoScadenza, campiMancanti, SERVIZI, RUOLI_PERSONA,
  TIPI_MANDATO, STATI_MANDATO, RUOLI_FUNZIONE, TIPI_DOMICILIO, mandatiDi, statoMandato, daAggiornare, budgetTotale } from "./regole.js";

const FORME = ["SA", "Sagl", "Ditta individuale", "SNC", "SAc", "Persona fisica", "Associazione", "Fondazione", "Altro"];

function bloccaDate(form) {
  const el = dataNonValida(form);
  if (!el) return false;
  el.focus(); avviso("Data non valida: usa il formato gg.mm.aaaa"); return true;
}

/** Un'etichetta per ogni mandato attivo: verde se firmato e aggiornato, altrimenti da aggiornare (ambra/rosso se la data si avvicina o è passata). */
function segnaliMandati(c, breve = false) {
  if (c.codice === "C000") return "";
  const mm = mandatiDi(c);
  const att = TIPI_MANDATO.filter(([k]) => mm[k].attivo);
  if (!att.length) return stato("neutro", "Nessun mandato");
  return att.map(([k, n]) => {
    const st = statoMandato(mm[k]);
    const nome = breve ? n.split(" ")[0] : n;
    const extra = k === "funzione" && !breve && mm.funzione.funzioni[0]?.ruolo ? ` · ${mm.funzione.funzioni.map(f => f.ruolo).join(", ")}` : "";
    return stato(st, st === "ok" ? nome + extra : `${nome}${extra}: ${mm[k].stato === "Mancante" ? "mancante" : "da aggiornare"}`);
  }).join("");
}
const haDaAggiornare = c => c.codice !== "C000" && TIPI_MANDATO.some(([k]) => daAggiornare(mandatiDi(c)[k]));

// ======================= ELENCO =======================
export async function vistaClienti(el) {
  el.innerHTML = `<div class="vuoto">Caricamento…</div>`;
  const admin = D.isAdmin();
  const [clienti, kycP, persone, kycC] = await Promise.all([D.listaClienti(), D.listaTuttiKycPersone(), D.listaTuttePersone(), D.listaTuttiKycClienti()]);
  const nPers = {}; persone.forEach(p => nPers[p.clienteId] = (nPers[p.clienteId] || 0) + 1);
  const kycPer = Object.fromEntries(kycC.map(k => [k.id, k]));
  const manca = Object.fromEntries(clienti.map(c => [c.id, campiMancanti(c, nPers[c.id] || 0, admin ? (kycPer[c.id] || {}) : null)]));
  const incompleti = clienti.filter(c => manca[c.id].length).length;
  const docPerCliente = {};
  for (const k of kycP) {
    const s = statoScadenza(k.scadenzaDocumento, 60);
    if (s === "scaduto" || s === "urgente") docPerCliente[k.clienteId] = Math.max(docPerCliente[k.clienteId] || 0, s === "scaduto" ? 2 : 1);
  }
  clienti.sort((a, b) => (a.codice || "").localeCompare(b.codice || "") || (a.ragioneSociale || "").localeCompare(b.ragioneSociale || ""));
  const nDaAggiornare = clienti.filter(haDaAggiornare).length;

  el.innerHTML = `
    <div class="testata">
      <div><h1>Clienti</h1><div class="tenue">${clienti.length} clienti · ${nDaAggiornare} con mandati da aggiornare · ${incompleti} con dati da completare</div></div>
      <div class="barra">
        <input type="search" id="cerca" placeholder="Cerca per nome o codice" aria-label="Cerca cliente">
        <select id="filtro" aria-label="Filtro">
          <option value="">Tutti</option><option value="incompleti">Dati da completare</option><option value="mandato">Mandato da aggiornare</option>
          ${D.isAdmin() ? '<option value="doc">Documenti in scadenza</option>' : ""}
          <option value="funzione">Con funzione societaria</option><option value="domiciliazione">Con domiciliazione</option>
        </select>
        ${D.isAdmin() ? '<button class="btn primario" id="nuovo">Nuovo cliente</button>' : ""}
      </div>
    </div>
    <table class="tabella"><thead><tr><th>Codice</th><th>Cliente</th><th>Responsabile</th><th>Servizi</th><th>Segnali</th><th id="col-manca" hidden>Da completare</th></tr></thead><tbody id="righe"></tbody></table>`;

  const disegna = () => {
    const q = normNome(el.querySelector("#cerca").value), f = el.querySelector("#filtro").value;
    const righe = clienti.filter(c => {
      if (q && !normNome(`${c.codice} ${c.ragioneSociale}`).includes(q)) return false;
      if (f === "incompleti") return manca[c.id].length > 0;
      if (f === "mandato") return haDaAggiornare(c);
      if (f === "doc") return !!docPerCliente[c.id];
      if (f === "funzione" || f === "domiciliazione") return mandatiDi(c)[f].attivo;
      return true;
    });
    const vediManca = f === "incompleti";
    el.querySelector("#col-manca").hidden = !vediManca;
    el.querySelector("#righe").innerHTML = righe.length ? righe.map(c => {
      const nServ = Object.values(c.servizi || {}).filter(Boolean).length;
      const doc = docPerCliente[c.id] ? stato(docPerCliente[c.id] === 2 ? "scaduto" : "urgente", "Documento in scadenza") : "";
      return `<tr class="cliccabile" data-id="${e(c.id)}" tabindex="0"><td>${e(c.codice)}</td><td><strong>${e(c.ragioneSociale)}</strong><div class="tenue">${e([c.forma, c.localita].filter(Boolean).join(" · "))}</div></td>
        <td>${e(c.responsabile || "")}</td><td class="num">${nServ || ""}</td><td><div class="segnali">${segnaliMandati(c, true)}${doc}${!vediManca && manca[c.id].length ? stato("neutro", `${manca[c.id].length} dati da completare`) : ""}</div></td>
        ${vediManca ? `<td>${e(manca[c.id].join(", "))}</td>` : ""}</tr>`;
    }).join("") : `<tr><td colspan="6" class="vuoto">Nessun cliente trovato.</td></tr>`;
  };
  disegna();
  el.querySelector("#cerca").addEventListener("input", disegna);
  el.querySelector("#filtro").addEventListener("change", disegna);
  const apri = (tr) => tr?.dataset.id && (location.hash = "#/clienti/" + encodeURIComponent(tr.dataset.id));
  el.querySelector("#righe").addEventListener("click", ev => apri(ev.target.closest("tr")));
  el.querySelector("#righe").addEventListener("keydown", ev => { if (ev.key === "Enter") apri(ev.target.closest("tr")); });
  el.querySelector("#nuovo")?.addEventListener("click", async () => {
    const max = clienti.map(c => +String(c.codice || "").replace(/\D/g, "") || 0).reduce((a, b) => Math.max(a, b), 0);
    const id = await D.salvaCliente({ codice: "C" + String(max + 1).padStart(3, "0"), ragioneSociale: "Nuovo cliente", stato: "Attivo", servizi: {}, mandati: {} });
    location.hash = "#/clienti/" + id + "/dati";
  });
}

// ======================= SCHEDA =======================
const SCHEDE = [["persone", "Persone"], ["dati", "Dati società"], ["mandati", "Mandati"], ["servizi", "Servizi e scadenze"], ["compiti", "Compiti"], ["ore", "Ore e diario"], ["note", "Note"]];

export async function vistaScheda(el, id) {
  const scheda = location.hash.split("/")[3] || "persone";
  const [c, kyc, persone, kycP] = await Promise.all([D.leggiCliente(id), D.leggiKycCliente(id), D.listaPersone(id), D.listaKycPersone(id)]);
  if (!c) { el.innerHTML = `<div class="pannello">Cliente non trovato. <a href="#/clienti">Torna all'elenco</a></div>`; return; }
  const kycPer = Object.fromEntries(kycP.map(k => [k.id, k]));
  const docScad = kycP.map(k => ({ k, s: statoScadenza(k.scadenzaDocumento, 60) })).filter(x => x.s === "scaduto" || x.s === "urgente");
  const principale = persone.find(p => p.principale) || persone[0];
  const mancanti = campiMancanti(c, persone.length, D.isAdmin() ? (kyc || {}) : null);

  el.innerHTML = `
    <a href="#/clienti" class="tenue">← Clienti</a>
    <section class="riepilogo" style="margin-top:10px">
      <div class="titolo">
        <div><div class="tenue">${e(c.codice)}</div><h1>${e(c.ragioneSociale)}</h1></div>
        <div class="segnali">${segnaliMandati(c)}
          ${docScad.map(x => stato(x.s, "Documento " + (x.s === "scaduto" ? "scaduto" : "in scadenza"))).join("")}
          ${kyc?.prossimaRevisione ? statoData(kyc.prossimaRevisione, "Revisione KYC", 30) : ""}
          ${c.revisione || c.servizi?.revisione ? stato("info", "Revisione") : ""}</div>
      </div>
      <div class="fatti">
        <div><span>Forma</span>${e(c.forma || "–")}</div>
        <div><span>Responsabile</span>${e(c.responsabile || "–")}</div>
        <div><span>Contatto</span>${principale ? e(`${principale.nome || ""} ${principale.cognome || ""}`.trim()) : "–"}</div>
        <div><span>Chiusura esercizio</span>${e(c.chiusuraEsercizio || "–")}</div>
        ${D.isAdmin() && budgetTotale(mandatiDi(c)) ? `<div><span>Budget annuo</span>CHF ${fmtNum(budgetTotale(mandatiDi(c)))}</div>` : ""}
      </div>
      ${mancanti.length ? `<div class="tenue" style="font-size:13px">${stato("neutro", "Da completare")} ${e(mancanti.join(" · "))}</div>` : ""}
    </section>
    <div class="schede" role="tablist">${SCHEDE.map(([k, n]) => `<button role="tab" aria-selected="${k === scheda}" data-k="${k}">${e(n)}${k === "persone" ? ` (${persone.length})` : ""}</button>`).join("")}</div>
    <div id="pannello"></div>`;
  el.querySelectorAll(".schede button").forEach(b => b.addEventListener("click", () => { location.hash = `#/clienti/${encodeURIComponent(id)}/${b.dataset.k}`; }));

  const p = el.querySelector("#pannello");
  const ricarica = () => vistaScheda(el, id);
  if (scheda === "persone") return schedaPersone(p, c, persone, kycPer, ricarica);
  if (scheda === "dati") return schedaDati(p, c, kyc, ricarica);
  if (scheda === "mandati") return schedaMandati(p, c, ricarica);
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
  const admin = D.isAdmin();
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
    <div class="sezione"><h3>Archivio</h3><div class="griglia">
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
    await D.salvaCliente({ ...c, ...dati });
    await D.salvaKycCliente(c.id, k);
    avviso("Dati salvati"); ricarica();
  });
}

// ---------- Mandati ----------
function rigaFunzione(i, f = {}) {
  return `<div class="griglia riga-funzione" data-i="${i}">
    ${campo(`mandati.funzione.funzioni.${i}.ruolo`, "Ruolo", f.ruolo, "select", RUOLI_FUNZIONE)}
    ${campo(`mandati.funzione.funzioni.${i}.persona`, "Persona dello studio", f.persona)}
    ${campo(`mandati.funzione.funzioni.${i}.firma`, "Diritto di firma", f.firma, "select", ["Individuale", "Collettiva a due", "Nessuno"])}
    ${campo(`mandati.funzione.funzioni.${i}.inizio`, "Dal", f.inizio, "date")}</div>`;
}

function schedaMandati(p, c, ricarica) {
  const admin = D.isAdmin(), mm = mandatiDi(c);
  const comuni = (k) => `
      ${campo(`mandati.${k}.stato`, "Stato del mandato firmato", mm[k].stato, "select", STATI_MANDATO)}
      ${campo(`mandati.${k}.dataFirma`, "Data firma", mm[k].dataFirma, "date")}
      ${campo(`mandati.${k}.aggiornareEntro`, "Aggiornare entro", mm[k].aggiornareEntro, "date")}
      ${admin ? campo(`mandati.${k}.budget`, "Budget annuo CHF", mm[k].budget, "number") : ""}`;
  const specifici = {
    contabilita: `${admin ? campo("mandati.contabilita.budgetOre", "Budget ore annue", mm.contabilita.budgetOre, "number") + campo("mandati.contabilita.tariffa", "Tariffa oraria CHF (vuoto = 150)", mm.contabilita.tariffa, "number") : ""}
      ${campo("mandati.contabilita.fatturazione", "Fatturazione", mm.contabilita.fatturazione, "select", ["Mensile", "Trimestrale", "Annuale"])}`,
    funzione: "",
    domiciliazione: `${campo("mandati.domiciliazione.tipo", "Tipo", mm.domiciliazione.tipo, "select", TIPI_DOMICILIO)}${campo("mandati.domiciliazione.dal", "Dal", mm.domiciliazione.dal, "date")}`
  };
  const funzioni = mm.funzione.funzioni.length ? mm.funzione.funzioni : [{}];
  p.innerHTML = `<form class="pannello"><fieldset ${admin ? "" : "disabled"} style="border:0;padding:0;margin:0">
    <p class="tenue" style="margin:0 0 14px">Ogni mandato ha il suo stato, le sue date e il suo budget. Attiva solo quelli che lo studio svolge per questo cliente.</p>
    <div class="mandati">${TIPI_MANDATO.map(([k, n]) => {
      const st = statoMandato(mm[k]);
      return `<section class="mandato${mm[k].attivo ? "" : " spento"}" data-k="${k}">
        <div class="testa"><label class="interruttore"><input type="checkbox" name="mandati.${k}.attivo"${mm[k].attivo ? " checked" : ""}> <strong>${e(n)}</strong></label>
          ${st ? stato(st, st === "ok" ? "Firmato e aggiornato" : mm[k].stato === "Mancante" ? "Mandato mancante" : "Da aggiornare") : '<span class="tenue">Non attivo</span>'}</div>
        <div class="corpo">
          ${k === "funzione" ? `<div id="funzioni">${funzioni.map((f, i) => rigaFunzione(i, f)).join("")}</div>${admin ? '<button type="button" class="btn piccolo" id="aggiungi-funzione" style="margin:8px 0 12px">+ Aggiungi funzione</button>' : ""}` : ""}
          <div class="griglia">${specifici[k]}${comuni(k)}${campo(`mandati.${k}.note`, "Note", mm[k].note, "text", [], true)}</div>
        </div></section>`;
    }).join("")}</div></fieldset>
    ${admin ? `<div class="fatti" style="margin-top:14px"><div><span>Budget annuo totale</span><strong>CHF ${fmtNum(budgetTotale(mm))}</strong></div></div>
      <div class="azioni"><button class="btn primario">Salva</button></div>` : '<p class="tenue" style="margin-top:14px">Solo gli amministratori possono modificare i mandati.</p>'}
  </form>`;
  if (!admin) return;
  const form = p.querySelector("form");
  form.querySelectorAll(".interruttore input").forEach(cb => cb.addEventListener("change", () => cb.closest(".mandato").classList.toggle("spento", !cb.checked)));
  p.querySelector("#aggiungi-funzione")?.addEventListener("click", () => {
    const box = p.querySelector("#funzioni");
    box.insertAdjacentHTML("beforeend", rigaFunzione(box.querySelectorAll(".riga-funzione").length));
  });
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (bloccaDate(form)) return;
    const { mandati } = leggiForm(form);
    mandati.funzione.funzioni = Object.values(mandati.funzione.funzioni || {}).filter(f => f.ruolo || f.persona);
    await D.salvaCliente({ ...c, mandati });
    avviso("Mandati salvati"); ricarica();
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
      <td>${k.completatoIl || k.stato === "Fatto" ? stato("ok", "Fatto") : `${stato("neutro", k.stato || "Aperto")} ${k.scadenza ? statoData(k.scadenza, "Entro", 5) : ""}`}</td></tr>`).join("")}</tbody></table>`
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
