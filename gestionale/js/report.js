// Modulo Report (amministratori e chi ha il permesso di fatturazione):
// cosa fatturare (forfait dei periodi chiusi, ore extra, pratiche), redditività dei mandati, dettaglio ore.
import * as D from "./data.js";
import { e, avviso, stato } from "./ui.js";
import { fmtData, fmtNum, fmtDurata, oggiISO, periodoDi, spostaPeriodo, mandatiDi, TIPI_MANDATO, NOME_MANDATO,
  freqMandato, periodiFatturazione, aForfait, tipoFatturazione, importoPratica, minutiPrevisti, valoreOra, esitoMandato, TARIFFA_BASE, clienteSpeciale, NOME_CATEGORIA, fuoriIva, totaliSpese } from "./regole.js";
import { mostraRicevuta } from "./ricevute.js";
import { mandatoDiRegistrazione } from "./mandati.js";

let periodo = "trimestre", rif = oggiISO(), vista = "fatturare", fCli = "", fMand = "", fChi = "";
const TARIFFA = 150;
const PER = [["mese", "Mese"], ["trimestre", "Trimestre"], ["anno", "Anno"]];
const QUOTA = { mese: 1 / 12, trimestre: 1 / 4, anno: 1 };
const ESITO = { ok: ["ok", "Redditizio"], urgente: ["urgente", "Al limite"], scaduto: ["scaduto", "In perdita"] };
const ETI_FATT = { mandato: "Nel mandato", extra: "Extra", non: "Non fatturabile", pratica: "Pratica" };
const h = m => fmtDurata(Math.round(m || 0));
const chf = n => fmtNum(n || 0);

