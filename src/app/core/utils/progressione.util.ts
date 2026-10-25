/**
 * Quando salire di peso: la doppia progressione.
 *
 * Il peso dell'ultima volta e' un fatto, ma da solo dice "rifai lo stesso" per
 * sempre. Se quella volta TUTTE le serie del piano sono arrivate alle
 * ripetizioni che il piano chiede (alla cima, quando chiede un intervallo come
 * "8-10"), quel peso e' diventato facile: oggi si prova con un passo in piu'.
 * Basta una serie rimasta sotto e si resta dove si era: prima si completano le
 * ripetizioni, poi si sale. E' la regola dei programmi a doppia progressione,
 * e qui basta lo storico che c'e' gia'.
 */

/** Il passo: due dischi da 1,25, il piu' piccolo che si fa sul bilanciere. */
export const PASSO_PROGRESSIONE = 2.5;

/** Una serie dell'ultima volta, come e' stata salvata. */
export interface SerieFatta {
  load: string | null;
  reps: string | null;
  /** false: non segnata come fatta. Assente nelle sedute di prima: vale fatta. */
  done?: boolean;
}

/**
 * Le ripetizioni da raggiungere su una serie del piano: il numero, o la cima di
 * un intervallo ("8-10", "8/10"). null quando il piano non chiede un numero
 * ("MAX", "30''", "12+12" di un cluster o di un lato per volta): li' non c'e'
 * una cima da toccare.
 */
export function ripetizioniDaRaggiungere(raw: string | number | null | undefined): number | null {
  const t = String(raw ?? '').trim();
  const m = /^(\d+)(?:\s*[-/]\s*(\d+))?$/.exec(t);
  if (!m) return null;
  const n = parseInt(m[2] ?? m[1], 10);
  return n > 0 ? n : null;
}

/** Un peso scritto come si scrive qui ("32,5"); null se non e' un peso. */
function peso(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const n = parseFloat(t);
  return n > 0 ? n : null;
}

/** Ripetizioni intere: un "8+8" non e' un numero di ripetizioni. */
function ripetizioni(raw: string | null | undefined): number | null {
  const t = (raw ?? '').trim();
  return /^\d+$/.test(t) ? parseInt(t, 10) : null;
}

/**
 * Il peso da provare oggi su ogni serie del piano: quello dell'ultima volta piu'
 * un passo. null se anche una sola serie del piano non e' arrivata alle sue
 * ripetizioni, non e' stata fatta, non ha un peso, o non ha una cima da
 * raggiungere (allora non si sa se e' arrivata).
 *
 * `obiettivi` sono le ripetizioni da raggiungere oggi, serie per serie (vedi
 * ripetizioniDaRaggiungere): quelle di oggi e non di allora, perche' e' oggi
 * che il peso va sollevato. Su un'onda che scende da 10 a 8 ripetizioni chi
 * ne ha fatte 10 col peso di allora ne fa 8 con un passo in piu'.
 */
export function provaDiPiu(ultima: readonly SerieFatta[], obiettivi: readonly (number | null)[]): number[] | null {
  if (!obiettivi.length) return null;
  const pesi: number[] = [];
  for (let i = 0; i < obiettivi.length; i++) {
    const cima = obiettivi[i];
    const s = ultima[i];
    if (cima === null || !s || s.done === false) return null;
    const kg = peso(s.load);
    const fatte = ripetizioni(s.reps);
    if (kg === null || fatte === null || fatte < cima) return null;
    pesi.push(kg + PASSO_PROGRESSIONE);
  }
  return pesi;
}
