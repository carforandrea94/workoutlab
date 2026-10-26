import { Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonButton, IonList, IonProgressBar } from '@ionic/angular';
import { IconaComponent } from '../icona/icona.component';
import { AppStateService } from '../../services/app-state.service';
import { MeasurementDataService } from '../../services/measurement-data.service';
import { WeeklyProgressService } from '../../services/weekly-progress.service';
import { RunningStateService } from '../../services/running-state.service';
import { WorkoutDataService } from '../../services/workout-data.service';
import { Bilancio, PesoDatato, bilancio } from '../../core/utils/settimana.util';
import { normalizzaObiettivo } from '../../core/utils/obiettivo.util';
import { weekRangeLabel } from '../../core/utils/week-history.util';
import { conDissolvenza } from '../../core/dissolvenza';
import { GiornoService } from '../../core/giorno.service';

/**
 * La settimana scorsa, in Account sotto "Il mio obiettivo": allenamenti,
 * corsa, pasti e peso medio uno accanto all'altro, e una frase sola che li
 * legge rispetto all'obiettivo (vedi settimana.util).
 *
 * Compare da lunedi' e resta finche' non si tocca "Ho letto": chi apre
 * Account il mercoledi' la trova ancora. Un numero che manca (niente corse,
 * nessun pasto segnato) non diventa uno zero: la sua casella non c'e'. Una
 * settimana senza niente di registrato non ha card.
 */
@Component({
  selector: 'app-bilancio-settimana',
  standalone: true,
  imports: [CommonModule, IonButton, IonList, IonProgressBar, IconaComponent],
  templateUrl: './bilancio-settimana.component.html',
  styles: [':host { display: block; }']
})
export class BilancioSettimanaComponent implements OnInit {
  readonly bilancio = signal<Bilancio | null>(null);
  /** Il lunedi' del bilancio gia' letto. */
  readonly letto = signal<string | null>(null);
  private readonly giorno = inject(GiornoService);
  readonly visibile = computed(() => {
    const b = this.bilancio();
    return !!b && b.lunedi !== this.letto();
  });

  constructor(
    private appState: AppStateService,
    private measures: MeasurementDataService,
    private weekly: WeeklyProgressService,
    private running: RunningStateService,
    private workoutData: WorkoutDataService
  ) {
    // Account resta viva: a mezzanotte fra domenica e lunedi' la settimana
    // scorsa diventa un'altra, e si rilegge.
    let visto = this.giorno.oggi();
    effect(() => {
      const oggi = this.giorno.oggi();
      if (oggi === visto) return;
      visto = oggi;
      void this.refresh();
    });
  }

  ngOnInit(): void {
    void this.refresh();
  }

  /** Rilegge tutto: Account resta viva mentre si registra altrove. Se qualcosa non si legge, niente card. */
  async refresh(): Promise<void> {
    try {
      const [stato, storia] = await Promise.all([
        this.appState.load(), this.measures.loadHistory(), this.weekly.refresh(), this.running.refresh()
      ]);
      // Lo storico arriva dalla misura piu' recente: le pesate servono dalla piu' vecchia.
      const pesate: PesoDatato[] = storia
        .map(e => ({ date: e.date, value: this.measures.parseMeasureValue(e.peso) }))
        .filter((p): p is PesoDatato => p.value !== null)
        .reverse();
      this.letto.set(stato.bilancioLetto ?? null);
      this.bilancio.set(bilancio({
        oggi: this.giorno.oggi(),
        sedute: this.weekly.sedute(),
        previsti: this.workoutData.days.length,
        corse: this.running.runs().map(r => r.run),
        obiettivoCorsa: this.running.goal()?.weeklyMinutes ?? null,
        pastiGiorni: stato.pastiGiorni,
        pesate,
        obiettivo: normalizzaObiettivo(stato.obiettivo)
      }));
    } catch (e) {
      console.error('Lettura del bilancio della settimana fallita:', e);
      this.bilancio.set(null);
    }
  }

  /** "Ho letto": la card se ne va dissolvendosi, e non torna fino al bilancio dopo. */
  segnaLetto(): void {
    const b = this.bilancio();
    if (!b) return;
    conDissolvenza(() => this.letto.set(b.lunedi));
    this.appState.patchField('bilancioLetto', b.lunedi).catch(() => { /* gia' segnalato da AppStateService */ });
  }

  intervallo(b: Bilancio): string {
    return weekRangeLabel(b.lunedi);
  }

  kg(n: number): string {
    return String(Math.round(n * 10) / 10).replace('.', ',');
  }

  /** La casella della corsa: con l'obiettivo, o con dei minuti fatti. */
  conCorsa(b: Bilancio): boolean {
    return b.corsa.obiettivo !== null || b.corsa.minuti > 0;
  }

  /** "0,3 kg in meno": la differenza con la media della settimana prima. */
  differenzaPeso(b: Bilancio): { verso: 'su' | 'giu' | 'pari'; testo: string } | null {
    if (!b.peso || b.peso.prima === null) return null;
    const d = Math.round((b.peso.media - b.peso.prima) * 10) / 10;
    if (d === 0) return { verso: 'pari', testo: 'come la settimana prima' };
    return { verso: d > 0 ? 'su' : 'giu', testo: `${this.kg(Math.abs(d))} kg in ${d > 0 ? 'più' : 'meno'}` };
  }

  quota(fatti: number, totali: number): number {
    return totali > 0 ? Math.min(1, fatti / totali) : 0;
  }
}
