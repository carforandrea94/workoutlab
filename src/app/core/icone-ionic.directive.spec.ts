import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { STILE_ICONE, StileIcone, iconeIonic } from './icone';
import { IconeIonicDirective } from './icone-ionic.directive';
import { IONIC_PAGE } from './ionic-page';

@Component({
  standalone: true,
  imports: [IconeIonicDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <ion-item class="riga"></ion-item>
    <ion-item class="mano" [detailIcon]="'mia'"></ion-item>
    <ion-select></ion-select>
    <ion-searchbar></ion-searchbar>
    <ion-button></ion-button>
  `
})
class Ospite {}

/** Le icone che Ionic disegna da se', nella variante della piattaforma. */
describe('IconeIonicDirective', () => {
  function monta(stile: StileIcone) {
    TestBed.configureTestingModule({ imports: [Ospite], providers: [{ provide: STILE_ICONE, useValue: stile }] });
    const f = TestBed.createComponent(Ospite);
    f.detectChanges();
    const el = (sel: string) => f.nativeElement.querySelector(sel) as Record<string, unknown>;
    return { el, icone: iconeIonic(stile) };
  }

  for (const stile of ['ios', 'md'] as const) {
    it(`${stile}: freccia di dettaglio, frecce del select, lente e X della ricerca`, () => {
      const { el, icone } = monta(stile);
      expect(el('ion-item.riga')['detailIcon']).toBe(icone.dettaglio);
      expect(el('ion-select')['toggleIcon']).toBe(icone.select);
      expect(el('ion-searchbar')['searchIcon']).toBe(icone.cerca);
      expect(el('ion-searchbar')['clearIcon']).toBe(icone.svuota);
    });
  }

  it('un\'icona messa a mano nel template vince', () => {
    const { el } = monta('md');
    expect(el('ion-item.mano')['detailIcon']).toBe('mia');
  });

  it('gli altri componenti non li tocca', () => {
    const { el } = monta('md');
    expect(el('ion-button')['detailIcon']).toBeUndefined();
  });

  it('sta in IONIC_PAGE: vale in ogni pagina senza scriverla', () => {
    expect(IONIC_PAGE).toContain(IconeIonicDirective);
  });
});
