import { RouterLink } from '@angular/router';
import {
  IonBackButton,
  IonButtons,
  IonContent,
  IonHeader,
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
