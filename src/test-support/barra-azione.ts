import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { expect } from 'vitest';
import { BarraAzioneDirective } from '../app/core/directives/barra-azione.directive';

/**
 * Il comando di una pagina interna sta nella barra in basso, fatta come la
 * barra delle tab (ion-footer.barra-azione in styles.css): un footer solo, la
 * pillola col tasto, il contenuto che le passa sotto (con-barra) e la
 * direttiva che la riduce scorrendo e la toglie con la tastiera. Restituisce
 * il tasto.
 */
export function controllaBarraInBasso(fixture: ComponentFixture<unknown>): HTMLElement {
  const root: HTMLElement = fixture.nativeElement;
  const footer = Array.from(root.querySelectorAll('ion-footer'));
  expect(footer.length).toBe(1);
  expect(footer[0].classList.contains('barra-azione')).toBe(true);
  const tasto = footer[0].querySelector<HTMLElement>(':scope > .barra-pillola > ion-button.setdone');
  expect(tasto).not.toBeNull();

  const contenuto = fixture.debugElement.query(By.directive(BarraAzioneDirective));
  expect(contenuto?.nativeElement.tagName).toBe('ION-CONTENT');
  expect(contenuto.nativeElement.classList.contains('con-barra')).toBe(true);

  const barra = contenuto.injector.get(BarraAzioneDirective);
  const stato = () => ['ridotta', 'con-tastiera'].filter(c => footer[0].classList.contains(c));
  barra.ridotta.set(true);
  fixture.detectChanges();
  expect(stato()).toEqual(['ridotta']);
  barra.ridotta.set(false);
  barra.tastiera.set(true);
  fixture.detectChanges();
  expect(stato()).toEqual(['con-tastiera']);
  barra.tastiera.set(false);
  fixture.detectChanges();
  expect(stato()).toEqual([]);
  return tasto!;
}
