import { AfterViewInit, Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, Optional, ViewChild, effect, signal } from '@angular/core';
import { NumberWheelComponent } from '../../components/number-wheel/number-wheel.component';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { WorkoutDataService } from '../../services/workout-data.service';
import { WorkoutStateService } from '../../services/workout-state.service';
import { AppStateService, WorkoutDraftRow } from '../../services/app-state.service';
import { buildSessionSummary, SessionSummary } from '../../core/utils/session-summary.util';
import { sessionTonnage, formatKg } from '../../core/utils/tonnage.util';
import { WorkoutSessionsService } from '../../services/workout-sessions.service';
import { WorkoutSessionStateService } from '../../services/workout-session-state.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { Day, Exercise, WorkoutSession, ExInsight, ProgramLoad, ClusterSpec, PerformedSetRecord } from '../../models/workout.model';
import {
  normalizeCluster, buildBlocks, buildBlock, canAddBlock, canRemoveBlock, removeLastBlock, currentBlock,
  clusterSetDone, blocksLabel, blocksLoadLabel, clusterLabel, formatClusterRest
} from '../../core/utils/cluster.util';
import { todayLocalISO } from '../../core/utils/date.util';
import { findClosestSlideIndex, scrollToSlide } from '../../core/utils/horizontal-slider.util';
import {
  PerformedSet, oneRepMaxOf, rmTable, MAX_TRUSTED_REPS,
  loadAtPercent, repsAtPercent, numeroSevero
} from '../../core/utils/load-estimate.util';
import {
  AzioneInBasso, OpzioneCarico, UltimaVolta, azioneInBasso, fonteDelCarico, opzioneScelta, opzioniCarico
} from '../../core/utils/carico-serie.util';
import { ToastService } from '../../services/toast.service';
import { RiduciBarra, posizioneDaEvento } from '../../tabs/riduci-barra';
import {
  SerieRow, BlockRow, canAddSet, buildExtraSet, canRemoveSet, removeSetAt, mergeDraftRows, abbinaBozze
} from '../../core/utils/extra-sets.util';

import { ProssimaSerie } from '../../services/workout-state.service';
import { IONIC_PAGE } from '../../core/ionic-page';
import { TastoDirective } from '../../core/tasto.directive';
import { segnala } from '../../core/utils/segnale.util';
import {
  IonFooter, IonModal, NavController, IonSegment, IonSegmentButton, IonSpinner, IonButton, IonRadioGroup, IonRadio, IonItem, IonList, IonLabel
} from '@ionic/angular';
import { IconaComponent } from '../../components/icona/icona.component';

interface ExerciseVM {
  ex: Exercise;
  rows: SerieRow[];
  open: boolean;
  /**
   * La serie su cui si sta lavorando: e' l'unica aperta, con i comandi grandi.
   * Le altre stanno in una riga sola. null quando non ce n'e' nessuna da fare
   * e l'utente non ne ha riaperta una.
   */
  activeRow: number | null;
  insightVisible: boolean;
  insight: ExInsight | null;
  restSeconds: number;
  isFirst: boolean;
  warmup: string | null;
  /** Serie a cluster: la forma di OGNI serie di questo esercizio. null = serie
   *  normali, un blocco per serie. */
  cluster: ClusterSpec | null;
  /** L'ultima seduta in cui l'esercizio c'era: da li' vengono i pesi suggeriti. */
  ultima: UltimaVolta | null;
}

/** Il foglio "Che peso metto" aperto: su quale serie di quale esercizio. */
interface FoglioCarico {
  vm: ExerciseVM;
  /** La serie per cui si sceglie il peso; null se l'esercizio non ne ha una da fare. */
  serie: number | null;
}

@Component({
  selector: 'app-scheda-detail',
  standalone: true,
  imports: [
    IonButton, IonFooter, TastoDirective, IonSegment, IonSegmentButton, IonSpinner, ...IONIC_PAGE, IonModal,
    IonRadioGroup, IonRadio, IonItem, IonList, IonLabel, CommonModule, FormsModule, IconaComponent, NumberWheelComponent
  ],
  templateUrl: './scheda-detail.component.html'
})
export class SchedaDetailComponent implements OnInit, AfterViewInit, OnDestroy {
  day!: Day;
  dayIndex = 0;

  /**
   * Due modi di stare in questa pagina, non due pagine.
   *
   * `sessione` e' l'allenamento: le serie vengono dal protocollo e si
   * registrano mentre si fanno. `storico` e' una seduta gia' salvata, aperta
   * dallo storico: le stesse serie arrivano dal documento e si correggono con
   * gli stessi comandi — le stesse ruote, gli stessi blocchi del cluster, lo
   * stesso "aggiungi una serie". Prima lo storico aveva una schermata sua che
   * ridisegnava tutto in una tabellina di input, e ogni cosa aggiunta qui
   * (cluster, ruote, serie in piu') la lasciava un po' piu' indietro.
   */
  modo: 'sessione' | 'storico' = 'sessione';

  get isStorico(): boolean {
    return this.modo === 'storico';
  }

  /** Il nome del giorno ("Petto e tricipiti"): "Giorno 4" non diceva cosa si allena. */
  get titolo(): string {
    if (this.isStorico) return 'Dettaglio seduta';
    if (!this.day) return 'Allenamento';
    return this.day.label?.trim() || `Giorno ${this.dayIndex + 1}`;
  }

  /** Storico: l'id del documento della seduta aperta. */
  sessionKey = '';
  /** Storico: la seduta com'e' adesso su Firestore. */
  private sedutaSalvata: WorkoutSession | null = null;
  /** Storico: la data della seduta. Cambiarla la sposta, e con lei il suo id. */
  storicoDate = '';
  readonly maxDate = todayLocalISO();
  /** La data della seduta, scritta per chi legge. */
  displayDate = '';
  /** La seduta chiesta non c'e': link vecchio, o seduta cancellata altrove. */
  notFound = false;
  /**
   * Nello storico non esiste un tasto salva: la seduta e' gia' salvata, e ogni
   * correzione si scrive da sola. Questo dice com'e' andata, perche' senza
   * niente a schermo non si saprebbe se la modifica e' arrivata.
   */
  statoSalvataggio: 'fermo' | 'salvo' | 'salvato' | 'errore' = 'fermo';
  /** Quando una correzione non si e' salvata, cosa e' andato storto. Sta
   *  separato da `errorMsg`, che invece significa "la pagina non c'e'". */
  erroreSalvataggio = '';
  /** Dopo ngOnDestroy non si disegna e non si naviga piu': il salvataggio in
   *  volo puo' risolversi quando la pagina non c'e' piu'. */
  private distrutto = false;
  exercises: ExerciseVM[] = [];
  loading = true;
  errorMsg = '';
  private draftTimer: ReturnType<typeof setTimeout> | null = null;
  private paramSub: Subscription | null = null;

  // Guardia contro `loadAll()` sovrapposte: cambiare giorno rapidamente puo'
  // lasciare "in volo" piu' fetch contemporaneamente. Solo la generazione
  // avviata per ultima ha il permesso di scrivere lo stato del componente
  // (stesso pattern di `mutationCount` in workout-session-state.service.ts).
  private loadGeneration = 0;
  /** Le sedute gia' salvate di questo giorno, dalla piu' vecchia: servono ai
   *  suggerimenti e, a fine allenamento, al confronto del riepilogo. */
  private daySessions: WorkoutSession[] = [];
  /** Il resoconto dell'allenamento appena chiuso. Finche' e' null si sta
   *  ancora allenando; quando c'e', la pagina mostra lui. */
  summary: SessionSummary | null = null;

  restModalOpen = false;
  restModalVm: ExerciseVM | null = null;
  restModalValue = 90;

  sliderIndex = 0;
  private scrollTicking = false;

  @ViewChild('sliderEl') sliderEl?: ElementRef<HTMLDivElement>;
  @ViewChild('contenuto', { read: ElementRef }) private contenuto?: ElementRef<HTMLElement>;

  /**
   * La barra in basso ("Inizia allenamento", "Fatta") si comporta come la
   * barra delle tab: scorrendo in giu' la pagina si fa un poco piu' piccola, e
   * torna intera scorrendo in su, in cima, cambiando esercizio o quando torna
   * dopo il recupero. La decisione e' la stessa (riduci-barra.ts).
   */
  readonly barraRidotta = signal(false);
  private readonly riduci = new RiduciBarra(r => this.barraRidotta.set(r));
  /** La tastiera dell'app nativa e' aperta: la barra in basso se ne va, come fa Ionic con la barra delle tab. */
  readonly tastieraAperta = signal(false);
  private alloScorrere = (e: Event): void => {
    const p = posizioneDaEvento(e);
    if (p) this.riduci.scorri(p.pagina, p.y, p.max);
  };
  private tastieraSu = (): void => this.tastieraAperta.set(true);
  private tastieraGiu = (): void => this.tastieraAperta.set(false);

  constructor(
    private route: ActivatedRoute,
    private nav: NavController,
    public workoutData: WorkoutDataService,
    public state: WorkoutStateService,
    private appState: AppStateService,
    private sessions: WorkoutSessionsService,
    private confirm: ConfirmDialogService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
    public sessionState: WorkoutSessionStateService,
    // Facoltativo: serve solo a portare in vista l'esercizio dopo, e gli spec che
    // costruiscono il componente a mano non lo passano.
    @Optional() private host: ElementRef<HTMLElement> | null = null
  ) {
    // Il toggle sta nella testata, ma la preferenza e' condivisa con lo
    // storico: quando si passa a "slider", riparte sempre dalla prima card.
    effect(() => {
      if (this.state.viewMode() === 'slider') {
        this.sliderIndex = 0;
        this.barraRidotta.set(false);
        setTimeout(() => this.scrollToIndex(0), 0);
      }
    });
    // Nello slider la fascia del recupero e il tasto in basso si danno il cambio
    // nello stesso posto. Finito o fermato il recupero la fascia sparisce: se il
    // focus era li' (la X, da tastiera) non deve restare sul vuoto, torna sul tasto.
    let inCorsaPrima = false;
    effect(() => {
      const t = this.state.restTimer();
      const inCorsa = !!t.show && !t.finished;
      // Il tasto torna dopo il recupero intero, come la barra delle tab cambiando tab.
      if (inCorsa) this.barraRidotta.set(false);
      if (inCorsaPrima && !inCorsa && typeof document !== 'undefined') {
        const a = document.activeElement;
        if (!a || a === document.body || a.closest?.('app-rest-bar')) this.portaFocus('ion-footer.salva-footer ion-button');
      }
      inCorsaPrima = inCorsa;
    });
  }

