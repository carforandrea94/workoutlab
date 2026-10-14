import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
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
import { Day, Exercise, ClusterSpec } from '../../models/workout.model';
import {
  newCluster, clusterLabel, clusterScheme, formatClusterRest,
  CLUSTER_MIN_REST
} from '../../core/utils/cluster.util';
import { MAX_BLOCKS_PER_SET } from '../../core/utils/extra-sets.util';
import { RunGoal, normalizeRunGoal } from '../../models/run.model';
import { FoodItem, DietPlan, NamedMeal, MealCombination, SupplementItem, newDietPlan, newNamedMeal, newCombination, FoodCategory, FOOD_CATEGORIES, FOOD_CATEGORY_LABELS } from '../../models/diet.model';
import { ProtocolBuilderStateService } from '../../services/protocol-builder-state.service';
import { ToastService } from '../../services/toast.service';
import { PdfImportService } from '../../services/pdf-import.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { IONIC_PAGE, IONIC_LINKS } from '../../core/ionic-page';
import { NavController, IonInput, IonTextarea, IonSelect, IonSelectOption, IonSpinner } from '@ionic/angular';

type Tab = 'scheda' | 'dieta' | 'corsa' | 'info';

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
  imports: [IonInput, IonTextarea, IonSelect, IonSelectOption, IonSpinner, ...IONIC_PAGE, ...IONIC_LINKS, 
    CommonModule, FormsModule, LucideAngularModule,
    CdkDropListGroup, CdkDropList, CdkDrag, CdkDragHandle, CdkDragPlaceholder
  ],
  templateUrl: './protocollo-builder.component.html'
})
export class ProtocolloBuilderComponent implements OnInit, OnDestroy {
  protocolId = '';
  protocol: Protocol | null = null;
  loading = true;
  errorMsg = '';
  saving = false;
  saveMsg = '';
  private paramSub: Subscription | null = null;

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
  private _editingMeal: NamedMeal | null = null;
  get editingMeal(): NamedMeal | null { return this._editingMeal; }
  set editingMeal(val: NamedMeal | null) {
    this._editingMeal = val;
    this.syncEditingSubform();
  }

  private _editingExercise: { day: Day; ex: Exercise; isNew: boolean } | null = null;
  get editingExercise(): { day: Day; ex: Exercise; isNew: boolean } | null { return this._editingExercise; }
  set editingExercise(val: { day: Day; ex: Exercise; isNew: boolean } | null) {
    this._editingExercise = val;
    this.syncEditingSubform();
  }

  private syncEditingSubform(): void {
    this.protocolBuilderState.editingSubform.set(!!this._editingExercise || !!this._editingMeal);
  }

