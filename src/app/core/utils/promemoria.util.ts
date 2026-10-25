/**
 * Pianifica e ricorda: in che giorni e a che ora ci si allena, e il
 * promemoria che arriva mezz'ora prima.
 *
 * Fra una seduta e l'altra l'app taceva. Nel megastudio con 24 Hour Fitness il
 * programma piu' semplice che funzionava era proprio questo: le sedute
 * pianificate e un messaggio mezz'ora prima. Qui si sceglie un'ora sola per
 * tutti i giorni scelti; la notifica la manda il server (vedi functions/),
 * perche' a telefono chiuso l'app non gira.
 *
 * I giorni sono numeri da 1 (lunedi') a 7 (domenica), come li conta chi li
 * legge e non come li conta Date (0 = domenica).
 */

export interface Promemoria {
  attivo: boolean;
  /** 1 = lunedi' ... 7 = domenica, in ordine, senza doppioni. */
  giorni: number[];
  /** L'ora dell'allenamento, "HH:MM". Il promemoria arriva ANTICIPO_MINUTI prima. */
  ora: string;
}

/** Quanto prima dell'allenamento arriva il promemoria. */
export const ANTICIPO_MINUTI = 30;
/** Per chi li apre la prima volta: tre giorni, a giorni alterni, dopo il lavoro. */
export const GIORNI_PREDEFINITI: readonly number[] = [1, 3, 5];
export const ORA_PREDEFINITA = '18:00';

export const NOMI_GIORNI = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
export const NOMI_GIORNI_LUNGHI = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];

const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Il promemoria com'e' arrivato da Firestore: quello che non si legge diventa il valore di partenza. */
export function normalizzaPromemoria(raw: unknown): Promemoria {
  const p = (raw ?? {}) as Partial<Promemoria>;
  const giorni = Array.isArray(p.giorni)
    ? [...new Set(p.giorni.filter(g => Number.isInteger(g) && g >= 1 && g <= 7))].sort((a, b) => a - b)
    : [...GIORNI_PREDEFINITI];
  return {
    attivo: p.attivo === true,
    giorni,
    ora: typeof p.ora === 'string' && ORA.test(p.ora) ? p.ora : ORA_PREDEFINITA
  };
}

/** Il giorno della settimana di una data, da 1 (lunedi') a 7 (domenica). */
export function giornoDellaSettimana(d: Date): number {
  return ((d.getDay() + 6) % 7) + 1;
}

/**
 * Il prossimo promemoria dopo `adesso`, in ora locale: l'istante in cui arriva
 * e l'allenamento a cui si riferisce. Mezz'ora prima di un allenamento alle
 * 00:15 e' il giorno prima, alle 23:45. null senza giorni.
 */
export function prossimoPromemoria(p: Promemoria, adesso: Date): { invio: Date; allenamento: Date } | null {
  if (!p.giorni.length || !ORA.test(p.ora)) return null;
  const [h, m] = p.ora.split(':').map(Number);
  // Otto giorni: anche col promemoria di oggi gia' passato, lo stesso giorno della settimana prossima c'e'.
  for (let d = 0; d <= 8; d++) {
    const allenamento = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() + d, h, m, 0, 0);
    if (!p.giorni.includes(giornoDellaSettimana(allenamento))) continue;
    const invio = new Date(allenamento.getTime() - ANTICIPO_MINUTI * 60_000);
    if (invio > adesso) return { invio, allenamento };
  }
  return null;
}

/** "lun, mer, ven", "tutti i giorni". */
export function elencoGiorni(giorni: readonly number[]): string {
  if (giorni.length === 7) return 'tutti i giorni';
  return giorni.map(g => NOMI_GIORNI[g - 1]).join(', ');
}

/** La riga in Account sotto "Promemoria". */
export function rigaPromemoria(p: Promemoria | null): string {
  if (!p || !p.attivo) return 'Spenti';
  if (!p.giorni.length) return 'Nessun giorno scelto';
  const giorni = elencoGiorni(p.giorni);
  return `${giorni[0].toUpperCase()}${giorni.slice(1)} alle ${p.ora}`;
}

/** "oggi alle 17:30", "domani alle 17:30", "mercoledì alle 17:30". */
export function quandoArriva(invio: Date, adesso: Date): string {
  const giorno = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const distanza = Math.round((giorno(invio) - giorno(adesso)) / 86_400_000);
  const ora = `${String(invio.getHours()).padStart(2, '0')}:${String(invio.getMinutes()).padStart(2, '0')}`;
  const quale = distanza === 0 ? 'oggi' : distanza === 1 ? 'domani' : NOMI_GIORNI_LUNGHI[giornoDellaSettimana(invio) - 1];
  return `${quale} alle ${ora}`;
}

/**
 * Quale seduta tocca: la prima del programma non ancora fatta questa
 * settimana, come la scheda. null se sono tutte fatte, o se il programma non
 * ha giorni.
 */
export function prossimaSeduta(
  programma: readonly { id: string; label: string }[], fatti: ReadonlySet<string>
): { indice: number; label: string } | null {
  const i = programma.findIndex(d => !fatti.has(d.id));
  return i >= 0 ? { indice: i, label: programma[i].label } : null;
}
