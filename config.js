// config.js – die EINZIGE Datei, die du anpassen musst.
// Trage hier die Web-Konfiguration deines Firebase-Projekts ein
// (Firebase-Konsole › Projekteinstellungen › Allgemein › Meine Apps › SDK-Konfiguration).
// Solange apiKey mit "HIER" beginnt, läuft alles im DEMO-MODUS (nur lokal im Browser).

export const FIREBASE_CONFIG = {
  apiKey: "HIER_EINTRAGEN",
  authDomain: "lern-deutsch-arash.firebaseapp.com",
  projectId: "lern-deutsch-arash",
  storageBucket: "lern-deutsch-arash.appspot.com",
  messagingSenderId: "",
  appId: ""
};

// Nur dieses Google-Konto darf die Konsole benutzen (muss mit firestore.rules übereinstimmen)
export const ADMIN_EMAIL = "arash.guitoo@gmail.com";
