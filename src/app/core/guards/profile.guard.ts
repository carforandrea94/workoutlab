import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Se all'account mancano dei dati (cognome, data di nascita, sesso, altezza)
 * si passa dalla schermata che li chiede, prima di entrare nell'app. Non
 * blocca chi ha scelto "Più tardi": per quella sessione si entra.
 */
export const profileGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready;
  if (auth.profiloIncompleto() && !auth.onboardingRimandato) {
    return router.parseUrl('/benvenuto');
  }
  return true;
};

/** La schermata dei dati mancanti ha senso solo finche' ne mancano: a profilo completo si va nell'app. */
export const onboardingGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready;
  return auth.profiloIncompleto() ? true : router.parseUrl('/scheda');
};
