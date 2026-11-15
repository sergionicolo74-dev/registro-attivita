// Modulo Vacanze: piano dello studio visibile a tutti, richieste e approvazione, saldo giorni.
// Il motivo delle assenze non si registra: solo il tipo (Vacanza, Recupero ore, Assenza).
import * as D from "./data.js";
import { e, avviso, stato, campo, leggiForm, dataNonValida } from "./ui.js";
import { fmtData, oggiISO, aggiungiGiorni, dataISO, giornoSettimana, festiviTicino, giorniLavorativi, giorniRichiesta, vacanzeUsate,
  chiusa, TIPI_VACANZA, GIORNI, MESI } from "./regole.js";
import { carica as caricaScadenze } from "./scadenziario.js";

let mese = oggiISO().slice(0, 7);
const meseDopo = (m, n) => dataISO(+m.slice(0, 4), +m.slice(5, 7) + n, 1).slice(0, 7);
const SIGLA = { Vacanza: "V", "Recupero ore": "R", Assenza: "A" };

/** Scadenze aperte di cui la persona è responsabile e che cadono durante la richiesta. */
function scadenzeDurante(v, scadenze) {
  return scadenze.filter(o => o.respUid === v.uid && !chiusa(o) && o.data >= v.dal && o.data <= (v.mezza ? v.dal : v.al)).sort((x, y) => x.data.localeCompare(y.data));
}

