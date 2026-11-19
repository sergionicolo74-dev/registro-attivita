// Situazione di partenza: riporta nel gestionale quello che era già in corso prima dell'avvio (15.11.2026).
// Quattro schede: scadenze prima dell'avvio, pratiche in corso, compiti in corso, onorari e ore già fatturati.
import * as D from "./data.js";
import { e, avviso, stato } from "./ui.js";
import { fmtData, fmtNum, fmtDurata, oggiISO, aggiungiGiorni, parseData, normNome, INIZIO_SCADENZIARIO, NOME_SCADENZA, chiusa,
  TIPI_PRATICA, ATTESA_TIPO, ENTE_TIPO, FASI_PRATICA, PRIORITA, TIPI_MANDATO, NOME_MANDATO, mandatiDi, freqMandato, periodiFatturazione,
  aForfait, tipoFatturazione, tfDiMandato, senzaOre, clienteSpeciale, valoreOra } from "./regole.js";
import { carica as caricaScadenze } from "./scadenziario.js";
import { mandatoDiRegistrazione } from "./mandati.js";

let scheda = "scadenze";
let limiteFatt = null; // fino a quale data gli onorari risultano già fatturati
const ANNO = +INIZIO_SCADENZIARIO.slice(0, 4);
const SCHEDE = [["scadenze", "1 · Scadenze prima dell'avvio"], ["pratiche", "2 · Pratiche in corso"], ["compiti", "3 · Compiti in corso"], ["fatturato", "4 · Già fatturato"]];

export async function vistaPartenza(el) {
  if (!D.isAdmin()) { el.innerHTML = '<div class="pannello">Solo per gli amministratori.</div>'; return; }
  el.innerHTML = `<div class="testata"><div><h1>Situazione di partenza</h1>
    <div class="tenue">Il gestionale è attivo dal ${e(fmtData(INIZIO_SCADENZIARIO))}: qui riporti quello che era già in corso prima, così niente resta fuori.</div></div></div>
    <div class="schede schede-d" role="tablist">${SCHEDE.map(([k, n]) => `<button type="button" role="tab" data-s="${k}" aria-selected="${k === scheda}">${e(n)}</button>`).join("")}</div>
    <div id="corpo-p"><div class="vuoto">Caricamento…</div></div>`;
  el.querySelectorAll("[data-s]").forEach(b => b.addEventListener("click", () => { scheda = b.dataset.s; vistaPartenza(el); }));
  const corpo = el.querySelector("#corpo-p");
  const ricarica = () => vistaPartenza(el);
  if (scheda === "scadenze") return schedaScadenze(corpo, ricarica);
  if (scheda === "pratiche") return schedaPratiche(corpo, ricarica);
  if (scheda === "compiti") return schedaCompiti(corpo, ricarica);
  return schedaFatturato(corpo, ricarica);
}

