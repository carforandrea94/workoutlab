import { IonItem, IonItemOption, IonItemOptions, IonItemSliding } from '@ionic/angular';

/**
 * Le righe con l'azione che compare scorrendo (ion-item-sliding): il gesto
 * iOS per eliminare. Un gesto non e' raggiungibile da chi usa uno screen
 * reader o la tastiera: dove l'eliminazione non ha un'altra strada nella
 * pagina di dettaglio, la riga tiene anche il suo pulsante.
 */
export const IONIC_SLIDING = [IonItem, IonItemSliding, IonItemOptions, IonItemOption] as const;
