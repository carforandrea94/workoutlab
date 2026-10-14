/**
 * Configurazione del progetto Firebase NUOVO.
 *
 * I valori si copiano dalla console Firebase: Impostazioni progetto →
 * Le tue app → app web → "Configurazione SDK". Non sono segreti (finiscono
 * comunque nel bundle che il browser scarica): a proteggere i dati sono le
 * regole di Firestore, non questa chiave.
 */
export const environment = {
  production: false,
  firebase: {
    apiKey: 'AIzaSyAm-M7t6v1EZhjSKjFV6DaPnw-FMuIq0zA',
    authDomain: 'workout-lab-8c567.firebaseapp.com',
    projectId: 'workout-lab-8c567',
    storageBucket: 'workout-lab-8c567.firebasestorage.app',
    messagingSenderId: '798891367022',
    appId: '1:798891367022:web:437a7c195dcf79eb56247f',
    measurementId: 'G-ZQNTSS5SEM'
  }
};
