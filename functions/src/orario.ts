/**
 * Gli orari dei promemoria, nel fuso di chi li ha scelti.
 *
 * La funzione gira su un server in UTC, ma "alle 18" e' l'ora del telefono
 * dell'utente: a Roma d'estate sono le 16 UTC, d'inverno le 17. Qui l'ora
 * locale diventa un istante con Intl, che conosce l'ora legale di ogni fuso:
 * niente librerie, niente tabelle da tenere aggiornate.
 *
 * I giorni vanno da 1 (lunedi') a 7 (domenica), come nell'app.
 */

export interface Orario {
  /** 1 = lunedi' ... 7 = domenica. */
  giorni: number[];
  /** L'ora dell'allenamento, "HH:MM". */
  ora: string;
  /** Il fuso del telefono, es. "Europe/Rome". */
  fuso: string;
}

/** Quanto prima dell'allenamento arriva il promemoria (lo stesso numero dell'app). */
export const ANTICIPO_MINUTI = 30;

const ORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const GIORNO = 86_400_000;

interface Parti { anno: number; mese: number; giorno: number; ore: number; minuti: number }

/** Data e ora che segna l'orologio nel fuso, in quell'istante. */
function parti(istante: number, fuso: string): Parti {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
  const v: Record<string, number> = {};
  for (const p of f.formatToParts(new Date(istante))) if (p.type !== 'literal') v[p.type] = Number(p.value);
  return { anno: v['year'], mese: v['month'], giorno: v['day'], ore: v['hour'], minuti: v['minute'] };
}

/** Di quanto l'orologio del fuso e' avanti su UTC, in quell'istante (in millisecondi, al minuto). */
function scarto(istante: number, fuso: string): number {
  const p = parti(istante, fuso);
  const comeUtc = Date.UTC(p.anno, p.mese - 1, p.giorno, p.ore, p.minuti);
  return comeUtc - Math.floor(istante / 60_000) * 60_000;
}

/**
 * L'istante in cui l'orologio del fuso segna quella data e quell'ora. Nel
 * giorno del cambio d'ora lo scarto si ricalcola sull'istante trovato: e' lui
 * che dice da che parte del cambio si sta.
 */
export function istanteLocale(anno: number, mese: number, giorno: number, ore: number, minuti: number, fuso: string): Date {
  const comeUtc = Date.UTC(anno, mese - 1, giorno, ore, minuti);
  const primo = comeUtc - scarto(comeUtc, fuso);
  const secondo = comeUtc - scarto(primo, fuso);
  return new Date(secondo);
}

/** "2026-10-26": il giorno che segna il calendario del fuso, in quell'istante. */
export function giornoNelFuso(istante: Date, fuso: string): string {
  const p = parti(istante.getTime(), fuso);
  return `${p.anno}-${String(p.mese).padStart(2, '0')}-${String(p.giorno).padStart(2, '0')}`;
}

/** Il lunedi' della settimana di quel giorno ("yyyy-mm-dd"), nel fuso. */
export function lunediNelFuso(istante: Date, fuso: string): string {
  const [a, m, g] = giornoNelFuso(istante, fuso).split('-').map(Number);
  const t = Date.UTC(a, m - 1, g);
  const giornoSettimana = ((new Date(t).getUTCDay() + 6) % 7) + 1;
  return new Date(t - (giornoSettimana - 1) * GIORNO).toISOString().slice(0, 10);
}

/** Un fuso che Intl conosce. Uno sconosciuto non deve far saltare tutti gli altri. */
export function fusoValido(fuso: unknown): fuso is string {
  if (typeof fuso !== 'string' || !fuso) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

/**
 * Il prossimo promemoria dopo `dopo`: l'istante dell'invio e quello
 * dell'allenamento. null senza giorni, con un'ora che non si legge o con un
 * fuso sconosciuto.
 */
export function prossimoInvio(o: Orario, dopo: Date): { invio: Date; allenamento: Date } | null {
  if (!o.giorni.length || !ORA.test(o.ora) || !fusoValido(o.fuso)) return null;
  const [ore, minuti] = o.ora.split(':').map(Number);
  const [a, m, g] = giornoNelFuso(dopo, o.fuso).split('-').map(Number);
  // Otto giorni: anche col promemoria di oggi passato, lo stesso giorno della settimana prossima c'e'.
  for (let d = 0; d <= 8; d++) {
    const data = new Date(Date.UTC(a, m - 1, g) + d * GIORNO);
    const giornoSettimana = ((data.getUTCDay() + 6) % 7) + 1;
    if (!o.giorni.includes(giornoSettimana)) continue;
    const allenamento = istanteLocale(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate(), ore, minuti, o.fuso);
    const invio = new Date(allenamento.getTime() - ANTICIPO_MINUTI * 60_000);
    if (invio > dopo) return { invio, allenamento };
  }
  return null;
}
