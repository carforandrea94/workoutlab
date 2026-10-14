import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Le pagine di accesso e iscrizione sono per chi non e' collegato: gli altri vanno nell'app. */
export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  await auth.ready;
  return auth.currentUser() ? router.parseUrl('/scheda') : true;
};
