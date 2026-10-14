import { Sex } from '../models/user.model';

/**
 * Massa grassa stimata dalle pliche, con Jackson-Pollock a 3 siti e la
 * conversione di Siri.
 *
 * Tre siti e non sette perche' il foglio del coach raccoglie la plica lombare
 * al posto dell'ascellare, che era uno dei sette. I tre che servono ci sono
 * tutti, per entrambi i sessi, e sono formule degli stessi autori: Jackson &
 * Pollock 1978 per gli uomini, Jackson, Pollock & Ward 1980 per le donne.
 *
 * I SITI SONO DIVERSI PER SESSO, non solo i coefficienti: un uomo si misura su
 * pettorale, addominale e quadricipite, una donna su tricipite, iliaca e
 * quadricipite. Senza sapere il sesso non si sa nemmeno quali pliche servono,
 * ed e' per questo che il profilo lo chiede.
 *
 * Il risultato e' una STIMA su una popolazione di riferimento, non una misura:
 * due plicometristi diversi sullo stesso corpo non danno lo stesso numero.
 * Vale per seguire un andamento, non per un verdetto.
 */

export type Jp3Site = 'pettorale' | 'addominale' | 'quadricipite' | 'tricipite' | 'iliaca';

/** I tre siti della formula, per sesso, nell'ordine in cui si nominano. */
export const JP3_SITES: Record<Sex, Jp3Site[]> = {
  m: ['pettorale', 'addominale', 'quadricipite'],
  f: ['tricipite', 'iliaca', 'quadricipite']
};

export const JP3_SITE_LABELS: Record<Jp3Site, string> = {
  pettorale: 'pettorale',
  addominale: 'addominale',
  quadricipite: 'quadricipite',
  tricipite: 'tricipite',
  iliaca: 'iliaca'
};

export type Jp3Sites = Partial<Record<Jp3Site, number | null>>;

export interface BodyFatResult {
  /** Massa grassa in percentuale, arrotondata al decimo. null se manca un dato. */
  pct: number | null;
  /** I siti che servono a QUESTO sesso e non sono stati misurati. Vuoto se il
   *  sesso non si sa, perche' allora non si sa nemmeno quali cercare. */
  missing: Jp3Site[];
  needsSex: boolean;
  needsAge: boolean;
  /** La somma delle pliche e' fuori dal campo in cui la formula ha senso. */
  outOfRange: boolean;
}

/**
 * Eta' minima per cui questa stima ha senso. Jackson-Pollock e' tarata sugli
 * adulti: sotto, la composizione corporea si muove con lo sviluppo e la
 * formula restituirebbe un numero senza significato invece di un errore.
 */
export const BODYFAT_MIN_AGE = 14;

/** I coefficienti pubblicati, uno per sesso. */
const COEFF: Record<Sex, { a: number; b: number; c: number; d: number }> = {
  // Jackson & Pollock 1978 — pettorale + addominale + quadricipite
  m: { a: 1.10938, b: 0.0008267, c: 0.0000016, d: 0.0002574 },
  // Jackson, Pollock & Ward 1980 — tricipite + iliaca + quadricipite
  f: { a: 1.0994921, b: 0.0009929, c: 0.0000023, d: 0.0001392 }
};

/**
 * La somma delle pliche oltre cui la formula smette di avere senso.
 *
 * Il polinomio e' una parabola, e oltre il suo vertice la densita' ricomincia
 * a salire: la stima restituisce MENO grasso man mano che le pliche crescono.
 * E' il caso peggiore possibile — un numero plausibile che non si distingue da
 * un buon risultato.
 *
 * Il vertice sta dove la derivata si annulla, b/(2c): 258 mm per l'uomo, 216
 * per la donna. A tre siti si arriva molto prima che a sette, quindi questo
 * controllo conta piu' di prima. Si calcola dai coefficienti invece di
 * scriverlo a mano, cosi' non puo' divergere da loro.
 */
export function jp3SumLimit(sex: Sex): number {
  const { b, c } = COEFF[sex];
  return b / (2 * c);
}

/**
 * La media dei due lati, o il solo lato misurato. Resta utile a chi legge
 * rilevazioni vecchie, dove le pliche avevano due lati.
 */
export function meanSide(sx: number | null, dx: number | null): number | null {
  if (sx !== null && dx !== null) return (sx + dx) / 2;
  return sx !== null ? sx : dx;
}

/** Densita' corporea secondo Jackson-Pollock a 3 siti. */
export function bodyDensityJp3(sumMm: number, ageYears: number, sex: Sex): number {
  const { a, b, c, d } = COEFF[sex];
  return a - b * sumMm + c * sumMm * sumMm - d * ageYears;
}

/** Equazione di Siri: dalla densita' corporea alla percentuale di grasso. */
export function siriBodyFat(density: number): number {
  return 495 / density - 450;
}

/**
 * La stima, oppure l'elenco di cosa le manca.
 *
 * Non restituisce mai un numero parziale: con anche un solo sito mancante la
 * somma sarebbe piu' bassa del vero e la stima direbbe meno grasso di quanto
 * ce n'e'. Meglio dire cosa manca.
 */
export function bodyFatJp3(
  sites: Jp3Sites,
  ageYears: number | null,
  sex: Sex | null | undefined
): BodyFatResult {
  const needsSex = !sex;
  const needsAge = ageYears === null || ageYears < BODYFAT_MIN_AGE;
  // Senza sesso non si sa nemmeno quali tre pliche servono: elencarne di
  // sbagliate manderebbe a misurare cose inutili.
  const missing = sex
    ? JP3_SITES[sex].filter(s => {
        const v = sites[s];
        return v === null || v === undefined || !isFinite(v) || v <= 0;
      })
    : [];

  const vuoto: BodyFatResult = { pct: null, missing, needsSex, needsAge, outOfRange: false };
  if (missing.length || needsSex || needsAge) return vuoto;

  const sum = JP3_SITES[sex as Sex].reduce((acc, s) => acc + (sites[s] as number), 0);
  if (sum >= jp3SumLimit(sex as Sex)) return { ...vuoto, outOfRange: true };

  const density = bodyDensityJp3(sum, ageYears as number, sex as Sex);
  if (!isFinite(density) || density <= 0) return { ...vuoto, outOfRange: true };
  // Pliche impossibilmente sottili portano Siri sotto lo zero: un grasso
  // negativo non e' un risultato, e' una somma che nessun corpo produce.
  const pct = siriBodyFat(density);
  if (!isFinite(pct) || pct <= 0 || pct >= 100) return { ...vuoto, outOfRange: true };

  return { pct: Math.round(pct * 10) / 10, missing, needsSex, needsAge, outOfRange: false };
}

/** La stima come la si scrive in italiano, con la virgola. */
export function formatBodyFat(pct: number): string {
  return (Math.round(pct * 10) / 10).toString().replace('.', ',');
}
