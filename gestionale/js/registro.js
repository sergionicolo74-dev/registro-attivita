// Modulo Registro ore: una sola maschera, tre esiti (lavoro svolto, nota/decisione, da fare).
import * as D from "./data.js";
import { e, avviso, stato, campo, dataNonValida } from "./ui.js";
import { fmtData, parseData, fmtDurata, oggiISO, aggiungiGiorni, lunedi, normNome, GIORNI, TIPI_MANDATO, NOME_MANDATO, mandatiDi, minutiDovuti, praticaAperta } from "./regole.js";

const DURATE = [5, 10, 15, 30, 45, 60, 90, 120];
const TIPI = [["lavoro", "Lavoro svolto"], ["nota", "Nota / decisione"], ["dafare", "Da fare"]];

let giorno = oggiISO();
let soloMie = true;
let modifica = null; // registrazione in modifica

export async function vistaRegistro(el) {
  const admin = D.isAdmin(), u = D.utenteCorrente();
  const lun = lunedi(giorno), dom = aggiungiGiorni(lun, 6);
  const [clienti, reg, profilo, presOggi, pratiche] = await Promise.all([D.listaClienti(), D.listaRegistrazioniPeriodo(lun, dom),
    D.leggiProfilo(u.uid).catch(() => null), D.listaPresenze(u.uid, giorno, giorno).catch(() => []), D.listaPratiche().catch(() => [])]);
  const nomeCli = Object.fromEntries(clienti.map(c => [c.id, `${c.codice} · ${c.ragioneSociale}`]));
  const settimana = reg.filter(r => !admin || !soloMie || r.autoreUid === u.uid);
  const delGiorno = settimana.filter(r => r.data === giorno).sort((a, b) => String(b.creato || b.aggiornato || "").localeCompare(String(a.creato || a.aggiornato || "")));
  const lavoro = delGiorno.filter(r => r.tipo !== "nota");
  const minTot = lavoro.reduce((s, r) => s + (r.minuti || 0), 0);
  const minFat = lavoro.filter(r => r.fatturabile).reduce((s, r) => s + (r.minuti || 0), 0);
  // Obiettivo della giornata: la presenza registrata; altrimenti le ore dovute secondo l'orario (0 nei festivi e nel fine settimana)
  const presenza = presOggi[0]?.minuti;
  const dovuti = minutiDovuti(profilo || {}, giorno);
  const obiettivo = admin && !soloMie ? null : (presenza ?? dovuti) || (minTot ? minTot : null);
  const fonte = presenza != null ? "di presenza" : dovuti ? "previste dall'orario" : "(giorno non lavorativo)";
  const m = modifica || {};
  const tipo = m.tipo || "lavoro";
  const clientiOrd = [...clienti].sort((a, b) => (a.codice || "").localeCompare(b.codice || ""));

  el.innerHTML = `
  <div class="testata">
    <div><h1>Registro ore</h1><div class="tenue">${e(nomeGiorno(giorno))}</div></div>
    <div class="barra">
      <button class="btn" id="prec" aria-label="Giorno precedente">◀</button>
      <input id="giorno" value="${e(fmtData(giorno))}" aria-label="Giorno" style="width:120px;text-align:center">
      <button class="btn" id="succ" aria-label="Giorno successivo">▶</button>
      <button class="btn" id="oggi">Oggi</button>
      ${admin ? `<select id="chi" aria-label="Registrazioni da mostrare"><option value="mie"${soloMie ? " selected" : ""}>Solo le mie</option><option value="tutte"${soloMie ? "" : " selected"}>Tutto lo studio</option></select>` : ""}
    </div>
  </div>

  ${admin && !soloMie ? `<div class="pannello" style="margin-bottom:14px"><strong>${fmtDurata(minTot)}</strong> registrate dallo studio oggi · ${fmtDurata(minFat)} fatturabili</div>` : obiettivo ? barraGiornata(minTot, minFat, obiettivo, fonte) : `<div class="pannello tenue" style="margin-bottom:14px">Giorno non lavorativo: nessuna ora prevista.</div>`}

  <form class="pannello" id="nuova" style="margin-bottom:14px">
    <div class="testata" style="margin-bottom:12px"><h2 style="font-size:16px">${modifica ? "Modifica registrazione" : "Nuova registrazione"}</h2>
      <div class="segmenti" role="radiogroup" aria-label="Tipo">${TIPI.map(([k, n]) => `<button type="button" role="radio" aria-checked="${k === tipo}" data-tipo="${k}"${modifica && k === "dafare" ? " disabled" : ""}>${e(n)}</button>`).join("")}</div>
    </div>
    <input type="hidden" name="tipo" value="${tipo}">
    <div class="griglia">
      <div class="largo"><label for="f_cliente">Cliente</label>
        <input id="f_cliente" list="lista-clienti" autocomplete="off" placeholder="Scrivi nome o codice" value="${e(m.clienteId ? nomeCli[m.clienteId] || "" : "")}">
        <datalist id="lista-clienti">${clientiOrd.map(c => `<option value="${e(nomeCli[c.id])}"></option>`).join("")}</datalist></div>
      <div class="solo-lavoro"><label for="f_mandato">Mandato o pratica</label><select id="f_mandato" name="mandato"></select></div>
      <div class="largo"><label for="f_descrizione" id="lbl-desc">Descrizione</label>
        <div style="display:flex;gap:8px;align-items:flex-start"><textarea id="f_descrizione" name="descrizione" rows="3" style="flex:1">${e(m.descrizione || "")}</textarea>
        <button type="button" class="btn" id="detta" title="Detta a voce" aria-label="Detta a voce">🎤</button></div></div>
      <div class="solo-lavoro largo"><label>Durata</label>
        <div class="chips">${DURATE.map(d => `<button type="button" data-min="${d}" aria-pressed="${m.minuti === d}">${d < 60 ? d + " min" : fmtDurata(d)}</button>`).join("")}
          <input name="minuti" id="f_minuti" type="number" min="0" step="5" value="${e(m.minuti ?? "")}" placeholder="minuti" aria-label="Minuti" style="width:100px"></div></div>
      ${campo("data", "Data", m.data || giorno, "date")}
      <div class="solo-lavoro">${campo("fatturabile", "Fatturabile", m.id ? !!m.fatturabile : true, "checkbox")}</div>
      <div class="solo-lavoro solo-nuova">${campo("riscontro", "Attende riscontro (crea un compito in attesa)", false, "checkbox")}</div>
      <div class="solo-riscontro">${campo("attesaEntro", "Risposta attesa entro", aggiungiGiorni(giorno, 30), "date")}</div>
      <div class="solo-dafare">${campo("scadenza", "Scadenza", "", "date")}</div>
      <div class="solo-dafare">${campo("visibilita", "Visibile a", "Solo a me", "select", ["Solo a me", "Tutto lo studio"])}</div>
    </div>
    <div class="azioni">${modifica ? '<button type="button" class="btn" id="annulla-mod">Annulla modifica</button>' : ""}<button class="btn primario">${modifica ? "Salva modifiche" : "Registra"}</button></div>
  </form>

  <section class="pannello" style="margin-bottom:14px">
    <h2 style="font-size:16px;margin-bottom:10px">${e(fmtData(giorno))}</h2>
    ${delGiorno.length ? `<table class="tabella"><thead><tr><th>Cliente</th><th>Descrizione</th>${admin && !soloMie ? "<th>Chi</th>" : ""}<th class="num">Durata</th><th></th></tr></thead><tbody>
      ${delGiorno.map(r => `<tr><td style="white-space:nowrap">${e(nomeCli[r.clienteId] || "–")}</td>
        <td>${r.tipo === "nota" ? stato("info", "Nota") + " " : ""}${e(r.descrizione).replace(/\n/g, "<br>")}${r.mandato && r.mandato !== "contabilita" ? `<div class="tenue" style="font-size:12px">${e(NOME_MANDATO[r.mandato] || "")}</div>` : ""}</td>
        ${admin && !soloMie ? `<td>${e(r.autoreNome || "")}</td>` : ""}
        <td class="num" style="white-space:nowrap">${r.tipo === "nota" ? "" : fmtDurata(r.minuti)}${r.tipo !== "nota" && !r.fatturabile ? '<div class="tenue">non fatt.</div>' : ""}</td>
        <td style="white-space:nowrap">${admin || r.autoreUid === u.uid ? `<button class="btn piccolo" data-mod="${e(r.id)}">Modifica</button> <button class="btn piccolo" data-del="${e(r.id)}" aria-label="Elimina">✕</button>` : ""}</td></tr>`).join("")}
    </tbody></table>` : `<div class="vuoto">Nessuna registrazione in questo giorno.</div>`}
  </section>

  <section class="pannello"><h2 style="font-size:16px;margin-bottom:10px">Settimana dal ${e(fmtData(lun))}</h2>
    <div class="settimana">${GIORNI.map((g, i) => {
      const d = aggiungiGiorni(lun, i), rr = settimana.filter(r => r.data === d && r.tipo !== "nota");
      const t = rr.reduce((s, r) => s + (r.minuti || 0), 0), f = rr.filter(r => r.fatturabile).reduce((s, r) => s + (r.minuti || 0), 0);
      return `<button type="button" class="giorno${d === giorno ? " attivo" : ""}" data-g="${d}"><span>${g} ${e(fmtData(d).slice(0, 5))}</span><strong>${t ? fmtDurata(t) : "–"}</strong><span class="tenue">${f ? fmtDurata(f) + " fatt." : ""}</span></button>`;
    }).join("")}</div></section>`;

  const form = el.querySelector("#nuova");
  const aggiornaTipo = (t) => {
    form.tipo.value = t;
    form.querySelectorAll("[data-tipo]").forEach(b => b.setAttribute("aria-checked", b.dataset.tipo === t));
    form.querySelectorAll(".solo-lavoro").forEach(x => x.hidden = t !== "lavoro");
    form.querySelectorAll(".solo-nuova").forEach(x => x.hidden = t !== "lavoro" || !!modifica);
    form.querySelectorAll(".solo-dafare").forEach(x => x.hidden = t !== "dafare");
    form.querySelector(".solo-riscontro").hidden = !(t === "lavoro" && form.riscontro?.checked && !modifica);
    el.querySelector("#lbl-desc").textContent = t === "dafare" ? "Cosa c'è da fare" : t === "nota" ? "Nota o decisione" : "Descrizione del lavoro";
  };
  aggiornaTipo(tipo);
  form.querySelectorAll("[data-tipo]").forEach(b => b.addEventListener("click", () => aggiornaTipo(b.dataset.tipo)));
  form.riscontro?.addEventListener("change", () => aggiornaTipo(form.tipo.value));
  form.querySelectorAll("[data-min]").forEach(b => b.addEventListener("click", () => {
    form.minuti.value = b.dataset.min;
    form.querySelectorAll("[data-min]").forEach(x => x.setAttribute("aria-pressed", x === b));
  }));
  impostaDettatura(el.querySelector("#detta"), form.descrizione);
  // Mandato: si propongono i mandati attivi del cliente scelto
  const trovaCliente = (t) => clientiOrd.find(c => nomeCli[c.id] === t)
    || clientiOrd.find(c => normNome(c.ragioneSociale) === normNome(t) || normNome(c.codice) === normNome(t));
  let ultimoCli;
  const aggiornaMandati = (scelto) => {
    const cli = trovaCliente(el.querySelector("#f_cliente").value.trim());
    if (scelto === undefined && cli?.id === ultimoCli) return; // stesso cliente: non toccare la scelta
    ultimoCli = cli?.id;
    const mm = cli ? mandatiDi(cli) : null;
    const att = mm ? TIPI_MANDATO.filter(([k]) => mm[k].attivo) : [];
    const opz = att.length ? att : TIPI_MANDATO;
    // Pratiche amministrative aperte del cliente (fuori mandato); in modifica anche quella già scelta
    const prat = cli ? pratiche.filter(p => p.clienteId === cli.id && (praticaAperta(p) || "pratica:" + p.id === scelto)) : [];
    form.mandato.innerHTML = opz.map(([k, n]) => `<option value="${k}"${k === scelto ? " selected" : ""}>${e(n)}</option>`).join("")
      + (prat.length ? `<optgroup label="Pratiche (fuori mandato)">${prat.map(p => `<option value="pratica:${e(p.id)}"${"pratica:" + p.id === scelto ? " selected" : ""}>${e(p.titolo || p.tipo)}</option>`).join("")}</optgroup>` : "");
  };
  aggiornaMandati(m.praticaId ? "pratica:" + m.praticaId : m.mandato);
  el.querySelector("#f_cliente").addEventListener("change", () => aggiornaMandati());
  el.querySelector("#f_cliente").addEventListener("input", () => aggiornaMandati());

  const ricarica = () => vistaRegistro(el);
  const vai = (d) => { giorno = d; modifica = null; ricarica(); };
  el.querySelector("#prec").addEventListener("click", () => vai(aggiungiGiorni(giorno, -1)));
  el.querySelector("#succ").addEventListener("click", () => vai(aggiungiGiorni(giorno, 1)));
  el.querySelector("#oggi").addEventListener("click", () => vai(oggiISO()));
  el.querySelector("#giorno").addEventListener("change", ev => { const d = parseData(ev.target.value); d ? vai(d) : avviso("Data non valida: usa gg.mm.aaaa"); });
  el.querySelector("#chi")?.addEventListener("change", ev => { soloMie = ev.target.value === "mie"; ricarica(); });
  el.querySelectorAll("[data-g]").forEach(b => b.addEventListener("click", () => vai(b.dataset.g)));
  el.querySelector("#annulla-mod")?.addEventListener("click", () => { modifica = null; ricarica(); });
  el.querySelectorAll("[data-mod]").forEach(b => b.addEventListener("click", () => {
    modifica = delGiorno.find(r => r.id === b.dataset.mod); ricarica(); window.scrollTo(0, 0);
  }));
  el.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    if (!confirm("Eliminare questa registrazione?")) return;
    await D.eliminaRegistrazione(b.dataset.del); avviso("Registrazione eliminata"); ricarica();
  }));

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const bad = dataNonValida(form); if (bad) { bad.focus(); avviso("Data non valida: usa gg.mm.aaaa"); return; }
    const t = form.tipo.value;
    const testoCli = el.querySelector("#f_cliente").value.trim();
    const cli = trovaCliente(testoCli);
    if (!cli && t !== "dafare") { el.querySelector("#f_cliente").focus(); avviso("Scegli un cliente dall'elenco"); return; }
    const descrizione = form.descrizione.value.trim();
    if (!descrizione) { form.descrizione.focus(); avviso("Scrivi una descrizione"); return; }
    const data = parseData(form.data.value) || giorno;

    if (t === "dafare") {
      await D.salvaCompito({ clienteId: cli?.id || null, titolo: descrizione, tipo: "Da fare", stato: "Da fare",
        scadenza: parseData(form.scadenza.value), visibilita: form.visibilita.value === "Tutto lo studio" ? "studio" : "privato",
        assegnatoUid: u.uid, assegnatoNome: u.nome, creato: new Date().toISOString() });
      avviso("Compito creato"); modifica = null; return ricarica();
    }
    const minuti = t === "nota" ? 0 : Number(form.minuti.value || 0);
    if (t === "lavoro" && !minuti) { form.minuti.focus(); avviso("Indica la durata"); return; }
    const dati = { ...(modifica?.id ? { id: modifica.id, autoreUid: modifica.autoreUid, autoreNome: modifica.autoreNome } : { creato: new Date().toISOString() }),
      clienteId: cli.id, data, minuti, fatturabile: t === "lavoro" ? form.fatturabile.checked : false, tipo: t, descrizione,
      mandato: t === "lavoro" ? (form.mandato.value.startsWith("pratica:") ? "pratica" : form.mandato.value || null) : null,
      praticaId: t === "lavoro" && form.mandato.value.startsWith("pratica:") ? form.mandato.value.slice(8) : null };
    const id = await D.salvaRegistrazione(dati);
    if (t === "lavoro" && !modifica && form.riscontro.checked) {
      await D.salvaCompito({ clienteId: cli.id, titolo: descrizione, tipo: "Attesa riscontro", stato: "In attesa riscontro",
        scadenza: parseData(form.attesaEntro.value), visibilita: "studio", assegnatoUid: u.uid, assegnatoNome: u.nome,
        registrazioneId: id, creato: new Date().toISOString() });
    }
    avviso(modifica ? "Registrazione aggiornata" : "Registrato"); modifica = null;
    if (data !== giorno) giorno = data;
    ricarica();
  });
}