  ngOnInit(): void {
    // La modalita' arriva dalla rotta (data.modo), non da un parametro: e' la
    // rotta a sapere se si sta aprendo un allenamento o una seduta salvata.
    this.modo = this.route.snapshot.data?.['modo'] === 'storico' ? 'storico' : 'sessione';
    if (this.isStorico) { this.initStorico(); return; }

    this.paramSub = this.route.paramMap.subscribe(params => {
      const n = parseInt(params.get('n') ?? '0', 10);
      // Una bozza in attesa appartiene al giorno che si sta lasciando: va
      // annullata PRIMA di sostituire `this.day`, altrimenti scriverebbe
      // sotto la chiave del giorno sbagliato.
      if (this.draftTimer) { clearTimeout(this.draftTimer); this.draftTimer = null; }

      this.dayIndex = n;
      this.day = this.workoutData.days[n];
      if (!this.day) { this.nav.navigateBack(['/scheda']); return; }

      // Come nell'effect() del costruttore quando si passa a modalita' slider:
      // azzerare solo l'indice (i puntini) non basta, va riportato all'inizio
      // anche lo scroll fisico del contenitore, dopo che si e' ridisegnato
      // con gli esercizi del nuovo giorno (da cui il setTimeout(..., 0)).
      this.sliderIndex = 0;
      this.barraRidotta.set(false);
      setTimeout(() => this.scrollToIndex(0), 0);
      // Il bottom sheet "Recupero" appartiene al giorno che si sta lasciando:
      // se resta aperto mostra l'esercizio sbagliato sotto la pagina nuova.
      this.closeRestModal();
      this.restModalVm = null;
      this.stopPause();
      // La fascia del recupero si vede solo dentro l'allenamento in corso: un
      // timer partito su un altro giorno resterebbe acceso senza essere
      // disegnato da nessuna parte, e senza modo di fermarlo.
      const timer = this.state.restTimer();
      if (timer.show && timer.dayId !== this.day.id) this.state.stopRestTimer();
      this.state.prossimaSerie.set(null);
      this.loadAll();
    });
  }

  /**
   * Lo storico ha un parametro solo, la chiave della seduta. Cambia quando si
   * sposta la seduta di data (l'id porta la data dentro): la pagina si
   * ricarica dal documento nuovo invece di tenere in memoria il vecchio.
   */
  private initStorico(): void {
    this.paramSub = this.route.paramMap.subscribe(params => {
      // Un salvataggio in attesa appartiene alla seduta che si sta lasciando.
      if (this.draftTimer) { clearTimeout(this.draftTimer); this.draftTimer = null; }
      this.sessionKey = decodeURIComponent(params.get('key') ?? '');
      this.statoSalvataggio = 'fermo';
      this.sliderIndex = 0;
      setTimeout(() => this.scrollToIndex(0), 0);
      this.closeRestModal();
      this.restModalVm = null;
      this.stopPause();
      this.loadStorico();
    });
  }