export async function vistaReport(el) {
  if (!D.puoFatturare()) { el.innerHTML = `<div class="pannello">Non hai accesso ai report.</div>`; return; }
  const oggi = oggiISO(), P = periodoDi(periodo, rif), { da, a } = P;
  const inizioAnno = `${da.slice(0, 4)}-01-01`;
  const [clienti, utenti, reg, fatture, pratiche, spese] = await Promise.all([D.listaClienti(), D.listaUtenti().catch(() => []),
    D.listaRegistrazioniPeriodo(inizioAnno, a, true), D.listaFatture().catch(() => []), D.listaPratiche().catch(() => []), D.listaSpese("2000-01-01", a).catch(() => [])]);
  const cliPer = Object.fromEntries(clienti.map(c => [c.id, c]));
  const mmDi = Object.fromEntries(clienti.map(c => [c.id, mandatiDi(c)]));
  const tariffaDi = id => Number(mmDi[id]?.contabilita.tariffa) || TARIFFA;
  const tariffeUt = Object.fromEntries(utenti.filter(x => x.tariffa).map(x => [x.id, Number(x.tariffa)]));
  const valR = r => valoreOra(r, mmDi[r.clienteId], tariffeUt);
  const fattPer = Object.fromEntries(fatture.map(f => [f.id, f]));
  const nomeCli = id => cliPer[id] ? `${cliPer[id].codice} · ${cliPer[id].ragioneSociale}` : "–";
  const lavoro = reg.filter(r => r.tipo !== "nota" && (r.minuti || 0) > 0).map(r => ({ ...r, tf: tipoFatturazione(r), mand: r.praticaId ? "pratica" : mmDi[r.clienteId] ? mandatoDiRegistrazione(r, mmDi[r.clienteId]) : "nonAttribuito" }));
  const filtra = r => (!fCli || r.clienteId === fCli) && (!fMand || r.mand === fMand) && (!fChi || r.autoreUid === fChi);
  const nelPeriodo = lavoro.filter(r => r.data >= da && r.data <= a && filtra(r));
  const clientiVeri = clienti.filter(c => !clienteSpeciale(c) && (!fCli || c.id === fCli)).sort((x, y) => (x.codice || "").localeCompare(y.codice || ""));

  // --- forfait: periodi chiusi che terminano nel periodo scelto ---
  const forfait = [];
  for (const c of clientiVeri) for (const [k] of TIPI_MANDATO) {
    const m = mmDi[c.id][k];
    if (!m.attivo || !aForfait(m) || (fMand && fMand !== k)) continue;
    for (const p of periodiFatturazione(freqMandato(k, m), +da.slice(0, 4))) {
      if (p.a < da || p.a > a) continue;
      const rr = lavoro.filter(r => r.clienteId === c.id && r.mand === k && (r.tf === "mandato" || r.tf === "non") && r.data >= p.da && r.data <= p.a && (!fChi || r.autoreUid === fChi));
      const minuti = rr.reduce((s, r) => s + r.minuti, 0), valore = rr.reduce((s, r) => s + valR(r), 0);
      const importo = Math.round(Number(m.budget) * p.quota * 100) / 100;
      const id = `${c.id}_${k}_${p.periodo}`;
      // tutte le ore del periodo (anche degli altri collaboratori): si chiudono quando il periodo è fatturato
      const idsPeriodo = lavoro.filter(r => r.clienteId === c.id && r.mand === k && (r.tf === "mandato" || r.tf === "non") && r.data >= p.da && r.data <= p.a && !r.fatturataIl).map(r => r.id);
      forfait.push({ id, c, k, p, importo, minuti, idsPeriodo, chiuso: p.a < oggi, fatt: fattPer[id], ...esitoMandato(importo, minuti, valore, minutiPrevisti(importo, mmDi[c.id].contabilita.tariffa)) });
    }
  }
  const forfaitDaFatt = forfait.filter(x => x.chiuso && !x.fatt);

  // --- ore extra e mandati a ore: da fatturare a parte ---
  const aParte = nelPeriodo.filter(r => r.tf === "extra" || (r.tf === "mandato" && r.mand !== "nonAttribuito" && r.mand !== "pratica" && !aForfait(mmDi[r.clienteId]?.[r.mand])) || (r.tf === "mandato" && r.mand === "nonAttribuito"));
  const extraAperte = aParte.filter(r => !r.fatturataIl);
  const perCliExtra = {};
  extraAperte.forEach(r => { (perCliExtra[r.clienteId] = perCliExtra[r.clienteId] || []).push(r); });
  const importoExtra = r => valR(r);
  const totExtra = extraAperte.reduce((s, r) => s + importoExtra(r), 0);

  // --- spese da riaddebitare: tutte quelle non ancora fatturate fino alla fine del periodo ---
  const speseAperte = spese.filter(x => x.riaddebito && !x.fatturataIl && (!fCli || x.clienteId === fCli) && (!fChi || x.autoreUid === fChi));
  const perCliSpese = {};
  speseAperte.forEach(x => { (perCliSpese[x.clienteId] = perCliSpese[x.clienteId] || []).push(x); });
  const totSpese = totaliSpese(speseAperte).tot;
  const daRimborsare = spese.filter(x => x.anticipataDa && !x.rimborsataIl);
  const perPersRimb = {};
  daRimborsare.forEach(x => { (perPersRimb[x.anticipataDa] = perPersRimb[x.anticipataDa] || []).push(x); });
  const clientiBlocchi = [...new Set([...Object.keys(perCliExtra), ...Object.keys(perCliSpese)])].sort((x, y) => nomeCli(x).localeCompare(nomeCli(y)));

  // --- pratiche concluse da fatturare ---
  const minPrat = {}; lavoro.filter(r => r.praticaId).forEach(r => { minPrat[r.praticaId] = (minPrat[r.praticaId] || 0) + r.minuti; });
  const pratDaFatt = pratiche.filter(p => p.fase === "Conclusa" && p.fatturazione?.modo !== "Non fatturare" && p.fatturazione?.stato !== "Fatturata" && (!fCli || p.clienteId === fCli));
  const impPrat = p => importoPratica({ ...p, fatturazione: { ...p.fatturazione, tariffa: Number(p.fatturazione?.tariffa) || tariffaDi(p.clienteId) } }, minPrat[p.id] || 0);
  const totPrat = pratDaFatt.reduce((s, p) => s + impPrat(p), 0);
  const totForf = forfaitDaFatt.reduce((s, x) => s + x.importo, 0);

  el.innerHTML = `
  <div class="testata">
    <div><h1>Report</h1><div class="tenue">${e(P.etichetta)}${fCli ? " · " + e(nomeCli(fCli)) : ""}${fMand ? " · " + e(NOME_MANDATO[fMand] || "Pratiche") : ""}</div></div>
    <div class="barra">
      <div class="segmenti" role="radiogroup" aria-label="Periodo">${PER.map(([k, n]) => `<button type="button" role="radio" data-p="${k}" aria-checked="${k === periodo}">${n}</button>`).join("")}</div>
      <button class="btn" id="p-prec" aria-label="Precedente">◀</button><span class="per-eti">${e(P.etichetta)}</span><button class="btn" id="p-succ" aria-label="Successivo">▶</button>
    </div>
  </div>
  <div class="barra" style="margin-bottom:14px">
    <div class="segmenti" role="radiogroup" aria-label="Report">${[["fatturare", "Da fatturare"], ["redditivita", "Redditività mandati"], ["dettaglio", "Dettaglio ore"]].map(([k, n]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${k === vista}">${n}</button>`).join("")}</div>
    <select id="f-cli" aria-label="Cliente"><option value="">Tutti i clienti</option>${clientiVeri.length || fCli ? clienti.filter(c => !clienteSpeciale(c)).sort((x, y) => (x.codice || "").localeCompare(y.codice || "")).map(c => `<option value="${e(c.id)}"${c.id === fCli ? " selected" : ""}>${e(nomeCli(c.id))}</option>`).join("") : ""}</select>
    <select id="f-mand" aria-label="Mandato"><option value="">Tutti i mandati</option>${TIPI_MANDATO.map(([k, n]) => `<option value="${k}"${k === fMand ? " selected" : ""}>${e(n)}</option>`).join("")}<option value="pratica"${fMand === "pratica" ? " selected" : ""}>Pratiche</option></select>
    <select id="f-chi" aria-label="Collaboratore"><option value="">Tutti i collaboratori</option>${utenti.filter(x => x.ruolo).map(x => `<option value="${e(x.id)}"${x.id === fChi ? " selected" : ""}>${e(x.nome || x.id)}</option>`).join("")}</select>
  </div>
  <div id="corpo-r"></div>`;

  const corpo = el.querySelector("#corpo-r");
  if (vista === "fatturare") corpo.innerHTML = htmlFatturare();
  else if (vista === "redditivita") corpo.innerHTML = htmlRedditivita();
  else corpo.innerHTML = htmlDettaglio();

  function htmlFatturare() {
    return `<div class="kpi-d" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi-c princ"><span class="tenue">Totale da fatturare</span><strong>CHF ${chf(totForf + totExtra + totPrat + totSpese)}</strong><span class="tenue">periodi chiusi entro il ${e(fmtData(a < oggi ? a : oggi))}</span></div>
      <div class="kpi-c"><span class="tenue">Onorari dei mandati</span><strong>CHF ${chf(totForf)}</strong><span class="tenue">${forfaitDaFatt.length} periodi chiusi</span></div>
      <div class="kpi-c"><span class="tenue">Ore extra e spese</span><strong>CHF ${chf(totExtra + totSpese)}</strong><span class="tenue">${h(extraAperte.reduce((s, r) => s + r.minuti, 0))} non fatturate · spese CHF ${chf(totSpese)}</span></div>
      <div class="kpi-c"><span class="tenue">Pratiche concluse</span><strong>CHF ${chf(totPrat)}</strong><span class="tenue">${pratDaFatt.length} da fatturare</span></div>
    </div>
    <div class="azioni" style="margin:0 0 12px"><button class="btn" id="csv-fatt">Esporta tutto il da fatturare (CSV)</button></div>

    <section class="pannello sez-d"><div class="testa-d"><h2>Mandati a onorario</h2><span class="tenue" style="font-size:13px">Periodi che terminano in ${e(P.etichetta)}, con le ore impiegate nel periodo</span></div>
    ${forfait.length ? `<div class="scorri"><table class="tabella"><thead><tr><th>Cliente</th><th>Mandato</th><th>Periodo</th><th class="num">Onorario CHF</th><th>Ore impiegate / preventivate</th><th class="num">Valore ore</th><th>Esito</th><th></th></tr></thead><tbody>
      ${forfait.sort((x, y) => (x.fatt ? 1 : 0) - (y.fatt ? 1 : 0) || x.p.a.localeCompare(y.p.a) || x.c.codice.localeCompare(y.c.codice)).map(x => `<tr${x.fatt ? ' class="fatturato"' : ""}>
        <td><a href="#/clienti/${encodeURIComponent(x.c.id)}/mandati">${e(nomeCli(x.c.id))}</a></td><td>${e(NOME_MANDATO[x.k])}</td><td>${e(x.p.etichetta)}${x.chiuso ? "" : ' <span class="tenue">(in corso)</span>'}</td>
        <td class="num">${chf(x.importo)}</td><td>${barraOre(x.minuti, x.minutiPreventivati)}</td><td class="num">${chf(x.valore)}</td>
        <td>${x.esito ? stato(...ESITO[x.esito]) : ""}</td>
        <td class="num">${x.fatt ? stato("ok", `Fatturato ${fmtData(x.fatt.fatturataIl)}`) : x.chiuso ? `<button class="btn piccolo" data-forf="${e(x.id)}">✓ Fatturato</button>` : ""}</td></tr>`).join("")}
      </tbody></table></div>` : '<div class="vuoto">Nessun mandato a forfait con un periodo che termina qui. Il forfait si imposta nel mandato del cliente (budget annuo e fatturazione).</div>'}
    </section>

    <section class="pannello sez-d"><div class="testa-d"><h2>Ore extra e spese da fatturare</h2><span class="tenue" style="font-size:13px">Ore: extra mandato, mandati senza forfait e clienti occasionali di ${e(P.etichetta)} · Spese: tutte quelle da riaddebitare non ancora fatturate</span></div>
    ${clientiBlocchi.length ? clientiBlocchi.map(cid => { const l = perCliExtra[cid] || [], sp = perCliSpese[cid] || [], ts = totaliSpese(sp), te = l.reduce((s, r) => s + importoExtra(r), 0); return `
      <div class="blocco-extra"><div class="testa-d"><h3>${e(nomeCli(cid))} <span class="tenue">· CHF ${chf(te + ts.tot)}${l.length ? ` · ${h(l.reduce((s, r) => s + r.minuti, 0))} = CHF ${chf(te)}${mmDi[cid]?.contabilita.tariffa ? ` (tariffa concordata ${chf(tariffaDi(cid))})` : ""}` : ""}${sp.length ? ` · spese CHF ${chf(ts.tot)}${ts.fuoriIva ? ` (di cui fuori IVA ${chf(ts.fuoriIva)})` : ""}` : ""}</span></h3>
        <div class="barra"><button class="btn piccolo" data-stampa="${e(cid)}">Rapporto per il cliente</button><button class="btn piccolo primario" data-extra="${e(cid)}">✓ Fatturate</button></div></div>
      ${l.length ? `<table class="tabella"><thead><tr><th>Data</th><th>Chi</th><th>Descrizione registrata</th><th style="width:34%">Voce per la fattura</th><th class="num">Ore</th><th class="num">CHF</th></tr></thead><tbody>
      ${l.sort((x, y) => x.data.localeCompare(y.data)).map(r => `<tr><td style="white-space:nowrap">${e(fmtData(r.data))}</td><td>${e(r.autoreNome || "")}</td>
        <td class="desc-r">${e(r.descrizione)}${r.tf === "mandato" ? `<div class="tenue">${r.mand === "nonAttribuito" ? "cliente senza mandato" : "mandato a ore"}</div>` : ""}</td>
        <td><textarea class="voce-f" data-reg="${e(r.id)}" rows="2" placeholder="Testo breve per la fattura (vuoto = descrizione)">${e(r.voceFattura || "")}</textarea></td>
        <td class="num">${h(r.minuti)}</td><td class="num">${chf(importoExtra(r))}</td></tr>`).join("")}</tbody></table>` : ""}
      ${sp.length ? `<table class="tabella tab-spese"><thead><tr><th>Data</th><th>Chi</th><th>Spesa</th><th>Descrizione</th><th>IVA</th><th></th><th class="num">CHF</th></tr></thead><tbody>
      ${sp.sort((x, y) => x.data.localeCompare(y.data)).map(x => `<tr><td style="white-space:nowrap">${e(fmtData(x.data))}</td><td>${e(x.autoreNome || "")}</td><td>${e(NOME_CATEGORIA[x.categoria] || "")}${x.km ? ` <span class="tenue">(${e(String(x.km))} km)</span>` : ""}</td>
        <td class="desc-r">${e(x.descrizione || "")}</td><td>${fuoriIva(x) ? stato("neutro", "Fuori IVA") : "con IVA"}</td>
        <td>${x.haRicevuta ? `<button class="btn piccolo" data-ric="${e(x.id)}" aria-label="Vedi la ricevuta">📎</button>` : '<span class="tenue" style="font-size:12px">senza ricevuta</span>'}</td><td class="num">${chf(x.importo)}</td></tr>`).join("")}</tbody></table>` : ""}
      </div>`; }).join("")
      : '<div class="vuoto">Nessuna ora extra o spesa da fatturare.</div>'}
    ${aParte.length > extraAperte.length ? `<p class="tenue" style="font-size:13px">${aParte.length - extraAperte.length} registrazioni del periodo sono già state fatturate.</p>` : ""}
    </section>

    ${Object.keys(perPersRimb).length ? `<section class="pannello sez-d"><div class="testa-d"><h2>Spese da rimborsare ai collaboratori</h2><span class="tenue" style="font-size:13px">Pagate di tasca propria · si rimborsano con lo stipendio</span></div>
      <table class="tabella"><thead><tr><th>Collaboratore</th><th class="num">Spese</th><th class="num">CHF</th><th></th></tr></thead><tbody>
      ${Object.entries(perPersRimb).map(([uid, l]) => `<tr><td>${e(l[0].anticipataNome || uid)}</td><td class="num">${l.length}</td><td class="num">${chf(totaliSpese(l).tot)}</td>
        <td class="num"><button class="btn piccolo" data-rimb="${e(uid)}">✓ Rimborsate</button></td></tr>`).join("")}</tbody></table></section>` : ""}

    <section class="pannello sez-d"><div class="testa-d"><h2>Pratiche concluse da fatturare</h2><a href="#/pratiche" class="tenue">Apri Pratiche</a></div>
    ${pratDaFatt.length ? `<table class="tabella"><thead><tr><th>Cliente</th><th>Pratica</th><th>Conclusa</th><th>Modo</th><th class="num">Ore</th><th class="num">CHF</th></tr></thead><tbody>
      ${pratDaFatt.map(p => `<tr><td>${e(nomeCli(p.clienteId))}</td><td>${e(p.titolo || p.tipo)}</td><td>${e(fmtData(p.conclusaIl))}</td><td>${e(p.fatturazione?.modo || "A ore")}</td><td class="num">${minPrat[p.id] ? h(minPrat[p.id]) : "–"}</td><td class="num">${chf(impPrat(p))}</td></tr>`).join("")}</tbody></table>
      <p class="tenue" style="font-size:13px">Si segnano come fatturate nella pagina Pratiche.</p>` : '<div class="vuoto">Nessuna pratica da fatturare.</div>'}
    </section>`;
  }

  function htmlRedditivita() {
    const q = QUOTA[periodo], righe = [];
    for (const c of clientiVeri) for (const [k, n] of TIPI_MANDATO) {
      const m = mmDi[c.id][k];
      if (!m.attivo || !aForfait(m) || (fMand && fMand !== k)) continue;
      const rr = nelPeriodo.filter(r => r.clienteId === c.id && r.mand === k && (r.tf === "mandato" || r.tf === "non"));
      const minuti = rr.reduce((s, r) => s + r.minuti, 0), valore = rr.reduce((s, r) => s + valR(r), 0);
      const extra = nelPeriodo.filter(r => r.clienteId === c.id && r.mand === k && r.tf === "extra").reduce((s, r) => s + r.minuti, 0);
      const forf = Math.round(Number(m.budget) * q * 100) / 100;
      righe.push({ c, k, n, forf, minuti, extra, ...esitoMandato(forf, minuti, valore, minutiPrevisti(forf, mmDi[c.id].contabilita.tariffa)) });
    }
    const tot = righe.reduce((s, r) => ({ forf: s.forf + r.forf, valore: s.valore + r.valore, minuti: s.minuti + r.minuti }), { forf: 0, valore: 0, minuti: 0 });
    const margine = tot.forf - tot.valore, esitoTot = esitoMandato(tot.forf, tot.minuti, tot.valore, 0).esito;
    const perTipo = TIPI_MANDATO.map(([k, n]) => { const l = righe.filter(r => r.k === k); return { k, n, forf: l.reduce((s, r) => s + r.forf, 0), valore: l.reduce((s, r) => s + r.valore, 0), minuti: l.reduce((s, r) => s + r.minuti, 0), perdita: l.filter(r => r.esito === "scaduto").length, num: l.length }; }).filter(x => x.num);
    righe.sort((x, y) => x.margine - y.margine);
    return `<p class="tenue nota-d">Onorario del periodo = onorario annuo × ${periodo === "anno" ? "1" : periodo === "trimestre" ? "¼" : "1/12"}. Le ore impiegate (comprese le non fatturabili, escluse extra e pratiche) sono valutate alla tariffa concordata con il cliente o, se manca, a quella di chi ha lavorato (impostata in Utenti). Ore previste = onorario ÷ tariffa (CHF 150 se non concordata). Per la contabilità il confronto più affidabile è sull'anno, perché il lavoro di un trimestre si fa spesso nel trimestre dopo.</p>
    <div class="kpi-d" style="grid-template-columns:repeat(4,1fr)">
      <div class="kpi-c princ"><span class="tenue">Margine sugli onorari</span><strong class="${margine < 0 ? "neg" : ""}">CHF ${chf(margine)}</strong>${esitoTot ? stato(...ESITO[esitoTot]) : ""}</div>
      <div class="kpi-c"><span class="tenue">Onorari del periodo</span><strong>CHF ${chf(tot.forf)}</strong><span class="tenue">${righe.length} mandati a forfait</span></div>
      <div class="kpi-c"><span class="tenue">Valore delle ore impiegate</span><strong>CHF ${chf(tot.valore)}</strong><span class="tenue">${h(tot.minuti)}</span></div>
      <div class="kpi-c"><span class="tenue">Tariffa effettiva media</span><strong>${tot.minuti ? "CHF " + chf(tot.forf / (tot.minuti / 60)) + "/h" : "–"}</strong><span class="tenue">onorario ÷ ore impiegate</span></div>
    </div>
    ${perTipo.length > 1 ? `<div class="kpi-s">${perTipo.map(t => `<div class="kpi-b fermo"><span class="tenue">${e(t.n)}</span><strong class="${t.forf - t.valore < 0 ? "neg" : ""}">CHF ${chf(t.forf - t.valore)}</strong><span class="tenue">${t.num} mandati${t.perdita ? ` · ${t.perdita} in perdita` : ""}</span></div>`).join("")}</div>` : ""}
    <section class="pannello sez-d"><div class="testa-d"><h2>Per mandato</h2><div class="legenda"><span><i class="s-fat"></i>Ore impiegate</span><span><i class="s-vuoto"></i>Ore preventivate</span><span><i class="s-oltre"></i>Oltre il preventivo</span></div></div>
    ${righe.length ? `<div class="scorri"><table class="tabella"><thead><tr><th>Cliente</th><th>Mandato</th><th class="num">Onorario</th><th style="min-width:220px">Ore impiegate / preventivate</th><th class="num">Valore ore</th><th class="num">Margine</th><th class="num">CHF/h effettivi</th><th>Esito</th></tr></thead><tbody>
      ${righe.map(r => `<tr><td><a href="#/clienti/${encodeURIComponent(r.c.id)}/mandati">${e(nomeCli(r.c.id))}</a></td><td>${e(r.n)}${r.extra ? `<div class="tenue">+ ${h(r.extra)} extra fatturate a parte</div>` : ""}</td>
        <td class="num">${chf(r.forf)}</td><td>${barraOre(r.minuti, r.minutiPreventivati)}</td><td class="num">${chf(r.valore)}</td>
        <td class="num"><span class="${r.margine < 0 ? "neg" : ""}">${chf(r.margine)}</span></td><td class="num">${r.tariffaEffettiva != null ? chf(r.tariffaEffettiva) : "–"}</td>
        <td>${r.minuti ? stato(...ESITO[r.esito]) : stato("neutro", "Nessuna ora")}</td></tr>`).join("")}
      <tr class="totale"><td colspan="2"><strong>Totale</strong></td><td class="num"><strong>${chf(tot.forf)}</strong></td><td>${h(tot.minuti)}</td><td class="num">${chf(tot.valore)}</td><td class="num"><strong class="${margine < 0 ? "neg" : ""}">${chf(margine)}</strong></td><td></td><td></td></tr></tbody></table></div>`
      : '<div class="vuoto">Nessun mandato a forfait. Imposta il budget annuo nei mandati dei clienti.</div>'}
    </section>`;
  }

  function htmlDettaglio() {
    const l = nelPeriodo.slice().sort((x, y) => x.data.localeCompare(y.data) || nomeCli(x.clienteId).localeCompare(nomeCli(y.clienteId)));
    const somma = t => l.filter(r => r.tf === t).reduce((s, r) => s + r.minuti, 0);
    const prat = Object.fromEntries(pratiche.map(p => [p.id, p]));
    return `<div class="kpi-s">${[["mandato", "Nel mandato", "ok"], ["extra", "Extra", "urgente"], ["pratica", "Pratiche", "info"], ["non", "Non fatturabili", "neutro"]].map(([k, n, t]) => `<div class="kpi-b fermo"><span class="stato ${t}">${n}</span><strong>${h(somma(k))}</strong></div>`).join("")}</div>
    <section class="pannello sez-d"><div class="testa-d"><h2>${l.length} registrazioni · ${h(l.reduce((s, r) => s + r.minuti, 0))}</h2>
      <div class="barra">${fCli ? `<button class="btn" data-stampa="${e(fCli)}" data-tutte="1">Rapporto ore per il cliente</button>` : '<span class="tenue" style="font-size:13px">Scegli un cliente per stampare il suo rapporto</span>'}<button class="btn" id="csv-det">Esporta (CSV)</button></div></div>
    ${l.length ? `<div class="scorri"><table class="tabella"><thead><tr><th>Data</th><th>Chi</th><th>Cliente</th><th>Mandato / pratica</th><th>Fatturazione</th><th>Descrizione</th><th class="num">Ore</th></tr></thead><tbody>
      ${l.map(r => `<tr><td style="white-space:nowrap">${e(fmtData(r.data))}</td><td>${e(r.autoreNome || "")}</td><td>${e(nomeCli(r.clienteId))}</td>
        <td>${r.praticaId ? e(prat[r.praticaId]?.titolo || "Pratica") : e(NOME_MANDATO[r.mand] || "–")}</td>
        <td>${stato(r.tf === "mandato" ? "ok" : r.tf === "extra" ? "urgente" : r.tf === "pratica" ? "info" : "neutro", ETI_FATT[r.tf])}${r.fatturataIl ? `<div class="tenue">fatturata ${e(fmtData(r.fatturataIl))}</div>` : ""}</td>
        <td class="desc-r">${e(r.voceFattura || r.descrizione)}</td><td class="num">${h(r.minuti)}</td></tr>`).join("")}</tbody></table></div>` : '<div class="vuoto">Nessuna registrazione con questi filtri.</div>'}
    </section>`;
  }

  // --- eventi ---
  const ricarica = () => vistaReport(el);
  el.querySelectorAll("[data-p]").forEach(b => b.addEventListener("click", () => { periodo = b.dataset.p; ricarica(); }));
  el.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => { vista = b.dataset.v; ricarica(); }));
  el.querySelector("#p-prec").addEventListener("click", () => { rif = spostaPeriodo(periodo, rif, -1); ricarica(); });
  el.querySelector("#p-succ").addEventListener("click", () => { rif = spostaPeriodo(periodo, rif, 1); ricarica(); });
  el.querySelector("#f-cli").addEventListener("change", ev => { fCli = ev.target.value; ricarica(); });
  el.querySelector("#f-mand").addEventListener("change", ev => { fMand = ev.target.value; ricarica(); });
  el.querySelector("#f-chi").addEventListener("change", ev => { fChi = ev.target.value; ricarica(); });
  corpo.querySelectorAll("[data-forf]").forEach(b => b.addEventListener("click", async () => {
    const x = forfait.find(y => y.id === b.dataset.forf);
    await D.salvaFattura({ id: x.id, clienteId: x.c.id, mandato: x.k, periodo: x.p.periodo, importo: x.importo, minuti: x.minuti, valoreOre: x.valore, stato: "Fatturata", fatturataIl: oggi, fatturataDa: D.utenteCorrente().nome, registrazioni: x.idsPeriodo });
    // le ore del periodo si chiudono: nel Registro non si possono più modificare
    if (x.idsPeriodo.length) await D.aggiornaRegistrazioni(x.idsPeriodo, { fatturataIl: oggi, fatturaRif: x.id });
    avviso(`Fatturato: ${x.c.ragioneSociale}, ${x.p.etichetta}`); ricarica();
  }));
  corpo.querySelectorAll("[data-extra]").forEach(b => b.addEventListener("click", async () => {
    const cid = b.dataset.extra, l = perCliExtra[cid] || [], sp = perCliSpese[cid] || [];
    const imp = l.reduce((s, r) => s + importoExtra(r), 0) + totaliSpese(sp).tot;
    if (!confirm(`Segnare come fatturate ${[l.length ? `${l.length} registrazioni di ore` : "", sp.length ? `${sp.length} spese` : ""].filter(Boolean).join(" e ")} (CHF ${chf(imp)})?`)) return;
    const rif = `extra_${cid}_${oggi}`;
    if (l.length) await D.aggiornaRegistrazioni(l.map(r => r.id), { fatturataIl: oggi, fatturaRif: rif });
    if (sp.length) await D.aggiornaSpese(sp.map(x => x.id), { fatturataIl: oggi, fatturaRif: rif });
    avviso("Segnate come fatturate"); ricarica();
  }));
  corpo.querySelectorAll("[data-rimb]").forEach(b => b.addEventListener("click", async () => {
    const l = perPersRimb[b.dataset.rimb];
    if (!confirm(`Segnare come rimborsate a ${l[0].anticipataNome || ""} ${l.length} spese (CHF ${chf(totaliSpese(l).tot)})?`)) return;
    await D.aggiornaSpese(l.map(x => x.id), { rimborsataIl: oggi }); avviso("Rimborso registrato"); ricarica();
  }));
  corpo.querySelectorAll("[data-ric]").forEach(b => b.addEventListener("click", () => mostraRicevuta(b.dataset.ric)));
  corpo.querySelectorAll(".voce-f").forEach(t => t.addEventListener("change", async () => {
    await D.aggiornaRegistrazioni([t.dataset.reg], { voceFattura: t.value.trim() }); avviso("Voce salvata");
    const r = lavoro.find(x => x.id === t.dataset.reg); if (r) r.voceFattura = t.value.trim();
  }));
  corpo.querySelectorAll("[data-stampa]").forEach(b => b.addEventListener("click", () => {
    const cid = b.dataset.stampa, tutte = !!b.dataset.tutte;
    const l = (tutte ? nelPeriodo.filter(r => r.clienteId === cid && r.tf !== "non") : perCliExtra[cid] || []).sort((x, y) => x.data.localeCompare(y.data));
    stampaRapporto(cliPer[cid], P.etichetta, l, tutte ? null : importoExtra, tutte ? [] : (perCliSpese[cid] || []).sort((x, y) => x.data.localeCompare(y.data)));
  }));
  corpo.querySelector("#csv-fatt")?.addEventListener("click", () => scaricaCsv(`Da_fatturare_${P.etichetta.replace(/\W+/g, "_")}.csv`, [
    ["Tipo", "Codice cliente", "Cliente", "Descrizione", "Periodo / data", "Ore", "Importo CHF"],
    ...forfaitDaFatt.map(x => ["Forfait", x.c.codice, x.c.ragioneSociale, `${NOME_MANDATO[x.k]} – ${x.p.etichetta}`, x.p.etichetta, (x.minuti / 60).toFixed(2), x.importo.toFixed(2)]),
    ...extraAperte.map(r => ["Ore", cliPer[r.clienteId]?.codice || "", cliPer[r.clienteId]?.ragioneSociale || "", r.voceFattura || r.descrizione, fmtData(r.data), (r.minuti / 60).toFixed(2), importoExtra(r).toFixed(2)]),
    ...speseAperte.map(x => [fuoriIva(x) ? "Spesa fuori IVA" : "Spesa", cliPer[x.clienteId]?.codice || "", cliPer[x.clienteId]?.ragioneSociale || "", `${NOME_CATEGORIA[x.categoria] || ""}: ${x.descrizione || ""}`, fmtData(x.data), "", Number(x.importo).toFixed(2)]),
    ...pratDaFatt.map(p => ["Pratica", cliPer[p.clienteId]?.codice || "", cliPer[p.clienteId]?.ragioneSociale || "", p.titolo || p.tipo, fmtData(p.conclusaIl), minPrat[p.id] ? (minPrat[p.id] / 60).toFixed(2) : "", impPrat(p).toFixed(2)])
  ]));
  corpo.querySelector("#csv-det")?.addEventListener("click", () => scaricaCsv(`Ore_${P.etichetta.replace(/\W+/g, "_")}.csv`, [
    ["Data", "Collaboratore", "Codice cliente", "Cliente", "Mandato", "Fatturazione", "Descrizione", "Voce fattura", "Ore"],
    ...nelPeriodo.map(r => [fmtData(r.data), r.autoreNome || "", cliPer[r.clienteId]?.codice || "", cliPer[r.clienteId]?.ragioneSociale || "", NOME_MANDATO[r.mand] || (r.mand === "pratica" ? "Pratica" : ""), ETI_FATT[r.tf], r.descrizione, r.voceFattura || "", (r.minuti / 60).toFixed(2)])
  ]));
}

/** Barra ore impiegate su preventivate: la parte oltre il preventivo è rossa a righe. */
function barraOre(min, prev) {
  if (!prev) return `<span>${h(min)}</span>`;
  const max = Math.max(min, prev), w = x => (x / max * 100).toFixed(1);
  const dentro = Math.min(min, prev), oltre = Math.max(0, min - prev);
  return `<div class="barra-ore" role="img" aria-label="${h(min)} su ${h(prev)} preventivate"><span class="prev" style="width:${w(prev)}%"></span>
    <span class="s-fat" style="width:${w(dentro)}%"></span>${oltre ? `<span class="oltre" style="left:${w(prev)}%;width:${w(oltre)}%"></span>` : ""}</div>
    <div class="tenue" style="font-size:12px">${h(min)} su ${h(prev)} (${Math.round(min / prev * 100)}%)</div>`;
}

function scaricaCsv(nome, righe) {
  const csv = "﻿" + righe.map(r => r.map(x => /[;"\n]/.test(String(x ?? "")) ? `"${String(x).replace(/"/g, '""')}"` : (x ?? "")).join(";")).join("\r\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Rapporto ore stampabile per il cliente (o da allegare alla fattura). */
