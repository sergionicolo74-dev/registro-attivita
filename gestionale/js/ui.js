// Piccoli aiuti per l'interfaccia, senza librerie.
import { fmtData, parseData, statoScadenza } from "./regole.js";

/** Escape HTML per tutto ciò che arriva dai dati. */
export function e(v) {
  return String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function avviso(msg) {
  const el = document.getElementById("avviso");
  el.textContent = msg; el.classList.add("vis");
  clearTimeout(avviso._t); avviso._t = setTimeout(() => el.classList.remove("vis"), 2600);
}

/** Etichetta di stato con simbolo: tipo = ok | urgente | scaduto | neutro | info */
export const stato = (tipo, testo) => `<span class="stato ${tipo}">${e(testo)}</span>`;

/** Stato di una data di scadenza con testo leggibile. */
export function statoData(iso, etichetta, soglia = 30) {
  const s = statoScadenza(iso, soglia);
  if (!s) return "";
  const testo = s === "scaduto" ? `${etichetta} scaduto ${fmtData(iso)}` : `${etichetta} ${fmtData(iso)}`;
  return stato(s, testo);
}

/** Campo di modulo. tipo: text | date | select | textarea | checkbox | number | email | tel */
export function campo(nome, etichetta, valore, tipo = "text", opzioni = [], largo = false) {
  const id = "f_" + nome.replace(/\W/g, "_");
  let input;
  if (tipo === "select") {
    input = `<select id="${id}" name="${e(nome)}"><option value=""></option>${opzioni.map(o => `<option${o === valore ? " selected" : ""}>${e(o)}</option>`).join("")}</select>`;
  } else if (tipo === "textarea") {
    input = `<textarea id="${id}" name="${e(nome)}" rows="3">${e(valore)}</textarea>`;
  } else if (tipo === "checkbox") {
    return `<div${largo ? ' class="largo"' : ""}><label style="display:flex;gap:8px;align-items:center;color:var(--inchiostro);font-weight:400;font-size:14px;margin-top:22px"><input type="checkbox" id="${id}" name="${e(nome)}" style="width:auto"${valore ? " checked" : ""}> ${e(etichetta)}</label></div>`;
  } else if (tipo === "date") {
    // Testo con formato gg.mm.aaaa: così le date sono sempre con i punti, indipendentemente dal browser
    input = `<input id="${id}" name="${e(nome)}" type="text" data-data="1" inputmode="numeric" placeholder="gg.mm.aaaa" value="${e(fmtData(valore))}">`;
  } else {
    input = `<input id="${id}" name="${e(nome)}" type="${tipo}" value="${e(valore)}"${tipo === "number" ? ' step="any"' : ""}>`;
  }
  return `<div${largo ? ' class="largo"' : ""}><label for="${id}">${e(etichetta)}</label>${input}</div>`;
}

/** Legge un form in un oggetto; i nomi con il punto ("mandato.tipo") diventano oggetti annidati. */
/** Controlla i campi data prima del salvataggio: ritorna il primo campo non valido o null. */
export function dataNonValida(form) {
  return [...form.querySelectorAll("[data-data]")].find(el => el.value.trim() && !parseData(el.value)) || null;
}

export function leggiForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    const v = el.type === "checkbox" ? el.checked : el.type === "number" ? (el.value === "" ? null : Number(el.value))
      : el.dataset.data ? parseData(el.value) : el.value.trim();
    const parti = el.name.split(".");
    let o = out;
    while (parti.length > 1) { const p = parti.shift(); o = o[p] = o[p] || {}; }
    o[parti[0]] = v;
  }
  return out;
}
