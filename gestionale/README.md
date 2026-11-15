# Gestionale studio

App web unica dello studio: anagrafica clienti, registro ore, scadenziario, compiti, presenze, vacanze e dashboard.
Il vecchio registro (`index.html` nella cartella principale) resta in uso finché il gestionale non lo sostituisce.

## Stato (fase 1)

- Accesso con email e password, ruoli `admin` / `utente`
- Clienti: elenco con ricerca e filtri, scheda a schede (Persone, Dati e mandato, Servizi e scadenze, Compiti, Ore e diario, Note)
- Dati KYC (clienti e persone) separati e visibili solo agli amministratori
- Importazione dell'anagrafica da Excel e del backup del vecchio registro
- Completezza: per ogni cliente l'elenco dei dati mancanti (filtro "Dati da completare")
- Registro ore: lavoro svolto, nota/decisione, da fare; "attende riscontro" crea un compito; barra della giornata; settimana; dettatura
- Moduli Scadenziario, Compiti, Presenze, Vacanze, Dashboard: fasi successive

## Ambienti

| Indirizzo | Ambiente | Database |
| --- | --- | --- |
| `gestionale/` | Produzione | `gestionale-studio-20bdf`, Zurigo (`europe-west6`) |
| `gestionale/?env=prova` | Prova | `attivita-88590` (vecchio progetto) |
| `gestionale/?env=demo` | Demo | Nessuno: dati inventati in memoria |

## Struttura

```
gestionale/
  index.html            pagina unica
  css/style.css         grafica
  js/config.js          ambienti e configurazione Firebase
  js/data.js            UNICO file che parla con il database (da sostituire per cambiare sistema)
  js/regole.js          regole e formati (date gg.mm.aaaa, numeri 100'000.00, scadenze)
  js/mappa-import.js    trasformazione di Excel e backup nei dati del gestionale
  js/app.js, ui.js      avvio, menu, aiuti di interfaccia
  js/clienti.js         modulo Clienti
  js/importa.js         modulo Importa dati
  lib/                  SheetJS per leggere Excel (licenza Apache 2.0)
  firestore.rules       regole di accesso
  docs/modello-dati.md  descrizione di tutte le raccolte e dei campi
  test/                 test delle regole: node gestionale/test/regole.test.mjs
```

Nessun passo di compilazione: sono file statici serviti da GitHub Pages.

## Messa in funzione di un ambiente

1. Firebase console → Firestore → **Regole**: incollare `firestore.rules` e pubblicare.
2. Authentication → **Utenti** → Aggiungi utente (email e password) per ogni persona.
3. Firestore → **Dati** → raccolta `utenti`, documento con ID = UID dell'utente (colonna "UID utente" in Authentication),
   campi `nome` (stringa), `ruolo` = `admin` oppure `utente`, `attivo` = `true`.
4. Accedere come amministratore → Importa dati: prima l'Excel dell'anagrafica, poi il backup del registro.
