// Modulo Registro ore: una sola maschera, tre esiti (lavoro svolto, nota/decisione, da fare).
import * as D from "./data.js";
import { e, avviso, stato, campo, dataNonValida, selectCercabile } from "./ui.js";
import { CATEGORIE_SPESA, NOME_CATEGORIA, TARIFFA_KM, importoKm, fuoriIva, fmtNum } from "./regole.js";
import { preparaRicevuta, mostraRicevuta } from "./ricevute.js";
import { fmtData, parseData, fmtDurata, oggiISO, aggiungiGiorni, lunedi, normNome, GIORNI, TIPI_MANDATO, NOME_MANDATO, mandatiDi, minutiDovuti, praticaAperta, ID_INTERNO, CLIENTE_INTERNO, senzaOre } from "./regole.js";

const DURATE = [5, 10, 15, 30, 45, 60, 90, 120];
const TIPI = [["lavoro", "Lavoro svolto"], ["spesa", "Spesa"], ["nota", "Nota / decisione"], ["dafare", "Da fare"]];

let giorno = oggiISO();
let soloMie = true;
let modifica = null; // registrazione in modifica
// Elenco completo
let ePeriodo = "anno", eCli = "", eMand = "", eFatt = "", eCerca = "", eQuante = 50;
const PERIODI_E = [["mese", "Questo mese"], ["tre", "Ultimi 3 mesi"], ["anno", "Quest'anno"], ["tutto", "Dall'inizio"]];
const chiusa = r => !!r.fatturataIl;
let sQuante = 20;
let tipoDopo = null; // dopo aver salvato una spesa si resta sulla scheda Spesa

