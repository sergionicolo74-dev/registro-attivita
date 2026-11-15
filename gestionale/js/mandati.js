// Riepilogo dei mandati: quanti, a che punto, budget e ore lavorate per tipo.
import * as D from "./data.js";
import { e, stato } from "./ui.js";
import { fmtNum, fmtOre, TIPI_MANDATO, mandatiDi, statoMandato, daAggiornare, budgetTotale } from "./regole.js";

const TARIFFA_STUDIO = 150;
let filtro = "";

/** Tipo di mandato di una registrazione: quello scelto; per le vecchie, l'unico mandato attivo o la contabilità. */
export function mandatoDiRegistrazione(r, mm) {
  if (r.praticaId || r.mandato === "pratica") return "pratica"; // pratiche amministrative: fuori dai mandati
  if (r.mandato) return r.mandato;
  const att = TIPI_MANDATO.filter(([k]) => mm[k].attivo).map(([k]) => k);
  if (att.length === 1) return att[0];
  if (mm.contabilita.attivo) return "contabilita";
  return "nonAttribuito";
}

export async function vistaMandati(el) {
  const admin = D.isAdmin();
  const anno = new Date().getFullYear();
  const [clienti, reg] = await Promise.all([D.listaClienti(),
    admin ? D.listaRegistrazioniPeriodo(`${anno}-01-01`, `${anno}-12-31`) : Promise.resolve([])]);
  const veri = clienti.filter(c => c.codice !== "C000").sort((a, b) => (a.codice || "").localeCompare(b.codice || ""));
  const mmDi = Object.fromEntries(clienti.map(c => [c.id, mandatiDi(c)]));

  // Totali per tipo
  const tot = Object.fromEntries([...TIPI_MANDATO.map(([k]) => [k, { attivi: 0, daAgg: 0, budget: 0, minuti: 0, valore: 0 }]), ["nonAttribuito", { minuti: 0, valore: 0 }], ["pratica", { minuti: 0, valore: 0 }]]);
  for (const c of veri) for (const [k] of TIPI_MANDATO) {
    const m = mmDi[c.id][k]; if (!m.attivo) continue;
    tot[k].attivi++; if (daAggiornare(m)) tot[k].daAgg++; tot[k].budget += Number(m.budget) || 0;
  }
  for (const r of reg) {
    if (r.tipo === "nota" || !r.minuti) continue;
    const mm = mmDi[r.clienteId]; if (!mm) continue;
    const k = mandatoDiRegistrazione(r, mm);
    const tariffa = Number(mm.contabilita.tariffa) || TARIFFA_STUDIO;
    tot[k].minuti += r.minuti; tot[k].valore += r.minuti / 60 * tariffa;
  }
  const maxVal = Math.max(1, ...TIPI_MANDATO.flatMap(([k]) => [tot[k].budget, tot[k].valore]));
  const righe = veri.filter(c => filtro !== "agg" || TIPI_MANDATO.some(([k]) => daAggiornare(mmDi[c.id][k])));

  el.innerHTML = `
  <div class="testata"><div><h1>Mandati</h1><div class="tenue">${veri.length} clienti · situazione dei mandati${admin ? ` e budget ${anno}` : ""}</div></div></div>

  <div class="kpi">${TIPI_MANDATO.map(([k, n]) => `<div class="pannello">
    <div class="tenue" style="font-size:12px;text-transform:uppercase;letter-spacing:.04em">${e(n)}</div>
    <div class="grande">${tot[k].attivi} <span class="tenue" style="font-size:14px;font-weight:400">clienti</span></div>
    <div class="segnali">${tot[k].daAgg ? stato("urgente", `${tot[k].daAgg} da aggiornare`) : tot[k].attivi ? stato("ok", "Tutti aggiornati") : ""}</div>
    ${admin ? `<div class="tenue" style="margin-top:8px">Budget CHF <strong style="color:var(--inchiostro)">${fmtNum(tot[k].budget)}</strong></div>` : ""}
  </div>`).join("")}</div>

  ${admin ? `<section class="pannello" style="margin:14px 0">
    <h2 style="font-size:16px">Budget e ore lavorate ${anno}, per mandato</h2>
    <p class="tenue" style="margin:4px 0 14px">Valore delle ore = ore registrate × tariffa del cliente (CHF ${TARIFFA_STUDIO} se non indicata). Se il valore supera il budget, il mandato costa più di quanto rende.</p>
    <div class="grafico" role="img" aria-label="Budget e valore delle ore lavorate per tipo di mandato">
    ${TIPI_MANDATO.map(([k, n]) => {
      const t = tot[k], sforo = t.budget && t.valore > t.budget;
      return `<div class="gruppo"><div class="nome">${e(n)}</div>
        <div class="riga"><span class="etichetta">Budget</span><div class="pista"><div class="b budget" style="width:${t.budget / maxVal * 100}%"></div></div><span class="valore">CHF ${fmtNum(t.budget, 0)}</span></div>
        <div class="riga"><span class="etichetta">Ore lavorate</span><div class="pista"><div class="b lavoro${sforo ? " sforo" : ""}" style="width:${t.valore / maxVal * 100}%"></div></div><span class="valore">CHF ${fmtNum(t.valore, 0)} · ${fmtOre(t.minuti)} h</span></div>
        ${t.budget ? `<div class="tenue" style="font-size:12px;margin-left:110px">${sforo ? stato("scaduto", `Oltre il budget di CHF ${fmtNum(t.valore - t.budget, 0)}`) : `Usato ${Math.round(t.valore / t.budget * 100)}% del budget`}</div>` : ""}</div>`;
    }).join("")}
    </div>
    ${tot.pratica.minuti ? `<p class="tenue" style="font-size:13px">${fmtOre(tot.pratica.minuti)} ore registrate su pratiche amministrative (fuori mandato, si fatturano a parte): <a href="#/pratiche">vedi Pratiche</a>.</p>` : ""}
    ${tot.nonAttribuito.minuti ? `<p class="tenue" style="font-size:13px">${fmtOre(tot.nonAttribuito.minuti)} ore registrate su clienti senza mandati attivi non sono attribuite.</p>` : ""}
  </section>` : ""}

  <section class="pannello" style="margin-top:14px">
    <div class="testata" style="margin-bottom:10px"><h2 style="font-size:16px">Per cliente</h2>
      <select id="filtro-m" aria-label="Filtro"><option value="">Tutti i clienti</option><option value="agg"${filtro === "agg" ? " selected" : ""}>Solo con mandati da aggiornare</option></select></div>
    <table class="tabella griglia-mandati"><thead><tr><th>Cliente</th>${TIPI_MANDATO.map(([, n]) => `<th>${e(n)}</th>`).join("")}${admin ? '<th class="num">Budget annuo</th>' : ""}</tr></thead><tbody>
    ${righe.map(c => {
      const mm = mmDi[c.id];
      return `<tr class="cliccabile" data-id="${e(c.id)}" tabindex="0"><td><strong>${e(c.ragioneSociale)}</strong><div class="tenue">${e(c.codice)}</div></td>
        ${TIPI_MANDATO.map(([k]) => { const m = mm[k], st = statoMandato(m);
          if (!st) return '<td class="tenue">–</td>';
          const sotto = k === "funzione" ? m.funzioni.map(f => f.ruolo).filter(Boolean).join(", ") : k === "domiciliazione" ? m.tipo : k === "intestazione" && m.numero ? `${fmtNum(m.numero, 0)} ${(m.tipoTitoli || "").toLowerCase()}` : "";
          return `<td>${stato(st, st === "ok" ? "Aggiornato" : m.stato === "Mancante" ? "Mancante" : "Da aggiornare")}${sotto ? `<div class="tenue" style="font-size:12px;margin-top:3px">${e(sotto)}</div>` : ""}${admin && m.budget ? `<div class="tenue" style="font-size:12px">CHF ${fmtNum(m.budget, 0)}</div>` : ""}</td>`; }).join("")}
        ${admin ? `<td class="num">${budgetTotale(mm) ? fmtNum(budgetTotale(mm), 0) : ""}</td>` : ""}</tr>`;
    }).join("") || `<tr><td colspan="5" class="vuoto">Nessun cliente.</td></tr>`}
    ${admin ? `<tr class="totale"><td><strong>Totale</strong></td>${TIPI_MANDATO.map(([k]) => `<td><strong>CHF ${fmtNum(tot[k].budget, 0)}</strong></td>`).join("")}<td class="num"><strong>${fmtNum(TIPI_MANDATO.reduce((s, [k]) => s + tot[k].budget, 0), 0)}</strong></td></tr>` : ""}
    </tbody></table></section>`;

  el.querySelector("#filtro-m").addEventListener("change", ev => { filtro = ev.target.value; vistaMandati(el); });
  const apri = tr => tr?.dataset.id && (location.hash = `#/clienti/${encodeURIComponent(tr.dataset.id)}/mandati`);
  el.querySelector("tbody").addEventListener("click", ev => apri(ev.target.closest("tr")));
  el.querySelector("tbody").addEventListener("keydown", ev => { if (ev.key === "Enter") apri(ev.target.closest("tr")); });
}
