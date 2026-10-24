/**
 * Le serie di riscaldamento prima del primo esercizio, dal carico di lavoro
 * (il piu' alto sollevato l'ultima volta).
 *
 * Il peso sale e le ripetizioni scendono: si scalda il movimento con poco
 * peso e tante ripetizioni, e ci si avvicina al carico vero con poche, per
 * arrivare alla prima serie senza averne gia' fatta una. Prima le ripetizioni
 * salivano col peso (40% x 3, 60% x 5, 80% x 6 su una serie da 8; su una da
 * 10 si arrivava a 8 ripetizioni all'80%), e il riscaldamento stancava.
 */
export const RAMPA_RISCALDAMENTO: readonly { percent: number; reps: number }[] = [
  { percent: 40, reps: 8 },
  { percent: 60, reps: 5 },
  { percent: 80, reps: 3 }
];

/** Al 2,5 kg: il passo piu' piccolo che si fa sul bilanciere con due dischi da 1,25. */
const arrotonda = (kg: number) => Math.round(kg / 2.5) * 2.5;

/**
 * Le serie di riscaldamento per un carico di lavoro, dalla piu' leggera. Un
 * peso che arrotondato fa zero, o uguale al passo prima, non si ripete: con
 * un carico piccolo i passi si toccano, e due serie uguali non scaldano di piu'.
 */
export function serieDiRiscaldamento(caricoDiLavoro: number): { kg: number; reps: number }[] {
  if (!isFinite(caricoDiLavoro) || caricoDiLavoro <= 0) return [];
  const out: { kg: number; reps: number }[] = [];
  for (const passo of RAMPA_RISCALDAMENTO) {
    const kg = arrotonda(caricoDiLavoro * passo.percent / 100);
    if (kg <= 0 || out.some(s => s.kg === kg)) continue;
    out.push({ kg, reps: passo.reps });
  }
  return out;
}
