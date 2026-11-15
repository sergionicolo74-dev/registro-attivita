// Modulo Pratiche: pratiche amministrative fuori mandato (assegni familiari, estratti, rateizzazioni…)
// seguite dall'apertura alla conferma dell'ente, con date di controllo per i solleciti e fatturazione.
import * as D from "./data.js";
import { e, avviso, stato, campo, leggiForm, dataNonValida } from "./ui.js";
import { fmtData, fmtNum, fmtDurata, giorniA, giorniDa, normNome, oggiISO, aggiungiGiorni, mandatiDi,
  TIPI_PRATICA, ATTESA_TIPO, ENTE_TIPO, GIORNI_SOLLECITO, GIORNI_DOCUMENTI, praticaAperta, urgenzaPratica, importoPratica } from "./regole.js";

let filtroChi = "tutti", cerca = "", filtroKpi = "";
const TARIFFA = 150;
const ETI = { sollecitare: "Da controllare / sollecitare", oggi: "Controllo entro 2 giorni", ritardo: "Oltre la data prevista" };
const TIPO_STATO = { sollecitare: "scaduto", oggi: "urgente", ritardo: "urgente" };
const PASSI = ["In preparazione", "In attesa dell'ente", "Conclusa"];

export async function vistaPratiche(el, clienteFiltro) {
  const admin = D.isAdmin(), u = D.utenteCorrente(), oggi = oggiISO();
  const [pratiche, clienti, utenti, reg] = await Promise.all([D.listaPratiche(clienteFiltro || null), D.listaClienti(), D.listaUtenti().catch(() => []),
    D.listaRegistrazioniPeriodo("2000-01-01", "2999-12-31").catch(() => [])]);
  const cliPer = Object.fromEntries(clienti.map(c => [c.id, c]));
  const nomeCli = id => cliPer[id] ? `${cliPer[id].codice} · ${cliPer[id].ragioneSociale}` : "–";
  const persone = utenti.filter(x => x.attivo !== false && x.ruolo).map(x => ({ uid: x.id, nome: x.nome || x.id }));
  if (!persone.some(p => p.uid === u.uid)) persone.push({ uid: u.uid, nome: u.nome });
  const minPer = {}; reg.filter(r => r.praticaId).forEach(r => { minPer[r.praticaId] = (minPer[r.praticaId] || 0) + (r.minuti || 0); });
  const tariffaDi = p => Number(p.fatturazione?.tariffa) || Number(mandatiDi(cliPer[p.clienteId] || {}).contabilita.tariffa) || TARIFFA;
  const importo = p => importoPratica({ ...p, fatturazione: { ...p.fatturazione, tariffa: tariffaDi(p) } }, minPer[p.id] || 0);

  const q = normNome(cerca);
  const vis = pratiche.filter(p => (filtroChi === "tutti" || (filtroChi === "me" ? p.responsabileUid === u.uid : p.responsabileUid === filtroChi))
    && (!q || normNome(`${p.titolo} ${p.tipo} ${p.ente} ${nomeCli(p.clienteId)}`).includes(q)));
  const aperte = vis.filter(praticaAperta);
  const daFatt = vis.filter(p => p.fase === "Conclusa" && p.fatturazione?.modo !== "Non fatturare" && p.fatturazione?.stato !== "Fatturata");
  const kpi = {
    sollecitare: aperte.filter(p => urgenzaPratica(p) === "sollecitare"),
    attesa: aperte.filter(p => p.fase === "In attesa dell'ente"),
    nostre: aperte.filter(p => p.fase === "In preparazione" || p.fase === "Documenti richiesti"),
    fatturare: daFatt
  };
  const totFatt = daFatt.reduce((s, p) => s + importo(p), 0);

  el.innerHTML = `
  <div class="testata">
    <div><h1>Pratiche${clienteFiltro && cliPer[clienteFiltro] ? ` · ${e(nomeCli(clienteFiltro))}` : ""}</h1>
      <div class="tenue">${clienteFiltro ? '<a href="#/pratiche">Tutte le pratiche</a> · ' : ""}Pratiche amministrative fuori mandato: ${aperte.length} aperte</div></div>
    <div class="barra">
      <input type="search" id="cerca-pr" placeholder="Cerca" value="${e(cerca)}" aria-label="Cerca pratica">
      <select id="chi-pr" aria-label="Responsabile"><option value="tutti"${filtroChi === "tutti" ? " selected" : ""}>Tutto lo studio</option><option value="me"${filtroChi === "me" ? " selected" : ""}>Le mie</option>
        ${persone.filter(p => p.uid !== u.uid).map(p => `<option value="${e(p.uid)}"${filtroChi === p.uid ? " selected" : ""}>${e(p.nome)}</option>`).join("")}</select>
      <button class="btn primario" id="nuova-pr">Nuova pratica</button>
    </div>
  </div>
  <div class="kpi-s" role="group" aria-label="Riepilogo">
    ${[["sollecitare", "Da controllare / sollecitare", "scaduto", kpi.sollecitare.length], ["attesa", "In attesa dell'ente", "info", kpi.attesa.length],
       ["nostre", "Da fare da noi", "neutro", kpi.nostre.length], ["fatturare", "Concluse da fatturare", "ok", `${kpi.fatturare.length}${totFatt ? ` · CHF ${fmtNum(totFatt, 0)}` : ""}`]]
      .map(([k, n, t, v]) => `<button type="button" class="kpi-b${filtroKpi === k ? " scelto" : ""}" data-kpi="${k}" aria-pressed="${filtroKpi === k}"><span class="stato ${t}">${e(n)}</span><strong>${e(String(v))}</strong></button>`).join("")}
  </div>
  <div id="corpo-pr"></div>`;

  const corpo = el.querySelector("#corpo-pr");
  const scheda = (p) => {
    const g = urgenzaPratica(p), aperta = praticaAperta(p), gg = giorniDa(p.apertaIl), c = giorniA(p.prossimoControllo);
    const passo = p.fase === "Documenti richiesti" ? 1 : Math.max(0, PASSI.indexOf(p.fase));
    return `<article class="pratica ${g || ""}" data-id="${e(p.id)}" tabindex="0">
      <div class="testa"><strong>${e(p.titolo || p.tipo)}</strong>${g ? stato(TIPO_STATO[g], ETI[g]) : ""}${!aperta && p.fase === "Conclusa" ? stato("ok", "Conclusa") : ""}</div>
      <div class="tenue">${e(nomeCli(p.clienteId))} · ${e(p.tipo || "")}${p.ente ? " · " + e(p.ente) : ""}${p.responsabileNome ? " · → " + e(p.responsabileNome) : ""}</div>
      ${aperta ? `<ol class="fasi-pr" aria-label="Avanzamento">${PASSI.map((f, i) => `<li class="${i < passo ? "fatto" : i === passo ? "ora" : ""}">${i === 1 && p.fase === "Documenti richiesti" ? "Documenti richiesti" : e(f)}</li>`).join("")}</ol>` : ""}
      <div class="piede">${aperta ? `<span>Aperta da ${gg} ${gg === 1 ? "giorno" : "giorni"}</span>
        ${p.prossimoControllo ? `<span>Controllo: <strong>${e(fmtData(p.prossimoControllo))}</strong> (${c < 0 ? `${-c} giorni fa` : c === 0 ? "oggi" : `tra ${c} giorni`})</span>` : ""}
        ${p.solleciti ? `<span>${p.solleciti} ${p.solleciti === 1 ? "sollecito" : "solleciti"}</span>` : ""}`
        : `<span>Conclusa il ${e(fmtData(p.conclusaIl))}</span>${p.fatturazione?.modo === "Non fatturare" ? '<span class="tenue">Non si fattura</span>'
          : p.fatturazione?.stato === "Fatturata" ? stato("ok", `Fatturata ${fmtData(p.fatturazione.fatturataIl)}`) : stato("urgente", `Da fatturare CHF ${fmtNum(importo(p))}`)}`}
        ${minPer[p.id] ? `<span>${fmtDurata(minPer[p.id])} registrate</span>` : ""}</div>
    </article>`;
  };
  const gruppo = (titolo, l, ord = (a, b) => String(a.prossimoControllo || "9").localeCompare(String(b.prossimoControllo || "9"))) =>
    l.length ? `<section class="gruppo-k"><h2>${e(titolo)} <span class="tenue">${l.length}</span></h2><div class="elenco-k">${l.sort(ord).map(scheda).join("")}</div></section>` : "";

  if (filtroKpi === "fatturare") {
    corpo.innerHTML = daFatt.length ? `<div class="pannello"><div class="testa-d"><h2 style="font-size:15px">Pratiche concluse da fatturare</h2><button class="btn" id="esporta-pr">Esporta per la fatturazione (CSV)</button></div>
      <table class="tabella"><thead><tr><th>Cliente</th><th>Pratica</th><th>Conclusa</th><th>Modo</th><th class="num">Ore</th><th class="num">CHF</th><th></th></tr></thead><tbody>
      ${daFatt.sort((a, b) => nomeCli(a.clienteId).localeCompare(nomeCli(b.clienteId))).map(p => `<tr><td>${e(nomeCli(p.clienteId))}</td><td><a href="#" data-apri="${e(p.id)}">${e(p.titolo || p.tipo)}</a></td>
        <td>${e(fmtData(p.conclusaIl))}</td><td>${e(p.fatturazione?.modo || "A ore")}</td><td class="num">${minPer[p.id] ? fmtDurata(minPer[p.id]) : "–"}</td><td class="num">${fmtNum(importo(p))}</td>
        <td class="num"><button class="btn piccolo" data-fatturata="${e(p.id)}">✓ Fatturata</button></td></tr>`).join("")}
      <tr class="totale"><td colspan="5"><strong>Totale</strong></td><td class="num"><strong>${fmtNum(totFatt)}</strong></td><td></td></tr></tbody></table></div>`
      : `<div class="pannello vuoto">Nessuna pratica da fatturare.</div>`;
  } else if (filtroKpi) {
    const nomi = { sollecitare: "Da controllare o sollecitare", attesa: "In attesa dell'ente", nostre: "Da fare da noi (preparazione o documenti richiesti)" };
    corpo.innerHTML = gruppo(nomi[filtroKpi], kpi[filtroKpi]) || `<div class="pannello vuoto">Nessuna pratica in questo gruppo.</div>`;
  } else {
    const restano = aperte.filter(p => urgenzaPratica(p) !== "sollecitare");
    const concluse = vis.filter(p => !praticaAperta(p)).sort((a, b) => String(b.conclusaIl || "").localeCompare(String(a.conclusaIl || ""))).slice(0, 12);
    corpo.innerHTML = (gruppo("Da controllare o sollecitare", kpi.sollecitare)
      + gruppo("Da fare da noi", restano.filter(p => p.fase !== "In attesa dell'ente"))
      + gruppo("In attesa dell'ente", restano.filter(p => p.fase === "In attesa dell'ente"))
      + gruppo("Concluse di recente", concluse, () => 0))
      || `<div class="pannello vuoto">Nessuna pratica. Aprine una con "Nuova pratica".</div>`;
  }

  const ricarica = () => vistaPratiche(el, clienteFiltro);
  el.querySelector("#cerca-pr").addEventListener("change", ev => { cerca = ev.target.value; ricarica(); });
  el.querySelector("#chi-pr").addEventListener("change", ev => { filtroChi = ev.target.value; ricarica(); });
  el.querySelectorAll("[data-kpi]").forEach(b => b.addEventListener("click", () => { filtroKpi = filtroKpi === b.dataset.kpi ? "" : b.dataset.kpi; ricarica(); }));
  el.querySelector("#nuova-pr").addEventListener("click", () => cassetto({ clienteId: clienteFiltro || null, tipo: "", fase: "In preparazione", responsabileUid: u.uid, responsabileNome: u.nome,
    fatturazione: { modo: "Forfait" } }, clienti, nomeCli, persone, minPer, importo, ricarica));
  const apri = id => { const p = pratiche.find(x => x.id === id); if (p) cassetto(p, clienti, nomeCli, persone, minPer, importo, ricarica); };
  corpo.addEventListener("click", async ev => {
    const f = ev.target.closest("[data-fatturata]");
    if (f) {
      const p = pratiche.find(x => x.id === f.dataset.fatturata);
      await D.salvaPratica({ id: p.id, fatturazione: { ...p.fatturazione, stato: "Fatturata", fatturataIl: oggi, importoFatturato: importo(p) } });
      avviso("Segnata come fatturata"); ricarica(); return;
    }
    const a = ev.target.closest("[data-apri]"); if (a) { ev.preventDefault(); apri(a.dataset.apri); return; }
    const c = ev.target.closest(".pratica"); if (c) apri(c.dataset.id);
  });
  corpo.addEventListener("keydown", ev => { if (ev.key === "Enter") { const c = ev.target.closest(".pratica"); if (c) apri(c.dataset.id); } });
  corpo.querySelector("#esporta-pr")?.addEventListener("click", () => {
    const righe = [["Codice cliente", "Cliente", "Pratica", "Tipo", "Conclusa il", "Modo", "Ore", "Importo CHF"],
      ...daFatt.map(p => [cliPer[p.clienteId]?.codice || "", cliPer[p.clienteId]?.ragioneSociale || "", p.titolo || p.tipo, p.tipo, fmtData(p.conclusaIl), p.fatturazione?.modo || "A ore",
        minPer[p.id] ? (minPer[p.id] / 60).toFixed(2) : "", importo(p).toFixed(2)])];
    const csv = "﻿" + righe.map(r => r.map(x => /[;"\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x).join(";")).join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `Pratiche_da_fatturare_${fmtData(oggi).replace(/\./g, "-")}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}

function cassetto(p, clienti, nomeCli, persone, minPer, importo, ricarica) {
  const u = D.utenteCorrente(), admin = D.isAdmin(), oggi = oggiISO(), nuova = !p.id, aperta = praticaAperta(p);
  const velo = document.createElement("div"); velo.className = "velo";
  const box = document.createElement("aside"); box.className = "cassetto"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Pratica");
  const passi = (p.passi || []).slice().reverse(), f = p.fatturazione || {};
  box.innerHTML = `<form><h2 style="font-size:18px;margin-bottom:14px">${nuova ? "Nuova pratica" : e(p.titolo || p.tipo)}</h2>
    ${!nuova && aperta ? `<div class="azioni-rapide" role="group" aria-label="Passaggi">
      ${p.fase === "In preparazione" ? `<button type="button" class="btn primario" data-az="inviata">✉ Inviata all'ente</button>` : ""}
      ${p.fase !== "In preparazione" ? `<button type="button" class="btn" data-az="sollecito">↻ Sollecito fatto</button>` : ""}
      ${p.fase === "In attesa dell'ente" ? `<button type="button" class="btn" data-az="documenti">Chiesti altri documenti</button>` : ""}
      ${p.fase === "Documenti richiesti" ? `<button type="button" class="btn primario" data-az="docinviati">✉ Documenti inviati</button>` : ""}
      <button type="button" class="btn" data-az="conclusa">✓ Conferma ricevuta: conclusa</button></div>
      <p class="tenue" style="font-size:13px;margin:6px 0 12px">Scrivi prima nel riquadro "Cosa è successo" se vuoi aggiungere un dettaglio al passaggio.</p>` : ""}
    <div class="griglia">
      <div class="largo"><label for="f_cliPr">Cliente</label><input id="f_cliPr" list="lista-cli-pr" autocomplete="off" value="${e(p.clienteId ? nomeCli(p.clienteId) : "")}">
        <datalist id="lista-cli-pr">${clienti.sort((a, b) => (a.codice || "").localeCompare(b.codice || "")).map(c => `<option value="${e(nomeCli(c.id))}"></option>`).join("")}</datalist></div>
      <div><label for="f_tipoPr">Tipo di pratica</label><input id="f_tipoPr" name="tipo" list="lista-tipi-pr" value="${e(p.tipo || "")}" placeholder="Scegli o scrivi">
        <datalist id="lista-tipi-pr">${TIPI_PRATICA.map(([t]) => `<option value="${e(t)}"></option>`).join("")}</datalist></div>
      ${campo("ente", "Ente / ufficio", p.ente)}
      ${campo("titolo", "Descrizione breve (es. Assegni figli per Mario Rossi)", p.titolo, "text", [], true)}
      <div><label for="f_respPr">Responsabile</label><select id="f_respPr" name="responsabileUid">${persone.map(x => `<option value="${e(x.uid)}"${x.uid === p.responsabileUid ? " selected" : ""}>${e(x.nome)}</option>`).join("")}</select></div>
      ${campo("attesa", "Attesa normale della risposta (giorni)", p.attesa ?? ATTESA_TIPO[p.tipo] ?? 21, "number")}
      ${campo("prossimoControllo", "Prossimo controllo / sollecito", p.prossimoControllo, "date")}
      ${campo("concludereEntro", "Da concludere entro (facoltativo)", p.concludereEntro, "date")}
      ${nuova ? "" : campo("fase", "Fase", p.fase, "select", ["In preparazione", "In attesa dell'ente", "Documenti richiesti", "Conclusa", "Annullata"])}
    </div>
    <div class="sezione"><h3>Cosa è successo</h3>
      ${campo("nota", "Aggiornamento (es. telefonato all'AVS, mancano i certificati di nascita…)", "", "textarea", [], true)}
      ${passi.length ? `<ul class="cronologia">${passi.map(x => `<li><span class="tenue">${e(fmtData(String(x.quando).slice(0, 10)))} · ${e(x.nome || "")}${x.fase ? " · " + e(x.fase) : ""}</span><div>${e(x.testo)}</div></li>`).join("")}</ul>` : '<p class="tenue" style="font-size:13px">Nessun passaggio registrato.</p>'}
    </div>
    <div class="sezione"><h3>Fatturazione</h3><div class="griglia">
      ${campo("fmodo", "Come si fattura", f.modo || "Forfait", "select", ["Forfait", "A ore", "Non fatturare"])}
      ${campo("fimporto", "Forfait CHF", f.importo, "number")}
      ${campo("ftariffa", "Tariffa oraria CHF (vuoto = quella del cliente o 150)", f.tariffa, "number")}
      <div><label>Ore registrate sulla pratica</label><div style="padding:8px 0">${minPer[p.id] ? fmtDurata(minPer[p.id]) : "nessuna"} · da fatturare <strong>CHF ${fmtNum(importo(p))}</strong></div></div>
    </div>
    <p class="tenue" style="font-size:13px">Le ore si registrano nel Registro ore scegliendo il cliente e poi questa pratica: non entrano nel budget dei mandati.</p></div>
    <div class="azioni">${!nuova && admin ? '<button type="button" class="btn" id="elimina-pr" style="margin-right:auto">Elimina</button>' : ""}
      <button type="button" class="btn" id="annulla-pr">Chiudi</button><button class="btn primario">${nuova ? "Apri la pratica" : "Salva"}</button></div></form>`;
  document.body.append(velo, box);
  const form = box.querySelector("form");
  const chiudi = () => { velo.remove(); box.remove(); };
  velo.addEventListener("click", chiudi); box.querySelector("#annulla-pr").addEventListener("click", chiudi);
  form.tipo.addEventListener("change", () => {
    if (ENTE_TIPO[form.tipo.value] && !form.ente.value) form.ente.value = ENTE_TIPO[form.tipo.value];
    if (ATTESA_TIPO[form.tipo.value]) form.attesa.value = ATTESA_TIPO[form.tipo.value];
    if (!form.titolo.value) form.titolo.value = form.tipo.value;
  });

  const dati = () => {
    if (dataNonValida(form)) { avviso("Data non valida: usa gg.mm.aaaa"); return null; }
    const d = leggiForm(form);
    const testo = box.querySelector("#f_cliPr").value.trim();
    const cli = clienti.find(c => nomeCli(c.id) === testo || normNome(c.ragioneSociale) === normNome(testo));
    if (!cli) { box.querySelector("#f_cliPr").focus(); avviso("Scegli il cliente dall'elenco"); return null; }
    if (!d.tipo) { form.tipo.focus(); avviso("Indica il tipo di pratica"); return null; }
    const resp = persone.find(x => x.uid === d.responsabileUid);
    return { ...d, clienteId: cli.id, responsabileNome: resp?.nome || "" };
  };
  const salva = async (cambi, testoPasso) => {
    const d = dati(); if (!d) return;
    const ora = new Date().toISOString(), lista = [...(p.passi || [])];
    const fase = cambi.fase || (nuova ? "In preparazione" : d.fase);
    if (nuova) lista.push({ quando: ora, nome: u.nome, testo: d.nota ? `Pratica aperta: ${d.nota}` : "Pratica aperta", fase });
    else {
      if (testoPasso) lista.push({ quando: ora, nome: u.nome, testo: testoPasso + (d.nota ? `: ${d.nota}` : ""), fase });
      else {
        if (fase !== p.fase) lista.push({ quando: ora, nome: u.nome, testo: `Fase: ${p.fase} → ${fase}`, fase });
        if (d.nota) lista.push({ quando: ora, nome: u.nome, testo: d.nota, fase });
      }
      if (d.responsabileUid !== p.responsabileUid) lista.push({ quando: ora, nome: u.nome, testo: `Responsabile: ${d.responsabileNome}`, fase });
    }
    const fatt = { ...(p.fatturazione || {}), modo: d.fmodo, importo: d.fimporto, tariffa: d.ftariffa };
    if (fase === "Conclusa" && fatt.modo !== "Non fatturare" && fatt.stato !== "Fatturata") fatt.stato = "Da fatturare";
    await D.salvaPratica({ ...(nuova ? { apertaIl: oggi, solleciti: 0, creatoDa: u.uid } : { id: p.id }),
      clienteId: d.clienteId, tipo: d.tipo, ente: d.ente, titolo: d.titolo || d.tipo, responsabileUid: d.responsabileUid, responsabileNome: d.responsabileNome,
      attesa: d.attesa, prossimoControllo: d.prossimoControllo || (nuova ? aggiungiGiorni(oggi, 3) : null), concludereEntro: d.concludereEntro,
      fase, passi: lista, fatturazione: fatt, ...cambi });
    chiudi(); avviso(nuova ? "Pratica aperta" : "Pratica aggiornata"); ricarica();
  };
  const att = () => Number(form.attesa.value) || 21;
  const AZ = {
    inviata: () => salva({ fase: "In attesa dell'ente", inviataIl: oggi, prossimoControllo: aggiungiGiorni(oggi, att()) }, "Inviata all'ente"),
    sollecito: () => salva({ fase: p.fase, solleciti: (p.solleciti || 0) + 1, ultimoSollecito: oggi, prossimoControllo: aggiungiGiorni(oggi, GIORNI_SOLLECITO) }, `Sollecito n. ${(p.solleciti || 0) + 1}`),
    documenti: () => salva({ fase: "Documenti richiesti", prossimoControllo: aggiungiGiorni(oggi, GIORNI_DOCUMENTI) }, "L'ente chiede altri documenti"),
    docinviati: () => salva({ fase: "In attesa dell'ente", prossimoControllo: aggiungiGiorni(oggi, att()) }, "Documenti inviati all'ente"),
    conclusa: () => salva({ fase: "Conclusa", conclusaIl: oggi, prossimoControllo: null }, "Conferma ricevuta, pratica conclusa")
  };
  box.querySelectorAll("[data-az]").forEach(b => b.addEventListener("click", () => AZ[b.dataset.az]()));
  form.addEventListener("submit", ev => { ev.preventDefault(); const fase = form.fase?.value;
    salva(fase === "Conclusa" && p.fase !== "Conclusa" ? { conclusaIl: oggi, prossimoControllo: null } : {}); });
  box.querySelector("#elimina-pr")?.addEventListener("click", async () => {
    if (!confirm("Eliminare questa pratica? Le ore registrate restano nel Registro.")) return;
    await D.eliminaPratica(p.id); chiudi(); avviso("Pratica eliminata"); ricarica();
  });
  (nuova ? box.querySelector("#f_cliPr") : form.nota).focus();
}

/** Pratiche aperte di un cliente (per il Registro ore). */
export async function praticheAperteCliente(clienteId) {
  if (!clienteId) return [];
  return (await D.listaPratiche(clienteId).catch(() => [])).filter(praticaAperta);
}
