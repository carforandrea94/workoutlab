/**
 * Sesso biologico. Due soli valori perche' e' l'ingresso delle formule di
 * composizione corporea (Jackson-Pollock sulle pliche, Deurenberg), che hanno
 * un coefficiente per l'uno e uno per l'altro e non sanno farne altri. Non
 * entra invece nel BMI, che e' peso diviso altezza al quadrato per chiunque.
 */
export type Sex = 'm' | 'f';

export interface UserProfile {
  uid: string;
  email: string;
  /** Il nome intero, sempre valorizzato: e' quello che l'app mostra ovunque.
   *  Quando ci sono, e' la somma di firstName e lastName. */
  displayName: string;
  /** Nome e cognome separati. Assenti sui profili nati prima che i due campi
   *  esistessero: chi li legge passa da dividiNome(), che in quel caso li
   *  ricava dal nome intero. */
  firstName?: string;
  lastName?: string;
  /**
   * Altezza in centimetri. Sta sul profilo e non fra le misurazioni perche' si
   * misura una volta e resta: in `MeasurementEntry` l'app la richiederebbe a
   * ogni rilevazione, accanto a peso e pliche, che invece cambiano ogni volta.
   *
   * Assente sui profili creati prima che il campo esistesse, e null quando
   * l'utente non l'ha ancora messa: chi la legge deve reggere entrambi.
   */
  heightCm?: number | null;
  /** Assente sui profili creati prima del campo, null se non l'ha scelto. */
  sex?: Sex | null;
  /** Data di nascita ISO yyyy-mm-dd. Serve all'eta', che e' un ingresso delle
   *  formule di composizione corporea. Assente sui profili creati prima. */
  birthDate?: string | null;
  createdAt: string;
  /**
   * Quando l'utente ha accettato l'informativa, e quale versione. Assenti sui
   * profili creati prima che l'informativa esistesse: chi li legge deve
   * reggere l'assenza.
   */
  privacyAcceptedAt?: string;
  privacyVersion?: string;
}
