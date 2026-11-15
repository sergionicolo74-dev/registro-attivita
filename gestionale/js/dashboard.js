// Dashboard a schede: Panoramica, Collaboratori, Ricavi e budget, Andamento.
// Ogni scheda sta in una schermata; in alto restano i semafori dello studio.
// Colori del tempo (verificati per il daltonismo): nel mandato blu, extra arancio, pratiche verde acqua,
// non fatturabile grigio a righe, non registrato vuoto tratteggiato. Il nome e la cifra sono sempre scritti.
import * as D from "./data.js";
import { e, stato } from "./ui.js";
import { fmtData, fmtDurata, fmtNum, oggiISO, aggiungiGiorni, periodoDi, spostaPeriodo, colonnePeriodo, statoCopertura, mandatiDi,
  riepilogoPresenze, conVacanze, urgenzaScadenza, urgenzaCompito, aperto, daAggiornare, TIPI_MANDATO, NOME_MANDATO, PERIODI, INIZIO_SCADENZIARIO,
  urgenzaPratica, tipoFatturazione, aForfait, importoPratica, valoreOra } from "./regole.js";
import { mandatoDiRegistrazione } from "./mandati.js";
import { carica as caricaScadenze } from "./scadenziario.js";

let periodo = "mese", rif = oggiISO(), chi = null, scheda = "panoramica";
const TARIFFA = 150;
const QUOTA = { settimana: 7 / 365, mese: 1 / 12, trimestre: 1 / 4, anno: 1 };
const h = (min) => fmtDurata(Math.round(min || 0));
const perc = (a, b) => b ? Math.round(a / b * 100) : 0;
const chf = n => fmtNum(n || 0, 0);
// Composizione del tempo: chiave, nome, classe colore
const TEMPO = [["M", "Nel mandato", "c-mand"], ["X", "Extra da fatturare", "c-extra"], ["PR", "Pratiche", "c-prat"], ["N", "Non fatturabile", "c-non"], ["NR", "Non registrato", "c-nr"]];
// Composizione dei ricavi: ordine dei colori verificato anche tra primo e ultimo spicchio
const RICAVI = [["contabilita", "Contabilità e Tax", "#2a78d6"], ["funzione", "Funzione societaria", "#eb6834"], ["domiciliazione", "Domiciliazione", "#1baf7a"],
  ["intestazione", "Intestazione fiduciaria", "#6250d6"], ["extra", "Ore extra e a tariffa", "#eda100"], ["pratiche", "Pratiche", "#e87ba4"]];

