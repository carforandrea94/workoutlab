import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { afterEach, vi } from 'vitest';
import { providerPagina } from '../../test-support/pagina';
import { TabsPage } from './tabs.page';
import { WorkoutDataService } from '../services/workout-data.service';
import { WorkoutSessionStateService } from '../services/workout-session-state.service';

@Component({ standalone: true, template: '<p>pagina</p>' })
class Vuota {}

/**
 * La barra in basso c'e' sulle radici e scivola via nelle pagine interne;
 * toccare di nuovo la tab aperta, sulla radice, riporta in cima. Qui si monta
 * il template vero con un router vero: contano le classi che finiscono sugli
 * elementi (e su <html>, da cui il contenuto riprende lo spazio della barra).
 */
describe('TabsPage — barra nascosta e tocco sulla tab (disegno vero)', () => {
  const rotte = [
    { path: '', pathMatch: 'full' as const, redirectTo: 'scheda' },
    { path: 'scheda', component: Vuota },
    { path: 'dieta', component: Vuota },
    { path: 'dieta/lista-spesa', component: Vuota },
    { path: 'scheda/day/:n', component: Vuota }
  ];

  afterEach(() => document.documentElement.classList.remove('senza-tabbar'));

  async function monta(opzioni: { sessioneSuGiorno?: boolean } = {}) {
    TestBed.configureTestingModule({
      imports: [TabsPage],
      providers: [
        ...providerPagina(rotte),
        { provide: WorkoutDataService, useValue: { days: [{ id: 'day1' }] } },
        { provide: WorkoutSessionStateService, useValue: { isActiveForDay: () => !!opzioni.sessioneSuGiorno } }
      ]
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/dieta');
    const fixture = TestBed.createComponent(TabsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const root: HTMLElement = fixture.nativeElement;
    const barra = () => root.querySelector<HTMLElement>('ion-tab-bar')!;
    const vai = async (url: string) => {
      await router.navigateByUrl(url);
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { fixture, root, barra, vai, router };
  }

  it('sulla radice la barra c\'e\' e lo spazio sotto il contenuto e\' tenuto', async () => {
    const { barra, root } = await monta();

    expect(barra().classList.contains('tabbar-nascosta')).toBe(false);
    expect(root.querySelector('.tabfade')!.classList.contains('tabbar-nascosta')).toBe(false);
    expect(document.documentElement.classList.contains('senza-tabbar')).toBe(false);
  });

  it('dentro una pagina interna scivola via, con la sfumatura e lo spazio sotto il contenuto', async () => {
    const { barra, root, vai } = await monta();

    await vai('/dieta/lista-spesa');

    expect(barra().classList.contains('tabbar-nascosta')).toBe(true);
    expect(root.querySelector('.tabfade')!.classList.contains('tabbar-nascosta')).toBe(true);
    expect(document.documentElement.classList.contains('senza-tabbar')).toBe(true);
  });

  it('tornando sulla radice ricompare e rende lo spazio', async () => {
    const { barra, vai } = await monta();
    await vai('/dieta/lista-spesa');

    await vai('/dieta');

    expect(barra().classList.contains('tabbar-nascosta')).toBe(false);
    expect(document.documentElement.classList.contains('senza-tabbar')).toBe(false);
  });

  it('sul giorno che si sta allenando la barra non si nasconde: ne fa le veci la fascia del recupero', async () => {
    const { barra, vai, root } = await monta({ sessioneSuGiorno: true });

    await vai('/scheda/day/0');

    // Non è "nascosta" (non scivola): è sostituita, quindi il contenuto
    // non riprende lo spazio e la barra normale lascia il posto alla fascia.
    expect(barra().classList.contains('tabbar-nascosta')).toBe(false);
    expect(document.documentElement.classList.contains('senza-tabbar')).toBe(false);
    expect(barra().style.display).toBe('none');
    expect(root.querySelector('app-rest-bar')).toBeTruthy();
  });

  it('su un giorno senza sessione è una pagina interna come le altre', async () => {
    const { barra, vai, root } = await monta({ sessioneSuGiorno: false });

    await vai('/scheda/day/0');

    expect(barra().classList.contains('tabbar-nascosta')).toBe(true);
    expect(barra().style.display).not.toBe('none');
    expect(root.querySelector('app-rest-bar')).toBeNull();
  });

  describe('toccare la tab gia\' aperta', () => {
    /** Mette nell'outlet una pagina finta con il suo ion-content, come la lascia Ionic. */
    function conContenuto(root: HTMLElement) {
      const scrollToTop = vi.fn(async () => {});
      const outlet = root.querySelector('ion-router-outlet')!;
      const pagina = document.createElement('div');
      pagina.className = 'ion-page';
      const contenuto = document.createElement('ion-content') as any;
      contenuto.scrollToTop = scrollToTop;
      pagina.appendChild(contenuto);
      outlet.appendChild(pagina);
      return { scrollToTop, pagina };
    }
    // `tab` è una proprietà del componente, non un attributo.
    const bottone = (root: HTMLElement, id: string) =>
      Array.from(root.querySelectorAll<HTMLElement>('ion-tab-button')).find(b => (b as any).tab === id)!;

    it('sulla radice riporta in cima, con la corsa di 350 ms', async () => {
      const { fixture, root } = await monta();
      fixture.componentInstance.selected.set('dieta');
      const { scrollToTop } = conContenuto(root);

      bottone(root, 'dieta').click();

      expect(scrollToTop).toHaveBeenCalledWith(350);
    });

    it('un\'altra tab non scorre niente: si limita a cambiare', async () => {
      const { fixture, root } = await monta();
      fixture.componentInstance.selected.set('dieta');
      const { scrollToTop } = conContenuto(root);

      bottone(root, 'scheda').click();

      expect(scrollToTop).not.toHaveBeenCalled();
    });

    it('dentro una pagina interna non scorre: li\' c\'e\' un\'altra pagina, non la radice', async () => {
      const { fixture, root, vai } = await monta();
      fixture.componentInstance.selected.set('dieta');
      await vai('/dieta/lista-spesa');
      const { scrollToTop } = conContenuto(root);

      bottone(root, 'dieta').click();

      expect(scrollToTop).not.toHaveBeenCalled();
    });

    it('la pagina nascosta o in arrivo non e\' quella che scorre', async () => {
      const { fixture, root } = await monta();
      fixture.componentInstance.selected.set('dieta');
      const vecchia = conContenuto(root);
      vecchia.pagina.classList.add('ion-page-hidden');
      const visibile = conContenuto(root);

      bottone(root, 'dieta').click();

      expect(vecchia.scrollToTop).not.toHaveBeenCalled();
      expect(visibile.scrollToTop).toHaveBeenCalledTimes(1);
    });
  });
});