  /** La seduta salvata, letta dal documento e messa nella stessa forma che
   *  usa l'allenamento: da qui in poi la pagina non sa piu' da dove viene. */
  private async loadStorico(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loading = true;
    this.errorMsg = '';
    this.notFound = false;

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      const seduta = await Promise.race([this.sessions.get(this.sessionKey), timeout]);
      if (generation !== this.loadGeneration) return;
      if (!seduta) { this.notFound = true; return; }

      this.sedutaSalvata = seduta;
      this.storicoDate = seduta.date;
      this.setDisplayDate(seduta.date);
      this.day = this.giornoDaSeduta(seduta);
      this.buildExercisesFromSession(seduta);
    } catch (e: any) {
      if (generation !== this.loadGeneration) return;
      console.error('Errore caricamento seduta:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Controlla la rete e riprova.'
        : 'Errore nel caricamento della seduta. Riprova.';
    } finally {
      if (generation === this.loadGeneration) this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Il giorno di una seduta salvata. Gli esercizi li detta la seduta - sono
   * quelli che hai fatto, nell'ordine in cui li hai fatti - e il protocollo ci
   * mette quello che la seduta non registra: muscolo, note, forma del cluster.
   * Un esercizio che il protocollo non ha piu' resta comunque leggibile.
   */
  private giornoDaSeduta(seduta: WorkoutSession): Day {
    const protocollo = this.workoutData.days.find(d => d.id === seduta.dayId);
    return {
      id: seduta.dayId,
      label: seduta.dayLabel || protocollo?.label || 'Seduta',
      rec: protocollo?.rec ?? '',
      ex: seduta.exercises.map(e =>
        protocollo?.ex.find(p => p.name === e.name)
        ?? { name: e.name, scheme: 'plain' as const, sets: e.sets.length, muscle: '' }
      )
    };
  }

  /** Le serie di una seduta salvata, nella stessa forma che usa l'allenamento. */
  private buildExercisesFromSession(seduta: WorkoutSession): void {
    this.exercises = this.day.ex.map((ex, exIdx) => {
      const salvate = seduta.exercises[exIdx]?.sets ?? [];
      // La forma del cluster viene dal protocollo. Se il protocollo e'
      // cambiato (o l'esercizio non c'e' piu') la si ricava dai blocchi
      // salvati, altrimenti i blocchi resterebbero a schermo senza comandi.
      const cluster = normalizeCluster(ex.cluster) ?? this.clusterDaiBlocchi(salvate);
      const rows: SerieRow[] = salvate.map(s => {
        const blocks = cluster && s.blocks?.length
          ? s.blocks.map(b => ({
              reps: b.reps ?? '', load: b.load ?? '',
              ripPlaceholder: '', loadPlaceholder: '', done: b.done
            }))
          : undefined;
        return {
          // Su una serie a cluster questi due sono il riassunto dei blocchi
          // ("5+5+3", "62,5-55"): si riscrivono da soli quando la serie si
          // chiude, e intanto sono quello che si legge nella riga chiusa.
          reps: s.reps ?? '',
          load: s.load ?? '',
          done: s.done,
          // Nello storico non ci sono suggerimenti: quello che c'e' scritto
          // e' quello che hai fatto, non quello che potresti fare.
          ripPlaceholder: '',
          loadPlaceholder: '',
          // Una serie salvata e' lavoro registrato e resta dov'e'; si toglie
          // solo quella aggiunta adesso, come nell'allenamento.
          extra: false,
          ...(blocks ? { blocks } : {})
        };
      });
      return {
        ex, rows, open: true,
        // Una seduta salvata prima si legge: le righe stanno chiuse, con
        // dentro il loro "10 x 80 kg", e si apre quella da correggere.
        activeRow: null,
        insightVisible: false, insight: null,
        restSeconds: 0, isFirst: exIdx === 0, warmup: null, cluster, ultima: null
      };
    });
  }

  /** La forma del cluster ricavata da com'e' stato fatto, quando il
   *  protocollo non la dice piu'. */
  private clusterDaiBlocchi(sets: readonly PerformedSetRecord[]): ClusterSpec | null {
    const conBlocchi = sets.find(s => (s.blocks?.length ?? 0) > 0);
    if (!conBlocchi) return null;
    return normalizeCluster({
      blocks: conBlocchi.blocks!.map(b => Number(b.reps)),
      end: 'fixed'
    });
  }

  private setDisplayDate(isoDate: string): void {
    const d = new Date(isoDate + 'T00:00:00');
    this.displayDate = isNaN(d.getTime()) ? '' : d.toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
  }

  // Aspetta bozze/override/insight da Firestore prima di mostrare le card,
  // cosi' non compaiono prima con dati incompleti (peso pre-compilato,
  // "Ultimo", suggerimento di progressione) e poi si aggiornano di scatto.
  async loadAll(): Promise<void> {
    // "Riprova" e' lo stesso bottone nelle due modalita'.
    if (this.isStorico) { await this.loadStorico(); return; }
    // Guardia contro `loadAll()` sovrapposte (vedi `loadGeneration`): la
    // fetch cattura il giorno di QUESTA esecuzione, non quello che risultera'
    // corrente quando la Promise si risolve.
    const generation = ++this.loadGeneration;
    const dayId = this.day.id;

    this.loading = true;
    this.errorMsg = '';

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      const [appState, daySessions] = await Promise.race([
        Promise.all([this.appState.load(), this.sessions.listForDay(dayId)]),
        timeout
      ]);
      // Un caricamento piu' recente e' partito prima che questo si risolvesse:
      // i suoi dati sono superati e non vanno applicati allo stato corrente.
      if (generation !== this.loadGeneration) return;
      this.percentualeProgramma = appState.loadPercent;
      this.buildExercises(appState.restOverrides);
      this.loadDraft(appState.workoutDrafts[dayId]);
      this.daySessions = daySessions.map(d => d.session);
      this.loadInsights(daySessions);
      this.exercises.forEach(vm => this.syncActiveRow(vm));
      this.pubblicaProssima();
    } catch (e: any) {
      if (generation !== this.loadGeneration) return;
      console.error('Errore caricamento scheda:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Controlla la rete e riprova.'
        : 'Errore nel caricamento della scheda. Riprova.';
    } finally {
      // Solo il caricamento corrente puo' spegnere `loading`: se lo facesse
      // anche uno superato, la pagina si mostrerebbe come pronta mentre la
      // fetch del giorno visualizzato e' ancora in volo. Non resta bloccato a
      // `true`: il caricamento vincente passa comunque da qui.
      if (generation === this.loadGeneration) this.loading = false;
      this.cdr.detectChanges();
    }
  }

  /**
   * Lo scorrimento si ascolta a mano, come nella barra delle tab: con un
   * (ionScroll) nel template ogni fotogramma rifarebbe il controllo della
   * vista, mentre il signal ridisegna solo quando la barra cambia davvero. La
   * tastiera la dicono gli eventi di Capacitor, gli stessi che ascolta Ionic:
   * nel browser non arrivano, e la barra resta.
   */
  ngAfterViewInit(): void {
    this.contenuto?.nativeElement.addEventListener('ionScroll', this.alloScorrere);
    if (typeof window === 'undefined') return;
    window.addEventListener('keyboardWillShow', this.tastieraSu);
    window.addEventListener('keyboardWillHide', this.tastieraGiu);
  }

  ngOnDestroy(): void {
    this.contenuto?.nativeElement.removeEventListener('ionScroll', this.alloScorrere);
    if (typeof window !== 'undefined') {
      window.removeEventListener('keyboardWillShow', this.tastieraSu);
      window.removeEventListener('keyboardWillHide', this.tastieraGiu);
    }
    // La fascia vive fuori da questa pagina: lasciata li' dopo l'uscita direbbe una
    // serie che non e' piu' sotto gli occhi.
    this.state.prossimaSerie.set(null);
    if (this.avanzaTimer) { clearTimeout(this.avanzaTimer); this.avanzaTimer = null; }
    this.paramSub?.unsubscribe();
    this.stopPause();
    if (this.draftTimer) {
      clearTimeout(this.draftTimer);
      this.draftTimer = null;
      // Uscire dalla pagina non e' annullare: nello storico la correzione in
      // attesa si scrive subito, altrimenti mezzo secondo di ritardo la
      // perderebbe senza dire niente. La bozza dell'allenamento no: quella
      // riparte da sola alla prossima apertura del giorno.
      if (this.isStorico) void this.salvaSeduta();
    }
    this.distrutto = true;
  }

  private buildExercises(restOverrides: Record<string, number>): void {
    const week = this.state.currentWeek;
    const protocolDefault = this.parseRecSeconds(this.day.rec);
    this.exercises = this.day.ex.map((ex, exIdx) => {
      const { sets, reps } = this.workoutData.getExSetsReps(ex, week);
      // Il cluster arriva da Firestore come tutto il resto del protocollo:
      // quello che non si riesce a leggere non diventa un cluster rotto,
      // diventa una serie normale.
      const cluster = normalizeCluster(ex.cluster);
      const rows: SerieRow[] = Array.from({ length: sets }, (_, i) => ({
        // In una serie a cluster le ripetizioni non sono un numero ma una
        // forma ("8+8"): il numero sta nei blocchi, uno per uno.
        reps: cluster ? '' : String(reps[i] ?? ''),
        load: '',
        done: false,
        ripPlaceholder: cluster ? clusterLabel(cluster) : String(reps[i] ?? ''),
        loadPlaceholder: '',
        // Viene dal piano del coach: e' quello che la distingue da una serie
        // aggiunta a mano, che invece si puo' togliere.
        extra: false,
        ...(cluster ? { blocks: buildBlocks(cluster) } : {})
      }));
      const override = restOverrides[this.restKey(ex.name)];
      const restSeconds = override && override > 0 ? override : protocolDefault;
      return { ex, rows, open: true, activeRow: 0, insightVisible: false, insight: null, restSeconds, isFirst: exIdx === 0, warmup: null, cluster, ultima: null };
    });
  }

  /** Converte la stringa del protocollo (es. "60-90" oppure "90") nel numero di secondi di default. */
  private parseRecSeconds(rec: string | undefined): number {
    if (!rec) return 90;
    const nums = (rec.match(/\d+/g) ?? []).map(n => parseInt(n, 10));
    if (nums.length === 0) return 90;
    if (nums.length === 1) return nums[0];
    return Math.round((nums[0] + nums[1]) / 2);
  }

  /** Chiave stabile dell'esercizio nel giorno, per l'override del recupero
   *  salvato sull'account. */
  restKey(exName: string): string {
    return `${this.day.id}:${exName}`;
  }

  private loadDraft(draft: { rows: WorkoutDraftRow[]; name?: string }[] | undefined): void {
    if (!draft) return;
    // Per nome e non per posizione: nel builder gli esercizi si riordinano.
    abbinaBozze(this.exercises.map(vm => vm.ex.name), draft).forEach((righe, i) => {
      const vm = this.exercises[i];
      if (righe && vm) vm.rows = mergeDraftRows(vm.rows, righe);
    });
  }

  /** Oltre queste ripetizioni il numero va preso con le pinze. */
  readonly rmSoftOver = MAX_TRUSTED_REPS;

  /** La percentuale del massimale scelta per tutto il programma, o null se
   *  spenta. Arriva dall'account, quindi vale su ogni giorno e ogni esercizio. */
  private percentualeProgramma: number | null = null;

  /** "24/09" da una data ISO, o stringa vuota se la data non c'e'. */
  private giornoMese(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  /** I chili come si scrivono qui: virgola decimale, e niente ",0" inutile. */
  kg(n: number): string {
    return n.toLocaleString('it-IT', { maximumFractionDigits: 1 });
  }

  /**
   * Il peso alla percentuale scelta per il programma, con le ripetizioni che a
   * quella percentuale escono davvero.
   *
   * Non tocca il campo del peso: li' resta il suggerimento dell'ultima volta,
   * che e' quello che hai davvero sollevato. Questa e' un'indicazione da
   * leggere accanto, perche' una percentuale fissa su un protocollo dove le
   * ripetizioni cambiano di settimana in settimana non puo' decidere al posto
   * tuo - puo' solo dirti dove ti porta.
   */
  private caricoDiProgramma(oneRm: number): ProgramLoad | null {
    const p = this.percentualeProgramma;
    if (!p || oneRm <= 0) return null;
    const load = loadAtPercent(oneRm, p);
    if (load <= 0) return null;
    return { percent: p, load, reps: repsAtPercent(p) };
  }

  private loadInsights(daySessions: { id: string; session: WorkoutSession }[]): void {
    if (daySessions.length === 0) return;
    const sessions = daySessions.map(s => s.session);

    this.exercises.forEach((vm) => {
      const exName = vm.ex.name;

      // Collect max loads per session for this exercise
      const maxLoads: number[] = [];
      let lastSessionData: { load: string | null; reps: string | null; blocks?: { load: string | null }[] }[] = [];
      let lastSessionDate = '';
      /** Carico e ripetizioni della stessa serie vanno tenuti insieme: e' la
       *  coppia, non il solo carico, a dire quanto e' stato faticoso. Divise
       *  per sessione, perche' il massimale parla dell'ultima volta e non di
       *  tutta la storia. */
      const perSessione: { data: string; sets: PerformedSet[] }[] = [];

      sessions.forEach(s => {
        const sexData = s.exercises.find(e => e.name === exName);
        if (!sexData) return;
        const loads = sexData.sets.map(sr => parseFloat(sr.load ?? '') || 0);
        const maxLoad = Math.max(...loads.filter(l => l > 0));
        if (maxLoad > 0) maxLoads.push(maxLoad);
        const diQuesta: PerformedSet[] = [];
        sexData.sets.forEach(sr => {
          // Le serie a cluster restano fuori. Il loro carico e le loro
          // ripetizioni sono riassunti scritti per essere letti ("5+5+3",
          // "62,5-55"), non numeri, e un cluster non e' comunque una serie
          // dritta - fra un blocco e l'altro c'e' una pausa - quindi nessuna
          // di queste formule lo sa leggere.
          if (sr.blocks?.length) return;
          // E si leggono solo i numeri interi e puliti. Non basta fidarsi dei
          // blocchi: una seduta vecchia, o salvata a meta', puo' avere il
          // riassunto senza di loro, e parseFloat da "5+5+3" cava 5 senza
          // battere ciglio - un numero che sembra una serie vera e non lo e'.
          const load = numeroSevero(sr.load);
          const reps = numeroSevero(sr.reps);
          if (load !== null && reps !== null) diQuesta.push({ load, reps });
        });
        if (diQuesta.length > 0) perSessione.push({ data: s.date, sets: diQuesta });
        lastSessionData = sexData.sets.map(sr => ({
          load: sr.load, reps: sr.reps,
          blocks: sr.blocks?.map(b => ({ load: b.load }))
        }));
        lastSessionDate = s.date;
      });

      // Da dove vengono i pesi suggeriti: serve alla riga "come il 03/10" e
      // alla prima scelta del foglio. Un cluster ha il peso nei blocchi, non
      // nella serie: li' l'ultima volta resta fuori.
      const dataUltima = this.giornoMese(lastSessionDate);
      if (lastSessionData.length > 0 && dataUltima) {
        vm.ultima = {
          data: dataUltima,
          serie: lastSessionData.map(sr => ({ load: sr.blocks?.length ? null : sr.load, reps: sr.reps }))
        };
      }

      // Set load placeholder from last session
      if (lastSessionData.length > 0) {
        lastSessionData.forEach((sr, j) => {
          const row = vm.rows[j];
          if (!row) return;
          if (sr.load) row.loadPlaceholder = sr.load;
          // In un cluster il peso e' del blocco: il suggerimento va preso dal
          // blocco corrispondente della volta scorsa, non dal riassunto della
          // serie, che puo' essere un intervallo ("62,5-55").
          if (row.blocks && sr.blocks) {
            row.blocks.forEach((b, k) => {
              const prima = sr.blocks?.[k]?.load;
              if (prima) b.loadPlaceholder = prima;
            });
          }
        });
      }

      const lastSession = sessions[sessions.length - 1];
      const lastEx = lastSession?.exercises.find(e => e.name === exName);
      let lastText = '';
      if (lastEx && lastSession) {
        const dd = this.giornoMese(lastSession.date);
        const maxLoad = Math.max(...lastEx.sets.map(s => parseFloat(s.load ?? '') || 0).filter(l => l > 0));
        lastText = dd ? `Ultimo (${dd}): ${maxLoad > 0 ? maxLoad + ' kg' : '—'}` : '';
      }

      // Il massimale stimato dall'ultima volta che l'esercizio e' stato fatto.
      // Non e' una misura: e' quello che la formula ricava dalla serie migliore
      // di quella sessione, e vale quanto vale la serie da cui viene - per
      // questo si mostra anche quella. Il confronto con la sessione prima e'
      // la parte che si guarda davvero: dice se si sta salendo.
      let oneRmText: string | null = null;
      let oneRm: ExInsight['oneRm'] = null;
      const ultima = perSessione[perSessione.length - 1];
      // Su un esercizio a cluster non si stima niente, nemmeno quando una
      // coppia pulita si trova: quella coppia non descrive il lavoro che si
      // sta facendo. Un "5 ripetizioni, 30 secondi, a esaurimento" non ha un
      // massimale da cui dedurre il carico di oggi, e un numero inventato li'
      // in mezzo si legge come se lo avesse - l'ultima volta, invece, e' un
      // fatto, e resta.
      const stima = ultima && !vm.cluster ? oneRepMaxOf(ultima.sets) : null;
      if (stima) {
        const quando = this.giornoMese(ultima.data);
        oneRmText = `Dal massimale stimato di <b>${this.kg(stima.value)} kg</b>`
          + ` · ${this.kg(stima.from.load)} × ${stima.from.reps}`
          + (quando ? ` del ${quando}` : '');

        const precedente = perSessione[perSessione.length - 2];
        const prima = precedente ? oneRepMaxOf(precedente.sets) : null;
        let delta: number | null = null;
        if (prima) {
          delta = Math.round((stima.value - prima.value) * 2) / 2;
          if (delta !== 0) oneRmText += ` · ${delta > 0 ? '+' : '−'}${this.kg(Math.abs(delta))} kg`;
        }
        oneRm = { value: stima.value, load: stima.from.load, reps: stima.from.reps, data: quando, delta: delta || null };
      }

      // L'ultima volta si scrive solo se non c'e' la stima: quando c'e', la
      // riga da cui nasce dice gia' peso e data, e ripeterli costa una riga
      // in cima a ogni esercizio.
      if (oneRmText) lastText = '';

      if (lastText || oneRmText) {
        vm.insight = {
          lastText, oneRmText, oneRm,
          rmRows: stima ? rmTable(stima.value) : null,
          programLoad: this.caricoDiProgramma(stima?.value ?? 0)
        };
        vm.insightVisible = true;
      }

      if (vm.isFirst && maxLoads.length > 0) {
        const lastMax = maxLoads[maxLoads.length - 1];
        const baseReps = parseInt(vm.rows[0]?.ripPlaceholder ?? '', 10);
        if (!isNaN(baseReps)) {
          const round5 = (kg: number) => Math.round(kg / 5) * 5;
          const w1 = round5(lastMax * 0.4);
          const w2 = round5(lastMax * 0.6);
          const w3 = round5(lastMax * 0.8);
          const r1 = Math.round(baseReps * 0.4);
          const r2 = Math.round(baseReps * 0.6);
          const r3 = Math.round(baseReps * 0.8);
          vm.warmup = `Riscaldamento: <b>${w1} kg</b> x${r1}, <b>${w2} kg</b> x${r2}, <b>${w3} kg</b> x${r3}`;
        }
      }
    });
  }

  toggleEx(vm: ExerciseVM): void {
    vm.open = !vm.open;
  }

  onSliderScroll(): void {
    if (this.scrollTicking) return;
    this.scrollTicking = true;
    requestAnimationFrame(() => {
      this.scrollTicking = false;
      const el = this.sliderEl?.nativeElement;
      if (!el) return;
      const closest = findClosestSlideIndex(el);
      if (closest !== this.sliderIndex) {
        this.sliderIndex = closest;
        // Cambiando esercizio la barra in basso torna intera, come cambiando tab.
        this.barraRidotta.set(false);
        this.cdr.detectChanges();
      }
    });
  }

  scrollToIndex(idx: number): void {
    scrollToSlide(this.sliderEl?.nativeElement, idx);
  }

  /**
   * Quante slide ha lo slider. Gli esercizi piu' la chiusura, che e' l'ultima
   * card quando la sessione e' su questo giorno: serve ai trattini, che
   * altrimenti sparirebbero su un allenamento di un esercizio solo.
   */
  get slideCount(): number {
    return this.exercises.length + (this.isSessionOnThisDay ? 1 : 0);
  }

  onSetCheck(vm: ExerciseVM, rowIdx: number): void {
    // La spunta e' un div, non un <button>: "disabilitato" non esiste per lui e
    // il click arriva comunque. Il controllo vero sta qui.
    if (this.setsLocked) return;
    const row = vm.rows[rowIdx];
    row.done = !row.done;
    this.ultimoEsercizio = this.exercises.indexOf(vm);

    // Spuntare la serie e' il momento in cui i suggerimenti diventano valori
    // veri: il carico dell'ultima volta e le ripetizioni del protocollo entrano
    // nei campi e finiscono nello storico. Vale solo qui, perche' una serie non
    // spuntata non e' stata fatta e non deve portarsi dietro un carico. Solo i
    // campi vuoti: quello che hai digitato non si tocca.
    if (row.done) {
      if (!row.reps && row.ripPlaceholder) row.reps = row.ripPlaceholder;
      if (!row.load && row.loadPlaceholder) row.load = row.loadPlaceholder;
    }

    this.scheduleDraft();
    // Il recupero appartiene all'allenamento in corso: nello storico la
    // spunta e' una correzione, e la fascia col timer non ha senso.
    if (row.done && !this.isStorico) {
      this.state.startRestTimer(vm.restSeconds, vm.ex.name, this.day.id);
      // Un colpo leggero: dice che la serie e' entrata, senza guardare lo schermo.
      segnala('serie');
    }
  }

  // ---- La serie corrente ----

  /**
   * Porta la riga aperta sulla prima ancora da fare. Chiamata dopo ogni
   * cambiamento: se l'utente aveva aperto una riga gia' spuntata per
   * correggerla, quella resta dov'e' finche' non la chiude lui.
   */
  private syncActiveRow(vm: ExerciseVM): void {
    // Nello storico non esiste una "prossima serie da fare": si apre una riga
    // per correggerla, e chiusa quella non se ne apre un'altra da sola.
    if (this.isStorico) { vm.activeRow = null; return; }
    const next = vm.rows.findIndex(r => !r.done);
    vm.activeRow = next === -1 ? null : next;
  }

  /** Apre una riga per lavorarci: e' l'unica che mostra i comandi. */
  setActive(vm: ExerciseVM, rowIdx: number): void {
    if (this.setsLocked) return;
    vm.activeRow = vm.activeRow === rowIdx ? null : rowIdx;
  }

  /**
   * Il valore su cui si muovono i tasti: quello digitato, oppure il
   * suggerimento. Senza questo, il primo tocco di "+" partirebbe da zero e
   * butterebbe via il carico proposto.
   */
  private write(n: number): string {
    return (Math.round(n * 100) / 100).toString().replace('.', ',');
  }

  /** Il numero dentro un campo, o null se non c'e'. La ruota vuole numeri,
   *  la riga li tiene come testo perche' e' cosi' che si salvano. */
  numero(raw: string | null | undefined): number | null {
    if (!raw) return null;
    const n = parseFloat(raw.replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  setLoad(vm: ExerciseVM, rowIdx: number, v: number): void {
    if (this.setsLocked) return;
    vm.rows[rowIdx].load = this.write(v);
    this.scheduleDraft();
  }

  setReps(vm: ExerciseVM, rowIdx: number, v: number): void {
    if (this.setsLocked) return;
    vm.rows[rowIdx].reps = this.write(v);
    this.scheduleDraft();
  }

  /** Chiude la serie aperta e passa alla prossima da fare. */
  confirmSet(vm: ExerciseVM, rowIdx: number): void {
    if (this.setsLocked || vm.rows[rowIdx].done) return;
    this.onSetCheck(vm, rowIdx);
    this.syncActiveRow(vm);
    this.avanzaSeFinito(vm);
  }

  // ---- Dopo l'ultima serie ----
  //
  // Finito un esercizio la pagina porta da sola al successivo (o alla chiusura,
  // dopo l'ultimo). In piedi, con le mani sporche, scorrere due schermate per
  // trovare la prossima serie era la parte piu' lenta dell'allenamento.

  private avanzaTimer: ReturnType<typeof setTimeout> | null = null;

  private esercizioFinito(vm: ExerciseVM): boolean {
    return vm.rows.length > 0 && vm.rows.every(r => r.done);
  }

  private avanzaSeFinito(vm: ExerciseVM): void {
    if (this.isStorico || !this.esercizioFinito(vm)) return;
    const i = this.exercises.indexOf(vm);
    if (i < 0) return;
    if (this.avanzaTimer) clearTimeout(this.avanzaTimer);
    // Un respiro, il tempo di vedere la spunta e l'anello che si chiude.
    this.avanzaTimer = setTimeout(() => {
      this.avanzaTimer = null;
      // Nel frattempo si puo' aver tolto la spunta, o aver lasciato la pagina.
      if (this.distrutto || !this.esercizioFinito(vm)) return;
      this.vaAllaSlide(i + 1);
    }, 450);
  }

  /** Porta in vista l'esercizio i-esimo, o la chiusura se i e' oltre l'ultimo. */
  vaAllaSlide(i: number): void {
    if (this.state.viewMode() === 'slider') { this.scrollToIndex(i); return; }
    const radice = this.host?.nativeElement;
    const el = i < this.exercises.length
      ? radice?.querySelectorAll<HTMLElement>('.exlist > .ex')[i]
      : radice?.querySelector<HTMLElement>('.closing');
    el?.scrollIntoView({ behavior: this.movimentoRidotto() ? 'auto' : 'smooth', block: 'start' });
  }

  private movimentoRidotto(): boolean {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** Toglie la spunta e riapre quella riga: e' li' che si sta correggendo. */
  undoSet(vm: ExerciseVM, rowIdx: number): void {
    if (this.setsLocked || !vm.rows[rowIdx].done) return;
    this.onSetCheck(vm, rowIdx);
    vm.activeRow = rowIdx;
  }

  // ---- Le serie a cluster ----
  //
  // Una serie a cluster e' UNA serie spezzata in blocchi, con una pausa breve
  // dentro. Resta una serie in tutti i conti: il contatore dell'esercizio, la
  // card di chiusura e il confronto col piano parlano di serie, non di blocchi.

  /** La pausa dentro la serie: quale blocco l'ha fatta partire e da quando. */
  private pauseFrom: number | null = null;
  private pauseKey = '';
  private pauseTicker: ReturnType<typeof setInterval> | null = null;

  /** Secondi passati dall'inizio della pausa. E' un signal perche' la pagina
   *  e' zoneless: un campo mutato dentro setInterval non ridisegnerebbe nulla. */
  readonly pauseElapsed = signal(0);

  isCluster(vm: ExerciseVM, row: SerieRow): boolean {
    return !!vm.cluster && !!row.blocks;
  }

  blockIndex(row: SerieRow): number {
    return currentBlock(row.blocks ?? []);
  }

  /** Il blocco su cui si sta lavorando, o null se sono tutti fatti. */
  block(row: SerieRow): BlockRow | null {
    const i = this.blockIndex(row);
    return i === -1 ? null : (row.blocks ?? [])[i];
  }

  blockLabel(vm: ExerciseVM, row: SerieRow): string {
    const i = this.blockIndex(row);
    if (i === -1) return 'Serie finita';
    // A esaurimento non esiste un "di quanti": e' il punto.
    return vm.cluster?.end === 'open'
      ? `Blocco ${i + 1}`
      : `Blocco ${i + 1} di ${(row.blocks ?? []).length}`;
  }

  clusterHint(vm: ExerciseVM): string {
    if (!vm.cluster) return '';
    return vm.cluster.end === 'open'
      ? 'a esaurimento'
      : `${formatClusterRest(vm.cluster.restSec)} dentro`;
  }

  /** Quello che si e' fatto finora nella serie: "8+8", "5+5+3". */
  clusterDone(row: SerieRow): string {
    return blocksLabel(row.blocks ?? []);
  }

  // --- La pausa dentro la serie ---

  private pauseId(vm: ExerciseVM, rowIdx: number): string {
    return `${vm.ex.name}#${rowIdx}`;
  }

  isPausing(vm: ExerciseVM, rowIdx: number): boolean {
    return this.pauseFrom !== null && this.pauseKey === this.pauseId(vm, rowIdx);
  }

  /**
   * Quanto manca alla fine della pausa. Arrivato a zero si ferma li'.
   *
   * La pausa del coach resta un MINIMO, e il telefono non dice "tempo
   * scaduto": lo dice la scritta sotto, "pausa passata, quando vuoi". Ma a
   * dirlo basta quella - un numero che continua a salire chiede di essere
   * guardato, e durante un cluster si guarda il bilanciere.
   */
  pauseText(vm: ExerciseVM): string {
    const resta = (vm.cluster?.restSec ?? 0) - this.pauseElapsed();
    return this.formatDuration(Math.max(0, resta));
  }

  pauseOver(vm: ExerciseVM): boolean {
    return this.pauseElapsed() >= (vm.cluster?.restSec ?? 0);
  }

  private startPause(vm: ExerciseVM, rowIdx: number): void {
    // La pausa dentro la serie si misura mentre la serie si fa. Nello storico
    // la serie e' finita da giorni: correggere un blocco non fa partire
    // nessun conto alla rovescia.
    if (this.isStorico) return;
    this.stopPause();
    this.pauseFrom = Date.now();
    this.pauseKey = this.pauseId(vm, rowIdx);
    this.pauseElapsed.set(0);
    const minimo = vm.cluster?.restSec ?? 0;
    this.pauseTicker = setInterval(() => {
      if (this.pauseFrom === null) return;
      const passati = Math.floor((Date.now() - this.pauseFrom) / 1000);
      if (passati >= minimo) {
        // Arrivato a zero il conto si ferma, e con lui il ticker: da qui in
        // poi non c'e' piu' niente da contare, e un intervallo che continua a
        // girare per il resto della serie e' solo batteria.
        this.pauseElapsed.set(minimo);
        this.fermaTicker();
        // Una vibrazione alla fine del minimo, come per il recupero lungo: il
        // telefono e' in tasca o sulla panca, non davanti agli occhi.
        segnala('fine-pausa');
        return;
      }
      this.pauseElapsed.set(passati);
    }, 1000);
  }

  /** Ferma il conto lasciando la pausa aperta: il riquadro resta a schermo
   *  sullo zero, con la scritta che dice che si puo' ripartire. */
  private fermaTicker(): void {
    if (this.pauseTicker) { clearInterval(this.pauseTicker); this.pauseTicker = null; }
  }

  private stopPause(): void {
    this.fermaTicker();
    this.pauseFrom = null;
    this.pauseKey = '';
    this.pauseElapsed.set(0);
  }

  // --- I comandi ---

  setBlockLoad(vm: ExerciseVM, rowIdx: number, v: number): void {
    if (this.setsLocked) return;
    const b = this.block(vm.rows[rowIdx]);
    if (!b) return;
    b.load = this.write(v);
    this.scheduleDraft();
  }

  setBlockReps(vm: ExerciseVM, rowIdx: number, v: number): void {
    if (this.setsLocked) return;
    const b = this.block(vm.rows[rowIdx]);
    if (!b) return;
    b.reps = this.write(v);
    this.scheduleDraft();
  }

  /**
   * Chiude il blocco corrente e fa partire la pausa. Quando i blocchi scritti
   * sono finiti, la serie si chiude da sola; a esaurimento no - li' un altro
   * blocco e' sempre possibile finche' non sei tu a dire che non ne escono.
   */
  doneBlock(vm: ExerciseVM, rowIdx: number): void {
    if (this.setsLocked || !vm.cluster) return;
    const row = vm.rows[rowIdx];
    let i = this.blockIndex(row);
    // A esaurimento puo' non esserci un blocco corrente: succede riaprendo
    // una serie gia' chiusa per farne un altro. Se ne crea uno.
    if (i === -1 && vm.cluster.end === 'open' && canAddBlock(vm.cluster, row.blocks ?? [])) {
      row.blocks = [...(row.blocks ?? []), buildBlock(vm.cluster, row.blocks ?? [])];
      i = row.blocks.length - 1;
    }
    if (i === -1) return;

    const b = (row.blocks ?? [])[i];
    b.done = true;
    if (!b.reps && b.ripPlaceholder) b.reps = b.ripPlaceholder;
    // Il carico e' del BLOCCO: in un cluster di solito e' lo stesso ovunque,
    // ma al terzo blocco si cala, e la serie deve poterlo dire.
    if (!b.load && b.loadPlaceholder) b.load = b.loadPlaceholder;

    // A esaurimento il blocco dopo non esiste finche' non serve: si crea qui,
    // cosi' la striscia mostra sempre dove si sta andando.
    if (vm.cluster.end === 'open' && this.blockIndex(row) === -1 && canAddBlock(vm.cluster, row.blocks ?? [])) {
      row.blocks = [...(row.blocks ?? []), buildBlock(vm.cluster, row.blocks ?? [])];
    }

    if (clusterSetDone(vm.cluster, row.blocks ?? [])) {
      this.closeClusterSet(vm, rowIdx);
      return;
    }

    this.startPause(vm, rowIdx);
    this.scheduleDraft();
  }

  /** La serie finisce qui: a blocchi finiti, o perche' non ne escono altri. */
  closeClusterSet(vm: ExerciseVM, rowIdx: number): void {
    if (this.setsLocked) return;
    const row = vm.rows[rowIdx];
    if (!row.blocks?.some(b => b.done)) return;
    this.ultimoEsercizio = this.exercises.indexOf(vm);

    // A esaurimento l'ultimo blocco e' quello che stavi per fare e non hai
    // fatto: e' li' perche' la striscia mostrasse dove si stava andando, e
    // nello storico non deve restare come una serie mancata.
    if (vm.cluster?.end === 'open') {
      while (row.blocks.length && !row.blocks[row.blocks.length - 1].done) row.blocks.pop();
    }

    row.done = true;
    // Le ripetizioni della serie sono quelle che hai fatto davvero, blocco per
    // blocco: "5+5+3" dice una cosa che "15" non dice.
    row.reps = blocksLabel(row.blocks);
    // E il carico e' quello che hai usato: uno solo se non e' cambiato,
    // altrimenti da dove sei partito a dove sei arrivato.
    row.load = blocksLoadLabel(row.blocks);
    this.stopPause();
    this.syncActiveRow(vm);
    this.scheduleDraft();
    // Finita la serie tocca il recupero lungo dell'esercizio, non piu' quello
    // corto di dentro. Nello storico non tocca niente: e' una correzione.
    if (!this.isStorico) {
      this.state.startRestTimer(vm.restSeconds, vm.ex.name, this.day.id);
      segnala('serie');
    }
    this.avanzaSeFinito(vm);
  }

  /** Riapre una serie a cluster per correggerla: i blocchi restano come sono. */
  reopenClusterSet(vm: ExerciseVM, rowIdx: number): void {
    if (this.setsLocked) return;
    vm.rows[rowIdx].done = false;
    vm.activeRow = rowIdx;
    this.scheduleDraft();
  }

  /**
   * Toglie la spunta a un blocco: e' cosi' che si corregge quello sbagliato.
   * Tornando non fatto, ridiventa il blocco corrente, e se la serie era chiusa
   * si riapre — una serie finita con dentro un blocco da rifare non e' finita.
   */
  undoBlock(vm: ExerciseVM, rowIdx: number, blockIdx: number): void {
    if (this.setsLocked) return;
    const row = vm.rows[rowIdx];
    const b = row.blocks?.[blockIdx];
    if (!b?.done) return;
    b.done = false;
    if (row.done) { row.done = false; vm.activeRow = rowIdx; }
    this.stopPause();
    this.scheduleDraft();
  }

  canRemoveBlock(vm: ExerciseVM, row: SerieRow): boolean {
    return !!vm.cluster && canRemoveBlock(vm.cluster, row.blocks ?? []);
  }

  /**
   * Toglie l'ultimo blocco fatto. A esaurimento i blocchi li aggiunge chi si
   * allena, quindi deve poterne togliere uno: un tocco di troppo su "fatto il
   * blocco" oggi non si poteva disfare, si poteva solo togliere la spunta e
   * lasciare li' un blocco vuoto che restava nel conto.
   */
  async removeBlock(vm: ExerciseVM, rowIdx: number): Promise<void> {
    if (this.setsLocked || !vm.cluster) return;
    const row = vm.rows[rowIdx];
    if (!canRemoveBlock(vm.cluster, row.blocks ?? [])) return;

    // Porta con se' ripetizioni e carico registrati, come una serie spuntata.
    const ok = await this.confirm.confirm(
      'Vuoi togliere l\'ultimo blocco fatto? Le sue ripetizioni e il suo carico vanno persi.',
      { confirmLabel: 'Togli il blocco', dangerous: true }
    );
    if (!ok) return;
    // La conferma e' asincrona: nel frattempo la sessione puo' essere stata
    // chiusa, o la serie puo' non essere piu' quella.
    if (this.setsLocked || !vm.cluster || !canRemoveBlock(vm.cluster, row.blocks ?? [])) return;

    row.blocks = removeLastBlock(vm.cluster, row.blocks ?? []);
    // Se la serie era chiusa, un blocco in meno la riapre: non e' piu' quella
    // che avevi finito.
    if (row.done) { row.done = false; vm.activeRow = rowIdx; }
    this.stopPause();
    this.scheduleDraft();
    this.cdr.detectChanges();
  }

  canCloseCluster(vm: ExerciseVM, row: SerieRow): boolean {
    return vm.cluster?.end === 'open' && !!row.blocks?.some(b => b.done);
  }

  // ---- Le serie aggiunte ----

  /** Il piano non si tocca: il tasto per togliere una serie esiste solo su
   *  quelle aggiunte durante l'allenamento. */
  canRemove(vm: ExerciseVM, rowIdx: number): boolean {
    return canRemoveSet(vm.rows, rowIdx);
  }

  canAdd(vm: ExerciseVM): boolean {
    return canAddSet(vm.rows);
  }

  /**
   * Una serie in piu' su questo esercizio, sul modello dell'ultima. Si apre
   * solo se non c'era gia' una serie aperta: se si sta lavorando sulla terza
   * di cinque, saltare alla nuova vorrebbe dire perdere il segno.
   */
  addSet(vm: ExerciseVM): void {
    if (this.setsLocked || !canAddSet(vm.rows)) return;
    vm.rows = [...vm.rows, buildExtraSet(vm.rows)];
    if (vm.activeRow === null) vm.activeRow = vm.rows.length - 1;
    this.scheduleDraft();
  }

  /**
   * Toglie una serie aggiunta. Se e' gia' spuntata porta con se' del lavoro
   * registrato, quindi si chiede prima; se e' vuota no, sarebbe un attrito
   * inutile su una riga che non contiene niente.
   */
  async removeSet(vm: ExerciseVM, rowIdx: number): Promise<void> {
    if (this.setsLocked || !canRemoveSet(vm.rows, rowIdx)) return;

    if (vm.rows[rowIdx].done) {
      const ok = await this.confirm.confirm(
        'Vuoi togliere questa serie in più? Il carico e le ripetizioni che hai registrato vanno persi.',
        { confirmLabel: 'Togli la serie', dangerous: true }
      );
      if (!ok) return;
      // La conferma e' asincrona: nel frattempo la sessione puo' essere stata
      // chiusa, o la riga puo' non essere piu' quella.
      if (this.setsLocked || !canRemoveSet(vm.rows, rowIdx)) return;
    }

    vm.rows = removeSetAt(vm.rows, rowIdx);
    this.syncActiveRow(vm);
    this.scheduleDraft();
    this.cdr.detectChanges();
  }

  /** La riga chiusa in una riga sola: "10 × 80 kg". */
  rowSummary(row: SerieRow): string {
    const reps = row.reps || row.ripPlaceholder;
    const load = row.load || row.loadPlaceholder;
    // Una serie a cluster lasciata a meta' ha gia' del lavoro dentro: dire
    // "da fare" cancellerebbe i blocchi chiusi.
    if (!row.done && row.blocks?.some(b => b.done)) {
      return `${blocksLabel(row.blocks)} · in corso`;
    }
    if (row.done) {
      if (reps && load) return `${reps} × ${load} kg`;
      if (reps) return `${reps} rip.`;
      return load ? `${load} kg` : 'fatta';
    }
    // Da fare: quello che c'e' in programma ("10 × 33 kg"), che si legge in
    // grigio. "Da fare" non diceva niente che il numero della riga non dicesse.
    if (row.blocks?.length) {
      const conPeso = row.blocks.some(b => b.load || b.loadPlaceholder);
      const blocchi = row.blocks.map(b => {
        const r = b.reps || b.ripPlaceholder;
        const l = b.load || b.loadPlaceholder;
        return l ? `${r}×${l}` : r;
      }).filter(v => !!v);
      return blocchi.length ? `${blocchi.join(' + ')} ${conPeso ? 'kg' : 'rip.'}` : 'da fare';
    }
    return this.cella(reps, load);
  }

  /** "10 × 33 kg", "10 rip.", "33 kg": una serie in programma, scritta per esteso. */
  private cella(reps: string, load: string): string {
    if (reps && load) return `${reps} × ${load} kg`;
    if (reps) return `${reps} rip.`;
    return load ? `${load} kg` : 'da fare';
  }

  loadFor(row: SerieRow): string {
    return row.load || row.loadPlaceholder || '0';
  }

  repsFor(row: SerieRow): string {
    return row.reps || row.ripPlaceholder || '0';
  }

  // ---- La chiusura dell'allenamento ----

  /**
   * Una serie come finisce nello storico. I blocchi ci vanno tutti: `reps` e'
   * il riassunto della serie ("8+8") e chi conta i chili non puo' ricavarlo
   * da li' — parseFloat ne leggerebbe 8, meta' del lavoro.
   */
  private toPerformedSet(row: SerieRow): PerformedSetRecord {
    const set: PerformedSetRecord = {
      load: row.load || (row.blocks ? blocksLoadLabel(row.blocks) : '') || null,
      reps: row.reps || (row.blocks ? blocksLabel(row.blocks) : '') || null,
      done: row.done
    };
    if (row.blocks?.length) {
      set.blocks = row.blocks.map(b => ({
        load: b.load || b.loadPlaceholder || null,
        reps: b.reps || b.ripPlaceholder || null,
        done: b.done
      }));
    }
    return set;
  }

  /** Il volume gia' accumulato, per la card di chiusura. */
  get liveVolumeKg(): string {
    return formatKg(sessionTonnage({
      dayId: this.day?.id ?? '', dayLabel: '', date: '',
      exercises: this.exercises.map(vm => ({
        name: vm.ex.name,
        sets: vm.rows.map(r => this.toPerformedSet(r))
      }))
    }));
  }

  get doneSets(): number {
    return this.exercises.reduce((tot, vm) => tot + vm.rows.filter(r => r.done).length, 0);
  }

  get totalSets(): number {
    return this.exercises.reduce((tot, vm) => tot + vm.rows.length, 0);
  }

  get closingTitle(): string {
    if (this.allSetsDone) return 'Hai finito';
    return this.doneSets === 0 ? 'Non hai ancora spuntato niente' : 'Sei a buon punto';
  }

  formatDuration(seconds: number): string {
    return this.sessionState.formatDuration(seconds);
  }

  /** Il volume del riepilogo, gia' scritto. */
  summaryVolume(kg: number): string {
    return formatKg(kg);
  }

  summaryDelta(kg: number): string {
    return (kg > 0 ? '+' : '−') + formatKg(Math.abs(kg));
  }

  summaryPrevDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  backToScheda(): void {
    this.nav.navigateBack(['/scheda']);
  }

  /** "Seduta non trovata" non deve essere un vicolo cieco: l'unica cosa sensata da fare e' tornare all'elenco. */
  tornaAlloStorico(): void {
    this.nav.navigateBack(['/scheda/storico']);
  }

  onInput(): void {
    this.scheduleDraft();
  }

  /**
   * Mezzo secondo dopo l'ultimo tocco si scrive. Dove, lo dice la modalita':
   * nell'allenamento la bozza del giorno (la seduta non esiste ancora), nello
   * storico la seduta stessa, che esiste e va corretta.
   */
  private scheduleDraft(): void {
    // Ogni modifica alle serie passa di qui: la fascia in fondo deve sapere subito
    // cosa viene dopo, non fra mezzo secondo.
    this.pubblicaProssima();
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = setTimeout(() => {
      this.draftTimer = null;
      if (this.isStorico) { void this.salvaSeduta(); return; }
      this.saveDraft();
    }, 500);
  }

  // ---- La prossima serie, per la fascia in fondo ----

  /** L'esercizio su cui si e' lavorato per ultimo: da lui si cerca la serie dopo, poi dai successivi. */
  private ultimoEsercizio = 0;

  /** La prima serie ancora da fare, partendo dall'esercizio toccato per ultimo. */
  private cercaProssima(): ProssimaSerie | null {
    const n = this.exercises.length;
    for (let k = 0; k < n; k++) {
      const vm = this.exercises[(Math.max(0, this.ultimoEsercizio) + k) % n];
      const j = vm.rows.findIndex(r => !r.done);
      if (j < 0) continue;
      const row = vm.rows[j];
      return {
        esercizio: vm.ex.name,
        numero: j + 1,
        totale: vm.rows.length,
        reps: this.numero(row.reps) ?? this.numero(row.ripPlaceholder),
        carico: this.numero(row.load) ?? this.numero(row.loadPlaceholder),
        cluster: !!vm.cluster
      };
    }
    return null;
  }

  /** Solo dentro l'allenamento in corso: nello storico (si corregge una seduta passata) non c'e' una "prossima". */
  private pubblicaProssima(): void {
    this.state.prossimaSerie.set(!this.isStorico && this.isSessionOnThisDay ? this.cercaProssima() : null);
  }

  private saveDraft(): void {
    const data = this.exercises.map(vm => ({ name: vm.ex.name, rows: vm.rows }));
    this.appState.patchField(`workoutDrafts.${this.day.id}`, data).catch(() => { /* gia' segnalato da AppStateService */ });
  }

  getDoneCount(vm: ExerciseVM): number {
    return vm.rows.filter(r => r.done).length;
  }

  /** Quanto dell'anello del badge e' chiuso, in centesimi: il tracciato e'
   *  normalizzato con pathLength=100, quindi qui non serve sapere quanto
   *  misuri davvero il perimetro di un rettangolo smussato. */
  donePct(vm: ExerciseVM): number {
    return vm.rows.length ? (this.getDoneCount(vm) / vm.rows.length) * 100 : 0;
  }

  isComplete(vm: ExerciseVM): boolean {
    return vm.rows.length > 0 && vm.rows.every(r => r.done);
  }

  getMuscleInfo(muscle: string) {
    return this.workoutData.MUSCLES[muscle] ?? { color: '#64D2FF', dim: 'rgba(100,210,255,0.16)' };
  }

  // ---- La card della sessione e gli step ----

  /** Gli esercizi con tutte le serie spuntate: e' il conto della card in alto. */
  get eserciziFiniti(): number {
    return this.exercises.filter(vm => this.isComplete(vm)).length;
  }

  /** Dagli step in cima: porta la card di quell'esercizio, o la chiusura. */
  vaiAlPasso(valore: unknown): void {
    const i = typeof valore === 'string' ? parseInt(valore.replace(/^p/, ''), 10) : NaN;
    if (!isFinite(i) || i < 0 || i >= this.slideCount || i === this.sliderIndex) return;
    this.sliderIndex = i;
    this.scrollToIndex(i);
  }

  // ---- Prima dell'avvio: il programma da leggere ----
  //
  // Prima la card mostrava i comandi della sessione spenti (le ruote, "Fatta",
  // i blocchi), con sopra una riga che diceva di avviarla: sembravano attivi e
  // non lo erano. Finche' la sessione non parte la card e' una cosa da leggere.

  get anteprima(): boolean {
    return this.setsLocked;
  }

  /** Le colonne della tabella: una per blocco in un cluster, una sola altrimenti. */
  blocchiAnteprima(vm: ExerciseVM): number[] {
    const n = vm.cluster ? Math.max(1, ...vm.rows.map(r => r.blocks?.length ?? 0)) : 1;
    return Array.from({ length: n }, (_, i) => i + 1);
  }

  celleAnteprima(vm: ExerciseVM, row: SerieRow): string[] {
    if (vm.cluster && row.blocks?.length) {
      return row.blocks.map(b => this.cella(b.reps || b.ripPlaceholder, b.load || b.loadPlaceholder));
    }
    return [this.cella(row.reps || row.ripPlaceholder, row.load || row.loadPlaceholder)];
  }

  /** Come e' fatta ogni serie a cluster, in una frase. */
  didascaliaCluster(vm: ExerciseVM): string | null {
    const c = vm.cluster;
    if (!c) return null;
    const pausa = formatClusterRest(c.restSec);
    return c.end === 'open'
      ? `Ogni serie: blocchi da ${c.blocks[0]} a esaurimento, con ${pausa} di pausa fra l'uno e l'altro.`
      : `Ogni serie: ${c.blocks.length} ${c.blocks.length === 1 ? 'blocco' : 'blocchi'}, con ${pausa} di pausa fra l'uno e l'altro.`;
  }

  /** I pesi della tabella vengono dall'ultima seduta: si dice di quando. Solo
   *  se nella tabella ce n'e' uno: in un cluster i pesi sono quelli dei blocchi. */
  pesiUltimaVolta(vm: ExerciseVM): boolean {
    if (!vm.ultima) return false;
    return vm.rows.some(r => vm.cluster && r.blocks?.length
      ? r.blocks.some(b => !!b.loadPlaceholder)
      : !!r.loadPlaceholder);
  }

  // ---- Che peso metto ----

  foglioCarico: FoglioCarico | null = null;
  foglioCaricoAperto = false;

  /** Le fonti di un peso per questa serie. Vuoto su un cluster (li' il peso e'
   *  del blocco) e nello storico (li' c'e' quello che hai fatto, non un suggerimento). */
  opzioniCarico(vm: ExerciseVM, serie: number): OpzioneCarico[] {
    const row = vm.rows[serie];
    if (!row || vm.cluster || this.isStorico) return [];
    return opzioniCarico({
      serie,
      ultima: vm.ultima,
      ripetizioni: this.numero(row.reps) ?? this.numero(row.ripPlaceholder),
      rmRows: vm.insight?.rmRows ?? null,
      programma: vm.insight?.programLoad ?? null,
      previste: numeroSevero(row.ripPlaceholder),
      soglia: this.rmSoftOver
    });
  }

  /** La riga in cima alla serie: da dove viene il numero nella ruota. */
  fonteCarico(vm: ExerciseVM, serie: number): string | null {
    const row = vm.rows[serie];
    if (!row) return null;
    const opzioni = this.opzioniCarico(vm, serie);
    return fonteDelCarico(opzioni, row.load, row.loadPlaceholder) ?? (opzioni.length ? 'scegli il peso' : null);
  }

  /** Le fonti di un peso nel foglio: quelle della sua serie, nessuna se non ce n'e' una da fare. */
  opzioniDelFoglio(f: FoglioCarico): OpzioneCarico[] {
    return f.serie === null ? [] : this.opzioniCarico(f.vm, f.serie);
  }

  /**
   * Il bilanciere nella testata: apre il foglio del massimale per la serie in
   * corso, anche prima dell'avvio (li' i pesi si leggono soltanto) e anche
   * senza una stima, che il foglio dice perche' manca. Come il chip del
   * recupero, nell'elenco il tocco non apre e chiude l'esercizio.
   */
  apriMassimale(vm: ExerciseVM, evento: Event): void {
    evento.stopPropagation();
    this.foglioCarico = { vm, serie: vm.activeRow };
    this.foglioCaricoAperto = true;
  }

  /** Il nome del bilanciere: un'icona sola non dice niente a chi non la vede. */
  etichettaMassimale(vm: ExerciseVM): string {
    const m = vm.insight?.oneRm;
    return m ? `Massimale stimato ${this.kg(m.value)} kg: apri i pesi` : 'Massimale: apri i pesi';
  }

  /** Perche' il foglio non ha un massimale da dire. */
  testoSenzaMassimale(vm: ExerciseVM): string {
    return vm.cluster
      ? 'Sugli esercizi a cluster il massimale non si stima: fra un blocco e l\'altro c\'è una pausa, e non è una serie dritta.'
      : 'Ancora nessun massimale: lo stimo dalla prima sessione salvata con peso e ripetizioni di questo esercizio.';
  }

  /** "+1,5" o "−2": la differenza col massimale della volta prima, col segno. */
  conSegno(n: number): string {
    return `${n > 0 ? '+' : '−'}${this.kg(Math.abs(n))}`;
  }

  apriCarico(vm: ExerciseVM, serie: number): void {
    if (this.setsLocked || !this.opzioniCarico(vm, serie).length) return;
    this.foglioCarico = { vm, serie };
    this.foglioCaricoAperto = true;
  }

  caricoChiuso(): void {
    this.foglioCaricoAperto = false;
    this.foglioCarico = null;
  }

  /** L'opzione col peso che c'e' nella ruota; nessuna se l'hai girata tu. */
  sceltaCarico(f: FoglioCarico): string {
    const row = f.serie === null ? undefined : f.vm.rows[f.serie];
    const kg = row ? this.numero(row.load) ?? this.numero(row.loadPlaceholder) : null;
    return opzioneScelta(this.opzioniDelFoglio(f), kg)?.chiave ?? '';
  }

  /**
   * Scegliere col dito mette il numero nella ruota e chiude il foglio. Con le
   * frecce no: nel gruppo di radio le frecce spostano E scelgono, e chi usa la
   * tastiera deve poter scorrere le opzioni senza che il foglio si chiuda alla
   * prima. Conferma con Spazio, esce con Esc. Come nella Dieta.
   */
  scegliCarico(f: FoglioCarico, chiave: string, evento?: Event): void {
    const o = this.opzioniDelFoglio(f).find(x => x.chiave === chiave);
    if (!o || f.serie === null) return;
    this.setLoad(f.vm, f.serie, o.kg);
    if (!(typeof KeyboardEvent !== 'undefined' && evento instanceof KeyboardEvent)) this.foglioCaricoAperto = false;
    this.cdr.detectChanges();
  }

  // ---- Il tasto in basso ----
  //
  // Nello slider, ad allenamento avviato, il comando della serie sta in basso,
  // sotto il pollice, nel posto in cui prima c'e' "Inizia allenamento" e
  // durante il recupero c'e' la fascia col conto alla rovescia: un posto solo
  // per il prossimo gesto. Nell'elenco (tante card insieme, un tasto in basso
  // non saprebbe di quale parla) e nello storico resta nella card.

  get tastoInBasso(): boolean {
    return this.state.viewMode() === 'slider' && !this.isStorico && !!this.day && !this.loading
      && !this.errorMsg && !this.summary && this.isSessionOnThisDay;
  }

  /** Prima dell'avvio: in basso c'e' "Inizia allenamento". */
  get avvioInBasso(): boolean {
    return !!this.day && !this.loading && !this.errorMsg && !this.summary && !this.isStorico
      && !this.sessionState.activeSession();
  }

  /**
   * In basso c'e' la barra della pagina ("Inizia" o il tasto della serie): il
   * contenuto le passa sotto, e in fondo le tiene lo stesso spazio che tiene
   * per la barra delle tab.
   */
  get barraInBasso(): boolean {
    return this.avvioInBasso || (!this.recuperoInCorsa && this.azione !== null);
  }

  /** Il recupero sta contando: in basso c'e' la fascia, non il tasto. */
  get recuperoInCorsa(): boolean {
    const t = this.state.restTimer();
    return !!t.show && !t.finished;
  }

  /** Il recupero e' finito e la serie dopo non e' ancora segnata. */
  get recuperoFinito(): boolean {
    const t = this.state.restTimer();
    return !!t.show && !!t.finished;
  }

  /** La fascia sparisce a fine recupero: chi usa un lettore di schermo lo sente da qui. */
  get annuncioRecupero(): string {
    return this.tastoInBasso && this.recuperoFinito ? 'Recupero finito: vai con la serie successiva.' : '';
  }

  /** Cosa fa il tasto in basso per la card che si sta guardando; null sulla chiusura. */
  get azione(): AzioneInBasso | null {
    if (!this.tastoInBasso) return null;
    const vm = this.exercises[this.sliderIndex];
    if (!vm) return null;
    const row = vm.activeRow !== null ? vm.rows[vm.activeRow] : undefined;
    const cluster = row && !row.done && this.isCluster(vm, row)
      ? { etichetta: this.blockLabel(vm, row), chiudibile: this.canCloseCluster(vm, row) }
      : null;
    return azioneInBasso({
      righe: vm.rows, attiva: vm.activeRow, cluster,
      ultimo: this.sliderIndex === this.exercises.length - 1
    });
  }

  /** Le parole del tasto: quella che si fa, e in piccolo su cosa. */
  testoAzione(a: AzioneInBasso): { testo: string; sub: string | null } {
    switch (a.tipo) {
      case 'fatta': return { testo: 'Fatta', sub: `serie ${a.serie} di ${a.totale}` };
      case 'blocco': return { testo: `Fatto il ${a.etichetta.toLowerCase()}`, sub: null };
      case 'torna': return { testo: `Torna alla serie ${a.serie}`, sub: null };
      case 'avanti': return { testo: a.chiusura ? 'Vai alla chiusura' : 'Prossimo esercizio', sub: null };
    }
  }

  /** Il tasto in basso. `chiudi` e' il secondo tasto di un cluster a esaurimento: "Chiudo la serie". */
  eseguiAzione(a: AzioneInBasso, chiudi = false): void {
    const vm = this.exercises[this.sliderIndex];
    if (!vm) return;
    const daTastiera = this.focusNelPiede();
    const j = vm.activeRow;
    switch (a.tipo) {
      case 'fatta':
        if (j !== null) this.confirmSet(vm, j);
        break;
      case 'blocco':
        if (j !== null) { if (chiudi) this.closeClusterSet(vm, j); else this.doneBlock(vm, j); }
        break;
      case 'torna':
        vm.activeRow = a.serie - 1;
        break;
      case 'avanti':
        this.vaAllaSlide(this.sliderIndex + 1);
        break;
    }
    this.cdr.detectChanges();
    // Il tasto se ne va col recupero che parte: da tastiera il focus passa alla
    // X della fascia, l'unica cosa che c'e' li'.
    if (daTastiera && this.recuperoInCorsa) this.portaFocus('app-rest-bar .restbar-x');
  }

  private focusNelPiede(): boolean {
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    return !!a?.closest?.('ion-footer.salva-footer');
  }

  /** Porta il focus su un controllo appena ridisegnato; su un ion-button, sul pulsante vero dentro. */
  private portaFocus(selettore: string): void {
    setTimeout(() => {
      const el = document.querySelector<HTMLElement>(selettore);
      const dentro = el?.shadowRoot?.querySelector<HTMLElement>('button') ?? el;
      dentro?.focus();
    }, 0);
  }

  openRestModal(vm: ExerciseVM, event: Event): void {
    event.stopPropagation();
    this.restModalVm = vm;
    this.restModalValue = vm.restSeconds;
    this.restModalOpen = true;
  }

  closeRestModal(): void {
    this.restModalOpen = false;
  }

  adjustRestModalValue(delta: number): void {
    this.restModalValue = Math.min(600, Math.max(5, this.restModalValue + delta));
  }

  resetRestModalToDefault(): void {
    if (!this.restModalVm) return;
    this.restModalValue = this.parseRecSeconds(this.day.rec);
  }

  async saveRestModal(): Promise<void> {
    if (!this.restModalVm) return;
    this.restModalVm.restSeconds = this.restModalValue;
    await this.appState.patchField(`restOverrides.${this.restKey(this.restModalVm.ex.name)}`, this.restModalValue);
    this.closeRestModal();
    this.cdr.detectChanges();
  }

  /** Wrapper pubblico per il template: default del protocollo per il giorno corrente. */
  parseRecSecondsPublic(): number {
    return this.parseRecSeconds(this.day.rec);
  }

  formatRest(seconds: number): string {
    if (seconds % 60 === 0) return `${seconds / 60}:00`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`;
  }

  /** La sessione in corso appartiene a QUESTO allenamento: stesso id e stessa
   *  etichetta. Se il protocollo e' cambiato sotto i piedi, l'id da solo
   *  mentirebbe (vedi matchesDay nel servizio). */
  get isSessionOnThisDay(): boolean {
    // Nello storico mai, nemmeno se c'e' una sessione aperta sullo stesso
    // giorno: quella si sta allenando ora, questa e' una seduta di allora.
    // Da qui passano la card di chiusura, il salvataggio e la barra della
    // sessione, che su una seduta salvata non devono esistere.
    if (this.isStorico) return false;
    return this.sessionState.matchesDay(this.day.id, this.day.label);
  }

  /** true se esiste una sessione in corso che non e' di questo allenamento. */
  get hasOtherSession(): boolean {
    return !!this.sessionState.activeSession() && !this.isSessionOnThisDay;
  }

  /** Indice del giorno su cui e' in corso la sessione, per il link "vai alla sessione".
   *  null se la sessione e' su questo giorno, assente, oppure se il suo dayId non
   *  esiste piu' nel protocollo attuale (protocollo cambiato dopo l'avvio). */
  get otherSessionDayIndex(): number | null {
    const s = this.sessionState.activeSession();
    if (!s || this.isSessionOnThisDay) return null;
    const idx = this.workoutData.days.findIndex(
      d => d.id === s.dayId && (!s.dayLabel || d.label === s.dayLabel)
    );
    return idx >= 0 ? idx : null;
  }

  /** Etichetta corta: nella barra convive con cronometro e tre comandi.
   *  A sessione avviata dice quanto manca alla chiusura, altrimenti il tasto
   *  salva resterebbe spento senza spiegare perche'. */
  get sessionBarLabel(): string {
    if (this.isSessionOnThisDay) {
      if (this.sessionState.isPaused()) return 'In pausa';
      // Con un errore di caricamento le serie in memoria non ci sono: dire
      // "Completo" sarebbe una bugia, e "mancano 0 serie" pure.
      if (this.errorMsg) return 'In corso';
      const left = this.remainingSets;
      if (left === 0) return 'Completo';
      return left === 1 ? 'Manca 1 serie' : `Mancano ${left} serie`;
    }
    // Sessione avviata su un giorno che il protocollo non ha piu': non e'
    // raggiungibile, l'unica uscita e' annullarla.
    if (this.hasOtherSession) return 'Da chiudere';
    return 'Sessione';
  }

  /**
   * I campi della scheda (ripetizioni, carico, spunta della serie) si
   * compilano solo a sessione avviata su QUESTO giorno.
   *
   * Prima erano sempre aperti, e questo permetteva di registrare un
   * allenamento senza mai far partire il cronometro: la seduta finiva nello
   * storico con una durata che non era mai stata misurata. Vale anche quando
   * la sessione e' aperta su un altro giorno — quei numeri appartengono a
   * quell'allenamento, non a questo.
   *
   * In pausa NON si blocca: una sessione in pausa e' comunque avviata, e
   * bloccare i campi mentre si riprende fiato sarebbe solo un intralcio.
   */
  get setsLocked(): boolean {
    // Nello storico i campi sono sempre aperti. Il blocco esiste per non
    // registrare un allenamento senza mai far partire il cronometro, e qui
    // l'allenamento e' finito: resta solo da correggere quello che e' andato
    // storto (una serie dimenticata, un carico sbagliato).
    if (this.isStorico) return false;
    return !this.isSessionOnThisDay;
  }

  get isSessionRunning(): boolean {
    return this.isSessionOnThisDay && !this.sessionState.isPaused();
  }

  get playPauseLabel(): string {
    if (!this.isSessionOnThisDay) return 'Avvia la sessione di allenamento';
    return this.sessionState.isPaused() ? 'Riprendi la sessione' : 'Metti in pausa la sessione';
  }

  /** Nessuna serie lasciata indietro, in nessun esercizio: e' la condizione per
   *  poter chiudere l'allenamento. Contata sulle righe e non su isComplete()
   *  cosi' un esercizio senza serie (schema degenere) non blocca il salvataggio
   *  per sempre; un giorno senza esercizi resta non salvabile. */
  get allSetsDone(): boolean {
    return this.exercises.length > 0 && this.remainingSets === 0;
  }

  /** Quante serie mancano alla chiusura, per dirlo invece di lasciare un tasto spento e muto. */
  get remainingSets(): number {
    return this.exercises.reduce((tot, vm) => tot + vm.rows.filter(r => !r.done).length, 0);
  }

  /** Con un errore di caricamento gli esercizi in memoria sono vuoti o vecchi:
   *  salvare scriverebbe nello storico una seduta sbagliata. Annullare invece
   *  resta possibile, altrimenti la sessione sarebbe in trappola. */
  get canSaveSession(): boolean {
    return this.isSessionOnThisDay && !this.errorMsg && this.state.saveStatus() !== 'saving';
  }

  /** Annulla vale anche per una sessione orfana (giorno sparito dal protocollo):
   *  senza questa via d'uscita non si potrebbe piu' avviarne nessuna. */
  get canCancelSession(): boolean {
    return this.isSessionOnThisDay
      || (this.hasOtherSession && this.otherSessionDayIndex === null);
  }

  /** Etichetta accessibile del tasto salva (il bottone mostra solo l'icona). */
  get saveButtonLabel(): string {
    switch (this.state.saveStatus()) {
      case 'saving': return 'Salvataggio in corso';
      case 'saved': return 'Allenamento salvato';
      case 'err': return 'Errore, riprova a salvare';
    }
    if (this.isSessionOnThisDay && !this.allSetsDone) {
      const left = this.remainingSets;
      return left === 1
        ? 'Termina e salva: manca 1 serie da spuntare, verrà chiesta conferma'
        : `Termina e salva: mancano ${left} serie da spuntare, verrà chiesta conferma`;
    }
    return 'Termina la sessione e salva l\'allenamento';
  }

  onPlayPause(): void {
    if (!this.sessionState.activeSession()) { this.startSession(); return; }
    if (this.isSessionOnThisDay) this.sessionState.togglePause();
  }

  startSession(): void {
    this.sessionState.start(this.day.id, this.day.label);
    this.pubblicaProssima();
  }

  goToOtherSession(): void {
    const idx = this.otherSessionDayIndex;
    if (idx === null) return;
    this.nav.navigateForward(['/scheda/day', idx]);
  }

  async cancelSession(): Promise<void> {
    // I due tasti non devono dire la stessa cosa: "Annulla sessione" (butta via
    // tutto) e "Annulla" (rinuncia a farlo) a un dito di distanza si scambiavano
    // facilmente, e uno dei due costa un allenamento intero.
    const ok = await this.confirm.confirm(
      'Vuoi buttare via la sessione in corso? Il tempo andrà perso e l\'allenamento non verrà salvato nello storico.',
      { confirmLabel: 'Butta via la sessione', cancelLabel: 'Continua l\'allenamento', dangerous: true }
    );
    if (!ok) return;
    this.sessionState.cancel();
    // Il recupero appartiene alla sessione: senza questo il "Vai" di una
    // sessione buttata riapparirebbe all'inizio della prossima.
    this.state.stopRestTimer();
    this.state.prossimaSerie.set(null);
    // La card di chiusura era l'ultima slide e ora non c'e' piu': l'indicatore
    // resterebbe puntato oltre la fine, senza nessun trattino acceso.
    if (this.sliderIndex >= this.exercises.length) {
      this.sliderIndex = Math.max(0, this.exercises.length - 1);
    }
    this.cdr.detectChanges();
  }

  async saveWorkout(): Promise<void> {
    if (this.state.saveStatus() === 'saving') return; // evita doppio invio mentre e' gia' in corso
    // Il salvataggio esiste solo come chiusura di una sessione avviata su questo giorno.
    if (!this.isSessionOnThisDay) return;

    // Chiudere con delle serie non spuntate e' legittimo (un esercizio saltato,
    // un allenamento interrotto), ma quasi sempre e' una dimenticanza: si chiede
    // conferma invece di bloccare, cosi' la sessione non va persa per forza.
    if (!this.allSetsDone) {
      const left = this.remainingSets;
      const ok = await this.confirm.confirm(
        left === 1
          ? 'Manca 1 serie da spuntare. Vuoi salvare lo stesso l\'allenamento?'
          : `Mancano ${left} serie da spuntare. Vuoi salvare lo stesso l'allenamento?`,
        { confirmLabel: 'Salva lo stesso', dangerous: false }
      );
      if (!ok) return;
      // La conferma e' asincrona: nel frattempo la sessione puo' essere stata
      // annullata o chiusa da un'altra scheda, quindi la guardia va rifatta.
      if (!this.isSessionOnThisDay) return;
      if (this.state.saveStatus() === 'saving') return;
    }

    this.state.saveStatus.set('saving');
    if (this.draftTimer) { clearTimeout(this.draftTimer); this.draftTimer = null; }

    const isoDate = todayLocalISO();
    // Durata letta PRIMA del salvataggio: la sessione viene chiusa solo a
    // salvataggio riuscito, cosi' un errore di rete non la distrugge.
    const durationSec = this.sessionState.elapsedSec();
    const session: WorkoutSession = {
      dayId: this.day.id,
      dayLabel: this.day.label,
      date: isoDate,
      exercises: this.exercises.map(vm => ({
        name: vm.ex.name,
        sets: vm.rows.map(r => this.toPerformedSet(r))
      })),
      durationSec
    };

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      const ok = await Promise.race([this.sessions.save(session), timeout]);
      if (ok) {
        await this.appState.deleteFieldPath(`workoutDrafts.${this.day.id}`);
        this.sessionState.finish();
        this.state.stopRestTimer();
        this.state.prossimaSerie.set(null);
        this.state.saveStatus.set('saved');
        // Il resoconto si costruisce dalla seduta appena scritta e dall'ultima
        // volta che si era fatto LO STESSO giorno: un Giorno 1 di petto e un
        // Giorno 2 di gambe non hanno niente da dirsi.
        this.summary = buildSessionSummary(session, this.daySessions[this.daySessions.length - 1] ?? null);
      } else {
        this.state.saveStatus.set('err');
        this.toast.error('Errore durante il salvataggio. Riprova.');
      }
    } catch (e: any) {
      console.error('Errore salvataggio allenamento:', e);
      this.state.saveStatus.set('err');
      this.toast.error('Errore durante il salvataggio. Riprova.');
    } finally {
      setTimeout(() => this.state.saveStatus.set('idle'), 2000);
    }
  }

  // ---- La seduta salvata ----
  //
  // Nello storico non c'e' niente da avviare e niente da chiudere: la seduta
  // esiste. Si corregge, e ogni correzione si scrive da sola mezzo secondo
  // dopo l'ultimo tocco, come la bozza dell'allenamento.

  /** La durata misurata quel giorno, o 0 per le sedute salvate prima del
   *  cronometro. Correggere le serie non la cambia: non e' misurabile adesso. */
  get sedutaDurata(): number {
    return this.sedutaSalvata?.durationSec ?? 0;
  }

  get testoSalvataggio(): string {
    switch (this.statoSalvataggio) {
      case 'salvo': return 'Salvo\u2026';
      case 'salvato': return 'Salvato \u2713';
      case 'errore': return this.erroreSalvataggio;
    }
    return 'Le correzioni si salvano da sole.';
  }

  /**
   * La data e' l'unica cosa che non si corregge in place: l'id della seduta la
   * porta dentro (`${dayId}_${data}`), quindi cambiarla sposta il documento.
   * Ci pensa `moveSession`, che e' anche l'unico a sapere se nella data nuova
   * c'e' gia' una seduta di questo giorno.
   */
  onDateChange(): void {
    if (!this.storicoDate || this.storicoDate > this.maxDate) {
      this.statoSalvataggio = 'errore';
      this.erroreSalvataggio = 'Data non valida: una seduta non può essere senza data o nel futuro.';
      return;
    }
    this.scheduleDraft();
  }

  /** La seduta come sta a schermo adesso, pronta da scrivere. */
  private sessioneCorrente(): WorkoutSession {
    const seduta: WorkoutSession = {
      dayId: this.day.id,
      dayLabel: this.sedutaSalvata?.dayLabel || this.day.label,
      date: this.storicoDate,
      exercises: this.exercises.map(vm => ({
        name: vm.ex.name,
        sets: vm.rows.map(r => this.toPerformedSet(r))
      }))
    };
    if (this.sedutaDurata > 0) seduta.durationSec = this.sedutaDurata;
    return seduta;
  }

  private async salvaSeduta(): Promise<void> {
    if (!this.isStorico || !this.sedutaSalvata) return;
    if (!this.storicoDate || this.storicoDate > this.maxDate) return;

    const seduta = this.sessioneCorrente();
    this.statoSalvataggio = 'salvo';
    this.erroreSalvataggio = '';
    if (!this.distrutto) this.cdr.detectChanges();

    // moveSession copre i due casi con una chiamata: stessa data e riscrive il
    // documento, data nuova e lo sposta in una writeBatch dopo aver controllato
    // che la destinazione sia libera.
    const esito = await this.sessions.moveSession(seduta, this.sessionKey, this.storicoDate);
    if (this.distrutto) return;

    if (esito === 'ok') {
      this.sedutaSalvata = seduta;
      this.statoSalvataggio = 'salvato';
      const nuovoId = this.sessions.sessionId(seduta.dayId, this.storicoDate);
      if (nuovoId !== this.sessionKey) {
        // La seduta ora vive a un altro indirizzo: restare su quello vecchio
        // vorrebbe dire guardare un documento che non c'e' piu'.
        this.toast.success('Seduta spostata \u2713');
        this.nav.navigateForward(['/scheda/storico', encodeURIComponent(nuovoId)], { replaceUrl: true });
        return;
      }
      this.setDisplayDate(this.storicoDate);
    } else if (esito === 'collision') {
      // La data nuova e' occupata: la seduta non si sposta, e il campo torna
      // a dire la verita' su dov'e'.
      this.storicoDate = this.sedutaSalvata.date;
      this.statoSalvataggio = 'errore';
      this.erroreSalvataggio = 'In quella data c\'e\' già una seduta di questo giorno: la data non è stata cambiata.';
      this.toast.error('Esiste già una seduta in questa data.');
    } else {
      this.statoSalvataggio = 'errore';
      this.erroreSalvataggio = 'Non salvato. Controlla la rete: la correzione resta a schermo.';
      this.toast.error('Errore durante il salvataggio. Riprova.');
    }
    this.cdr.detectChanges();
  }

  async deleteSession(): Promise<void> {
    const ok = await this.confirm.confirm('Eliminare questa seduta dallo storico?', {
      confirmLabel: 'Elimina', dangerous: true
    });
    if (!ok) return;
    // Niente da salvare su una seduta che si sta cancellando.
    if (this.draftTimer) { clearTimeout(this.draftTimer); this.draftTimer = null; }
    const fatto = await this.sessions.delete(this.sessionKey);
    if (this.distrutto) return;
    if (fatto) {
      this.nav.navigateBack(['/scheda/storico']);
      return;
    }
    this.statoSalvataggio = 'errore';
    this.erroreSalvataggio = 'Errore durante l\'eliminazione. Riprova.';
    this.cdr.detectChanges();
  }
}
