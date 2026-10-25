/**
 * Il mio obiettivo: dove l'utente vuole arrivare.
 *
 * Fino a qui l'app registrava tutto senza sapere verso cosa: senza un
 * obiettivo non poteva dire se si sta andando nella direzione giusta. Qui e'
 * una scelta sola fra quattro, e per chi lavora sul peso un traguardo
 * facoltativo, con la data se la si vuole. Il traguardo si legge dove si
 * guarda il peso: nel grafico di Misure.
 */

export type TipoObiettivo = 'massa' | 'grasso' | 'forza' | 'corsa';

export interface Obiettivo {
  tipo: TipoObiettivo;
  /** Il peso da raggiungere, in kg. Solo per massa e grasso; null: nessun traguardo. */
  peso: number | null;
  /** Per quando, yyyy-mm-dd; null: senza data. */
  entro: string | null;
}

/** Nell'ordine in cui si scelgono. */
export const TIPI_OBIETTIVO: readonly TipoObiettivo[] = ['massa', 'grasso', 'forza', 'corsa'];

export const NOMI_OBIETTIVO: Record<TipoObiettivo, string> = {
  massa: 'Mettere massa',
  grasso: 'Perdere grasso',
  forza: 'Diventare più forte',
  corsa: 'Correre di più'
};

/** Sotto il nome, cosa vuol dire in pratica. */
export const SPIEGAZIONI_OBIETTIVO: Record<TipoObiettivo, string> = {
  massa: 'Più muscoli, col peso che sale piano',
  grasso: 'Meno grasso, tenendo la forza',
  forza: 'Carichi più alti sugli esercizi',
  corsa: 'Più minuti e più uscite ogni settimana'
};

/** I limiti di un peso da traguardo: fuori non e' un traguardo, e' un errore di battitura. */
export const PESO_MINIMO = 30;
export const PESO_MASSIMO = 300;

const DATA = /^\d{4}-\d{2}-\d{2}$/;
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

/** Il traguardo di peso ha senso solo per chi lavora sul peso. */
export function conTraguardoDiPeso(tipo: TipoObiettivo | null | undefined): boolean {
  return tipo === 'massa' || tipo === 'grasso';
}

/** Un peso scritto come si scrive qui ("78,5"), dentro i limiti; null altrimenti. */
export function pesoTraguardo(raw: string | number | null | undefined): number | null {
  const t = String(raw ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = Math.round(parseFloat(t) * 10) / 10;
  return n >= PESO_MINIMO && n <= PESO_MASSIMO ? n : null;
}

/**
 * L'obiettivo com'e' arrivato da Firestore, o null. Quello che non si legge
 * non diventa un obiettivo rotto: un tipo sconosciuto e' nessun obiettivo, un
 * traguardo sbagliato e' nessun traguardo.
 */
export function normalizzaObiettivo(raw: unknown): Obiettivo | null {
  const o = raw as Partial<Obiettivo> | null | undefined;
  if (!o || typeof o !== 'object' || !TIPI_OBIETTIVO.includes(o.tipo as TipoObiettivo)) return null;
  const tipo = o.tipo as TipoObiettivo;
  const peso = conTraguardoDiPeso(tipo) ? pesoTraguardo(o.peso) : null;
  const entro = peso !== null && typeof o.entro === 'string' && DATA.test(o.entro) ? o.entro : null;
  return { tipo, peso, entro };
}

/** "31 mar", o "31 mar 2027" se l'anno non e' quello di oggi. */
export function dataBreve(iso: string, oggi: string): string {
  const [a, m, g] = iso.split('-').map(Number);
  return `${g} ${MESI[m - 1]}` + (iso.slice(0, 4) !== oggi.slice(0, 4) ? ` ${a}` : '');
}

const kg = (n: number) => String(Math.round(n * 10) / 10).replace('.', ',');

/** La riga in Account sotto "Il mio obiettivo". */
export function rigaObiettivo(o: Obiettivo | null, oggi: string): string {
  if (!o) return 'Scegli dove vuoi arrivare';
  let riga = NOMI_OBIETTIVO[o.tipo];
  if (o.peso !== null) riga += ` · ${kg(o.peso)} kg` + (o.entro ? ` entro il ${dataBreve(o.entro, oggi)}` : '');
  return riga;
}

/**
 * Quanto manca al traguardo di peso dall'ultima pesata. Chi perde grasso
 * scende verso il traguardo, chi mette massa sale: oltre, e' raggiunto. null
 * senza traguardo.
 */
export function distanzaDalTraguardo(o: Obiettivo | null, attuale: number | null): { mancano: number; raggiunto: boolean } | null {
  if (!o || o.peso === null || attuale === null || !isFinite(attuale)) return null;
  const mancano = Math.round((o.tipo === 'grasso' ? attuale - o.peso : o.peso - attuale) * 10) / 10;
  return { mancano: Math.max(0, mancano), raggiunto: mancano <= 0 };
}

/** Sotto il grafico del peso: "Traguardo 78 kg entro il 31 mar · mancano 3,2 kg". */
export function testoTraguardo(o: Obiettivo | null, attuale: number | null, oggi: string): string | null {
  const d = distanzaDalTraguardo(o, attuale);
  if (!o || o.peso === null || !d) return null;
  const traguardo = `Traguardo ${kg(o.peso)} kg` + (o.entro ? ` entro il ${dataBreve(o.entro, oggi)}` : '');
  return d.raggiunto ? `${traguardo} · raggiunto` : `${traguardo} · mancano ${kg(d.mancano)} kg`;
}
