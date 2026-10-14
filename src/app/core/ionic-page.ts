import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonRefresher,
  IonRefresherContent,
  IonRouterLink,
  IonRouterLinkWithHref,
  IonTitle,
  IonToolbar
} from '@ionic/angular';

/**
 * I pezzi di Ionic che compongono ogni pagina: testata con titolo, freccia e
 * pulsanti, piu' il contenuto che scorre. Una costante sola invece di sei
 * import ripetuti in ventisei pagine.
 */
export const IONIC_PAGE = [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent] as const;

/**
 * Per i template con routerLink: RouterLink risolve l'indirizzo, le due
 * direttive di Ionic aggiungono la direzione (routerDirection) alla
 * transizione, una per i link `<a>` e una per tutto il resto.
 */
export const IONIC_LINKS = [RouterLink, IonRouterLink, IonRouterLinkWithHref] as const;

/**
 * Il gesto "tira per aggiornare" (ion-refresher): i pezzi da mettere negli
 * imports di una pagina con un elenco che si rilegge dalla rete.
 */
export const IONIC_REFRESH = [IonRefresher, IonRefresherContent] as const;

/**
 * Le righe con l'azione che compare scorrendo (ion-item-sliding): il gesto
 * iOS per eliminare. Un gesto non e' raggiungibile da chi usa uno screen
 * reader o la tastiera: dove l'eliminazione non ha un'altra strada nella
 * pagina di dettaglio, la riga tiene anche il suo pulsante.
 */
export const IONIC_SLIDING = [IonItem, IonItemSliding, IonItemOptions, IonItemOption] as const;

/**
 * Esegue il caricamento e chiude l'indicatore del gesto, anche se fallisce:
 * un indicatore che non si chiude lascia la pagina bloccata in alto. Chi la
 * chiama passa un caricamento SILENZIOSO, che lascia l'elenco a schermo: lo
 * spinner a pagina intera lo sostituirebbe proprio mentre lo si sta tirando.
 */
export async function completaRefresh(ev: Event, carica: () => Promise<unknown>): Promise<void> {
  try {
    await carica();
  } finally {
    (ev.target as unknown as { complete(): Promise<void> | void }).complete();
  }
}
