/**
 * Configurazione del progetto Firebase NUOVO.
 *
 * I valori si copiano dalla console Firebase: Impostazioni progetto →
 * Le tue app → app web → "Configurazione SDK". Non sono segreti (finiscono
 * comunque nel bundle che il browser scarica): a proteggere i dati sono le
 * regole di Firestore, non questa chiave.
 */
export const environment = {
  production: true,
  firebase: {
    apiKey: 'AIzaSyAm-M7t6v1EZhjSKjFV6DaPnw-FMuIq0zA',
    // L'app va aperta (e installata sulla Home) da QUESTO stesso dominio. Da
    // workout-lab-8c567.web.app l'accesso con Google attraversa due origini
    // diverse, e Safari su iOS fa restare appesa la finestra di Google. Per
    // usare web.app serve un authDomain uguale E l'URI di reindirizzamento
    // https://<dominio>/__/auth/handler fra quelli autorizzati del client
    // OAuth (Google Cloud › API e servizi › Credenziali).
    authDomain: 'workout-lab-8c567.firebaseapp.com',
    projectId: 'workout-lab-8c567',
    storageBucket: 'workout-lab-8c567.firebasestorage.app',
    messagingSenderId: '798891367022',
    appId: '1:798891367022:web:437a7c195dcf79eb56247f',
    measurementId: 'G-ZQNTSS5SEM'
  },
  /**
   * La chiave pubblica VAPID dei promemoria (vedi docs/promemoria.md). Non e'
   * un segreto: la privata sta fra i segreti di Firebase e la usa solo la
   * funzione che manda le notifiche. Vuota, l'app dice che i promemoria non
   * sono ancora disponibili.
   */
  vapidPublicKey: ''
};
