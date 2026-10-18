import { AfterViewInit, Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, effect, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { IonTabs, IonTabBar, IonTabButton, NavController } from '@ionic/angular';
import { WorkoutDataService } from '../services/workout-data.service';
import { WorkoutSessionStateService } from '../services/workout-session-state.service';
import { WorkoutStateService } from '../services/workout-state.service';
import { RestBarComponent } from '../components/rest-bar/rest-bar.component';
import { SchermoAccesoService } from '../services/schermo-acceso.service';
import { SegnaleService } from '../services/segnale.service';
import { TrascinaTab } from './trascina-tab';
import { IconaComponent } from '../components/icona/icona.component';
import { NomeIcona } from '../core/icone';

interface Tab { id: string; label: string; icon: NomeIcona; }

/**
 * Le schede, nell'ordine della barra. Su iOS le icone della barra sono piene,
 * come i simboli che iOS mette nelle sue barre delle tab (vedi core/icone.ts).
 */
const TABS: Tab[] = [
  { id: 'scheda', label: 'Scheda', icon: 'barbell' },
  { id: 'dieta', label: 'Dieta', icon: 'restaurant' },
  { id: 'corsa', label: 'Corsa', icon: 'footsteps' },
  { id: 'misure', label: 'Misure', icon: 'body' },
  { id: 'account', label: 'Account', icon: 'person' }
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
 * Il `href` non serve a navigare (la rotta la decide Ionic dal nome della tab e
 * il clic non segue il link): serve a rendere l'<a role="tab"> interno
 * focalizzabile. Senza, la barra non era raggiungibile col Tab: dopo l'ultimo
 * elemento del contenuto il focus usciva dalla pagina.
 *
 * Con una sessione in corso, fuori dalla pagina del suo giorno compare la
 * pillola "In corso · 23:10 · Riprendi": prima, uscendo dal giorno, la
 * sessione spariva dallo schermo e l'unico modo di ritrovarla era ricordarsi
 * quale giorno si stava facendo.
 *
 * Sulla barra si puo' anche scorrere col dito, come su iOS 26: la pastiglia si
 * alza come una lente, segue il dito e alzandolo apre la tab sotto (il gesto e'
 * in trascina-tab.ts). Il contenuto non scorre di lato: cambia di colpo, come
 * nelle app di sistema.
 */
@Component({
  selector: 'app-tabs',
  standalone: true,
  imports: [IonTabs, IonTabBar, IonTabButton, IconaComponent, RestBarComponent],
  template: `
    <ion-tabs (ionTabsDidChange)="tabCambiata($event.tab)">
      <ion-tab-bar slot="bottom" class="tabbar tabbar-5" [class.tabbar-nascosta]="nascondiBarra"
        [class.trascina]="lente() !== null" [style.display]="showRestBar ? 'none' : null">
        <div class="pill" [class]="'pill p' + indiceInVista()"></div>
        @for (t of tabs; track t.id; let i = $index) {
          <ion-tab-button [tab]="t.id" [href]="'/' + t.id" class="tabbtn" [class.active]="indiceInVista() === i"
            [class.sotto-lente]="lente() === i" (click)="alToccoTab(t.id)">
            <span class="ic"><app-icona [name]="t.icon" [size]="23" [piena]="true"></app-icona></span>
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
          <span class="sessionpill-vai">Riprendi <app-icona name="chevron-forward" [size]="14"></app-icona></span>
        </button>
      }
    </ion-tabs>
  `
})
export class TabsPage implements OnInit, AfterViewInit, OnDestroy {
  readonly selected = signal<string>('');
  /** La tab sotto il dito mentre si scorre sulla barra, se si sta scorrendo. */
  readonly lente = signal<number | null>(null);
  /**
   * La tab scelta col dito, finche' Ionic non dice di esserci arrivato: senza,
   * alzato il dito la pastiglia tornerebbe un attimo sulla tab di prima (la
   * navigazione e' asincrona, e la prima volta la pagina va anche caricata).
   */
  private readonly inArrivo = signal<number | null>(null);
  @ViewChild(IonTabs) private ionTabs?: IonTabs;
  private trascina: TrascinaTab | null = null;
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
    private workoutState: WorkoutStateService,
    private host: ElementRef<HTMLElement>,
    private nav: NavController,
    // Non si usa qui: va solo istanziato, e la barra e' sempre in pagina. Da li'
    // in poi tiene lo schermo acceso finche' c'e' un allenamento in corso.
    _schermoAcceso: SchermoAccesoService,
    // Idem: ascolta i tocchi per sbloccare l'audio, e deve esserci dal primo.
    _segnale: SegnaleService
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
    // La fascia del recupero e' fissa sopra il contenuto e piu' alta della
    // barra che sostituisce: il CSS ne tiene conto per portare in vista, col
    // Tab, quello che altrimenti resterebbe sotto. paginaGiorno non serve a
    // niente se non a far rileggere l'effetto quando si entra in un giorno.
    effect(() => {
      this.paginaGiorno();
      document.documentElement.classList.toggle('con-fascia', this.showRestBar);
    });
  }

  readonly tabs = TABS;

  selectedIndex(): number {
    return Math.max(0, this.tabs.findIndex(t => t.id === this.selected()));
  }

  /** Dove sta la pastiglia, e quale tab ha il colore: sotto il dito, poi quella in arrivo, poi quella aperta. */
  indiceInVista(): number {
    return this.lente() ?? this.inArrivo() ?? this.selectedIndex();
  }

  /**
   * Il dito si e' alzato su una tab. Su un'altra la si apre come col tocco;
   * su quella aperta, dopo aver scorso, non succede niente (si e' cambiata
   * idea); premuta a lungo senza muoversi vale come un tocco, e sulla radice
   * riporta in cima.
   */
  scegliColDito(indice: number, scorso: boolean): void {
    const id = this.tabs[indice]?.id;
    if (!id) return;
    if (id === this.selected()) {
      if (!scorso) this.alToccoTab(id);
      return;
    }
    this.inArrivo.set(indice);
    void Promise.resolve(this.ionTabs?.select(id)).finally(() => this.inArrivo.set(null));
  }

  /** Ionic dice che la tab e' cambiata: la pastiglia segue lei. */
  tabCambiata(tab: string): void {
    this.selected.set(tab);
    this.inArrivo.set(null);
  }

  /**
   * Solo sul giorno che si sta ALLENANDO: con una sessione aperta su un altro
   * giorno quella schermata e' in sola lettura, e togliere la navigazione a
   * chi sta solo guardando sarebbe un dispetto.
   *
   * Nello slider c'e' solo mentre il recupero conta: il resto del tempo quel
   * posto e' del tasto della serie ("Fatta", "Torna alla serie"), che la pagina
   * del giorno mette in basso. I due si danno il cambio nello stesso punto.
   * Nell'elenco il tasto sta in ogni card e la fascia resta sempre, come prima.
   */
  get showRestBar(): boolean {
    if (this.dayIdOnScreen === null || !this.sessionState.isActiveForDay(this.dayIdOnScreen)) return false;
    if (this.workoutState.viewMode() !== 'slider') return true;
    const t = this.workoutState.restTimer();
    return !!t.show && !t.finished;
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

  ngAfterViewInit(): void {
    const barra = this.host.nativeElement.querySelector<HTMLElement>('ion-tab-bar');
    if (!barra) return;
    this.trascina = new TrascinaTab(
      barra,
      () => Array.from(barra.querySelectorAll<HTMLElement>('ion-tab-button.tabbtn')),
      () => barra.querySelector<HTMLElement>('.pill'),
      { lente: i => this.lente.set(i), scegli: (i, scorso) => this.scegliColDito(i, scorso) }
    );
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.trascina?.distruggi();
  }

  private leggiUrl(url: string): void {
    const u = url.split('?')[0];
    const giorno = u.match(/^\/scheda\/day\/(\d+)$/);
    this.dayIdOnScreen = giorno ? (this.workoutData.days[+giorno[1]]?.id ?? null) : null;
    this.paginaInterna.set(!eRadiceDiTab(u));
    this.paginaGiorno.set(/^\/scheda\/day\/\d+$/.test(u));
  }
}
