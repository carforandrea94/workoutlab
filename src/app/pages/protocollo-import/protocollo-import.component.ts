import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, QueryList, ViewChild, ViewChildren } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { PdfImportService, ParsedSupplements } from '../../services/pdf-import.service';
import { ProtocolService } from '../../services/protocol.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { todayLocalISO } from '../../core/utils/date.util';
import { Protocol } from '../../models/protocol.model';
import { Diet, NamedMeal, newNamedMeal, SupplementItem } from '../../models/diet.model';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IonLoading, NavController, IonButton, IonFooter, IonLabel, IonTextarea } from '@ionic/angular';
import { IONIC_LIST } from '../../core/ionic-list';
import { IconaComponent } from '../../components/icona/icona.component';
import { BarraAzioneDirective } from '../../core/directives/barra-azione.directive';

type QualePdf = 'scheda' | 'dieta' | 'integrazione';
interface RigaPdf { id: QualePdf; nome: string; nota: string; }

/** Le righe dei file: nell'aggiornamento anche la scheda e' facoltativa. */
const RIGHE_NUOVO: readonly RigaPdf[] = [
  { id: 'scheda', nome: 'Scheda allenamento', nota: 'Obbligatoria' },
  { id: 'dieta', nome: 'Dieta', nota: 'Facoltativa' },
  { id: 'integrazione', nome: 'Integrazione', nota: 'Facoltativa · finisce nella scheda Info' }
];
const RIGHE_AGGIORNA: readonly RigaPdf[] = [
  { ...RIGHE_NUOVO[0], nota: 'Facoltativa' }, RIGHE_NUOVO[1], RIGHE_NUOVO[2]
];

/** Tempo massimo per ciascuna fase prima di rinunciare e segnalare un errore
 *  invece di restare bloccati a tempo indeterminato senza alcun feedback
 *  (es. se il worker di pdf.js non riesce a caricarsi/rispondere). */
const STEP_TIMEOUT_MS = 25000;

const NESSUN_ESERCIZIO = 'Non ho trovato nessun esercizio nella scheda. Controlla di aver dato la scheda giusta, o scrivila a mano.';

@Component({
  selector: 'app-protocollo-import',
  standalone: true,
  imports: [BarraAzioneDirective, IonButton, IonFooter, IonLabel, IonTextarea, ...IONIC_LIST, ...IONIC_PAGE, IonLoading, CommonModule, IconaComponent],
  templateUrl: './protocollo-import.component.html'
})
export class ProtocolloImportComponent implements OnInit, OnDestroy {
  /** Vuoto in modalita' creazione; valorizzato in modalita' aggiornamento (route con :protocolId). */
  protocolId = '';
  private existingProtocol: Protocol | null = null;
  /** true dal momento in cui sappiamo che siamo in modalita' aggiornamento (c'e' un
   *  protocolId) fino a quando il protocollo esistente e' stato letto da Firestore
   *  (con successo o meno). Finche' e' true, "Aggiorna protocollo" resta disabilitato:
   *  senza questa guardia era possibile scegliere un file e cliccare il bottone PRIMA
   *  che la lettura fosse completata, con existingProtocol ancora null - processUpdate()
   *  crashava leggendo un campo su null non appena tentava di consultare il protocollo
   *  esistente (mai un problema del PDF o della logica di estrazione). */
  loadingExisting = false;
  private paramSub: Subscription | null = null;

  schedaFile: File | null = null;
  dietaFile: File | null = null;
  integrazioneFile: File | null = null;

  /**
   * Il testo incollato al posto del PDF: il piano del coach arriva spesso in chat, come testo.
   * Per ogni voce vale o il file o il testo, non tutti e due: sceglierne uno toglie l'altro.
   */
  readonly testi: Record<QualePdf, string> = { scheda: '', dieta: '', integrazione: '' };
  /** La voce di cui si sta incollando il testo (il campo si apre sotto la sua riga). */
  aperto: QualePdf | null = null;

  processing = false;
  errorMsg = '';
  /** Fase corrente mostrata all'utente durante l'elaborazione (vedi template). */
  stage = '';
  /** Avanzamento indicativo per fase (0-100), mostrato nella progress bar dell'overlay. */
  progressPercent = 0;

