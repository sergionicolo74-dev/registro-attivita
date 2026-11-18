# Gestionale studio – sviluppi futuri

Modifiche annotate, da fare quando servono (es. versione per studi più grandi o per terzi).

## Liquidità con Quick Fin (in attesa del file di esempio)
Fatture segnate nel gestionale quando emesse (numero e importo). Ogni settimana si carica l'export di Quick Fin con fatture aperte e pagamenti: abbinamento per numero fattura, data di incasso, elenco aperte/scadute e incassi attesi. In seguito, se utile, il file camt della banca per gli incassi del giorno (abbinamento automatico se le fatture QR hanno il riferimento strutturato; dal camt si leggono solo data, importo, riferimento e pagatore).

## Manuale di utilizzo online
Guida consultabile dal gestionale (voce "Guida" nel menu), divisa per pagina e per ruolo (utente / chi fattura / amministratore), con passaggi semplici e immagini. Da fare quando le funzioni principali sono stabili.

## Versione con più tipologie di utenti
- **Onorari e tariffe in un archivio separato.** Oggi onorari annui dei mandati e tariffe concordate stanno nella scheda del cliente (`clienti`), leggibile da tutti gli utenti attivi: le pagine li mostrano solo ad amministratori e a chi fattura, ma chi ha competenze tecniche potrebbe leggerli dal database. Da spostare in una collezione tipo `clienti_economici/{id}` leggibile solo con `fatt()`, come già fatto per i dati KYC. Deciso il 17.11.2026: per lo studio attuale (4 persone) va bene così.
- Ruoli intermedi (es. responsabile di team che vede le ore del proprio gruppo, sola lettura per praticanti).

## Altre proposte in sospeso
- Pulsante "Scarica copia di sicurezza" (il piano gratuito di Firebase non fa backup automatici).
- Chiusura completa delle ore alla fattura con numero fattura e archivio delle fatture.
- Sintesi delle attività dettate con Claude (richiede il piano Blaze e una Cloud Function).
- Dashboard: linee di andamento e confronto con il periodo precedente.
- Numerino nel menu accanto a "Compiti" con nuovi assegnati e richieste di aiuto.
- Modello di accordo art. 73b OLL 1.
- Analisi per la commercializzazione a terzi (un progetto Firebase per studio, configurazione per cantone, nLPD).
