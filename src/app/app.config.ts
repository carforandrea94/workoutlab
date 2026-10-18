import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter, withComponentInputBinding, RouteReuseStrategy } from '@angular/router';
import { provideIonicAngular, IonicRouteStrategy } from '@ionic/angular';

import { routes } from './app.routes';
import { iconeIonic, stileDelDispositivo } from './core/icone';
import { transizionePagina } from './core/page-transition';
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
    // navAnimation: la transizione fra pagine e' quella dell'app (testata
    // coreografata, vedi core/page-transition.ts), non quella di serie di Ionic.
    // backButtonIcon: la freccia invece e' quella della piattaforma (chevron su
    // iOS e Safari, freccia di Material su Android e Chrome), come le altre
    // icone (core/icone.ts): in modalita' iOS Ionic metterebbe sempre il chevron.
    provideIonicAngular({
      mode: 'ios', backButtonText: '', navAnimation: transizionePagina,
      backButtonIcon: iconeIonic(stileDelDispositivo()).indietro
    }),
    provideRouter(routes, withComponentInputBinding()),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    })
  ]
};
