// Modulo Compiti: promemoria, deleghe, pratiche e attese di riscontro in un unico elenco.
import * as D from "./data.js";
import { e, avviso, stato, campo, leggiForm, dataNonValida } from "./ui.js";
import { fmtData, parseData, giorniA, giorniDa, normNome, urgenzaCompito, aperto, STATI_COMPITO, CATEGORIE_COMPITO, GIORNI_FERMO } from "./regole.js";

let vista = "elenco";      // elenco | colonne
let filtroChi = "me";      // me | tutti | <uid>
let cerca = "";

const ETICHETTA_URG = { scaduto: "Scaduto", urgente: "Entro 5 giorni", fermo: `Fermo da ${GIORNI_FERMO}+ giorni` };

export async function vistaCompiti(el, clienteFiltro) {
  const admin = D.isAdmin(), u = D.utenteCorrente();
  const [compiti, clienti, utenti] = await Promise.all([D.listaCompiti(clienteFiltro || null), D.listaClienti(), D.listaUtenti().catch(() => [])]);
  const nomeCli = Object.fromEntries(clienti.map(c => [c.id, `${c.codice} · ${c.ragioneSociale}`]));
  const persone = utenti.filter(x => x.attivo !== false).map(x => ({ uid: x.id, nome: x.nome || x.id }));
  if (!persone.some(p => p.uid === u.uid)) persone.push({ uid: u.uid, nome: u.nome });

  const q = normNome(cerca);
  const visibili = compiti.filter(k => {
    if (k.visibilita === "privato" && k.autoreUid !== u.uid && k.assegnatoUid !== u.uid) return false; // i privati restano di chi li ha
    if (filtroChi === "me" && k.assegnatoUid !== u.uid && !(k.autoreUid === u.uid && !k.assegnatoUid)) return false;
    if (filtroChi !== "me" && filtroChi !== "tutti" && k.assegnatoUid !== filtroChi) return false;
    if (q && !normNome(`${k.titolo} ${nomeCli[k.clienteId] || ""} ${k.tipo}`).includes(q)) return false;
    return true;
  });
  const aperti = visibili.filter(aperto);
  const fatti = visibili.filter(k => !aperto(k)).sort((a, b) => String(b.completatoIl || b.aggiornato || "").localeCompare(String(a.completatoIl || a.aggiornato || ""))).slice(0, 20);
  const conta = { scaduto: 0, urgente: 0, fermo: 0 };
  aperti.forEach(k => { const g = urgenzaCompito(k); if (g) conta[g]++; });
  const ordina = (a, b) => (a.scadenza || "9999").localeCompare(b.scadenza || "9999");

  el.innerHTML = `
  <div class="testata">
    <div><h1>Compiti${clienteFiltro ? ` · ${e(nomeCli[clienteFiltro] || "")}` : ""}</h1><div class="tenue">${aperti.length} aperti</div></div>
    <div class="barra">
      <input type="search" id="cerca-k" placeholder="Cerca" value="${e(cerca)}" aria-label="Cerca compito">
      <select id="chi-k" aria-label="Assegnati a"><option value="me"${filtroChi === "me" ? " selected" : ""}>I miei</option>
        ${admin ? `<option value="tutti"${filtroChi === "tutti" ? " selected" : ""}>Tutto lo studio</option>${persone.filter(p => p.uid !== u.uid).map(p => `<option value="${e(p.uid)}"${filtroChi === p.uid ? " selected" : ""}>${e(p.nome)}</option>`).join("")}` : ""}</select>
      <div class="segmenti" role="radiogroup" aria-label="Vista"><button type="button" role="radio" data-v="elenco" aria-checked="${vista === "elenco"}">Elenco</button><button type="button" role="radio" data-v="colonne" aria-checked="${vista === "colonne"}">Colonne</button></div>
      <button class="btn primario" id="nuovo-k">Nuovo compito</button>
    </div>
  </div>
  ${conta.scaduto + conta.urgente + conta.fermo ? `<div class="pannello allerta" role="status" style="margin-bottom:14px"><div class="segnali">
    ${conta.scaduto ? stato("scaduto", `${conta.scaduto} ${conta.scaduto === 1 ? "scaduto" : "scaduti"}`) : ""}${conta.urgente ? stato("urgente", `${conta.urgente} in scadenza entro 5 giorni`) : ""}${conta.fermo ? stato("neutro", `${conta.fermo} ${conta.fermo === 1 ? "fermo" : "fermi"} da ${GIORNI_FERMO} giorni o più`) : ""}</div></div>` : ""}
  <div id="corpo-k"></div>`;

  const corpo = el.querySelector("#corpo-k");
  const scheda = (k) => {
    const g = urgenzaCompito(k), gs = giorniA(k.scadenza);
    return `<article class="compito ${g || ""}" data-id="${e(k.id)}" tabindex="0">
      <div class="testa"><strong>${e(k.titolo)}</strong>${g ? stato(g === "fermo" ? "neutro" : g, ETICHETTA_URG[g]) : ""}</div>
      <div class="tenue">${[k.clienteId ? e(nomeCli[k.clienteId] || "") : "Interno studio", e(k.tipo || ""), k.assegnatoNome ? "→ " + e(k.assegnatoNome) : ""].filter(Boolean).join(" · ")}</div>
      <div class="piede">${k.scadenza ? `<span>Entro ${e(fmtData(k.scadenza))}${aperto(k) && gs != null ? ` (${gs < 0 ? `${-gs} giorni fa` : gs === 0 ? "oggi" : `tra ${gs} giorni`})` : ""}</span>` : "<span>Senza scadenza</span>"}
        ${vista === "elenco" ? stato(k.stato === "Fatto" ? "ok" : "neutro", k.stato || "Da fare") : ""}${k.visibilita === "privato" ? '<span class="tenue">· privato</span>' : ""}</div>
      ${k.stato === "In attesa" && k.motivoAttesa ? `<div class="motivo">In attesa: ${e(k.motivoAttesa)}</div>` : ""}
    </article>`;
  };

  if (vista === "elenco") {
    const gruppi = [
      ["Scaduti", aperti.filter(k => urgenzaCompito(k) === "scaduto")],
      ["In scadenza entro 5 giorni", aperti.filter(k => urgenzaCompito(k) === "urgente")],
      [`Fermi da ${GIORNI_FERMO} giorni o più`, aperti.filter(k => urgenzaCompito(k) === "fermo")],
      ["In attesa di riscontro", aperti.filter(k => !urgenzaCompito(k) && k.stato === "In attesa riscontro")],
      ["Altri aperti", aperti.filter(k => !urgenzaCompito(k) && k.stato !== "In attesa riscontro")],
      ["Fatti di recente", fatti]
    ];
    corpo.innerHTML = gruppi.filter(([, l]) => l.length).map(([n, l]) => `<section class="gruppo-k"><h2>${e(n)} <span class="tenue">${l.length}</span></h2><div class="elenco-k">${l.sort(ordina).map(scheda).join("")}</div></section>`).join("")
      || `<div class="pannello vuoto">Nessun compito. Creane uno con "Nuovo compito" o dal Registro ore.</div>`;
  } else {
    const colonne = [["Da fare", "da-fare"], ["Preso in carico", "in-carico"], ["In attesa", "in-attesa"]];
    corpo.innerHTML = `<div class="colonne-k">${colonne.map(([s, cl]) => {
      const l = aperti.filter(k => s === "In attesa" ? (k.stato === "In attesa" || k.stato === "In attesa riscontro") : (k.stato || "Da fare") === s).sort(ordina);
      return `<section class="colonna ${cl}"><h2>${e(s)} <span class="tenue">${l.length}</span></h2>${l.map(scheda).join("") || '<div class="tenue" style="padding:8px">Nessuno</div>'}</section>`;
    }).join("")}</div>`;
  }

  const ricarica = () => vistaCompiti(el, clienteFiltro);
  el.querySelector("#cerca-k").addEventListener("change", ev => { cerca = ev.target.value; ricarica(); });
  el.querySelector("#chi-k").addEventListener("change", ev => { filtroChi = ev.target.value; ricarica(); });
  el.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => { vista = b.dataset.v; ricarica(); }));
  el.querySelector("#nuovo-k").addEventListener("click", () => cassettoCompito({ clienteId: clienteFiltro || null, stato: "Da fare", visibilita: "studio", assegnatoUid: u.uid, assegnatoNome: u.nome }, clienti, nomeCli, persone, ricarica));
  const apri = id => { const k = compiti.find(x => x.id === id); if (k) cassettoCompito(k, clienti, nomeCli, persone, ricarica); };
  corpo.addEventListener("click", ev => { const a = ev.target.closest(".compito"); if (a) apri(a.dataset.id); });
  corpo.addEventListener("keydown", ev => { if (ev.key === "Enter") { const a = ev.target.closest(".compito"); if (a) apri(a.dataset.id); } });
}

