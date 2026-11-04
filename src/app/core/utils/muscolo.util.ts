/**
 * Il gruppo muscolare di un esercizio dal suo nome.
 *
 * Il nome lo dice gia': chi scrive "Panca inclinata" non deve anche scegliere
 * "Petto" da un menu. L'import dal PDF lo faceva da sempre; ora lo fa anche il
 * builder mentre si scrive, con le stesse parole chiave.
 */

export const GRUPPI_MUSCOLARI = ['Petto', 'Spalle', 'Tricipiti', 'Dorso', 'Bicipiti', 'Gambe', 'Core'] as const;

/**
 * Ordine di priorita': le parole chiave piu' specifiche (Core, Gambe, Bicipiti)
 * vanno prima di quelle che si sovrappongono a nomi di macchinari o esercizi di
 * altri gruppi (es. "LAT MACHINE" usata anche per esercizi di core).
 */
export const MUSCLE_KEYWORDS: { muscle: string; keywords: string[] }[] = [
  { muscle: 'Core', keywords: ['CRUNCH', 'GINOCCHIA', 'GAMBE AL PETTO', 'FLESSIONI', 'BUSTO', 'ADDOMINALI', 'PLANK', 'FITBALL', 'INVERSI', 'CORE'] },
  { muscle: 'Gambe', keywords: ['SQUAT', 'LEG', 'AFFONDI', 'HIP THRUST', 'STACCO', 'CALF', 'GAMBE'] },
  { muscle: 'Bicipiti', keywords: ['CURL', 'BICIP'] },
  { muscle: 'Dorso', keywords: ['LAT MACHINE', 'LAT INVERSA', 'REMATORE', 'T BAR', 'PULLEY', 'PULLOVER', 'PULL DOWN', 'PULLDOWN', 'TRAZION', 'ROW', 'DORSO'] },
  { muscle: 'Spalle', keywords: ['ALZATE', 'SPALLE', 'DELT', 'MILITARY', 'TIRATE AL MENTO', 'LENTO AVANTI'] },
  { muscle: 'Tricipiti', keywords: ['FRENCH PRESS', 'PUSH DOWN', 'PUSHDOWN', 'TRICIP', 'DIPS', 'PARALLELE'] },
  { muscle: 'Petto', keywords: ['PANCA', 'SPINTE', 'CHEST', 'PETTO', 'PECTORAL', 'CROCI'] }
];

/** Il gruppo che il nome indica, o null se non dice niente (non si indovina a caso). */
export function muscoloDaNome(nome: string | null | undefined): string | null {
  const n = (nome ?? '').toUpperCase();
  if (!n.trim()) return null;
  for (const { muscle, keywords } of MUSCLE_KEYWORDS) {
    if (keywords.some(k => n.includes(k))) return muscle;
  }
  return null;
}
