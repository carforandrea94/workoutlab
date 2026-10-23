import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { STACCO_AVVISO_PX, ToastComponent } from './toast.component';
import { ToastService } from '../../services/toast.service';
import { IconaComponent } from '../icona/icona.component';

/**
 * Gli avvisi sono la pillola di "Recupero finito": vetro, spunta (o x per un
 * errore), scritta nel colore del testo, sopra la barra in fondo invece di
 * coprirla. Lo screen reader li sente da regioni sempre presenti.
 */
describe('ToastComponent', () => {
  const pagine: HTMLElement[] = [];
  afterEach(() => { pagine.splice(0).forEach(p => p.remove()); vi.restoreAllMocks(); });

  function pagina(html: string, nascosta = false): HTMLElement {
    const p = document.createElement('div');
    p.className = 'ion-page' + (nascosta ? ' ion-page-hidden' : '');
    p.innerHTML = html;
    document.body.appendChild(p);
    pagine.push(p);
    return p;
  }
  const barra = (classi = '') => `<ion-footer class="barra-azione ${classi}"><div class="barra-pillola"><ion-button>Registra</ion-button></div></ion-footer>`;

  function monta() {
    TestBed.configureTestingModule({ imports: [ToastComponent] });
    const fixture = TestBed.createComponent(ToastComponent);
    fixture.detectChanges();
    const servizio = TestBed.inject(ToastService);
    const root: HTMLElement = fixture.nativeElement;
    const q = (sel: string) => root.querySelector<HTMLElement>(sel);
    const mostra = (tipo: 'success' | 'error', testo: string) => { servizio[tipo](testo); fixture.detectChanges(); };
    const icona = () => fixture.debugElement.query(By.directive(IconaComponent))?.componentInstance as IconaComponent | undefined;
    return { fixture, c: fixture.componentInstance, servizio, q, mostra, icona };
  }

  describe('com\'e\' fatto', () => {
    it('senza messaggio non c\'e\' niente da vedere, e le regioni per lo screen reader sono vuote', () => {
      const { q } = monta();
      expect(q('.apptoast')).toBeNull();
      expect(q('[role=status]')!.textContent!.trim()).toBe('');
      expect(q('[role=alert]')!.textContent!.trim()).toBe('');
    });

    it('un salvataggio e\' la pillola con la spunta, come "Recupero finito"', () => {
      const { q, mostra, icona } = monta();
      mostra('success', 'Peso salvato');
      const pillola = q('.apptoast')!;
      expect(pillola.tagName).toBe('P');
      expect(pillola.textContent!.trim()).toBe('Peso salvato');
      expect(pillola.classList.contains('errore')).toBe(false);
      expect(icona()!.name()).toBe('checkmark');
      expect(icona()!.size()).toBe(15);
      expect(q('.apptoast-posto')!.getAttribute('aria-hidden')).toBe('true');
    });

    it('lo screen reader sente un salvataggio con garbo, un errore subito', () => {
      const { q, mostra, icona } = monta();
      mostra('success', 'Peso salvato');
      expect(q('[role=status]')!.getAttribute('aria-live')).toBe('polite');
      expect(q('[role=status]')!.textContent!.trim()).toBe('Peso salvato');
      expect(q('[role=alert]')!.textContent!.trim()).toBe('');
      mostra('error', 'Errore durante il salvataggio. Riprova.');
      expect(q('[role=alert]')!.textContent!.trim()).toBe('Errore durante il salvataggio. Riprova.');
      expect(q('[role=status]')!.textContent!.trim()).toBe('');
      expect(q('.apptoast')!.classList.contains('errore')).toBe(true);
      expect(icona()!.name()).toBe('close');
    });

    it('passato il tempo se ne va', () => {
      vi.useFakeTimers();
      try {
        const { q, fixture, mostra } = monta();
        mostra('success', 'Peso salvato');
        vi.advanceTimersByTime(2500);
        fixture.detectChanges();
        expect(q('.apptoast')).toBeNull();
      } finally { vi.useRealTimers(); }
    });
  });

  describe('dove si appoggia', () => {
    it('nelle pagine interne sulla barra del comando della pagina in vista', () => {
      pagina(barra(), true);
      const vista = pagina(barra());
      expect(monta().c.anchor()).toBe(vista.querySelector('.barra-pillola'));
    });

    it('durante un cambio di pagina, con due pagine in vista, vale quella davanti (l\'ultima)', () => {
      pagina(barra());
      const davanti = pagina(barra());
      expect(monta().c.anchor()).toBe(davanti.querySelector('.barra-pillola'));
    });

    it('una pagina nascosta non conta, anche se viene dopo', () => {
      const vista = pagina(barra());
      pagina(barra(), true);
      expect(monta().c.anchor()).toBe(vista.querySelector('.barra-pillola'));
    });

    it('con la tastiera aperta la barra se ne va, e non fa da appoggio', () => {
      pagina(barra('con-tastiera'));
      expect(monta().c.anchor()).toBeUndefined();
    });

    it('la fascia del recupero viene prima di tutto', () => {
      const p = pagina(barra() + '<div class="restbar"></div>');
      expect(monta().c.anchor()).toBe(p.querySelector('.restbar'));
    });

    it('sta sopra la barra, staccata quanto "Recupero finito" da "Fatta"', () => {
      const p = pagina(barra());
      vi.spyOn(p.querySelector('.barra-pillola')!, 'getBoundingClientRect').mockReturnValue({ top: window.innerHeight - 90 } as DOMRect);
      const { q, mostra } = monta();
      mostra('success', 'Peso salvato');
      // 10 px sopra la barra, come "Recupero finito" sopra "Fatta" (margin:0 0 10px).
      expect(STACCO_AVVISO_PX).toBe(10);
      expect(q('.apptoast-posto')!.style.bottom).toBe('100px');
    });

    it('la posizione si decide quando compare: se poi la barra scorre, l\'avviso resta dov\'e\'', () => {
      const p = pagina(barra());
      const rett = vi.spyOn(p.querySelector('.barra-pillola')!, 'getBoundingClientRect').mockReturnValue({ top: window.innerHeight - 90 } as DOMRect);
      const { q, fixture, mostra } = monta();
      mostra('success', 'Peso salvato');
      rett.mockReturnValue({ top: window.innerHeight - 10 } as DOMRect);
      fixture.detectChanges();
      expect(q('.apptoast-posto')!.style.bottom).toBe('100px');
    });

    it('senza barre sta in fondo, dove la mette il foglio di stile', () => {
      const { q, mostra } = monta();
      mostra('success', 'Peso salvato');
      expect(q('.apptoast-posto')!.style.bottom).toBe('');
    });
  });
});
