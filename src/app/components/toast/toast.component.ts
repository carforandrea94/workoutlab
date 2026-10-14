import { Component } from '@angular/core';
import { IonToast } from '@ionic/angular';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [IonToast],
  templateUrl: './toast.component.html'
})
export class ToastComponent {
  constructor(public toast: ToastService) {}

  /** La barra che sta in fondo in questo momento: la fascia del recupero se c'e', altrimenti le tab. */
  anchor(): HTMLElement | undefined {
    if (!this.toast.toast()) return undefined;
    const restbar = document.querySelector<HTMLElement>('.restbar');
    if (restbar) return restbar;
    const tabbar = document.querySelector<HTMLElement>('ion-tab-bar.tabbar');
    return tabbar && tabbar.offsetParent !== null ? tabbar : undefined;
  }
}
