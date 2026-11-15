// Modulo Presenze: registrazione semplificata della durata del lavoro (art. 46 LL, art. 73b OLL 1).
// Si registra solo il totale delle ore lavorate al giorno; per le assenze solo il tipo, mai il motivo.
import * as D from "./data.js";
import { e, avviso, stato, campo, leggiForm, dataNonValida } from "./ui.js";
import { fmtData, fmtDurata, fmtSaldo, oggiISO, aggiungiGiorni, dataISO, giornoSettimana, festiviTicino, minutiDovuti, minutiCredito,
  parseOre, riepilogoPresenze, TIPI_ASSENZA, GIORNI, MESI } from "./regole.js";

let mese = oggiISO().slice(0, 7);   // "2026-11"
let chi = null;                     // uid mostrato
let panoramica = false;             // admin: tabella di tutto lo studio

const primoDel = m => `${m}-01`;
const ultimoDel = m => dataISO(+m.slice(0, 4), +m.slice(5, 7), 31);
const meseDopo = (m, n) => dataISO(+m.slice(0, 4), +m.slice(5, 7) + n, 1).slice(0, 7);
const nomeMese = m => `${MESI[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const ore = min => min == null ? "" : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;

export async function vistaPresenze(el) {
  const admin = D.isAdmin(), u = D.utenteCorrente();
  if (!chi || !admin) chi = u.uid;
  const utenti = admin ? (await D.listaUtenti()).filter(x => x.attivo !== false && x.ruolo) : [];
  if (admin && panoramica) return vistaPanoramica(el, utenti);

  const anno = mese.slice(0, 4), da = primoDel(mese), a = ultimoDel(mese), inizioAnno = `${anno}-01-01`;
  const [profilo, presAnno, regMese] = await Promise.all([
    D.leggiProfilo(chi).then(p => p || {}),
    D.listaPresenze(chi, inizioAnno, `${anno}-12-31`),
    chi === u.uid || admin ? D.listaRegistrazioniPeriodo(da, a).catch(() => []) : Promise.resolve([])
  ]);
  const pres = Object.fromEntries(presAnno.map(p => [p.data, p]));
  const regGiorno = {};
  regMese.filter(r => r.autoreUid === chi && r.tipo !== "nota").forEach(r => { regGiorno[r.data] = (regGiorno[r.data] || 0) + (r.minuti || 0); });
  const dal = profilo.inizioPresenze || presAnno.map(p => p.data).sort()[0] || da;
  const oggi = oggiISO();
  // Il saldo si calcola fino a oggi (se oggi è già compilato) o fino a ieri: i giorni futuri non sono ancora dovuti
  const finora = pres[oggi] ? oggi : aggiungiGiorni(oggi, -1);
  const rMeseTutto = riepilogoPresenze(pres, profilo, da, a, dal);
  const fineMeseCalc = a < finora ? a : finora;
  const rMese = fineMeseCalc >= da ? riepilogoPresenze(pres, profilo, da, fineMeseCalc, dal) : { ...rMeseTutto, dovute: 0, saldo: 0, lavorate: 0, credito: 0 };
  const fineAnnoCalc = a < finora ? a : finora;
  const rAnno = riepilogoPresenze(pres, profilo, inizioAnno, fineAnnoCalc, dal);
  const saldoAnno = rAnno.saldo + (Number(profilo.saldoRiportatoMinuti) || 0);
  const fest = festiviTicino(+anno);
  const nomeChi = admin ? (utenti.find(x => x.id === chi)?.nome || u.nome) : u.nome;

  el.innerHTML = `
  <div class="testata">
    <div><h1>Presenze</h1><div class="tenue">${e(nomeChi)} · ${e(nomeMese(mese))}</div></div>
    <div class="barra">
      <button class="btn" id="m-prec" aria-label="Mese precedente">◀</button>
      <span style="min-width:130px;text-align:center;font-weight:600">${e(nomeMese(mese))}</span>
      <button class="btn" id="m-succ" aria-label="Mese successivo">▶</button>
      ${admin ? `<select id="chi-p" aria-label="Collaboratore">${utenti.map(x => `<option value="${e(x.id)}"${x.id === chi ? " selected" : ""}>${e(x.nome || x.id)}</option>`).join("")}</select>
        <button class="btn" id="panoramica">Tutto lo studio</button>` : ""}
      <button class="btn" id="esporta">Esporta anno (CSV)</button>
    </div>
  </div>
  ${profilo.accordo73b ? "" : `<div class="pannello allerta" role="status" style="margin-bottom:14px">${stato("urgente", "Accordo scritto mancante")}
    <span style="margin-left:8px">La registrazione semplificata (art. 73b OLL 1) richiede un accordo scritto individuale con ${e(nomeChi)}.${admin ? " Indica la data della firma in «Orario e accordo» qui sotto." : " Rivolgiti all'amministratore."}</span></div>`}
  <div class="kpi-s">
    <div class="kpi-b fermo"><span class="tenue">Dovute nel mese</span><strong>${fmtDurata(rMeseTutto.dovute)}</strong>${rMese.dovute !== rMeseTutto.dovute ? `<span class="tenue">${fmtDurata(rMese.dovute)} fino a ${e(fmtData(fineMeseCalc))}</span>` : ""}</div>
    <div class="kpi-b fermo"><span class="tenue">Lavorate</span><strong>${fmtDurata(rMese.lavorate)}</strong>${rMese.credito ? `<span class="tenue">+ ${fmtDurata(rMese.credito)} assenze/vacanze</span>` : ""}</div>
    <div class="kpi-b fermo"><span class="tenue">Saldo del mese${rMese.dovute !== rMeseTutto.dovute ? " finora" : ""}</span><strong>${fmtSaldo(rMese.saldo)}</strong></div>
    <div class="kpi-b fermo"><span class="tenue">Saldo ${anno} fino a ${e(fmtData(fineAnnoCalc))}</span><strong>${fmtSaldo(saldoAnno)}</strong></div>
    <div class="kpi-b fermo"><span class="tenue">Vacanze ${anno}</span><strong>${String(rAnno.vacanze).replace(".5", "½")} ${rAnno.vacanze === 1 ? "giorno" : "giorni"}</strong>${profilo.giorniVacanza ? `<span class="tenue">su ${e(profilo.giorniVacanza)}</span>` : ""}</div>
    <div class="kpi-b fermo"><span class="tenue">Giorni da compilare</span><strong>${rMese.daCompilare ? stato("urgente", String(rMese.daCompilare)) : stato("ok", "0")}</strong></div>
  </div>
  <div class="pannello" style="padding:0">
    <table class="tabella presenze"><thead><tr><th>Giorno</th><th class="num">Dovute</th><th>Ore lavorate</th><th>Assenza</th><th class="num">Registro ore</th><th class="num">Saldo</th></tr></thead><tbody>
    ${giorniDelMese().map(d => {
      const p = pres[d] || {}, dov = d >= dal ? minutiDovuti(profilo, d) : 0, gs = giornoSettimana(d), f = fest[d];
      const lib = gs >= 5 || f, futuro = d > oggi;
      const saldo = (p.minuti != null || p.assenza) ? (p.minuti || 0) + minutiCredito(p.assenza, dov) - dov : null;
      const reg = regGiorno[d];
      const manca = !lib && dov && !futuro && d >= dal && p.minuti == null && !p.assenza;
      return `<tr class="${lib ? "libero" : ""}${d === oggi ? " oggi" : ""}" data-d="${d}">
        <td style="white-space:nowrap"><strong>${GIORNI[gs]} ${e(fmtData(d).slice(0, 5))}</strong>${f ? `<div class="tenue">${e(f)}</div>` : ""}${manca ? `<div>${stato("urgente", "Da compilare")}</div>` : ""}</td>
        <td class="num">${dov ? ore(dov) : "–"}</td>
        <td><div style="display:flex;gap:6px;align-items:center"><input class="ore-in" value="${e(ore(p.minuti))}" placeholder="${lib ? "" : "es. 8:30"}" inputmode="decimal" aria-label="Ore lavorate ${e(fmtData(d))}" style="width:86px">
          ${dov && p.minuti == null && !p.assenza && !lib ? `<button type="button" class="btn piccolo" data-std="${dov}" title="Inserisci ${ore(dov)}">= ${ore(dov)}</button>` : ""}</div></td>
        <td><select class="ass-in" aria-label="Assenza ${e(fmtData(d))}"><option value=""></option>${TIPI_ASSENZA.map(t => `<option${t === p.assenza ? " selected" : ""}>${e(t)}</option>`).join("")}</select></td>
        <td class="num">${reg ? `${fmtDurata(reg)}${p.minuti && reg > p.minuti ? `<div>${stato("urgente", "più della presenza")}</div>` : ""}` : '<span class="tenue">–</span>'}</td>
        <td class="num">${saldo == null ? "" : `<span class="${saldo < 0 ? "neg" : ""}">${fmtSaldo(saldo)}</span>`}</td></tr>`;
    }).join("")}
    </tbody></table></div>
  <p class="tenue" style="margin-top:10px">Scrivi le ore lavorate in totale nel giorno (es. 8:30 oppure 8.5), pause escluse. Per le assenze indica solo il tipo: il motivo non si registra. Si salva da solo.</p>
  ${admin ? formProfilo(profilo, nomeChi) : `<div class="pannello" style="margin-top:14px"><h3 style="font-size:14px;margin-bottom:8px">Orario e accordo</h3><div class="fatti">
      <div><span>Ore settimanali</span>${e(profilo.oreSettimanali || 42)} h</div><div><span>Grado</span>${e(profilo.percentuale ?? 100)}%</div>
      <div><span>Accordo art. 73b</span>${profilo.accordo73b ? e(fmtData(profilo.accordo73b)) : "–"}</div></div></div>`}`;

  const ricarica = () => vistaPresenze(el);
  el.querySelector("#m-prec").addEventListener("click", () => { mese = meseDopo(mese, -1); ricarica(); });
  el.querySelector("#m-succ").addEventListener("click", () => { mese = meseDopo(mese, 1); ricarica(); });
  el.querySelector("#chi-p")?.addEventListener("change", ev => { chi = ev.target.value; ricarica(); });
  el.querySelector("#panoramica")?.addEventListener("click", () => { panoramica = true; ricarica(); });
  el.querySelector("#esporta").addEventListener("click", () => esportaAnno(nomeChi, profilo, presAnno, +anno, dal));

  const salvaRiga = async (tr) => {
    const d = tr.dataset.d, inp = tr.querySelector(".ore-in"), sel = tr.querySelector(".ass-in");
    const min = parseOre(inp.value);
    if (Number.isNaN(min)) { inp.focus(); avviso("Ore non valide: scrivi ad esempio 8:30 o 8.5"); return; }
    if (min == null && !sel.value) { if (pres[d]) await D.eliminaPresenza(chi, d); }
    else await D.salvaPresenza({ uid: chi, nome: nomeChi, data: d, minuti: min, assenza: sel.value });
    avviso("Salvato"); ricarica();
  };
  el.querySelectorAll("tr[data-d]").forEach(tr => {
    tr.querySelector(".ore-in").addEventListener("change", () => salvaRiga(tr));
    tr.querySelector(".ass-in").addEventListener("change", () => salvaRiga(tr));
    tr.querySelector("[data-std]")?.addEventListener("click", ev => { tr.querySelector(".ore-in").value = ore(+ev.currentTarget.dataset.std); salvaRiga(tr); });
  });
  el.querySelector("#form-profilo")?.addEventListener("submit", async ev => {
    ev.preventDefault();
    const f = ev.target;
    if (dataNonValida(f)) { avviso("Data non valida: usa gg.mm.aaaa"); return; }
    const d = leggiForm(f), saldo = parseOre(String(d.saldoRiportato || "").replace(/^[+−-]/, ""));
    if (Number.isNaN(saldo)) { avviso("Saldo riportato non valido: es. 12:30 oppure -4:00"); return; }
    const segno = /^[−-]/.test(String(d.saldoRiportato || "").trim()) ? -1 : 1;
    await D.salvaProfilo(chi, { oreSettimanali: d.oreSettimanali, percentuale: d.percentuale, giorniVacanza: d.giorniVacanza,
      accordo73b: d.accordo73b, inizioPresenze: d.inizioPresenze, saldoRiportatoMinuti: saldo == null ? 0 : segno * saldo });
    avviso("Orario salvato"); ricarica();
  });

  function giorniDelMese() { const l = []; for (let d = da; d <= a; d = aggiungiGiorni(d, 1)) l.push(d); return l; }
}

function formProfilo(p, nome) {
  const sr = Number(p.saldoRiportatoMinuti) || 0;
  return `<form class="pannello" id="form-profilo" style="margin-top:14px"><h3 style="font-size:14px;margin-bottom:10px">Orario e accordo · ${e(nome)}</h3>
    <div class="griglia">
      ${campo("oreSettimanali", "Ore settimanali a tempo pieno", p.oreSettimanali ?? 42, "number")}
      ${campo("percentuale", "Grado di occupazione (%)", p.percentuale ?? 100, "number")}
      ${campo("giorniVacanza", "Giorni di vacanza all'anno", p.giorniVacanza, "number")}
      ${campo("accordo73b", "Accordo scritto art. 73b firmato il", p.accordo73b, "date")}
      ${campo("inizioPresenze", "Registrazione delle presenze dal", p.inizioPresenze, "date")}
      ${campo("saldoRiportato", "Saldo ore riportato a inizio anno (es. 12:30 o -4:00)", sr ? (sr < 0 ? "-" : "") + Math.floor(Math.abs(sr) / 60) + ":" + String(Math.abs(sr) % 60).padStart(2, "0") : "")}
    </div>
    <p class="tenue" style="font-size:13px;margin-top:8px">Le ore dovute si calcolano dal lunedì al venerdì, esclusi i 15 giorni festivi ufficiali del Ticino, a partire dalla data di inizio registrazione.</p>
    <div class="azioni"><button class="btn primario">Salva orario</button></div></form>`;
}

async function vistaPanoramica(el, utenti) {
  const anno = mese.slice(0, 4), da = primoDel(mese), a = ultimoDel(mese), oggi = oggiISO();
  const tutte = await D.listaPresenzeStudio(`${anno}-01-01`, `${anno}-12-31`);
  const righe = utenti.map(x => {
    const mie = tutte.filter(p => p.uid === x.id), pres = Object.fromEntries(mie.map(p => [p.data, p]));
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
      <td><strong>${e(x.nome || x.id)}</strong>${x.percentuale != null && +x.percentuale !== 100 ? ` <span class="tenue">${e(x.percentuale)}%</span>` : ""}</td>
      <td class="num">${vuoto ? "–" : fmtDurata(rm.dovute)}</td><td class="num">${fmtDurata(rm.lavorate + rm.credito)}</td>
      <td class="num"><span class="${rm.saldo < 0 && !vuoto ? "neg" : ""}">${vuoto ? "–" : fmtSaldo(rm.saldo)}</span></td><td class="num"><span class="${saldoAnno < 0 && !vuoto ? "neg" : ""}">${vuoto ? "–" : fmtSaldo(saldoAnno)}</span></td>
      <td class="num">${String(ra.vacanze).replace(".5", "½")}${x.giorniVacanza ? ` / ${e(x.giorniVacanza)}` : ""}</td>
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
function esportaAnno(nome, profilo, presAnno, anno, dal) {
  const pres = Object.fromEntries(presAnno.map(p => [p.data, p])), fest = festiviTicino(anno);
  const righe = [[`Presenze ${anno} - ${nome}`], [`Registrazione semplificata art. 73b OLL 1${profilo.accordo73b ? ` - accordo scritto del ${fmtData(profilo.accordo73b)}` : " - accordo scritto non indicato"}`],
    [`Orario: ${profilo.oreSettimanali || 42} h settimanali al ${profilo.percentuale ?? 100}%`], [],
    ["Data", "Giorno", "Festivo", "Ore dovute", "Ore lavorate", "Assenza", "Saldo giorno"]];
  let saldo = Number(profilo.saldoRiportatoMinuti) || 0;
  for (let d = `${anno}-01-01`; d <= `${anno}-12-31`; d = aggiungiGiorni(d, 1)) {
    const p = pres[d] || {}, dov = d >= dal ? minutiDovuti(profilo, d) : 0;
    if (!dov && p.minuti == null && !p.assenza) continue;
    const s = (p.minuti != null || p.assenza || d < oggiISO()) ? (p.minuti || 0) + minutiCredito(p.assenza, dov) - dov : 0;
    saldo += s;
    righe.push([fmtData(d), GIORNI[giornoSettimana(d)], fest[d] || "", ore(dov), ore(p.minuti), p.assenza || "", fmtSaldo(s).replace("−", "-")]);
  }
  righe.push([], ["Saldo a fine periodo", "", "", "", "", "", fmtSaldo(saldo).replace("−", "-")]);
  const csv = "﻿" + righe.map(r => r.map(c => /[;"\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = `Presenze_${anno}_${nome.replace(/[^\w]+/g, "_")}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
