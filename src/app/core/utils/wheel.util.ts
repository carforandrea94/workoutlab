/**
 * La matematica di una ruota di selezione.
 *
 * Nell'app ce n'era gia' una, quella dell'altezza in Impostazioni, con i
 * centimetri scritti dentro il calcolo. Qui lo stesso conto non sa piu' di
 * cosa sta scegliendo: gli si da' una forbice e un passo, e risponde. Cosi' la
 * ruota dei chili e quella delle ripetizioni non sono una copia della terza.
 *
 * Il conto e' tutto qui: lo scorrimento diviso l'altezza di una tacca da
 * l'indice, l'indice moltiplicato per l'altezza da lo scorrimento. Vale per
 * qualsiasi elenco, anche non regolare - e serve che lo sia, perche' un valore
 * scritto a mano fuori dalla griglia (32,3 kg con passo 0,5) entra nell'elenco
 * al posto suo invece di essere arrotondato via.
 */

export interface WheelSpec {
  /** Il valore piu' basso della ruota. */
  min: number;
  /** Il valore piu' alto. */
  max: number;
  /** Di quanto si sale da una tacca alla successiva. */
  step: number;
}

/**
 * I valori della ruota, dal piu' basso al piu' alto.
 *
 * `extra` e' un valore che deve esserci anche se non cade sulla griglia:
 * e' quello scritto a mano. Se e' gia' una tacca non cambia niente, se non lo
 * e' si infila al posto giusto - e la ruota puo' mostrarlo al centro invece di
 * saltare alla tacca piu' vicina, che vorrebbe dire cambiare un numero che
 * qualcuno ha scritto apposta.
 */
export function wheelValues(spec: WheelSpec, extra?: number | null): number[] {
  const { min, max, step } = spec;
  if (!(step > 0) || !isFinite(min) || !isFinite(max) || max < min) return [];

  const out: number[] = [];
  // Si conta per indici invece di sommare il passo: sommando 0,5 duecento
  // volte si arriva a 99,99999999999 e il confronto con la tacca non torna.
  const n = Math.floor((max - min) / step);
  for (let i = 0; i <= n; i++) out.push(round2(min + i * step));

  if (extra !== null && extra !== undefined && isFinite(extra)
      && extra >= min && extra <= max && !out.includes(round2(extra))) {
    const v = round2(extra);
    const at = out.findIndex(x => x > v);
    out.splice(at < 0 ? out.length : at, 0, v);
  }
  return out;
}

/**
 * La porzione di forbice da disegnare davvero, centrata sul valore.
 *
 * Una ruota dei chili con passo da mezzo e nessun tetto sarebbe lunga
 * migliaia di tacche, e disegnarle tutte costa: misurate a 390px, con otto
 * esercizi aperti insieme, 500 kg sono 8.328 nodi e 284ms di sola
 * impaginazione su una CPU da scrivania. Un telefono ci mette molto di piu'.
 *
 * Non serve. La ruota e' per gli aggiustamenti piccoli - mezzo chilo, una
 * ripetizione - mentre i salti grossi si scrivono: basta che intorno al valore
 * ci siano abbastanza tacche da coprire qualsiasi correzione ragionevole, e
 * `notches` dice quante per lato. Quando si arriva in cima se ne aggiungono
 * altre, cosi' un tetto non c'e' comunque.
 */
export function wheelWindow(spec: WheelSpec, value: number | null | undefined, notches: number): WheelSpec {
  const v = value !== null && value !== undefined && isFinite(value) ? value : spec.min;
  const lo = Math.max(spec.min, v - notches * spec.step);
  const hi = Math.min(spec.max, v + notches * spec.step);
  return { min: round2(lo), max: round2(hi), step: spec.step };
}

/** La tacca che si trova al centro con questo scorrimento. */
export function wheelIndexAt(scrollTop: number, itemH: number, count: number): number {
  if (!(itemH > 0) || count <= 0) return 0;
  const idx = Math.round(scrollTop / itemH);
  return Math.min(count - 1, Math.max(0, idx));
}

/** Lo scorrimento che porta una tacca al centro. */
export function wheelOffsetOfIndex(index: number, itemH: number): number {
  return Math.max(0, index) * itemH;
}

/**
 * Dove sta un valore nell'elenco. Se non c'e' esattamente, la tacca piu'
 * vicina; -1 solo se l'elenco e' vuoto.
 */
export function wheelIndexOf(values: number[], value: number | null | undefined): number {
  if (values.length === 0) return -1;
  if (value === null || value === undefined || !isFinite(value)) return -1;
  let best = 0;
  let dist = Math.abs(values[0] - value);
  for (let i = 1; i < values.length; i++) {
    const d = Math.abs(values[i] - value);
    if (d < dist) { dist = d; best = i; }
  }
  return best;
}

/** Riporta un numero sulla griglia, dentro la forbice. */
export function snapToStep(value: number, spec: WheelSpec): number {
  const { min, max, step } = spec;
  if (!isFinite(value)) return min;
  const clamped = Math.min(max, Math.max(min, value));
  return round2(min + Math.round((clamped - min) / step) * step);
}

/** Due decimali bastano: il passo piu' fine che la ruota usa e' mezzo chilo. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
