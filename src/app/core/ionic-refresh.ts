import { IonRefresher, IonRefresherContent } from '@ionic/angular';

/**
 * Il gesto "tira per aggiornare" (ion-refresher): i pezzi da mettere negli
 * imports di una pagina con un elenco che si rilegge dalla rete.
 */
export const IONIC_REFRESH = [IonRefresher, IonRefresherContent] as const;

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
