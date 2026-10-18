import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ICONE, NomeIcona, STILE_ICONE, StileIcone } from '../../core/icone';
import { IconaComponent } from './icona.component';

@Component({
  standalone: true,
  imports: [IconaComponent],
  template: `<span class="testo"><app-icona [name]="nome()" [size]="lato()" [piena]="piena()"></app-icona></span>`
})
class Ospite {
  nome = signal<NomeIcona>('trash');
  lato = signal(14);
  piena = signal(false);
}

/** L'icona disegna la variante della piattaforma, al lato chiesto, e non si fa leggere. */
describe('app-icona', () => {
  function monta(stile: StileIcone) {
    TestBed.configureTestingModule({ imports: [Ospite], providers: [{ provide: STILE_ICONE, useValue: stile }] });
    const f = TestBed.createComponent(Ospite);
    f.detectChanges();
    const host = () => f.nativeElement.querySelector('app-icona') as HTMLElement;
    const icona = () => host().querySelector('ion-icon') as HTMLElement & { icon?: string };
    return { f, host, icona };
  }

  it('su iOS e Safari la variante a contorno', () => {
    const { icona } = monta('ios');
    expect(icona().icon).toBe(ICONE.trash.ios);
  });

  it('su Android e Chrome la variante Material', () => {
    const { icona } = monta('md');
    expect(icona().icon).toBe(ICONE.trash.md);
  });

  it('piena: su iOS la versione piena, su Android resta quella Material', () => {
    const ios = monta('ios');
    ios.f.componentInstance.nome.set('play');
    ios.f.componentInstance.piena.set(true);
    ios.f.detectChanges();
    expect(ios.icona().icon).toBe(ICONE.play.piena);
    TestBed.resetTestingModule();

    const md = monta('md');
    md.f.componentInstance.nome.set('play');
    md.f.componentInstance.piena.set(true);
    md.f.detectChanges();
    expect(md.icona().icon).toBe(ICONE.play.md);
  });

  it('cambia col nome', () => {
    const { f, icona } = monta('ios');
    f.componentInstance.nome.set('checkmark');
    f.detectChanges();
    expect(icona().icon).toBe(ICONE.checkmark.ios);
  });

  it('il lato e\' quello chiesto, in larghezza, altezza e corpo (l\'ion-icon e\' largo 1em)', () => {
    const { f, host } = monta('ios');
    expect([host().style.width, host().style.height, host().style.fontSize]).toEqual(['14px', '14px', '14px']);
    f.componentInstance.lato.set(23);
    f.detectChanges();
    expect(host().style.width).toBe('23px');
  });

  it('e\' nascosta allo screen reader, e porta il suo nome per chi la cerca', () => {
    const { host, icona } = monta('ios');
    expect(host().getAttribute('aria-hidden')).toBe('true');
    expect(icona().getAttribute('aria-hidden')).toBe('true');
    expect(host().getAttribute('name')).toBe('trash');
  });
});
