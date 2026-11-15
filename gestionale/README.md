# Gestionale studio

App web unica dello studio: anagrafica clienti, registro ore, scadenziario, compiti, presenze, vacanze e dashboard.
Il vecchio registro (`index.html` nella cartella principale) resta in uso finché il gestionale non lo sostituisce.

## Stato

- Accesso con email e password, ruoli `admin` / `utente`
- Clienti: elenco con ricerca e filtri, scheda a schede (Persone, Dati e mandato, Servizi e scadenze, Compiti, Ore e diario, Note)
- Dati KYC (clienti e persone) separati e visibili solo agli amministratori
- Importazione dell'anagrafica da Excel e del backup del vecchio registro
- Completezza: per ogni cliente l'elenco dei dati mancanti (filtro "Dati da completare")
- Mandati: fino a tre per cliente (Contabilità e Tax, Funzione societaria, Domiciliazione), ognuno con stato, date e budget; riepilogo con grafico budget/ore lavorate e griglia per cliente
- Compiti: elenco per urgenza o a colonne, assegnazione, stati con motivo d'attesa, aggiornamenti, scaduti / entro 5 giorni / fermi da 5 giorni
- Registro ore: lavoro svolto, nota/decisione, da fare; "attende riscontro" crea un compito; barra della giornata; settimana; dettatura
- Scadenziario: scadenze ricorrenti calcolate dai servizi di ogni cliente; elenco per urgenza con riepilogo cliccabile, griglia clienti × servizi per anno, proroghe, responsabile, aggiornamenti
- Presenze: registrazione semplificata art. 73b OLL 1 (entrata, uscita e pausa), festivi ticinesi, saldi mese/anno, vacanze, panoramica dello studio, esportazione CSV annuale; il Registro ore usa la presenza del giorno
- Vacanze: piano mensile visibile a tutti, richieste e approvazione, saldo giorni, avviso se una scadenza del responsabile cade durante l'assenza
- Dashboard: filtri per periodo (settimana, mese, trimestre, anno) e persona; ore sui mandati, presenza e copertura per collaboratore, andamento, ore per mandato e per cliente, semafori dello studio
- Utenti: creazione dei collaboratori con email per scegliere la password

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
  js/mandati.js         riepilogo Mandati
  js/registro.js        modulo Registro ore
  js/compiti.js         modulo Compiti
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
