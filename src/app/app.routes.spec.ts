import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, Routes, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { routes } from './app.routes';
import { MisureComponent } from './pages/misure/misure.component';
import { ProgressiComponent } from './pages/progressi/progressi.component';
import { ObiettivoComponent } from './pages/obiettivo/obiettivo.component';

@Component({ standalone: true, template: '' })
class Vuota {}

/** Le pagine sotto TabsPage: il primo segmento dell'indirizzo e' la pila (la tab) in cui stanno. */
const dentroLeTab = (routes.find(r => r.path === '' && r.children)?.children ?? []) as Route[];

/**
 * Le misure stanno nella pila di Progressi, sotto /progressi/misure; i vecchi
 * indirizzi (/misure/..., e /account/misure/... di quando stavano in Account)
 * portano li' in un salto solo. L'andamento non e' una pagina a parte: e' Misure stessa.
 */
describe('rotte — Misure dentro Progressi', () => {
  const pagine = dentroLeTab.filter(r => r.loadComponent && r.path?.includes('misure'));

  it('le quattro pagine delle misure stanno nella pila di Progressi', () => {
    expect(pagine.map(r => r.path)).toEqual([
      'progressi/misure', 'progressi/misure/storico', 'progressi/misure/:categoria', 'progressi/misure/storico/:key'
    ]);
  });

  it('Progressi è una pagina radice, nella pila "progressi"', async () => {
    const r = dentroLeTab.find(x => x.path === 'progressi')!;
    expect(await (r.loadComponent!() as Promise<unknown>)).toBe(ProgressiComponent);
    expect(r.canDeactivate).toBeUndefined();
  });

  it('Misure è il grafico dell\'andamento; il vecchio indirizzo dell\'andamento è solo un rimando', async () => {
    const pagina = await (pagine.find(r => r.path === 'progressi/misure')!.loadComponent!() as Promise<unknown>);
    expect(pagina).toBe(MisureComponent);
    const andamento = dentroLeTab.find(r => r.path === 'progressi/misure/analytics')!;
    expect(andamento.loadComponent).toBeUndefined();
    expect(andamento.redirectTo).toBe('progressi/misure');
  });

  it('storico e il rimando dell\'andamento vengono prima di :categoria, che altrimenti li prenderebbe', () => {
    const i = (p: string) => dentroLeTab.findIndex(r => r.path === p);
    expect(i('progressi/misure/storico')).toBeLessThan(i('progressi/misure/:categoria'));
    expect(i('progressi/misure/analytics')).toBeLessThan(i('progressi/misure/:categoria'));
  });

  it('lo stesso vale per i rimandi: storico e andamento prima di :categoria', () => {
    const i = (p: string) => dentroLeTab.findIndex(r => r.path === p);
    for (const prefisso of ['account/misure', 'misure']) {
      expect(i(`${prefisso}/storico`)).toBeLessThan(i(`${prefisso}/:categoria`));
      expect(i(`${prefisso}/analytics`)).toBeLessThan(i(`${prefisso}/:categoria`));
      expect(i(`${prefisso}/storico/:key`)).toBeLessThan(i(`${prefisso}/:categoria`));
    }
  });

  it('la pagina di una categoria tiene la guardia delle modifiche non salvate', () => {
    expect(pagine.find(r => r.path === 'progressi/misure/:categoria')?.canDeactivate?.length).toBe(1);
  });

  it('sotto /misure e sotto /account/misure non resta nessuna pagina, solo i rimandi', () => {
    for (const prefisso of ['misure', 'account/misure']) {
      const vecchie = dentroLeTab.filter(r => r.path === prefisso || r.path?.startsWith(prefisso + '/'));
      expect(vecchie.length).toBe(5);
      expect(vecchie.every(r => !r.loadComponent && typeof r.redirectTo === 'string')).toBe(true);
    }
  });

  describe('i vecchi indirizzi', () => {
    // Le rotte vere, con al posto delle pagine una pagina vuota: conta dove si arriva.
    async function vaiA(url: string): Promise<string> {
      const prova: Routes = dentroLeTab
        .filter(r => r.redirectTo !== undefined ? r.path !== '' : r.path?.startsWith('progressi/misure'))
        .map(r => (r.loadComponent ? { path: r.path, component: Vuota } : r));
      TestBed.configureTestingModule({ providers: [provideRouter(prova)] });
      const router = TestBed.inject(Router);
      await router.navigateByUrl(url);
      return router.url;
    }

    it.each([
      ['/misure', '/progressi/misure'],
      ['/misure/storico', '/progressi/misure/storico'],
      ['/misure/analytics', '/progressi/misure'],
      ['/misure/peso', '/progressi/misure/peso'],
      ['/misure/storico/2026-05-01', '/progressi/misure/storico/2026-05-01'],
      ['/account/misure', '/progressi/misure'],
      ['/account/misure/storico', '/progressi/misure/storico'],
      ['/account/misure/analytics', '/progressi/misure'],
      ['/account/misure/peso', '/progressi/misure/peso'],
      ['/account/misure/storico/2026-05-01', '/progressi/misure/storico/2026-05-01']
    ])('%s porta a %s', async (vecchio, nuovo) => {
      expect(await vaiA(vecchio)).toBe(nuovo);
    });

    it.each([
      ['/misure/pliche?date=2026-05-01'],
      ['/account/misure/pliche?date=2026-05-01']
    ])('anche coi parametri: %s si modifica la stessa misurazione', async (vecchio) => {
      expect(await vaiA(vecchio)).toBe('/progressi/misure/pliche?date=2026-05-01');
    });
  });
});

/** Il mio obiettivo sta nella pila di Account, come le Impostazioni: si apre dalla sua riga. */
describe('rotte — Il mio obiettivo', () => {
  it('/account/obiettivo apre la pagina dell\'obiettivo, senza guardia: si salva mentre si sceglie', async () => {
    const r = dentroLeTab.find(x => x.path === 'account/obiettivo')!;
    expect(await (r.loadComponent!() as Promise<unknown>)).toBe(ObiettivoComponent);
    expect(r.canDeactivate).toBeUndefined();
  });
});
