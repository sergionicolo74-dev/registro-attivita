// Importazione dati (solo amministratori): anagrafica da Excel e backup del vecchio registro.
import * as D from "./data.js";
import { e, avviso, stato } from "./ui.js";
import { fmtOre } from "./regole.js";
import { clientiDaExcel, personeDaExcel, abbinaNome, documentiDaBackup, unisciCliente } from "./mappa-import.js";

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
      <p class="tenue">Usa il modello "Anagrafica clienti". I clienti già presenti con lo stesso codice vengono aggiornati solo con le celle compilate: quello che hai già inserito nel gestionale non viene cancellato. Le persone vengono aggiunte.</p>
      <input type="file" id="file-xlsx" accept=".xlsx,.xls" aria-label="File Excel">
      <div id="anteprima-xlsx" style="margin-top:12px"></div></section>
    <section class="pannello"><h2 style="font-size:16px">2 · Backup del vecchio registro attività</h2>
      <p class="tenue">Il file JSON scaricato con "Esporta backup". Importalo dopo l'anagrafica, così le ore vanno ai clienti giusti. Si può ripetere: le voci già importate non si duplicano.</p>
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
  const foglio = n => wb.Sheets[n] ? XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: "" }) : [];
  if (!wb.Sheets["Clienti"]) { box.innerHTML = stato("scaduto", "Nel file manca il foglio Clienti"); return; }
  const { clienti, kyc, errori } = clientiDaExcel(foglio("Clienti"));
  const esistenti = await D.listaClienti();
  const perCodice = Object.fromEntries(esistenti.map(c => [c.codice, c]));
  const codici = new Set([...clienti.map(c => c.codice), ...esistenti.map(c => c.codice)]);
  const { persone, errori: errP } = personeDaExcel(foglio("Persone"), codici);
  const nuovi = clienti.filter(c => !perCodice[c.codice]).length;
  const tuttiErr = [...errori, ...errP];
  box.innerHTML = `<div class="segnali">${stato("info", `${clienti.length} clienti: ${nuovi} nuovi, ${clienti.length - nuovi} da aggiornare`)}${stato("info", `${persone.length} persone`)}
    ${tuttiErr.length ? stato("scaduto", `${tuttiErr.length} problemi`) : stato("ok", "Nessun problema")}</div>
    ${tuttiErr.length ? `<ul>${tuttiErr.map(x => `<li>${e(x)}</li>`).join("")}</ul>` : ""}
    <div class="azioni"><button class="btn primario" id="vai-xlsx" ${clienti.length ? "" : "disabled"}>Importa</button></div><div class="avanzamento" hidden><div></div></div>`;
  box.querySelector("#vai-xlsx").addEventListener("click", async () => {
    box.querySelector("#vai-xlsx").disabled = true;
    const barra = box.querySelector(".avanzamento"); barra.hidden = false;
    // 1) clienti (aggiorna quelli con lo stesso codice, conserva i nomi precedenti per abbinare il backup)
    const ids = {};
    for (const c of clienti) {
      const ex = perCodice[c.codice];
      const alias = new Set([...(ex?.aliasNomi || []), ...(ex && ex.ragioneSociale !== c.ragioneSociale ? [ex.ragioneSociale] : [])]);
      ids[c.codice] = await D.salvaCliente({ ...(ex ? unisciCliente(ex, c) : c), aliasNomi: [...alias] });
    }
    for (const { codice, ...r } of kyc) if (Object.values(r).some(Boolean)) await D.salvaKycCliente(ids[codice], r);
    // 2) persone
    for (const p of persone) {
      const clienteId = ids[p.codice] || perCodice[p.codice]?.id;
      const pid = await D.salvaPersona({ ...p.dati, clienteId });
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
  const nomi = [...new Set([...backup.attivita, ...(backup.promemoria || []), ...(backup.deleghe || [])].map(a => a.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const minPer = {}; backup.attivita.forEach(a => minPer[a.cliente] = (minPer[a.cliente] || 0) + (a.minuti || 0));
  const opzioni = (sel) => `<option value="">— non importare —</option><option value="__nuovo_occasionali"${sel === "__nuovo_occasionali" ? " selected" : ""}>Clienti occasionali (C000)</option>` +
    clienti.sort((a, b) => (a.codice || "").localeCompare(b.codice || "")).map(c => `<option value="${e(c.id)}"${c.id === sel ? " selected" : ""}>${e(c.codice)} · ${e(c.ragioneSociale)}</option>`).join("");
  const proposta = n => { const c = abbinaNome(n, clienti); if (c) return c.id; return n.toLowerCase() === "altri clienti" ? (clienti.find(x => x.codice === "C000")?.id || "__nuovo_occasionali") : ""; };
  box.innerHTML = `<p>${backup.attivita.length} attività (${fmtOre(backup.attivita.reduce((s, a) => s + (a.minuti || 0), 0))} ore), ${(backup.promemoria || []).length} promemoria, ${(backup.deleghe || []).length} deleghe. Controlla gli abbinamenti dei clienti:</p>
    <table class="tabella"><thead><tr><th>Nome nel vecchio registro</th><th class="num">Ore</th><th>Cliente nel gestionale</th></tr></thead><tbody>
    ${nomi.map(n => `<tr><td>${e(n)}</td><td class="num">${fmtOre(minPer[n] || 0)}</td><td><select data-nome="${e(n)}" aria-label="Cliente per ${e(n)}">${opzioni(proposta(n))}</select></td></tr>`).join("")}</tbody></table>
    <div class="azioni"><span id="mancanti" class="tenue" style="margin-right:auto"></span><button class="btn primario" id="vai-json">Importa</button></div><div class="avanzamento" hidden><div></div></div>`;
  const conta = () => { const m = [...box.querySelectorAll("select")].filter(s => !s.value).length; box.querySelector("#mancanti").textContent = m ? `${m} nomi non abbinati: le loro ore non verranno importate.` : "Tutti i nomi sono abbinati."; };
  box.querySelectorAll("select").forEach(s => s.addEventListener("change", conta)); conta();
  box.querySelector("#vai-json").addEventListener("click", async () => {
    box.querySelector("#vai-json").disabled = true;
    const abb = {};
    let occ = clienti.find(x => x.codice === "C000")?.id;
    for (const s of box.querySelectorAll("select")) {
      let v = s.value;
      if (v === "__nuovo_occasionali") { if (!occ) occ = await D.salvaCliente({ codice: "C000", ragioneSociale: "Clienti occasionali", forma: "Altro", stato: "Attivo", servizi: {}, mandato: {} }); v = occ; }
      if (v) abb[s.dataset.nome] = v;
    }
    const u = D.utenteCorrente();
    const docs = documentiDaBackup(backup, abb, { uid: u.uid, nome: u.nome });
    const barra = box.querySelector(".avanzamento"); barra.hidden = false;
    await D.scriviMolti(docs, (f, t) => { barra.firstElementChild.style.width = Math.round(f / t * 100) + "%"; });
    avviso("Backup importato"); box.insertAdjacentHTML("beforeend", `<p>${stato("ok", `${docs.length} voci importate`)}</p>`);
  });
}