// ---------- 1. Scadenze con data precedente all'avvio ----------
function datiScadenza(o, cambi) {
  return { id: o.id, clienteId: o.clienteId, servizio: o.servizio, periodo: o.periodo, anno: +o.scadenza.slice(0, 4), scadenzaPrevista: o.scadenza,
    stato: o.stato, nuovaData: o.nuovaData, responsabileUid: o.responsabileUid, responsabileNome: o.responsabileNome,
    cronologia: o.cronologia, fattoIl: o.fattoIl, fattoDa: o.fattoDa, documenti: o.documenti || {}, ...cambi };
}
async function schedaScadenze(p, ricarica) {
  const { tutte } = await caricaScadenze([ANNO]);
  const prima = tutte.filter(o => o.scadenza < INIZIO_SCADENZIARIO && !o.salvato).sort((a, b) => a.scadenza.localeCompare(b.scadenza) || a.cliente.codice.localeCompare(b.cliente.codice));
  const gia = tutte.filter(o => o.scadenza < INIZIO_SCADENZIARIO && o.salvato);
  p.innerHTML = `<section class="pannello">
    <p style="margin-top:0">Queste scadenze del ${ANNO} cadevano prima dell'avvio e per ora lo Scadenziario non le mostra. Per ognuna scegli:
      <strong>Fatta</strong>, <strong>Ancora aperta</strong> (torna nello Scadenziario, tra quelle da fare) oppure <strong>Non dovuta</strong>.
      Per esempio una DF ${ANNO - 1} prorogata e non ancora depositata è "Ancora aperta".</p>
    <div class="segnali" style="margin-bottom:10px">${stato("info", `${prima.length} da decidere`)}${gia.length ? stato("ok", `${gia.length} già sistemate`) : ""}</div>
    ${prima.length ? `<div class="barra" style="margin-bottom:10px">
      <input type="search" id="f-cerca" placeholder="Cerca cliente" aria-label="Cerca cliente">
      <select id="f-cosa" aria-label="Che cosa"><option value="">Tutte le scadenze</option>${[...new Set(prima.map(o => o.servizio))].map(k => `<option value="${e(k)}">${e(NOME_SCADENZA[k] || k)}</option>`).join("")}</select>
      <button class="btn" id="tutte-fatte">✓ Segna come fatte quelle in elenco</button>
      <span class="tenue" style="font-size:13px">prima segna "Ancora aperta" quelle in corso</span></div>
    <div class="scorri"><table class="tabella"><thead><tr><th>Scadenza</th><th>Cliente</th><th>Che cosa</th><th>Responsabile</th><th></th></tr></thead><tbody>
      ${prima.map(o => `<tr data-id="${e(o.id)}" data-serv="${e(o.servizio)}" data-cli="${e(normNome(`${o.cliente.codice} ${o.cliente.ragioneSociale}`))}"><td style="white-space:nowrap">${e(fmtData(o.scadenza))}</td><td>${e(o.cliente.codice)} · ${e(o.cliente.ragioneSociale)}</td>
        <td>${e(o.etichetta || NOME_SCADENZA[o.servizio] || o.servizio)}</td><td>${e(o.respNome || "")}</td>
        <td style="white-space:nowrap"><button class="btn piccolo" data-st="Fatto">✓ Fatta</button> <button class="btn piccolo" data-st="Da fare">Ancora aperta</button> <button class="btn piccolo" data-st="Non dovuto">Non dovuta</button></td></tr>`).join("")}
    </tbody></table></div>` : '<div class="vuoto">Tutte le scadenze prima dell\'avvio sono sistemate.</div>'}
  </section>`;
  const u = D.utenteCorrente();
  const salva = async (o, st) => {
    const ora = new Date().toISOString();
    await D.salvaScadenza(datiScadenza(o, { stato: st, ...(st === "Fatto" ? { fattoIl: ora, fattoDa: u.nome } : {}),
      cronologia: [...(o.cronologia || []), { quando: ora, nome: u.nome, testo: `Situazione di partenza: ${st === "Da fare" ? "ancora aperta" : st === "Fatto" ? "fatta prima dell'avvio" : "non dovuta"}` }] }));
  };
  p.querySelectorAll("[data-st]").forEach(b => b.addEventListener("click", async () => {
    const tr = b.closest("tr"), o = prima.find(x => x.id === tr.dataset.id);
    b.disabled = true; await salva(o, b.dataset.st); tr.remove();
    avviso(b.dataset.st === "Da fare" ? "Rimessa tra le scadenze aperte" : b.dataset.st === "Fatto" ? "Segnata come fatta" : "Segnata come non dovuta");
  }));
  const filtra = () => {
    const q = normNome(p.querySelector("#f-cerca").value), k = p.querySelector("#f-cosa").value;
    p.querySelectorAll("tbody tr[data-id]").forEach(tr => { tr.hidden = (q && !tr.dataset.cli.includes(q)) || (k && tr.dataset.serv !== k); });
  };
  p.querySelector("#f-cerca")?.addEventListener("input", filtra);
  p.querySelector("#f-cosa")?.addEventListener("change", filtra);
  p.querySelector("#tutte-fatte")?.addEventListener("click", async () => {
    const restano = [...p.querySelectorAll("tbody tr[data-id]")].filter(tr => !tr.hidden).map(tr => prima.find(x => x.id === tr.dataset.id)).filter(Boolean);
    if (!restano.length) return;
    if (!confirm(`Segnare come fatte le ${restano.length} scadenze in elenco?`)) return;
    for (const o of restano) await salva(o, "Fatto");
    avviso(`${restano.length} scadenze segnate come fatte`); ricarica();
  });
}

