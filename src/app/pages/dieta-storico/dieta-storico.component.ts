import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonAccordion, IonAccordionGroup, IonButton, IonItem, IonLabel, IonList, IonListHeader, IonNote
} from '@ionic/angular';
import { IONIC_PAGE } from '../../core/ionic-page';
import { IONIC_REFRESH, completaRefresh } from '../../core/ionic-refresh';
import { GiornoService } from '../../core/giorno.service';
import { StoricoDietaService } from '../../services/storico-dieta.service';
import { AlimentoMangiato, GiornoDieta, SettimanaDieta, settimaneDieta, testoAlimento } from '../../core/utils/storico-dieta.util';

/** Quante settimane si vedono senza chiederlo: tre mesi, come lo Storico della corsa. */
const SETTIMANE_MOSTRATE = 12;

/**
 * Lo storico della dieta, una pagina dentro la tab: giorno per giorno, cosa si
 * e' mangiato. Le settimane sono gruppi, i giorni una fisarmonica di Ionic:
 * chiusi dicono il piano e quanti pasti; aperti, i pasti fatti con gli
 * alimenti (e quelli cambiati rispetto al piano). Il giorno piu' recente parte
 * aperto. I giorni li scrive la Dieta mentre si segnano i pasti (vedi
 * storico-dieta.util): lo storico comincia da quando c'e' questa pagina.
 */
@Component({
  selector: 'app-dieta-storico',
  standalone: true,
  imports: [
    IonAccordion, IonAccordionGroup, IonButton, IonItem, IonLabel, IonList, IonListHeader, IonNote,
    ...IONIC_PAGE, ...IONIC_REFRESH, CommonModule
  ],
  templateUrl: './dieta-storico.component.html'
})
export class DietaStoricoComponent implements OnInit {
  private readonly servizio = inject(StoricoDietaService);
  private readonly giorno = inject(GiornoService);

  private readonly giorni = signal<GiornoDieta[]>([]);
  readonly caricato = signal(false);
  readonly errore = signal(false);
  readonly tutte = signal(false);

  readonly storico = computed(() =>
    settimaneDieta(this.giorni(), this.giorno.oggi(), this.tutte() ? 0 : SETTIMANE_MOSTRATE)
  );

  ngOnInit(): void {
    void this.carica();
  }

  async carica(): Promise<void> {
    try {
      this.giorni.set(await this.servizio.elenco());
      this.errore.set(false);
    } catch (e) {
      console.error('Lettura dello storico della dieta fallita:', e);
      this.errore.set(true);
    } finally {
      this.caricato.set(true);
    }
  }

  /** Tira per aggiornare. */
  aggiorna(ev: Event): Promise<void> {
    return completaRefresh(ev, () => this.carica());
  }

  /** Il giorno aperto all'arrivo: il piu' recente, nella prima settimana. */
  aperto(s: SettimanaDieta): string | null {
    return s === this.storico().settimane[0] ? s.giorni[0]?.date ?? null : null;
  }

  testo(a: AlimentoMangiato): string {
    return testoAlimento(a);
  }
}