export async function vistaVacanze(el) {
  const admin = D.isAdmin(), u = D.utenteCorrente();
  const anno = +mese.slice(0, 4), oggi = oggiISO();
  const [utentiTutti, vacanze, sc] = await Promise.all([D.listaUtenti().catch(() => []), D.listaVacanze(),
    caricaScadenze([anno - 1, anno, anno + 1]).catch(() => ({ tutte: [] }))]);
  const utenti = utentiTutti.filter(x => x.attivo !== false && x.ruolo).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  if (!utenti.some(x => x.id === u.uid)) utenti.unshift({ id: u.uid, nome: u.nome });
  const scadenze = sc.tutte || [];
  const da = `${mese}-01`, a = dataISO(anno, +mese.slice(5, 7), 31), fest = festiviTicino(anno);
  const giorni = []; for (let d = da; d <= a; d = aggiungiGiorni(d, 1)) giorni.push(d);
  const attive = vacanze.filter(v => v.stato !== "Rifiutata");
  const cella = (uid, d) => attive.find(v => v.uid === uid && d >= v.dal && d <= (v.mezza ? v.dal : v.al));
  const inAttesa = vacanze.filter(v => v.stato === "Richiesta" && (admin || v.uid === u.uid)).sort((x, y) => x.dal.localeCompare(y.dal));
  const mie = vacanze.filter(v => v.uid === u.uid && v.stato !== "Richiesta" && v.al >= `${anno}-01-01`).sort((x, y) => y.dal.localeCompare(x.dal)).slice(0, 8);
  const oggiFuori = attive.filter(v => v.stato === "Approvata" && oggi >= v.dal && oggi <= (v.mezza ? v.dal : v.al));

  const rigaRichiesta = (v) => {
    const sd = scadenzeDurante(v, scadenze), n = giorniRichiesta(v);
    return `<li class="richiesta">
      <div style="flex:1"><strong>${e(v.nome)}</strong> · ${e(v.tipo)}${v.mezza ? " (mezza giornata)" : ""} · ${e(fmtData(v.dal))}${v.mezza || v.al === v.dal ? "" : ` – ${e(fmtData(v.al))}`}
        <span class="tenue">· ${String(n).replace(".5", "½")} ${n === 1 ? "giorno lavorativo" : "giorni lavorativi"}</span>
        ${sd.length ? `<div style="margin-top:4px">${stato("urgente", `${sd.length} ${sd.length === 1 ? "scadenza cade" : "scadenze cadono"} durante l'assenza`)}
          <span class="tenue" style="font-size:13px"> ${sd.slice(0, 4).map(o => `${e(fmtData(o.data))} ${e(o.etichetta)} (${e(o.cliente.codice)})`).join(" · ")}${sd.length > 4 ? " …" : ""}</span></div>` : ""}</div>
      <div class="azioni" style="margin:0">${admin ? `<button class="btn piccolo" data-rifiuta="${e(v.id)}">Rifiuta</button><button class="btn piccolo primario" data-approva="${e(v.id)}">✓ Approva</button>`
        : stato("neutro", "In attesa di approvazione")}<button class="btn piccolo" data-apri="${e(v.id)}">Modifica</button></div></li>`;
  };

  el.innerHTML = `
  <div class="testata">
    <div><h1>Vacanze</h1><div class="tenue">${oggiFuori.length ? `Oggi assenti: ${oggiFuori.map(v => e(v.nome)).join(", ")}` : "Oggi tutti presenti"}</div></div>
    <div class="barra"><button class="btn" id="m-prec" aria-label="Mese precedente">◀</button>
      <span style="min-width:130px;text-align:center;font-weight:600">${e(MESI[+mese.slice(5, 7) - 1])} ${anno}</span>
      <button class="btn" id="m-succ" aria-label="Mese successivo">▶</button><button class="btn" id="m-oggi">Oggi</button>
      <button class="btn primario" id="nuova-v">${admin ? "Nuova assenza" : "Chiedi vacanza"}</button></div>
  </div>
  ${inAttesa.length ? `<section class="pannello" style="margin-bottom:14px"><h2 style="font-size:15px;margin-bottom:8px">${admin ? "Richieste da approvare" : "Le tue richieste in attesa"} <span class="tenue">${inAttesa.length}</span></h2>
    <ul class="richieste">${inAttesa.map(rigaRichiesta).join("")}</ul></section>` : ""}
  <section class="pannello" style="padding:0;margin-bottom:14px"><div class="scorri"><table class="piano">
    <thead><tr><th class="nome">Collaboratore</th>${giorni.map(d => { const gs = giornoSettimana(d), lib = gs >= 5 || fest[d];
      return `<th class="${lib ? "lib" : ""}${d === oggi ? " oggi" : ""}" title="${e(fest[d] || "")}"><span>${GIORNI[gs].charAt(0)}</span>${+d.slice(8)}</th>`; }).join("")}</tr></thead>
    <tbody>${utenti.map(x => `<tr><th class="nome">${e(x.nome || x.id)}</th>${giorni.map(d => {
      const gs = giornoSettimana(d), lib = gs >= 5 || fest[d], v = cella(x.id, d);
      if (lib) return `<td class="lib${d === oggi ? " oggi" : ""}"${fest[d] ? ` title="${e(fest[d])}"` : ""}></td>`;
      if (!v) return `<td class="${d === oggi ? "oggi" : ""}"></td>`;
      const cl = v.stato === "Richiesta" ? "chiesta" : v.tipo === "Vacanza" ? "vac" : "alt";
      const t = `${x.nome}: ${v.tipo}${v.mezza ? " (mezza giornata)" : ""}${v.stato === "Richiesta" ? " — da approvare" : ""}`;
      return `<td class="${d === oggi ? "oggi" : ""}"><button type="button" class="pv ${cl}" data-apri="${e(v.id)}" title="${e(t)}" aria-label="${e(t + " " + fmtData(d))}">${v.stato === "Richiesta" ? "?" : SIGLA[v.tipo] || "•"}${v.mezza ? "½" : ""}</button></td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>
    <p class="legenda" style="padding:10px 14px">${[["vac", "V", "Vacanza approvata"], ["alt", "R", "Recupero ore / A Assenza"], ["chiesta", "?", "Richiesta da approvare"]].map(([c, s, n]) => `<span><span class="pv ${c}" aria-hidden="true">${s}</span> ${n}</span>`).join("")}
      <span><span class="pv lib-l" aria-hidden="true"></span> Fine settimana e festivi ticinesi</span></p></section>
  <section class="pannello"><h2 style="font-size:15px;margin-bottom:10px">Saldo vacanze ${anno}</h2>
    <table class="tabella"><thead><tr><th>Collaboratore</th><th class="num">Diritto</th><th class="num">Approvate</th><th class="num">In attesa</th><th class="num">Restanti</th><th style="width:40%"></th></tr></thead><tbody>
    ${utenti.filter(x => admin || x.id === u.uid).map(x => {
      const dir = Number(x.giorniVacanza) || 0, usate = vacanzeUsate(vacanze, x.id, anno);
      const chieste = vacanze.filter(v => v.uid === x.id && v.stato === "Richiesta" && v.tipo === "Vacanza" && v.dal.startsWith(String(anno))).reduce((s, v) => s + giorniRichiesta(v), 0);
      const rest = dir - usate - chieste, f = n => String(n).replace(".5", "½");
      const p = n => dir ? Math.min(100, n / dir * 100) : 0;
      return `<tr><td><strong>${e(x.nome || x.id)}</strong></td><td class="num">${dir ? f(dir) : '<span class="tenue">da impostare</span>'}</td><td class="num">${f(usate)}</td><td class="num">${f(chieste)}</td>
        <td class="num">${dir ? (rest < 0 ? stato("scaduto", f(rest)) : f(rest)) : "–"}</td>
        <td>${dir ? `<div class="barra-v" role="img" aria-label="${f(usate)} approvate, ${f(chieste)} in attesa su ${f(dir)}"><div class="usate" style="width:${p(usate)}%"></div><div class="chieste" style="width:${Math.max(0, Math.min(100 - p(usate), p(chieste)))}%"></div></div>` : ""}</td></tr>`;
    }).join("")}</tbody></table>
    <p class="tenue" style="font-size:13px;margin-top:8px">Si contano i giorni lavorativi (lunedì–venerdì, esclusi i festivi ticinesi). Il diritto annuo si imposta in Presenze → Orario e accordo. Le vacanze approvate compaiono da sole nelle Presenze.</p>
    ${mie.length ? `<h3 style="font-size:14px;margin:14px 0 6px">Le tue assenze ${anno}</h3><ul class="richieste">${mie.map(v => `<li class="richiesta"><div style="flex:1">${e(v.tipo)} · ${e(fmtData(v.dal))}${v.mezza || v.al === v.dal ? "" : ` – ${e(fmtData(v.al))}`}</div>${stato(v.stato === "Approvata" ? "ok" : "scaduto", v.stato)}</li>`).join("")}</ul>` : ""}
  </section>`;

  const ricarica = () => vistaVacanze(el);
  el.querySelector("#m-prec").addEventListener("click", () => { mese = meseDopo(mese, -1); ricarica(); });
  el.querySelector("#m-succ").addEventListener("click", () => { mese = meseDopo(mese, 1); ricarica(); });
  el.querySelector("#m-oggi").addEventListener("click", () => { mese = oggiISO().slice(0, 7); ricarica(); });
  el.querySelector("#nuova-v").addEventListener("click", () => cassetto({ uid: u.uid, nome: u.nome, tipo: "Vacanza", stato: admin ? "Approvata" : "Richiesta" }, utenti, vacanze, scadenze, ricarica));
  const cambia = async (id, nuovo) => {
    const v = vacanze.find(x => x.id === id);
    await D.salvaVacanza({ ...v, stato: nuovo, decisoDa: u.nome, decisoIl: new Date().toISOString() });
    avviso(nuovo === "Approvata" ? `Approvata: ${v.nome}` : `Rifiutata: ${v.nome}`); ricarica();
  };
  el.querySelectorAll("[data-approva]").forEach(b => b.addEventListener("click", () => cambia(b.dataset.approva, "Approvata")));
  el.querySelectorAll("[data-rifiuta]").forEach(b => b.addEventListener("click", () => cambia(b.dataset.rifiuta, "Rifiutata")));
  el.querySelectorAll("[data-apri]").forEach(b => b.addEventListener("click", () => {
    const v = vacanze.find(x => x.id === b.dataset.apri);
    if (v && (admin || (v.uid === u.uid && v.stato === "Richiesta"))) cassetto(v, utenti, vacanze, scadenze, ricarica);
    else if (v) avviso(v.uid === u.uid ? "Già approvata: per cambiarla chiedi all'amministratore" : `${v.nome}: ${v.tipo}`);
  }));
}

function cassetto(v, utenti, vacanze, scadenze, ricarica) {
  const admin = D.isAdmin(), u = D.utenteCorrente();
  const velo = document.createElement("div"); velo.className = "velo";
  const box = document.createElement("aside"); box.className = "cassetto"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Assenza");
  box.innerHTML = `<form><h2 style="font-size:18px;margin-bottom:14px">${v.id ? "Assenza" : admin ? "Nuova assenza" : "Richiesta di vacanza"}</h2>
    <div class="griglia">
      ${admin ? `<div class="largo"><label for="f_chiV">Collaboratore</label><select id="f_chiV" name="uid">${utenti.map(x => `<option value="${e(x.id)}"${x.id === v.uid ? " selected" : ""}>${e(x.nome || x.id)}</option>`).join("")}</select></div>` : ""}
      ${campo("dal", "Dal", v.dal, "date")}${campo("al", "Al (compreso)", v.al, "date")}
      ${campo("tipo", "Tipo", v.tipo || "Vacanza", "select", TIPI_VACANZA)}
      ${campo("mezza", "Mezza giornata (solo un giorno)", !!v.mezza, "checkbox")}
      ${admin ? campo("stato", "Stato", v.stato, "select", ["Richiesta", "Approvata", "Rifiutata"]) : ""}
    </div>
    <div id="calcolo" class="pannello" style="margin-top:12px;background:var(--grigio-tinta)"></div>
    <p class="tenue" style="font-size:13px;margin-top:10px">Non si indica il motivo dell'assenza. ${admin ? "" : "La richiesta va approvata dall'amministratore."}</p>
    <div class="azioni">${v.id ? '<button type="button" class="btn" id="elimina-v" style="margin-right:auto">Elimina</button>' : ""}
      <button type="button" class="btn" id="annulla-v">Chiudi</button><button class="btn primario">${v.id ? "Salva" : admin ? "Salva" : "Invia richiesta"}</button></div></form>`;
  document.body.append(velo, box);
  const form = box.querySelector("form"), calc = box.querySelector("#calcolo");
  const chiudi = () => { velo.remove(); box.remove(); };
  velo.addEventListener("click", chiudi); box.querySelector("#annulla-v").addEventListener("click", chiudi);
  const leggi = () => {
    const d = leggiForm(form);
    const uid = admin ? d.uid : u.uid, dal = d.dal, al = d.mezza ? d.dal : (d.al || d.dal);
    return { ...d, uid, nome: utenti.find(x => x.id === uid)?.nome || u.nome, dal, al };
  };
  const aggiorna = () => {
    if (dataNonValida(form)) { calc.innerHTML = '<span class="tenue">Date nel formato gg.mm.aaaa</span>'; return; }
    const r = leggi();
    if (!r.dal) { calc.innerHTML = '<span class="tenue">Indica le date.</span>'; return; }
    if (r.al < r.dal) { calc.innerHTML = stato("scaduto", "La data di fine è prima di quella di inizio"); return; }
    const n = giorniRichiesta(r), sd = scadenzeDurante(r, scadenze), x = utenti.find(y => y.id === r.uid);
    const dir = Number(x?.giorniVacanza) || 0, anno = +r.dal.slice(0, 4);
    const altre = vacanze.filter(w => w.id !== v.id && w.uid === r.uid && w.tipo === "Vacanza" && w.stato !== "Rifiutata" && w.dal.startsWith(String(anno))).reduce((s, w) => s + giorniRichiesta(w), 0);
    const sovrapp = vacanze.filter(w => w.id !== v.id && w.uid !== r.uid && w.stato !== "Rifiutata" && w.dal <= r.al && (w.mezza ? w.dal : w.al) >= r.dal);
    calc.innerHTML = `<div class="fatti"><div><span>Giorni lavorativi</span><strong>${String(n).replace(".5", "½")}</strong></div>
      ${r.tipo === "Vacanza" && dir ? `<div><span>Restano dopo questa</span><strong>${String(dir - altre - n).replace(".5", "½")}</strong> su ${dir}</div>` : ""}</div>
      ${sd.length ? `<div style="margin-top:8px">${stato("urgente", `${sd.length} ${sd.length === 1 ? "scadenza" : "scadenze"} di ${e(r.nome)} in questo periodo`)}<ul style="margin:6px 0 0 18px;font-size:13px">${sd.slice(0, 6).map(o => `<li>${e(fmtData(o.data))} · ${e(o.etichetta)} · ${e(o.cliente.ragioneSociale)}</li>`).join("")}</ul></div>` : ""}
      ${sovrapp.length ? `<div style="margin-top:8px">${stato("info", "Assenti nello stesso periodo")} <span style="font-size:13px">${[...new Set(sovrapp.map(w => w.nome))].map(e).join(", ")}</span></div>` : ""}`;
  };
  form.addEventListener("input", aggiorna); form.addEventListener("change", aggiorna); aggiorna();
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    if (dataNonValida(form)) { avviso("Data non valida: usa gg.mm.aaaa"); return; }
    const r = leggi();
    if (!r.dal) { form.dal.focus(); avviso("Indica la data di inizio"); return; }
    if (r.al < r.dal) { form.al.focus(); avviso("La data di fine è prima di quella di inizio"); return; }
    if (!giorniRichiesta(r)) { avviso("Nel periodo non ci sono giorni lavorativi"); return; }
    await D.salvaVacanza({ ...(v.id ? { id: v.id } : { creato: new Date().toISOString() }), uid: r.uid, nome: r.nome, dal: r.dal, al: r.al, tipo: r.tipo, mezza: !!r.mezza,
      stato: admin ? (r.stato || "Approvata") : "Richiesta" });
    chiudi(); avviso(admin ? "Salvato" : "Richiesta inviata"); ricarica();
  });
  box.querySelector("#elimina-v")?.addEventListener("click", async () => {
    if (!confirm("Eliminare questa assenza?")) return;
    await D.eliminaVacanza(v.id); chiudi(); avviso("Eliminata"); ricarica();
  });
}
