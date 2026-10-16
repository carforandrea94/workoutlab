/**
 * I messaggi d'errore dell'accesso, in italiano e senza codici.
 *
 * Stavano dentro il componente come una catena di if: qui si possono provare,
 * e soprattutto si legge in un posto solo quali casi l'app sa spiegare e quali
 * finiscono nel messaggio generico.
 */

export function loginErrorMessage(e: any): string {
  if (e?.message === 'TIMEOUT') return 'La richiesta sta impiegando troppo tempo. Riprova.';
  switch (e?.code) {
    // Firebase non distingue piu' fra utente inesistente e password sbagliata,
    // e fa bene: dirlo direbbe a chiunque quali indirizzi sono registrati.
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email o password non corrette.';
    case 'auth/invalid-email':
      return 'Email non valida.';
    case 'auth/too-many-requests':
      return 'Troppi tentativi. Riprova tra qualche minuto.';
    case 'auth/network-request-failed':
      return 'Nessuna connessione. Controlla la rete e riprova.';
    case 'auth/user-disabled':
      return "Questo account è stato disattivato.";
    default:
      return e?.message || 'Errore durante l\'accesso. Riprova.';
  }
}

/**
 * I messaggi dell'accesso con Google.
 *
 * Torna null quando non c'e' niente da dire: chi chiude la finestra di Google
 * ha cambiato idea, non ha sbagliato, e un errore rosso sotto al tasto
 * sarebbe un rimprovero.
 */
export function googleErrorMessage(e: any): string | null {
  if (e?.message === 'TIMEOUT') return 'La richiesta sta impiegando troppo tempo. Riprova.';
  switch (e?.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/popup-blocked':
      return 'Il browser ha bloccato la finestra di Google. Consenti i popup per questo sito e riprova.';
    case 'auth/operation-not-allowed':
      return "L'accesso con Google non è attivo per questa app.";
    case 'auth/unauthorized-domain':
      return "Da questo indirizzo non si può accedere con Google.";
    case 'auth/account-exists-with-different-credential':
      return "Esiste già un account con questa email: accedi con la password.";
    case 'auth/network-request-failed':
      return 'Nessuna connessione. Controlla la rete e riprova.';
    case 'auth/too-many-requests':
      return 'Troppi tentativi. Riprova tra qualche minuto.';
    case 'auth/user-disabled':
      return "Questo account è stato disattivato.";
    default:
      return 'Accesso con Google non riuscito. Riprova.';
  }
}

export function resetErrorMessage(e: any): string {
  if (e?.message === 'TIMEOUT') return 'La richiesta sta impiegando troppo tempo. Riprova.';
  switch (e?.code) {
    case 'auth/invalid-email':
      return 'Email non valida.';
    case 'auth/too-many-requests':
      return 'Troppe richieste. Riprova tra qualche minuto.';
    case 'auth/network-request-failed':
      return 'Nessuna connessione. Controlla la rete e riprova.';
    default:
      return 'Non sono riuscito a inviare l\'email. Riprova.';
  }
}

/**
 * I messaggi di chi sta chiudendo il proprio account.
 *
 * La password sbagliata e' il caso normale, non un guasto: la si riscrive
 * apposta, ed e' li' che si sbaglia. Gli altri errori arrivano da noi (una
 * sessione scaduta, un'email mancante) e hanno gia' un testo loro.
 */
export function deleteAccountErrorMessage(e: any): string {
  switch (e?.code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Password non corretta.';
    case 'auth/too-many-requests':
      return 'Troppi tentativi. Riprova tra qualche minuto.';
    case 'auth/network-request-failed':
      return 'Nessuna connessione. Controlla la rete e riprova.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return "Conferma annullata: l'account non è stato chiuso.";
    case 'auth/popup-blocked':
      return 'Il browser ha bloccato la finestra di Google. Consenti i popup per questo sito e riprova.';
    case 'permission-denied':
      return 'Non è stato possibile cancellare i tuoi dati. Riprova fra poco.';
    default:
      return e?.message || 'Non sono riuscito a chiudere l\'account. Riprova.';
  }
}

/**
 * Cosa si dice a chi ha chiesto di reimpostare la password.
 *
 * Non si dice "ti ho mandato un'email": vorrebbe dire confermare che quel
 * l'indirizzo e' registrato, e basterebbe provarne uno per volta per sapere
 * chi c'e' dentro l'app. Firebase per lo stesso motivo non fallisce su un
 * indirizzo sconosciuto.
 */
export const RESET_SENT_MESSAGE =
  'Se esiste un account con questo indirizzo, ti arriva un\'email per reimpostare la password. Controlla anche lo spam.';
