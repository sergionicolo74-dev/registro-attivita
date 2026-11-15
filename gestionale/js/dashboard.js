// Dashboard: le ore sui mandati al centro, confrontate con le ore di presenza di ognuno.
// Colori: fatturabile = verde pieno, non fatturabile = blu a righe, non registrato = vuoto tratteggiato.
import * as D from "./data.js";
import { e, stato } from "./ui.js";
import { fmtData, fmtDurata, fmtNum, oggiISO, aggiungiGiorni, periodoDi, spostaPeriodo, colonnePeriodo, statoCopertura, mandatiDi,
  riepilogoPresenze, conVacanze, urgenzaScadenza, urgenzaCompito, aperto, daAggiornare, TIPI_MANDATO, PERIODI, INIZIO_SCADENZIARIO } from "./regole.js";
import { mandatoDiRegistrazione } from "./mandati.js";
import { carica as caricaScadenze } from "./scadenziario.js";

let periodo = "mese", rif = oggiISO(), chi = null;
const TARIFFA = 150;
const ETI_COP = { ok: "Ore registrate", urgente: "Quasi complete", scaduto: "Mancano ore" };
const h = (min) => fmtDurata(Math.round(min || 0));
const perc = (a, b) => b ? Math.round(a / b * 100) : 0;

