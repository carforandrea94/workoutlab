import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { CommonModule } from '@angular/common';

import { MeasurementDataService } from '../../services/measurement-data.service';
import { ConfirmDialogService } from '../../services/confirm-dialog.service';
import { MeasurementEntry } from '../../models/measurement.model';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IONIC_REFRESH, completaRefresh } from '../../core/ionic-refresh';
import { IONIC_SLIDING } from '../../core/ionic-sliding';
import { NavController, IonSpinner, IonButton } from '@ionic/angular';

interface EntryRow {
  entry: MeasurementEntry;
  displayDate: string;
  pesoDelta: number | null;
  pesoDeltaText: string | null;
}

@Component({
  selector: 'app-misure-storico',
  standalone: true,
  imports: [IonButton, IonSpinner, ...IONIC_PAGE, ...IONIC_REFRESH, ...IONIC_SLIDING, CommonModule, LucideAngularModule],
  templateUrl: './misure-storico.component.html'
})
export class MisureStoricoComponent implements OnInit {
  rows: EntryRow[] = [];
  loading = true;
  errorMsg = '';

  constructor(
    private data: MeasurementDataService,
    private confirm: ConfirmDialogService,
    private nav: NavController,
    private cdr: ChangeDetectorRef
  ) {}

  /** Tira per aggiornare. */
  aggiorna(ev: Event): Promise<void> {
    return completaRefresh(ev, () => this.load(true));
  }

  /** Ionic tiene viva la pagina nella pila: tornandoci ngOnInit non riparte, e i dati possono essere cambiati altrove (salvataggi, eliminazioni). */
  private primoIngresso = true;
  ionViewWillEnter(): void {
    if (!this.primoIngresso) void this.load();
    this.primoIngresso = false;
  }

  ngOnInit(): void {
    this.load();
  }

  /** `silenzioso`: il gesto "tira per aggiornare" rilegge senza far sparire l'elenco dietro lo spinner. */
  async load(silenzioso = false): Promise<void> {
    if (!silenzioso) this.loading = true;
    this.errorMsg = '';

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), 12000)
    );

    try {
      const history = await Promise.race([this.data.loadHistory(), timeout]); // dalla piu' recente
      this.rows = history.map((entry, i) => {
        const date = new Date(entry.date + 'T00:00:00');
        const displayDate = date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const prev = history[i + 1];
        let pesoDelta: number | null = null;
        let pesoDeltaText: string | null = null;
        const cur = this.data.parseMeasureValue(entry.peso);
        const prevVal = this.data.parseMeasureValue(prev?.peso);
        if (cur !== null && prevVal !== null) {
          pesoDelta = Math.round((cur - prevVal) * 10) / 10;
          pesoDeltaText = (pesoDelta > 0 ? '+' : '') + this.data.formatMeasureNumber(pesoDelta);
        }
        return { entry, displayDate, pesoDelta, pesoDeltaText };
      });
    } catch (e: any) {
      console.error('Errore caricamento storico misure:', e);
      this.errorMsg = e?.message === 'TIMEOUT'
        ? 'La connessione sta impiegando troppo tempo. Controlla la rete e riprova.'
        : 'Errore nel caricamento dello storico. Riprova.';
    } finally {
      this.loading = false;
      this.cdr.detectChanges();
    }
  }

  goToDetail(date: string): void {
    this.nav.navigateForward(['/misure/storico', date]);
  }

  async deleteEntry(date: string, event: MouseEvent): Promise<void> {
    event.stopPropagation();
    const ok = await this.confirm.confirm('Eliminare questa misurazione dallo storico?');
    if (ok) {
      await this.data.deleteEntry(date);
      await this.load();
    }
  }
}
