// Importazione dati (solo amministratori): anagrafica da Excel e backup del vecchio registro.
import * as D from "./data.js";
import { e, avviso, stato } from "./ui.js";
import { fmtOre, normNome, clienteSpeciale } from "./regole.js";
import { clientiDaExcel, personeDaExcel, abbinaNome, documentiDaBackup, unisciCliente, nomiSimili } from "./mappa-import.js";

// SheetJS (licenza Apache 2.0) incluso nel progetto, così non dipende da siti esterni
const SHEETJS = new URL("../lib/xlsx.full.min.js", import.meta.url).href;
function caricaSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((ok, ko) => { const s = document.createElement("script"); s.src = SHEETJS; s.onload = () => ok(window.XLSX); s.onerror = ko; document.head.append(s); });
}

export async function vistaImporta(el) {
  el.innerHTML = `<div class="testata"><h1>Importa dati</h1></div>
  <div class="passi">
    <section class="pannello"><h2 style="font-size:16px">1 · Anagrafica clienti da Excel</h2>
      <p class="tenue">Usa il modello "Anagrafica clienti" (completo o precedente). I clienti già presenti, riconosciuti per codice o per nome, vengono aggiornati solo con le celle compilate: quello che hai già inserito nel gestionale non viene cancellato. Le persone vengono aggiunte.</p>
      <input type="file" id="file-xlsx" accept=".xlsx,.xls" aria-label="File Excel">
      <div id="anteprima-xlsx" style="margin-top:12px"></div></section>
    <section class="pannello"><h2 style="font-size:16px">2 · Backup del vecchio registro attività</h2>
      <p class="tenue">Il file JSON scaricato con "Esporta backup". I clienti che non esistono ancora vengono creati con il nome del registro (codici C001, C002… in ordine alfabetico, come nel file Excel dell'anagrafica): l'anagrafica completa si potrà importare dopo e verrà abbinata per codice o per nome. Si può ripetere: le voci già importate non si duplicano.</p>
      <input type="file" id="file-json" accept=".json" aria-label="File di backup">
      <div id="anteprima-json" style="margin-top:12px"></div></section>
  </div>`;
  el.querySelector("#file-xlsx").addEventListener("change", ev => ev.target.files[0] && anteprimaExcel(ev.target.files[0], el.querySelector("#anteprima-xlsx")));
  el.querySelector("#file-json").addEventListener("change", ev => ev.target.files[0] && anteprimaBackup(ev.target.files[0], el.querySelector("#anteprima-json")));
}

