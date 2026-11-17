# Gestionale studio – sviluppi futuri

Modifiche annotate, da fare quando servono (es. versione per studi più grandi o per terzi).

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
