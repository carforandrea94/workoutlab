import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { protocolGuard } from './core/guards/protocol.guard';
import { profileGuard, onboardingGuard } from './core/guards/profile.guard';
import { uscitaSenzaPerdite } from './core/guards/modifiche-non-salvate.guard';

/**
 * Due livelli: le pagine senza barra (accesso, iscrizione, dati mancanti, privacy) e, sotto
 * TabsPage, tutto il resto. Dentro le tab il primo segmento dell'URL e' la
 * pila di navigazione: scheda, dieta, corsa, account. L'editor dei
 * protocolli sta nella pila "scheda", sotto /scheda/protocolli; le misure in
 * quella "account", sotto /account/misure (non sono piu' una tab).
 *
 * L'ordine conta dove un segmento fisso e uno variabile si somigliano
 * (dieta/lista-spesa e dieta/storico prima di dieta/:mode, account/misure/storico e il rimando
 * di account/misure/analytics prima di account/misure/:categoria).
 */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'registrati',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/register/register.component').then(m => m.RegisterComponent)
  },
  {
    // I dati dell'account che mancano: ci si arriva dopo l'accesso, dalla
    // guardia dell'app, e solo finche' ne mancano.
    path: 'benvenuto',
    canActivate: [authGuard, onboardingGuard],
    loadComponent: () => import('./pages/benvenuto/benvenuto.component').then(m => m.BenvenutoComponent)
  },
  {
    // Senza guardia: ci si arriva anche da chi ha l'iscrizione a meta'.
    path: 'privacy',
    loadComponent: () => import('./pages/privacy/privacy.component').then(m => m.PrivacyComponent)
  },
  {
    path: '',
    canActivate: [authGuard, profileGuard, protocolGuard],
    loadComponent: () => import('./tabs/tabs.page').then(m => m.TabsPage),
    children: [
      { path: '', redirectTo: 'scheda', pathMatch: 'full' },

      // ---- Scheda ----
      {
        path: 'scheda',
        loadComponent: () => import('./pages/scheda-list/scheda-list.component').then(m => m.SchedaListComponent)
      },
      {
        path: 'scheda/day/:n',
        loadComponent: () => import('./pages/scheda-detail/scheda-detail.component').then(m => m.SchedaDetailComponent)
      },
      {
        path: 'scheda/storico',
        loadComponent: () => import('./pages/history-list/history-list.component').then(m => m.HistoryListComponent)
      },
      {
        // La seduta salvata si apre nella stessa pagina dell'allenamento, in
        // modalita' storico: stessi controlli, nessun codice duplicato.
        path: 'scheda/storico/:key',
        data: { modo: 'storico' },
        loadComponent: () => import('./pages/scheda-detail/scheda-detail.component').then(m => m.SchedaDetailComponent)
      },
      {
        path: 'scheda/info',
        loadComponent: () => import('./pages/scheda-info/scheda-info.component').then(m => m.SchedaInfoComponent)
      },

      // ---- Protocolli: scheda, dieta e obiettivo di corsa dell'utente ----
      {
        path: 'scheda/protocolli',
        loadComponent: () => import('./pages/protocolli/protocolli.component').then(m => m.ProtocolliComponent)
      },
      {
        path: 'scheda/protocolli/nuovo',
        loadComponent: () => import('./pages/protocollo-nuovo/protocollo-nuovo.component').then(m => m.ProtocolloNuovoComponent)
      },
      {
        path: 'scheda/protocolli/importa-pdf',
        loadComponent: () => import('./pages/protocollo-import/protocollo-import.component').then(m => m.ProtocolloImportComponent)
      },
      {
        path: 'scheda/protocolli/aggiorna-pdf/:protocolId',
        loadComponent: () => import('./pages/protocollo-import/protocollo-import.component').then(m => m.ProtocolloImportComponent)
      },
      {
        path: 'scheda/protocolli/builder/:protocolId',
        canDeactivate: [uscitaSenzaPerdite],
        loadComponent: () => import('./pages/protocollo-builder/protocollo-builder.component').then(m => m.ProtocolloBuilderComponent)
      },

      // ---- Dieta ----
      {
        path: 'dieta',
        loadComponent: () => import('./pages/dieta/dieta.component').then(m => m.DietaComponent)
      },
      {
        path: 'dieta/lista-spesa',
        loadComponent: () => import('./pages/lista-spesa/lista-spesa.component').then(m => m.ListaSpesaComponent)
      },
      {
        path: 'dieta/storico',
        loadComponent: () => import('./pages/dieta-storico/dieta-storico.component').then(m => m.DietaStoricoComponent)
      },
      {
        path: 'dieta/:mode',
        loadComponent: () => import('./pages/dieta-detail/dieta-detail.component').then(m => m.DietaDetailComponent)
      },

      // ---- Corsa ----
      {
        path: 'corsa',
        loadComponent: () => import('./pages/corsa/corsa.component').then(m => m.CorsaComponent)
      },
      {
        // Le settimane passate: una pagina dentro la tab, aperta dal tasto in alto a destra della Corsa.
        path: 'corsa/storico',
        loadComponent: () => import('./pages/corsa-storico/corsa-storico.component').then(m => m.CorsaStoricoComponent)
      },
      {
        path: 'corsa/nuova',
        canDeactivate: [uscitaSenzaPerdite],
        loadComponent: () => import('./pages/corsa-nuova/corsa-nuova.component').then(m => m.CorsaNuovaComponent)
      },

      // ---- Account ----
      {
        path: 'account',
        loadComponent: () => import('./pages/account/account.component').then(m => m.AccountComponent)
      },
      {
        path: 'account/impostazioni',
        loadComponent: () => import('./pages/impostazioni/impostazioni.component').then(m => m.ImpostazioniComponent)
      },
      {
        // Dove l'utente vuole arrivare: si salva mentre si sceglie, come le Impostazioni.
        path: 'account/obiettivo',
        loadComponent: () => import('./pages/obiettivo/obiettivo.component').then(m => m.ObiettivoComponent)
      },
      {
        // Giorni e ora degli allenamenti: mezz'ora prima arriva la notifica (vedi functions/).
        path: 'account/promemoria',
        loadComponent: () => import('./pages/promemoria/promemoria.component').then(m => m.PromemoriaComponent)
      },

      // ---- Misure, dentro Account ----
      // Misure e' il grafico dell'andamento, e da li' si registra (prima l'andamento
      // era una pagina a parte, /account/misure/analytics: ora rimanda qui).
      {
        path: 'account/misure',
        loadComponent: () => import('./pages/misure/misure.component').then(m => m.MisureComponent)
      },
      {
        path: 'account/misure/storico',
        loadComponent: () => import('./pages/misure-storico/misure-storico.component').then(m => m.MisureStoricoComponent)
      },
      { path: 'account/misure/analytics', redirectTo: 'account/misure', pathMatch: 'full' },
      {
        path: 'account/misure/:categoria',
        canDeactivate: [uscitaSenzaPerdite],
        loadComponent: () => import('./pages/misura-categoria/misura-categoria.component').then(m => m.MisuraCategoriaComponent)
      },
      {
        path: 'account/misure/storico/:key',
        loadComponent: () => import('./pages/misure-storico-detail/misure-storico-detail.component').then(m => m.MisureStoricoDetailComponent)
      },
      // Gli indirizzi di quando Misure era una tab (segnalibri, l'app installata
      // aperta su una pagina di Misure): portano allo stesso posto dentro Account.
      { path: 'misure', redirectTo: 'account/misure', pathMatch: 'full' },
      { path: 'misure/storico', redirectTo: 'account/misure/storico', pathMatch: 'full' },
      { path: 'misure/analytics', redirectTo: 'account/misure', pathMatch: 'full' },
      { path: 'misure/storico/:key', redirectTo: 'account/misure/storico/:key', pathMatch: 'full' },
      { path: 'misure/:categoria', redirectTo: 'account/misure/:categoria', pathMatch: 'full' }
    ]
  },
  { path: '**', redirectTo: 'scheda' }
];
