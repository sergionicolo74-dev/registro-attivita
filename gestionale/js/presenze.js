// Modulo Presenze: registrazione semplificata della durata del lavoro (art. 46 LL, art. 73b OLL 1).
// Si registra solo il totale delle ore lavorate al giorno; per le assenze solo il tipo, mai il motivo.
import * as D from "./data.js";
import { e, avviso, stato, campo, leggiForm, dataNonValida } from "./ui.js";
import { fmtData, fmtDurata, fmtSaldo, oggiISO, aggiungiGiorni, dataISO, giornoSettimana, festiviTicino, minutiDovuti, minutiCredito,
  lavoraIl, giorniLavoroDi, fmtGiorniLavoro, dirittoVacanze, parseOre, riepilogoPresenze, TIPI_ASSENZA, GIORNI, MESI, parseOrario, fmtOrario, minutiDaOrari, pausaMinima, conVacanze, lunedi, senzaOre } from "./regole.js";

const PAUSE = [0, 15, 30, 45, 60, 75, 90, 120];

let mese = oggiISO().slice(0, 7);   // "2026-11" (vista mese e panoramica)
let lun = null;                     // lunedì della settimana mostrata
let modo = "settimana";             // settimana | mese | anno
let chi = null;                     // uid mostrato
let panoramica = false;             // admin: tabella di tutto lo studio