  constructor(
    private route: ActivatedRoute,
    private nav: NavController,
    private pdfSvc: PdfImportService,
    private protocolSvc: ProtocolService,
    private confirm: ConfirmDialogService,
    private cdr: ChangeDetectorRef
  ) {}

  get isUpdateMode(): boolean {
    return !!this.protocolId;
  }

  ngOnInit(): void {
    this.paramSub = this.route.paramMap.subscribe(params => {
      this.protocolId = params.get('protocolId') ?? '';
      if (this.protocolId) {
        this.loadingExisting = true;
        this.loadExisting();
      }
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }

  private async loadExisting(): Promise<void> {
    try {
      const p = await this.protocolSvc.get(this.protocolId);
      if (!p) { this.nav.navigateBack(['/scheda/protocolli']); return; }
      this.existingProtocol = p;
    } catch (e: any) {
      console.error('Errore caricamento protocollo esistente:', e);
      this.errorMsg = 'Errore nel caricamento del protocollo esistente. Ricarica la pagina e riprova.';
    } finally {
      this.loadingExisting = false;
      this.cdr.detectChanges();
    }
  }

  @ViewChild('pdfScheda') private pdfScheda?: ElementRef<HTMLInputElement>;
  @ViewChild('pdfDieta') private pdfDieta?: ElementRef<HTMLInputElement>;
  @ViewChild('pdfIntegrazione') private pdfIntegrazione?: ElementRef<HTMLInputElement>;
  /** I campi del testo, nell'ordine delle righe: ce n'e' uno solo aperto per volta, gli altri nascosti. */
  @ViewChildren('campo') private campiTesto?: QueryList<IonTextarea>;

  get fileDaScegliere(): readonly RigaPdf[] {
    return this.isUpdateMode ? RIGHE_AGGIORNA : RIGHE_NUOVO;
  }

  fileDi(id: QualePdf): File | null {
    return id === 'scheda' ? this.schedaFile : id === 'dieta' ? this.dietaFile : this.integrazioneFile;
  }

  /** C'e' qualcosa da leggere per questa voce: un PDF scelto o del testo incollato. */
  haFonte(id: QualePdf): boolean {
    return !!this.fileDi(id) || this.testi[id].trim().length > 0;
  }

  /** Sotto il nome della riga: cosa e' stato dato (il file o il testo), o a cosa serve la voce. */
  sottotitolo(riga: RigaPdf): string {
    const testo = this.testi[riga.id].trim();
    if (testo) {
      const righe = testo.split(/\r\n|\r|\n/).filter(r => r.trim()).length;
      return `Testo incollato · ${righe} ${righe === 1 ? 'riga' : 'righe'}`;
    }
    return this.fileDi(riga.id)?.name || riga.nota;
  }

  /** "PDF": si apre il selettore del sistema, dal campo file nascosto. */
  scegli(id: QualePdf): void {
    const campo = id === 'scheda' ? this.pdfScheda : id === 'dieta' ? this.pdfDieta : this.pdfIntegrazione;
    campo?.nativeElement.click();
  }

  /** "Incolla": il campo del testo si apre (o si chiude) sotto la riga, e si apre col cursore dentro. */
  incolla(id: QualePdf): void {
    this.aperto = this.aperto === id ? null : id;
    if (this.aperto === null) return;
    // Il campo si mostra subito e prende il fuoco dentro il tocco: dato dopo (da un timer, o a campo
    // appena creato) a iOS non apre la tastiera, e per incollare servirebbe un secondo tocco.
    this.cdr.detectChanges();
    const posto = this.fileDaScegliere.findIndex(r => r.id === id);
    void this.campiTesto?.toArray()[posto]?.setFocus();
  }

  /** Il testo cambia: se c'e', vale lui, e il PDF scelto prima si toglie (e il suo campo si svuota, per poterlo scegliere di nuovo). */
  onTesto(id: QualePdf, valore: string | null | undefined): void {
    this.testi[id] = (valore ?? '').replace(/\r\n?/g, '\n');
    if (!this.testi[id].trim()) return;
    this.impostaFile(id, null);
  }

  onFile(event: Event, which: QualePdf): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.impostaFile(which, file);
    // Scelto un PDF, il testo incollato per la stessa voce non vale piu'.
    if (file) {
      this.testi[which] = '';
      if (this.aperto === which) this.aperto = null;
    }
  }

  private impostaFile(id: QualePdf, file: File | null): void {
    if (id === 'scheda') this.schedaFile = file;
    if (id === 'dieta') this.dietaFile = file;
    if (id === 'integrazione') this.integrazioneFile = file;
    if (!file) {
      const campo = id === 'scheda' ? this.pdfScheda : id === 'dieta' ? this.pdfDieta : this.pdfIntegrazione;
      if (campo) campo.nativeElement.value = '';
    }
  }

  get canProcess(): boolean {
    if (this.processing) return false;
    if (this.isUpdateMode) {
      if (this.loadingExisting) return false;
      return this.haFonte('scheda') || this.haFonte('dieta') || this.haFonte('integrazione');
    }
    // Solo la scheda e' obbligatoria. La dieta si puo' scrivere a mano nel
    // builder, e per molti clienti il coach la scrive li' e basta: chiedere
    // un PDF che non esiste bloccava la creazione del protocollo.
    return this.haFonte('scheda');
  }

  /** Il testo di una voce: quello incollato, o quello che si legge dal PDF scelto. */
  private async leggi(id: QualePdf, etichetta: string): Promise<string> {
    const incollato = this.testi[id].trim();
    if (incollato) return incollato;
    return this.withTimeout(this.pdfSvc.extractText(this.fileDi(id)!), etichetta);
  }

  private async withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label}: tempo scaduto. Riprova, o verifica che il PDF non sia troppo pesante/corrotto.`)),
        STEP_TIMEOUT_MS
      );
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  private setStage(stage: string, percent: number): void {
    this.stage = stage;
    this.progressPercent = percent;
    // App senza zone.js: senza questa chiamata esplicita la vista non si
    // ridisegna dopo un await su Promise "pure" (Firestore, worker pdf.js),
    // restando visivamente bloccata sull'ultimo stage anche se lo stato interno
    // e' gia' avanzato (stesso problema che ZoneFixService risolve altrove).
    this.cdr.detectChanges();
  }

  private buildConfirmMessage(): string {
    const parts: string[] = [];
    if (this.haFonte('scheda')) parts.push('giorni di allenamento e progressione settimanale');
    if (this.haFonte('dieta')) parts.push('dieta e note');
    if (this.haFonte('integrazione')) parts.push('note integrazione');
    return `Verranno aggiornati: ${parts.join(', ')}. Continuare?`;
  }

  async process(): Promise<void> {
    if (!this.canProcess) return;

    if (this.isUpdateMode) {
      const ok = await this.confirm.confirm(this.buildConfirmMessage(), { confirmLabel: 'Continua', dangerous: false });
      if (!ok) return;
    }

    this.processing = true;
    this.errorMsg = '';

    try {
      if (this.isUpdateMode) {
        await this.processUpdate();
      } else {
        await this.processCreate();
      }
    } catch (e: any) {
      console.error('Errore importazione PDF:', e);
      this.errorMsg = e?.message || 'Errore durante la lettura. Riprova o crea il protocollo manualmente.';
    } finally {
      this.processing = false;
      this.stage = '';
      this.progressPercent = 0;
      this.cdr.detectChanges();
    }
  }

  /** Applica le voci Integrazione riconosciute dal parser ai pasti giusti di ogni piano
   *  dieta: "always" su tutti i piani, "onlyOn" solo sui piani il cui nome contiene "on"
   *  (case-insensitive) - per Cena si AGGIUNGONO a quelle gia' scritte da "always", non
   *  le sostituiscono. Crea il pasto "Intra-Workout" se manca in un piano "on"; nessun
   *  altro pasto mancante viene creato (solo i nomi pasto standard esistono di norma).
   *  Il primo scrittura su un pasto in QUESTA chiamata sostituisce sempre il contenuto
   *  precedente (cosi' un ricaricamento dello stesso PDF non duplica le voci nei pasti
   *  che ricevono solo scritture "onlyOn", es. Merenda e Intra-Workout); una seconda
   *  scrittura sullo stesso pasto nella STESSA chiamata (solo Cena, che riceve sia
   *  "always" sia "onlyOn" per questo PDF) si aggiunge invece di sostituire. */
  private applyParsedSupplements(diet: Diet, parsed: ParsedSupplements): void {
    for (const plan of diet) {
      const touchedThisPlan = new Set<NamedMeal>();
      const write = (meal: NamedMeal, items: SupplementItem[]) => {
        if (touchedThisPlan.has(meal)) {
          meal.supplements = [...(meal.supplements ?? []), ...items];
        } else {
          meal.supplements = [...items];
          touchedThisPlan.add(meal);
        }
      };

      for (const [mealName, items] of Object.entries(parsed.always)) {
        const meal = plan.meals.find(m => m.name.toLowerCase() === mealName.toLowerCase());
        if (meal) write(meal, items);
      }

      if (/\bon\b/i.test(plan.name)) {
        for (const [mealName, items] of Object.entries(parsed.onlyOn)) {
          let meal: NamedMeal | undefined = plan.meals.find(m => m.name.toLowerCase() === mealName.toLowerCase());
          if (!meal) {
            if (mealName !== 'Intra-Workout') continue;
            meal = newNamedMeal(mealName);
            plan.meals.push(meal);
          }
          write(meal, items);
        }
      }
    }
  }

  private async processCreate(): Promise<void> {
    this.setStage('Creazione bozza protocollo…', 5);
    const id = await this.withTimeout(this.protocolSvc.create(), 'Creazione bozza protocollo');

    this.setStage('Lettura scheda allenamento…', 20);
    const schedaText = await this.leggi('scheda', 'Lettura scheda');

    // Senza il PDF della dieta il protocollo nasce con la dieta vuota: il
    // builder la apre su "Nessun piano ancora" e la si scrive li'.
    let dietaText = '';
    if (this.haFonte('dieta')) {
      this.setStage('Lettura dieta…', 40);
      dietaText = await this.leggi('dieta', 'Lettura dieta');
    }

    this.setStage('Analisi esercizi e alimenti…', 65);
    const days = this.pdfSvc.parseWorkoutText(schedaText);
    if (days.length === 0) {
      // Niente da salvare: la bozza appena creata e' vuota, e non resta li' a fare numero.
      try { await this.protocolSvc.delete(id); } catch { /* una bozza vuota in piu' non fa danno */ }
      throw new Error(NESSUN_ESERCIZIO);
    }
    const diet = dietaText ? this.pdfSvc.parseDietText(dietaText) : [];
    const durationWeeks = this.pdfSvc.detectProgramDurationWeeks(schedaText);
    const weekPlan = this.pdfSvc.detectProtocolWeekPlan(days, durationWeeks);

    const dietNotesSource = dietaText ? this.pdfSvc.extractDietNotes(dietaText) : '';
    let supplementNotesSource = '';
    if (this.haFonte('integrazione')) {
      this.setStage('Lettura integrazione…', 75);
      const integrazioneText = await this.leggi('integrazione', 'Lettura integrazione');
      supplementNotesSource = integrazioneText.trim();
      this.applyParsedSupplements(diet, this.pdfSvc.parseSupplementText(integrazioneText));
    }
    const infoNote = [dietNotesSource, supplementNotesSource].filter(Boolean).join('\n\n');

    this.setStage('Salvataggio protocollo…', 90);
    await this.withTimeout(this.protocolSvc.update(id, {
      name: 'Protocollo da PDF',
      source: 'pdf',
      workout: { weekPlan, days, programStart: todayLocalISO() },
      diet,
      dietNotesSource,
      supplementNotesSource,
      infoNote
    }), 'Salvataggio protocollo');

    this.setStage('Completato', 100);
    this.nav.navigateBack(['/scheda/protocolli']);
  }

  private async processUpdate(): Promise<void> {
    const existing = this.existingProtocol!;
    const patch: Partial<Protocol> = {};
    let percent = 10;

    if (this.haFonte('scheda')) {
      this.setStage('Lettura scheda allenamento…', percent);
      const schedaText = await this.leggi('scheda', 'Lettura scheda');
      const days = this.pdfSvc.parseWorkoutText(schedaText);
      // Senza esercizi riconosciuti non si riscrive niente: sostituire i giorni di oggi con un elenco vuoto
      // farebbe sparire la scheda per un testo sbagliato.
      if (days.length === 0) throw new Error(NESSUN_ESERCIZIO);
      const durationWeeks = this.pdfSvc.detectProgramDurationWeeks(schedaText);
      const weekPlan = this.pdfSvc.detectProtocolWeekPlan(days, durationWeeks);
      patch.workout = { ...existing.workout, days, weekPlan };
      percent = 40;
    }

    // Un protocollo creato prima di questa feature ha dietNotesSource/supplementNotesSource
    // entrambi undefined anche se infoNote contiene gia' testo reale (scritto alla vecchia
    // maniera). Teniamo traccia qui, PRIMA di leggere i PDF, di quali dei due erano gia'
    // "tracciati": ci serve piu' sotto per capire se e' sicuro ricalcolare infoNote.
    const dietSourceWasTracked = existing.dietNotesSource !== undefined;
    const supplementSourceWasTracked = existing.supplementNotesSource !== undefined;

    let dietNotesSource = existing.dietNotesSource ?? '';
    let supplementNotesSource = existing.supplementNotesSource ?? '';

    if (this.haFonte('dieta')) {
      this.setStage('Lettura dieta…', percent);
      const dietaText = await this.leggi('dieta', 'Lettura dieta');
      patch.diet = this.pdfSvc.parseDietText(dietaText);
      dietNotesSource = this.pdfSvc.extractDietNotes(dietaText);
      percent = 65;
    }

    if (this.haFonte('integrazione')) {
      this.setStage('Lettura integrazione…', percent);
      const integrazioneText = await this.leggi('integrazione', 'Lettura integrazione');
      supplementNotesSource = integrazioneText.trim();
      const dietToPatch = patch.diet ?? existing.diet;
      this.applyParsedSupplements(dietToPatch, this.pdfSvc.parseSupplementText(integrazioneText));
      patch.diet = dietToPatch;
    }

    if (this.haFonte('dieta') || this.haFonte('integrazione')) {
      // Scriviamo un campo sorgente nel patch SOLO se e' stato genuinamente ricaricato
      // in questa operazione, oppure era gia' tracciato in precedenza. Se scrivessimo
      // sempre entrambi i campi (anche quello NON ricaricato), un protocollo legacy
      // (entrambi undefined) verrebbe silenziosamente "promosso" a tracciato-come-vuoto
      // sul lato non toccato. Al ricaricamento singolo SUCCESSIVO dello stesso lato,
      // l'altra sorgente risulterebbe erroneamente gia' nota, facendo ricalcolare
      // infoNote e cancellando comunque il contenuto legacy mai davvero ricaricato.
      if (this.haFonte('dieta') || dietSourceWasTracked) {
        patch.dietNotesSource = dietNotesSource;
      }
      if (this.haFonte('integrazione') || supplementSourceWasTracked) {
        patch.supplementNotesSource = supplementNotesSource;
      }

      const bothReloadedTogether = this.haFonte('dieta') && this.haFonte('integrazione');
      const otherSourceIsKnown = this.haFonte('dieta')
        ? (this.haFonte('integrazione') ? true : supplementSourceWasTracked)
        : dietSourceWasTracked;

      if (bothReloadedTogether || otherSourceIsKnown) {
        patch.infoNote = [dietNotesSource, supplementNotesSource].filter(Boolean).join('\n\n');
      }
      // else: il protocollo e' precedente a questa feature e l'altra sorgente non era mai
      // stata tracciata — non possiamo sapere quale porzione di infoNote le apparteneva,
      // quindi lo lasciamo invariato invece di rischiare di cancellarne il contenuto.
      // dietNotesSource/supplementNotesSource restano comunque aggiornati (solo per il
      // lato genuinamente ricaricato), cosi' il PROSSIMO ricaricamento su questo
      // protocollo potra' ricalcolare infoNote in sicurezza.
    }

    this.setStage('Salvataggio protocollo…', 90);
    try {
      await this.withTimeout(this.protocolSvc.update(this.protocolId, patch), 'Salvataggio protocollo');
    } catch (e: any) {
      throw new Error(`[processUpdate:protocolSvc.update] ${e?.message ?? e}`);
    }

    this.setStage('Completato', 100);
    this.nav.navigateBack(['/scheda/protocolli/builder', this.protocolId]);
  }
}
