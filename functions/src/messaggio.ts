import { giornoNelFuso, lunediNelFuso } from './orario';

/**
 * Cosa dice il promemoria, e quando tacere.
 *
 * L'app scrive accanto all'orario quello che sa della settimana: i giorni del
 * programma, quelli gia' fatti e l'ultima seduta. Il server non legge il
 * protocollo ne' le sedute: usa questa fotografia, e la ricontrolla contro la
 * data di oggi perche' puo' essere vecchia di giorni.
 */

export interface Fotografia {
  /** I giorni del programma, nell'ordine della scheda. */
  programma?: { id: string; label: string }[] | null;
  /** I giorni fatti nella settimana che comincia quel lunedi'. */
  fatti?: { settimana: string; ids: string[] } | null;
  /** La data dell'ultima seduta salvata, "yyyy-mm-dd". */
  ultimaSeduta?: string | null;
}

export interface Notifica {
  titolo: string;
  testo: string;
  /** Dove porta il tocco: la seduta che tocca, o la scheda. */
  url: string;
}

export type Decisione = { invia: true; notifica: Notifica } | { invia: false; motivo: string };

/** Oltre questo ritardo un promemoria non si manda piu': "tra mezz'ora" sarebbe falso. */
export const RITARDO_MASSIMO_MINUTI = 20;

export function decidi(f: Fotografia, ora: string, fuso: string, previsto: Date, adesso: Date): Decisione {
  if (adesso.getTime() - previsto.getTime() > RITARDO_MASSIMO_MINUTI * 60_000) {
    return { invia: false, motivo: 'in ritardo' };
  }
  // Chi si e' gia' allenato oggi non ha bisogno di sentirselo dire.
  if (f.ultimaSeduta && f.ultimaSeduta === giornoNelFuso(adesso, fuso)) {
    return { invia: false, motivo: 'gia\' fatta oggi' };
  }
  const programma = Array.isArray(f.programma) ? f.programma.filter(d => d && d.id) : [];
  // I giorni fatti valgono solo nella loro settimana: col lunedi' si riparte da capo.
  const fatti = new Set(f.fatti && f.fatti.settimana === lunediNelFuso(adesso, fuso) ? f.fatti.ids : []);
  const indice = programma.findIndex(d => !fatti.has(d.id));
  if (programma.length && indice < 0) return { invia: false, motivo: 'settimana completa' };

  const testo = 'Tra mezz\'ora si comincia: tocca per aprire la scheda.';
  if (indice < 0) return { invia: true, notifica: { titolo: `Oggi alle ${ora} ti alleni`, testo, url: '/scheda' } };
  const label = (programma[indice].label ?? '').trim() || `Giorno ${indice + 1}`;
  return { invia: true, notifica: { titolo: `Oggi alle ${ora}: ${label}`, testo, url: `/scheda/day/${indice}` } };
}

/**
 * Il messaggio come lo legge il service worker di Angular (ngsw): mostra
 * `notification` e, al tocco, apre `url` nella finestra dell'app se c'e', se
 * no in una nuova.
 */
export function carico(n: Notifica): string {
  return JSON.stringify({
    notification: {
      title: n.titolo,
      body: n.testo,
      icon: 'icons/icon-192x192.png',
      // Un promemoria nuovo sostituisce quello vecchio ancora a schermo.
      tag: 'promemoria',
      renotify: true,
      data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url: n.url } } }
    }
  });
}
