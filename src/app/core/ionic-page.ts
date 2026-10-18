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
import { IconeIonicDirective } from './icone-ionic.directive';

/**
 * I pezzi di Ionic che compongono ogni pagina: testata con titolo, freccia e
 * pulsanti, piu' il contenuto che scorre. Una costante sola invece di sei
 * import ripetuti in ventisei pagine. Con loro la direttiva che da' alle
 * icone disegnate da Ionic (righe, select, ricerca) la variante della
 * piattaforma.
 */
export const IONIC_PAGE = [IonHeader, IonToolbar, IonTitle, IonButtons, IonBackButton, IonContent, IconeIonicDirective] as const;

/**
 * Per i template con routerLink: RouterLink risolve l'indirizzo, le due
 * direttive di Ionic aggiungono la direzione (routerDirection) alla
 * transizione, una per i link `<a>` e una per tutto il resto.
 */
export const IONIC_LINKS = [RouterLink, IonRouterLink, IonRouterLinkWithHref] as const;