export async function vistaRegistro(el) {
  const admin = D.isAdmin(), u = D.utenteCorrente();
  const lun = lunedi(giorno), dom = aggiungiGiorni(lun, 6);
  const oggiE = oggiISO();
  const daE = ePeriodo === "mese" ? oggiE.slice(0, 8) + "01" : ePeriodo === "tre" ? aggiungiGiorni(oggiE, -92) : ePeriodo === "anno" ? oggiE.slice(0, 4) + "-01-01" : "2000-01-01";
  const [clienti, reg, profilo, presOggi, pratiche, tutte, spese] = await Promise.all([D.listaClienti(), D.listaRegistrazioniPeriodo(lun, dom),
    D.leggiProfilo(u.uid).catch(() => null), D.listaPresenze(u.uid, giorno, giorno).catch(() => []), D.listaPratiche().catch(() => []),
    D.listaRegistrazioniPeriodo(daE, "2999-12-31").catch(() => []), D.listaSpese(daE).catch(() => [])]);
  // Cliente fisso per le ore interne dello studio: lo crea l'amministratore la prima volta
  if (admin && !clienti.some(c => c.interno)) {
    try { await D.salvaCliente({ id: ID_INTERNO, ...CLIENTE_INTERNO }); clienti.push({ id: ID_INTERNO, ...CLIENTE_INTERNO }); } catch {}
  }
  const interno = clienti.find(c => c.interno);
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
  const tipo = m.tipo || tipoDopo || "lavoro"; tipoDopo = null;
  const clientiOrd = [...clienti].sort((a, b) => (a.codice || "").localeCompare(b.codice || ""));

  const pratPer = Object.fromEntries(pratiche.map(p => [p.id, p]));
  const puo = r => admin || r.autoreUid === u.uid;
  function azioni(r) {
    if (chiusa(r)) return `<span class="lucchetto" title="Ore già fatturate: non si possono modificare">🔒 Fatturata ${e(fmtData(r.fatturataIl))}</span>`;
    return puo(r) ? `<button class="btn piccolo" data-mod="${e(r.id)}">Modifica</button> <button class="btn piccolo" data-del="${e(r.id)}" aria-label="Elimina">✕</button>` : "";
  }
  const tipoF = r => r.tipo === "nota" ? "nota" : r.praticaId ? "pratica" : r.fatturabile === false ? "non" : r.extra || senzaOre(r.mandato) ? "extra" : "mandato"; // funzione, domiciliazione, intestazione: compenso fisso, ore come extra
  const ETI_F = { mandato: ["ok", "Nel mandato"], extra: ["urgente", "Extra"], non: ["neutro", "Non fatturabile"], pratica: ["info", "Pratica"], nota: ["info", "Nota"] };
  const q = normNome(eCerca);
  const elenco = tutte.filter(r => (!admin || !soloMie || r.autoreUid === u.uid)
    && (!eCli || r.clienteId === eCli) && (!eMand || (eMand === "pratica" ? !!r.praticaId : eMand === "stipendi" ? r.attivita === "stipendi" && !r.praticaId : (r.mandato || "contabilita") === eMand && !r.praticaId && !(r.attivita === "stipendi" && eMand === "contabilita" && r.mandato === "stipendi")))
    && (!eFatt || (eFatt === "aperte" ? !chiusa(r) : eFatt === "chiuse" ? chiusa(r) : tipoF(r) === eFatt))
    && (!q || normNome(`${r.descrizione} ${nomeCli[r.clienteId] || ""} ${r.autoreNome || ""}`).includes(q)))
    .sort((a, b) => b.data.localeCompare(a.data) || String(b.creato || "").localeCompare(String(a.creato || "")));
  const speseVis = spese.filter(x => !admin || !soloMie || x.autoreUid === u.uid)
    .sort((a, b) => b.data.localeCompare(a.data) || String(b.aggiornato || "").localeCompare(String(a.aggiornato || "")));
  function statoSpesa(x) {
    const st = x.riaddebito ? (x.fatturataIl ? stato("ok", "Riaddebitata " + fmtData(x.fatturataIl)) : stato("urgente", "Da riaddebitare")) : stato("neutro", "A carico dello studio");
    const rb = x.anticipataDa ? (x.rimborsataIl ? `<div class="tenue">rimborsata a ${e(x.anticipataNome || "")} il ${e(fmtData(x.rimborsataIl))}</div>` : `<div class="tenue">da rimborsare a ${e(x.anticipataNome || "")}</div>`) : "";
    return st + rb;
  }
  function azioniSpesa(x) {
    if (x.fatturataIl) return `<span class="lucchetto" title="Spesa già riaddebitata: non si può modificare">🔒</span>`;
    return puo(x) ? `<button class="btn piccolo" data-mods="${e(x.id)}">Modifica</button> <button class="btn piccolo" data-dels="${e(x.id)}" aria-label="Elimina spesa">✕</button>` : "";
  }
  function sezioneSpese() {
    const tot = speseVis.reduce((s, x) => s + (Number(x.importo) || 0), 0);
    const daRiadd = speseVis.filter(x => x.riaddebito && !x.fatturataIl).reduce((s, x) => s + (Number(x.importo) || 0), 0);
    return `<section class="pannello" id="elenco-spese" style="margin-top:14px">
    <div class="testa-d"><h2 style="font-size:16px">Spese${admin && !soloMie ? " dello studio" : ""}</h2>
      <span class="tenue" style="font-size:13px">${e(PERIODI_E.find(([k]) => k === ePeriodo)[1])} · ${speseVis.length} spese · CHF ${fmtNum(tot)} · da riaddebitare CHF ${fmtNum(daRiadd)}</span></div>
    ${speseVis.length ? `<div class="scorri"><table class="tabella"><thead><tr><th>Data</th><th>Cliente</th><th>Spesa</th><th>Descrizione</th>${admin && !soloMie ? "<th>Chi</th>" : ""}<th>Stato</th><th class="num">CHF</th><th></th><th></th></tr></thead><tbody>
      ${speseVis.slice(0, sQuante).map(x => `<tr${x.fatturataIl ? ' class="chiusa"' : ""}><td style="white-space:nowrap">${e(fmtData(x.data))}</td><td class="cli-r" title="${e(nomeCli[x.clienteId] || "")}">${e(nomeCli[x.clienteId] || "–")}</td>
        <td style="font-size:13px">${e(NOME_CATEGORIA[x.categoria] || "")}${x.km ? `<div class="tenue">${e(String(x.km))} km × ${fmtNum(TARIFFA_KM)}</div>` : ""}${fuoriIva(x) ? '<div class="tenue">fuori IVA</div>' : ""}</td>
        <td class="desc-r"><div class="testo-r">${e(x.descrizione || "")}</div></td>${admin && !soloMie ? `<td>${e(x.autoreNome || "")}</td>` : ""}
        <td>${statoSpesa(x)}</td><td class="num">${fmtNum(x.importo)}</td>
        <td>${x.haRicevuta ? `<button class="btn piccolo" data-ric="${e(x.id)}" title="Vedi la ricevuta" aria-label="Vedi la ricevuta">📎</button>` : ""}</td>
        <td style="white-space:nowrap">${azioniSpesa(x)}</td></tr>`).join("")}</tbody></table></div>
      ${speseVis.length > sQuante ? `<div class="azioni"><button class="btn" id="s-altre">Mostra tutte (${speseVis.length})</button></div>` : ""}`
      : '<div class="vuoto">Nessuna spesa nel periodo. Per registrarne una scegli "Spesa" in alto.</div>'}
    <p class="tenue" style="font-size:13px;margin-top:8px">Il periodo è quello scelto in "Tutte le registrazioni" qui sotto. Le spese già riaddebitate (🔒) non si possono più modificare.</p>
  </section>`;
  }

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
        <td class="cli-r" title="${e(nomeCli[r.clienteId] || "")}">${e(nomeCli[r.clienteId] || "–")}</td>
        <td style="font-size:13px">${r.praticaId ? e(pratPer[r.praticaId]?.titolo || "Pratica") : r.tipo === "nota" ? "" : e(NOME_MANDATO[r.mandato || "contabilita"] || "")}${r.attivita === "stipendi" && r.mandato !== "stipendi" ? " · Stipendi" : ""}</td>
        <td class="desc-r"><div class="testo-r">${e(r.descrizione).replace(/\n/g, "<br>")}</div></td>${admin && !soloMie ? `<td>${e(r.autoreNome || "")}</td>` : ""}
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

  ${admin && !soloMie ? `<div class="pannello" style="margin-bottom:14px"><strong>${fmtDurata(minTot)}</strong> registrate dallo studio oggi · ${fmtDurata(minFat)} fatturabili</div>` : profilo?.backoffice ? `<div class="pannello" style="margin-bottom:14px">${stato("neutro", "Back office")} Registra qui solo i lavori particolari. Oggi: <strong>${fmtDurata(minTot)}</strong> registrate · ${fmtDurata(minFat)} fatturabili</div>` : obiettivo ? barraGiornata(minTot, minFat, obiettivo, fonte) : `<div class="pannello tenue" style="margin-bottom:14px">Giorno non lavorativo: nessuna ora prevista.</div>`}

  <form class="pannello" id="nuova" style="margin-bottom:14px">
    <div class="testata" style="margin-bottom:12px"><h2 style="font-size:16px">${modifica ? "Modifica registrazione" : "Nuova registrazione"}</h2>
      <div class="segmenti" role="radiogroup" aria-label="Tipo">${TIPI.map(([k, n]) => `<button type="button" role="radio" aria-checked="${k === tipo}" data-tipo="${k}"${modifica && (k === "dafare" || (modifica.tipo === "spesa") !== (k === "spesa")) ? " disabled" : ""}>${e(n)}</button>`).join("")}</div>
    </div>
    <input type="hidden" name="tipo" value="${tipo}">
    <div class="griglia">
      <div class="largo"><div class="lbl-riga"><label for="f_cliente">Cliente</label>${interno ? '<button type="button" class="btn piccolo" id="interni">🏢 Lavori interni</button>' : ""}</div>
        <input id="f_cliente" list="lista-clienti" autocomplete="off" placeholder="Scrivi nome o codice" value="${e(m.clienteId ? nomeCli[m.clienteId] || "" : "")}">
        <datalist id="lista-clienti">${clientiOrd.map(c => `<option value="${e(nomeCli[c.id])}"></option>`).join("")}</datalist></div>
      <div class="solo-lavoro largo"><label id="lbl-scelta">Che lavoro è?</label>
        <input type="hidden" name="scelta" value=""><div class="chips scelte" id="scelte" role="radiogroup" aria-labelledby="lbl-scelta"><span class="tenue">Scegli prima il cliente</span></div></div>
      <div class="solo-spesa largo"><label id="lbl-cat">Che spesa è?</label>
        <input type="hidden" name="categoria" value="${e(m.categoria || "")}">
        <div class="chips scelte" role="radiogroup" aria-labelledby="lbl-cat">${CATEGORIE_SPESA.map(([k, n]) => `<button type="button" role="radio" data-cat="${k}" aria-checked="${m.categoria === k}">${e(n)}</button>`).join("")}</div></div>
      <div class="solo-spesa solo-km"><label for="f_km">Chilometri</label><input id="f_km" name="km" type="number" min="0" step="1" value="${e(m.km ?? "")}" placeholder="km andata e ritorno">
        <div class="tenue" style="font-size:12px;margin-top:4px">CHF ${fmtNum(TARIFFA_KM)} al km</div></div>
      <div class="solo-spesa"><label for="f_importo">Importo CHF</label><input id="f_importo" name="importo" type="number" min="0" step="0.05" value="${e(m.importo ?? "")}" placeholder="0.00"></div>
      <div class="solo-spesa largo"><label id="lbl-riadd">A chi va?</label><input type="hidden" name="riaddebito" value="${m.tipo === "spesa" ? (m.riaddebito ? "si" : "no") : ""}">
        <div class="chips scelte" role="radiogroup" aria-labelledby="lbl-riadd">
          <button type="button" role="radio" data-riadd="si" aria-checked="${m.tipo === "spesa" && !!m.riaddebito}"><i class="pt c-extra"></i>Da riaddebitare al cliente</button>
          <button type="button" role="radio" data-riadd="no" aria-checked="${m.tipo === "spesa" && !m.riaddebito}"><i class="pt c-non"></i>A carico dello studio</button></div></div>
      <div class="solo-spesa largo">${campo("anticipata", "Pagata da me con i miei soldi (da rimborsare)", !!m.anticipataDa, "checkbox")}</div>
      <div class="solo-spesa largo"><label>Ricevuta</label>
        <div class="zona-ric" id="zona-ric" tabindex="0" role="button" aria-label="Aggiungi la ricevuta">
          <input type="file" id="f_ric" accept="image/*,application/pdf" hidden>
          <span id="ric-testo">${m.haRicevuta ? "📎 Ricevuta allegata · trascina qui un altro file o clicca per sostituirla" : "Trascina qui la foto o il PDF della ricevuta, oppure clicca per sceglierla (dal telefono si apre la fotocamera)"}</span>
          <img id="ric-ante" alt="" hidden></div>
        ${m.haRicevuta ? `<div style="margin-top:6px"><button type="button" class="btn piccolo" data-ric="${e(m.id)}">Vedi la ricevuta attuale</button> <button type="button" class="btn piccolo" id="ric-togli">Togli la ricevuta</button></div>` : ""}</div>
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
      ${delGiorno.map(r => `<tr><td class="cli-r" title="${e(nomeCli[r.clienteId] || "")}">${e(nomeCli[r.clienteId] || "–")}</td>
        <td>${r.tipo === "nota" ? stato("info", "Nota") + " " : ""}${e(r.descrizione).replace(/\n/g, "<br>")}${r.attivita === "stipendi" ? '<div class="tenue" style="font-size:12px">Stipendi (nel forfait)</div>' : r.mandato && r.mandato !== "contabilita" ? `<div class="tenue" style="font-size:12px">${e(NOME_MANDATO[r.mandato] || "")}</div>` : ""}</td>
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

  ${sezioneSpese()}

  ${elencoCompleto()}`;

  const form = el.querySelector("#nuova");
  const aggiornaTipo = (t) => {
    form.tipo.value = t;
    form.querySelectorAll("[data-tipo]").forEach(b => b.setAttribute("aria-checked", b.dataset.tipo === t));
    form.querySelectorAll(".solo-lavoro").forEach(x => x.hidden = t !== "lavoro");
    form.querySelectorAll(".solo-nuova").forEach(x => x.hidden = t !== "lavoro" || !!modifica);
    form.querySelectorAll(".solo-dafare").forEach(x => x.hidden = t !== "dafare");
    form.querySelectorAll(".solo-spesa").forEach(x => x.hidden = t !== "spesa" || (x.classList.contains("solo-km") && form.categoria.value !== "trasferta"));
    aggiornaInviaSpesa();
    form.querySelector(".solo-riscontro").hidden = !(t === "lavoro" && form.riscontro?.checked && !modifica);
    el.querySelector("#lbl-desc").textContent = t === "dafare" ? "Cosa c'è da fare" : t === "nota" ? "Nota o decisione" : t === "spesa" ? "Descrizione (per esempio: con chi, dove, per cosa)" : "Descrizione del lavoro";
  };
  // --- spesa ---
  let ricNuova = null, ricTogli = false;
  function aggiornaInviaSpesa() {
    if (form.tipo.value !== "spesa") return;
    const v = Number(form.importo.value || 0);
    el.querySelector("#invia").textContent = modifica ? "Salva spesa" : v ? `Registra spesa CHF ${fmtNum(v)}` : "Registra spesa";
  }
  form.querySelectorAll("[data-cat]").forEach(b => b.addEventListener("click", () => {
    form.categoria.value = b.dataset.cat;
    form.querySelectorAll("[data-cat]").forEach(x => x.setAttribute("aria-checked", x === b));
    form.querySelector(".solo-km").hidden = b.dataset.cat !== "trasferta";
    if (b.dataset.cat === "trasferta") form.km.focus(); else form.importo.focus();
    // tasse ed emolumenti: si anticipano sempre per il cliente
    if (b.dataset.cat === "emolumenti" && !form.riaddebito.value) form.querySelector('[data-riadd="si"]').click();
  }));
  form.querySelectorAll("[data-riadd]").forEach(b => b.addEventListener("click", () => {
    form.riaddebito.value = b.dataset.riadd;
    form.querySelectorAll("[data-riadd]").forEach(x => x.setAttribute("aria-checked", x === b));
  }));
  form.km.addEventListener("input", () => { form.importo.value = form.km.value ? importoKm(form.km.value).toFixed(2) : ""; aggiornaInviaSpesa(); });
  form.importo.addEventListener("input", aggiornaInviaSpesa);
  const zona = el.querySelector("#zona-ric"), fileIn = el.querySelector("#f_ric");
  async function prendiFile(f) {
    if (!f) return;
    el.querySelector("#ric-testo").textContent = "Preparo la ricevuta…";
    try {
      ricNuova = await preparaRicevuta(f); ricTogli = false;
      const img = el.querySelector("#ric-ante"); img.src = ricNuova.img; img.hidden = false;
      el.querySelector("#ric-testo").textContent = `📎 ${f.name} · ${ricNuova.kb} KB · clicca o trascina per cambiarla`;
    } catch (err) { ricNuova = null; el.querySelector("#ric-testo").textContent = "Non riuscito: " + (err.message || err); }
  }
  zona.addEventListener("click", () => fileIn.click());
  zona.addEventListener("keydown", ev => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); fileIn.click(); } });
  fileIn.addEventListener("change", () => prendiFile(fileIn.files[0]));
  zona.addEventListener("dragover", ev => { ev.preventDefault(); zona.classList.add("sopra"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("sopra"));
  zona.addEventListener("drop", ev => { ev.preventDefault(); zona.classList.remove("sopra"); prendiFile(ev.dataTransfer.files[0]); });
  el.querySelector("#ric-togli")?.addEventListener("click", ev => { ricTogli = true; ricNuova = null; ev.target.closest("div").hidden = true; el.querySelector("#ric-testo").textContent = "La ricevuta verrà tolta quando salvi"; });
  el.querySelectorAll("[data-ric]").forEach(b => b.addEventListener("click", ev => { ev.stopPropagation(); mostraRicevuta(b.dataset.ric); }));
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
  const sceltaDi = r => !r?.id ? "" : r.praticaId ? "pratica:" + r.praticaId : r.fatturabile === false ? "non" : r.extra ? "consulenza" : r.attivita === "stipendi" ? "stipendi" : "mandato";
  let mandatoPrinc = null;
  const mm0 = c => mandatiDi(c);
  const memo = { get: id => { try { return localStorage.getItem("scelta_" + id) || ""; } catch { return ""; } }, set: (id, v) => { try { localStorage.setItem("scelta_" + id, v); } catch {} } };
  const nomeScelta = v => v === "consulenza" ? "Consulenza (extra)" : v === "non" ? "Non fatturabile" : v === "stipendi" ? "Stipendi (nel forfait)" : v.startsWith("pratica:") ? "Pratica" : "nel mandato";
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
    const att = TIPI_MANDATO.filter(([k]) => mm[k].attivo && k !== "stipendi").map(([k]) => k);
    mandatoPrinc = att.includes("contabilita") ? "contabilita" : att[0] || null;
    // Solo tre scelte: compreso nel mandato, consulenza extra, ore interne non fatturabili.
    // (una vecchia registrazione su una pratica, in modifica, resta visibile)
    // pratiche aperte del cliente: ore separate, da fatturare a parte con la pratica
    const prat = pratiche.filter(p => p.clienteId === cli.id && (praticaAperta(p) || "pratica:" + p.id === scelto));
    const voci = cli.interno ? [["non", "Non fatturabile", "ore interne dello studio", "c-non"]] : [["consulenza", "Consulenza", "extra, a ore", "c-extra"],
      ...(cli.forma === "Persona fisica" ? [["mandato", "Dichiarazione fiscale", "nel mandato", "c-mand"]] : [
      ["mandato", mandatoPrinc ? NOME_MANDATO[mandatoPrinc] : "Contabilità", "nel mandato", "c-mand"],
      ["stipendi", "Stipendi", "nel forfait", "c-mand"]]),
      ["non", "Non fatturabile", "ore interne", "c-non"],
      ...prat.map(p => ["pratica:" + p.id, "📁 " + (p.titolo || p.tipo), `pratica · ${p.fatturazione?.modo === "A ore" ? "a ore" : p.fatturazione?.modo === "Non fatturare" ? "non fatturata" : "forfait"}`, "c-prat"])];
    box.innerHTML = voci.map(([k, n, sotto, cl]) => `<button type="button" role="radio" data-sc="${e(k)}" aria-checked="false"><i class="pt ${cl}"></i>${e(n)}${sotto ? `<small>${e(sotto)}</small>` : ""}</button>`).join("");
    box.querySelectorAll("[data-sc]").forEach(x => x.addEventListener("click", () => scegli(x.dataset.sc)));
    // proposta: la scelta della registrazione in modifica, altrimenti l'ultima usata per questo cliente
    const prop = cli.interno ? "non" : scelto !== undefined ? scelto : memo.get(cli.id);
    scegli(voci.some(([k]) => k === prop) ? prop : "");
  };
  aggiornaMandati(m.id ? sceltaDi(m) : undefined);
  el.querySelector("#interni")?.addEventListener("click", () => {
    el.querySelector("#f_cliente").value = nomeCli[interno.id]; aggiornaMandati(); form.descrizione.focus();
  });
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
  selectCercabile(el.querySelector("#e-cli"));
  el.querySelector("#e-cli").addEventListener("change", filtroE(v => { eCli = v; }));
  el.querySelector("#e-mand").addEventListener("change", filtroE(v => { eMand = v; }));
  el.querySelector("#e-fatt").addEventListener("change", filtroE(v => { eFatt = v; }));
  el.querySelector("#e-cerca").addEventListener("change", filtroE(v => { eCerca = v; }));
  el.querySelector("#e-altre")?.addEventListener("click", () => { eQuante += 50; const y = window.scrollY; ricarica().then(() => window.scrollTo(0, y)); });
  // descrizioni lunghe: si vedono 3 righe, clic per aprire/chiudere
  el.querySelectorAll(".testo-r").forEach(t => { if (t.scrollHeight > t.clientHeight + 2) { t.classList.add("taglia"); t.title = "Clic per leggere tutto";
    const b = document.createElement("button"); b.type = "button"; b.className = "apri-r"; b.textContent = "▾ leggi tutto"; t.after(b);
    const giro = () => { const ap = t.classList.toggle("aperto"); b.textContent = ap ? "▴ chiudi" : "▾ leggi tutto"; };
    t.addEventListener("click", giro); b.addEventListener("click", giro); } });
  el.querySelectorAll("[data-vai]").forEach(a => a.addEventListener("click", ev => { ev.preventDefault(); vai(a.dataset.vai); window.scrollTo(0, 0); }));
  el.querySelectorAll("[data-del]").forEach(b => b.addEventListener("click", async () => {
    const r = [...delGiorno, ...tutte].find(x => x.id === b.dataset.del);
    if (r && chiusa(r)) { avviso("Ore già fatturate: non si possono eliminare"); return; }
    if (!confirm("Eliminare questa registrazione?")) return;
    await D.eliminaRegistrazione(b.dataset.del); avviso("Registrazione eliminata"); ricarica();
  }));

  async function salvaSpesaForm(cli) {
    const cat = form.categoria.value, imp = Math.round(Number(form.importo.value || 0) * 100) / 100, ria = form.riaddebito.value;
    if (!cat) { avviso("Scegli che spesa è"); return; }
    if (!(imp > 0)) { form.importo.focus(); avviso("Indica l'importo"); return; }
    if (!ria) { avviso("Scegli se la spesa va riaddebitata al cliente o è a carico dello studio"); return; }
    if (ria === "si" && (!cli || cli.interno)) { el.querySelector("#f_cliente").focus(); avviso("Per riaddebitarla scegli il cliente"); return; }
    const data = parseData(form.data.value) || giorno;
    const ms = modifica?.tipo === "spesa" ? modifica : null;
    const ant = form.anticipata.checked;
    const dati = { ...(ms ? { id: ms.id, autoreUid: ms.autoreUid, autoreNome: ms.autoreNome } : { creato: new Date().toISOString() }),
      clienteId: cli?.id || interno?.id || null, data, categoria: cat, importo: imp, km: cat === "trasferta" ? Number(form.km.value) || null : null,
      riaddebito: ria === "si", descrizione: form.descrizione.value.trim() || NOME_CATEGORIA[cat],
      anticipataDa: ant ? (ms?.anticipataDa || u.uid) : null, anticipataNome: ant ? (ms?.anticipataNome || u.nome) : null,
      haRicevuta: ricNuova ? true : ricTogli ? false : !!ms?.haRicevuta };
    const btn = el.querySelector("#invia"); btn.disabled = true;
    try {
      const id = await D.salvaSpesa(dati);
      if (ricNuova) {
        try { await D.salvaRicevuta(id, { img: ricNuova.img, nome: ricNuova.nome }); }
        catch { await D.salvaSpesa({ id, haRicevuta: !!ms?.haRicevuta }); avviso("Spesa salvata, ma la ricevuta non è stata caricata: riprova"); }
      } else if (ricTogli) await D.eliminaRicevuta(id).catch(() => {});
      avviso(ms ? "Spesa aggiornata" : `Spesa registrata: CHF ${fmtNum(imp)}`);
      modifica = null; tipoDopo = "spesa"; ricarica();
    } catch (err) { btn.disabled = false; avviso("Salvataggio non riuscito: " + (err.message || err)); }
  }
  el.querySelectorAll("[data-mods]").forEach(b => b.addEventListener("click", () => {
    const x = spese.find(y => y.id === b.dataset.mods); if (!x || x.fatturataIl) return;
    modifica = { ...x, tipo: "spesa" };
    ricarica().then(() => el.querySelector("#nuova")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }));
  el.querySelectorAll("[data-dels]").forEach(b => b.addEventListener("click", async () => {
    const x = spese.find(y => y.id === b.dataset.dels); if (!x || x.fatturataIl) return;
    if (!confirm(`Eliminare la spesa di CHF ${fmtNum(x.importo)}?`)) return;
    await D.eliminaSpesa(x.id); avviso("Spesa eliminata"); ricarica();
  }));
  el.querySelector("#s-altre")?.addEventListener("click", () => { sQuante = 100000; const y = window.scrollY; ricarica().then(() => window.scrollTo(0, y)); });

  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const bad = dataNonValida(form); if (bad) { bad.focus(); avviso("Data non valida: usa gg.mm.aaaa"); return; }
    const t = form.tipo.value;
    if (modifica && chiusa(modifica)) { avviso("Ore già fatturate: non si possono modificare"); return; }
    const testoCli = el.querySelector("#f_cliente").value.trim();
    const cli = trovaCliente(testoCli);
    if (t === "spesa") return salvaSpesaForm(cli);
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
      mandato: t === "lavoro" ? (prat ? "pratica" : sc === "stipendi" ? (mm0(cli).stipendi.attivo ? "stipendi" : mm0(cli).contabilita.attivo ? "contabilita" : mandatoPrinc) : (modifica?.mandato && !["pratica", "stipendi"].includes(modifica.mandato) ? modifica.mandato : sc === "mandato" ? mandatoPrinc : null)) : null,
      attivita: t === "lavoro" && sc === "stipendi" ? "stipendi" : null,
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
