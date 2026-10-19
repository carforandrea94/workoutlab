import { Component, OnInit, OnDestroy, ChangeDetectorRef, Optional } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Subscription } from 'rxjs';
import { RunsService } from '../../services/runs.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { RunningStateService } from '../../services/running-state.service';
import { ToastService } from '../../services/toast.service';
import {
  Run, RunType, RunEffort, RUN_TYPE_LABELS, RUN_EFFORT_LABELS
} from '../../models/run.model';
import { parseMinutes, formatMinutes } from '../../core/utils/run-math.util';
import { todayLocalISO } from '../../core/utils/date.util';
import { IONIC_PAGE } from '../../core/ionic-page';
import { NavController, IonInput, IonSegment, IonSegmentButton, IonButton, IonRouterOutlet, IonLabel, IonNote, IonListHeader } from '@ionic/angular';
import { IONIC_LIST } from '../../core/ionic-list';
import { ConModificheNonSalvate } from '../../core/guards/modifiche-non-salvate.guard';
import { senzaSwipeIndietro } from '../../core/swipe-indietro';
import { NomeCampoDirective } from '../../core/nome-campo.directive';

@Component({
  selector: 'app-corsa-nuova',
  standalone: true,
  imports: [NomeCampoDirective, IonButton, IonInput, IonLabel, IonNote, IonListHeader, ...IONIC_LIST, IonSegment, IonSegmentButton, ...IONIC_PAGE, CommonModule, FormsModule],
  templateUrl: './corsa-nuova.component.html'
})
export class CorsaNuovaComponent implements OnInit, OnDestroy, ConModificheNonSalvate {

  readonly types = (Object.keys(RUN_TYPE_LABELS) as RunType[]).map(id => ({ id, label: RUN_TYPE_LABELS[id] }));
  readonly efforts = (Object.keys(RUN_EFFORT_LABELS) as RunEffort[]).map(id => ({ id, label: RUN_EFFORT_LABELS[id] }));
  readonly maxDate = todayLocalISO();

  date = todayLocalISO();
  minutes = '';
  type: RunType = 'lento';
  effort: RunEffort = 'giusta';
  note = '';

  /** Id dell'uscita in modifica. null = nuova uscita. */
  editId: string | null = null;
  saving = false;
  errorMsg = '';

  /**
   * Id con cui verra' scritta una nuova uscita, deciso una volta sola.
   * Se il primo salvataggio fallisce e l'utente riprova, la seconda scrittura
   * finisce sullo stesso documento invece di crearne un altro: senza, un
   * tentativo che in realta' era arrivato lascerebbe due uscite uguali.
   */
  private pendingId: string | null = null;

  private paramSub: Subscription | null = null;

  /** Com'erano i campi appena aperta la pagina (o caricata l'uscita): quello con cui si confronta per dire "hai modificato". */
  private baseline = '';
  /** Dopo un salvataggio o un'eliminazione l'uscita e' voluta: la guardia non deve chiedere. */
  private uscitaConsentita = false;
  private get swipe() { return senzaSwipeIndietro(this.outlet); }

  constructor(
    private runsSvc: RunsService,
    private state: RunningStateService,
    private nav: NavController,
    private route: ActivatedRoute,
    private confirm: ConfirmDialogService,
    private toast: ToastService,
    private cdr: ChangeDetectorRef,
    @Optional() private outlet: IonRouterOutlet | null = null
  ) {}

  ngOnInit(): void {
    // La route viene riusata (DefaultRouteReuseStrategy): con lo snapshot, un
    // secondo ingresso con parametri diversi non verrebbe letto.
    this.paramSub = this.route.queryParamMap.subscribe(params => {
      const id = params.get('id');
      this.editId = id;
      if (id) { this.loadForEdit(id); return; }
      // Una nuova uscita registrata da dentro una settimana passata arriva
      // con la sua data: il calendario si apre gia' nel punto giusto invece
      // di costringere a girarlo all'indietro.
      const date = params.get('date');
      if (date && date <= this.maxDate) this.date = date;
      this.baseline = this.fotografia();
    });
    // In modifica servono le uscite gia' salvate: se si arriva qui da un link
    // diretto l'elenco puo' essere ancora vuoto.
    if (!this.state.runs().length) this.state.refresh().then(() => {
      if (this.editId) this.loadForEdit(this.editId, true);
    });
  }

  ngOnDestroy(): void {
    this.paramSub?.unsubscribe();
  }

  ionViewWillEnter(): void {
    this.uscitaConsentita = false;
    this.swipe.spegni();
  }

  ionViewWillLeave(): void {
    this.swipe.riaccendi();
  }

