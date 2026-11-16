# Modello dati

Date in formato ISO `aaaa-mm-gg` (mostrate come `gg.mm.aaaa`). Ogni documento ha anche `aggiornato` (data e ora) e `aggiornatoDa` (UID).

| Raccolta | Chi legge | Chi scrive | Contenuto |
| --- | --- | --- | --- |
| `utenti/{uid}` | se stesso, admin | admin | `nome`, `ruolo` (`admin`/`utente`), `attivo` |
| `clienti/{id}` | tutti gli utenti attivi | admin | anagrafica, mandato, servizi, funzione, onorario |
| `clienti_kyc/{clienteId}` | admin | admin | `stato`, `rischio`, `ultimaVerifica`, `prossimaRevisione` |
| `persone/{id}` | tutti | tutti (eliminare: admin) | contatti e ruolo di una persona in un cliente |
| `persone_kyc/{personaId}` | admin | admin | `nazionalita`, `domicilio`, `tipoDocumento`, `scadenzaDocumento`, `copiaArchivio` |
| `registrazioni/{id}` | autore, admin | autore, admin | ore e note di lavoro |
| `compiti/{id}` | autore, assegnatario, admin | autore, assegnatario, admin | promemoria, deleghe, pratiche |
| `scadenze/{cliente_servizio_periodo}` | utenti attivi | utenti attivi (elimina: admin) | solo lo stato delle scadenze calcolate |
| `presenze/{uid_data}` | proprietario, admin | proprietario, admin | entrata, uscita, pausa e ore lavorate al giorno |
| `fatture/{cliente_mandato_periodo}` | admin, permesso fatturazione | admin, permesso fatturazione | forfait dei mandati segnati come fatturati |
| `pratiche/{id}` | utenti attivi | utenti attivi (elimina: admin) | pratiche amministrative fuori mandato |
| `vacanze/{id}` | utenti attivi | richiedente (solo se in attesa), admin | piano vacanze e assenze, approvazione |

## clienti

`codice` (C001…; C000 = clienti occasionali), `ragioneSociale`, `aliasNomi` (nomi precedenti, per abbinare dati vecchi), `forma`, `idi`,
`responsabile`, `sostituto`, `stato` (Attivo/Sospeso/Cessato), `inizioMandato`, `chiusuraEsercizio` (gg.mm), `indirizzo`, `npa`, `localita`, `cantone`,
`emailGenerale`, `lingua`, `cartella`, `note`,
`mandati` {
  `contabilita` {`attivo`, `stato`, `dataFirma`, `aggiornareEntro`, `budget` (CHF/anno), `budgetOre`, `tariffa`, `fatturazione`, `note`},
  `funzione` {`attivo`, `stato`, `dataFirma`, `aggiornareEntro`, `budget`, `note`, `funzioni`: [{`ruolo`, `persona`, `firma`, `inizio`}]},
  `domiciliazione` {`attivo`, `stato`, `dataFirma`, `aggiornareEntro`, `budget`, `note`, `tipo` (Domicilio con ufficio proprio / Recapito c/o), `dal`},
  `intestazione` {`attivo`, `stato`, `dataFirma`, `aggiornareEntro`, `budget`, `fatturazione`, `note`, `tipoTitoli` (Azioni / Quote sociali), `numero`, `valoreNominale`, `percentuale`, `intestatario`, `dal`, `contratto`, `iscrizione`} — il fiduciante è in `clienti_kyc.intestazione.fiduciante` (solo amministratori)
} — `stato`: Firmato aggiornato / Da aggiornare / Mancante. I campi vecchi `mandato`, `funzione`, `onorario` vengono letti e convertiti (regole.js, mandatiDi),
`iva` {`regime`, `periodicita` (Trimestrale/Semestrale/Mensile/Annuale)}, `contabilitaPeriodicita` (Mensile/Trimestrale), `giornoPaga` (1–31), `dipendenti`, `cassaAvs`, `lainf`, `lpp`,
`servizi` {`contabilita`, `iva`, `stipendi`, `ifTrimestrale`, `ifAnnuale`, `dichiarazione`, `avsLainfIpg`, `lpp`, `domiciliazione`, `revisione`} (vero/falso), `revisione`,


## clienti: persone fisiche

`forma` = "Persona fisica"; `df` {`nascita`, `statoCivile`, `attivita`, `tassazione`, `comune`, `coniuge` {`nome`, `nascita`, `attivita`}, `figli` [{`nome`, `nascita`, `situazione`}], `documenti` {chiave: vero} (vedi DOCUMENTI_DF), `note`}.
Dichiarazione: 30.04 dell'anno dopo, proroghe rapide al 30.09 e al 31.12; nello stato della scadenza `documenti` {chiave: vero} = ricevuti.

## persone

`clienteId`, `cognome`, `nome`, `ruolo`, `principale` (vero/falso), `firma`, `email`, `telefono`, `canale`, `lingua`, `note`.
Il numero del documento d'identità non si registra: resta nella copia in archivio.

## registrazioni

`clienteId`, `data`, `minuti`, `fatturabile`, `extra` (vero = da fatturare a parte), `fatturataIl`, `voceFattura` (testo breve per la fattura), `praticaId`, `tipo` (`lavoro`/`nota`), `mandato` (`contabilita`/`funzione`/`domiciliazione`), `descrizione`, `autoreUid`, `autoreNome`, `migratoDa` (se importata).

## compiti

`clienteId` (o null), `titolo`, `tipo` (Promemoria/Delega/…), `stato`, `scadenza`, `completatoIl`, `visibilita` (`privato`/`studio`),
`autoreUid`, `assegnatoUid`, `assegnatoNome`.

