import { Component, input, signal } from '@angular/core';
import { IonButton, NavController } from '@ionic/angular';
import { IONIC_LINKS } from '../../core/ionic-page';
import { ProtocolService } from '../../services/protocol.service';
import { ToastService } from '../../services/toast.service';

/**
 * Il primo avvio, quando non c'e' ancora un protocollo: le due strade per averne uno, a un
 * tocco. Il protocollo di solito lo da' un coach e arriva in PDF; se no, si scrive a mano.
 * Prima Scheda e Dieta mandavano a Protocolli, poi a Nuovo protocollo, e solo li' si sceglieva.
 */
@Component({
  selector: 'app-invito-primo-avvio',
  standalone: true,
  imports: [IonButton, ...IONIC_LINKS],
  template: `
    <div class="history-empty invito-primo-avvio">
      <strong>{{ titolo() }}</strong>
      {{ testo() }}
      <div class="mt-3">
        <ion-button class="savebtn" routerLink="/scheda/protocolli/importa-pdf" routerDirection="forward">Carica il PDF</ion-button>
      </div>
      <div class="mt-2">
        <ion-button fill="clear" class="invito-mano" [disabled]="creando()" (click)="scriviAMano()">{{ etichettaMano() }}</ion-button>
      </div>
    </div>
  `
})
export class InvitoPrimoAvvioComponent {
  readonly titolo = input.required<string>();
  readonly testo = input.required<string>();
  /** "Scrivila a mano" per la scheda, "Scrivilo a mano" per il protocollo: segue il genere di quello che si scrive. */
  readonly etichettaMano = input('Scrivila a mano');

  /** Mentre il protocollo vuoto si crea, il tasto resta spento: un secondo tocco non ne crea due. */
  readonly creando = signal(false);

  constructor(private nav: NavController, private protocolSvc: ProtocolService, private toast: ToastService) {}

  /** Crea il protocollo vuoto e apre il builder, come "Crea manualmente" in Nuovo protocollo, senza passare da Protocolli. */
  async scriviAMano(): Promise<void> {
    if (this.creando()) return;
    this.creando.set(true);
    try {
      const id = await this.protocolSvc.create();
      await this.nav.navigateForward(['/scheda/protocolli/builder', id]);
    } catch (e) {
      console.error('Creazione del protocollo fallita:', e);
      this.toast.error('Non sono riuscito a creare il protocollo. Riprova.');
    } finally {
      this.creando.set(false);
    }
  }
}
