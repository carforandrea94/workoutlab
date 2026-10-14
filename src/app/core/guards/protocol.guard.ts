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
 */
export const protocolGuard: CanActivateFn = async () => {
  await inject(AuthService).ready;
  await inject(ProtocolBootstrapService).ensureLoaded();
  return true;
};
