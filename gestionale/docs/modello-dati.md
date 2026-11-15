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

## clienti

`codice` (C001…; C000 = clienti occasionali), `ragioneSociale`, `aliasNomi` (nomi precedenti, per abbinare dati vecchi), `forma`, `idi`,
`responsabile`, `sostituto`, `stato` (Attivo/Sospeso/Cessato), `inizioMandato`, `chiusuraEsercizio` (gg.mm), `indirizzo`, `npa`, `localita`, `cantone`,
`emailGenerale`, `lingua`, `cartella`, `note`,
`mandato` {`tipo`, `stato` (Firmato aggiornato / Da aggiornare / Mancante), `dataFirma`, `aggiornareEntro`},
`iva` {`regime`, `periodicita`}, `dipendenti`, `cassaAvs`, `lainf`, `lpp`,
`servizi` {`contabilita`, `iva`, `stipendi`, `ifTrimestrale`, `ifAnnuale`, `dichiarazione`, `avsLainfIpg`, `lpp`, `domiciliazione`, `revisione`} (vero/falso), `revisione`,
`funzione` {`tipo`, `persona`, `firma`, `inizio`}, `onorario` {`tipo`, `forfait`, `tariffa`, `budgetOre`, `fatturazione`}.

## persone

`clienteId`, `cognome`, `nome`, `ruolo`, `principale` (vero/falso), `firma`, `email`, `telefono`, `canale`, `lingua`, `note`.
Il numero del documento d'identità non si registra: resta nella copia in archivio.

## registrazioni

`clienteId`, `data`, `minuti`, `fatturabile`, `tipo` (`lavoro`/`nota`), `descrizione`, `autoreUid`, `autoreNome`, `migratoDa` (se importata).

## compiti

`clienteId` (o null), `titolo`, `tipo` (Promemoria/Delega/…), `stato`, `scadenza`, `completatoIl`, `visibilita` (`privato`/`studio`),
`autoreUid`, `assegnatoUid`, `assegnatoNome`.
