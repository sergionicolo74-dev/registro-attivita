// Modulo Utenti (solo amministratori): collaboratori che accedono al gestionale.
import * as D from "./data.js";
import { e, avviso, stato, campo, leggiForm } from "./ui.js";
import { fmtData, coloriUtenti, COLORI_PERSONA } from "./regole.js";

const NOMI_COLORE = ["Blu", "Arancio", "Verde acqua", "Ocra", "Rosa", "Verde", "Viola", "Rosso"];

const RUOLI = [["utente", "Utente (vede solo i propri dati)"], ["admin", "Amministratore (vede tutto)"]];
const ERRORI = {
  "auth/email-already-in-use": "Esiste già un account con questa email. Se è di un collaboratore senza accesso, scrivimi il suo codice utente.",
  "auth/invalid-email": "Email non valida.",
  "auth/operation-not-allowed": "In Firebase l'accesso con email e password non è attivo.",
  "auth/network-request-failed": "Connessione assente: riprova."
};

export async function vistaUtenti(el) {
  const me = D.utenteCorrente();
  const tutti = await D.listaUtenti();
  const col = coloriUtenti(tutti.filter(x => x.attivo !== false && x.ruolo));
  // Fissa una volta per tutte il colore di chi non l'ha ancora: così scegliere un colore per uno non cambia quello degli altri
  const daFissare = tutti.filter(x => col[x.id] && !x.colore);
  if (daFissare.length) {
    await Promise.all(daFissare.map(x => D.salvaUtente({ id: x.id, colore: COLORI_PERSONA.indexOf(col[x.id]) + 1 })));
    daFissare.forEach(x => { x.colore = COLORI_PERSONA.indexOf(col[x.id]) + 1; });
  }
  const utenti = tutti.sort((a, b) => (b.attivo !== false) - (a.attivo !== false) || String(a.nome || "").localeCompare(String(b.nome || "")));
  el.innerHTML = `<div class="testata"><div><h1>Utenti</h1><div class="tenue">Chi può accedere al gestionale</div></div>
      <div class="barra"><button class="btn primario" id="nuovo-u">Nuovo collaboratore</button></div></div>
    <table class="tabella"><thead><tr><th>Nome</th><th>Colore</th><th>Email</th><th>Ruolo</th><th>Accesso</th><th>Accordo 73b</th><th>Orario</th><th class="num">Vacanze</th><th class="num">Tariffa</th></tr></thead><tbody>
    ${utenti.map(u => `<tr class="cliccabile" data-id="${e(u.id)}" tabindex="0">
      <td><strong>${e(u.nome || "(senza nome)")}</strong>${u.id === me.uid ? ' <span class="tenue">· tu</span>' : ""}</td>
      <td>${col[u.id] ? `<span class="leg-p"><i style="background:${col[u.id]}"></i>${e(NOMI_COLORE[COLORI_PERSONA.indexOf(col[u.id])])}</span>` : "–"}</td><td>${e(u.email || "")}</td>
      <td>${u.ruolo === "admin" ? stato("info", "Amministratore") : u.ruolo === "utente" ? stato("neutro", "Utente") : stato("urgente", "Nessun ruolo")}${u.ruolo === "utente" && u.fatturazione ? " " + stato("info", "Report e fatture") : ""}${u.backoffice ? " " + stato("neutro", "Back office") : ""}</td>
      <td>${u.attivo === false ? stato("scaduto", "Disattivato") : stato("ok", "Attivo")}</td>
      <td>${u.accordo73b ? e(fmtData(u.accordo73b)) : '<span class="tenue">–</span>'}</td>
      <td>${e(u.oreSettimanali || 42)} h · ${e(u.percentuale ?? 100)}%</td><td class="num">${u.giorniVacanza ? e(u.giorniVacanza) + " giorni" : '<span class="tenue">da impostare</span>'}</td><td class="num">CHF ${e(u.tariffa || 150)}/h</td></tr>`).join("")}</tbody></table>
    <p class="tenue" style="margin-top:10px">La tariffa serve a valutare le ore lavorate e le ore extra (es. titolare CHF 190, collaboratori CHF 150), salvo una tariffa concordata con il cliente. Il nome deve essere scritto come nel campo "Responsabile" dei clienti: così lo Scadenziario sa di chi sono le scadenze. I giorni di vacanza si impostano qui (clic sulla persona); orario, accordo 73b e saldo ore in Presenze → Orario e accordo.</p>`;
  const ricarica = () => vistaUtenti(el);
  el.querySelector("#nuovo-u").addEventListener("click", () => cassetto(null, ricarica, col));
  el.querySelectorAll("tr[data-id]").forEach(tr => {
    const apri = () => cassetto(utenti.find(u => u.id === tr.dataset.id), ricarica, col);
    tr.addEventListener("click", apri); tr.addEventListener("keydown", ev => { if (ev.key === "Enter") apri(); });
  });
}

