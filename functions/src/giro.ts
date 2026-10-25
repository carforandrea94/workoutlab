import { Fotografia, carico, decidi } from './messaggio';
import { fusoValido, prossimoInvio } from './orario';

/**
 * Un promemoria arrivato all'ora: si decide se mandarlo, lo si manda a ogni
 * telefono iscritto, si tolgono i telefoni che non lo ricevono piu' e si
 * calcola il prossimo. Senza Firebase ne' rete: chi chiama passa l'invio e
 * scrive il risultato (vedi index.ts).
 */

/** L'iscrizione di un telefono, come la da' il browser (PushSubscription.toJSON()). */
export interface Iscrizione {
  endpoint: string;
  expirationTime?: number | null;
  keys?: { p256dh: string; auth: string };
}

export interface DatiPromemoria extends Fotografia {
  attivo?: boolean;
  giorni?: unknown;
  ora?: unknown;
  fuso?: unknown;
  /** Quando doveva arrivare questo. */
  prossimo?: Date | null;
  /** Un telefono per chiave (la scrive l'app, vedi promemoria.service). */
  iscrizioni?: Record<string, Iscrizione> | null;
}

/** Come e' andato un invio: "scaduta" vuol dire che quel telefono non c'e' piu' (disiscritto, app tolta). */
export type EsitoInvio = 'ok' | 'scaduta' | 'errore';
export type Invia = (iscrizione: Iscrizione, carico: string) => Promise<EsitoInvio>;

export interface Risultato {
  /** null: niente piu' da mandare finche' l'app non riscrive l'orario. */
  prossimo: Date | null;
  esito: string;
  /** Le chiavi dei telefoni da togliere dal documento. */
  scadute: string[];
}

const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function gestisci(p: DatiPromemoria, adesso: Date, invia: Invia): Promise<Risultato> {
  const giorni = Array.isArray(p.giorni) ? p.giorni.filter((g): g is number => Number.isInteger(g) && g >= 1 && g <= 7) : [];
  if (typeof p.ora !== 'string' || !ORA.test(p.ora) || !fusoValido(p.fuso)) {
    return { prossimo: null, esito: 'dati non validi', scadute: [] };
  }
  const ora = p.ora;
  const fuso = p.fuso;
  const prossimo = prossimoInvio({ giorni, ora, fuso }, adesso)?.invio ?? null;
  const decisione = decidi(p, ora, fuso, p.prossimo ?? adesso, adesso);
  if (!decisione.invia) return { prossimo, esito: decisione.motivo, scadute: [] };

  const iscrizioni = Object.entries(p.iscrizioni ?? {}).filter(([, s]) => typeof s?.endpoint === 'string' && s.endpoint);
  if (!iscrizioni.length) return { prossimo, esito: 'nessun telefono', scadute: [] };
  const testo = carico(decisione.notifica);
  // Un telefono che non risponde non deve fermare gli altri.
  const esiti = await Promise.all(iscrizioni.map(([, s]) => invia(s, testo).catch((): EsitoInvio => 'errore')));
  const scadute = iscrizioni.filter((_, i) => esiti[i] === 'scaduta').map(([chiave]) => chiave);
  const mandati = esiti.filter(e => e === 'ok').length;
  return { prossimo, esito: `mandato a ${mandati} su ${iscrizioni.length}`, scadute };
}
