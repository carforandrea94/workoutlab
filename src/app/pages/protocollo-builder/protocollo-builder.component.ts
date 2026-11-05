import { Component, OnInit, OnDestroy, DoCheck, ChangeDetectorRef, ElementRef, Optional, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  CdkDropListGroup, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder,
  CdkDragDrop, moveItemInArray, transferArrayItem
} from '@angular/cdk/drag-drop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { ProtocolService } from '../../services/protocol.service';
import { WorkoutDataService } from '../../services/workout-data.service';
import { Protocol } from '../../models/protocol.model';
import { Day, Exercise, ClusterSpec, WeekPlan } from '../../models/workout.model';
import {
  newCluster, clusterLabel, clusterScheme, formatClusterRest,
  CLUSTER_MIN_REST
} from '../../core/utils/cluster.util';
import { MAX_BLOCKS_PER_SET } from '../../core/utils/extra-sets.util';
import { GRUPPI_MUSCOLARI, muscoloDaNome } from '../../core/utils/muscolo.util';
import {
  SETTIMANE_MAX, SETTIMANE_MIN, riepilogoProgressione, ripulisciProgressione, senzaCopieDelProgramma,
  settimanaInPiu, stessaProgressione
} from '../../core/utils/settimane-programma.util';
import {
  RIPETIZIONI_PREDEFINITE, SERIE_MAX, impostaRipetizioniUguali, impostaSerie, nuovoEsercizio, passoRipetizioni, ripetizioniComuni,
  ripetizioniUguali, riepilogoSerie, settimaneDaProgramma
} from '../../core/utils/esercizio.util';
import { RunGoal, normalizeRunGoal } from '../../models/run.model';
import { senzaCaselleVuote } from '../../core/utils/diet-empty.util';
import { TipoDieta } from '../../core/utils/dieta-ciclo.util';
import { todayLocalISO } from '../../core/utils/date.util';
import { FoodItem, DietPlan, NamedMeal, MealCombination, SupplementItem, newDietPlan, newNamedMeal, newCombination, FoodCategory, FOOD_CATEGORIES, FOOD_CATEGORY_LABELS } from '../../models/diet.model';
import { ProtocolBuilderStateService } from '../../services/protocol-builder-state.service';
import { ToastService } from '../../services/toast.service';
import { PdfImportService } from '../../services/pdf-import.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { IONIC_LIST } from '../../core/ionic-list';
import { NavController, IonAvatar, IonContent, IonFooter, IonInput, IonTextarea, IonSelect, IonSelectOption, IonSpinner, IonSegment, IonSegmentButton, IonToggle, IonButton, IonRouterOutlet, IonLabel, IonListHeader, IonNote, IonItemDivider } from '@ionic/angular';
import {
  LivelloBuilder, PosizioneBuilder, SchedaBuilder, chiaveBuilder, direzioneBuilder, etichettaFattoBuilder, etichettaSuBuilder,
  livelloBuilder, titoloBuilder
} from '../../core/utils/builder-nav.util';
import { ConModificheNonSalvate } from '../../core/guards/modifiche-non-salvate.guard';
import { senzaSwipeIndietro } from '../../core/swipe-indietro';
import { NomeCampoDirective } from '../../core/nome-campo.directive';
import { IconaComponent } from '../../components/icona/icona.component';
import { BarraAzioneDirective } from '../../core/directives/barra-azione.directive';
import { IONIC_SLIDING } from '../../core/ionic-sliding';

type Tab = SchedaBuilder;

/**
 * Una zona che puo' ricevere un alimento trascinato.
 *
 * `casella` e' uno dei tre posti singoli della combinazione (carboidrati,
 * proteine, grassi): ne tiene uno solo. `lista` e' una qualunque lista di
 * alternative - quelle del pasto per un macro, o quelle di un singolo
 * alimento - e ne tiene quanti ne vuole.
 */
export type ZonaDrop =
  | { tipo: 'casella'; cat: FoodCategory }
  | { tipo: 'lista'; items: FoodItem[] };

@Component({
  selector: 'app-protocollo-builder',
  standalone: true,
  imports: [NomeCampoDirective, BarraAzioneDirective, IonAvatar, IonFooter, IonButton, IonLabel, IonListHeader, IonNote, IonItemDivider, ...IONIC_SLIDING, ...IONIC_LIST, IonInput, IonTextarea, IonSelect, IonSelectOption, IonSpinner, IonSegment, IonSegmentButton, IonToggle, ...IONIC_PAGE, ...IONIC_LINKS,
    CommonModule, FormsModule, IconaComponent,
    CdkDropListGroup, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder
  ],
  templateUrl: './protocollo-builder.component.html'
})
export class ProtocolloBuilderComponent implements OnInit, OnDestroy, DoCheck {
  protocolId = '';
  protocol: Protocol | null = null;
  loading = true;
  errorMsg = '';
  saving = false;
  saveMsg = '';
  private paramSub: Subscription | null = null;

  /**
   * Com'era il protocollo all'ultimo caricamento o salvataggio: il termine di
   * confronto per dire "hai modificato" (vedi uscitaSenzaPerdite). Si prende
   * dopo il primo disegno, cosi' quello che il template normalizza da solo
   * non conta come modifica.
   */
  private baseline = '';
  private uscitaConsentita = false;
  private get swipe() { return senzaSwipeIndietro(this.outlet); }

  tab: Tab = 'scheda';
  /**
   * Il giorno che si sta scrivendo, o null quando si e' sull'elenco.
   *
   * La scheda del coach mostrava tutti i giorni aperti uno sotto l'altro, con
   * dentro nomi, recuperi ed esercizi: su sei giorni era una pagina lunga
   * decine di schermate, e per arrivare al quinto giorno si scorreva tutto il
   * resto. Ora fa come la vede il cliente e come fa gia' la dieta qui accanto:
   * prima l'elenco, poi il giorno.
   */
  editingDay: { day: Day; index: number } | null = null;
  editingPlan: DietPlan | null = null;
  editingMeal: NamedMeal | null = null;
  /**
   * `diverse`: le ripetizioni si scrivono serie per serie (12-10-8) invece che
   * una volta sola. `muscoloManuale`: il gruppo l'ha scelto chi scrive, e il nome
   * non lo cambia piu' da solo.
   */
  editingExercise: { day: Day; ex: Exercise; isNew: boolean; diverse: boolean; muscoloManuale: boolean } | null = null;

  /**
   * Gli esercizi di un giorno si riordinano in un modo a parte, come "Modifica"
   * su iOS: in modo normale la riga apre l'esercizio, e metterci sopra anche una
   * maniglia vorrebbe dire un pulsante dentro un pulsante, e un dito che apre
   * l'editor mentre voleva trascinare. Qui le righe non si aprono e hanno la presa.
   */
  riordinando = false;
  /** Cosa dire a chi non vede lo schermo dopo uno spostamento: "Panca piana: posizione 2 di 8". */
  annuncioRiordino = '';

  readonly muscles: readonly string[] = GRUPPI_MUSCOLARI;
  readonly serieMax = SERIE_MAX;

  /** L'obiettivo di corsa esiste sempre dopo load(): il template puo' legarsi senza guardie. */
  get runGoal(): RunGoal { return this.protocol!.running!; }

  readonly foodCategories = FOOD_CATEGORIES;
  readonly foodCategoryLabels = FOOD_CATEGORY_LABELS;

  constructor(
    private route: ActivatedRoute,
    private nav: NavController,
    private protocolSvc: ProtocolService,
    private pdfSvc: PdfImportService,
    public workoutData: WorkoutDataService,
    private cdr: ChangeDetectorRef,
    public protocolBuilderState: ProtocolBuilderStateService,
    private toast: ToastService,
    private confirm: ConfirmDialogService,
    @Optional() private outlet: IonRouterOutlet | null = null
  ) {}