function stampaRapporto(c, periodo, l, importo, sp = []) {
  const tot = l.reduce((s, r) => s + r.minuti, 0), tariffa = !!importo, totChf = importo ? l.reduce((s, r) => s + importo(r), 0) : 0;
  const ts = totaliSpese(sp);
  const w = window.open("", "_blank");
  if (!w) { avviso("Il browser ha bloccato la finestra: consenti i pop-up per questo sito"); return; }
  w.document.write(`<!DOCTYPE html><html lang="it"><head><meta charset="utf-8"><title>Rapporto ore ${e(c?.ragioneSociale || "")}</title>
    <style>body{font-family:Arial,sans-serif;font-size:12px;margin:32px;color:#1A1A18}h1{font-size:18px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}
    th,td{border-bottom:1px solid #ccc;padding:6px 4px;text-align:left;vertical-align:top}th{font-size:11px;color:#555}.n{text-align:right;white-space:nowrap}tfoot td{font-weight:bold;border-top:2px solid #1A1A18}</style></head><body>
    <h1>Rapporto delle prestazioni</h1><div>${e(c?.ragioneSociale || "")} (${e(c?.codice || "")}) · ${e(periodo)}</div>
    ${l.length ? `<table><thead><tr><th>Data</th><th>Prestazione</th><th class="n">Ore</th>${tariffa ? '<th class="n">CHF</th>' : ""}</tr></thead><tbody>
    ${l.map(r => `<tr><td class="n" style="text-align:left">${e(fmtData(r.data))}</td><td>${e(r.voceFattura || r.descrizione)}</td><td class="n">${(r.minuti / 60).toFixed(2)}</td>${tariffa ? `<td class="n">${fmtNum(importo(r))}</td>` : ""}</tr>`).join("")}</tbody>
    <tfoot><tr><td></td><td>Totale${tariffa ? " (IVA esclusa)" : ""}</td><td class="n">${(tot / 60).toFixed(2)}</td>${tariffa ? `<td class="n">${fmtNum(totChf)}</td>` : ""}</tr></tfoot></table>` : ""}
    ${sp.length ? `<h2 style="font-size:14px;margin-top:24px">Spese</h2><table><thead><tr><th>Data</th><th>Spesa</th><th class="n">CHF</th></tr></thead><tbody>
    ${sp.map(x => `<tr><td>${e(fmtData(x.data))}</td><td>${e(NOME_CATEGORIA[x.categoria] || "")}${x.km ? ` (${e(String(x.km))} km)` : ""}${x.descrizione && x.descrizione !== NOME_CATEGORIA[x.categoria] ? " – " + e(x.descrizione) : ""}${fuoriIva(x) ? " *" : ""}</td><td class="n">${fmtNum(x.importo)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td></td><td>Totale spese</td><td class="n">${fmtNum(ts.tot)}</td></tr></tfoot></table>
    ${ts.fuoriIva ? `<p style="font-size:11px">* Tasse ed emolumenti anticipati a nome e per conto del cliente, fuori dal campo dell'IVA: CHF ${fmtNum(ts.fuoriIva)}.</p>` : ""}` : ""}
    <script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}
