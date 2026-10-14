import { Injectable } from '@angular/core';
import { AlertController } from '@ionic/angular';

/**
 * Le conferme dell'app sono ion-alert: Ionic pensa a backdrop, tasto indietro
 * di Android, focus e animazione. Chi chiama continua a ricevere una promessa
 * con true/false.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmDialogService {
  constructor(private alerts: AlertController) {}

  /**
   * @param opts.confirmLabel Testo del bottone di conferma. Default 'Elimina'
   *   (quasi tutte le conferme nell'app sono eliminazioni); per conferme non
   *   distruttive (es. "Continuare?") va passato un testo pertinente.
   * @param opts.dangerous Rosso per le azioni distruttive (default), colore
   *   d'accento per le altre.
   */
  async confirm(message: string, opts?: { confirmLabel?: string; dangerous?: boolean }): Promise<boolean> {
    const dangerous = opts?.dangerous ?? true;
    const alert = await this.alerts.create({
      message,
      cssClass: 'confirm-alert',
      buttons: [
        { text: 'Annulla', role: 'cancel' },
        { text: opts?.confirmLabel ?? 'Elimina', role: dangerous ? 'destructive' : 'confirm' }
      ]
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    return role === 'destructive' || role === 'confirm';
  }
}
