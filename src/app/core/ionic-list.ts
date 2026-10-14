import { IonItem, IonList } from '@ionic/angular';

/**
 * Le card che portano da qualche parte (ion-list + ion-item button): una
 * lista vera per chi usa uno screen reader, righe che si raggiungono con la
 * tastiera e che rispondono a Invio, e il feedback del tocco e il chevron di
 * Ionic. Prima erano <div> con un click: ne' un ruolo, ne' il focus.
 */
export const IONIC_LIST = [IonList, IonItem] as const;