const primoDel = m => `${m}-01`;
const ultimoDel = m => dataISO(+m.slice(0, 4), +m.slice(5, 7), 31);
const meseDopo = (m, n) => dataISO(+m.slice(0, 4), +m.slice(5, 7) + n, 1).slice(0, 7);
const nomeMese = m => `${MESI[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const ore = min => min == null ? "" : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
const breve = d => fmtData(d).slice(0, 5);
const nomeSett = l => `${breve(l)} – ${fmtData(aggiungiGiorni(l, 6))}`;
const giorni = (da, a) => { const l = []; for (let d = da; d <= a; d = aggiungiGiorni(d, 1)) l.push(d); return l; };

// Come si dividono le ore del Registro: nel mandato, extra e pratiche (fatturate a parte), non fatturabili
const CAT_REG = [["mandato", "Nei mandati", "#3F78B5"], ["extra", "Extra e pratiche", "#2E9AA6"], ["non", "Non fatturabili", "#A39C8C"]];
const catReg = r => r.fatturabile === false ? "non" : r.praticaId || r.extra || senzaOre(r.mandato) ? "extra" : "mandato";

export async function vistaPresenze(el) {
  const admin = D.isAdmin(), u = D.utenteCorrente();
  if (!chi || !admin) chi = u.uid;
  const utenti = admin ? (await D.listaUtenti()).filter(x => x.attivo !== false && x.ruolo) : [];
  if (admin && panoramica) return vistaPanoramica(el, utenti);
  const oggi = oggiISO();
  if (!lun) lun = lunedi(oggi);

  // Periodo mostrato
  let da, a, titolo;
  if (modo === "settimana") { da = lun; a = aggiungiGiorni(lun, 6); titolo = `Settimana ${nomeSett(lun)}`; }
  else if (modo === "mese") { da = primoDel(mese); a = ultimoDel(mese); titolo = nomeMese(mese); }
  else { da = `${mese.slice(0, 4)}-01-01`; a = `${mese.slice(0, 4)}-12-31`; titolo = `Anno ${mese.slice(0, 4)}`; }
  const anno = a.slice(0, 4), inizioAnno = `${anno}-01-01`;
  const caricaDa = da < inizioAnno ? da : inizioAnno;

  const [profilo, presAnno, regPer, vacanze] = await Promise.all([
    D.leggiProfilo(chi).then(p => p || {}),
    D.listaPresenze(chi, caricaDa, `${anno}-12-31`),
    chi === u.uid || admin ? D.listaRegistrazioniPeriodo(da, a).catch(() => []) : Promise.resolve([]),
    D.listaVacanze().catch(() => [])
  ]);
  // Le vacanze approvate entrano da sole nei giorni senza registrazione
  const pres = conVacanze(Object.fromEntries(presAnno.map(p => [p.data, p])), vacanze, chi, profilo);
  const regGiorno = {};   // { data: { tot, mandato, extra, non } }
  regPer.filter(r => r.autoreUid === chi && r.tipo !== "nota").forEach(r => {
    const g = regGiorno[r.data] ||= { tot: 0, mandato: 0, extra: 0, non: 0 };
    g.tot += r.minuti || 0; g[catReg(r)] += r.minuti || 0;
  });
  const dal = profilo.inizioPresenze || presAnno.map(p => p.data).sort()[0] || da;
  // Il saldo si calcola fino a oggi (se oggi è già compilato) o fino a ieri: i giorni futuri non sono ancora dovuti
  const finora = pres[oggi] ? oggi : aggiungiGiorni(oggi, -1);
  const fineCalc = a < finora ? a : finora;
  const rTutto = riepilogoPresenze(pres, profilo, da, a, dal);
  const rPer = fineCalc >= da ? riepilogoPresenze(pres, profilo, da, fineCalc, dal) : { ...rTutto, dovute: 0, saldo: 0, lavorate: 0, credito: 0, daCompilare: 0 };
  const rAnno = riepilogoPresenze(pres, profilo, inizioAnno, fineCalc < inizioAnno ? inizioAnno : fineCalc, dal);
  const saldoAnno = rAnno.saldo + (Number(profilo.saldoRiportatoMinuti) || 0);
  const fest = { ...festiviTicino(+anno), ...festiviTicino(+caricaDa.slice(0, 4)) };
  const nomeChi = admin ? (utenti.find(x => x.id === chi)?.nome || u.nome) : u.nome;
  const entStd = parseOrario(profilo.entrataStandard) ?? 480, pausaStd = profilo.pausaStandard != null && profilo.pausaStandard !== "" ? Number(profilo.pausaStandard) : 60;

  const infoGiorno = d => {
    const p = pres[d] || {}, dov = d >= dal ? minutiDovuti(profilo, d) : 0, gs = giornoSettimana(d), f = fest[d];
    const libPers = gs < 5 && !f && !lavoraIl(profilo, d); // giorno libero della persona (tempo parziale)
    const lib = gs >= 5 || f || libPers;
    return { p, dov, gs, f, libPers, lib, manca: !lib && dov && d < oggi && d >= dal && p.minuti == null && !p.assenza };
  };
  // Settimane passate (di quest'anno) con giorni da compilare
  const lunOggi = lunedi(oggi), arretrate = [];
  for (let l = lunedi(dal > inizioAnno ? dal : inizioAnno); l < lunOggi; l = aggiungiGiorni(l, 7)) {
    const n = giorni(l, aggiungiGiorni(l, 6)).filter(d => infoGiorno(d).manca).length;
    if (n) arretrate.push({ l, n });
  }

  // Totali per il grafico: ogni colonna = giorno (settimana), settimana (mese) o mese (anno)
  const somma = (gg) => gg.reduce((t, d) => {
    const i = infoGiorno(d), g = regGiorno[d] || {};
    t.dov += d <= fineCalc ? i.dov : 0; t.lav += i.p.minuti || 0; t.cred += d <= fineCalc ? minutiCredito(i.p.assenza, i.dov) : 0;
    for (const [k] of CAT_REG) t[k] += g[k] || 0;
    t.reg += g.tot || 0; t.vuoto += Math.max(0, (i.p.minuti || 0) - (g.tot || 0)); return t;
  }, { dov: 0, lav: 0, cred: 0, reg: 0, vuoto: 0, mandato: 0, extra: 0, non: 0 });
  let colonne;
  if (modo === "settimana") colonne = giorni(da, a).map(d => ({ et: `${GIORNI[giornoSettimana(d)]} ${breve(d)}`, ...somma([d]), dovTutto: infoGiorno(d).dov }));
  else if (modo === "mese") {
    colonne = [];
    for (let l = lunedi(da); l <= a; l = aggiungiGiorni(l, 7)) {
      const gg = giorni(l > da ? l : da, aggiungiGiorni(l, 6) < a ? aggiungiGiorni(l, 6) : a);
      colonne.push({ et: `${breve(gg[0])}–${breve(gg[gg.length - 1])}`, ...somma(gg), dovTutto: gg.reduce((s, d) => s + infoGiorno(d).dov, 0) });
    }
  } else colonne = MESI.map((n, i) => { const m = `${anno}-${String(i + 1).padStart(2, "0")}`; return { et: n.slice(0, 3), mese: m, ...somma(giorni(primoDel(m), ultimoDel(m))), dovTutto: 0 }; });
  const tot = colonne.reduce((t, c) => { for (const k of ["dov", "lav", "cred", "reg", "vuoto", "mandato", "extra", "non"]) t[k] += c[k]; return t; }, { dov: 0, lav: 0, cred: 0, reg: 0, vuoto: 0, mandato: 0, extra: 0, non: 0 });

  const nav = modo === "settimana" ? ["Settimana precedente", "Settimana successiva"] : modo === "mese" ? ["Mese precedente", "Mese successivo"] : ["Anno precedente", "Anno successivo"];
  const dicitura = { settimana: "della settimana", mese: "del mese", anno: "dell'anno" }[modo];
  el.innerHTML = `
  <div class="testata">
    <div><h1>Presenze</h1><div class="tenue">${e(nomeChi)} · ${e(titolo)}${arretrate.length && modo !== "anno" ? ` · <a href="#" class="chip-arr" id="vai-arr">⚠ ${arretrate.reduce((t, x) => t + x.n, 0)} giorni da compilare</a>` : ""}</div></div>
    <div class="barra">
      <div class="segmenti" role="radiogroup" aria-label="Vista">${[["settimana", "Settimana"], ["mese", "Mese"], ["anno", "Anno"]].map(([k, n]) => `<button type="button" role="radio" data-modo="${k}" aria-checked="${modo === k}">${n}</button>`).join("")}</div>
      <button class="btn" id="m-prec" aria-label="${nav[0]}">◀</button>
      <span style="min-width:150px;text-align:center;font-weight:600">${e(modo === "settimana" ? nomeSett(lun) : modo === "mese" ? nomeMese(mese) : anno)}</span>
      <button class="btn" id="m-succ" aria-label="${nav[1]}">▶</button>
      ${(modo === "settimana" && lun !== lunOggi) || (modo === "mese" && mese !== oggi.slice(0, 7)) || (modo === "anno" && anno !== oggi.slice(0, 4)) ? '<button class="btn" id="m-oggi">Oggi</button>' : ""}
      ${admin ? `<select id="chi-p" aria-label="Collaboratore">${utenti.map(x => `<option value="${e(x.id)}"${x.id === chi ? " selected" : ""}>${e(x.nome || x.id)}</option>`).join("")}</select>
        <button class="btn" id="panoramica">Tutto lo studio</button>` : ""}
      <button class="btn" id="esporta">Esporta anno (CSV)</button>
    </div>
  </div>
  ${modo === "anno" ? tabellaAnno(colonne, tot) : tabellaGiorni()}
  ${modo !== "anno" ? `<p class="tenue" style="margin-top:10px">Scrivi l'ora di entrata e di uscita (es. 8:00 e 17:30) e scegli la pausa: le ore lavorate si calcolano da sole. L'entrata si può segnare all'arrivo e l'uscita a fine giornata. Il pulsante "Standard" inserisce l'orario del profilo. Per le assenze indica solo il tipo: il motivo non si registra. Si salva da solo.</p>` : ""}
  <div class="kpi-mini">
    <div class="kpi-b fermo"><span class="tenue">Dovute ${dicitura}</span><strong>${fmtDurata(rTutto.dovute)}</strong>${rPer.dovute !== rTutto.dovute ? `<span class="tenue">${fmtDurata(rPer.dovute)} fino a ${e(fmtData(fineCalc))}</span>` : ""}</div>
    <div class="kpi-b fermo"><span class="tenue">Lavorate</span><strong>${fmtDurata(rPer.lavorate)}</strong>${rPer.credito ? `<span class="tenue">+ ${fmtDurata(rPer.credito)} assenze/vacanze</span>` : ""}</div>
    <div class="kpi-b fermo"><span class="tenue">Saldo ${dicitura}${rPer.dovute !== rTutto.dovute ? " finora" : ""}</span><strong class="${rPer.saldo < 0 ? "neg" : ""}">${fmtSaldo(rPer.saldo)}</strong></div>
    ${modo !== "anno" ? `<div class="kpi-b fermo"><span class="tenue">Saldo ${anno} fino a ${e(fmtData(fineCalc < inizioAnno ? inizioAnno : fineCalc))}</span><strong class="${saldoAnno < 0 ? "neg" : ""}">${fmtSaldo(saldoAnno)}</strong></div>` : (profilo.saldoRiportatoMinuti ? `<div class="kpi-b fermo"><span class="tenue">Saldo con il riporto</span><strong class="${saldoAnno < 0 ? "neg" : ""}">${fmtSaldo(saldoAnno)}</strong></div>` : "")}
    <div class="kpi-b fermo"><span class="tenue">Vacanze ${anno}</span><strong>${String(rAnno.vacanze).replace(".5", "½")} ${rAnno.vacanze === 1 ? "giorno" : "giorni"}</strong>${profilo.giorniVacanza ? `<span class="tenue">su ${String(dirittoVacanze(profilo)).replace(".5", "½")}</span>` : ""}</div>
    <div class="kpi-b fermo"><span class="tenue">Giorni da compilare</span><strong>${rPer.daCompilare ? stato("urgente", String(rPer.daCompilare)) : stato("ok", "0")}</strong>${modo === "settimana" && arretrate.length ? `<span class="tenue">+ ${arretrate.reduce((s, x) => s + x.n, 0)} nelle settimane passate</span>` : ""}</div>
  </div>
  ${arretrate.length && modo !== "anno" ? `<div class="pannello allerta compatto" id="arretrate" role="status">${stato("urgente", `⚠ ${arretrate.reduce((s, x) => s + x.n, 0)} giorni da compilare nelle settimane passate`)}
    <div class="arretrate">${arretrate.slice(-8).reverse().map(x => `<button type="button" class="btn piccolo" data-sett="${x.l}">${e(nomeSett(x.l))} · ${x.n} ${x.n === 1 ? "giorno" : "giorni"}</button>`).join("")}${arretrate.length > 8 ? `<span class="tenue">e altre ${arretrate.length - 8} settimane</span>` : ""}</div></div>` : ""}
  ${profilo.accordo73b ? "" : `<div class="pannello allerta compatto" role="status">${stato("urgente", "Accordo scritto mancante")}
    <span style="margin-left:8px">La registrazione semplificata (art. 73b OLL 1) richiede un accordo scritto individuale con ${e(nomeChi)}.${admin ? " Indica la data della firma in «Orario e accordo» qui sotto." : " Rivolgiti all'amministratore."}</span></div>`}
  ${graficoOre(colonne, tot, modo)}
  ${admin ? formProfilo(profilo, nomeChi) : `<div class="pannello" style="margin-top:14px"><h3 style="font-size:14px;margin-bottom:8px">Orario e accordo</h3><div class="fatti">
      <div><span>Ore settimanali</span>${e(profilo.oreSettimanali || 42)} h</div><div><span>Grado</span>${e(profilo.percentuale ?? 100)}% · ${fmtGiorniLavoro(profilo)}</div>
      <div><span>Accordo art. 73b</span>${profilo.accordo73b ? e(fmtData(profilo.accordo73b)) : "–"}</div></div></div>`}`;

  const ricarica = () => vistaPresenze(el);
  el.querySelectorAll("[data-modo]").forEach(b => b.addEventListener("click", () => {
    const prima = modo; modo = b.dataset.modo;
    if (prima === "settimana" && modo !== "settimana") mese = aggiungiGiorni(lun, 3).slice(0, 7);
    if (modo === "settimana" && prima !== "settimana") lun = mese === oggi.slice(0, 7) ? lunOggi : lunedi(primoDel(mese));
    ricarica();
  }));
  el.querySelector("#m-prec").addEventListener("click", () => { if (modo === "settimana") lun = aggiungiGiorni(lun, -7); else mese = meseDopo(mese, modo === "anno" ? -12 : -1); ricarica(); });
  el.querySelector("#m-succ").addEventListener("click", () => { if (modo === "settimana") lun = aggiungiGiorni(lun, 7); else mese = meseDopo(mese, modo === "anno" ? 12 : 1); ricarica(); });
  el.querySelector("#m-oggi")?.addEventListener("click", () => { lun = lunOggi; mese = oggi.slice(0, 7); ricarica(); });
  el.querySelectorAll("[data-sett]").forEach(b => b.addEventListener("click", ev => { ev.preventDefault(); modo = "settimana"; lun = b.dataset.sett; ricarica(); }));
  el.querySelectorAll("[data-mese]").forEach(b => b.addEventListener("click", ev => { ev.preventDefault(); modo = "mese"; mese = b.dataset.mese; ricarica(); }));
  el.querySelector("#vai-arr")?.addEventListener("click", ev => { ev.preventDefault(); el.querySelector("#arretrate")?.scrollIntoView({ behavior: "smooth", block: "center" }); });
  el.querySelector("#chi-p")?.addEventListener("change", ev => { chi = ev.target.value; ricarica(); });
  el.querySelector("#panoramica")?.addEventListener("click", () => { panoramica = true; ricarica(); });
  el.querySelector("#esporta").addEventListener("click", () => esportaAnno(nomeChi, profilo, pres, +anno, dal));

  const salvaRiga = async (tr) => {
    const d = tr.dataset.d, ent = tr.querySelector(".ent"), usc = tr.querySelector(".usc"), sel = tr.querySelector(".ass-in");
    const pausa = +tr.querySelector(".pausa").value, eMin = parseOrario(ent.value), uMin = parseOrario(usc.value);
    if (Number.isNaN(eMin)) { ent.focus(); avviso("Ora di entrata non valida: es. 8:00"); return; }
    if (Number.isNaN(uMin)) { usc.focus(); avviso("Ora di uscita non valida: es. 17:30"); return; }
    if (eMin == null && uMin != null) { ent.focus(); avviso("Manca l'ora di entrata"); return; }
    const minuti = minutiDaOrari(eMin, uMin, pausa);
    if (Number.isNaN(minuti)) { usc.focus(); avviso("L'uscita deve essere dopo l'entrata più la pausa"); return; }
    if (eMin == null && !sel.value) { if (pres[d]) await D.eliminaPresenza(chi, d); }
    else await D.salvaPresenza({ uid: chi, nome: nomeChi, data: d, entrata: eMin, uscita: uMin, pausa: eMin == null ? null : pausa, minuti, assenza: sel.value });
    avviso(minuti != null ? `Salvato: ${ore(minuti)} lavorate` : "Salvato"); ricarica();
  };
  el.querySelectorAll("tr[data-d]").forEach(tr => {
    tr.querySelectorAll(".ent, .usc, .pausa, .ass-in").forEach(x => x.addEventListener("change", () => salvaRiga(tr)));
    tr.querySelector("[data-std]")?.addEventListener("click", () => {
      const dov = minutiDovuti(profilo, tr.dataset.d);
      tr.querySelector(".ent").value = fmtOrario(entStd); tr.querySelector(".usc").value = fmtOrario(entStd + dov + pausaStd);
      tr.querySelector(".pausa").value = String(pausaStd); salvaRiga(tr);
    });
  });
  el.querySelector("#form-profilo")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = ev.target;
    if (dataNonValida(f)) { avviso("Data non valida: usa gg.mm.aaaa"); return; }
    const d = leggiForm(f), saldo = parseOre(String(d.saldoRiportato || "").replace(/^[+−-]/, ""));
    if (Number.isNaN(saldo)) { avviso("Saldo riportato non valido: es. 12:30 oppure -4:00"); return; }
    const segno = /^[−-]/.test(String(d.saldoRiportato || "").trim()) ? -1 : 1;
    if (Number.isNaN(parseOrario(d.entrataStandard))) { avviso("Entrata abituale non valida: es. 8:00"); return; }
    await D.salvaProfilo(chi, { entrataStandard: fmtOrario(parseOrario(d.entrataStandard)) || "", pausaStandard: d.pausaStandard === "" ? 60 : Number(d.pausaStandard),
      oreSettimanali: d.oreSettimanali, percentuale: d.percentuale, giorniVacanza: d.giorniVacanza, giorniLavoro: giorniDaForm(f),
      accordo73b: d.accordo73b, inizioPresenze: d.inizioPresenze, saldoRiportatoMinuti: saldo == null ? 0 : segno * saldo });
    avviso("Orario salvato"); ricarica();
  });

  function rigaGiorno(d) {
    const { p, dov, gs, f, libPers, lib, manca } = infoGiorno(d);
    const saldo = (p.minuti != null || p.assenza) ? (p.minuti || 0) + minutiCredito(p.assenza, dov) - dov : null;
    const reg = regGiorno[d]?.tot;
    return `<tr class="${lib ? "libero" : ""}${d === oggi ? " oggi" : ""}" data-d="${d}">
      <td style="white-space:nowrap"><strong>${GIORNI[gs]} ${e(breve(d))}</strong>${f ? `<div class="tenue">${e(f)}</div>` : libPers ? '<div class="tenue">giorno libero</div>' : ""}${manca ? `<div>${stato("urgente", "Da compilare")}</div>` : ""}</td>
      <td class="num">${dov ? ore(dov) : "–"}</td>
      <td><input class="t-in ent"${libPers && p.minuti == null ? " disabled" : ""} value="${e(fmtOrario(p.entrata))}" placeholder="--:--" inputmode="numeric" aria-label="Entrata ${e(fmtData(d))}"></td>
      <td><input class="t-in usc"${libPers && p.minuti == null ? " disabled" : ""} value="${e(fmtOrario(p.uscita))}" placeholder="--:--" inputmode="numeric" aria-label="Uscita ${e(fmtData(d))}"></td>
      <td><select class="pausa" aria-label="Pausa ${e(fmtData(d))}">${PAUSE.map(x => `<option value="${x}"${x === (p.pausa ?? (lib ? 0 : pausaStd)) ? " selected" : ""}>${x ? ore(x) : "nessuna"}</option>`).join("")}</select></td>
      <td class="num"><strong>${p.minuti != null ? ore(p.minuti) : p.entrata != null && p.uscita == null ? '<span class="tenue">in corso</span>' : ""}</strong>
        ${p.minuti != null && (p.pausa ?? 0) < pausaMinima(p.minuti) ? `<div>${stato("urgente", `pausa min. ${pausaMinima(p.minuti)} min`)}</div>` : ""}
        ${dov && p.minuti == null && p.entrata == null && !p.assenza && !lib ? `<div><button type="button" class="btn piccolo" data-std="1" title="Orario standard ${fmtOrario(entStd)}–${fmtOrario(entStd + dov + pausaStd)}">Standard</button></div>` : ""}</td>
      <td><select class="ass-in" aria-label="Assenza ${e(fmtData(d))}"><option value=""></option>${TIPI_ASSENZA.map(t => `<option${t === p.assenza ? " selected" : ""}>${e(t)}</option>`).join("")}</select>${p.daPiano ? '<div class="tenue" style="font-size:12px">dal piano vacanze</div>' : ""}</td>
      <td class="num">${reg ? `${fmtDurata(reg)}${p.minuti && reg > p.minuti ? `<div>${stato("urgente", "più della presenza")}</div>` : ""}` : '<span class="tenue">–</span>'}</td>
      <td class="num">${saldo == null ? "" : `<span class="${saldo < 0 ? "neg" : ""}">${fmtSaldo(saldo)}</span>`}</td></tr>`;
  }
  function rigaSettimana(gg) {
    const t = somma(gg), saldo = t.lav + t.cred - t.dov;
    return `<tr class="tot-sett"><td colspan="5">Settimana ${e(breve(gg[0]))} – ${e(breve(gg[gg.length - 1]))}</td><td class="num">${fmtDurata(t.lav)}</td><td></td>
      <td class="num">${t.reg ? fmtDurata(t.reg) : "–"}</td><td class="num"><span class="${saldo < 0 ? "neg" : ""}">${t.dov || t.lav ? fmtSaldo(saldo) : ""}</span></td></tr>`;
  }
  function tabellaGiorni() {
    const gg = giorni(da, a);
    let righe = "";
    if (modo === "settimana") righe = gg.map(rigaGiorno).join("");
    else { let blocco = []; gg.forEach((d, i) => { righe += rigaGiorno(d); blocco.push(d); if (giornoSettimana(d) === 6 || i === gg.length - 1) { righe += rigaSettimana(blocco); blocco = []; } }); }
    return `<div class="pannello" style="padding:0"><div class="scorri"><table class="tabella presenze"><thead><tr><th>Giorno</th><th class="num">Dovute</th><th>Entrata</th><th>Uscita</th><th>Pausa</th><th class="num">Lavorate</th><th>Assenza</th><th class="num">Registro ore</th><th class="num">Saldo</th></tr></thead><tbody>${righe}</tbody></table></div></div>`;
  }
}

/** Grafico: per ogni colonna le ore di presenza divise in ore registrate (per tipo) e ore non registrate; la tacca nera sono le ore dovute. */
function graficoOre(col, tot, modo) {
  const max = Math.max(60, ...col.map(c => Math.max(c.lav, c.reg, c.dov, c.dovTutto || 0)));
  // non registrate = per ogni giorno la presenza che manca nel Registro ore
  const nonReg = tot.vuoto, perc = tot.lav ? Math.round((tot.lav - nonReg) / tot.lav * 100) : 0;
  const barra = c => {
    const pz = CAT_REG.map(([k, n, col]) => c[k] ? `<span class="gb-pz" style="height:${c[k] / max * 100}%;background:${col}" title="${e(n)}: ${fmtDurata(c[k])}"></span>` : "").join("");
    const vuoto = c.vuoto;
    const dov = c.dovTutto || c.dov;
    return `<div class="gb-col" title="${e(c.et)} · presenza ${fmtDurata(c.lav)} · registrate ${fmtDurata(c.reg)}${vuoto ? ` · non registrate ${fmtDurata(vuoto)}` : ""}${dov ? ` · dovute ${fmtDurata(dov)}` : ""}">
      <div class="gb-area">${dov ? `<span class="gb-dov" style="bottom:${dov / max * 100}%"></span>` : ""}
        <div class="gb-stack">${vuoto ? `<span class="gb-pz gb-vuoto" style="height:${vuoto / max * 100}%" title="Non registrate: ${fmtDurata(vuoto)}"></span>` : ""}${pz}</div></div>
      <div class="gb-et">${e(c.et)}</div><div class="gb-v">${c.lav ? fmtDurata(c.lav) : ""}</div></div>`;
  };
  return `<section class="pannello graf-ore">
    <div class="gb-testa"><h3 style="font-size:15px;margin:0">Presenza e ore registrate</h3>
      <div class="gb-sintesi">Presenza <strong>${fmtDurata(tot.lav)}</strong> · nel Registro ore <strong>${fmtDurata(tot.reg)}</strong>${tot.lav ? ` (${perc}%)` : ""} · non registrate <strong>${fmtDurata(nonReg)}</strong></div></div>
    <div class="gb-grafico${modo === "anno" ? " anno" : ""}">${col.map(barra).join("")}</div>
    <div class="gb-legenda">${CAT_REG.map(([k, n, c]) => `<span><i style="background:${c}"></i>${e(n)} ${fmtDurata(tot[k])}</span>`).join("")}<span><i class="gb-vuoto"></i>Presenza non registrata ${fmtDurata(nonReg)}</span><span><i class="gb-tacca"></i>Ore dovute</span></div>
  </section>`;
}

function tabellaAnno(col, tot) {
  const riga = (c, et, link) => { const saldo = c.lav + c.cred - c.dov, vuoto = c.vuoto;
    return `<tr><td>${link ? `<a href="#" data-mese="${c.mese}">${e(et)}</a>` : `<strong>${e(et)}</strong>`}</td><td class="num">${c.dov ? fmtDurata(c.dov) : "–"}</td><td class="num">${c.lav ? fmtDurata(c.lav) : "–"}</td>
      <td class="num">${c.cred ? fmtDurata(c.cred) : "–"}</td><td class="num">${c.dov || c.lav ? `<span class="${saldo < 0 ? "neg" : ""}">${fmtSaldo(saldo)}</span>` : ""}</td>
      <td class="num">${c.reg ? fmtDurata(c.reg) : "–"}</td><td class="num">${vuoto ? fmtDurata(vuoto) : "–"}</td><td class="num">${c.lav ? Math.round((c.lav - vuoto) / c.lav * 100) + "%" : ""}</td></tr>`; };
  return `<div class="pannello" style="padding:0"><div class="scorri"><table class="tabella"><thead><tr><th>Mese</th><th class="num">Dovute</th><th class="num">Lavorate</th><th class="num">Assenze e vacanze</th><th class="num">Saldo</th><th class="num">Nel Registro ore</th><th class="num">Non registrate</th><th class="num">Presenza registrata</th></tr></thead>
    <tbody>${col.map(c => riga(c, MESI[+c.mese.slice(5, 7) - 1], true)).join("")}</tbody><tfoot>${riga(tot, "Totale", false)}</tfoot></table></div></div>
    <p class="tenue" style="margin-top:8px;font-size:13px">Clic su un mese per vederlo settimana per settimana. Il saldo conta i giorni fino a oggi.</p>`;
}

function formProfilo(p, nome) {
  const sr = Number(p.saldoRiportatoMinuti) || 0;
  return `<form class="pannello" id="form-profilo" style="margin-top:14px"><h3 style="font-size:14px;margin-bottom:10px">Orario e accordo · ${e(nome)}</h3>
    <div class="griglia">
      ${campo("oreSettimanali", "Ore settimanali a tempo pieno", p.oreSettimanali ?? 42, "number")}
      ${campo("percentuale", "Grado di occupazione (%)", p.percentuale ?? 100, "number")}
      ${campo("giorniVacanza", "Giorni di vacanza all'anno (a tempo pieno)", p.giorniVacanza, "number")}
      ${sceltaGiorniLavoro(p)}
      ${campo("entrataStandard", "Entrata abituale (per il pulsante Standard)", p.entrataStandard || "08:00")}
      <div><label for="f_pausaStandard">Pausa abituale</label><select id="f_pausaStandard" name="pausaStandard">${PAUSE.map(x => `<option value="${x}"${x === (p.pausaStandard ?? 60) ? " selected" : ""}>${x ? ore(x) : "nessuna"}</option>`).join("")}</select></div>
      ${campo("accordo73b", "Accordo scritto art. 73b firmato il", p.accordo73b, "date")}
      ${campo("inizioPresenze", "Registrazione delle presenze dal", p.inizioPresenze, "date")}
      ${campo("saldoRiportato", "Saldo ore riportato a inizio anno (es. 12:30 o -4:00)", sr ? (sr < 0 ? "-" : "") + Math.floor(Math.abs(sr) / 60) + ":" + String(Math.abs(sr) % 60).padStart(2, "0") : "")}
    </div>
    <p class="tenue" style="font-size:13px;margin-top:8px">Le ore dovute si calcolano sui giorni di lavoro scelti (ore settimanali × grado ÷ numero di giorni), esclusi i 15 giorni festivi ufficiali del Ticino, a partire dalla data di inizio registrazione.</p>
    <div class="azioni"><button class="btn primario">Salva orario</button></div></form>`;
}

async function vistaPanoramica(el, utenti) {
  const anno = mese.slice(0, 4), da = primoDel(mese), a = ultimoDel(mese), oggi = oggiISO();
  const [tutte, vacanze] = await Promise.all([D.listaPresenzeStudio(`${anno}-01-01`, `${anno}-12-31`), D.listaVacanze().catch(() => [])]);
  const righe = utenti.map(x => {
    const mie = tutte.filter(p => p.uid === x.id), pres = conVacanze(Object.fromEntries(mie.map(p => [p.data, p])), vacanze, x.id, x);
    const dal = x.inizioPresenze || mie.map(p => p.data).sort()[0] || da;
    const finora = pres[oggi] ? oggi : aggiungiGiorni(oggi, -1), fine = a < finora ? a : finora;
    const rm = fine >= da ? riepilogoPresenze(pres, x, da, fine, dal) : riepilogoPresenze({}, x, da, da, "9999"), ra = riepilogoPresenze(pres, x, `${anno}-01-01`, fine, dal);
    return { x, rm, ra, saldoAnno: ra.saldo + (Number(x.saldoRiportatoMinuti) || 0), vuoto: !mie.length && !x.inizioPresenze };
  });
  el.innerHTML = `<div class="testata"><div><h1>Presenze · tutto lo studio</h1><div class="tenue">${e(nomeMese(mese))}</div></div>
    <div class="barra"><button class="btn" id="m-prec" aria-label="Mese precedente">◀</button><span style="min-width:130px;text-align:center;font-weight:600">${e(nomeMese(mese))}</span>
      <button class="btn" id="m-succ" aria-label="Mese successivo">▶</button><button class="btn" id="indietro">Torna al singolo</button></div></div>
    <table class="tabella"><thead><tr><th>Collaboratore</th><th class="num">Dovute finora</th><th class="num">Lavorate</th><th class="num">Saldo mese</th><th class="num">Saldo ${anno}</th><th class="num">Vacanze ${anno}</th><th>Da compilare</th><th>Accordo 73b</th></tr></thead>
    <tbody>${righe.map(({ x, rm, ra, saldoAnno, vuoto }) => `<tr class="cliccabile" data-uid="${e(x.id)}" tabindex="0">
      <td><strong>${e(x.nome || x.id)}</strong>${x.percentuale != null && +x.percentuale !== 100 ? ` <span class="tenue">${e(x.percentuale)}%</span>` : ""}${giorniLavoroDi(x).length < 5 ? ` <span class="tenue">${fmtGiorniLavoro(x)}</span>` : ""}</td>
      <td class="num">${vuoto ? "–" : fmtDurata(rm.dovute)}</td><td class="num">${fmtDurata(rm.lavorate + rm.credito)}</td>
      <td class="num"><span class="${rm.saldo < 0 && !vuoto ? "neg" : ""}">${vuoto ? "–" : fmtSaldo(rm.saldo)}</span></td><td class="num"><span class="${saldoAnno < 0 && !vuoto ? "neg" : ""}">${vuoto ? "–" : fmtSaldo(saldoAnno)}</span></td>
      <td class="num">${String(ra.vacanze).replace(".5", "½")}${x.giorniVacanza ? ` / ${String(dirittoVacanze(x)).replace(".5", "½")}` : ""}</td>
      <td>${vuoto ? stato("neutro", "Non iniziata") : rm.daCompilare ? stato("urgente", `${rm.daCompilare} ${rm.daCompilare === 1 ? "giorno" : "giorni"}`) : stato("ok", "In ordine")}</td>
      <td>${x.accordo73b ? stato("ok", fmtData(x.accordo73b)) : stato("scaduto", "Mancante")}</td></tr>`).join("")}</tbody></table>
    <p class="tenue" style="margin-top:10px">Lavorate comprende vacanze e assenze. Clicca un collaboratore per vedere e correggere il suo mese.</p>`;
  const ricarica = () => vistaPresenze(el);
  el.querySelector("#m-prec").addEventListener("click", () => { mese = meseDopo(mese, -1); ricarica(); });
  el.querySelector("#m-succ").addEventListener("click", () => { mese = meseDopo(mese, 1); ricarica(); });
  el.querySelector("#indietro").addEventListener("click", () => { panoramica = false; ricarica(); });
  el.querySelectorAll("tr[data-uid]").forEach(tr => {
    const vai = () => { chi = tr.dataset.uid; panoramica = false; ricarica(); };
    tr.addEventListener("click", vai); tr.addEventListener("keydown", ev => { if (ev.key === "Enter") vai(); });
  });
}

/** CSV dell'anno per la conservazione (5 anni, art. 73 OLL 1): separatore ;, date gg.mm.aaaa, ore in hh:mm. */
function esportaAnno(nome, profilo, pres, anno, dal) {
  const fest = festiviTicino(anno);
  const righe = [[`Presenze ${anno} - ${nome}`], [`Registrazione della durata del lavoro (art. 73 / 73b OLL 1)${profilo.accordo73b ? ` - accordo scritto del ${fmtData(profilo.accordo73b)}` : " - accordo scritto non indicato"}`],
    [`Orario: ${profilo.oreSettimanali || 42} h settimanali al ${profilo.percentuale ?? 100}%`], [],
    ["Data", "Giorno", "Festivo", "Ore dovute", "Entrata", "Uscita", "Pausa", "Ore lavorate", "Assenza", "Saldo giorno"]];
  let saldo = Number(profilo.saldoRiportatoMinuti) || 0;
  for (let d = `${anno}-01-01`; d <= `${anno}-12-31`; d = aggiungiGiorni(d, 1)) {
    const p = pres[d] || {}, dov = d >= dal ? minutiDovuti(profilo, d) : 0;
    if (!dov && p.minuti == null && !p.assenza) continue;
    const s = (p.minuti != null || p.assenza || d < oggiISO()) ? (p.minuti || 0) + minutiCredito(p.assenza, dov) - dov : 0;
    saldo += s;
    righe.push([fmtData(d), GIORNI[giornoSettimana(d)], fest[d] || "", ore(dov), fmtOrario(p.entrata), fmtOrario(p.uscita), p.pausa != null ? ore(p.pausa) : "", ore(p.minuti), p.assenza || "", fmtSaldo(s).replace("−", "-")]);
  }
  righe.push([], ["Saldo a fine periodo", "", "", "", "", "", "", "", "", fmtSaldo(saldo).replace("−", "-")]);
  const csv = "﻿" + righe.map(r => r.map(c => /[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `Presenze_${anno}_${nome.replace(/[^\w]+/g, "_")}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Scelta dei giorni di lavoro (lun–ven): usata in Presenze e in Utenti. */
export function sceltaGiorniLavoro(p) {
  const g = giorniLavoroDi(p);
  return `<div class="largo"><label>Giorni di lavoro</label><div class="chips giorni-lav">${["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì"].map((n, i) =>
    `<label class="chip-g"><input type="checkbox" name="gl${i}" ${g.includes(i) ? "checked" : ""}> ${n}</label>`).join("")}</div>
    <div class="tenue" style="font-size:12px;margin-top:4px">Nei giorni non spuntati non si compila nulla e non mancano ore (es. 80% da lunedì a giovedì).</div></div>`;
}
export function giorniDaForm(f) {
  const g = [0, 1, 2, 3, 4].filter(i => f[`gl${i}`]?.checked);
  return g.length ? g : [0, 1, 2, 3, 4];
}
