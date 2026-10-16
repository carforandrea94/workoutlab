import { FoodCategory, FoodItem, MealCombination, NamedMeal, FOOD_CATEGORIES } from '../../models/diet.model';

/**
 * Cosa si mangia, davvero, in un pasto di oggi.
 *
 * Il piano ha tre livelli di alternative, e prima la pagina li mostrava tutti
 * come testo da leggere:
 * - la combinazione: il pasto intero (Base, Alternativa 1...), un alimento per macro;
 * - le alternative dell'alimento (`item.alt`): sostituti di quel solo alimento;
 * - le alternative del pasto (`meal.alternatives`): un elenco per macro che vale
 *   con qualunque combinazione.
 * Qui diventano una scelta: prima la combinazione, poi, per ogni macro, uno degli
 * alimenti che la possono sostituire. La scelta si salva col giorno, accanto a
 * "pasto fatto".
 *
 * Gli alimenti scelti si ricordano per nome e non per posizione: se il coach
 * riordina o toglie un'alternativa, una scelta che non si ritrova torna al piano
 * invece di indicare un alimento a caso.
 */

export type FonteAlternativa = 'alimento' | 'pasto';

export interface SceltaMacro {
  fonte: FonteAlternativa;
  nome: string;
}

/** Assente (o vuota) vuol dire: il piano com'e', prima combinazione e nessun cambio. */
export interface SceltaPasto {
  combo?: string;
  macro?: Partial<Record<FoodCategory, SceltaMacro>>;
}

export interface Voce {
  name: string;
  qty: string;
}

/** Le alternative possibili per un macro, divise per provenienza. */
export interface OpzioniMacro {
  /** L'alimento della combinazione; null se la combinazione non ne prevede. */
  base: Voce | null;
  /** Alternative di quell'alimento. */
  alimento: Voce[];
  /** Alternative del pasto, senza quelle gia' elencate sopra. */
  pasto: Voce[];
}

export interface AlimentoScelto extends Voce {
  /** Diverso da quello del piano: e' una scelta di chi mangia. */
  cambiato: boolean;
}

const chiave = (n: string | undefined | null) => (n ?? '').trim().toLowerCase();

/** La combinazione scelta, o la prima se la scelta non c'e' (o non c'e' piu'). */
export function comboDi(meal: NamedMeal, scelta?: SceltaPasto | null): MealCombination | null {
  const tutte = meal.combinations ?? [];
  return tutte.find(c => c.id === scelta?.combo) ?? tutte[0] ?? null;
}

export function opzioniMacro(meal: NamedMeal, combo: MealCombination | null, cat: FoodCategory): OpzioniMacro {
  const item: FoodItem | null = combo?.[cat] ?? null;
  const base = item ? { name: item.name, qty: item.qty } : null;
  const alimento = (item?.alt ?? []).map(a => ({ name: a.name, qty: a.qty }));
  const gia = new Set([chiave(base?.name), ...alimento.map(a => chiave(a.name))]);
  const pasto = (meal.alternatives?.[cat] ?? [])
    .filter(a => !gia.has(chiave(a.name)))
    .map(a => ({ name: a.name, qty: a.qty }));
  return { base, alimento, pasto };
}

export function contaAlternative(o: OpzioniMacro): number {
  return o.alimento.length + o.pasto.length;
}

/** Il valore della scelta nel gruppo di radio: "base", "alimento:Riso", "pasto:Pane". */
export function valoreMacro(s?: SceltaMacro | null): string {
  return s ? `${s.fonte}:${s.nome}` : 'base';
}

/** Il contrario di valoreMacro. "base" (o un valore che non si capisce) e' il piano. */
export function daValoreMacro(v: string): SceltaMacro | null {
  const i = v.indexOf(':');
  if (i < 0) return null;
  const fonte = v.slice(0, i);
  const nome = v.slice(i + 1);
  if ((fonte !== 'alimento' && fonte !== 'pasto') || !nome) return null;
  return { fonte, nome };
}

function trova(o: OpzioniMacro, s: SceltaMacro): Voce | null {
  const elenco = s.fonte === 'alimento' ? o.alimento : o.pasto;
  return elenco.find(v => chiave(v.name) === chiave(s.nome)) ?? null;
}

/** Cosa si mangia per quel macro: la scelta, se si ritrova fra le opzioni, se no il piano. */
export function alimentoScelto(o: OpzioniMacro, s?: SceltaMacro | null): AlimentoScelto | null {
  const v = s ? trova(o, s) : null;
  if (v) return { ...v, cambiato: true };
  return o.base ? { ...o.base, cambiato: false } : null;
}

/** "Fiocchi d'avena 80 g · Albume 200 g · Mandorle 15 g": la combinazione in una riga. */
export function riassuntoCombo(combo: MealCombination): string {
  return FOOD_CATEGORIES
    .map(cat => combo[cat])
    .filter((i): i is FoodItem => !!i && !!i.name?.trim())
    .map(i => `${i.name.trim()}${i.qty?.trim() ? ' ' + i.qty.trim() : ''}`)
    .join(' · ');
}

/**
 * Toglie dalla scelta quello che il piano non ha piu' (una combinazione
 * cancellata, un'alternativa rinominata): restano solo i riferimenti validi. Se
 * non resta niente, o resta solo il piano com'e', ritorna undefined.
 */
export function normalizzaScelta(meal: NamedMeal, s?: SceltaPasto | null): SceltaPasto | undefined {
  if (!s) return undefined;
  const tutte = meal.combinations ?? [];
  const combo = tutte.find(c => c.id === s.combo);
  const effettiva = combo ?? tutte[0] ?? null;
  const macro: Partial<Record<FoodCategory, SceltaMacro>> = {};
  for (const cat of FOOD_CATEGORIES) {
    const m = s.macro?.[cat];
    if (!m) continue;
    const o = opzioniMacro(meal, effettiva, cat);
    const v = trova(o, m);
    if (v) macro[cat] = { fonte: m.fonte, nome: v.name };
  }
  const out: SceltaPasto = {};
  // La prima combinazione e' il piano: salvarla come scelta non direbbe niente.
  if (combo && combo !== tutte[0]) out.combo = combo.id;
  if (Object.keys(macro).length) out.macro = macro;
  return Object.keys(out).length ? out : undefined;
}

/** Cambiare combinazione riparte dal pasto intero: i cambi fatti sull'altra non valgono qui. */
export function conCombo(meal: NamedMeal, comboId: string): SceltaPasto | undefined {
  return normalizzaScelta(meal, { combo: comboId });
}

/** Imposta (o toglie, con null) il cambio di un macro, tenendo la combinazione. */
export function conMacro(meal: NamedMeal, s: SceltaPasto | undefined, cat: FoodCategory, m: SceltaMacro | null): SceltaPasto | undefined {
  const macro = { ...(s?.macro ?? {}) };
  if (m) macro[cat] = m; else delete macro[cat];
  return normalizzaScelta(meal, { combo: s?.combo, macro });
}
