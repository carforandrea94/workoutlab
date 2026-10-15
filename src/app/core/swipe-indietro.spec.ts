import { Component, Optional } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { IonRouterOutlet } from '@ionic/angular';
import { providerPagina } from '../../test-support/pagina';
import { senzaSwipeIndietro } from './swipe-indietro';

/**
 * Le pagine con la guardia sulle modifiche non salvate spengono lo swipe
 * indietro dell'outlet di Ionic. Qui un outlet vero: una pagina instradata lo
 * riceve davvero dall'iniezione (con @Optional, come nei componenti), e il
 * gesto si spegne e si riaccende su di lui.
 */
@Component({ standalone: true, template: '<p>pagina</p>' })
class Pagina {
  constructor(@Optional() public outlet: IonRouterOutlet | null) {}
}

@Component({ standalone: true, imports: [IonRouterOutlet], template: '<ion-router-outlet></ion-router-outlet>' })
class Radice {}

describe('senzaSwipeIndietro', () => {
  it('una pagina instradata riceve l\'outlet vero e il gesto si spegne e si riaccende', async () => {
    TestBed.configureTestingModule({
      imports: [Radice, Pagina],
      providers: [...providerPagina([{ path: '', component: Pagina }])]
    });
    const fixture = TestBed.createComponent(Radice);
    fixture.detectChanges();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    fixture.detectChanges();
    await fixture.whenStable();

    const pagina = fixture.debugElement.children
      .flatMap(function raccogli(d: any): any[] { return [d, ...d.children.flatMap(raccogli)]; })
      .map((d: any) => d.componentInstance)
      .find((c: unknown) => c instanceof Pagina) as Pagina | undefined;

    expect(pagina, 'la pagina instradata non e\' stata creata').toBeTruthy();
    expect(pagina!.outlet, 'IonRouterOutlet non arriva alla pagina').toBeInstanceOf(IonRouterOutlet);

    // IonRouterOutlet ha solo il setter di swipeGesture: lo stato si legge sull'elemento
    // dell'outlet (la proprieta' che Ionic guarda) e sul gestore che gli si attacca.
    const el = (pagina!.outlet as any).nativeEl;
    const swipe = senzaSwipeIndietro(pagina!.outlet);

    swipe.spegni();
    expect(el.swipeGesture).toBe(false);
    expect(el.swipeHandler).toBeUndefined();

    swipe.riaccendi();
    expect(el.swipeGesture).toBe(true);
    expect(el.swipeHandler).toBeDefined();
  });

  it('senza outlet (null) non fa niente e non si rompe', () => {
    const swipe = senzaSwipeIndietro(null);
    expect(() => { swipe.spegni(); swipe.riaccendi(); }).not.toThrow();
  });
});