function nomeGiorno(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const g = new Date(y, m - 1, d).toLocaleDateString("it-CH", { weekday: "long" });
  return `${g.charAt(0).toUpperCase() + g.slice(1)} ${fmtData(iso)}${iso === oggiISO() ? " · oggi" : ""}`;
}

function barraGiornata(tot, fat, obiettivo, fonte) {
  const p = x => Math.min(100, Math.round(x / obiettivo * 100));
  const scoperto = Math.max(0, obiettivo - tot);
  return `<div class="pannello giornata" style="margin-bottom:14px">
    <div class="fatti"><div><span>Registrate</span><strong>${fmtDurata(tot)}</strong> su ${fmtDurata(obiettivo)} ${fonte}</div>
      <div><span>Fatturabili</span><strong>${fmtDurata(fat)}</strong></div>
      <div><span>Non fatturabili</span>${fmtDurata(tot - fat)}</div>
      <div><span>Da registrare</span>${scoperto ? fmtDurata(scoperto) : stato("ok", "Giornata coperta")}</div></div>
    <div class="barra-g" role="img" aria-label="${fmtDurata(fat)} fatturabili, ${fmtDurata(tot - fat)} non fatturabili, ${fmtDurata(scoperto)} non registrate">
      <div class="fat" style="width:${p(fat)}%"></div><div class="nonfat" style="width:${Math.max(0, p(tot) - p(fat))}%"></div></div>
    <div class="legenda"><span><i class="fat"></i>Fatturabile</span><span><i class="nonfat"></i>Non fatturabile</span><span><i></i>Non registrato</span></div></div>`;
}

function impostaDettatura(btn, area) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { btn.hidden = true; return; }
  let rec = null;
  btn.addEventListener("click", () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = "it-CH"; rec.interimResults = false; rec.continuous = true;
    rec.onresult = ev => {
      const t = [...ev.results].slice(ev.resultIndex).map(r => r[0].transcript).join(" ").trim();
      if (t) area.value = (area.value ? area.value.trimEnd() + " " : "") + t.charAt(0).toUpperCase() + t.slice(1);
    };
    rec.onend = () => { rec = null; btn.textContent = "🎤"; btn.classList.remove("primario"); };
    rec.start(); btn.textContent = "■"; btn.classList.add("primario");
  });
}
