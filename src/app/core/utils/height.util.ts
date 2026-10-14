/**
 * Forbice dell'altezza, in centimetri interi.
 *
 * Non e' una validazione ma il contenuto della ruota di selezione: i valori
 * fuori scala non vengono respinti, semplicemente non ci sono. Il centimetro
 * intero e' la granularita' giusta — nessuno si misura al millimetro, e il BMI
 * cambia di 0,03 fra 180 e 180,5.
 *
 * Gli stessi due estremi vivono anche in firestore.rules: la ruota impedisce
 * di sbagliare, ma a scrivere sul documento e' il dispositivo, non l'app.
 */
export const HEIGHT_MIN_CM = 100;
export const HEIGHT_MAX_CM = 250;

/** Dove si apre la ruota per chi non ha ancora messo l'altezza. */
export const HEIGHT_DEFAULT_CM = 170;

/** Altezza di una tacca della ruota, in px. La usano il foglio di stile (per
 *  disegnarla) e il componente (per tradurre lo scorrimento in un valore):
 *  se i due numeri divergono, la ruota sceglie un valore diverso da quello
 *  che mostra al centro. */
export const WHEEL_ITEM_H = 44;

/** I valori della ruota, dal piu' basso al piu' alto. */
export function heightOptions(): number[] {
  const out: number[] = [];
  for (let cm = HEIGHT_MIN_CM; cm <= HEIGHT_MAX_CM; cm++) out.push(cm);
  return out;
}

/**
 * Porta un'altezza dentro la ruota: arrotonda al centimetro e taglia agli
 * estremi. Serve ai profili salvati prima della ruota, che possono avere un
 * decimale, e a `null`, che apre sul valore di partenza.
 */
export function toWheelValue(cm: number | null | undefined): number {
  if (cm === null || cm === undefined || !isFinite(cm)) return HEIGHT_DEFAULT_CM;
  return Math.min(HEIGHT_MAX_CM, Math.max(HEIGHT_MIN_CM, Math.round(cm)));
}

/** Traduce lo scorrimento della ruota nel valore che ha al centro. */
export function wheelValueAt(scrollTop: number): number {
  const idx = Math.round(scrollTop / WHEEL_ITEM_H);
  return toWheelValue(HEIGHT_MIN_CM + idx);
}

/** Lo scorrimento che porta un valore al centro della ruota. */
export function wheelOffsetOf(cm: number): number {
  return (toWheelValue(cm) - HEIGHT_MIN_CM) * WHEEL_ITEM_H;
}

/** Riporta l'altezza nella forma in cui la gente la scrive, con la virgola. */
export function formatHeightCm(cm: number | null | undefined): string {
  if (cm === null || cm === undefined) return '';
  return (Math.round(cm * 10) / 10).toString().replace('.', ',');
}
