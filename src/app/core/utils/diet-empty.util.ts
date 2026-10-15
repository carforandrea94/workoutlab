import { Diet, FOOD_CATEGORIES, FoodItem } from '../../models/diet.model';

/**
 * Un alimento senza nome, senza quantità e senza alternative: la casella
 * che l'editor tiene pronta da riempire, non un alimento del piano.
 */
export function eAlimentoVuoto(item: FoodItem | null | undefined): boolean {
  return !item || (!item.name?.trim() && !item.qty?.trim() && !item.alt?.length);
}

/**
 * La dieta senza le caselle vuote delle combinazioni (che diventano null, come
 * un macro non previsto dal coach). È quello che si salva e quello con cui si
 * confronta il protocollo per sapere se è cambiato: l'editor apre ogni macro
 * con una casella da riempire, e lasciarla nel salvataggio gonfiava il conto
 * degli alimenti e mostrava categorie vuote nelle anteprime.
 *
 * Non tocca l'originale: l'editor continua a lavorare sulle sue caselle.
 */
export function senzaCaselleVuote(diet: Diet | null | undefined): Diet {
  return (diet ?? []).map(piano => ({
    ...piano,
    meals: piano.meals.map(pasto => ({
      ...pasto,
      combinations: pasto.combinations.map(combo => {
        const copia = { ...combo };
        for (const cat of FOOD_CATEGORIES) if (eAlimentoVuoto(copia[cat])) copia[cat] = null;
        return copia;
      })
    }))
  }));
}
