// Modulo Registro ore: una sola maschera, tre esiti (lavoro svolto, nota/decisione, da fare).
import * as D from "./data.js";
import { e, avviso, stato, campo, dataNonValida } from "./ui.js";
import { fmtData, parseData, fmtDurata, oggiISO, aggiungiGiorni, lunedi, normNome, GIORNI, TIPI_MANDATO, NOME_MANDATO, mandatiDi, minutiDovuti, praticaAperta } from "./regole.js";

const DURATE = [5, 10, 15, 30, 45, 60, 90, 120];
const TIPI = [["lavoro", "Lavoro svolto"], ["nota", "Nota / decisione"], ["dafare", "Da fare"]];

let giorno = oggiISO();
let soloMie = true;
let modifica = null; // registrazione in modifica
// Elenco completo
let ePeriodo = "anno", eCli = "", eMand = "", eFatt = "", eCerca = "", eQuante = 50;
const PERIODI_E = [["mese", "Questo mese"], ["tre", "Ultimi 3 mesi"], ["anno", "Quest'anno"], ["tutto", "Dall'inizio"]];
const chiusa = r => !!r.fatturataIl;

export async function vistaRegistro(el) {
  const admin = D.isAdmin(), u = D.utenteCorrente();
  const lun = lunedi(giorno), dom = aggiungiGiorni(lun, 6);
  const oggiE = oggiISO();
  const daE = ePeriodo === "mese" ? oggiE.slice(0, 8) + "01" : ePeriodo === "tre" ? aggiungiGiorni(oggiE, -92) : ePeriodo === "anno" ? oggiE.slice(0, 4) + "-01-01" : "2000-01-01";
  const [clienti, reg, profilo, presOggi, pratiche, tutte] = await Promise.all([D.listaClienti(), D.listaRegistrazioniPeriodo(lun, dom),
    D.leggiProfilo(u.uid).catch(() => null), D.listaPresenze(u.uid, giorno, giorno).catch(() => []), D.listaPratiche().catch(() => []),
    D.listaRegistrazioniPeriodo(daE, "2999-12-31").catch(() => [])]);
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

  const pratPer = Object.fromEntries(pratiche.map(p => [p.id, p]));
  const puo = r => admin || r.autoreUid === u.uid;
  function azioni(r) {
    if (chiusa(r)) return `<span class="lucchetto" title="Ore già fatturate: non si possono modificare">🔒 Fatturata ${e(fmtData(r.fatturataIl))}</span>`;
    return puo(r) ? `<button class="btn piccolo" data-mod="${e(r.id)}">Modifica</button> <button class="btn piccolo" data-del="${e(r.id)}" aria-label="Elimina">✕</button>` : "";
  }
  const tipoF = r => r.tipo === "nota" ? "nota" : r.praticaId ? "pratica" : r.fatturabile === false ? "non" : r.extra ? "extra" : "mandato";
  const ETI_F = { mandato: ["ok", "Nel mandato"], extra: ["urgente", "Extra"], non: ["neutro", "Non fatturabile"], pratica: ["info", "Pratica"], nota: ["info", "Nota"] };
  const q = normNome(eCerca);
  const elenco = tutte.filter(r => (!admin || !soloMie || r.autoreUid === u.uid)
    && (!eCli || r.clienteId === eCli) && (!eMand || (eMand === "pratica" ? !!r.praticaId : (r.mandato || "contabilita") === eMand && !r.praticaId))
    && (!eFatt || (eFatt === "aperte" ? !chiusa(r) : eFatt === "chiuse" ? chiusa(r) : tipoF(r) === eFatt))
    && (!q || normNome(`${r.descrizione} ${nomeCli[r.clienteId] || ""} ${r.autoreNome || ""}`).includes(q)))
    .sort((a, b) => b.data.localeCompare(a.data) || String(b.creato || "").localeCompare(String(a.creato || "")));
  function elencoCompleto() {
    const lav = elenco.filter(r => r.tipo !== "nota"), tot = lav.reduce((s, r) => s + (r.minuti || 0), 0);
    const somma = t => lav.filter(r => tipoF(r) === t).reduce((s, r) => s + (r.minuti || 0), 0);
    return `<section class="pannello" id="elenco-reg" style="margin-top:14px">
    <div class="testa-d"><h2 style="font-size:16px">Tutte le registrazioni${admin && !soloMie ? " dello studio" : ""}</h2>
      <span class="tenue" style="font-size:13px">${elenco.length} registrazioni · ${fmtDurata(tot)} · nel mandato ${fmtDurata(somma("mandato"))} · extra ${fmtDurata(somma("extra"))} · pratiche ${fmtDurata(somma("pratica"))} · non fatt. ${fmtDurata(somma("non"))}</span></div>
    <div class="barra" style="margin:8px 0 12px">
      <select id="e-per" aria-label="Periodo">${PERIODI_E.map(([k, n]) => `<option value="${k}"${k === ePeriodo ? " selected" : ""}>${n}</option>`).join("")}</select>
      <select id="e-cli" aria-label="Cliente"><option value="">Tutti i clienti</option>${clientiOrd.map(c => `<option value="${e(c.id)}"${c.id === eCli ? " selected" : ""}>${e(nomeCli[c.id])}</option>`).join("")}</select>
      <select id="e-mand" aria-label="Mandato"><option value="">Tutti i mandati</option>${TIPI_MANDATO.map(([k, n]) => `<option value="${k}"${k === eMand ? " selected" : ""}>${e(n)}</option>`).join("")}<option value="pratica"${eMand === "pratica" ? " selected" : ""}>Pratiche</option></select>
      <select id="e-fatt" aria-label="Fatturazione"><option value="">Tutte</option>${[["aperte", "Non ancora fatturate"], ["chiuse", "Già fatturate (chiuse)"], ["mandato", "Nel mandato"], ["extra", "Extra"], ["pratica", "Pratiche"], ["non", "Non fatturabili"], ["nota", "Note"]].map(([k, n]) => `<option value="${k}"${k === eFatt ? " selected" : ""}>${n}</option>`).join("")}</select>
      <input type="search" id="e-cerca" placeholder="Cerca nel testo" value="${e(eCerca)}" aria-label="Cerca">
    </div>
    ${elenco.length ? `<div class="scorri"><table class="tabella"><thead><tr><th>Data</th><th>Cliente</th><th>Mandato / pratica</th><th>Descrizione</th>${admin && !soloMie ? "<th>Chi</th>" : ""}<th>Fatturazione</th><th class="num">Durata</th><th></th></tr></thead><tbody>
      ${elenco.slice(0, eQuante).map(r => `<tr${chiusa(r) ? ' class="chiusa"' : ""}><td style="white-space:nowrap"><a href="#" data-vai="${e(r.data)}">${e(fmtData(r.data))}</a></td>
        <td style="white-space:nowrap">${e(nomeCli[r.clienteId] || "–")}</td>
        <td style="font-size:13px">${r.praticaId ? e(pratPer[r.praticaId]?.titolo || "Pratica") : r.tipo === "nota" ? "" : e(NOME_MANDATO[r.mandato || "contabilita"] || "")}</td>
        <td class="desc-r">${e(r.descrizione).replace(/\n/g, "<br>")}</td>${admin && !soloMie ? `<td>${e(r.autoreNome || "")}</td>` : ""}
        <td>${stato(...ETI_F[tipoF(r)])}</td><td class="num" style="white-space:nowrap">${r.tipo === "nota" ? "" : fmtDurata(r.minuti)}</td>
        <td style="white-space:nowrap">${azioni(r)}</td></tr>`).join("")}</tbody></table></div>
      ${elenco.length > eQuante ? `<div class="azioni"><button class="btn" id="e-altre">Mostra altre ${Math.min(50, elenco.length - eQuante)} (di ${elenco.length - eQuante})</button></div>` : ""}`
      : '<div class="vuoto">Nessuna registrazione con questi filtri.</div>'}
    <p class="tenue" style="font-size:13px;margin-top:8px">Le ore già fatturate (🔒) sono chiuse e non si possono modificare né eliminare. Per correggerle serve l'amministratore.</p>
  </section>`;
  }

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
      <div class="solo-lavoro largo"><label id="lbl-scelta">Che lavoro è?</label>
        <input type="hidden" name="scelta" value=""><div class="chips scelte" id="scelte" role="radiogroup" aria-labelledby="lbl-scelta"><span class="tenue">Scegli prima il cliente</span></div></div>
      <div class="largo"><label for="f_descrizione" id="lbl-desc">Descrizione</label>
        <div style="display:flex;gap:8px;align-items:flex-start"><textarea id="f_descrizione" name="descrizione" rows="3" style="flex:1">${e(m.descrizione || "")}</textarea>
        <button type="button" class="btn" id="detta" title="Detta a voce" aria-label="Detta a voce">🎤</button></div></div>
      <div class="solo-lavoro largo"><label>Durata</label>
        <div class="chips">${DURATE.map(d => `<button type="button" data-min="${d}" aria-pressed="${m.minuti === d}">${d < 60 ? d + " min" : fmtDurata(d)}</button>`).join("")}
          <input name="minuti" id="f_minuti" type="number" min="0" step="5" value="${e(m.minuti ?? "")}" placeholder="minuti" aria-label="Minuti" style="width:100px"></div></div>
      ${campo("data", "Data", m.data || giorno, "date")}
      <div class="solo-lavoro solo-nuova">${campo("riscontro", "Attende riscontro (crea un compito in attesa)", false, "checkbox")}</div>
      <div class="solo-riscontro">${campo("attesaEntro", "Risposta attesa entro", aggiungiGiorni(giorno, 30), "date")}</div>
      <div class="solo-dafare">${campo("scadenza", "Scadenza", "", "date")}</div>
      <div class="solo-dafare">${campo("visibilita", "Visibile a", "Solo a me", "select", ["Solo a me", "Tutto lo studio"])}</div>
    </div>
    <div class="azioni">${modifica ? '<button type="button" class="btn" id="annulla-mod">Annulla modifica</button>' : ""}<button class="btn primario" id="invia">${modifica ? "Salva modifiche" : "Registra"}</button></div>
  </form>

  <section class="pannello" style="margin-bottom:14px">
    <h2 style="font-size:16px;margin-bottom:10px">${e(fmtData(giorno))}</h2>
    ${delGiorno.length ? `<table class="tabella"><thead><tr><th>Cliente</th><th>Descrizione</th>${admin && !soloMie ? "<th>Chi</th>" : ""}<th class="num">Durata</th><th></th></tr></thead><tbody>
      ${delGiorno.map(r => `<tr><td style="white-space:nowrap">${e(nomeCli[r.clienteId] || "–")}</td>
        <td>${r.tipo === "nota" ? stato("info", "Nota") + " " : ""}${e(r.descrizione).replace(/\n/g, "<br>")}${r.mandato && r.mandato !== "contabilita" ? `<div class="tenue" style="font-size:12px">${e(NOME_MANDATO[r.mandato] || "")}</div>` : ""}</td>
        ${admin && !soloMie ? `<td>${e(r.autoreNome || "")}</td>` : ""}
        <td class="num" style="white-space:nowrap">${r.tipo === "nota" ? "" : fmtDurata(r.minuti)}${r.tipo !== "nota" && !r.fatturabile ? '<div class="tenue">non fatt.</div>' : r.extra ? '<div class="tenue">extra</div>' : ""}</td>
        <td style="white-space:nowrap">${azioni(r)}</td></tr>`).join("")}
    </tbody></table>` : `<div class="vuoto">Nessuna registrazione in questo giorno.</div>`}
  </section>

  <section class="pannello"><h2 style="font-size:16px;margin-bottom:10px">Settimana dal ${e(fmtData(lun))}</h2>
    <div class="settimana">${GIORNI.map((g, i) => {
      const d = aggiungiGiorni(lun, i), rr = settimana.filter(r => r.data === d && r.tipo !== "nota");
      const t = rr.reduce((s, r) => s + (r.minuti || 0), 0), f = rr.filter(r => r.fatturabile).reduce((s, r) => s + (r.minuti || 0), 0);
      return `<button type="button" class="giorno${d === giorno ? " attivo" : ""}" data-g="${d}"><span>${g} ${e(fmtData(d).slice(0, 5))}</span><strong>${t ? fmtDurata(t) : "–"}</strong><span class="tenue">${f ? fmtDurata(f) + " fatt." : ""}</span></button>`;
    }).join("")}</div></section>

  ${elencoCompleto()}`;

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
  // Scelta unica "Che lavoro è?": decide insieme mandato e fatturazione (un clic)
  const sceltaDi = r => !r?.id ? "" : r.praticaId ? "pratica:" + r.praticaId : r.fatturabile === false ? "non" : r.extra ? "consulenza" : (r.mandato || "contabilita");
  const memo = { get: id => { try { return localStorage.getItem("scelta_" + id) || ""; } catch { return ""; } }, set: (id, v) => { try { localStorage.setItem("scelta_" + id, v); } catch {} } };
  const nomeScelta = v => v === "consulenza" ? "Consulenza (extra)" : v === "non" ? "Non fatturabile" : v.startsWith("pratica:") ? "Pratica" : (NOME_MANDATO[v] || "");
  const aggiornaInvia = () => {
    if (form.tipo.value !== "lavoro" || modifica) return;
    const min = Number(form.minuti.value || 0), sc = form.scelta.value;
    el.querySelector("#invia").textContent = min && sc ? `Registra ${min < 60 ? min + " min" : fmtDurata(min)} · ${nomeScelta(sc)}` : "Registra";
  };
  const scegli = v => {
    form.scelta.value = v;
    form.querySelectorAll("[data-sc]").forEach(x => x.setAttribute("aria-checked", x.dataset.sc === v));
    aggiornaInvia();
  };
  const aggiornaMandati = (scelto) => {
    const cli = trovaCliente(el.querySelector("#f_cliente").value.trim());
    if (scelto === undefined && cli?.id === ultimoCli) return; // stesso cliente: non toccare la scelta
    ultimoCli = cli?.id;
    const box = el.querySelector("#scelte");
    if (!cli) { box.innerHTML = '<span class="tenue">Scegli prima il cliente</span>'; form.scelta.value = ""; aggiornaInvia(); return; }
    const mm = mandatiDi(cli);
    const att = TIPI_MANDATO.filter(([k]) => mm[k].attivo);
    const prat = pratiche.filter(p => p.clienteId === cli.id && (praticaAperta(p) || "pratica:" + p.id === scelto));
    const voci = [["consulenza", "Consulenza", "extra, a ore", "c-extra"],
      ...att.map(([k, n]) => [k, n, "nel mandato", "c-mand"]),
      ...prat.map(p => ["pratica:" + p.id, p.titolo || p.tipo, "pratica", "c-prat"]),
      ["non", "Non fatturabile", "", "c-non"]];
    box.innerHTML = voci.map(([k, n, sotto, cl]) => `<button type="button" role="radio" data-sc="${e(k)}" aria-checked="false"><i class="pt ${cl}"></i>${e(n)}${sotto ? `<small>${e(sotto)}</small>` : ""}</button>`).join("");
    box.querySelectorAll("[data-sc]").forEach(x => x.addEventListener("click", () => scegli(x.dataset.sc)));
    // proposta: la scelta della registrazione in modifica, altrimenti l'ultima usata per questo cliente
    const prop = scelto !== undefined ? scelto : memo.get(cli.id);
    scegli(voci.some(([k]) => k === prop) ? prop : "");
  };
  aggiornaMandati(m.id ? sceltaDi(m) : undefined);
  el.querySelector("#f_cliente").addEventListener("change", () => aggiornaMandati());
  el.querySelector("#f_cliente").addEventListener("input", () => aggiornaMandati());
  form.minuti.addEventListener("input", aggiornaInvia);
  form.querySelectorAll("[data-min]").forEach(b => b.addEventListener("click", aggiornaInvia));

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
    modifica = delGiorno.find(r => r.id === b.dataset.mod) || tutte.find(r => r.id === b.dataset.mod);
    if (modifica && chiusa(modifica)) { modifica = null; avviso("Ore già fatturate: non si possono modificare"); return; }
    ricarica().then(() => el.querySelector("#nuova")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }));
  const filtroE = (fn) => ev => { fn(ev.target.value); eQuante = 50; ricarica().then(() => el.querySelector("#elenco-reg")?.scrollIntoView({ block: "start" })); };
  el.querySelector("#e-per").addEventListener("change", filtroE(v => { ePeriodo = v; }));
  el.querySelector("#e-cli").addEventListener("change", filtroE(v => { eCli = v; }));
  el.querySelector("#e-mand").addEventListener("change", filtroE(v => { eMand = v; }));
  el.querySelector("#e-fatt").addEventListener("change", filtroE(v => { eFatt = v; }));
  el.querySelector("#e-cerca").addEventListener("change", filtroE(v => { eCerca = v; }));
  el.querySelector("#e-altre")?.addEventListener("click", () => { eQuante += 50; const y = window.scrollY; ricarica().then(() => window.scrollTo(0, y)); });
  el.querySelectorAll("[data-vai]").forEach(a => a.addEventListener("click", ev => { ev.preventDefault(); vai(a.dataset.vai); window.scrollTo(0, 0); }));
  el.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    const r = [...delGiorno, ...tutte].find(x => x.id === b.dataset.del);
    if (r && chiusa(r)) { avviso("Ore già fatturate: non si possono eliminare"); return; }
    if (!confirm("Eliminare questa registrazione?")) return;
    await D.eliminaRegistrazione(b.dataset.del); avviso("Registrazione eliminata"); ricarica();
  }));

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const bad = dataNonValida(form); if (bad) { bad.focus(); avviso("Data non valida: usa gg.mm.aaaa"); return; }
    const t = form.tipo.value;
    if (modifica && chiusa(modifica)) { avviso("Ore già fatturate: non si possono modificare"); return; }
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
    const sc = form.scelta.value;
    if (t === "lavoro" && !sc) { el.querySelector("#scelte").scrollIntoView({ block: "center" }); avviso("Scegli che lavoro è: consulenza, mandato, pratica o non fatturabile"); return; }
    const prat = sc.startsWith("pratica:");
    const dati = { ...(modifica?.id ? { id: modifica.id, autoreUid: modifica.autoreUid, autoreNome: modifica.autoreNome } : { creato: new Date().toISOString() }),
      clienteId: cli.id, data, minuti, fatturabile: t === "lavoro" ? sc !== "non" : false, extra: t === "lavoro" && sc === "consulenza", tipo: t, descrizione,
      mandato: t === "lavoro" ? (prat ? "pratica" : sc === "consulenza" || sc === "non" ? (modifica?.mandato && modifica.mandato !== "pratica" ? modifica.mandato : null) : sc) : null,
      praticaId: t === "lavoro" && prat ? sc.slice(8) : null };
    if (t === "lavoro") memo.set(cli.id, sc);
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