// ---------- tabella a righe per inserire più cose insieme ----------
function righeVuote(n, riga) { return Array.from({ length: n }, (_, i) => riga(i)).join(""); }
async function datiBase() {
  const [clienti, utenti] = await Promise.all([D.listaClienti(), D.listaUtenti().catch(() => [])]);
  const cl = clienti.filter(c => c.stato !== "Cessato").sort((a, b) => (a.codice || "").localeCompare(b.codice || ""));
  const nomeCli = c => `${c.codice} · ${c.ragioneSociale}`;
  const persone = utenti.filter(x => x.attivo !== false && x.ruolo).map(x => ({ uid: x.id, nome: x.nome || x.id }));
  const u = D.utenteCorrente(); if (!persone.some(x => x.uid === u.uid)) persone.push({ uid: u.uid, nome: u.nome });
  const trova = t => { t = (t || "").trim(); if (!t) return null; return cl.find(c => nomeCli(c) === t) || cl.find(c => c.codice === t.split(" ")[0]) || cl.find(c => normNome(c.ragioneSociale) === normNome(t)); };
  return { cl, nomeCli, persone, trova, u };
}

// ---------- 2. Pratiche in corso ----------
async function schedaPratiche(p, ricarica) {
  const { cl, nomeCli, persone, trova, u } = await datiBase();
  const aperte = (await D.listaPratiche().catch(() => [])).filter(x => x.fase !== "Conclusa" && x.fase !== "Annullata");
  const fasi = FASI_PRATICA.filter(f => f !== "Conclusa" && f !== "Annullata");
  const riga = () => `<tr><td><input class="t-cli" list="pl-cli" placeholder="Cliente"></td>
    <td><input class="t-tipo" list="pl-tipo" placeholder="Tipo"></td><td><input class="t-tit" placeholder="Descrizione (es. Reclamo DF 2024)"></td>
    <td><select class="t-fase">${fasi.map(f => `<option${f === "In attesa dell'ente" ? " selected" : ""}>${e(f)}</option>`).join("")}</select></td>
    <td><input class="t-inv" placeholder="gg.mm.aaaa" inputmode="decimal" style="width:110px"></td><td><input class="t-contr" placeholder="gg.mm.aaaa" inputmode="decimal" style="width:110px"></td>
    <td><select class="t-resp">${persone.map(x => `<option value="${e(x.uid)}"${x.uid === u.uid ? " selected" : ""}>${e(x.nome)}</option>`).join("")}</select></td></tr>`;
  p.innerHTML = `<section class="pannello">
    <p style="margin-top:0">Inserisci le pratiche già avviate e non ancora concluse (assegni, reclami, rateizzazioni, permessi…). Compila solo le righe che servono:
      <strong>Inviata il</strong> è la data in cui avete scritto all'ente; <strong>Prossimo controllo</strong> vuoto = calcolato dal tipo di pratica.</p>
    ${aperte.length ? `<p class="tenue" style="font-size:13px">Nel gestionale ci sono già ${aperte.length} pratiche aperte: <a href="#/pratiche">vedi Pratiche</a>.</p>` : ""}
    <div class="scorri"><table class="tabella tab-ins"><thead><tr><th>Cliente</th><th>Tipo</th><th>Descrizione</th><th>Fase</th><th>Inviata il</th><th>Prossimo controllo</th><th>Responsabile</th></tr></thead>
      <tbody id="righe">${righeVuote(6, riga)}</tbody></table></div>
    <datalist id="pl-cli">${cl.map(c => `<option value="${e(nomeCli(c))}"></option>`).join("")}</datalist>
    <datalist id="pl-tipo">${TIPI_PRATICA.map(([t]) => `<option value="${e(t)}"></option>`).join("")}</datalist>
    <div class="azioni"><button class="btn" id="piu">+ Altre righe</button><button class="btn primario" id="salva-p">Salva le pratiche</button></div></section>`;
  p.querySelector("#piu").addEventListener("click", () => p.querySelector("#righe").insertAdjacentHTML("beforeend", righeVuote(5, riga)));
  p.querySelector("#salva-p").addEventListener("click", async () => {
    const oggi = oggiISO(), daSalvare = [];
    for (const tr of p.querySelectorAll("#righe tr")) {
      const v = s => tr.querySelector(s).value.trim();
      if (!v(".t-cli") && !v(".t-tit") && !v(".t-tipo")) continue;
      const c = trova(v(".t-cli"));
      if (!c) { tr.querySelector(".t-cli").focus(); avviso(`Cliente non trovato: «${v(".t-cli")}». Sceglilo dall'elenco`); return; }
      const inv = v(".t-inv") ? parseData(v(".t-inv")) : null, contr = v(".t-contr") ? parseData(v(".t-contr")) : null;
      if ((v(".t-inv") && !inv) || (v(".t-contr") && !contr)) { avviso("Data non valida: usa gg.mm.aaaa"); return; }
      const tipo = v(".t-tipo") || "Altro", att = ATTESA_TIPO[tipo] || 21, fase = tr.querySelector(".t-fase").value;
      const resp = persone.find(x => x.uid === tr.querySelector(".t-resp").value);
      daSalvare.push({ clienteId: c.id, tipo, ente: ENTE_TIPO[tipo] || "", titolo: v(".t-tit") || tipo, fase, attesa: att,
        apertaIl: inv || oggi, inviataIl: inv, prossimoControllo: contr || (inv ? aggiungiGiorni(inv, att) : aggiungiGiorni(oggi, 3)),
        responsabileUid: resp?.uid || u.uid, responsabileNome: resp?.nome || u.nome, solleciti: 0, creatoDa: u.uid, fatturazione: { modo: "Forfait" },
        passi: [{ quando: new Date().toISOString(), nome: u.nome, fase, testo: `Pratica già in corso prima del gestionale${inv ? `, inviata all'ente il ${fmtData(inv)}` : ""}` }] });
    }
    if (!daSalvare.length) { avviso("Nessuna riga compilata"); return; }
    for (const x of daSalvare) await D.salvaPratica(x);
    avviso(`${daSalvare.length} pratiche inserite`); ricarica();
  });
}

// ---------- 3. Compiti in corso ----------
async function schedaCompiti(p, ricarica) {
  const { cl, nomeCli, persone, trova, u } = await datiBase();
  const riga = () => `<tr><td><input class="t-tit" placeholder="Cosa c'è da fare"></td><td><input class="t-cli" list="cl-cli" placeholder="Cliente (vuoto = interno)"></td>
    <td><select class="t-ass">${persone.map(x => `<option value="${e(x.uid)}"${x.uid === u.uid ? " selected" : ""}>${e(x.nome)}</option>`).join("")}</select></td>
    <td><input class="t-entro" placeholder="gg.mm.aaaa" inputmode="decimal" style="width:110px"></td>
    <td><select class="t-prio">${PRIORITA.slice().reverse().map(([k, n]) => `<option value="${k}">${e(n)}</option>`).join("")}</select></td>
    <td><select class="t-st"><option>Da fare</option><option>Preso in carico</option><option>In attesa</option></select></td></tr>`;
  p.innerHTML = `<section class="pannello">
    <p style="margin-top:0">Inserisci i lavori già avviati o da fare che non sono ancora nel gestionale. Ogni riga diventa un compito, visibile a tutto lo studio.</p>
    <div class="scorri"><table class="tabella tab-ins"><thead><tr><th>Cosa c'è da fare</th><th>Cliente</th><th>Assegnato a</th><th>Entro il</th><th>Priorità</th><th>Stato</th></tr></thead>
      <tbody id="righe">${righeVuote(6, riga)}</tbody></table></div>
    <datalist id="cl-cli">${cl.map(c => `<option value="${e(nomeCli(c))}"></option>`).join("")}</datalist>
    <div class="azioni"><button class="btn" id="piu">+ Altre righe</button><button class="btn primario" id="salva-c">Salva i compiti</button></div></section>`;
  p.querySelector("#piu").addEventListener("click", () => p.querySelector("#righe").insertAdjacentHTML("beforeend", righeVuote(5, riga)));
  p.querySelector("#salva-c").addEventListener("click", async () => {
    const daSalvare = [], ora = new Date().toISOString();
    for (const tr of p.querySelectorAll("#righe tr")) {
      const v = s => tr.querySelector(s).value.trim();
      if (!v(".t-tit")) continue;
      const c = v(".t-cli") ? trova(v(".t-cli")) : null;
      if (v(".t-cli") && !c) { tr.querySelector(".t-cli").focus(); avviso(`Cliente non trovato: «${v(".t-cli")}»`); return; }
      const entro = v(".t-entro") ? parseData(v(".t-entro")) : null;
      if (v(".t-entro") && !entro) { avviso("Data non valida: usa gg.mm.aaaa"); return; }
      const ass = persone.find(x => x.uid === tr.querySelector(".t-ass").value), st = tr.querySelector(".t-st").value;
      daSalvare.push({ titolo: v(".t-tit"), clienteId: c?.id || null, assegnatoUid: ass.uid, assegnatoNome: ass.nome, scadenza: entro, priorita: tr.querySelector(".t-prio").value,
        stato: st, motivoAttesa: st === "In attesa" ? "Già in attesa prima del gestionale" : "", tipo: ass.uid !== u.uid ? "Delega" : "Da fare", visibilita: "studio",
        creato: ora, autoreNome: u.nome, cronologia: [{ quando: ora, nome: u.nome, testo: "Compito già in corso prima del gestionale" }] });
    }
    if (!daSalvare.length) { avviso("Nessuna riga compilata"); return; }
    for (const x of daSalvare) await D.salvaCompito(x);
    avviso(`${daSalvare.length} compiti inseriti`); ricarica();
  });
}

// ---------- 4. Onorari e ore extra già fatturati prima dell'avvio ----------
async function schedaFatturato(p, ricarica) {
  const lim = limiteFatt || `${ANNO}-09-30`;
  const [clienti, fatture, reg, utenti] = await Promise.all([D.listaClienti(), D.listaFatture().catch(() => []),
    D.listaRegistrazioniPeriodo(`${ANNO}-01-01`, lim, true).catch(() => []), D.listaUtenti().catch(() => [])]);
  const fattPer = new Set(fatture.map(f => f.id));
  const mmDi = Object.fromEntries(clienti.map(c => [c.id, mandatiDi(c)]));
  const tariffeUt = Object.fromEntries(utenti.filter(x => x.tariffa).map(x => [x.id, Number(x.tariffa)]));
  const lavoro = reg.filter(r => r.tipo !== "nota" && (r.minuti || 0) > 0 && !r.praticaId).map(r => ({ ...r, tf: tipoFatturazione(r),
    mand: mmDi[r.clienteId] && !clienteSpeciale(clienti.find(c => c.id === r.clienteId)) ? mandatoDiRegistrazione(r, mmDi[r.clienteId]) : "nonAttribuito" })).map(r => ({ ...r, tf: tfDiMandato(r.tf, r.mand) }));
  const periodi = [];
  for (const c of clienti) {
    if (clienteSpeciale(c)) continue;
    for (const [k] of TIPI_MANDATO) {
      const m = mmDi[c.id][k]; if (!m.attivo || !aForfait(m)) continue;
      for (const per of periodiFatturazione(freqMandato(k, m), ANNO)) {
        const id = `${c.id}_${k}_${per.periodo}`;
        if (per.a > lim || fattPer.has(id)) continue;
        const ids = lavoro.filter(r => r.clienteId === c.id && r.mand === k && (r.tf === "mandato" || r.tf === "non") && r.data >= per.da && r.data <= per.a && !r.fatturataIl).map(r => r.id);
        periodi.push({ id, c, k, per, importo: Math.round(Number(m.budget) * per.quota * 100) / 100, ids });
      }
    }
  }
  periodi.sort((a, b) => a.c.codice.localeCompare(b.c.codice) || a.per.da.localeCompare(b.per.da));
  const extra = lavoro.filter(r => !r.fatturataIl && (r.tf === "extra" || (r.tf === "mandato" && (r.mand === "nonAttribuito" || !aForfait(mmDi[r.clienteId]?.[r.mand])))));
  const valExtra = extra.reduce((s, r) => s + valoreOra(r, mmDi[r.clienteId], tariffeUt), 0);
  const tot = periodi.reduce((s, x) => s + x.importo, 0);
  p.innerHTML = `<section class="pannello">
    <p style="margin-top:0">Gli onorari ${ANNO} che avete già fatturato prima del gestionale risultano ancora "da fatturare" nel Report e nel budget. Indica fino a quando avete fatturato e segnali in un colpo solo.</p>
    <div class="barra" style="margin-bottom:12px"><label for="lim" style="margin:0">Fatturato fino al</label><input id="lim" value="${e(fmtData(lim))}" style="width:120px" inputmode="decimal">
      <button class="btn" id="agg">Aggiorna l'elenco</button></div>
    <h3 style="font-size:15px">Onorari dei mandati (${periodi.length} periodi · CHF ${fmtNum(tot)})</h3>
    ${periodi.length ? `<div class="scorri" style="max-height:420px"><table class="tabella"><thead><tr><th><input type="checkbox" id="tutti" checked aria-label="Tutti"></th><th>Cliente</th><th>Mandato</th><th>Periodo</th><th class="num">CHF</th><th class="num">Ore da chiudere</th></tr></thead><tbody>
      ${periodi.map(x => `<tr><td><input type="checkbox" class="sel" data-id="${e(x.id)}" checked></td><td>${e(x.c.codice)} · ${e(x.c.ragioneSociale)}</td><td>${e(NOME_MANDATO[x.k])}</td>
        <td>${e(x.per.etichetta)}</td><td class="num">${fmtNum(x.importo)}</td><td class="num">${x.ids.length || ""}</td></tr>`).join("")}</tbody></table></div>
      <div class="azioni"><button class="btn primario" id="segna">✓ Segna i selezionati come già fatturati</button></div>`
      : `<div class="vuoto">Nessun periodo da segnare fino al ${e(fmtData(lim))}. Gli onorari si calcolano dai mandati con onorario annuo.</div>`}
    <h3 style="font-size:15px;margin-top:20px">Ore extra e a ore registrate fino al ${e(fmtData(lim))} e non ancora segnate fatturate</h3>
    ${extra.length ? `<p>${extra.length} registrazioni · ${fmtDurata(extra.reduce((s, r) => s + r.minuti, 0))} · valore CHF ${fmtNum(valExtra)}.
      Se le avete già fatturate tutte, chiudile qui; se no lasciale e fatturale dal Report (Ore extra e spese).</p>
      <div class="azioni" style="justify-content:flex-start"><button class="btn" id="extra">✓ Segna queste ore come già fatturate</button></div>`
      : '<p class="tenue">Nessuna.</p>'}
  </section>`;
  p.querySelector("#agg").addEventListener("click", () => { const d = parseData(p.querySelector("#lim").value); if (!d) { avviso("Data non valida"); return; } limiteFatt = d; ricarica(); });
  p.querySelector("#tutti")?.addEventListener("change", ev => p.querySelectorAll(".sel").forEach(x => { x.checked = ev.target.checked; }));
  p.querySelector("#segna")?.addEventListener("click", async () => {
    const scelti = periodi.filter(x => p.querySelector(`.sel[data-id="${CSS.escape(x.id)}"]`)?.checked);
    if (!scelti.length) { avviso("Nessun periodo selezionato"); return; }
    if (!confirm(`Segnare ${scelti.length} periodi (CHF ${fmtNum(scelti.reduce((s, x) => s + x.importo, 0))}) come già fatturati prima del gestionale? Le loro ore si chiudono.`)) return;
    const u = D.utenteCorrente();
    for (const x of scelti) {
      await D.salvaFattura({ id: x.id, clienteId: x.c.id, mandato: x.k, periodo: x.per.periodo, importo: x.importo, stato: "Fatturata", fatturataIl: x.per.a,
        fatturataDa: u.nome, primaAvvio: true, registrazioni: x.ids });
      if (x.ids.length) await D.aggiornaRegistrazioni(x.ids, { fatturataIl: x.per.a, fatturaRif: x.id });
    }
    avviso(`${scelti.length} periodi segnati come fatturati`); ricarica();
  });
  p.querySelector("#extra")?.addEventListener("click", async () => {
    if (!confirm(`Segnare come già fatturate ${extra.length} registrazioni di ore extra fino al ${fmtData(lim)}?`)) return;
    await D.aggiornaRegistrazioni(extra.map(r => r.id), { fatturataIl: lim, fatturaRif: "prima_avvio" });
    avviso("Ore extra segnate come fatturate"); ricarica();
  });
}