## scadenze

Le scadenze **non si inseriscono**: si calcolano dai servizi del cliente (regole.js, `scadenzeCliente`). Si salva solo lo stato:
`clienteId`, `servizio`, `periodo` (es. 2026-T3, 2026-10, 2025), `anno` (anno della data prevista), `scadenzaPrevista`,
`stato` (Da fare/In corso/In attesa cliente/Prorogato/Fatto/Non dovuto), `nuovaData` (se prorogata), `responsabileUid`, `responsabileNome`,
`fattoIl`, `fattoDa`, `cronologia` [{`quando`, `nome`, `testo`}].
Regole: contabilità il 20 del mese dopo; IVA 60 giorni dopo il periodo; riconciliazione IVA 240 giorni dopo la chiusura (art. 72 LIVA);
stipendi al giorno di paga; IF trimestrale 10.04/10.07/10.10, conguaglio 31.01; AVS/LAINF/IPG 30.01; LPP 31.12 per l'anno dopo;
dichiarazione 30.06 dell'anno dopo; assemblea e revisione 6 mesi dopo la chiusura (revisione con allerta dopo 3 mesi); KYC alla data in scheda.
Preavvisi: −5 e −2 giorni, −30 per le annuali. Prima di `INIZIO_SCADENZIARIO` nessun arretrato.

## presenze

`uid`, `nome`, `data`, `entrata`, `uscita` (minuti dalla mezzanotte), `pausa` (minuti), `minuti` (lavorati: uscita − entrata − pausa), `assenza` (Vacanza / Vacanza mezza giornata / Assenza / Assenza mezza giornata / Recupero ore).
Il motivo delle assenze non si registra.
Nel profilo `utenti/{uid}`: `oreSettimanali`, `percentuale`, `giorniVacanza`, `accordo73b` (data dell'accordo scritto), `inizioPresenze`, `saldoRiportatoMinuti`.
Ore dovute: lunedì–venerdì, esclusi i 15 festivi ufficiali del Ticino. Conservazione: 5 anni (art. 73 cpv. 2 OLL 1), con l'esportazione CSV annuale.

## vacanze

`uid`, `nome`, `dal`, `al`, `tipo` (Vacanza / Recupero ore / Assenza), `mezza` (vero/falso), `stato` (Richiesta / Approvata / Rifiutata), `decisoDa`, `decisoIl`.
Nessun motivo. I giorni si contano lavorativi (festivi ticinesi esclusi). Le approvate entrano nelle Presenze nei giorni senza registrazione.

## Dashboard

Nessun dato proprio: legge registrazioni, presenze, vacanze, clienti, compiti e scadenze. Copertura = ore sui mandati / ore di presenza fino a ieri
(≥ 95% completo, ≥ 80% quasi, sotto mancano ore). Valore alle tariffe del mandato contabilità o CHF 150/h.

## pratiche

`clienteId`, `titolo`, `tipo` (Assegni familiari, Rateizzazione imposte, …), `ente`, `fase` (In preparazione / In attesa dell'ente / Documenti richiesti / Conclusa / Annullata),
`apertaIl`, `inviataIl`, `conclusaIl`, `prossimoControllo`, `concludereEntro`, `attesa` (giorni), `solleciti`, `ultimoSollecito`, `responsabileUid`, `responsabileNome`,
`passi` [{`quando`, `nome`, `fase`, `testo`}], `fatturazione` {`modo` (Forfait / A ore / Non fatturare), `importo`, `tariffa`, `stato` (Da fatturare / Fatturata), `fatturataIl`, `importoFatturato`}.
Le ore si registrano nel Registro con `praticaId` (e `mandato` = "pratica"): non entrano nei budget dei mandati.

## Report e fatturazione

Permesso: `utenti/{uid}.fatturazione` = vero (oppure ruolo admin) → vede le ore di tutti nei Report e può segnare le fatture.
Mandato a forfait = `budget` annuo > 0; si fattura per periodi (`fatturazione`: Mensile/Trimestrale/Semestrale/Annuale; contabilità trimestrale se vuoto, gli altri annuale):
importo = budget ÷ numero di periodi. Redditività: ore nel mandato (anche non fatturabili, escluse extra e pratiche) × tariffa rispetto al forfait
(redditizio se entro il forfait, al limite fino al 15% oltre, in perdita oltre). Ore preventivate: budget ore (contabilità) oppure forfait ÷ tariffa.
Da fatturare a parte: ore extra, ore su mandati senza forfait e su clienti occasionali, più le pratiche concluse.
`fatture` {`clienteId`, `mandato`, `periodo`, `importo`, `minuti`, `valoreOre`, `stato`, `fatturataIl`, `fatturataDa`}.

## spese/{id}
Spesa registrata dal Registro ore (scheda "Spesa").
`clienteId`, `data`, `categoria` (pasto, posta, trasferta, viaggio, emolumenti, altro), `importo` (CHF), `km` (solo trasferte, CHF 0.75/km),
`riaddebito` (true = da riaddebitare al cliente), `descrizione`, `anticipataDa`/`anticipataNome` (pagata di tasca propria dal collaboratore),
`rimborsataIl`, `fatturataIl`/`fatturaRif` (chiusa dopo la fattura), `haRicevuta`, `autoreUid`, `autoreNome`.
Le tasse e gli emolumenti anticipati per il cliente sono fuori IVA (art. 24 cpv. 6 lett. b LIVA).

## ricevute/{id spesa}
`img` (immagine JPEG compressa in data URL, max ~700 KB), `nome`. Si legge solo quando si apre la ricevuta.
