import { CUSTOM_ELEMENTS_SCHEMA, Component, viewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BarraAzioneDirective } from './barra-azione.directive';

@Component({
  standalone: true,
  imports: [BarraAzioneDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ion-content appBarraAzione #barra="barraAzione" [scrollEvents]="true"></ion-content>
    <ion-footer class="barra-azione" [class.ridotta]="barra.ridotta()" [class.con-tastiera]="barra.tastiera()"></ion-footer>
  `
})
class Prova {
  readonly barra = viewChild.required(BarraAzioneDirective);
}

/**
 * La barra in basso delle pagine interne fa quello che fa la barra delle tab:
 * scorrendo in giu' si riduce, scorrendo in su e in cima torna intera, con la
 * tastiera dell'app nativa se ne va.
 */
describe('BarraAzioneDirective', () => {
  function monta() {
    const fixture = TestBed.createComponent(Prova);
    fixture.detectChanges();
    const root: HTMLElement = fixture.nativeElement;
    const contenuto = root.querySelector('ion-content')!;
    const footer = root.querySelector('ion-footer')!;
    // ion-content manda ionScroll con la posizione nel dettaglio.
    const scorri = (y: number) => {
      contenuto.dispatchEvent(new CustomEvent('ionScroll', { detail: { scrollTop: y } }));
      fixture.detectChanges();
    };
    const tastiera = (evento: 'keyboardWillShow' | 'keyboardWillHide') => {
      window.dispatchEvent(new Event(evento));
      fixture.detectChanges();
    };
    return { fixture, footer, scorri, tastiera, barra: fixture.componentInstance.barra() };
  }

  beforeEach(() => TestBed.configureTestingModule({ imports: [Prova] }));

  it('all\'inizio la barra e\' intera e c\'e\'', () => {
    const { footer } = monta();
    expect(footer.classList.contains('ridotta')).toBe(false);
    expect(footer.classList.contains('con-tastiera')).toBe(false);
  });

  it('scorrendo in giu\' si riduce, scorrendo in su torna intera', () => {
    const { footer, scorri } = monta();
    scorri(100);
    scorri(200);
    expect(footer.classList.contains('ridotta')).toBe(true);
    scorri(150);
    expect(footer.classList.contains('ridotta')).toBe(false);
  });

  it('in cima alla pagina torna intera', () => {
    const { footer, scorri } = monta();
    scorri(100);
    scorri(300);
    expect(footer.classList.contains('ridotta')).toBe(true);
    scorri(0);
    expect(footer.classList.contains('ridotta')).toBe(false);
  });

  it('un evento senza posizione non cambia niente', () => {
    const { fixture, footer, scorri } = monta();
    scorri(100);
    scorri(200);
    fixture.nativeElement.querySelector('ion-content').dispatchEvent(new CustomEvent('ionScroll', { detail: {} }));
    fixture.detectChanges();
    expect(footer.classList.contains('ridotta')).toBe(true);
  });

  it('con la tastiera dell\'app nativa se ne va, e torna quando si chiude', () => {
    const { footer, tastiera } = monta();
    tastiera('keyboardWillShow');
    expect(footer.classList.contains('con-tastiera')).toBe(true);
    tastiera('keyboardWillHide');
    expect(footer.classList.contains('con-tastiera')).toBe(false);
  });

  it('lasciata la pagina non ascolta piu\' ne\' lo scorrimento ne\' la tastiera', () => {
    const { fixture, barra } = monta();
    const contenuto = fixture.nativeElement.querySelector('ion-content') as HTMLElement;
    fixture.destroy();
    window.dispatchEvent(new Event('keyboardWillShow'));
    contenuto.dispatchEvent(new CustomEvent('ionScroll', { detail: { scrollTop: 100 } }));
    contenuto.dispatchEvent(new CustomEvent('ionScroll', { detail: { scrollTop: 300 } }));
    expect(barra.tastiera()).toBe(false);
    expect(barra.ridotta()).toBe(false);
  });
});
