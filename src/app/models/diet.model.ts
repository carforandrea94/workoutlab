export type FoodCategory = 'carb' | 'protein' | 'fat';

export interface FoodItem {
  name: string;
  qty: string;
  category?: FoodCategory;
  alt?: { name: string; qty: string }[];
}

export const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  carb: 'Carboidrati',
  protein: 'Proteine',
  fat: 'Grassi'
};

export const FOOD_CATEGORIES: FoodCategory[] = ['carb', 'protein', 'fat'];

/** Una combinazione (Base o alternativa): un solo alimento per macro. */
export interface MealCombination {
  id: string;
  label: string;
  carb: FoodItem | null;
  protein: FoodItem | null;
  fat: FoodItem | null;
}

/** Liste di alimenti sostitutivi per macro, valide per tutto il pasto (non legate a una combinazione). */
export interface MacroAlternatives {
  carb: FoodItem[];
  protein: FoodItem[];
  fat: FoodItem[];
}

export interface SupplementItem {
  name: string;
  qty: string;
}

/** Un pasto con nome libero (Colazione, Spuntino, ma anche "Pre-workout", ecc.).
 *  Ha sempre almeno una combinazione (Base); se ce n'e' piu' di una vengono
 *  mostrate come tab. Le alternative per macro sono separate, sotto i tab.
 *  "supplements" e' una lista piatta indipendente dalle combinazioni: piu'
 *  integratori valgono insieme per lo stesso pasto, non sono alternative
 *  intercambiabili tra loro. */
export interface NamedMeal {
  id: string;
  name: string;
  combinations: MealCombination[];
  alternatives: MacroAlternatives;
  supplements?: SupplementItem[];
}

/** Un piano dieta con nome libero (es. "Giorno ON", "Giorno OFF", "Rifeed", "Vacanza"...). */
export interface DietPlan {
  id: string;
  name: string;
  meals: NamedMeal[];
}

/** Il protocollo puo' contenere piu' diete, non piu' fisse a due (ON/OFF). */
export type Diet = DietPlan[];

export const DEFAULT_MEAL_NAMES = ['Colazione', 'Spuntino', 'Pranzo', 'Merenda', 'Cena'];

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

export function newCombination(label: string): MealCombination {
  return { id: newId('combo'), label, carb: null, protein: null, fat: null };
}

function emptyAlternatives(): MacroAlternatives {
  return { carb: [], protein: [], fat: [] };
}

export function newNamedMeal(name: string): NamedMeal {
  return { id: newId('meal'), name, combinations: [newCombination('Base')], alternatives: emptyAlternatives() };
}

export function defaultMeals(): NamedMeal[] {
  return DEFAULT_MEAL_NAMES.map(name => newNamedMeal(name));
}

export function newDietPlan(name: string): DietPlan {
  return { id: newId('diet'), name, meals: defaultMeals() };
}
