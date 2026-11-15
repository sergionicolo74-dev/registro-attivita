import { AMBIENTI, ambienteCorrente } from "./config.js";
import * as D from "./data.js";
import { e, avviso } from "./ui.js";
import { vistaClienti, vistaScheda } from "./clienti.js";
import { vistaImporta } from "./importa.js";

const env = ambienteCorrente();

// Moduli del menu. pronto=false: compare con "in arrivo" (fasi successive del piano).
const MODULI = [
  { id: "cruscotto", nome: "Cruscotto", pronto: false },
  { id: "clienti", nome: "Clienti", pronto: true },
  { id: "registro", nome: "Registro ore", pronto: false },
  { id: "scadenziario", nome: "Scadenziario", pronto: false },
  { id: "compiti", nome: "Compiti", pronto: false },
  { id: "presenze", nome: "Presenze", pronto: false },
  { id: "vacanze", nome: "Vacanze", pronto: false },
  { id: "importa", nome: "Importa dati", pronto: true, admin: true }
];

async function avvio() {
  if (env !== "produzione") {
    const b = document.getElementById("banner-env");
    b.textContent = "Ambiente: " + AMBIENTI[env].nome; b.hidden = false;
  }
  document.getElementById("login-env").textContent = env === "produzione" ? "Accedi con il tuo account dello studio" : AMBIENTI[env].nome;
  await D.init(env);
  D.onAuth(mostra);
  if (env === "demo") mostra(null);

  document.getElementById("login-form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = document.getElementById("login-errore"); err.textContent = "";
    try { await D.login(document.getElementById("email").value.trim(), document.getElementById("password").value); }
    catch (x) { err.textContent = "Accesso non riuscito: controlla email e password."; }
  });
  document.getElementById("pw-dimenticata").addEventListener("click", async () => {
    const em = document.getElementById("email").value.trim();
    if (!em) { document.getElementById("login-errore").textContent = "Scrivi prima la tua email."; return; }
    try { await D.recuperaPassword(em); avviso("Ti abbiamo inviato un'email per reimpostare la password."); }
    catch { document.getElementById("login-errore").textContent = "Invio non riuscito."; }
  });
  document.getElementById("esci").addEventListener("click", () => D.logout());
  window.addEventListener("hashchange", instrada);
}

function mostra(u) {
  const login = document.getElementById("login"), app = document.getElementById("app");
  if (!u) { app.hidden = true; login.hidden = false; return; }
  login.hidden = true; app.hidden = false;
  document.getElementById("utente-nome").textContent = u.nome;
  document.getElementById("utente-ruolo").textContent = u.ruolo === "admin" ? "Amministratore" : u.ruolo === "utente" ? "Utente" : "Account non abilitato";
  if (!u.ruolo || !u.attivo) {
    document.getElementById("nav").innerHTML = "";
    document.getElementById("vista").innerHTML = `<div class="pannello"><h2>Account non ancora abilitato</h2><p class="tenue">L'accesso è riuscito, ma un amministratore deve ancora assegnarti un ruolo. Il tuo codice utente è <code>${e(u.uid)}</code>.</p></div>`;
    return;
  }
  instrada();
}

function disegnaMenu(attivo) {
  const admin = D.isAdmin();
  document.getElementById("nav").innerHTML = MODULI.filter(m => !m.admin || admin).map(m =>
    `<a href="#/${m.id}" class="${m.id === attivo ? "attivo" : ""}"${m.id === attivo ? ' aria-current="page"' : ""}>${e(m.nome)}${m.pronto ? "" : '<span class="presto">in arrivo</span>'}</a>`).join("");
}

async function instrada() {
  if (!D.utenteCorrente()?.ruolo) return;
  const [, mod = "clienti", id] = location.hash.replace(/^#/, "").split("/");
  disegnaMenu(mod);
  const vista = document.getElementById("vista");
  const m = MODULI.find(x => x.id === mod);
  try {
    if (mod === "clienti" && id) await vistaScheda(vista, decodeURIComponent(id));
    else if (mod === "clienti") await vistaClienti(vista);
    else if (mod === "importa" && D.isAdmin()) await vistaImporta(vista);
    else vista.innerHTML = `<div class="testata"><h1>${e(m?.nome || "Pagina")}</h1></div><div class="pannello vuoto">Questo modulo arriva nelle prossime fasi del piano.</div>`;
  } catch (x) {
    console.error(x);
    vista.innerHTML = `<div class="pannello"><h2>Errore</h2><p class="tenue">${e(x.message || x)}</p></div>`;
  }
  vista.focus();
}

avvio();
