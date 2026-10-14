/**
 * Indice di massa corporea: peso in chili diviso il quadrato dell'altezza in
 * metri. Serve tutti e due i dati, e nessuno dei due e' garantito — il peso
 * arriva dallo storico misure, che puo' essere vuoto, e l'altezza dal profilo,
 * dove non c'era fino a ieri.
 */

/** Le fasce dell'OMS. `obesita` senza accento perche' e' una chiave, non testo. */
export type BmiClass = 'sottopeso' | 'normopeso' | 'sovrappeso' | 'obesita';

export const BMI_CLASS_LABELS: Record<BmiClass, string> = {
  sottopeso: 'sottopeso',
  normopeso: 'normopeso',
  sovrappeso: 'sovrappeso',
  obesita: 'obesità'
};

/**
 * Il BMI, arrotondato al decimo, oppure null se manca un pezzo.
 *
 * Un'altezza o un peso a zero non danno "BMI zero" ma nessun BMI: la
 * divisione per zero varrebbe Infinity e finirebbe a schermo come un numero.
 */
export function computeBmi(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined
): number | null {
  if (!weightKg || !heightCm || !isFinite(weightKg) || !isFinite(heightCm)) return null;
  if (weightKg <= 0 || heightCm <= 0) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/**
 * La fascia di un BMI. Gli estremi appartengono alla fascia piu' alta, come
 * li scrive l'OMS: 18,5 e' normopeso, 25 e' sovrappeso, 30 e' obesita'.
 */
export function bmiClass(bmi: number): BmiClass {
  if (bmi < 18.5) return 'sottopeso';
  if (bmi < 25) return 'normopeso';
  if (bmi < 30) return 'sovrappeso';
  return 'obesita';
}

/** Il BMI come lo si scrive in italiano, con la virgola. */
export function formatBmi(bmi: number): string {
  return (Math.round(bmi * 10) / 10).toString().replace('.', ',');
}