  ngOnInit(): void {
    this.protocolBuilderState.registerHandlers(() => this.save(false), () => this.save(true));
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.protocolId = params.get('protocolId') ?? '';
      this.load();
    });
    this.changedSub = this.protocolSvc.changed$.subscribe(() => {
      if (!this.scrivendoDaQui) this.salvatoAltrove = true;
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    this.changedSub?.unsubscribe();
    this.protocolBuilderState.registerHandlers(null, null);
  }

  ionViewWillEnter(): void {
    this.uscitaConsentita = false;
    this.aggiornaSwipe();
    this.ricaricaSeScrittoAltrove();
  }

  // ===== Livelli =====
  //
  // L'editor e' una pagina sola con dei livelli (vedi builder-nav.util.ts): la
  // testata dice a che livello si e', la freccia sale di uno invece di buttare
  // fuori dall'editor, e la schermata nuova entra dalla parte giusta.

  /** Dove si e': scheda, giorno aperto, esercizio, piano, pasto. */
  get posizione(): PosizioneBuilder {
    return {
      scheda: this.tab,
      giorno: this.editingDay ? { label: this.editingDay.day.label } : null,
      esercizio: this.editingExercise ? { name: this.editingExercise.ex.name, isNew: this.editingExercise.isNew } : null,
      piano: this.editingPlan ? { id: this.editingPlan.id, name: this.editingPlan.name } : null,
      pasto: this.editingMeal ? { id: this.editingMeal.id, name: this.editingMeal.name } : null
    };
  }

  get livello(): LivelloBuilder { return livelloBuilder(this.posizione); }
  get chiaveLivello(): string { return chiaveBuilder(this.posizione); }
  get titoloHeader(): string { return titoloBuilder(this.posizione); }
  get etichettaSu(): string { return etichettaSuBuilder(this.posizione); }
  get etichettaFatto(): string { return etichettaFattoBuilder(this.posizione); }

  /**
   * "Salva e attiva" in basso: sull'elenco (non dentro un giorno o un piano, dove
   * il gesto e' "Fatto") e solo se il protocollo non e' gia' quello attivo.
   */
  get conBarraAttiva(): boolean {
    return !this.loading && !this.errorMsg && !!this.protocol && this.livello === 0 && this.protocol.status !== 'active';
  }

  /** Da che parte entra la schermata che si sta per vedere: la legge il template. */
  direzione: 'avanti' | 'indietro' = 'avanti';
  private chiaveAttuale: string | null = null;
  /** Fin dove era scorsa ogni schermata quando la si e' lasciata: salendo o tornando a una scheda si riparte da li'. */
  private scrollPerChiave = new Map<string, number>();
  private toccoIniziale: { x: number; y: number } | null = null;

  @ViewChild(IonContent, { read: ElementRef }) private contenuto?: ElementRef<HTMLElement>;

  /** Il contenitore che scorre di ion-content: sta nel suo shadow DOM. */
  private scrollEl(): HTMLElement | null {
    return this.contenuto?.nativeElement.shadowRoot?.querySelector<HTMLElement>('.inner-scroll') ?? null;
  }

  /**
   * Quando cambia schermata: ricorda dov'era scorsa quella che si lascia, decide
   * da che parte entra la nuova e dove parte (dall'alto se si scende in un
   * giorno o in un esercizio, da dove era se si sale o si torna a una scheda).
   * Gira prima del disegno, cosi' la direzione e' gia' quella giusta.
   */
  ngDoCheck(): void {
    const chiave = this.chiaveLivello;
    if (chiave === this.chiaveAttuale) return;
    const el = this.scrollEl();
    if (this.chiaveAttuale !== null && el) this.scrollPerChiave.set(this.chiaveAttuale, el.scrollTop);
    this.direzione = direzioneBuilder(this.chiaveAttuale, chiave);
    this.chiaveAttuale = chiave;
    const riprende = (this.livello === 0 || this.direzione === 'indietro') && this.scrollPerChiave.has(chiave);
    const dove = riprende ? this.scrollPerChiave.get(chiave)! : 0;
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => { const e = this.scrollEl(); if (e) e.scrollTop = dove; });
    }
    this.aggiornaSwipe();
  }

  /**
   * Lo swipe indietro di Ionic esce dall'editor intero: va bene solo
   * sull'elenco e senza modifiche da perdere (con le modifiche c'e' la guardia, e
   * il gesto non puo' aspettarla). Dentro un giorno o un piano il gesto e' un
   * altro: sale di un livello (vedi alTocco).
   */
  aggiornaSwipe(): void {
    if (this.livello === 0 && !this.haModificheNonSalvate()) this.swipe.riaccendi();
    else this.swipe.spegni();
  }

  /** Cambia scheda. Il selettore sta fisso in alto: si cambia da qualunque punto dell'elenco. */
  vaAScheda(scheda: Tab): void {
    if (this.tab === scheda) return;
    this.tab = scheda;
    this.cdr.detectChanges();
  }

  /** La freccia della testata (e lo swipe dal bordo) dentro un livello: sale di uno. */
  async saliDiUnLivello(): Promise<void> {
    const l = this.livello;
    if (l === 0) return;
    if (this.tab === 'scheda') {
      if (l === 2) {
        // Un esercizio nuovo non e' ancora nel giorno: uscendo cosi' si butta. Se c'e'
        // scritto qualcosa si chiede, come per le altre modifiche non salvate.
        const ee = this.editingExercise!;
        if (ee.isNew && this.esercizioScritto(ee.ex)) {
          const ok = await this.confirm.confirm('Scartare questo esercizio? Non è ancora nel giorno.', {
            confirmLabel: 'Scarta', dangerous: true
          });
          if (!ok) return;
        }
        this.cancelExercise();
      } else {
        this.closeDay();
      }
      return;
    }
    if (l === 2) this.closeMeal(); else this.closePlan();
  }

  /** "Fatto" della testata: lo stesso gesto del tasto in fondo alla pagina, senza scorrere fin la'. */
  async confermaLivello(): Promise<void> {
    const l = this.livello;
    if (l === 0) return;
    if (this.tab === 'scheda') {
      if (l === 2) this.saveExercise(); else await this.saveDay();
      return;
    }
    if (l === 2) this.closeMeal(); else this.closePlan();
  }

  private esercizioScritto(ex: Exercise): boolean {
    // Serie e ripetizioni partono gia' compilate: scritto e' quello che ha aggiunto chi lo inserisce.
    return !!(ex.name?.trim() || ex.note?.trim());
  }

  /** Il dito parte dal bordo sinistro: potrebbe essere lo swipe per salire di un livello. */
  alToccoInizio(e: TouchEvent): void {
    const t = e.touches[0];
    this.toccoIniziale = t && t.clientX <= 24 ? { x: t.clientX, y: t.clientY } : null;
  }

  alToccoFine(e: TouchEvent): void {
    const inizio = this.toccoIniziale;
    this.toccoIniziale = null;
    if (!inizio || this.livello === 0) return;
    const t = e.changedTouches[0];
    if (t && t.clientX - inizio.x > 70 && Math.abs(t.clientY - inizio.y) < 60) void this.saliDiUnLivello();
  }

  ionViewWillLeave(): void {
    this.swipe.riaccendi();
  }

  /**
   * Tornando qui da "Aggiorna da PDF" la pagina e' quella di prima, con in
   * memoria il protocollo di prima: ma il PDF ha riscritto quello salvato, e
   * un Salva da qui avrebbe rimesso i dati vecchi. Il servizio dice quando un
   * protocollo viene scritto (changed$): se e' stato qualcun altro - non un
   * salvataggio di questa pagina - al rientro si ricarica, modifiche non
   * salvate comprese (la guardia ha gia' chiesto prima di partire). Se non e'
   * successo niente - si torna da un'altra tab, o dalla lista - si tiene
   * quello che c'e'. Niente lettura a ogni rientro e niente confronto fra
   * date: si ricarica solo quando c'e' davvero qualcosa di nuovo.
   */
  private salvatoAltrove = false;
  /** true solo mentre questa pagina scrive: il changed$ che ne segue e' suo, non di un altro. */
  private scrivendoDaQui = false;
  private changedSub: Subscription | null = null;

  private ricaricaSeScrittoAltrove(): void {
    if (!this.salvatoAltrove) return;
    this.salvatoAltrove = false;
    if (!this.protocol || this.loading || !this.protocolId) return;
    this.editingDay = null;
    this.editingPlan = null;
    this.editingMeal = null;
    this.editingExercise = null;
    void this.caricaProtocollo();
  }

  private fotografia(): string {
    const p = this.protocol;
    if (!p) return '';
    // Le caselle vuote che l'editor tiene pronte (vedi preparaCaselle) non sono una
    // modifica: chi ha solo guardato un pasto non deve sentirsi chiedere se scartare.
    return JSON.stringify({
      name: p.name, workout: p.workout, diet: senzaCaselleVuote(p.diet), ...this.cicloDaSalvare(), running: p.running, infoNote: p.infoNote
    });
  }

  /** Il protocollo in memoria non e' piu' quello salvato: vedi uscitaSenzaPerdite. */
  haModificheNonSalvate(): boolean {
    return !!this.protocol && !this.loading && !this.uscitaConsentita
      && this.baseline !== '' && this.fotografia() !== this.baseline;
  }

  /**
   * Questa pagina e' dove si atterra subito dopo aver caricato i PDF, cioe'
   * nel momento in cui la connessione ha appena finito di lavorare. Una
   * lettura Firestore li' puo' restare sospesa a tempo indeterminato senza
   * mai risolversi ne' rigettarsi - e' lo stesso motivo per cui
   * FirebaseService forza il long-polling - e senza un limite di tempo la
   * schermata restava su "Caricamento..." per sempre, senza dire niente e
   * senza un modo per riprovare. Succedeva davvero: il protocollo era
   * salvato e corretto, ma la pagina non lo mostrava mai.
   */
  load(): Promise<void> {
    return this.caricaProtocollo();
  }

  private async caricaProtocollo(): Promise<void> {
    this.loading = true;
    this.errorMsg = '';
    this.cdr.detectChanges();

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      const protocollo = await Promise.race([
        this.protocolSvc.get(this.protocolId),
        timeout
      ]);
      if (!protocollo) { this.nav.navigateBack(['/scheda/protocolli']); return; }
      this.protocol = protocollo;
      // Il form ha sempre qualcosa a cui legarsi: i protocolli creati prima della
      // sezione Corsa non hanno l'obiettivo, quelli salvati quando era in
      // chilometri hanno un campo che non esiste piu'. Un obiettivo a zero vale
      // come "non impostato" e il cliente non vede barre.
      this.protocol.running = normalizeRunGoal(this.protocol.running);
      // Un esercizio a onda con la stessa progressione del programma ne aveva una copia:
      // da qui in poi la segue, e cambiando il programma cambia anche lui.
      senzaCopieDelProgramma(this.protocol.workout.days, this.protocol.workout.weekPlan);
    } catch (e: any) {
      console.error('Errore caricamento protocollo:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Il protocollo è salvato: controlla la rete e riprova.'
        : 'Errore nel caricamento del protocollo. Riprova.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
      // Dopo il disegno: quello che il template mette a posto da solo e' gia' dentro.
      this.baseline = this.protocol && !this.errorMsg ? this.fotografia() : '';
    }
  }

  // ===== Scheda =====

  /** Aggiunge un giorno e ci entra subito: chi lo crea lo vuole riempire. */
  addDay(): void {
    if (!this.protocol) return;
    const days = this.protocol.workout.days;
    const id = this.idGiornoLibero();
    const day: Day = { id, label: `Giorno ${days.length + 1}`, rec: '60-90"', ex: [] };
    days.push(day);
    this.openDay(day, days.length - 1);
  }

  /**
   * Un id di giorno che nessun altro ha. L'id e' quello con cui si riconoscono le sedute
   * fatte e le bozze: togliendo un giorno di mezzo e aggiungendone un altro, "day" + il
   * numero dei giorni darebbe quello di un giorno che c'e' ancora, e i due si confonderebbero.
   */
  private idGiornoLibero(): string {
    const usati = new Set(this.protocol?.workout.days.map(d => d.id));
    let n = (this.protocol?.workout.days.length ?? 0) + 1;
    while (usati.has(`day${n}`)) n++;
    return `day${n}`;
  }

  /**
   * Copia il giorno aperto, subito dopo di lui, e apre la copia: due giorni quasi uguali
   * (A e B, spinta e tirata) si scrivono una volta e si ritoccano, non si riscrivono da
   * zero. Gli esercizi sono copie vere: cambiarne uno nel nuovo giorno non tocca l'altro.
   */
  duplicaGiorno(): void {
    if (!this.protocol || !this.editingDay) return;
    const { day, index } = this.editingDay;
    const copia: Day = {
      ...structuredClone(day),
      id: this.idGiornoLibero(),
      label: day.label ? `${day.label} (copia)` : ''
    };
    this.protocol.workout.days.splice(index + 1, 0, copia);
    this.toast.success('Giorno duplicato ✓');
    this.openDay(copia, index + 1);
  }

  openDay(day: Day, index: number): void {
    this.editingDay = { day, index };
    this.fineRiordino();
    this.cdr.detectChanges();
  }

  /** Torna all'elenco. Non scrive niente: il salvataggio e' un gesto a parte. */
  closeDay(): void {
    this.editingDay = null;
    this.fineRiordino();
    this.cdr.detectChanges();
  }

  async removeDay(i: number): Promise<void> {
    const giorno = this.protocol?.workout.days[i];
    if (!giorno) return;
    const quanti = giorno.ex.length;
    const ok = await this.confirm.confirm(
      `Rimuovere "${giorno.label}"?` +
      (quanti > 0 ? ` Se ne vanno anche i suoi ${quanti} esercizi.` : '')
    );
    if (!ok) return;
    this.protocol?.workout.days.splice(i, 1);
    if (this.editingDay?.index === i) this.editingDay = null;
    this.fineRiordino();
    this.cdr.detectChanges();
  }

  /** Quanti esercizi ha un giorno, detto come lo legge il cliente. */
  dayCount(day: Day): string {
    const n = day.ex.length;
    if (n === 0) return 'Nessun esercizio';
    return n === 1 ? '1 esercizio' : `${n} esercizi`;
  }

  // --- Riordinare gli esercizi di un giorno ---
  //
  // L'ordine e' quello in cui si fanno: e' il numero che il cliente vede sul
  // badge e quello con cui ci si dice a che punto si e'. Si riordina solo qui,
  // non nell'allenamento: li' un esercizio fatto fuori ordine si fa e basta, e
  // spostare le righe mentre si e' a meta' vorrebbe dire perderle.

  /** Entra o esce dal modo "Riordina". */
  toggleRiordino(): void {
    this.riordinando = !this.riordinando;
    this.annuncioRiordino = '';
    this.cdr.detectChanges();
  }

  private fineRiordino(): void {
    this.riordinando = false;
    this.annuncioRiordino = '';
  }

  /** Il rilascio del trascinamento: l'esercizio va dove e' stato lasciato. */
  rilasciaEsercizio(day: Day, e: CdkDragDrop<Exercise[]>): void {
    if (e.previousIndex === e.currentIndex) return;
    moveItemInArray(day.ex, e.previousIndex, e.currentIndex);
    this.annunciaSpostamento(day, e.currentIndex);
    this.cdr.detectChanges();
  }

  /**
   * Un posto su o giu' dalla tastiera, con le frecce sulla maniglia: la presa
   * col dito non ha un equivalente per chi non lo usa. Al bordo non succede
   * niente. Spostato l'esercizio cambia posto anche il suo elemento, e col
   * nodo se ne va il focus: si rimette sulla stessa maniglia, che e' dove chi
   * usa la tastiera sta lavorando.
   */
  spostaEsercizio(day: Day, indice: number, passo: -1 | 1, evento?: Event): void {
    // Le frecce scorrerebbero anche la pagina.
    evento?.preventDefault();
    const arrivo = indice + passo;
    if (arrivo < 0 || arrivo >= day.ex.length) return;
    moveItemInArray(day.ex, indice, arrivo);
    this.annunciaSpostamento(day, arrivo);
    this.cdr.detectChanges();
    (evento?.target as HTMLElement | null)?.focus?.();
  }

  private annunciaSpostamento(day: Day, posizione: number): void {
    const nome = day.ex[posizione]?.name?.trim() || 'Esercizio senza nome';
    this.annuncioRiordino = `${nome}: posizione ${posizione + 1} di ${day.ex.length}`;
  }

  // --- Editor esercizio (nome, muscolo, serie e ripetizioni, progressione settimanale se wave) ---

  /** Apre l'editor su un esercizio, nuovo o gia' nel giorno. */
  private apriEditor(day: Day, ex: Exercise, isNew: boolean): void {
    this.editingExercise = {
      day, ex, isNew,
      // Le ripetizioni gia' diverse da serie a serie si vedono subito per serie.
      diverse: !ex.cluster && !ripetizioniUguali(ex.reps),
      // Un esercizio gia' scritto ha il suo gruppo: il nome non lo tocca.
      muscoloManuale: !isNew
    };
  }

  /** Il nuovo esercizio parte come quello che lo precede nel giorno: serie, ripetizioni, gruppo. */
  addExercise(day: Day): void {
    this.apriEditor(day, nuovoEsercizio(day.ex[day.ex.length - 1]), true);
    this.cdr.detectChanges();
  }

  editExercise(day: Day, ex: Exercise): void {
    // Nel modo Riordina le righe non si aprono.
    if (this.riordinando) return;
    this.apriEditor(day, ex, false);
    this.cdr.detectChanges();
  }

  /** Il nome dice gia' il gruppo: finche' chi scrive non lo sceglie a mano, lo segue. */
  onNomeChange(ee: NonNullable<ProtocolloBuilderComponent['editingExercise']>, nome: string): void {
    ee.ex.name = nome;
    if (ee.muscoloManuale) return;
    const gruppo = muscoloDaNome(nome);
    if (gruppo) ee.ex.muscle = gruppo;
  }

  scegliMuscolo(ee: NonNullable<ProtocolloBuilderComponent['editingExercise']>, gruppo: string): void {
    ee.ex.muscle = gruppo;
    ee.muscoloManuale = true;
  }

  saveExercise(): void {
    if (!this.editingExercise) return;
    const { day, ex, isNew } = this.editingExercise;
    if (isNew) day.ex.push(ex);
    this.editingExercise = null;
    this.cdr.detectChanges();
  }

  /** Un esercizio senza nome non si aggiunge: e' una riga vuota nel giorno. */
  haNome(ex: Exercise): boolean {
    return !!ex.name?.trim();
  }

  /** Salva l'esercizio e ne apre subito un altro, gia' mezzo scritto: per riempire un giorno di seguito. */
  saveExerciseAndAddAnother(): void {
    const ee = this.editingExercise;
    if (!ee || !ee.isNew || !this.haNome(ee.ex)) return;
    ee.day.ex.push(ee.ex);
    this.toast.success(`${ee.ex.name.trim()} aggiunto ✓`);
    this.apriEditor(ee.day, nuovoEsercizio(ee.ex), true);
    this.cdr.detectChanges();
    // La pagina e' la stessa: si torna in cima e si rimette il cursore sul nome.
    (this.contenuto?.nativeElement as { scrollToTop?: (ms?: number) => unknown } | undefined)?.scrollToTop?.(0);
    queueMicrotask(() => (document.querySelector('app-protocollo-builder ion-input[label="Nome"]') as { setFocus?: () => unknown } | null)?.setFocus?.());
  }

  cancelExercise(): void {
    this.editingExercise = null;
    this.cdr.detectChanges();
  }

  removeExerciseFromEditor(): void {
    if (!this.editingExercise) return;
    const { day, ex } = this.editingExercise;
    const idx = day.ex.indexOf(ex);
    if (idx >= 0) day.ex.splice(idx, 1);
    this.editingExercise = null;
    this.cdr.detectChanges();
  }

  /** Il segmento "Sempre uguali / Wave". */
  cambiaSchema(ex: Exercise, ev: Event): void {
    const v = (ev as CustomEvent<{ value?: string | number | null }>).detail?.value;
    if ((v !== 'plain' && v !== 'wave') || v === ex.scheme) return;
    ex.scheme = v;
    this.onSchemeChange(ex);
  }

  onSchemeChange(ex: Exercise): void {
    if (ex.scheme === 'plain') {
      // Serie e ripetizioni tornano come erano: restano scritte anche mentre l'esercizio e' a onda.
      if (!ex.reps || ex.reps.length !== ex.sets) impostaSerie(ex, ex.sets);
    }
    // A onda un esercizio segue la progressione del programma; ne ha una sua solo se la si personalizza.
    if (ex.scheme === 'wave') delete ex.cluster;
    this.cdr.detectChanges();
  }

  // --- Serie e ripetizioni --------------------------------------------------
  //
  // Un'informazione sola in un posto solo: il numero di serie e quello delle
  // ripetizioni (uguali per tutte, o una per serie se si apre "diverse per serie").

  /** Un passo sul numero di serie dai pulsanti − e +. */
  cambiaSerie(ee: NonNullable<ProtocolloBuilderComponent['editingExercise']>, delta: number): void {
    this.onSerie(ee, (ee.ex.sets || 1) + delta);
  }

  onSerie(ee: NonNullable<ProtocolloBuilderComponent['editingExercise']>, valore: unknown): void {
    impostaSerie(ee.ex, valore);
    if (ee.ex.cluster) this.syncClusterReps(ee.ex);
  }

  /**
   * Il numero scritto nel campo, a campo confermato. Un campo vuoto o fuori misura
   * torna a un valore valido, anche quando e' lo stesso di prima (e il campo,
   * che non lo sa, resterebbe vuoto).
   */
  onSerieScritte(ee: NonNullable<ProtocolloBuilderComponent['editingExercise']>, ev: Event): void {
    this.onSerie(ee, (ev as CustomEvent<{ value?: unknown }>).detail?.value);
    const campo = ev.target as { value?: unknown } | null;
    if (campo) campo.value = ee.ex.sets;
  }

  /** Le ripetizioni uguali per tutte le serie, come testo: "10" o "8-10". */
  repsComuni(ex: Exercise): string {
    return ripetizioniComuni(ex.reps);
  }

  cambiaRipetizioni(ex: Exercise, delta: number): void {
    const nuovo = passoRipetizioni(ripetizioniComuni(ex.reps), delta);
    if (nuovo !== null) impostaRipetizioniUguali(ex, nuovo);
  }

  /** Un intervallo come "8-10" non ha un passo: i pulsanti − e + si spengono. */
  repsHannoPasso(ex: Exercise): boolean {
    return passoRipetizioni(ripetizioniComuni(ex.reps), 1) !== null;
  }

  onRipetizioniUguali(ex: Exercise, valore: unknown): void {
    impostaRipetizioniUguali(ex, String(valore ?? '').trim());
  }

  /**
   * Accende e spegne "diverse per serie". Spegnere vuol dire dare a tutte le
   * serie le ripetizioni della prima: le altre si perdono, ed e' quello che chi
   * lo spegne sta chiedendo.
   */
  impostaRipetizioniDiverse(ee: NonNullable<ProtocolloBuilderComponent['editingExercise']>, acceso: boolean): void {
    if (acceso === ee.diverse) return;
    ee.diverse = acceso;
    if (!acceso) impostaRipetizioniUguali(ee.ex, ripetizioniComuni(ee.ex.reps));
  }

  /** Le ripetizioni di una serie sola. Le righe si seguono per posizione (perIndice): scrivendo, il campo non perde il cursore. */
  onRepSerie(ex: Exercise, indice: number, valore: unknown): void {
    if (!ex.reps) return;
    ex.reps[indice] = String(valore ?? '').trim();
  }

  perIndice(indice: number): number {
    return indice;
  }

  // --- Serie a cluster -------------------------------------------------------
  //
  // Il cluster descrive com'e' fatta UNA serie: "4x8+8" sono quattro serie di
  // due blocchi da otto. Il quattro resta dov'e' sempre stato, nel campo
  // "N. serie": qui si scrive solo quello che sta dentro la serie.

  readonly maxBlocks = MAX_BLOCKS_PER_SET;
  readonly minClusterRest = CLUSTER_MIN_REST;

  isCluster(ex: Exercise): boolean {
    return !!ex.cluster;
  }

  /** Il tipo di serie, per la select: una stringa perche' ngModel possa legarla. */
  serieType(ex: Exercise): 'normale' | 'cluster' {
    return ex.cluster ? 'cluster' : 'normale';
  }

  setSerieType(ex: Exercise, tipo: 'normale' | 'cluster'): void {
    if (tipo === 'cluster') {
      if (!ex.cluster) ex.cluster = newCluster();
      this.syncClusterReps(ex);
    } else {
      delete ex.cluster;
      // Le ripetizioni tornano normali, come se il cluster non ci fosse mai
      // stato: lasciare "8+8" in ogni cella direbbe il contrario.
      impostaRipetizioniUguali(ex, String(RIPETIZIONI_PREDEFINITE));
    }
    this.cdr.detectChanges();
  }

  /**
   * A esaurimento il blocco e' uno solo: quanti se ne fanno lo decide la
   * palestra. Tenerne scritti altri prometterebbe un numero che il piano non
   * puo' conoscere.
   */
  setClusterEnd(ex: Exercise, end: 'fixed' | 'open'): void {
    if (!ex.cluster) return;
    ex.cluster.end = end;
    if (end === 'open') ex.cluster.blocks = ex.cluster.blocks.slice(0, 1);
    else if (ex.cluster.blocks.length < 2) ex.cluster.blocks = [...ex.cluster.blocks, ex.cluster.blocks[0] ?? 8];
    this.syncClusterReps(ex);
    this.cdr.detectChanges();
  }

  addBlock(ex: Exercise): void {
    const c = ex.cluster;
    if (!c || c.end === 'open' || c.blocks.length >= MAX_BLOCKS_PER_SET) return;
    c.blocks = [...c.blocks, c.blocks[c.blocks.length - 1] ?? 8];
    this.syncClusterReps(ex);
    this.cdr.detectChanges();
  }

  removeBlock(ex: Exercise, i: number): void {
    const c = ex.cluster;
    // Sotto i due blocchi non e' piu' un cluster: e' una serie normale, e si
    // toglie dalla select del tipo, non svuotando l'elenco.
    if (!c || c.end === 'open' || c.blocks.length <= 2) return;
    c.blocks = c.blocks.filter((_, j) => j !== i);
    this.syncClusterReps(ex);
    this.cdr.detectChanges();
  }

  onBlockReps(ex: Exercise, i: number, value: any): void {
    const c = ex.cluster;
    if (!c) return;
    const n = Math.floor(Number(value));
    c.blocks = c.blocks.map((b, j) => (j === i ? (isFinite(n) && n > 0 ? n : b) : b));
    this.syncClusterReps(ex);
  }

  onClusterRest(ex: Exercise, value: any): void {
    const c = ex.cluster;
    if (!c) return;
    const n = Math.floor(Number(value));
    c.restSec = isFinite(n) && n >= CLUSTER_MIN_REST ? n : CLUSTER_MIN_REST;
    this.syncClusterReps(ex);
  }

  /** Lo schema come lo scriverebbe a mano: "4x8+8", "2x5+30"". */
  clusterScheme(ex: Exercise): string {
    return ex.cluster ? clusterScheme(ex.cluster, Math.max(1, ex.sets || 1)) : '';
  }

  clusterRestLabel(c: ClusterSpec): string {
    return formatClusterRest(c.restSec);
  }

  /**
   * Le ripetizioni per serie restano scritte anche con un cluster: sono il
   * riassunto della serie ("8+8"), e chi legge il protocollo senza sapere dei
   * cluster vede comunque qualcosa di vero invece di celle vuote.
   */
  private syncClusterReps(ex: Exercise): void {
    if (!ex.cluster) return;
    const label = clusterLabel(ex.cluster);
    ex.reps = Array.from({ length: Math.max(1, ex.sets || 1) }, () => label);
  }

  // --- La progressione: del programma, e dell'esercizio che la personalizza ---------

  /** La progressione del programma si apre e si chiude dalla riga "Progressione settimanale". */
  progressioneAperta = false;

  toggleProgressione(): void {
    this.progressioneAperta = !this.progressioneAperta;
  }

  /** "8 settimane · 4×10 → 3×8": la progressione del programma in una riga. */
  get riepilogoProgramma(): string {
    return riepilogoProgressione(this.protocol?.workout.weekPlan);
  }

  get settimaneProgramma(): WeekPlan[] {
    return this.protocol?.workout.weekPlan ?? [];
  }

  readonly settimaneMin = SETTIMANE_MIN;
  readonly settimaneMax = SETTIMANE_MAX;

  addSettimanaProgramma(): void {
    const p = this.protocol;
    if (!p || p.workout.weekPlan.length >= SETTIMANE_MAX) return;
    p.workout.weekPlan = [...p.workout.weekPlan, settimanaInPiu(p.workout.weekPlan)];
    this.cdr.detectChanges();
  }

  /** Il programma ha almeno una settimana: senza, "Settimana 1 di 0". */
  removeSettimanaProgramma(i: number): void {
    const p = this.protocol;
    if (!p || p.workout.weekPlan.length <= SETTIMANE_MIN) return;
    p.workout.weekPlan = p.workout.weekPlan.filter((_, j) => j !== i);
    this.cdr.detectChanges();
  }

  /** L'esercizio a onda segue il programma finche' non ha una progressione sua. */
  segueProgramma(ex: Exercise): boolean {
    return !ex.weekPlan?.length;
  }

  /** Parte dalla progressione del programma: da li' si cambia solo quello che serve a questo esercizio. */
  personalizzaProgressione(ex: Exercise): void {
    ex.weekPlan = settimaneDaProgramma(this.protocol?.workout.weekPlan);
    this.cdr.detectChanges();
  }

  /** Tornare al programma butta quella dell'esercizio: se e' diversa si chiede prima. */
  async tornaAlProgramma(ex: Exercise): Promise<void> {
    if (!ex.weekPlan?.length) return;
    if (!stessaProgressione(ex.weekPlan, this.protocol?.workout.weekPlan)) {
      const ok = await this.confirm.confirm('Usare la progressione del programma? Quella di questo esercizio si perde.', {
        confirmLabel: 'Usa quella del programma', dangerous: true
      });
      if (!ok) return;
    }
    delete ex.weekPlan;
    this.cdr.detectChanges();
  }

  addExWeek(ex: Exercise): void {
    ex.weekPlan = [...(ex.weekPlan ?? []), settimanaInPiu(ex.weekPlan)];
    this.cdr.detectChanges();
  }

  /** Senza piu' settimane l'esercizio torna a seguire il programma, invece di restare con una progressione vuota. */
  removeExWeek(ex: Exercise, i: number): void {
    ex.weekPlan?.splice(i, 1);
    if (ex.weekPlan && ex.weekPlan.length === 0) delete ex.weekPlan;
    this.cdr.detectChanges();
  }

  exerciseSummary(ex: Exercise): string {
    if (ex.scheme === 'wave') {
      const n = ex.weekPlan?.length ?? 0;
      return n > 0 ? `Wave · ${n === 1 ? '1 settimana' : `${n} settimane`}` : 'Wave · come il programma';
    }
    if (ex.cluster) return this.clusterScheme(ex);
    return riepilogoSerie(ex);
  }

  // ===== Dieta =====

  addDietPlan(): void {
    if (!this.protocol) return;
    try {
      if (!Array.isArray(this.protocol.diet)) this.protocol.diet = [];
      const plan = newDietPlan('Nuova dieta');
      this.protocol.diet.push(plan);
      this.editingPlan = plan;
    } catch (e: any) {
      console.error('Errore aggiunta piano dieta:', e);
      this.saveMsg = 'Errore nell\'aggiungere il piano. Riprova.';
    } finally {
      this.cdr.detectChanges();
    }
  }

  openPlan(plan: DietPlan): void {
    this.editingPlan = plan;
    this.editingMeal = null;
    this.cdr.detectChanges();
  }

  closePlan(): void {
    this.editingPlan = null;
    this.editingMeal = null;
    this.cdr.detectChanges();
  }

  removePlan(plan: DietPlan, event: Event): void {
    event.stopPropagation();
    if (!this.protocol) return;
    this.protocol.diet = this.protocol.diet.filter(p => p.id !== plan.id);
    if (this.editingPlan?.id === plan.id) this.editingPlan = null;
  }

  /** "Rimuovi piano" da dentro il piano: chi non scorre le righe lo toglie da qui. */
  removePlanFromEditor(): void {
    if (!this.protocol || !this.editingPlan) return;
    const id = this.editingPlan.id;
    this.protocol.diet = this.protocol.diet.filter(p => p.id !== id);
    this.editingPlan = null;
    this.editingMeal = null;
    this.cdr.detectChanges();
  }

  // --- Il tipo di dieta (vedi dieta-ciclo.util) ---

  /** ON/OFF o ciclica. Un protocollo senza tipo e' ON/OFF, come tutti quelli di prima. */
  get tipoDieta(): TipoDieta {
    return this.protocol?.dietType === 'ciclica' ? 'ciclica' : 'onoff';
  }

  /** Passando a ciclica il primo giorno parte da oggi, se non ce n'era gia' uno. */
  cambiaTipoDieta(ev: Event): void {
    const v = (ev as CustomEvent<{ value?: string | number | null }>).detail?.value;
    if (!this.protocol || (v !== 'onoff' && v !== 'ciclica') || v === this.tipoDieta) return;
    this.protocol.dietType = v;
    if (v === 'ciclica' && !this.protocol.dietCycleStart) this.protocol.dietCycleStart = todayLocalISO();
  }

  /**
   * Cosa si salva del tipo. Il primo giorno vale solo per la ciclica: tornando
   * a ON/OFF non si scrive, e un ON/OFF scelto e poi lasciato com'era non e'
   * una modifica da salvare.
   */
  private cicloDaSalvare(): { dietType: TipoDieta; dietCycleStart: string | null } {
    const tipo = this.tipoDieta;
    return { dietType: tipo, dietCycleStart: tipo === 'ciclica' ? this.protocol?.dietCycleStart || null : null };
  }

  /** La seconda riga di un piano nell'elenco: quanti pasti e quanti alimenti. */
  riassuntoPiano(plan: DietPlan): string {
    const pasti = plan.meals.length;
    const alimenti = this.countPlanItems(plan);
    return `${pasti} ${pasti === 1 ? 'pasto' : 'pasti'} · ${alimenti} ${alimenti === 1 ? 'alimento' : 'alimenti'}`;
  }

  countPlanItems(plan: DietPlan): number {
    return plan.meals.reduce((acc, meal) => acc + this.countMealItems(meal), 0);
  }

  addMeal(): void {
    if (!this.editingPlan) return;
    const meal = newNamedMeal('Nuovo pasto');
    this.editingPlan.meals.push(meal);
    this.editingMeal = meal;
    this.preparaPasto(meal);
    this.activeCombo[meal.id] = meal.combinations[0].id;
    this.cdr.detectChanges();
  }

  openMeal(meal: NamedMeal): void {
    this.editingMeal = meal;
    this.preparaPasto(meal);
    if (!this.activeCombo[meal.id]) this.activeCombo[meal.id] = meal.combinations[0].id;
    this.cdr.detectChanges();
  }

  closeMeal(): void {
    this.editingMeal = null;
    this.cdr.detectChanges();
  }

  removeMeal(meal: NamedMeal, event: Event): void {
    event.stopPropagation();
    if (!this.editingPlan) return;
    this.editingPlan.meals = this.editingPlan.meals.filter(m => m.id !== meal.id);
    if (this.editingMeal?.id === meal.id) this.editingMeal = null;
    this.cdr.detectChanges();
  }

  removeMealFromEditor(): void {
    if (!this.editingPlan || !this.editingMeal) return;
    this.editingPlan.meals = this.editingPlan.meals.filter(m => m.id !== this.editingMeal!.id);
    this.editingMeal = null;
    this.cdr.detectChanges();
  }

  // ===== Combinazioni (Base + alternative) =====

  activeCombo: Record<string, string> = {};

  getActiveCombo(meal: NamedMeal): MealCombination {
    const id = this.activeCombo[meal.id];
    return meal.combinations.find(c => c.id === id) ?? meal.combinations[0];
  }

  /** Il segmento delle combinazioni: dice quale si sta scrivendo. */
  scegliCombinazione(meal: NamedMeal, ev: Event): void {
    const id = (ev as CustomEvent<{ value?: string | number | null }>).detail?.value;
    const combo = meal.combinations.find(c => c.id === id);
    if (combo) this.setActiveCombo(meal, combo);
  }

  setActiveCombo(meal: NamedMeal, combo: MealCombination, event?: Event): void {
    event?.stopPropagation();
    this.activeCombo[meal.id] = combo.id;
    this.cdr.detectChanges();
  }

  addCombination(meal: NamedMeal): void {
    const n = meal.combinations.length + 1;
    const combo = newCombination(`Alternativa ${n - 1}`);
    this.preparaCaselle(combo);
    meal.combinations.push(combo);
    this.activeCombo[meal.id] = combo.id;
    this.cdr.detectChanges();
  }

  removeCombination(meal: NamedMeal, combo: MealCombination, event: Event): void {
    event.stopPropagation();
    if (meal.combinations.length <= 1) return; // deve restarne sempre almeno una (la base)
    meal.combinations = meal.combinations.filter(c => c.id !== combo.id);
    if (this.activeCombo[meal.id] === combo.id) this.activeCombo[meal.id] = meal.combinations[0].id;
    this.cdr.detectChanges();
  }

  countMealItems(meal: NamedMeal): number {
    const inCombos = meal.combinations.reduce((acc, c) =>
      acc + (c.carb ? 1 : 0) + (c.protein ? 1 : 0) + (c.fat ? 1 : 0), 0);
    const inAlt = this.foodCategories.reduce((acc, cat) => acc + meal.alternatives[cat].length, 0);
    return inCombos + inAlt;
  }

  /**
   * Ogni macro della combinazione ha la sua casella da riempire, anche vuota.
   *
   * Si prepara quando il pasto si apre o una casella si svuota, MAI mentre la
   * pagina si disegna: il template legge le caselle e basta. Quando a crearle
   * era la lettura, disegnare il pasto modificava il protocollo mentre Angular
   * stava controllando che non cambiasse (NG0100 in sviluppo) e la pagina
   * risultava "con modifiche non salvate" senza che nessuno avesse toccato nulla.
   */
  private preparaCaselle(combo: MealCombination): void {
    for (const cat of this.foodCategories) {
      if (!combo[cat]) combo[cat] = { name: '', qty: '', category: cat };
    }
  }

  private preparaPasto(meal: NamedMeal): void {
    meal.combinations.forEach(c => this.preparaCaselle(c));
  }

  clearComboItem(combo: MealCombination, cat: FoodCategory, event: Event): void {
    event.stopPropagation();
    combo[cat] = null;
    this.preparaCaselle(combo);
    this.cdr.detectChanges();
  }

  /** Il rilascio del trascinamento, com'e' chiamato dal template: sposta, poi rimette una casella vuota dove se n'e' svuotata una. */
  rilascia(combo: MealCombination, e: CdkDragDrop<ZonaDrop>): void {
    this.spostaAlimento(combo, e);
    this.preparaCaselle(combo);
  }

  // --- Alternative per macro (a livello di pasto, non di combinazione) ---
  // Un solo accordion "Alternative" per pasto, con i 3 macro raggruppati dentro.

  expandedAlt = new Set<string>();

  totalAlternatives(meal: NamedMeal): number {
    return this.foodCategories.reduce((acc, cat) => acc + meal.alternatives[cat].length, 0);
  }

  altItems(meal: NamedMeal, cat: FoodCategory): FoodItem[] {
    return meal.alternatives[cat];
  }

  addAltItem(meal: NamedMeal, cat: FoodCategory): void {
    meal.alternatives[cat].push({ name: '', qty: '', category: cat });
  }

  removeAltItem(meal: NamedMeal, cat: FoodCategory, item: FoodItem): void {
    const arr = meal.alternatives[cat];
    const idx = arr.indexOf(item);
    if (idx >= 0) arr.splice(idx, 1);
  }

  addSupplement(meal: NamedMeal): void {
    if (!meal.supplements) meal.supplements = [];
    meal.supplements.push({ name: '', qty: '' });
  }

  removeSupplement(meal: NamedMeal, item: SupplementItem): void {
    if (!meal.supplements) return;
    const idx = meal.supplements.indexOf(item);
    if (idx >= 0) meal.supplements.splice(idx, 1);
  }

  // --- Trascinare un alimento ---
  //
  // Un alimento puo' stare in tre posti diversi, e sono tutti lo stesso
  // alimento: la casella di un macro della combinazione, le alternative del
  // pasto per quel macro, le alternative di un singolo alimento. Spostarlo
  // da uno all'altro e' il mestiere del builder - promuovere un'alternativa
  // a principale, declassare il principale ad alternativa, correggere il
  // macro sotto cui e' finito - e prima si poteva fare solo cancellando e
  // riscrivendo, grammatura compresa.
  //
  // Per questo le zone sono collegate tutte fra loro e il gestore e' uno
  // solo: ognuna dichiara cos'e', e la combinazione di partenza e arrivo
  // decide cosa vuol dire "spostare" li' in mezzo.

  /**
   * Cosa c'e' sotto una zona che riceve.
   *
   * Una casella tiene un alimento solo (o nessuno), una lista ne tiene
   * quanti ne vuole: e' tutta qui la differenza che il gestore deve sapere.
   */
  zonaCasella(cat: FoodCategory): ZonaDrop {
    return { tipo: 'casella', cat };
  }

  zonaLista(items: FoodItem[]): ZonaDrop {
    return { tipo: 'lista', items };
  }

  /**
   * Sposta un alimento da una zona all'altra.
   *
   * Cinque casi, e nessuno perde niente:
   *
   * - lista -> stessa lista: si riordina;
   * - lista -> altra lista: si trasferisce;
   * - casella -> casella: si scambia, perche' due posti singoli non possono
   *   diventare uno pieno e uno doppio;
   * - lista -> casella: l'alimento entra nella casella, e quello che c'era
   *   prende il suo posto nella lista, esattamente dove stava l'altro;
   * - casella -> lista: la casella si svuota e l'alimento entra in lista.
   */
  spostaAlimento(combo: MealCombination, e: CdkDragDrop<ZonaDrop>): void {
    const da = e.previousContainer.data;
    const a = e.container.data;

    if (da.tipo === 'lista' && a.tipo === 'lista') {
      if (da.items === a.items) {
        if (e.previousIndex !== e.currentIndex) {
          moveItemInArray(a.items, e.previousIndex, e.currentIndex);
        }
      } else {
        transferArrayItem(da.items, a.items, e.previousIndex, e.currentIndex);
      }
      return;
    }

    if (da.tipo === 'casella' && a.tipo === 'casella') {
      if (da.cat === a.cat) return;
      const arrivato = combo[da.cat];
      combo[da.cat] = combo[a.cat];
      combo[a.cat] = arrivato;
      this.allineaMacro(combo[a.cat], a.cat);
      this.allineaMacro(combo[da.cat], da.cat);
      return;
    }

    if (da.tipo === 'lista' && a.tipo === 'casella') {
      const [promosso] = da.items.splice(e.previousIndex, 1);
      if (!promosso) return;
      const sfrattato = combo[a.cat];
      combo[a.cat] = promosso;
      // Quello che stava nella casella prende il posto lasciato libero: cosi'
      // un alimento non sparisce perche' se ne e' trascinato un altro sopra.
      if (sfrattato) da.items.splice(e.previousIndex, 0, sfrattato);
      this.allineaMacro(promosso, a.cat);
      return;
    }

    if (da.tipo === 'casella' && a.tipo === 'lista') {
      const declassato = combo[da.cat];
      if (!declassato) return;
      combo[da.cat] = null;
      a.items.splice(e.currentIndex, 0, declassato);
    }
  }

  /**
   * `category` dice da che macro viene un alimento, e serve solo a leggere i
   * protocolli vecchi, quando le alternative erano una lista piatta. Dopo uno
   * spostamento direbbe il falso: si aggiorna dov'e' gia' scritto, e non si
   * aggiunge dove non c'era.
   */
  private allineaMacro(item: FoodItem | null, cat: FoodCategory): void {
    if (item?.category) item.category = cat;
  }

  /** Riordina dentro una lista sola: integratori, alternative di un alimento. */
  riordina<T>(lista: T[], e: CdkDragDrop<T[]>): void {
    if (e.previousIndex === e.currentIndex) return;
    moveItemInArray(lista, e.previousIndex, e.currentIndex);
  }

  isAltExpanded(meal: NamedMeal): boolean {
    return this.expandedAlt.has(meal.id);
  }

  toggleAltExpanded(meal: NamedMeal, event?: Event): void {
    event?.stopPropagation();
    if (this.expandedAlt.has(meal.id)) this.expandedAlt.delete(meal.id);
    else this.expandedAlt.add(meal.id);
    this.cdr.detectChanges();
  }

  // --- Alternative del singolo alimento (item.alt), es. "Petto di pollo" -> Tacchino, Merluzzo...
  // Distinte da quelle a livello di pasto sopra: qui l'alternativa si applica solo a
  // quello specifico alimento della combinazione, non a tutto il pasto.

  private expandedItemAlt = new Set<string>();

  private itemAltKey(combo: MealCombination, cat: FoodCategory): string {
    return `${combo.id}:${cat}`;
  }

  itemAlt(item: FoodItem): { name: string; qty: string }[] {
    return item.alt ?? [];
  }

  isItemAltExpanded(combo: MealCombination, cat: FoodCategory): boolean {
    return this.expandedItemAlt.has(this.itemAltKey(combo, cat));
  }

  toggleItemAltExpanded(combo: MealCombination, cat: FoodCategory, event?: Event): void {
    event?.stopPropagation();
    const key = this.itemAltKey(combo, cat);
    if (this.expandedItemAlt.has(key)) this.expandedItemAlt.delete(key);
    else this.expandedItemAlt.add(key);
    this.cdr.detectChanges();
  }

  /** La prima alternativa di un alimento: la si aggiunge e la riga si apre, per scriverla. */
  aggiungiAlternativa(combo: MealCombination, cat: FoodCategory, item: FoodItem): void {
    this.expandedItemAlt.add(this.itemAltKey(combo, cat));
    this.addItemAltEntry(item);
  }

  addItemAltEntry(item: FoodItem): void {
    if (!item.alt) item.alt = [];
    item.alt.push({ name: '', qty: '' });
    this.cdr.detectChanges();
  }

  removeItemAltEntry(item: FoodItem, alt: { name: string; qty: string }): void {
    if (!item.alt) return;
    const idx = item.alt.indexOf(alt);
    if (idx >= 0) item.alt.splice(idx, 1);
    this.cdr.detectChanges();
  }

  // ===== Salvataggio =====

  /**
   * Salva restando nel builder: il coach ha finito un giorno, non il
   * protocollo. save() invece chiude e torna al cliente, che e' giusto quando
   * si e' finito davvero ma qui butterebbe fuori a meta' lavoro.
   */
  async saveDay(): Promise<void> {
    if (!await this.persist()) return;
    this.toast.success('Giorno salvato ✓');
    this.closeDay();
  }

  /**
   * Elimina il protocollo, dalla scheda Info. Chiede prima, come l'elenco dei
   * protocolli; poi si esce senza la domanda sulle modifiche non salvate: del
   * protocollo non resta niente da salvare.
   */
  async eliminaProtocollo(): Promise<void> {
    if (!this.protocol || !this.protocolId) return;
    const ok = await this.confirm.confirm(`Eliminare il protocollo "${this.protocol.name}"?`);
    if (!ok) return;
    try {
      await this.protocolSvc.delete(this.protocolId);
    } catch (e) {
      console.error('Errore eliminazione protocollo:', e);
      this.toast.error('Non sono riuscito a eliminarlo. Riprova.');
      return;
    }
    this.uscitaConsentita = true;
    this.nav.navigateBack(['/scheda/protocolli']);
  }

  async save(activateAfter: boolean): Promise<void> {
    if (!await this.persist()) return;

    if (!activateAfter) {
      // Su un protocollo attivo non e' una bozza: e' quello che si sta seguendo.
      this.toast.success(this.protocol?.status === 'draft' ? 'Bozza salvata ✓' : 'Salvato ✓');
      this.nav.navigateBack(['/scheda/protocolli']);
      return;
    }

    // L'attivazione e' una seconda scrittura: il tasto resta occupato anche
    // per lei, o sembrerebbe finito mentre sta ancora lavorando.
    this.saving = true;
    this.protocolBuilderState.saving.set(true);
    this.cdr.detectChanges();
    try {
      await this.protocolSvc.activate(this.protocolId);
      this.toast.success('Protocollo attivato ✓');
      this.nav.navigateBack(['/scheda/protocolli']);
    } catch (e: any) {
      console.error('Errore attivazione protocollo:', e);
      this.saveMsg = e?.message || 'Errore durante l\'attivazione.';
      this.toast.error('Errore durante l\'attivazione. Riprova.');
    } finally {
      this.saving = false;
      this.protocolBuilderState.saving.set(false);
      this.cdr.detectChanges();
    }
  }

  /**
   * Scrive il protocollo e controlla che sia arrivato davvero. Non naviga e
   * non dice niente: decide chi chiama. Torna false se qualcosa e' andato
   * storto, e in quel caso il messaggio e' gia' a schermo.
   */
  private async persist(): Promise<boolean> {
    if (!this.protocol) return false;
    this.saving = true;
    this.saveMsg = '';
    this.protocolBuilderState.saving.set(true);
    try {
      // La progressione del programma (quella di "Info", del riepilogo "Settimana X di N" e
      // degli esercizi a onda che la seguono) e' quella che si scrive in "Progressione
      // settimanale", non un aggregato da ricalcolare dagli esercizi: ricalcolarla la
      // azzererebbe ogni volta che gli esercizi la seguono. Si salvano valori leggibili, e
      // una copia fatta da un esercizio e rimasta uguale al programma torna a seguirlo.
      this.protocol.workout.weekPlan = ripulisciProgressione(this.protocol.workout.weekPlan);
      senzaCopieDelProgramma(this.protocol.workout.days, this.protocol.workout.weekPlan);

      const toSave = {
        name: this.protocol.name,
        workout: this.protocol.workout,
        // Le caselle vuote restano all'editor: nel protocollo salvato non ci sono.
        diet: senzaCaselleVuote(this.protocol.diet),
        ...this.cicloDaSalvare(),
        running: this.protocol.running,
        infoNote: this.protocol.infoNote
      };
      this.scrivendoDaQui = true;
      try {
        await this.protocolSvc.update(this.protocolId, toSave);
      } finally {
        this.scrivendoDaQui = false;
      }

      // Verifica reale: rileggo da Firestore e confronto i conteggi strutturali
      // con quello che intendevo salvare, invece di fidarmi solo dell'assenza di errori.
      const reread = await this.protocolSvc.get(this.protocolId);
      const mismatch = this.findMismatch(toSave, reread);
      if (mismatch) {
        this.saveMsg = `Attenzione: il salvataggio sembra incompleto (${mismatch}). Riprova prima di attivare.`;
        this.toast.error('Salvataggio incompleto, riprova.');
        return false;
      }
      // Quello in memoria ora e' quello salvato (progressione ripulita compresa).
      this.baseline = this.fotografia();
      return true;
    } catch (e: any) {
      console.error('Errore salvataggio protocollo:', e);
      this.saveMsg = e?.message || 'Errore durante il salvataggio.';
      this.toast.error('Errore durante il salvataggio. Riprova.');
      return false;
    } finally {
      this.saving = false;
      this.protocolBuilderState.saving.set(false);
      this.cdr.detectChanges();
    }
  }

  /** Confronta i conteggi strutturali tra quello che dovevo salvare e quello che e' stato letto da Firestore. */
  private findMismatch(expected: { workout: Protocol['workout']; diet: Protocol['diet'] }, actual: Protocol | null): string | null {
    if (!actual) return 'protocollo non trovato dopo il salvataggio';

    if (actual.workout.days.length !== expected.workout.days.length) {
      return `giorni salvati: ${actual.workout.days.length}, attesi: ${expected.workout.days.length}`;
    }
    for (let i = 0; i < expected.workout.days.length; i++) {
      const exp = expected.workout.days[i].ex.length;
      const act = actual.workout.days[i]?.ex.length ?? 0;
      if (exp !== act) {
        return `esercizi nel giorno "${expected.workout.days[i].label}": salvati ${act}, attesi ${exp}`;
      }
    }

    if (actual.diet.length !== expected.diet.length) {
      return `piani dieta salvati: ${actual.diet.length}, attesi: ${expected.diet.length}`;
    }
    for (let i = 0; i < expected.diet.length; i++) {
      const expPlan = expected.diet[i];
      const actPlan = actual.diet[i];
      if (!actPlan || actPlan.meals.length !== expPlan.meals.length) {
        return `pasti nel piano "${expPlan.name}": salvati ${actPlan?.meals.length ?? 0}, attesi ${expPlan.meals.length}`;
      }
      for (let j = 0; j < expPlan.meals.length; j++) {
        const expMeal = expPlan.meals[j];
        const actMeal = actPlan.meals[j];
        if (!actMeal || actMeal.combinations.length !== expMeal.combinations.length) {
          return `combinazioni nel pasto "${expMeal.name}": salvate ${actMeal?.combinations.length ?? 0}, attese ${expMeal.combinations.length}`;
        }
        for (let k = 0; k < expMeal.combinations.length; k++) {
          const expCombo = expMeal.combinations[k];
          const actCombo = actMeal.combinations[k];
          const expCount = (expCombo.carb ? 1 : 0) + (expCombo.protein ? 1 : 0) + (expCombo.fat ? 1 : 0);
          const actCount = actCombo ? (actCombo.carb ? 1 : 0) + (actCombo.protein ? 1 : 0) + (actCombo.fat ? 1 : 0) : 0;
          if (expCount !== actCount) {
            return `alimenti in "${expMeal.name} / ${expCombo.label}": salvati ${actCount}, attesi ${expCount}`;
          }
        }
      }
    }

    return null;
  }
}
