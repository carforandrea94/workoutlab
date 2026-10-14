/** Data di oggi in formato YYYY-MM-DD, in ora locale (non UTC come farebbe toISOString()). */
export function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Lunedi' della settimana in cui cade la data, a mezzanotte locale. E' il
 * riferimento con cui si confrontano due date per sapere se stanno nella stessa
 * settimana di CALENDARIO (lunedi'-domenica), che e' come l'utente conta le
 * settimane: gli allenamenti fatti e i chilometri corsi si azzerano insieme,
 * la notte fra domenica e lunedi'.
 */
export function mondayOf(dateISO: string): Date {
  const d = new Date(dateISO + 'T00:00:00');
  // getDay(): 0 = domenica. La domenica appartiene alla settimana che inizia
  // sei giorni prima, non a quella che inizia il giorno dopo.
  const offset = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Come mondayOf, ma in formato ISO: comodo come chiave o per confronti diretti fra stringhe. */
export function mondayISO(dateISO: string): string {
  const d = mondayOf(dateISO);
  const m = (d.getMonth() + 1).toString().padStart(2, '0');
  const day = d.getDate().toString().padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Eta' compiuta a una certa data. Conta i compleanni, non gli anni di
 * calendario: chi e' nato il 31 dicembre non invecchia il primo gennaio.
 *
 * Restituisce null per una data assente, illeggibile o nel futuro — un'eta'
 * negativa non e' un'eta'.
 */
export function ageOn(birthISO: string | null | undefined, onISO: string): number | null {
  if (!birthISO) return null;
  const b = new Date(birthISO + 'T00:00:00');
  const on = new Date(onISO + 'T00:00:00');
  if (isNaN(b.getTime()) || isNaN(on.getTime())) return null;
  let age = on.getFullYear() - b.getFullYear();
  const compleannoPassato =
    on.getMonth() > b.getMonth() ||
    (on.getMonth() === b.getMonth() && on.getDate() >= b.getDate());
  if (!compleannoPassato) age--;
  return age < 0 ? null : age;
}
