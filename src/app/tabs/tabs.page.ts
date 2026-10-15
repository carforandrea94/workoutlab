import { Component, ElementRef, OnDestroy, OnInit, computed, effect, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { IonTabs, IonTabBar, IonTabButton, NavController } from '@ionic/angular';
import { LucideAngularModule } from 'lucide-angular';
import { WorkoutDataService } from '../services/workout-data.service';
import { WorkoutSessionStateService } from '../services/workout-session-state.service';
import { RestBarComponent } from '../components/rest-bar/rest-bar.component';

interface Tab { id: string; label: string; icon: string; }

/** Le schede, nell'ordine della barra. */
const TABS: Tab[] = [
  { id: 'scheda', label: 'Scheda', icon: 'dumbbell' },
  { id: 'dieta', label: 'Dieta', icon: 'utensils' },
  { id: 'corsa', label: 'Corsa', icon: 'sport-shoe' },
  { id: 'misure', label: 'Misure', icon: 'ruler' },
  { id: 'account', label: 'Account', icon: 'user' }
];

/**
 * Sta su una pagina "radice" di una tab (/scheda, /dieta...) e non dentro una
 * pagina interna? Con la barra visibile solo li'. Anche "/" conta: e' l'indirizzo
 * di partenza che subito rimanda a /scheda, e li' la barra non deve fare in
 * tempo a nascondersi.
 */
export function eRadiceDiTab(url: string, tabs: readonly { id: string }[] = TABS): boolean {
  const percorso = url.split('?')[0].split('#')[0].replace(/\/+$/, '');
  return percorso === '' || tabs.some(t => percorso === '/' + t.id);
}

/**
 * La barra in basso, una pila di navigazione per scheda.
 *
 * Ionic assegna la pila dal primo segmento dell'URL: /scheda/day/2 e
 * /scheda/protocolli/builder/x stanno nella pila "scheda", /dieta/lista-spesa
 * in quella "dieta".
 *
 * L'aspetto e' quello della pillola dell'app originale (le classi .tabbar,
 * .tabbtn e .pill di styles.css), non la barra standard di Ionic.
 *
 * La barra c'e' sulle cinque pagine radice e scivola via in quelle interne
 * (come fa iOS quando una pagina "nasconde la barra inferiore"): dentro un
 * giorno, un editor, uno storico serve lo spazio, e per cambiare sezione si
 * torna indietro. Toccare di nuovo la tab gia' aperta, sulla radice, riporta
 * in cima alla pagina.
 *
 * Con una sessione in corso, fuori dalla pagina del suo giorno compare la
 * pillola "In corso · 23:10 · Riprendi": prima, uscendo dal giorno, la
 * sessione spariva dallo schermo e l'unico modo di ritrovarla era ricordarsi
 * quale giorno si stava facendo.
 */
@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, LucideAngularModule, RestBarComponent],
  template: `
    <ion-tabs (ionTabsDidChange)="selected.set($event.tab)">
      <div class="tabfade" [class.tabbar-nascosta]="nascondiBarra"></div>
      <ion-tab-bar slot="bottom" class="tabbar tabbar-5" [class.tabbar-nascosta]="nascondiBarra"
        [style.display]="showRestBar ? 'none' : null">
        <div class="pill" [class]="'pill p' + selectedIndex()"></div>
        @for (t of tabs; track t.id) {
          <ion-tab-button [tab]="t.id" class="tabbtn" [class.active]="selected() === t.id" (click)="alToccoTab(t.id)">
            <span class="ic"><lucide-icon [name]="t.icon" [size]="23"></lucide-icon></span>
            <span class="tablabel">{{ t.label }}</span>
          </ion-tab-button>
        }
      </ion-tab-bar>
      <!-- Durante una seduta la barra lascia il posto al recupero: in mezzo a
           un allenamento serve sapere quanto manca, non cambiare sezione. -->
      @if (showRestBar) {
        <app-rest-bar></app-rest-bar>
      }
      @if (sessione(); as s) {
        <button type="button" class="sessionpill" [class.senza-barra]="nascondiBarra" [class.in-pausa]="s.inPausa"
          (click)="riprendiSessione()" [attr.aria-label]="s.aria">
          <span class="sessionpill-dot" aria-hidden="true"></span>
          <span class="sessionpill-stato">{{ s.inPausa ? 'In pausa' : 'In corso' }}</span>
          <span class="sessionpill-tempo">{{ s.tempo }}</span>
          <span class="sessionpill-vai">Riprendi <lucide-icon name="chevron-right" [size]="14"></lucide-icon></span>
        </button>
      }
    </ion-tabs>
  `
})
export class TabsPage implements OnInit, OnDestroy {
  readonly selected = signal<string>('');
  /** In una pagina dentro la tab, non sulla sua radice. */
  readonly paginaInterna = signal(false);
  /** Sulla pagina di un giorno (/scheda/day/N): li' la sessione si vede gia', con la fascia o con "Inizia". */
  readonly paginaGiorno = signal(false);

