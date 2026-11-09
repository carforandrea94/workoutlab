import { IonRouterOutlet, NavController } from '@ionic/angular';

/**
 * Finito, si torna da dove si e' venuti.
 *
 * Una pagina come "Registra peso" si apre da due posti (la riga Peso di
 * Progressi e il grafico di Misure) e, salvato, tornava sempre a Misure con
 * navigateBack. Se Misure non era nella pila (si veniva da Progressi) Ionic la
 * apriva come prima pagina della pila: la sua freccia non aveva dove tornare,
 * e la tab Progressi riapriva quella pagina invece della radice.
 *
 * Con una pagina prima di questa si toglie questa dalla pila; senza (pagina
 * aperta da un segnalibro, dopo una ricarica, app riaperta) si va al punto
 * fisso, che ha la sua freccia verso la radice della stessa tab.
 */
export function tornaDaDoveSeiVenuto(nav: NavController, outlet: IonRouterOutlet | null, puntoFisso: string[]): void {
  if (outlet?.canGoBack()) {
    void outlet.pop();
    return;
  }
  nav.navigateBack(puntoFisso);
}
