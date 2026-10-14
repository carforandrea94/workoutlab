import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ProtocolBootstrapService } from '../../services/protocol-bootstrap.service';

/**
 * Prima di mostrare l'app, il protocollo attivo dell'utente deve essere gia'
 * caricato: cosi' le pagine lo trovano pronto invece di partire vuote e
 * riempirsi dopo.
 *
 * Aspetta da se' che l'autenticazione sia pronta: le guardie della stessa
 * rotta partono insieme, e senza questa attesa il protocollo verrebbe cercato
 * quando ancora non si sa chi e' l'utente.
 *
 * Le inject() vanno TUTTE prima del primo await: dopo, la funzione non e' piu'
 * nel contesto di iniezione e Angular lancia NG0203 (la navigazione fallisce e
 * l'app resta vuota).
 */
export const protocolGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const bootstrap = inject(ProtocolBootstrapService);

  await auth.ready;
  await bootstrap.ensureLoaded();
  return true;
};