  private fotografia(): string {
    return JSON.stringify([this.date, this.minutes.trim(), this.type, this.effort, this.note.trim()]);
  }

  /** Scritto qualcosa che non e' stato salvato: vedi uscitaSenzaPerdite. */
  haModificheNonSalvate(): boolean {
    return !this.uscitaConsentita && !this.saving && this.baseline !== '' && this.fotografia() !== this.baseline;
  }

  get title(): string {
    return this.editId ? 'Modifica uscita' : 'Nuova uscita';
  }

  /** Come verra' letto il tempo digitato: `1:20` non e' un'ora e venti per tutti. */
  get liveMinutes(): string {
    const min = parseMinutes(this.minutes);
    return min > 0 ? formatMinutes(min) : '—';
  }

  get canSave(): boolean {
    return parseMinutes(this.minutes) > 0 && !this.saving;
  }

  async save(): Promise<void> {
    const durationMin = parseMinutes(this.minutes);

    if (durationMin <= 0) { this.errorMsg = 'Inserisci i minuti corsi (es. 40 oppure 1:20).'; return; }
    if (!this.date) { this.errorMsg = 'Inserisci la data dell\'uscita.'; return; }

    this.errorMsg = '';
    this.saving = true;

    const run: Run = {
      date: this.date,
      durationMin,
      type: this.type,
      effort: this.effort,
      note: this.note.trim() || undefined
    };

    // L'id contiene la data, ma resta quello deciso la prima volta anche se
    // poi la data cambia: e' solo una chiave. La data buona sta nel documento
    // ed e' quella che i totali settimanali leggono.
    if (!this.editId) this.pendingId ??= this.runsSvc.newId(this.date);
    const saved = await this.runsSvc.save(run, this.editId ?? this.pendingId!);
    this.saving = false;

    if (!saved) {
      this.errorMsg = 'Salvataggio non riuscito. Controlla la connessione e riprova.';
      // L'app e' zoneless: dopo un await nessuno ridisegna da solo, e senza
      // questo il bottone resterebbe su "Salvataggio…" per sempre — l'errore
      // ci sarebbe, ma solo in memoria. Il toast e' un secondo canale, mosso
      // da un signal, cosi' l'utente se ne accorge comunque.
      this.cdr.detectChanges();
      this.toast.error('Uscita non salvata. Riprova.');
      return;
    }

    await this.state.refresh();
    this.toast.success(this.editId ? 'Uscita aggiornata' : `Registrati ${formatMinutes(durationMin)}`);
    this.uscitaConsentita = true;
    this.nav.navigateBack(['/corsa']);
  }

  /**
   * Elimina l'uscita in modifica. Sta qui e non su ogni riga dell'elenco:
   * un cestino sempre acceso accanto a una riga che si tocca per aprirla e'
   * un incidente che aspetta di succedere.
   */
  async remove(): Promise<void> {
    if (!this.editId || this.saving) return;
    const ok = await this.confirm.confirm(
      `Eliminare l'uscita del ${this.dateLabel} (${formatMinutes(parseMinutes(this.minutes))})?`,
      { confirmLabel: 'Elimina', dangerous: true }
    );
    if (!ok) return;

    this.saving = true;
    this.cdr.detectChanges();
    const done = await this.runsSvc.delete(this.editId);
    this.saving = false;

    if (!done) {
      this.errorMsg = 'Eliminazione non riuscita. Controlla la connessione e riprova.';
      this.cdr.detectChanges();
      this.toast.error('Uscita non eliminata. Riprova.');
      return;
    }

    await this.state.refresh();
    this.toast.success('Uscita eliminata');
    this.uscitaConsentita = true;
    this.nav.navigateBack(['/corsa']);
  }

  /** La data come si legge in una domanda: "28 settembre". */
  get dateLabel(): string {
    const d = new Date(this.date + 'T00:00:00');
    if (isNaN(d.getTime())) return this.date;
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
  }

  private loadForEdit(id: string, redraw = false): void {
    const found = this.state.runs().find(r => r.id === id);
    if (!found) return;
    const run = found.run;
    this.date = run.date;
    this.minutes = String(run.durationMin);
    this.type = run.type;
    this.effort = run.effort;
    this.note = run.note ?? '';
    this.baseline = this.fotografia();
    // Quando i dati arrivano dalla lettura delle uscite siamo fuori da
    // qualsiasi evento: l'app e' zoneless e i campi del form sono proprieta'
    // normali, quindi senza questo il form resterebbe vuoto. Dal ramo
    // sincrono no: siamo gia' dentro un ciclo di rilevamento.
    if (redraw) this.cdr.detectChanges();
  }

}