function cassetto(u, ricarica, col = {}) {
  const me = D.utenteCorrente(), nuovo = !u, io = u?.id === me.uid;
  const velo = document.createElement("div"); velo.className = "velo";
  const box = document.createElement("aside"); box.className = "cassetto"; box.setAttribute("role", "dialog"); box.setAttribute("aria-label", "Utente");
  box.innerHTML = `<form><h2 style="font-size:18px;margin-bottom:14px">${nuovo ? "Nuovo collaboratore" : e(u.nome || "Utente")}</h2>
    <div class="griglia">
      ${campo("nome", "Nome e cognome", u?.nome, "text", [], true)}
      ${nuovo ? campo("email", "Email di lavoro", "", "email", [], true) : `<div class="largo"><label>Email</label><div style="padding:8px 0">${e(u.email || "–")}</div></div>`}
      <div><label for="f_ruolo">Ruolo</label><select id="f_ruolo" name="ruolo"${io ? " disabled" : ""}>${RUOLI.map(([k, n]) => `<option value="${k}"${(u?.ruolo || "utente") === k ? " selected" : ""}>${e(n)}</option>`).join("")}</select></div>
      <div class="largo"><label>Colore nel calendario delle vacanze</label><div class="scegli-col" role="radiogroup" aria-label="Colore">
        ${COLORI_PERSONA.map((c, i) => { const scelto = u?.colore ? u.colore === i + 1 : col[u?.id] === c;
          return `<label class="leg-p"><input type="radio" name="colore" value="${i + 1}"${scelto ? " checked" : ""}><i style="background:${c}"></i>${NOMI_COLORE[i]}</label>`; }).join("")}</div></div>
      ${campo("tariffa", "Tariffa oraria CHF (vuoto = 150)", u?.tariffa, "number")}
      ${campo("giorniVacanza", "Giorni di vacanza all'anno (es. 20 o 25; a tempo pieno)", u?.giorniVacanza, "number")}
      <div class="largo">${campo("backoffice", "Back office: registra le ore solo per i lavori particolari (il resto della presenza conta come back office, non come ore mancanti)", !!u?.backoffice, "checkbox", [], true)}</div>
      <div class="largo" id="box-fatt"${(u?.ruolo || "utente") === "admin" ? " hidden" : ""}>${campo("fatturazione", "Può vedere i Report e fatturare (ore di tutti, fatture, redditività)", !!u?.fatturazione, "checkbox", [], true)}</div>
      ${nuovo ? "" : `<div><label for="f_att">Accesso</label><select id="f_att" name="attivo"${io ? " disabled" : ""}><option value="si"${u.attivo !== false ? " selected" : ""}>Attivo</option><option value="no"${u.attivo === false ? " selected" : ""}>Disattivato</option></select></div>`}
    </div>
    ${nuovo ? `<p class="tenue" style="font-size:13px;margin-top:12px">Il collaboratore riceve un'email per scegliere la propria password (controllare anche lo spam). Poi entra dall'indirizzo del gestionale con la sua email.</p>`
      : `<p class="tenue" style="font-size:13px;margin-top:12px">${io ? "Non puoi cambiare il tuo ruolo né disattivarti. " : "Disattivato: non può più entrare, ma le sue ore e presenze restano conservate. "}Codice utente: <code>${e(u.id)}</code></p>`}
    <div class="azioni">${!nuovo && u.email ? '<button type="button" class="btn" id="reinvia" style="margin-right:auto">Reinvia email password</button>' : ""}
      <button type="button" class="btn" id="annulla-u">Chiudi</button><button class="btn primario">${nuovo ? "Crea e invia email" : "Salva"}</button></div></form>`;
  document.body.append(velo, box);
  const form = box.querySelector("form");
  const chiudi = () => { velo.remove(); box.remove(); };
  velo.addEventListener("click", chiudi); box.querySelector("#annulla-u").addEventListener("click", chiudi);
  form.ruolo.addEventListener("change", () => { box.querySelector("#box-fatt").hidden = form.ruolo.value === "admin"; });
  box.querySelector("#reinvia")?.addEventListener("click", async () => {
    try { await D.recuperaPassword(u.email); avviso(`Email inviata a ${u.email}`); } catch { avviso("Invio non riuscito"); }
  });
  form.addEventListener("submit", async ev => {
    ev.preventDefault();
    const d = leggiForm(form), btn = form.querySelector(".primario");
    if (!d.nome) { form.nome.focus(); avviso("Scrivi nome e cognome"); return; }
    const sc = form.querySelector("input[name=colore]:checked");
    const occupato = sc && Object.entries(col).find(([id, c]) => id !== u?.id && c === COLORI_PERSONA[+sc.value - 1]);
    if (occupato && !confirm(`Questo colore è già usato da un altro collaboratore. Usarlo comunque?`)) return;
    if (nuovo) {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email || "")) { form.email.focus(); avviso("Email non valida"); return; }
      btn.disabled = true; btn.textContent = "Creazione…";
      try {
        const id = await D.creaCollaboratore({ nome: d.nome, email: d.email.toLowerCase(), ruolo: d.ruolo });
        const scelto = form.querySelector("input[name=colore]:checked");
        await D.salvaUtente({ id, tariffa: d.tariffa || null, giorniVacanza: d.giorniVacanza ?? null, ...(scelto ? { colore: +scelto.value } : {}), fatturazione: d.ruolo === "utente" && !!d.fatturazione, backoffice: !!d.backoffice });
        chiudi(); avviso(`Account creato: email inviata a ${d.email}`); ricarica();
      } catch (x) {
        console.error(x); btn.disabled = false; btn.textContent = "Crea e invia email";
        avviso(ERRORI[x.code] || "Creazione non riuscita: " + (x.message || x));
      }
      return;
    }
    const scelto = form.querySelector("input[name=colore]:checked");
    await D.salvaUtente({ id: u.id, nome: d.nome, tariffa: d.tariffa || null, giorniVacanza: d.giorniVacanza ?? null, ...(scelto ? { colore: +scelto.value } : {}), backoffice: !!d.backoffice, ...(io ? {} : { ruolo: d.ruolo, attivo: d.attivo !== "no", fatturazione: d.ruolo === "utente" && !!d.fatturazione }) });
    chiudi(); avviso("Utente aggiornato"); ricarica();
  });
  form.nome.focus();
}
