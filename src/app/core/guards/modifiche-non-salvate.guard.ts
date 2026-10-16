import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';

/**
 * Una pagina che sa dire se chi la sta lasciando perderebbe qualcosa:
 * l'editor del protocollo, l'uscita di corsa, la misura in modifica.
 */
export interface ConModificheNonSalvate {
  haModificheNonSalvate(): boolean;
}

/** Il primo segmento dell'URL e' la pila di navigazione (una per tab): /scheda/day/2 -> "scheda". */
export function pilaDi(url: string): string {
  return url.split('?')[0].split('#')[0].split('/').filter(Boolean)[0] ?? '';
}

/**
 * Prima di lasciare una pagina con modifiche non salvate, chiede. Passa di qui
 * ogni uscita che e' una navigazione: la freccia, il tasto indietro del
 * browser, andare avanti su una pagina che riparte dai dati salvati.
 *
 * Non chiede quando si cambia tab: ogni tab ha la sua pila e la pagina resta
 * dov'e', con quello che c'e' scritto, ad aspettare il ritorno. Chiedere li'
 * direbbe "andra' perso" dove non e' vero.
 *
 * Non passa di qui il gesto di swipe dal bordo: quando finisce, la pagina e'
 * gia' scivolata via e una guardia che dice no la lascia a meta', quindi le
 * pagine con questa guardia spengono lo swipe (vedi senzaSwipeIndietro).
 *
 * inject() prima di qualsiasi await: dopo non si e' piu' nel contesto di
 * iniezione (NG0203), come per le altre guardie.
 */
export const uscitaSenzaPerdite: CanDeactivateFn<ConModificheNonSalvate> = (pagina, _rotta, stato, prossimo) => {
  const conferme = inject(ConfirmDialogService);
  if (!pagina.haModificheNonSalvate()) return true;
  if (pilaDi(prossimo.url) !== pilaDi(stato.url)) return true;
  return conferme.confirm('Uscire senza salvare? Quello che hai scritto andrà perso.', {
    confirmLabel: 'Esci senza salvare',
    dangerous: true
  });
};
