// Ricevute delle spese: foto o PDF trasformati in un'immagine JPEG compressa (di solito 100–300 KB),
// salvata nel database insieme alla spesa. Così non serve lo spazio file a pagamento di Firebase.
import * as D from "./data.js";
import { avviso } from "./ui.js";

const LATO_MAX = 1600;          // pixel sul lato lungo: leggibile a schermo e in stampa
const LIMITE = 700 * 1024;      // il documento Firestore non può superare 1 MB
const PDFJS = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/";

/** Da un file (immagine o PDF) a { img: dataURL JPEG, nome, kb }. */
export async function preparaRicevuta(file) {
  if (!file) return null;
  let canvas;
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) canvas = await canvasDaPdf(file);
  else if (file.type.startsWith("image/")) canvas = await canvasDaImmagine(file);
  else throw new Error("Formato non supportato: usa una foto (JPG, PNG) o un PDF");
  let q = 0.72, url = canvas.toDataURL("image/jpeg", q);
  while (url.length > LIMITE && q > 0.35) { q -= 0.1; url = canvas.toDataURL("image/jpeg", q); }
  if (url.length > LIMITE) { canvas = riduci(canvas, 0.7); url = canvas.toDataURL("image/jpeg", 0.6); }
  if (url.length > LIMITE) throw new Error("La ricevuta è troppo grande anche compressa");
  return { img: url, nome: file.name || "ricevuta", kb: Math.round(url.length * 0.75 / 1024) };
}

async function canvasDaImmagine(file) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, LATO_MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/** PDF: le prime pagine (max 3) una sotto l'altra. */
async function canvasDaPdf(file) {
  const pdfjs = await import(PDFJS + "pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + "pdf.worker.min.mjs";
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const n = Math.min(doc.numPages, 3), pagine = [];
  for (let i = 1; i <= n; i++) {
    const p = await doc.getPage(i), v0 = p.getViewport({ scale: 1 });
    const v = p.getViewport({ scale: LATO_MAX / Math.max(v0.width, v0.height) });
    const c = document.createElement("canvas"); c.width = Math.round(v.width); c.height = Math.round(v.height);
    await p.render({ canvasContext: c.getContext("2d"), viewport: v }).promise;
    pagine.push(c);
  }
  if (pagine.length === 1) return pagine[0];
  // più pagine: affiancate in verticale, ridotte perché il totale resti leggibile ma leggero
  const w = Math.max(...pagine.map(c => c.width)), h = pagine.reduce((s, c) => s + c.height, 0);
  const s = Math.min(1, (LATO_MAX * 1.6) / h);
  const out = document.createElement("canvas"); out.width = Math.round(w * s); out.height = Math.round(h * s);
  const g = out.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, out.width, out.height);
  let y = 0; for (const c of pagine) { g.drawImage(c, 0, y, c.width * s, c.height * s); y += c.height * s; }
  if (doc.numPages > 3) avviso(`Il PDF ha ${doc.numPages} pagine: salvate le prime 3`);
  return out;
}

function riduci(c, f) {
  const o = document.createElement("canvas"); o.width = Math.round(c.width * f); o.height = Math.round(c.height * f);
  o.getContext("2d").drawImage(c, 0, 0, o.width, o.height); return o;
}

/** Mostra la ricevuta di una spesa in una finestra sopra la pagina. */
export async function mostraRicevuta(idSpesa) {
  const r = await D.leggiRicevuta(idSpesa).catch(() => null);
  if (!r?.img) { avviso("Ricevuta non trovata"); return; }
  const d = document.createElement("dialog");
  d.className = "dlg-ricevuta";
  d.innerHTML = `<div class="testa-r"><strong>Ricevuta</strong><span class="tenue">${r.nome ? escapeHtml(r.nome) : ""}</span>
    <a class="btn piccolo" download="ricevuta_${idSpesa}.jpg" href="${r.img}">Scarica</a><button class="btn piccolo" data-chiudi>Chiudi</button></div>
    <img src="${r.img}" alt="Ricevuta della spesa">`;
  document.body.appendChild(d);
  d.querySelector("[data-chiudi]").addEventListener("click", () => d.close());
  d.addEventListener("close", () => d.remove());
  d.addEventListener("click", ev => { if (ev.target === d) d.close(); });
  d.showModal();
}
const escapeHtml = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