export async function vistaDashboard(el) {
  const admin = D.isAdmin(), u = D.utenteCorrente(), oggi = oggiISO();
  if (!admin || !chi) chi = admin ? (chi || "tutti") : u.uid;
  const P = periodoDi(periodo, rif), { da, a } = P;
  const finora = a < oggi ? a : aggiungiGiorni(oggi, -1) < da ? da : aggiungiGiorni(oggi, -1);
  const anno = +rif.slice(0, 4);

  const [utentiTutti, reg, presenze, vacanze, clienti, extra] = await Promise.all([
    admin ? D.listaUtenti() : Promise.resolve([]),
    D.listaRegistrazioniPeriodo(da, a),
    admin ? D.listaPresenzeStudio(da, a) : D.listaPresenze(u.uid, da, a),
    D.listaVacanze().catch(() => []),
    D.listaClienti(),
    admin && chi === "tutti" ? caricaSemafori() : Promise.resolve(null)
  ]);
  const utenti = admin ? utentiTutti.filter(x => x.ruolo && (x.attivo !== false || reg.some(r => r.autoreUid === x.id))) : [{ id: u.uid, nome: u.nome }];
  if (!utenti.some(x => x.id === u.uid)) utenti.unshift({ id: u.uid, nome: u.nome });
  utenti.sort((x, y) => (x.id === u.uid ? -1 : y.id === u.uid ? 1 : String(x.nome).localeCompare(String(y.nome))));
  const profili = Object.fromEntries((admin ? utentiTutti : [await D.leggiProfilo(u.uid).catch(() => null) || {}]).map(x => [x.id || u.uid, x]));
  const cliPer = Object.fromEntries(clienti.map(c => [c.id, c]));
  const scelti = chi === "tutti" ? utenti.map(x => x.id) : [chi];

  // --- calcoli per persona ---
  const lavoro = reg.filter(r => r.tipo !== "nota" && (r.minuti || 0) > 0 && scelti.includes(r.autoreUid));
  const perPersona = utenti.filter(x => scelti.includes(x.id)).map(x => {
    const mie = reg.filter(r => r.autoreUid === x.id && r.tipo !== "nota");
    const regFin = mie.filter(r => r.data <= finora);
    const pres = presenze.filter(p => p.uid === x.id);
    const presMap = conVacanze(Object.fromEntries(pres.map(p => [p.data, p])), vacanze, x.id);
    const presMin = pres.filter(p => p.data <= finora).reduce((s, p) => s + (p.minuti || 0), 0);
    const regMin = regFin.reduce((s, r) => s + (r.minuti || 0), 0);
    const prof = profili[x.id] || {};
    const dal = prof.inizioPresenze || pres.map(p => p.data).sort()[0] || "9999-12-31";
    const rp = finora >= da ? riepilogoPresenze(presMap, prof, da, finora, dal) : { daCompilare: 0 };
    // giorni in cui le ore sui mandati sono meno del 90% della presenza
    const regGiorno = {}; regFin.forEach(r => { regGiorno[r.data] = (regGiorno[r.data] || 0) + (r.minuti || 0); });
    const incompleti = pres.filter(p => p.data <= finora && p.minuti > 0 && (regGiorno[p.data] || 0) < p.minuti * 0.9)
      .map(p => ({ data: p.data, pres: p.minuti, reg: regGiorno[p.data] || 0 })).sort((p, q) => p.data.localeCompare(q.data));
    return { x, regMin, fatMin: regFin.filter(r => r.fatturabile).reduce((s, r) => s + (r.minuti || 0), 0), presMin, daCompilare: rp.daCompilare, incompleti,
      regTutto: mie.reduce((s, r) => s + (r.minuti || 0), 0), haPresenze: pres.length > 0 };
  });
  const tot = perPersona.reduce((s, p) => ({ reg: s.reg + p.regTutto, regFin: s.regFin + p.regMin, fat: s.fat + p.fatMin, pres: s.pres + p.presMin }), { reg: 0, regFin: 0, fat: 0, pres: 0 });
  const fatTutto = lavoro.filter(r => r.fatturabile).reduce((s, r) => s + r.minuti, 0);
  const regTutto = lavoro.reduce((s, r) => s + r.minuti, 0);
  const valore = lavoro.filter(r => r.fatturabile).reduce((s, r) => s + r.minuti / 60 * (Number(mandatiDi(cliPer[r.clienteId] || {}).contabilita.tariffa) || TARIFFA), 0);
  const cop = statoCopertura(tot.regFin, tot.pres);

  // --- andamento ---
  const colonne = colonnePeriodo(periodo, da, a).map(c => {
    const rr = lavoro.filter(r => r.data >= c.da && r.data <= c.a), pp = presenze.filter(p => scelti.includes(p.uid) && p.data >= c.da && p.data <= c.a);
    return { ...c, fat: rr.filter(r => r.fatturabile).reduce((s, r) => s + r.minuti, 0), non: rr.filter(r => !r.fatturabile).reduce((s, r) => s + r.minuti, 0), pres: pp.reduce((s, p) => s + (p.minuti || 0), 0), futuro: c.da > oggi };
  });

  // --- per mandato e per cliente ---
  const perMandato = {};
  const perCliente = {};
  for (const r of lavoro) {
    const c = cliPer[r.clienteId], mm = mandatiDi(c || {});
    const k = c && c.codice !== "C000" ? mandatoDiRegistrazione(r, mm) : "nonAttribuito";
    const g = perMandato[k] = perMandato[k] || { fat: 0, non: 0 };
    g[r.fatturabile ? "fat" : "non"] += r.minuti;
    const pc = perCliente[r.clienteId || "-"] = perCliente[r.clienteId || "-"] || { fat: 0, non: 0, c };
    pc[r.fatturabile ? "fat" : "non"] += r.minuti;
  }
  const righeMandato = [...TIPI_MANDATO, ["nonAttribuito", "Non attribuite / occasionali"]].map(([k, n]) => ({ k, n, ...(perMandato[k] || { fat: 0, non: 0 }) })).filter(x => x.fat + x.non);
  const righeClienti = Object.values(perCliente).sort((p, q) => (q.fat + q.non) - (p.fat + p.non));

  const nomeChi = chi === "tutti" ? "Tutto lo studio" : (utenti.find(x => x.id === chi)?.nome || u.nome);

  el.innerHTML = `
  <div class="testata">
    <div><h1>Dashboard</h1><div class="tenue">${e(nomeChi)} · ${e(P.etichetta)}${a >= oggi && da <= oggi ? ` · confronto con la presenza fino a ${e(fmtData(finora))}` : ""}</div></div>
    <div class="barra">
      <div class="segmenti" role="radiogroup" aria-label="Periodo">${PERIODI.map(([k, n]) => `<button type="button" role="radio" data-p="${k}" aria-checked="${k === periodo}">${n}</button>`).join("")}</div>
      <button class="btn" id="p-prec" aria-label="Periodo precedente">◀</button><span class="per-eti">${e(P.etichetta)}</span><button class="btn" id="p-succ" aria-label="Periodo successivo">▶</button>
      <button class="btn" id="p-oggi">Oggi</button>
      ${admin ? `<select id="chi-d" aria-label="Collaboratore"><option value="tutti"${chi === "tutti" ? " selected" : ""}>Tutto lo studio</option>
        ${utenti.map(x => `<option value="${e(x.id)}"${chi === x.id ? " selected" : ""}>${x.id === u.uid ? "Io (" + e(x.nome) + ")" : e(x.nome || x.id)}</option>`).join("")}</select>` : ""}
    </div>
  </div>

  ${extra ? semafori(extra) : ""}

  <div class="kpi-d">
    <div class="kpi-c princ"><span class="tenue">Ore sui mandati</span><strong>${h(regTutto)}</strong>
      <div class="mini-barra" role="img" aria-label="${h(fatTutto)} fatturabili, ${h(regTutto - fatTutto)} non fatturabili"><div class="s-fat" style="width:${perc(fatTutto, regTutto)}%"></div><div class="s-non" style="width:${100 - perc(fatTutto, regTutto)}%"></div></div>
      <span class="tenue">${h(fatTutto)} fatturabili (${perc(fatTutto, regTutto)}%) · ${h(regTutto - fatTutto)} non fatturabili</span></div>
    <div class="kpi-c"><span class="tenue">Ore di presenza${a >= oggi ? " finora" : ""}</span><strong>${tot.pres ? h(tot.pres) : "–"}</strong><span class="tenue">${tot.pres ? "entrata–uscita, pause escluse" : "nessuna presenza registrata"}</span></div>
    <div class="kpi-c"><span class="tenue">Ore registrate sul totale presenza</span><strong>${tot.pres ? perc(tot.regFin, tot.pres) + "%" : "–"}</strong>
      ${cop ? stato(cop, ETI_COP[cop]) : ""}<span class="tenue">${tot.pres ? (tot.pres > tot.regFin ? `${h(tot.pres - tot.regFin)} non registrate sui mandati` : "tutte registrate") : ""}</span></div>
    ${admin ? `<div class="kpi-c"><span class="tenue">Valore ore fatturabili</span><strong>CHF ${fmtNum(valore, 0)}</strong><span class="tenue">alla tariffa del cliente (o CHF ${TARIFFA}/h)</span></div>` : ""}
  </div>

  ${chi === "tutti" ? `<section class="pannello sez-d"><div class="testa-d"><h2>Ore per collaboratore</h2>${legenda("persone")}</div>
    <p class="tenue nota-d">La barra intera è la presenza; la parte colorata sono le ore scritte sui mandati. Lo spazio vuoto sono ore lavorate ma non registrate.</p>
    ${graficoPersone(perPersona, tot)}</section>` : sezioneGiorni(perPersona[0])}

  <section class="pannello sez-d"><div class="testa-d"><h2>Andamento</h2>${legenda("andamento")}</div>
    ${graficoAndamento(colonne, periodo)}</section>

  <div class="due-d">
    <section class="pannello sez-d"><div class="testa-d"><h2>Ore per mandato</h2></div>
      ${righeMandato.length ? barreOrizz(righeMandato.map(x => ({ nome: x.n, fat: x.fat, non: x.non })), regTutto) : '<div class="vuoto">Nessuna ora nel periodo.</div>'}</section>
    <section class="pannello sez-d"><div class="testa-d"><h2>Clienti con più ore</h2></div>
      ${righeClienti.length ? barreOrizz(righeClienti.slice(0, 10).map(x => ({ nome: x.c ? `${x.c.codice} · ${x.c.ragioneSociale}` : "Senza cliente", fat: x.fat, non: x.non, link: x.c ? `#/clienti/${encodeURIComponent(x.c.id)}/ore` : null })), regTutto)
        + (righeClienti.length > 10 ? `<p class="tenue nota-d">Altri ${righeClienti.length - 10} clienti: ${h(righeClienti.slice(10).reduce((s, x) => s + x.fat + x.non, 0))}</p>` : "") : '<div class="vuoto">Nessuna ora nel periodo.</div>'}</section>
  </div>
  <details class="pannello sez-d"><summary><strong>Tabella dei dati</strong> <span class="tenue">(per collaboratore)</span></summary>
    <table class="tabella" style="margin-top:10px"><thead><tr><th>Collaboratore</th><th class="num">Ore sui mandati</th><th class="num">Fatturabili</th><th class="num">Presenza</th><th class="num">Registrate / presenza</th><th class="num">Giorni da compilare</th><th class="num">Giorni incompleti</th></tr></thead>
    <tbody>${perPersona.map(p => `<tr><td>${e(p.x.nome || p.x.id)}</td><td class="num">${h(p.regTutto)}</td><td class="num">${h(p.fatMin)}</td><td class="num">${p.presMin ? h(p.presMin) : "–"}</td><td class="num">${p.presMin ? perc(p.regMin, p.presMin) + "%" : "–"}</td><td class="num">${p.haPresenze ? p.daCompilare : "–"}</td><td class="num">${p.incompleti.length}</td></tr>`).join("")}
    ${perPersona.length > 1 ? `<tr class="totale"><td><strong>Totale</strong></td><td class="num"><strong>${h(tot.reg)}</strong></td><td class="num">${h(tot.fat)}</td><td class="num">${h(tot.pres)}</td><td class="num">${tot.pres ? perc(tot.regFin, tot.pres) + "%" : "–"}</td><td></td><td></td></tr>` : ""}</tbody></table></details>`;

  const ricarica = () => vistaDashboard(el);
  el.querySelectorAll("[data-p]").forEach(b => b.addEventListener("click", () => { periodo = b.dataset.p; ricarica(); }));
  el.querySelector("#p-prec").addEventListener("click", () => { rif = spostaPeriodo(periodo, rif, -1); ricarica(); });
  el.querySelector("#p-succ").addEventListener("click", () => { rif = spostaPeriodo(periodo, rif, 1); ricarica(); });
  el.querySelector("#p-oggi").addEventListener("click", () => { rif = oggiISO(); ricarica(); });
  el.querySelector("#chi-d")?.addEventListener("change", ev => { chi = ev.target.value; ricarica(); });
  el.querySelectorAll("[data-chi]").forEach(b => b.addEventListener("click", () => { chi = b.dataset.chi; ricarica(); }));
}

function legenda(tipo) {
  const extra = tipo === "persone" ? '<span><i class="s-vuoto"></i>Presenza non registrata sui mandati</span>' : tipo === "andamento" ? '<span><i class="s-tacca"></i>Ore di presenza</span>' : "";
  return `<div class="legenda"><span><i class="s-fat"></i>Fatturabile</span><span><i class="s-non"></i>Non fatturabile</span>${extra}</div>`;
}

/** Una riga per collaboratore: traccia = presenza, riempimento = ore sui mandati. Stessa scala per tutti. */
function graficoPersone(pp, tot) {
  const max = Math.max(1, ...pp.map(p => Math.max(p.presMin, p.regMin)));
  const w = m => (m / max * 100).toFixed(2);
  const riga = (p) => {
    const c = statoCopertura(p.regMin, p.presMin), non = p.regMin - p.fatMin;
    const tip = `${p.x.nome}: ${h(p.regMin)} sui mandati (${h(p.fatMin)} fatturabili) su ${p.presMin ? h(p.presMin) + " di presenza" : "presenza non registrata"}`;
    return `<button type="button" class="riga-p" data-chi="${e(p.x.id)}" title="${e(tip)}" aria-label="${e(tip)}">
      <span class="nome-p">${e(p.x.nome || p.x.id)}</span>
      <span class="traccia">${p.presMin ? `<span class="pres" style="width:${w(p.presMin)}%"></span>` : ""}
        <span class="s-fat" style="width:${w(p.fatMin)}%"></span><span class="s-non" style="left:${w(p.fatMin)}%;width:${w(non)}%"></span></span>
      <span class="val-p"><strong>${h(p.regMin)}</strong>${p.presMin ? ` <span class="tenue">su ${h(p.presMin)}</span>` : ""}</span>
      <span class="chip-p">${c ? stato(c, `${perc(p.regMin, p.presMin)}%`) : stato("neutro", "Nessuna presenza")}${p.daCompilare ? stato("urgente", `${p.daCompilare} gg da compilare`) : ""}</span></button>`;
  };
  return `<div class="grafico-p">${pp.map(riga).join("")}
    ${pp.length > 1 ? `<div class="riga-p totale-p"><span class="nome-p">Totale studio</span><span></span><span class="val-p"><strong>${h(tot.regFin)}</strong>${tot.pres ? ` <span class="tenue">su ${h(tot.pres)}</span>` : ""}</span>
      <span class="chip-p">${tot.pres ? stato(statoCopertura(tot.regFin, tot.pres), perc(tot.regFin, tot.pres) + "%") : ""}</span></div>` : ""}</div>`;
}

/** Colonne impilate (fatturabile + non fatturabile) con una tacca per la presenza: stessa scala in ore. */
function graficoAndamento(col, periodo) {
  const max = Math.max(60, ...col.map(c => Math.max(c.fat + c.non, c.pres)));
  const passo = [60, 120, 240, 480, 600, 1200, 2400, 3000, 6000, 12000, 24000].find(p => max / p <= 5) || 48000;
  const top = Math.ceil(max / passo) * passo, y = m => (m / top * 100).toFixed(2);
  const righe = []; for (let v = passo; v <= top; v += passo) righe.push(v);
  return `<div class="andamento" style="--n:${col.length}">
    <div class="asse-y">${righe.map(v => `<span style="bottom:${y(v)}%">${Math.round(v / 60)}h</span>`).join("")}</div>
    <div class="area-a">${righe.map(v => `<i class="griglia-a" style="bottom:${y(v)}%"></i>`).join("")}
      ${col.map(c => { const t = `${periodo === "anno" ? c.etichetta : fmtData(c.da) + (c.a !== c.da ? " – " + fmtData(c.a) : "")}: ${h(c.fat + c.non)} sui mandati (${h(c.fat)} fatturabili)${c.pres ? `, presenza ${h(c.pres)}` : ""}`;
        return `<div class="col-a${c.libero ? " libero" : ""}${c.futuro ? " futuro" : ""}" title="${e(t)}" tabindex="0" aria-label="${e(t)}">
          <div class="pila"><span class="s-fat" style="height:${y(c.fat)}%"></span><span class="s-non" style="height:${y(c.non)}%"></span></div>
          ${c.pres ? `<span class="tacca" style="bottom:${y(c.pres)}%"></span>` : ""}</div>`; }).join("")}</div>
    <div class="asse-x">${col.map((c, i) => `<span>${col.length > 16 && i % 2 ? "" : e(c.etichetta)}</span>`).join("")}</div></div>`;
}

function barreOrizz(righe, totale) {
  const max = Math.max(1, ...righe.map(r => r.fat + r.non));
  return `<div class="barre-o">${righe.map(r => {
    const t = r.fat + r.non, tip = `${r.nome}: ${h(t)} (${h(r.fat)} fatturabili, ${h(r.non)} non fatturabili)`;
    const nome = r.link ? `<a href="${r.link}">${e(r.nome)}</a>` : e(r.nome);
    return `<div class="riga-o" title="${e(tip)}"><span class="nome-o">${nome}</span>
      <span class="traccia-o"><span class="s-fat" style="width:${(r.fat / max * 100).toFixed(2)}%"></span><span class="s-non" style="width:${(r.non / max * 100).toFixed(2)}%"></span></span>
      <span class="val-o"><strong>${h(t)}</strong> <span class="tenue">${perc(t, totale)}%</span></span></div>`;
  }).join("")}${legenda(false)}</div>`;
}

/** Persona singola: giorni da controllare (presenza senza ore sui mandati). */
function sezioneGiorni(p) {
  if (!p) return "";
  const l = p.incompleti.slice(-12).reverse();
  return `<section class="pannello sez-d"><div class="testa-d"><h2>Giorni da controllare</h2></div>
    ${!p.haPresenze ? '<p class="tenue">Nessuna presenza registrata nel periodo: il confronto con le ore sui mandati non è possibile.</p>'
      : l.length || p.daCompilare ? `<p class="tenue nota-d">Giorni con meno del 90% della presenza registrato sui mandati${p.daCompilare ? `, e ${p.daCompilare} giorni lavorativi senza presenza` : ""}.</p>
      <table class="tabella"><thead><tr><th>Giorno</th><th class="num">Presenza</th><th class="num">Sui mandati</th><th class="num">Mancano</th></tr></thead><tbody>
      ${l.map(g => `<tr><td>${e(fmtData(g.data))}</td><td class="num">${h(g.pres)}</td><td class="num">${h(g.reg)}</td><td class="num">${stato(statoCopertura(g.reg, g.pres), h(g.pres - g.reg))}</td></tr>`).join("")}</tbody></table>`
      : `<p>${stato("ok", "Tutte le giornate sono registrate sui mandati")}</p>`}</section>`;
}

async function caricaSemafori() {
  const anno = new Date().getFullYear();
  const [sc, compiti, vacanze, clienti] = await Promise.all([caricaScadenze([anno - 1, anno, anno + 1]).catch(() => ({ tutte: [] })), D.listaCompiti().catch(() => []), D.listaVacanze().catch(() => []), D.listaClienti()]);
  const oggi = oggiISO();
  const sca = sc.tutte.filter(o => o.data >= INIZIO_SCADENZIARIO || o.salvato);
  return {
    scadute: sca.filter(o => urgenzaScadenza(o) === "scaduto").length,
    entro5: sca.filter(o => urgenzaScadenza(o) === "urgente").length,
    compitiScaduti: compiti.filter(k => aperto(k) && urgenzaCompito(k) === "scaduto").length,
    compitiFermi: compiti.filter(k => aperto(k) && urgenzaCompito(k) === "fermo").length,
    mandati: clienti.filter(c => c.codice !== "C000" && (!c.stato || c.stato === "Attivo") && TIPI_MANDATO.some(([k]) => daAggiornare(mandatiDi(c)[k]))).length,
    richieste: vacanze.filter(v => v.stato === "Richiesta").length,
    assenti: vacanze.filter(v => v.stato === "Approvata" && oggi >= v.dal && oggi <= (v.mezza ? v.dal : v.al)).map(v => v.nome)
  };
}
function semafori(s) {
  const voce = (n, tipo, testo, href) => `<a class="sem" href="${href}">${n ? stato(tipo, String(n)) : stato("ok", "0")}<span>${testo}</span></a>`;
  return `<div class="semafori" role="group" aria-label="Situazione dello studio">
    ${voce(s.scadute, "scaduto", "Scadenze scadute", "#/scadenziario")}${voce(s.entro5, "urgente", "Scadenze entro 5 giorni", "#/scadenziario")}
    ${voce(s.compitiScaduti, "scaduto", "Compiti scaduti", "#/compiti")}${voce(s.compitiFermi, "urgente", "Compiti fermi", "#/compiti")}
    ${voce(s.mandati, "urgente", "Clienti con mandati da aggiornare", "#/mandati")}${voce(s.richieste, "urgente", "Vacanze da approvare", "#/vacanze")}
    <a class="sem" href="#/vacanze">${s.assenti.length ? stato("info", String(s.assenti.length)) : stato("ok", "0")}<span>${s.assenti.length ? "Assenti oggi: " + s.assenti.map(e).join(", ") : "Assenti oggi"}</span></a></div>`;
}