async function anteprimaExcel(file, box) {
  box.innerHTML = "Lettura del file…";
  let XLSX;
  try { XLSX = await caricaSheetJS(); } catch { box.innerHTML = stato("scaduto", "Non riesco a caricare il lettore Excel"); return; }
  const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
  // Il modello completo ha una riga di gruppi sopra le intestazioni: in quel caso le intestazioni sono nella riga 2
  const foglio = n => {
    const sh = wb.Sheets[n]; if (!sh) return [];
    const a1 = String(sh["A1"]?.v ?? "").trim();
    return XLSX.utils.sheet_to_json(sh, { defval: "", range: a1 === "Codice cliente" ? 0 : 1 });
  };
  if (!wb.Sheets["Clienti"]) { box.innerHTML = stato("scaduto", "Nel file manca il foglio Clienti"); return; }
  const { clienti, kyc, errori, senzaCodice = [] } = clientiDaExcel(foglio("Clienti"));
  const esistenti = await D.listaClienti();
  const perCodice = Object.fromEntries(esistenti.map(c => [c.codice, c]));
  // Abbinamento di ogni riga del file a un cliente del gestionale:
  // 1) stesso nome (o "Nome precedente") → è quel cliente; 2) stesso codice e nome simile → rinomina.
  // I codici del file sono quelli giusti: i clienti riconosciuti prendono il codice del file (le ore restano collegate, il codice è solo un'etichetta).
  // Un codice del file già usato da un cliente che non è nel file riceve invece un codice libero, segnalato.
  const piano = [], mappa = {}, conflitti = [], riassegnati = [], perNomeL = [];
  const presi = new Map();
  for (const c of clienti) {
    const exNome = abbinaNome(c.ragioneSociale, esistenti) || (c.nomePrecedente ? abbinaNome(c.nomePrecedente, esistenti) : null), exCod = perCodice[c.codice];
    let ex = null;
    if (exNome) ex = exNome;
    else if (exCod && (normNome(exCod.ragioneSociale) === normNome(c.ragioneSociale) || nomiSimili(exCod.ragioneSociale, c.ragioneSociale))) ex = exCod;
    if (ex && presi.has(ex.id)) { conflitti.push(`«${c.ragioneSociale}» e «${presi.get(ex.id)}» corrispondono allo stesso cliente ${ex.codice} del gestionale`); continue; }
    if (ex) presi.set(ex.id, c.ragioneSociale);
    piano.push({ c, ex, cod: null });
  }
  // 2° giro: nomi scritti un po' diversi ("Janson Bridging" / "Janson Bridging Italia S.r.l.", "Tokenance OÜ" / "Tokenance OÜ, Tallinn, succursale…").
  // Si abbinano solo coppie univoche: un cliente del gestionale non ancora abbinato e una sola riga del file non abbinata simile a lui (e viceversa).
  const simili = [];
  const libE = esistenti.filter(c => !presi.has(c.id) && !clienteSpeciale(c));
  const libF = piano.filter(x => !x.ex);
  const sim = (a, b) => nomiSimili(a.ragioneSociale, b.ragioneSociale) || (b.nomePrecedente && nomiSimili(a.ragioneSociale, b.nomePrecedente))
    || (a.aliasNomi || []).some(n => nomiSimili(n, b.ragioneSociale));
  for (const ex of libE) {
    const cand = libF.filter(x => !x.ex && sim(ex, x.c));
    if (cand.length !== 1) continue;
    const x = cand[0];
    if (libE.filter(e2 => e2 !== ex && sim(e2, x.c)).length) continue;
    x.ex = ex; presi.set(ex.id, x.c.ragioneSociale); simili.push(`${ex.codice} «${ex.ragioneSociale}» = «${x.c.ragioneSociale}»`);
  }
  const fissi = new Set(esistenti.filter(c => !presi.has(c.id)).map(c => c.codice)); // clienti che non sono nel file: tengono il loro codice
  const usati = new Set([...fissi, ...clienti.map(c => c.codice)]);
  let prossimo = Math.max(0, ...[...usati].map(k => /^C\d+$/.test(k || "") ? +k.slice(1) : 0));
  const libero = () => { let k; do { k = "C" + String(++prossimo).padStart(3, "0"); } while (usati.has(k)); usati.add(k); return k; };
  for (const x of piano) {
    if (fissi.has(x.c.codice)) { x.cod = libero(); riassegnati.push(`${x.c.ragioneSociale}: ${x.c.codice} è già «${perCodice[x.c.codice].ragioneSociale}» nel gestionale → riceve ${x.cod}`); }
    else x.cod = x.c.codice;
    if (x.ex && x.ex.codice !== x.cod) perNomeL.push(`${x.c.ragioneSociale}: ${x.ex.codice} → ${x.cod}`);
    mappa[x.c.codice] = x.cod;
  }
  const perNome = perNomeL.length;
  errori.push(...conflitti);
  const codici = new Set([...clienti.map(c => c.codice), ...esistenti.map(c => c.codice)]);
  const { persone, errori: errP, senzaCodice: persSenza = 0 } = personeDaExcel(foglio("Persone"), codici);
  const rinomina = piano.filter(x => x.ex && normNome(x.ex.ragioneSociale) !== normNome(x.c.ragioneSociale)).map(x => `${x.cod}: «${x.ex.ragioneSociale}» diventa «${x.c.ragioneSociale}»`);
  const nuovi = piano.filter(x => !x.ex).length;
  const tuttiErr = [...errori, ...errP];
  box.innerHTML = `<div class="segnali">${stato("info", `${piano.length} clienti: ${nuovi} nuovi, ${piano.length - nuovi} da aggiornare`)}${stato("info", `${persone.length} persone`)}${perNome ? stato("info", `${perNome} codici aggiornati`) : ""}
    ${tuttiErr.length ? stato("scaduto", `${tuttiErr.length} problemi`) : stato("ok", "Nessun problema")}</div>
    ${tuttiErr.length ? `<ul>${tuttiErr.map(x => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
    ${simili.length ? `<p style="margin-top:8px">${stato("info", `${simili.length} clienti riconosciuti con il nome scritto diversamente`)} <span class="tenue" style="font-size:13px">controlla che siano davvero gli stessi</span></p><ul style="font-size:13px">${simili.map(x => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
    ${riassegnati.length ? `<p style="margin-top:8px">${stato("urgente", `${riassegnati.length} codici cambiati per evitare doppioni`)}</p><ul style="font-size:13px">${riassegnati.map(x => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
    ${perNomeL.length ? `<details style="font-size:13px;margin-top:8px"><summary>${perNomeL.length} clienti già presenti prendono il codice del file (le ore restano collegate)</summary><ul>${perNomeL.map(x => `<li>${e(x)}</li>`).join("")}</ul></details>` : ""}
    ${rinomina.length ? `<p style="margin-top:8px">${stato("info", `${rinomina.length} nomi aggiornati`)} <span class="tenue" style="font-size:13px">il nome vecchio resta come alias, le ore già registrate restano collegate</span></p><ul style="font-size:13px">${rinomina.map(x => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
    ${senzaCodice.length ? `<p style="margin-top:8px">${stato("urgente", `${senzaCodice.length} righe senza codice cliente: non vengono importate`)}</p><details style="font-size:13px"><summary>Vedi quali</summary>${senzaCodice.map(e).join(" · ")}</details><p class="tenue" style="font-size:13px">Per importarle dai loro un codice nel file (C035, C036…).</p>` : ""}
    ${persSenza ? `<p style="margin-top:8px">${stato("urgente", `${persSenza} persone senza codice cliente: non vengono importate`)} <span class="tenue" style="font-size:13px">nel foglio Persone scrivi in colonna A il codice del cliente a cui appartengono</span></p>` : ""}
    ${conflitti.length ? `<p>${stato("scaduto", "Doppioni: correggi il file prima di importare")}</p>` : ""}
    <div class="azioni"><button class="btn primario" id="vai-xlsx" ${clienti.length && !conflitti.length ? "" : "disabled"}>Importa</button></div><div class="avanzamento" hidden><div></div></div>`;
  box.querySelector("#vai-xlsx").addEventListener("click", async () => {
    box.querySelector("#vai-xlsx").disabled = true;
    const barra = box.querySelector(".avanzamento"); barra.hidden = false;
    // 1) clienti (aggiorna quelli con lo stesso codice, conserva i nomi precedenti per abbinare il backup)
    const ids = {};
    for (const { c: c0, ex, cod } of piano) {
      const { nomePrecedente, ...c } = c0;
      const alias = new Set([...(ex?.aliasNomi || []), ...(ex && ex.ragioneSociale !== c.ragioneSociale ? [ex.ragioneSociale] : []), ...(nomePrecedente ? [nomePrecedente] : [])]);
      ids[c.codice] = await D.salvaCliente({ ...(ex ? { ...unisciCliente(ex, c), id: ex.id } : c), codice: cod, aliasNomi: [...alias] });
    }
    for (const { codice, ...r } of kyc) {
      const pieni = Object.fromEntries(Object.entries(r).filter(([, v]) => v != null && v !== ""));
      if (Object.keys(pieni).length && ids[codice]) await D.salvaKycCliente(ids[codice], pieni);
    }
    // 2) persone
    for (const p of persone) {
      const clienteId = ids[p.codice] || perCodice[p.codice]?.id;
      if (!clienteId) continue;
      const clientePF = p.codicePF ? (ids[p.codicePF] || perCodice[p.codicePF]?.id || null) : null;
      // stessa persona già presente (es. importazione ripetuta): si aggiorna invece di duplicarla
      const gia = (await D.listaPersone(clienteId).catch(() => [])).find(y => normNome(`${y.cognome} ${y.nome}`) === normNome(`${p.dati.cognome} ${p.dati.nome}`));
      const pid = await D.salvaPersona({ ...(gia ? { id: gia.id } : {}), ...p.dati, clienteId, ...(clientePF ? { clientePF } : {}) });
      if (Object.values(p.kyc).some(Boolean)) await D.salvaKycPersona(pid, { ...p.kyc, clienteId });
    }
    barra.firstElementChild.style.width = "100%";
    avviso("Anagrafica importata"); box.insertAdjacentHTML("beforeend", `<p>${stato("ok", "Importazione completata")} <a href="#/clienti">Vai ai clienti</a></p>`);
  });
}

async function anteprimaBackup(file, box) {
  let backup;
  try { backup = JSON.parse(await file.text()); } catch { box.innerHTML = stato("scaduto", "Il file non è un backup valido"); return; }
  if (!Array.isArray(backup.attivita)) { box.innerHTML = stato("scaduto", "Il file non contiene attività"); return; }
  const clienti = await D.listaClienti();
  const nomi = [...new Set([...(backup.clienti || []), ...[...backup.attivita, ...(backup.promemoria || []), ...(backup.deleghe || [])].map(a => a.cliente)].filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));
  const occasionali = n => ["altri clienti", "clienti occasionali"].includes(normNome(n));
  const minPer = {}; backup.attivita.forEach(a => minPer[a.cliente] = (minPer[a.cliente] || 0) + (a.minuti || 0));
  const opzioni = (sel) => `<option value="">— non importare —</option><option value="__crea"${sel === "__crea" ? " selected" : ""}>+ Crea nuovo cliente con questo nome</option><option value="__nuovo_occasionali"${sel === "__nuovo_occasionali" ? " selected" : ""}>Clienti occasionali (C000)</option>` +
    clienti.sort((a, b) => (a.codice || "").localeCompare(b.codice || "")).map(c => `<option value="${e(c.id)}"${c.id === sel ? " selected" : ""}>${e(c.codice)} · ${e(c.ragioneSociale)}</option>`).join("");
  const proposta = n => { const c = abbinaNome(n, clienti); if (c) return c.id; return occasionali(n) ? (clienti.find(x => x.codice === "C000")?.id || "__nuovo_occasionali") : "__crea"; };
  // Clienti già presenti che non corrispondono a nessun nome del registro (es. prove): spostano la numerazione dei codici
  const estranei = clienti.filter(c => c.codice !== "C000" && !c.interno && !nomi.some(n => abbinaNome(n, [c])));
  box.innerHTML = `${estranei.length ? `<div class="pannello allerta" style="margin-bottom:12px">${stato("urgente", "Prima di importare")}
    <p style="margin:8px 0 0">Nel gestionale ci sono già ${estranei.length === 1 ? "un cliente che non è" : estranei.length + " clienti che non sono"} nel registro: ${estranei.map(c => `<a href="#/clienti/${encodeURIComponent(c.id)}">${e(c.codice)} · ${e(c.ragioneSociale)}</a>`).join(", ")}.
    Se ${estranei.length === 1 ? "è una prova, eliminalo" : "sono prove, eliminali"} (apri il cliente → <strong>Elimina cliente</strong>) e poi ricarica questa pagina: così i nuovi clienti avranno i codici C001… come nel file Excel dell'anagrafica.</p></div>` : ""}
    <p>${backup.attivita.length} attività (${fmtOre(backup.attivita.reduce((s, a) => s + (a.minuti || 0), 0))} ore), ${(backup.promemoria || []).length} promemoria, ${(backup.deleghe || []).length} deleghe. Controlla gli abbinamenti dei clienti:</p>
    <table class="tabella"><thead><tr><th>Nome nel vecchio registro</th><th class="num">Ore</th><th>Cliente nel gestionale</th></tr></thead><tbody>
    ${nomi.map(n => `<tr><td>${e(n)}</td><td class="num">${fmtOre(minPer[n] || 0)}</td><td><select data-nome="${e(n)}" aria-label="Cliente per ${e(n)}">${opzioni(proposta(n))}</select></td></tr>`).join("")}</tbody></table>
    <div class="azioni"><span id="mancanti" class="tenue" style="margin-right:auto"></span><button class="btn primario" id="vai-json">Importa</button></div><div class="avanzamento" hidden><div></div></div>`;
  const conta = () => {
    const sel = [...box.querySelectorAll("select")], m = sel.filter(s => !s.value).length, n = sel.filter(s => s.value === "__crea").length;
    box.querySelector("#mancanti").textContent = [n ? `${n} clienti nuovi verranno creati.` : "", m ? `${m} nomi non importati.` : "Nessun nome escluso."].filter(Boolean).join(" ");
  };
  box.querySelectorAll("select").forEach(s => s.addEventListener("change", conta)); conta();
  box.querySelector("#vai-json").addEventListener("click", async () => {
    box.querySelector("#vai-json").disabled = true;
    const abb = {};
    let occ = clienti.find(x => x.codice === "C000")?.id;
    // codici nuovi dopo il più alto esistente, in ordine alfabetico (come il file Excel dell'anagrafica)
    let prossimo = Math.max(0, ...clienti.map(c => +(/^C(\d+)$/.exec(c.codice || "") || [0, 0])[1]));
    for (const s of box.querySelectorAll("select")) {
      let v = s.value;
      if (v === "__nuovo_occasionali") { if (!occ) occ = await D.salvaCliente({ codice: "C000", ragioneSociale: "Clienti occasionali", forma: "Altro", stato: "Attivo", servizi: {}, mandati: {} }); v = occ; }
      if (v === "__crea") v = await D.salvaCliente({ codice: "C" + String(++prossimo).padStart(3, "0"), ragioneSociale: s.dataset.nome, stato: "Attivo", servizi: {}, mandati: {}, creatoDa: "registro-attivita" });
      if (v) abb[s.dataset.nome] = v;
    }
    const u = D.utenteCorrente();
    const docs = documentiDaBackup(backup, abb, { uid: u.uid, nome: u.nome });
    // deleghe: abbina il collaboratore per nome, se esiste già come utente
    const utenti = await D.listaUtenti().catch(() => []);
    for (const d of docs) if (d.col === "compiti" && !d.assegnatoUid && d.assegnatoNome) {
      const k = normNome(d.assegnatoNome), x = utenti.find(y => normNome(y.nome) === k || normNome(y.nome).split(" ")[0] === k);
      if (x) { d.assegnatoUid = x.id; d.assegnatoNome = x.nome; }
    }
    const barra = box.querySelector(".avanzamento"); barra.hidden = false;
    await D.scriviMolti(docs, (f, t) => { barra.firstElementChild.style.width = Math.round(f / t * 100) + "%"; });
    const nuovi = [...box.querySelectorAll("select")].filter(x => x.value === "__crea").length;
    avviso("Backup importato"); box.insertAdjacentHTML("beforeend", `<p>${stato("ok", `${docs.length} voci importate`)}${nuovi ? " " + stato("info", `${nuovi} clienti creati`) : ""} <a href="#/registro">Vai al Registro ore</a> · <a href="#/clienti">Vai ai clienti</a></p>`);
  });
}
