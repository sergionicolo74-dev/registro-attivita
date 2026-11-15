// Ambienti del gestionale.
// produzione = nuovo progetto con database a Zurigo (europe-west6)
// prova      = vecchio progetto attivita-88590, usato per i test
// demo       = nessun server: dati di esempio in memoria, per provare l'interfaccia
// Si sceglie con ?env=prova o ?env=demo nell'indirizzo; senza parametro si usa produzione.

export const AMBIENTI = {
  produzione: {
    nome: "Produzione (Zurigo)",
    firebase: {
      apiKey: "AIzaSyDWkojgIbmAu7ViA1-tia_gBRKEPhe2mSo",
      authDomain: "gestionale-studio-20bdf.firebaseapp.com",
      projectId: "gestionale-studio-20bdf",
      storageBucket: "gestionale-studio-20bdf.firebasestorage.app",
      messagingSenderId: "685312007602",
      appId: "1:685312007602:web:732c1a52ab6d1d664158ab"
    }
  },
  prova: {
    nome: "Prova",
    firebase: {
      apiKey: "AIzaSyA6oEjxQZibK1Pmvf4vqPJc08lG5vK0xeY",
      authDomain: "attivita-88590.firebaseapp.com",
      projectId: "attivita-88590",
      storageBucket: "attivita-88590.firebasestorage.app",
      messagingSenderId: "269166580058",
      appId: "1:269166580058:web:0a5ec5bc575e16bb6ae363"
    }
  },
  demo: { nome: "Demo (dati di esempio, nulla viene salvato)", firebase: null }
};

export function ambienteCorrente() {
  const p = new URLSearchParams(location.search).get("env");
  return AMBIENTI[p] ? p : "produzione";
}