function cassettoCompito(k, clienti, nomeCli, persone, ricarica) {
  const u = D.utenteCorrente(), admin = D.isAdmin();
  const puoEliminare = admin || k.autoreUid === u.uid || !k.id;
  const velo = document.createElement("div"); velo.className = "velo";
  const box = document.createElement("aside"); box.className = "cassetto"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Compito");
  const cron = (k.cronologia || []).slice().reverse();
  box.innerHTML = `<form><h2 style="font-size:18px;margin-bottom:14px">${k.id ? "Compito" : "Nuovo compito"}</h2>
    <div class="griglia">
      ${campo("titolo", "Cosa c'è da fare", k.titolo, "text", [], true)}
      <div class="largo"><label for="f_cliK">Cliente (vuoto = interno studio)</label><input id="f_cliK" list="lista-cli-k" autocomplete="off" value="${e(k.clienteId ? nomeCli[k.clienteId] || "" : "")}">
        <datalist id="lista-cli-k">${clienti.map(c => `<option value="${e(nomeCli[c.id])}"></option>`).join("")}</datalist></div>
      <div><label for="f_tipoK">Categoria</label><input id="f_tipoK" name="tipo" list="lista-tipi-k" value="${e(k.tipo || "")}" placeholder="Scegli o scrivi">
        <datalist id="lista-tipi-k">${CATEGORIE_COMPITO.map(t => `<option value="${e(t)}"></option>`).join("")}</datalist></div>
      <div><label for="f_assK">Assegnato a</label><select id="f_assK" name="assegnatoUid">${persone.map(p => `<option value="${e(p.uid)}"${p.uid === k.assegnatoUid ? " selected" : ""}>${e(p.nome)}</option>`).join("")}</select></div>
      ${campo("scadenza", k.stato === "In attesa riscontro" ? "Risposta attesa entro" : "Scadenza", k.scadenza, "date")}
      ${campo("stato", "Stato", k.stato || "Da fare", "select", STATI_COMPITO)}
      <div class="largo" id="box-motivo"${k.stato === "In attesa" ? "" : " hidden"}>${campo("motivoAttesa", "Perché è in attesa? (obbligatorio)", k.motivoAttesa)}</div>
      ${campo("visibilita", "Visibile a", k.visibilita === "privato" ? "Solo a chi lo crea e a chi è assegnato" : "Studio", "select", ["Studio", "Solo a chi lo crea e a chi è assegnato"])}
      ${campo("dettagli", "Dettagli", k.dettagli, "textarea", [], true)}
    </div>
    <div class="sezione"><h3>Aggiornamenti</h3>
      ${campo("nuovaNota", "Aggiungi un aggiornamento (es. telefonato, mancano documenti…)", "", "textarea", [], true)}
      ${cron.length ? `<ul class="cronologia">${cron.map(x => `<li><span class="tenue">${e(fmtData(String(x.quando).slice(0, 10)))} · ${e(x.nome || "")}</span><div>${e(x.testo)}</div></li>`).join("")}</ul>` : '<p class="tenue" style="font-size:13px">Nessun aggiornamento.</p>'}
      ${k.aggiornato ? `<p class="tenue" style="font-size:12px">Ultimo aggiornamento: ${e(fmtData(String(k.aggiornato).slice(0, 10)))} (${giorniDa(k.aggiornato) ? giorniDa(k.aggiornato) + " giorni fa" : "oggi"})</p>` : ""}
    </div>
    <div class="azioni">${k.id && puoEliminare ? '<button type="button" class="btn" id="elimina-k" style="margin-right:auto">Elimina</button>' : ""}
      ${k.id && aperto(k) ? '<button type="button" class="btn" id="fatto-k">Segna come fatto</button>' : ""}
      <button type="button" class="btn" id="annulla-k">Chiudi</button><button class="btn primario">Salva</button></div></form>`;
  document.body.append(velo, box);
  const form = box.querySelector("form");
  const chiudi = () => { velo.remove(); box.remove(); };
  velo.addEventListener("click", chiudi); box.querySelector("#annulla-k").addEventListener("click", chiudi);
  form.stato.addEventListener("change", () => { box.querySelector("#box-motivo").hidden = form.stato.value !== "In attesa"; });

  const salva = async (forzaFatto) => {
    if (dataNonValida(form)) { avviso("Data non valida: usa gg.mm.aaaa"); return; }
    const d = leggiForm(form);
    if (!d.titolo) { form.titolo.focus(); avviso("Scrivi cosa c'è da fare"); return; }
    const testoCli = box.querySelector("#f_cliK").value.trim();
    const cli = testoCli ? clienti.find(c => nomeCli[c.id] === testoCli || normNome(c.ragioneSociale) === normNome(testoCli)) : null;
    if (testoCli && !cli) { box.querySelector("#f_cliK").focus(); avviso("Scegli un cliente dall'elenco o lascia vuoto"); return; }
    const nuovoStato = forzaFatto ? "Fatto" : d.stato;
    if (nuovoStato === "In attesa" && !d.motivoAttesa) { box.querySelector("#box-motivo").hidden = false; form.motivoAttesa.focus(); avviso("Indica perché è in attesa"); return; }
    const ass = persone.find(p => p.uid === d.assegnatoUid);
    const cronologia = [...(k.cronologia || [])];
    const ora = new Date().toISOString();
    if (k.id && nuovoStato !== (k.stato || "Da fare")) cronologia.push({ quando: ora, nome: u.nome, testo: `Stato: ${k.stato || "Da fare"} → ${nuovoStato}${nuovoStato === "In attesa" ? ` (${d.motivoAttesa})` : ""}` });
    if (k.id && d.assegnatoUid !== k.assegnatoUid) cronologia.push({ quando: ora, nome: u.nome, testo: `Assegnato a ${ass?.nome || ""}` });
    if (d.nuovaNota) cronologia.push({ quando: ora, nome: u.nome, testo: d.nuovaNota });
    await D.salvaCompito({ ...(k.id ? { id: k.id, autoreUid: k.autoreUid } : { creato: ora }),
      titolo: d.titolo, clienteId: cli?.id || null, tipo: d.tipo || "Da fare", assegnatoUid: d.assegnatoUid, assegnatoNome: ass?.nome || "",
      scadenza: d.scadenza, stato: nuovoStato, motivoAttesa: nuovoStato === "In attesa" ? d.motivoAttesa : "",
      visibilita: d.visibilita === "Studio" ? "studio" : "privato", dettagli: d.dettagli, cronologia,
      completatoIl: nuovoStato === "Fatto" ? (k.completatoIl || ora) : null });
    chiudi(); avviso(nuovoStato === "Fatto" ? "Compito chiuso" : "Compito salvato"); ricarica();
  };
  form.addEventListener("submit", ev => { ev.preventDefault(); salva(false); });
  box.querySelector("#fatto-k")?.addEventListener("click", () => salva(true));
  box.querySelector("#elimina-k")?.addEventListener("click", async () => {
    if (!confirm("Eliminare questo compito?")) return;
    await D.eliminaCompito(k.id); chiudi(); avviso("Compito eliminato"); ricarica();
  });
  form.titolo.focus();
}
