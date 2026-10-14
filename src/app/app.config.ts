import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode, importProvidersFrom } from '@angular/core';
import { provideRouter, withComponentInputBinding, RouteReuseStrategy } from '@angular/router';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular';
import { LucideAngularModule, LucideIconConfig } from 'lucide-angular';

import { routes } from './app.routes';
import { APP_ICONS } from './core/icons';
import { provideServiceWorker } from '@angular/service-worker';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Ionic conserva le pagine delle pile (una per tab) invece di distruggerle
    // a ogni navigazione: e' quello che fa tornare indietro sulla stessa
    // posizione di scroll e sullo stesso stato.
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    // Un solo aspetto su iOS e Android: il design dell'app e' uno, e la
    // modalita' 'md' cambierebbe barre, transizioni e pulsanti su Android.
    // backButtonText vuoto: il tasto indietro e' la sola freccia. Senza, su iOS
    // Ionic scrive "Back" accanto al segno, e il testo non sta nel riquadro da
    // 38px della testata. A dire cos'e' ai lettori di schermo pensa l'aria-label
    // "Indietro" che ogni pagina mette sul suo ion-back-button.
    provideIonicAngular({ mode: 'ios', backButtonText: '' }),
    provideRouter(routes, withComponentInputBinding()),
    importProvidersFrom(LucideAngularModule.pick(APP_ICONS)),
    { provide: LucideIconConfig, useValue: Object.assign(new LucideIconConfig(), { strokeWidth: 2 }) },
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
