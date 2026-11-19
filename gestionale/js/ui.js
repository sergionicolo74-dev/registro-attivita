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
    input = `<input id="${id}" name="${e(nome)}" type="text" data-data="1" inputmode="decimal" autocomplete="off" placeholder="gg.mm.aaaa" value="${e(fmtData(valore))}">`;
  } else {
    input = `<input id="${id}" name="${e(nome)}" type="${tipo}" value="${e(valore)}"${tipo === "number" ? ' step="any"' : ""}>`;
  }
  return `<div${largo ? ' class="largo"' : ""}><label for="${id}">${e(etichetta)}</label>${input}</div>`;
}

/** Legge un form in un oggetto; i nomi con il punto ("mandato.tipo") diventano oggetti annidati. */
/** Controlla i campi data prima del salvataggio: ritorna il primo campo non valido o null. */
export function dataNonValida(form) {
  const el = [...form.querySelectorAll("[data-data]")].find(x => x.value.trim() && !parseData(x.value)) || null;
  if (el) {
    // il messaggio generico viene sostituito da uno che dice quale campo correggere
    const nome = form.querySelector(`label[for="${el.id}"]`)?.textContent || "Data";
    el.focus(); el.select?.();
    setTimeout(() => avviso(`${nome}: «${el.value}» non è una data valida. Scrivi per esempio ${fmtData(new Date().toISOString().slice(0, 10))}`), 0);
  }
  return el;
}
// Le date scritte in un altro modo (17-11-26, 17112026…) vengono riscritte come gg.mm.aaaa appena si esce dal campo
document.addEventListener("focusout", ev => {
  const el = ev.target;
  if (el?.dataset?.data && el.value.trim()) { const iso = parseData(el.value); if (iso) el.value = fmtData(iso); }
});

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

/**
 * Trasforma un <select> lungo (es. elenco clienti) in una casella dove si scrive e si sceglie:
 * bastano poche lettere del nome o del codice. Il <select> resta nascosto e riceve il "change" come prima.
 */
export function selectCercabile(sel) {
  if (!sel || sel.dataset.cerca) return;
  sel.dataset.cerca = "1";
  const norm = t => (t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[·.,'’\-]/g, " ").replace(/\s+/g, " ").trim();
  const opz = [...sel.options].map(o => ({ v: o.value, t: o.textContent, n: norm(o.textContent) }));
  const box = document.createElement("div"); box.className = "cerca-sel";
  const inp = document.createElement("input");
  const idLista = `${sel.id || "sel"}-lista`;
  Object.assign(inp, { type: "text", autocomplete: "off", placeholder: `${opz[0]?.t || ""} · scrivi per cercare` });
  inp.setAttribute("aria-label", sel.getAttribute("aria-label") || "Cerca");
  inp.setAttribute("role", "combobox"); inp.setAttribute("aria-autocomplete", "list"); inp.setAttribute("aria-controls", idLista); inp.setAttribute("aria-expanded", "false");
  const ul = document.createElement("ul"); ul.className = "cerca-lista"; ul.id = idLista; ul.setAttribute("role", "listbox"); ul.hidden = true;
  const testoScelto = () => (sel.value ? sel.selectedOptions[0]?.textContent || "" : "");
  inp.value = testoScelto();
  sel.hidden = true; sel.after(box); box.append(inp, ul);
  let vis = [], att = 0;
  const disegna = () => {
    ul.innerHTML = vis.length ? vis.map((o, i) => `<li role="option" data-i="${i}" aria-selected="${i === att}"${o.v === sel.value ? ' class="scelto"' : ""}>${e(o.t)}</li>`).join("")
      : '<li class="nessuno">Nessuna corrispondenza</li>';
    ul.hidden = false; inp.setAttribute("aria-expanded", "true");
    ul.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  };
  const filtra = q => {
    const n = norm(q);
    if (!n) vis = opz.slice();
    else { // prima chi ha una parola che inizia con il testo scritto, poi chi lo contiene
      const parole = o => (" " + o.n).includes(" " + n);
      vis = [...opz.filter(o => o.n.includes(n) && parole(o)), ...opz.filter(o => o.n.includes(n) && !parole(o))];
    }
    att = 0; disegna();
  };
  const chiudi = () => { ul.hidden = true; inp.setAttribute("aria-expanded", "false"); };
  const scegli = o => {
    chiudi(); inp.value = o.v ? o.t : "";
    if (sel.value !== o.v) { sel.value = o.v; sel.dispatchEvent(new Event("change", { bubbles: true })); }
  };
  inp.addEventListener("focus", () => { inp.select(); filtra(""); });
  inp.addEventListener("input", () => filtra(inp.value));
  inp.addEventListener("keydown", ev => {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault(); if (ul.hidden) return filtra(inp.value);
      att = Math.max(0, Math.min(vis.length - 1, att + (ev.key === "ArrowDown" ? 1 : -1))); disegna();
    } else if (ev.key === "Enter") { ev.preventDefault(); if (vis[att]) scegli(vis[att]); }
    else if (ev.key === "Escape") { chiudi(); inp.value = testoScelto(); }
  });
  inp.addEventListener("blur", () => setTimeout(() => { chiudi(); inp.value = testoScelto(); }, 150));
  ul.addEventListener("mousedown", ev => { const li = ev.target.closest("[data-i]"); if (!li) return; ev.preventDefault(); scegli(vis[+li.dataset.i]); });
}
