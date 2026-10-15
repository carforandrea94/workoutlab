import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NavController } from '@ionic/angular';
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

  afterEach(() => document.documentElement.classList.remove('senza-tabbar', 'con-pillola'));

  async function monta(opzioni: { sessioneSuGiorno?: boolean; sessione?: { dayId: string; dayLabel?: string; pausedAt?: string | null } } = {}) {
    // La sessione in corso: o quella sul giorno 0 (comodo per i test della fascia),
    // o una descritta per intero (la pillola dipende da quale giorno e' e se e' in pausa).
    const attiva = signal<any>(opzioni.sessione ?? (opzioni.sessioneSuGiorno ? { dayId: 'day1', pausedAt: null } : null));
    TestBed.configureTestingModule({
      imports: [TabsPage],
      providers: [
        ...providerPagina(rotte),
        { provide: WorkoutDataService, useValue: { days: [{ id: 'day1', label: 'Petto' }, { id: 'day2', label: 'Gambe' }] } },
        { provide: WorkoutSessionStateService, useValue: {
          activeSession: attiva,
          isActiveForDay: (id: string) => attiva()?.dayId === id,
          elapsedSec: signal(1390),
          formatDuration: () => '23:10'
        } }
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
    return { fixture, root, barra, vai, router, attiva };
  }

  it('ogni tab ha il suo href: serve a renderla focalizzabile col Tab, non a navigare', async () => {
    // Senza href l'<a role="tab"> interno non e' focalizzabile e la barra restava
    // fuori dalla tastiera. `href` e' una proprieta' del componente, non un attributo.
    const { root } = await monta();
    const href = Array.from(root.querySelectorAll<HTMLElement>('ion-tab-button'))
      .map(b => [(b as any).tab, (b as any).href]);
    expect(href).toEqual([
      ['scheda', '/scheda'], ['dieta', '/dieta'], ['corsa', '/corsa'], ['misure', '/misure'], ['account', '/account']
    ]);
  });

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

  describe('la pillola della sessione in corso', () => {
    const pillola = (root: HTMLElement) => root.querySelector<HTMLElement>('.sessionpill');
    const inCorso = { dayId: 'day2', dayLabel: 'Gambe', pausedAt: null };

    it('senza sessione non c\'e\' e il contenuto non tiene spazio per lei', async () => {
      const { root } = await monta();
      expect(pillola(root)).toBeNull();
      expect(document.documentElement.classList.contains('con-pillola')).toBe(false);
    });

    it('con una sessione, fuori dal suo giorno, dice che e\' in corso, da quanto e come riprenderla', async () => {
      const { root, fixture } = await monta({ sessione: inCorso });
      fixture.detectChanges();

      const p = pillola(root)!;
      expect(p).toBeTruthy();
      expect(p.textContent).toContain('In corso');
      expect(p.textContent).toContain('23:10');
      expect(p.textContent).toContain('Riprendi');
      expect(p.getAttribute('aria-label')).toBe('Allenamento in corso, 23:10. Riprendi.');
    });

    it('sopra la barra sulle radici; al posto della barra dove la barra scivola via', async () => {
      const { root, vai, fixture } = await monta({ sessione: inCorso });
      fixture.detectChanges();
      expect(pillola(root)!.classList.contains('senza-barra')).toBe(false);

      await vai('/dieta/lista-spesa');

      expect(pillola(root)!.classList.contains('senza-barra')).toBe(true);
    });

    it('il contenuto tiene lo spazio per lei finche\' c\'e', async () => {
      const { fixture, attiva } = await monta({ sessione: inCorso });
      fixture.detectChanges();
      expect(document.documentElement.classList.contains('con-pillola')).toBe(true);

      attiva.set(null);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(document.documentElement.classList.contains('con-pillola')).toBe(false);
    });

    it('in pausa lo dice', async () => {
      const { root, fixture } = await monta({ sessione: { ...inCorso, pausedAt: '2026-10-15T10:00:00.000Z' } });
      fixture.detectChanges();

      const p = pillola(root)!;
      expect(p.textContent).toContain('In pausa');
      expect(p.classList.contains('in-pausa')).toBe(true);
      expect(p.getAttribute('aria-label')).toContain('in pausa');
    });

    it('sulla pagina di un giorno non c\'e\': li\' la sessione si vede gia\'', async () => {
      const { root, vai, fixture } = await monta({ sessione: inCorso });
      fixture.detectChanges();

      await vai('/scheda/day/0');

      expect(pillola(root)).toBeNull();
    });

    it('toccarla riporta sul giorno della sessione', async () => {
      const { root, fixture } = await monta({ sessione: inCorso });
      fixture.detectChanges();
      const vaiA = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);

      pillola(root)!.click();

      expect(vaiA).toHaveBeenCalledWith(['/scheda/day', 1]); // day2 e' il secondo giorno
    });

    it('se il protocollo non ha piu\' quel giorno porta sul primo, dove la sessione si puo\' annullare', async () => {
      const { root, fixture } = await monta({ sessione: { dayId: 'sparito', pausedAt: null } });
      fixture.detectChanges();
      const vaiA = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);

      pillola(root)!.click();

      expect(vaiA).toHaveBeenCalledWith(['/scheda/day', 0]);
    });

    it('se la sessione ha un\'etichetta diversa dal giorno di quell\'id, non lo considera lo stesso allenamento', async () => {
      // gli id sono posizionali: day2 oggi puo' essere un altro allenamento di ieri
      const { root, fixture } = await monta({ sessione: { dayId: 'day2', dayLabel: 'Schiena', pausedAt: null } });
      fixture.detectChanges();
      const vaiA = vi.spyOn(TestBed.inject(NavController), 'navigateForward').mockResolvedValue(true);

      pillola(root)!.click();

      expect(vaiA).toHaveBeenCalledWith(['/scheda/day', 0]);
    });
  });
});