  readonly muscles = ['Petto', 'Spalle', 'Tricipiti', 'Dorso', 'Bicipiti', 'Gambe', 'Core'];

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
    private confirm: ConfirmDialogService
  ) {}

  ngOnInit(): void {
    this.protocolBuilderState.registerHandlers(() => this.save(false), () => this.save(true));
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.protocolId = params.get('protocolId') ?? '';
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
    this.protocolBuilderState.registerHandlers(null, null);
    this.protocolBuilderState.editingSubform.set(false);
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
    } catch (e: any) {
      console.error('Errore caricamento protocollo:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Il protocollo e\' salvato: controlla la rete e riprova.'
        : 'Errore nel caricamento del protocollo. Riprova.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  // ===== Scheda =====

  /** Aggiunge un giorno e ci entra subito: chi lo crea lo vuole riempire. */
  addDay(): void {
    if (!this.protocol) return;
    const n = this.protocol.workout.days.length + 1;
    const day: Day = { id: `day${n}`, label: `Giorno ${n}`, rec: '60-90"', ex: [] };
    this.protocol.workout.days.push(day);
    this.openDay(day, this.protocol.workout.days.length - 1);
  }

  openDay(day: Day, index: number): void {
    this.editingDay = { day, index };
    this.cdr.detectChanges();
  }

  /** Torna all'elenco. Non scrive niente: il salvataggio e' un gesto a parte. */
  closeDay(): void {
    this.editingDay = null;
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
    this.cdr.detectChanges();
  }

  /** Quanti esercizi ha un giorno, detto come lo legge il cliente. */
  dayCount(day: Day): string {
    const n = day.ex.length;
    if (n === 0) return 'Nessun esercizio';
    return n === 1 ? '1 esercizio' : `${n} esercizi`;
  }

  // --- Editor esercizio (nome, muscolo, schema, progressione settimanale se wave) ---

  addExercise(day: Day): void {
    const ex: Exercise = { name: '', scheme: 'plain', sets: 3, muscle: this.muscles[0], text: '', reps: ['', '', ''] };
    this.editingExercise = { day, ex, isNew: true };
    this.cdr.detectChanges();
  }

  editExercise(day: Day, ex: Exercise): void {
    this.editingExercise = { day, ex, isNew: false };
    this.cdr.detectChanges();
  }

  saveExercise(): void {
    if (!this.editingExercise) return;
    const { day, ex, isNew } = this.editingExercise;
    if (isNew) day.ex.push(ex);
    this.editingExercise = null;
    this.cdr.detectChanges();
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

  onSchemeChange(ex: Exercise): void {
    if (ex.scheme === 'plain' && (!ex.reps || ex.reps.length !== ex.sets)) {
      ex.reps = Array.from({ length: ex.sets }, () => '');
    }
    if (ex.scheme === 'wave') delete ex.cluster;
    if (ex.scheme === 'wave' && (!ex.weekPlan || ex.weekPlan.length === 0)) {
      ex.weekPlan = Array.from({ length: 8 }, () => ({ sets: 4, reps: 10 }));
    }
    this.cdr.detectChanges();
  }

  onSetsChange(ex: Exercise): void {
    const sets = Math.max(1, ex.sets || 1);
    ex.sets = sets;
    if (ex.cluster) { this.syncClusterReps(ex); return; }
    const reps = ex.reps ? [...ex.reps] : [];
    while (reps.length < sets) reps.push('');
    reps.length = sets;
    ex.reps = reps;
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
      // Le ripetizioni tornano a essere una per serie, come se il cluster non
      // ci fosse mai stato: lasciare "8+8" in ogni cella direbbe il contrario.
      ex.reps = Array.from({ length: Math.max(1, ex.sets || 1) }, () => '');
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

  repsAsString(ex: Exercise): string {
    return (ex.reps ?? []).join(', ');
  }

  setRepsFromString(ex: Exercise, value: string): void {
    ex.reps = value.split(',').map(s => s.trim());
  }

  addExWeek(ex: Exercise): void {
    if (!ex.weekPlan) ex.weekPlan = [];
    ex.weekPlan.push({ sets: 4, reps: 10 });
    this.cdr.detectChanges();
  }

  removeExWeek(ex: Exercise, i: number): void {
    ex.weekPlan?.splice(i, 1);
    this.cdr.detectChanges();
  }

  exerciseSummary(ex: Exercise): string {
    if (ex.scheme === 'wave') {
      const n = ex.weekPlan?.length ?? 0;
      return n > 0 ? `Wave · ${n} settimane` : 'Wave · da configurare';
    }
    if (ex.cluster) return this.clusterScheme(ex);
    return `${ex.sets}×${(ex.reps ?? []).join('-') || '?'}`;
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

  countPlanItems(plan: DietPlan): number {
    return plan.meals.reduce((acc, meal) => acc + this.countMealItems(meal), 0);
  }

  addMeal(): void {
    if (!this.editingPlan) return;
    const meal = newNamedMeal('Nuovo pasto');
    this.editingPlan.meals.push(meal);
    this.editingMeal = meal;
    this.activeCombo[meal.id] = meal.combinations[0].id;
    this.cdr.detectChanges();
  }

  openMeal(meal: NamedMeal): void {
    this.editingMeal = meal;
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

  setActiveCombo(meal: NamedMeal, combo: MealCombination, event?: Event): void {
    event?.stopPropagation();
    this.activeCombo[meal.id] = combo.id;
    this.cdr.detectChanges();
  }

  addCombination(meal: NamedMeal): void {
    const n = meal.combinations.length + 1;
    const combo = newCombination(`Alternativa ${n - 1}`);
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

  /** Ritorna l'alimento della combinazione per quella macro, creandolo (vuoto) se non esiste ancora. */
  getComboItem(combo: MealCombination, cat: FoodCategory): FoodItem {
    if (!combo[cat]) combo[cat] = { name: '', qty: '', category: cat };
    return combo[cat]!;
  }

  clearComboItem(combo: MealCombination, cat: FoodCategory, event: Event): void {
    event.stopPropagation();
    combo[cat] = null;
    this.cdr.detectChanges();
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

  async save(activateAfter: boolean): Promise<void> {
    if (!await this.persist()) return;

    if (!activateAfter) {
      this.toast.success('Bozza salvata ✓');
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
      // L'aggregato di progressione (usato da Info/riepilogo settimane) va
      // ricalcolato ad ogni salvataggio: se il coach ha modificato a mano la
      // progressione di un esercizio wave, questo lo tiene sincronizzato
      // invece di lasciarlo congelato al valore calcolato al momento
      // dell'import PDF.
      this.protocol.workout.weekPlan = this.pdfSvc.detectProtocolWeekPlan(
        this.protocol.workout.days,
        this.protocol.workout.weekPlan.length
      );

      const toSave = {
        name: this.protocol.name,
        workout: this.protocol.workout,
        diet: this.protocol.diet,
        running: this.protocol.running,
        infoNote: this.protocol.infoNote
      };
      await this.protocolSvc.update(this.protocolId, toSave);

      // Verifica reale: rileggo da Firestore e confronto i conteggi strutturali
      // con quello che intendevo salvare, invece di fidarmi solo dell'assenza di errori.
      const reread = await this.protocolSvc.get(this.protocolId);
      const mismatch = this.findMismatch(toSave, reread);
      if (mismatch) {
        this.saveMsg = `Attenzione: il salvataggio sembra incompleto (${mismatch}). Riprova prima di attivare.`;
        this.toast.error('Salvataggio incompleto, riprova.');
        return false;
      }
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