export async function vistaDashboard(el) {
  const admin = D.isAdmin(), fatt = D.puoFatturare(), u = D.utenteCorrente(), oggi = oggiISO();
  if (!admin || !chi) chi = admin ? (chi || "tutti") : u.uid;
  if (!fatt && scheda === "ricavi") scheda = "panoramica";
  const P = periodoDi(periodo, rif), { da, a } = P;
  const finora = a < oggi ? a : aggiungiGiorni(oggi, -1) < da ? da : aggiungiGiorni(oggi, -1);

  const [utentiTutti, reg, presenze, vacanze, clienti, pratiche, extra] = await Promise.all([
    admin || fatt ? D.listaUtenti().catch(() => []) : Promise.resolve([]),
    D.listaRegistrazioniPeriodo(da, a, fatt),
    admin ? D.listaPresenzeStudio(da, a) : D.listaPresenze(u.uid, da, a),
    D.listaVacanze().catch(() => []), D.listaClienti(), D.listaPratiche().catch(() => []),
    admin ? caricaSemafori() : Promise.resolve(null)
  ]);
  const utenti = admin ? utentiTutti.filter(x => x.ruolo && (x.attivo !== false || reg.some(r => r.autoreUid === x.id))) : [{ id: u.uid, nome: u.nome }];
  if (!utenti.some(x => x.id === u.uid)) utenti.unshift({ id: u.uid, nome: u.nome });
  utenti.sort((x, y) => (x.id === u.uid ? -1 : y.id === u.uid ? 1 : String(x.nome).localeCompare(String(y.nome))));
  const profili = Object.fromEntries((admin ? utentiTutti : [await D.leggiProfilo(u.uid).catch(() => null) || {}]).map(x => [x.id || u.uid, x]));
  const cliPer = Object.fromEntries(clienti.map(c => [c.id, c]));
  const mmDi = Object.fromEntries(clienti.map(c => [c.id, mandatiDi(c)]));
  const tariffaDi = id => Number(mmDi[id]?.contabilita.tariffa) || TARIFFA;
  const tariffeUt = Object.fromEntries(utentiTutti.filter(x => x.tariffa).map(x => [x.id, Number(x.tariffa)]));
  const valR = r => valoreOra(r, mmDi[r.clienteId], tariffeUt);
  const scelti = chi === "tutti" ? utenti.map(x => x.id) : [chi];
  const lavoro = reg.filter(r => r.tipo !== "nota" && (r.minuti || 0) > 0).map(r => ({ ...r, tf: tipoFatturazione(r),
    mand: r.praticaId ? "pratica" : mmDi[r.clienteId] && cliPer[r.clienteId]?.codice !== "C000" ? mandatoDiRegistrazione(r, mmDi[r.clienteId]) : "nonAttribuito" }));
  const miei = lavoro.filter(r => scelti.includes(r.autoreUid));

  // --- composizione del tempo per persona (fino a ieri, confronto con la presenza) ---
  const perPersona = utenti.filter(x => scelti.includes(x.id)).map(x => {
    const rr = lavoro.filter(r => r.autoreUid === x.id && r.data <= finora);
    const pres = presenze.filter(p => p.uid === x.id);
    const t = { M: 0, X: 0, PR: 0, N: 0 };
    rr.forEach(r => { t[r.tf === "mandato" ? "M" : r.tf === "extra" ? "X" : r.tf === "pratica" ? "PR" : "N"] += r.minuti; });
    const P_ = pres.filter(p => p.data <= finora).reduce((s, p) => s + (p.minuti || 0), 0);
    const regTot = t.M + t.X + t.PR + t.N;
    t.NR = Math.max(0, P_ - regTot);
    const prof = profili[x.id] || {};
    const presMap = conVacanze(Object.fromEntries(pres.map(p => [p.data, p])), vacanze, x.id);
    const dal = prof.inizioPresenze || pres.map(p => p.data).sort()[0] || "9999-12-31";
    const rp = finora >= da ? riepilogoPresenze(presMap, prof, da, finora, dal) : { daCompilare: 0 };
    const regGiorno = {}; rr.forEach(r => { regGiorno[r.data] = (regGiorno[r.data] || 0) + r.minuti; });
    const incompleti = pres.filter(p => p.data <= finora && p.minuti > 0 && (regGiorno[p.data] || 0) < p.minuti * 0.9)
      .map(p => ({ data: p.data, pres: p.minuti, reg: regGiorno[p.data] || 0 })).sort((p, q) => p.data.localeCompare(q.data));
    return { x, t, pres: P_, reg: regTot, base: Math.max(P_, regTot), resa: perc(t.M + t.X + t.PR, Math.max(P_, regTot)), daCompilare: rp.daCompilare, incompleti, haPresenze: pres.length > 0 };
  });
  const tot = perPersona.reduce((s, p) => { TEMPO.forEach(([k]) => { s.t[k] += p.t[k]; }); s.pres += p.pres; s.reg += p.reg; s.base += p.base; return s; },
    { t: { M: 0, X: 0, PR: 0, N: 0, NR: 0 }, pres: 0, reg: 0, base: 0 });
  const resaTot = perc(tot.t.M + tot.t.X + tot.t.PR, tot.base);
  const nonReso = tot.t.N + tot.t.NR;

  // --- ricavi del periodo (solo chi può fatturare) ---
  let ricavi = null;
  if (fatt) {
    const q = QUOTA[periodo], forf = {}, valore = {};
    for (const c of clienti) for (const [k] of TIPI_MANDATO) {
      const m = mmDi[c.id][k]; if (!m.attivo || !aForfait(m) || c.stato === "Cessato") continue;
      forf[k] = (forf[k] || 0) + Number(m.budget) * q;
    }
    lavoro.forEach(r => { if (r.tf === "mandato" || r.tf === "non") valore[r.mand] = (valore[r.mand] || 0) + valR(r); });
    const aTariffa = lavoro.filter(r => r.tf === "extra" || (r.tf === "mandato" && (r.mand === "nonAttribuito" || !aForfait(mmDi[r.clienteId]?.[r.mand]))));
    const extraCHF = aTariffa.reduce((s, r) => s + valR(r), 0);
    const extraFatt = aTariffa.filter(r => r.fatturataIl).reduce((s, r) => s + valR(r), 0);
    const minPrat = {}; lavoro.filter(r => r.praticaId).forEach(r => { minPrat[r.praticaId] = (minPrat[r.praticaId] || 0) + r.minuti; });
    const pratConcluse = pratiche.filter(p => p.fase === "Conclusa" && p.conclusaIl >= da && p.conclusaIl <= a && p.fatturazione?.modo !== "Non fatturare");
    const pratCHF = pratConcluse.reduce((s, p) => s + importoPratica({ ...p, fatturazione: { ...p.fatturazione, tariffa: Number(p.fatturazione?.tariffa) || tariffaDi(p.clienteId) } }, minPrat[p.id] || 0), 0);
    const voci = RICAVI.map(([k, n, col]) => ({ k, n, col, v: k === "extra" ? extraCHF : k === "pratiche" ? pratCHF : (forf[k] || 0) }));
    ricavi = { voci, totale: voci.reduce((s, x) => s + x.v, 0), forf, valore, extraCHF, extraFatt, aTariffaMin: aTariffa.reduce((s, r) => s + r.minuti, 0), pratConcluse: pratConcluse.length };
  }

  const nomeChi = chi === "tutti" ? "Tutto lo studio" : (utenti.find(x => x.id === chi)?.nome || u.nome);
  const SCHEDE = [["panoramica", "Panoramica"], ["persone", admin ? "Collaboratori" : "Le mie ore"], ...(fatt ? [["ricavi", "Ricavi e budget"]] : []), ["andamento", "Andamento"]];

  el.innerHTML = `
  <div class="testata">
    <div><h1>Dashboard</h1><div class="tenue">${e(nomeChi)} · ${e(P.etichetta)}${a >= oggi && da <= oggi ? ` · ore confrontate fino a ${e(fmtData(finora))}` : ""}</div></div>
    <div class="barra">
      <div class="segmenti" role="radiogroup" aria-label="Periodo">${PERIODI.map(([k, n]) => `<button type="button" role="radio" data-p="${k}" aria-checked="${k === periodo}">${n}</button>`).join("")}</div>
      <button class="btn" id="p-prec" aria-label="Periodo precedente">◀</button><span class="per-eti">${e(P.etichetta)}</span><button class="btn" id="p-succ" aria-label="Periodo successivo">▶</button>
      <button class="btn" id="p-oggi">Oggi</button>
      ${admin ? `<select id="chi-d" aria-label="Collaboratore"><option value="tutti"${chi === "tutti" ? " selected" : ""}>Tutto lo studio</option>
        ${utenti.map(x => `<option value="${e(x.id)}"${chi === x.id ? " selected" : ""}>${x.id === u.uid ? "Io (" + e(x.nome) + ")" : e(x.nome || x.id)}</option>`).join("")}</select>` : ""}
    </div>
  </div>
  ${extra ? semafori(extra) : ""}
  <div class="schede schede-d" role="tablist">${SCHEDE.map(([k, n]) => `<button role="tab" aria-selected="${k === scheda}" data-s="${k}">${e(n)}</button>`).join("")}</div>
  <div id="corpo-d"></div>`;

  const corpo = el.querySelector("#corpo-d");
  if (scheda === "panoramica") corpo.innerHTML = htmlPanoramica();
  else if (scheda === "persone") corpo.innerHTML = htmlPersone();
  else if (scheda === "ricavi") corpo.innerHTML = htmlRicavi();
  else corpo.innerHTML = htmlAndamento();

  function htmlPanoramica() {
    const attr = tot.t.M + tot.t.X + tot.t.PR;
    return `<div class="tiles-d">
      ${tile("t-blu", "◷", "Ore lavorate", tot.base ? h(tot.base) : "–", tot.pres ? `${h(tot.pres)} dalla scheda presenze` : "nessuna presenza registrata")}
      ${tile("t-verde", "✓", "Attribuite ai clienti", h(attr), tot.base ? `${perc(attr, tot.base)}% delle ore lavorate` : "")}
      ${fatt && ricavi && chi === "tutti" ? tile("t-arancio", "+", "Ore extra a tariffa", `CHF ${chf(ricavi.extraCHF)}`, `${h(ricavi.aTariffaMin)} · ${chf(ricavi.extraFatt)} già fatturati`)
        : tile("t-arancio", "+", "Extra da fatturare", h(tot.t.X), tot.base ? `${perc(tot.t.X, tot.base)}% delle ore` : "")}
      ${tile("t-rosso", "!", "Tempo non reso", h(nonReso), tot.base ? `${perc(nonReso, tot.base)}% · non fatturabile ${h(tot.t.N)}, non registrato ${h(tot.t.NR)}` : "")}
    </div>
    <div class="griglia-d">
      <section class="pannello sez-d"><div class="testa-d"><h2>Come è stato usato il tempo</h2>${resaChip(resaTot, tot.base)}</div>
        ${barraTempo(tot.t, tot.base, true)}
        ${listaTempo(tot.t, tot.base)}</section>
      ${fatt && ricavi ? `<section class="pannello sez-d"><div class="testa-d"><h2>Ricavi del periodo</h2><button type="button" class="link-btn" data-s="ricavi">Dettaglio →</button></div>
        ${ciambella(ricavi.voci, ricavi.totale)}</section>`
        : `<section class="pannello sez-d"><div class="testa-d"><h2>Ore per mandato</h2></div>${barreMandato()}</section>`}
    </div>
    ${chi === "tutti" && perPersona.length > 1 ? `<section class="pannello sez-d"><div class="testa-d"><h2>Collaboratori</h2><button type="button" class="link-btn" data-s="persone">Dettaglio →</button></div>
      ${perPersona.map(p => `<button type="button" class="riga-mini" data-chi="${e(p.x.id)}"><span class="nome-p">${e(p.x.nome)}</span>${barraTempo(p.t, p.base, false)}<span class="val-p">${resaChip(p.resa, p.base)}</span></button>`).join("")}
      ${legendaTempo()}</section>` : ""}`;
  }

  function htmlPersone() {
    const max = Math.max(1, ...perPersona.map(p => p.base));
    return `<section class="pannello sez-d"><div class="testa-d"><h2>Ore lavorate e come sono state usate</h2>${legendaTempo()}</div>
      <p class="tenue nota-d">Ore lavorate = scheda presenze (o le ore registrate, se sono di più). Ogni barra è lunga quanto le ore lavorate; le percentuali sono sul totale della persona.</p>
      <div class="persone-d">${perPersona.map(p => `<div class="riga-pd" ${admin && chi === "tutti" ? `data-chi="${e(p.x.id)}" role="button" tabindex="0"` : ""}>
        <div class="testa-pd"><strong>${e(p.x.nome || p.x.id)}</strong><span class="tenue">${p.base ? h(p.base) : "nessuna ora"}${p.pres && p.reg > p.pres ? " (registrate più della presenza)" : ""}</span>${resaChip(p.resa, p.base)}
          ${p.daCompilare ? stato("urgente", `${p.daCompilare} gg senza presenza`) : ""}${!p.haPresenze && p.reg ? stato("neutro", "Presenze non compilate") : ""}</div>
        <div style="width:${(p.base / max * 100).toFixed(1)}%;min-width:120px">${barraTempo(p.t, p.base, true)}</div></div>`).join("")}</div></section>
    <section class="pannello sez-d"><table class="tabella"><thead><tr><th>Collaboratore</th><th class="num">Ore lavorate</th>${TEMPO.map(([, n]) => `<th class="num">${e(n)}</th>`).join("")}<th class="num">Resa</th></tr></thead><tbody>
      ${perPersona.map(p => `<tr><td>${e(p.x.nome)}</td><td class="num">${h(p.base)}</td>${TEMPO.map(([k]) => `<td class="num">${h(p.t[k])}<div class="tenue">${perc(p.t[k], p.base)}%</div></td>`).join("")}<td class="num"><strong>${p.base ? p.resa + "%" : "–"}</strong></td></tr>`).join("")}
      ${perPersona.length > 1 ? `<tr class="totale"><td><strong>Totale</strong></td><td class="num"><strong>${h(tot.base)}</strong></td>${TEMPO.map(([k]) => `<td class="num">${h(tot.t[k])}<div class="tenue">${perc(tot.t[k], tot.base)}%</div></td>`).join("")}<td class="num"><strong>${resaTot}%</strong></td></tr>` : ""}
    </tbody></table><p class="tenue nota-d" style="margin-top:8px">Resa = ore nel mandato + extra + pratiche, sul totale delle ore lavorate.</p></section>
    ${chi !== "tutti" ? sezioneGiorni(perPersona[0]) : ""}`;
  }

  function htmlRicavi() {
    const q = QUOTA[periodo];
    const righe = TIPI_MANDATO.map(([k, n]) => ({ k, n, forf: ricavi.forf[k] || 0, val: ricavi.valore[k] || 0 })).filter(r => r.forf || r.val);
    return `<div class="griglia-d">
      <section class="pannello sez-d"><div class="testa-d"><h2>Composizione dei ricavi</h2></div>${ciambella(ricavi.voci, ricavi.totale)}
        <p class="tenue nota-d">Onorari = onorario annuo dei mandati attivi × ${periodo === "anno" ? "1" : periodo === "trimestre" ? "¼" : periodo === "mese" ? "1/12" : "7/365"}. Ore extra e a tariffa: registrate nel periodo. Pratiche: concluse nel periodo.</p></section>
      <section class="pannello sez-d"><div class="testa-d"><h2>Onorari dei mandati: quanto è stato consumato</h2></div>
        ${righe.length ? `<div class="meter-d">${righe.map(r => { const pc = r.forf ? Math.round(r.val / r.forf * 100) : null;
          const esito = !r.forf ? null : r.val <= r.forf ? "ok" : r.val <= r.forf * 1.15 ? "urgente" : "scaduto";
          return `<div class="meter-r"><div class="meter-t"><strong>${e(r.n)}</strong><span>${pc != null ? `${pc}% dell'onorario` : "senza onorario"}</span></div>
            <div class="meter-b" role="img" aria-label="${e(r.n)}: valore ore CHF ${chf(r.val)} su onorario CHF ${chf(r.forf)}"><span class="${esito === "scaduto" ? "oltre" : esito === "urgente" ? "limite" : "ok"}" style="width:${Math.min(100, pc || 0)}%"></span></div>
            <div class="meter-t tenue"><span>ore CHF ${chf(r.val)} · onorario CHF ${chf(r.forf)}</span>${esito ? stato(esito, esito === "ok" ? `margine CHF ${chf(r.forf - r.val)}` : `oltre di CHF ${chf(r.val - r.forf)}`) : ""}</div></div>`; }).join("")}</div>`
          : '<div class="vuoto">Nessun mandato a forfait.</div>'}
        <p class="tenue nota-d">Valore delle ore nel mandato (anche non fatturabili) alla tariffa concordata o di chi ha lavorato, confrontato con la quota di onorario del periodo. <a href="#/report">Report → Redditività</a> per il dettaglio per cliente.</p></section>
    </div>
    <div class="tiles-d" style="grid-template-columns:repeat(3,1fr)">
      ${tile("t-arancio", "+", "Ore extra e a tariffa", `CHF ${chf(ricavi.extraCHF)}`, `${h(ricavi.aTariffaMin)} nel periodo`)}
      ${tile("t-verde", "✓", "Di cui già fatturate", `CHF ${chf(ricavi.extraFatt)}`, `${perc(ricavi.extraFatt, ricavi.extraCHF)}% · da fatturare CHF ${chf(ricavi.extraCHF - ricavi.extraFatt)}`)}
      ${tile("t-viola", "▣", "Pratiche concluse", `CHF ${chf(ricavi.voci.find(v => v.k === "pratiche").v)}`, `${ricavi.pratConcluse} nel periodo`)}
    </div>`;
  }

  function htmlAndamento() {
    const colonne = colonnePeriodo(periodo, da, a).map(c => {
      const rr = miei.filter(r => r.data >= c.da && r.data <= c.a), pp = presenze.filter(p => scelti.includes(p.uid) && p.data >= c.da && p.data <= c.a);
      return { ...c, fat: rr.filter(r => r.fatturabile).reduce((s, r) => s + r.minuti, 0), non: rr.filter(r => !r.fatturabile).reduce((s, r) => s + r.minuti, 0), pres: pp.reduce((s, p) => s + (p.minuti || 0), 0), futuro: c.da > oggi };
    });
    const regTutto = miei.reduce((s, r) => s + r.minuti, 0);
    const perCli = {}; miei.forEach(r => { const g = perCli[r.clienteId || "-"] = perCli[r.clienteId || "-"] || { fat: 0, non: 0, c: cliPer[r.clienteId] }; g[r.fatturabile ? "fat" : "non"] += r.minuti; });
    const rc = Object.values(perCli).sort((p, q) => (q.fat + q.non) - (p.fat + p.non));
    return `<section class="pannello sez-d"><div class="testa-d"><h2>Andamento delle ore</h2>${legenda("andamento")}</div>${graficoAndamento(colonne, periodo)}</section>
    <div class="griglia-d">
      <section class="pannello sez-d"><div class="testa-d"><h2>Ore per mandato</h2></div>${barreMandato()}</section>
      <section class="pannello sez-d"><div class="testa-d"><h2>Clienti con più ore</h2></div>
        ${rc.length ? barreOrizz(rc.slice(0, 8).map(x => ({ nome: x.c ? `${x.c.codice} · ${x.c.ragioneSociale}` : "Senza cliente", fat: x.fat, non: x.non, link: x.c ? `#/clienti/${encodeURIComponent(x.c.id)}/ore` : null })), regTutto) : '<div class="vuoto">Nessuna ora nel periodo.</div>'}</section>
    </div>`;
  }

  function barreMandato() {
    const g = {}; miei.forEach(r => { const k = r.mand; g[k] = g[k] || { fat: 0, non: 0 }; g[k][r.fatturabile ? "fat" : "non"] += r.minuti; });
    const righe = [...TIPI_MANDATO, ["pratica", "Pratiche (fuori mandato)"], ["nonAttribuito", "Non attribuite / occasionali"]].map(([k, n]) => ({ nome: n, ...(g[k] || { fat: 0, non: 0 }) })).filter(x => x.fat + x.non);
    return righe.length ? barreOrizz(righe, miei.reduce((s, r) => s + r.minuti, 0)) : '<div class="vuoto">Nessuna ora nel periodo.</div>';
  }

  // --- eventi ---
  const ricarica = () => vistaDashboard(el);
  el.querySelectorAll("[data-p]").forEach(b => b.addEventListener("click", () => { periodo = b.dataset.p; ricarica(); }));
  el.querySelector("#p-prec").addEventListener("click", () => { rif = spostaPeriodo(periodo, rif, -1); ricarica(); });
  el.querySelector("#p-succ").addEventListener("click", () => { rif = spostaPeriodo(periodo, rif, 1); ricarica(); });
  el.querySelector("#p-oggi").addEventListener("click", () => { rif = oggiISO(); ricarica(); });
  el.querySelector("#chi-d")?.addEventListener("change", ev => { chi = ev.target.value; ricarica(); });
  el.querySelectorAll("[data-s]").forEach(b => b.addEventListener("click", () => { scheda = b.dataset.s; ricarica(); }));
  el.querySelectorAll("[data-chi]").forEach(b => {
    const vai = () => { chi = b.dataset.chi; scheda = "persone"; ricarica(); };
    b.addEventListener("click", vai); b.addEventListener("keydown", ev => { if (ev.key === "Enter") vai(); });
  });
}

function tile(cl, ic, titolo, valore, sotto) {
  return `<div class="tile-d ${cl}"><span class="tile-ic" aria-hidden="true">${ic}</span><div><div class="tile-t">${e(titolo)}</div><div class="tile-v">${e(valore)}</div><div class="tile-s">${e(sotto || "")}</div></div></div>`;
}
function resaChip(resa, base) {
  if (!base) return stato("neutro", "Nessuna ora");
  return stato(resa >= 85 ? "ok" : resa >= 70 ? "urgente" : "scaduto", `Resa ${resa}%`);
}
/** Barra segmentata del tempo (100% = ore lavorate). etichette: scrive le % dentro i segmenti abbastanza larghi. */
function barraTempo(t, base, etichette) {
  if (!base) return `<div class="barra-t vuota"><span class="tenue" style="font-size:12px;padding-left:8px">nessuna ora</span></div>`;
  return `<div class="barra-t" role="img" aria-label="${TEMPO.map(([k, n]) => `${n} ${perc(t[k], base)}%`).join(", ")}">${TEMPO.map(([k, n, cl]) => {
    const p = t[k] / base * 100; if (p <= 0) return "";
    return `<span class="${cl}" style="width:${p.toFixed(2)}%" title="${e(`${n}: ${fmtDurata(Math.round(t[k]))} (${Math.round(p)}%)`)}">${etichette && p >= 9 ? Math.round(p) + "%" : ""}</span>`;
  }).join("")}</div>`;
}
function listaTempo(t, base) {
  return `<div class="lista-t">${TEMPO.map(([k, n, cl]) => `<div class="voce-t"><i class="${cl}"></i><span class="n">${e(n)}</span><span class="v">${fmtDurata(Math.round(t[k]))}</span><span class="p">${perc(t[k], base)}%</span></div>`).join("")}</div>`;
}
function legendaTempo() {
  return `<div class="legenda">${TEMPO.map(([, n, cl]) => `<span><i class="${cl}"></i>${e(n)}</span>`).join("")}</div>`;
}
/** Ciambella dei ricavi con totale al centro e legenda con importi e percentuali (i nomi sono sempre scritti). */
function ciambella(voci, totale) {
  const v = voci.filter(x => x.v > 0);
  if (!totale) return '<div class="vuoto">Nessun ricavo nel periodo (imposta i forfait nei mandati).</div>';
  const R = 70, C = 2 * Math.PI * R, gap = v.length > 1 ? 2.5 : 0;
  let acc = 0;
  const archi = v.map(x => { const l = x.v / totale * C; const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${x.col}" stroke-width="26" stroke-dasharray="${Math.max(0, l - gap).toFixed(2)} ${(C - Math.max(0, l - gap)).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"><title>${e(x.n)}: CHF ${fmtNum(x.v)} (${perc(x.v, totale)}%)</title></circle>`; acc += l; return s; }).join("");
  return `<div class="ciambella"><svg viewBox="0 0 180 180" role="img" aria-label="Ricavi CHF ${fmtNum(totale, 0)}"><g transform="rotate(-90 90 90)">${archi}</g>
      <text x="90" y="84" text-anchor="middle" class="c-tit">Totale</text><text x="90" y="106" text-anchor="middle" class="c-val">CHF ${fmtNum(totale, 0)}</text></svg>
    <div class="lista-t">${voci.map(x => `<div class="voce-t${x.v ? "" : " zero"}"><i style="background:${x.col}"></i><span class="n">${e(x.n)}</span><span class="v">CHF ${fmtNum(x.v, 0)}</span><span class="p">${perc(x.v, totale)}%</span></div>`).join("")}</div></div>`;
}

function legenda(tipo) {
  const extra = tipo === "persone" ? '<span><i class="s-vuoto"></i>Presenza non registrata sui mandati</span>' : tipo === "andamento" ? '<span><i class="s-tacca"></i>Ore di presenza</span>' : "";
  return `<div class="legenda"><span><i class="s-fat"></i>Fatturabile</span><span><i class="s-non"></i>Non fatturabile</span>${extra}</div>`;
}

/** Una riga per collaboratore: traccia = presenza, riempimento = ore sui mandati. Stessa scala per tutti. */

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
  const [sc, compiti, vacanze, clienti, pratiche] = await Promise.all([caricaScadenze([anno - 1, anno, anno + 1]).catch(() => ({ tutte: [] })), D.listaCompiti().catch(() => []), D.listaVacanze().catch(() => []), D.listaClienti(), D.listaPratiche().catch(() => [])]);
  const oggi = oggiISO();
  const sca = sc.tutte.filter(o => o.data >= INIZIO_SCADENZIARIO || o.salvato);
  return {
    scadute: sca.filter(o => urgenzaScadenza(o) === "scaduto").length,
    entro5: sca.filter(o => urgenzaScadenza(o) === "urgente").length,
    compitiScaduti: compiti.filter(k => aperto(k) && urgenzaCompito(k) === "scaduto").length,
    compitiFermi: compiti.filter(k => aperto(k) && urgenzaCompito(k) === "fermo").length,
    mandati: clienti.filter(c => c.codice !== "C000" && (!c.stato || c.stato === "Attivo") && TIPI_MANDATO.some(([k]) => daAggiornare(mandatiDi(c)[k]))).length,
    richieste: vacanze.filter(v => v.stato === "Richiesta").length,
    praticheSoll: pratiche.filter(p => urgenzaPratica(p) === "sollecitare").length,
    praticheFatt: pratiche.filter(p => p.fase === "Conclusa" && p.fatturazione?.modo !== "Non fatturare" && p.fatturazione?.stato !== "Fatturata").length,
    assenti: vacanze.filter(v => v.stato === "Approvata" && oggi >= v.dal && oggi <= (v.mezza ? v.dal : v.al)).map(v => v.nome)
  };
}
function semafori(s) {
  const voce = (n, tipo, testo, href) => `<a class="sem" href="${href}">${n ? stato(tipo, String(n)) : stato("ok", "0")}<span>${testo}</span></a>`;
  return `<div class="semafori" role="group" aria-label="Situazione dello studio">
    ${voce(s.scadute, "scaduto", "Scadenze scadute", "#/scadenziario")}${voce(s.entro5, "urgente", "Scadenze entro 5 giorni", "#/scadenziario")}
    ${voce(s.compitiScaduti, "scaduto", "Compiti scaduti", "#/compiti")}${voce(s.compitiFermi, "urgente", "Compiti fermi", "#/compiti")}
    ${voce(s.praticheSoll, "scaduto", "Pratiche da sollecitare", "#/pratiche")}${voce(s.praticheFatt, "urgente", "Pratiche da fatturare", "#/pratiche")}
    ${voce(s.mandati, "urgente", "Clienti con mandati da aggiornare", "#/mandati")}${voce(s.richieste, "urgente", "Vacanze da approvare", "#/vacanze")}
    <a class="sem" href="#/vacanze">${s.assenti.length ? stato("info", String(s.assenti.length)) : stato("ok", "0")}<span>${s.assenti.length ? "Assenti oggi: " + s.assenti.map(e).join(", ") : "Assenti oggi"}</span></a></div>`;
}
