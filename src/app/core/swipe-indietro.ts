import { IonRouterOutlet } from '@ionic/angular';

/**
 * Spegne il gesto di swipe indietro dal bordo finche' la pagina e' in vista.
 *
 * L'outlet e' uno solo per tutta la pila: va rimesso com'era quando la pagina
 * se ne va, o la pagina dopo resterebbe senza swipe. Chi lo usa lo chiama da
 * ionViewWillEnter (spegni) e ionViewWillLeave (riaccendi).
 *
 * Serve alle pagine con la guardia uscitaSenzaPerdite: il gesto completa
 * l'animazione prima che la guardia possa dire no, e la pagina restava
 * scivolata via con la rotta ancora la'.
 */
export function senzaSwipeIndietro(outlet: IonRouterOutlet | null): { spegni(): void; riaccendi(): void } {
  return {
    spegni: () => { if (outlet) outlet.swipeGesture = false; },
    riaccendi: () => { if (outlet) outlet.swipeGesture = true; }
  };
}