  /**
   * La sessione in corso, per la pillola: c'e' solo se una sessione esiste e
   * non si e' sulla pagina di un giorno. Il tempo e' lo stesso della barra del
   * giorno (un signal che batte ogni secondo).
   */
  readonly sessione = computed(() => {
    const s = this.sessionState.activeSession();
    if (!s || this.paginaGiorno()) return null;
    const inPausa = !!s.pausedAt;
    const tempo = this.sessionState.formatDuration(this.sessionState.elapsedSec());
    return {
      inPausa, tempo,
      aria: `${inPausa ? 'Allenamento in pausa' : 'Allenamento in corso'}, ${tempo}. Riprendi.`
    };
  });
  private dayIdOnScreen: string | null = null;
  private routeSub: Subscription | null = null;

  constructor(
    private router: Router,
    private workoutData: WorkoutDataService,
    private sessionState: WorkoutSessionStateService,
    private host: ElementRef<HTMLElement>,
    private nav: NavController
  ) {
    // Il contenuto delle pagine tiene sotto uno spazio per la barra: senza barra
    // (e senza la fascia del recupero, che ne prende il posto) lo rende.
    effect(() => {
      document.documentElement.classList.toggle('senza-tabbar', this.nascondiBarra);
    });
    // Idem per la pillola: sta sopra la barra e il contenuto deve poter scorrere
    // oltre, altrimenti l'ultima card resta in parte coperta.
    effect(() => {
      document.documentElement.classList.toggle('con-pillola', this.sessione() !== null);
    });
  }

  readonly tabs = TABS;

  selectedIndex(): number {
    return Math.max(0, this.tabs.findIndex(t => t.id === this.selected()));
  }

  /**
   * Solo sul giorno che si sta ALLENANDO: con una sessione aperta su un altro
   * giorno quella schermata e' in sola lettura, e togliere la navigazione a
   * chi sta solo guardando sarebbe un dispetto.
   */
  get showRestBar(): boolean {
    return this.dayIdOnScreen !== null && this.sessionState.isActiveForDay(this.dayIdOnScreen);
  }

  /** Dentro una pagina interna la barra sparisce, tranne dove ne fa le veci la fascia del recupero. */
  get nascondiBarra(): boolean {
    return this.paginaInterna() && !this.showRestBar;
  }

  /** Riporta sul giorno della sessione in corso. Se il protocollo non ha piu' quel giorno, sul primo: li' la sessione si puo' annullare. */
  riprendiSessione(): void {
    const s = this.sessionState.activeSession();
    if (!s) return;
    const idx = this.workoutData.days.findIndex(d => d.id === s.dayId && (!s.dayLabel || d.label === s.dayLabel));
    this.nav.navigateForward(['/scheda/day', idx >= 0 ? idx : 0]);
  }

  /** Toccare la tab gia' aperta, quando si e' sulla sua radice, riporta in cima: e' il gesto che iOS insegna. */
  alToccoTab(id: string): void {
    if (this.selected() !== id || this.paginaInterna()) return;
    const contenuto = this.host.nativeElement.querySelector<HTMLElement & { scrollToTop?: (ms?: number) => Promise<void> }>(
      'ion-router-outlet > .ion-page:not(.ion-page-hidden):not(.ion-page-invisible) > ion-content'
    );
    void contenuto?.scrollToTop?.(350);
  }

  ngOnInit(): void {
    this.leggiUrl(this.router.url);
    this.routeSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.leggiUrl(e.urlAfterRedirects || e.url));
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  private leggiUrl(url: string): void {
    const u = url.split('?')[0];
    const giorno = u.match(/^\/scheda\/day\/(\d+)$/);
    this.dayIdOnScreen = giorno ? (this.workoutData.days[+giorno[1]]?.id ?? null) : null;
    this.paginaInterna.set(!eRadiceDiTab(u));
    this.paginaGiorno.set(/^\/scheda\/day\/\d+$/.test(u));
  }
}
