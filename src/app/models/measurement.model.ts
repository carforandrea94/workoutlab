/**
 * Le misure sono quelle del foglio "Dati antropometrici" che il coach compila
 * a mano in palestra: stessi siti, stesso ordine, stessi nomi. L'app non
 * chiede niente che su quel foglio non ci sia, cosi' trascrivere una scheda
 * non costringe a saltare righe o a inventare corrispondenze.
 */
export interface MeasurementEntry {
  date: string; // ISO yyyy-mm-dd
  peso: string | null;

  // Pliche corporee, in millimetri. Un valore per sito: il plicometro si
  // passa da una parte sola, ed e' cosi' che il foglio le raccoglie.
  plicaAddominale: string | null;
  plicaIliaca: string | null;
  plicaPettorale: string | null;
  plicaTricipite: string | null;
  plicaSottoscapolare: string | null;
  plicaLombare: string | null;
  plicaQuadricipite: string | null;

  // Circonferenze, in centimetri. Bicipite e quadricipite hanno due lati
  // perche' il foglio ha due colonne, DX e SX.
  cmVita: string | null;
  cmFianchi: string | null;
  cmTorace: string | null;
  cmSpalle: string | null;
  cmBicipiteDx: string | null;
  cmBicipiteSx: string | null;
  cmQuadricipiteDx: string | null;
  cmQuadricipiteSx: string | null;
}

export type MeasurementKey = Exclude<keyof MeasurementEntry, 'date'>;

export interface MeasureField {
  key: MeasurementKey;
  label: string;
  unit: string;
}

export type MeasureCategory = 'peso' | 'centimetri' | 'pliche';

export const PESO_FIELDS: MeasureField[] = [
  { key: 'peso', label: 'Peso', unit: 'kg' }
];

/** Nell'ordine del foglio, cosi' si trascrive dall'alto senza cercare. */
export const PLICHE_FIELDS: MeasureField[] = [
  { key: 'plicaAddominale', label: 'Plica addominale', unit: 'mm' },
  { key: 'plicaIliaca', label: 'Plica iliaca', unit: 'mm' },
  { key: 'plicaPettorale', label: 'Plica pettorale', unit: 'mm' },
  { key: 'plicaTricipite', label: 'Plica tricipite', unit: 'mm' },
  { key: 'plicaSottoscapolare', label: 'Plica sottoscapolare', unit: 'mm' },
  { key: 'plicaLombare', label: 'Plica lombare', unit: 'mm' },
  { key: 'plicaQuadricipite', label: 'Plica quadricipite', unit: 'mm' }
];

export const CENTIMETRI_FIELDS: MeasureField[] = [
  { key: 'cmVita', label: 'Vita', unit: 'cm' },
  { key: 'cmFianchi', label: 'Fianchi', unit: 'cm' },
  { key: 'cmTorace', label: 'Torace', unit: 'cm' },
  { key: 'cmSpalle', label: 'Spalle', unit: 'cm' },
  { key: 'cmBicipiteDx', label: 'Bicipite Dx', unit: 'cm' },
  { key: 'cmBicipiteSx', label: 'Bicipite Sx', unit: 'cm' },
  { key: 'cmQuadricipiteDx', label: 'Quadricipite Dx', unit: 'cm' },
  { key: 'cmQuadricipiteSx', label: 'Quadricipite Sx', unit: 'cm' }
];

export const CATEGORY_FIELDS: Record<MeasureCategory, MeasureField[]> = {
  peso: PESO_FIELDS,
  centimetri: CENTIMETRI_FIELDS,
  pliche: PLICHE_FIELDS
};

export const CATEGORY_LABELS: Record<MeasureCategory, string> = {
  peso: 'Peso',
  centimetri: 'Centimetri',
  pliche: 'Pliche'
};

export const CATEGORY_UNIT_BADGE: Record<MeasureCategory, string> = {
  peso: 'kg',
  centimetri: 'cm',
  pliche: 'mm'
};

export const ALL_MEASURE_FIELDS: MeasureField[] = [
  ...PESO_FIELDS, ...PLICHE_FIELDS, ...CENTIMETRI_FIELDS
];

export function emptyMeasurementEntry(date: string): MeasurementEntry {
  const entry = { date } as MeasurementEntry;
  ALL_MEASURE_FIELDS.forEach(f => { (entry as any)[f.key] = null; });
  return entry;
}

/**
 * Una rilevazione utilizzabile a partire dal documento cosi' com'e' su
 * Firestore, anche quando e' stato scritto con lo schema precedente.
 *
 * Lo schema vecchio aveva altri nomi e teneva DUE lati per ogni plica; il
 * foglio del coach ne vuole uno solo. I siti che esistono in entrambi gli
 * schemi vengono riportati sui nomi nuovi — dove c'erano due lati si prende la
 * media — cosi' lo storico resta leggibile e i grafici non si spezzano a meta'.
 *
 * La conversione avviene in LETTURA e non riscrive niente: i documenti vecchi
 * restano come sono, e un salvataggio nuovo usa i nomi nuovi. Non c'e' un
 * momento in cui una migrazione puo' fallire a meta'.
 *
 * Quello che il foglio non prende (plica della vita e ascellare, addome,
 * polpaccio e caviglia in centimetri) resta su Firestore e semplicemente non
 * viene piu' letto. Plica lombare, fianchi e spalle sono nuovi: nello storico
 * vecchio non c'erano, e restano vuoti.
 */
export function normalizeMeasurement(raw: any): MeasurementEntry {
  const entry = emptyMeasurementEntry(typeof raw?.date === 'string' ? raw.date : '');
  if (!raw) return entry;

  const text = (v: unknown): string | null =>
    typeof v === 'string' && v.trim() ? v : null;

  /** I due lati diventano un valore solo. Con un lato solo misurato vale
   *  quello: meglio il dato che c'e' che nessun dato. */
  const mean = (a: unknown, b: unknown): string | null => {
    const na = toNumber(text(a));
    const nb = toNumber(text(b));
    if (na !== null && nb !== null) {
      return String(Math.round(((na + nb) / 2) * 10) / 10).replace('.', ',');
    }
    if (na !== null) return text(a);
    if (nb !== null) return text(b);
    return null;
  };

  // I nomi nuovi vincono: un documento gia' salvato con lo schema nuovo non
  // deve essere toccato dalle corrispondenze del vecchio.
  ALL_MEASURE_FIELDS.forEach(f => { (entry as any)[f.key] = text(raw[f.key]); });

  entry.plicaAddominale ??= text(raw.plicaAddome);
  entry.plicaPettorale ??= text(raw.plicaPetto);
  entry.plicaIliaca ??= mean(raw.plicaSovrailiacaSx, raw.plicaSovrailiacaDx);
  entry.plicaTricipite ??= mean(raw.plicaTricipiteSx, raw.plicaTricipiteDx);
  entry.plicaSottoscapolare ??= mean(raw.plicaSottoscapolareSx, raw.plicaSottoscapolareDx);
  entry.plicaQuadricipite ??= mean(raw.plicaGambaSx, raw.plicaGambaDx);

  entry.cmTorace ??= text(raw.cmPetto);
  entry.cmQuadricipiteDx ??= text(raw.cmGambaDx);
  entry.cmQuadricipiteSx ??= text(raw.cmGambaSx);

  return entry;
}

/** I valori sono digitati con la virgola italiana: parseFloat da sola
 *  tronca al primo carattere non numerico e perde il decimale. */
function toNumber(raw: string | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(',', '.'));
  return isFinite(n) ? n : null;
}
