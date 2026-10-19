import { Component, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { NomeCampoDirective, nomeDelCampo } from './nome-campo.directive';

/**
 * Un campo Ionic con la sua etichetta accanto non e' per forza un campo con un
 * nome: il <label for> punta all'elemento custom, non all'<input> vero.
 */
@Component({
  standalone: true,
  imports: [NomeCampoDirective],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <div class="authfield" id="a">
      <label for="email">Email</label>
      <div><ion-input id="email" placeholder="nome@esempio.com"></ion-input></div>
    </div>
    <div class="measure-field" id="b">
      <label>{{ etichetta }}</label>
      <div><ion-input id="peso" placeholder="82"></ion-input></div>
    </div>
    <div id="c"><ion-input placeholder="Alimento"></ion-input></div>
    <div class="authfield" id="d">
      <label>Gruppo muscolare</label>
      <div><ion-select></ion-select></div>
    </div>
    <div id="e"><ion-searchbar placeholder="Cerca un alimento"></ion-searchbar></div>
    <div class="authfield" id="f">
      <label>Nome</label>
      <div><ion-input aria-label="Nome del protocollo"></ion-input></div>
    </div>
    <div class="authfield" id="g">
      <label>Nome</label>
      <div><ion-input aria-labelledby="altro"></ion-input></div>
    </div>
    <div id="h"><ion-input></ion-input></div>
    <div id="j"><ion-input label="Nome" placeholder="Es. Panca piana"></ion-input></div>
    <div id="k"><ion-input [label]="etichetta" placeholder="—"></ion-input></div>
    <div id="l"><ion-select label="Schema"></ion-select></div>
    <div id="m"><ion-input placeholder="Es. 80 g"><div slot="label">Quantità</div></ion-input></div>
    <div id="i"><span class="fuori">non un campo</span></div>
  `
})
class Host { etichetta = 'Peso'; }

function monta() {
  TestBed.configureTestingModule({ imports: [Host] });
  const fx = TestBed.createComponent(Host);
  fx.detectChanges();
  const root: HTMLElement = fx.nativeElement;
  const campo = (id: string) => root.querySelector(`#${id}`)!.querySelector('ion-input, ion-select, ion-searchbar') as HTMLElement;
  return { fx, root, campo };
}

describe('NomeCampoDirective', () => {
  it('prende il nome dall\'etichetta del campo (label for)', () => {
    expect(monta().campo('a').getAttribute('aria-label')).toBe('Email');
  });

  it('senza "for" lo prende dal <label> della sua scatola, anche se il testo e\' un\'interpolazione', () => {
    expect(monta().campo('b').getAttribute('aria-label')).toBe('Peso');
  });

  it('senza etichetta ripiega sul segnaposto', () => {
    const { campo } = monta();
    expect(campo('c').getAttribute('aria-label')).toBe('Alimento');
    expect(campo('e').getAttribute('aria-label')).toBe('Cerca un alimento');
  });

  it('vale anche per i menu a tendina', () => {
    expect(monta().campo('d').getAttribute('aria-label')).toBe('Gruppo muscolare');
  });

  it('un nome scritto a mano vince, e aria-labelledby anche', () => {
    const { campo } = monta();
    expect(campo('f').getAttribute('aria-label')).toBe('Nome del protocollo');
    expect(campo('g').hasAttribute('aria-label')).toBe(false);
  });

  it('l\'etichetta di Ionic (la prop label, scritta o legata, o lo slot) e\' gia\' il nome: il segnaposto non le passa sopra', () => {
    const { campo } = monta();
    for (const id of ['j', 'k', 'l', 'm']) expect(campo(id).hasAttribute('aria-label'), id).toBe(false);
  });

  it('senza etichetta ne\' segnaposto non inventa niente', () => {
    expect(monta().campo('h').hasAttribute('aria-label')).toBe(false);
  });

  it('lo scrive anche sull\'<input> vero quando Ionic ha finito di caricare', async () => {
    TestBed.configureTestingModule({ imports: [Host] });
    // Un elemento che si dichiara pronto in un secondo momento, come fa Stencil.
    const proto = HTMLElement.prototype as any;
    const prima = proto.componentOnReady;
    proto.componentOnReady = function () { return Promise.resolve(); };
    try {
      const fx = TestBed.createComponent(Host);
      const radice: HTMLElement = fx.nativeElement;
      const campoA = radice.querySelector('#a ion-input') as HTMLElement;
      const nativo = document.createElement('input');
      campoA.appendChild(nativo);
      fx.detectChanges();
      await Promise.resolve();
      await Promise.resolve();
      expect(nativo.getAttribute('aria-label')).toBe('Email');
    } finally {
      proto.componentOnReady = prima;
    }
  });

  it('non sovrascrive il nome che l\'<input> vero ha gia\'', async () => {
    const proto = HTMLElement.prototype as any;
    const prima = proto.componentOnReady;
    proto.componentOnReady = function () { return Promise.resolve(); };
    try {
      TestBed.configureTestingModule({ imports: [Host] });
      const fx = TestBed.createComponent(Host);
      const campoA = (fx.nativeElement as HTMLElement).querySelector('#a ion-input') as HTMLElement;
      const nativo = document.createElement('input');
      nativo.setAttribute('aria-label', 'Gia\' scritto');
      campoA.appendChild(nativo);
      fx.detectChanges();
      await Promise.resolve();
      await Promise.resolve();
      expect(nativo.getAttribute('aria-label')).toBe('Gia\' scritto');
    } finally {
      proto.componentOnReady = prima;
    }
  });
});

describe('nomeDelCampo', () => {
  it('toglie gli spazi in piu\' dell\'etichetta', () => {
    const div = document.createElement('div');
    div.className = 'authfield';
    div.innerHTML = '<label>  Nome \n  esercizio </label><ion-input></ion-input>';
    document.body.appendChild(div);
    expect(nomeDelCampo(div.querySelector('ion-input') as HTMLElement)).toBe('Nome esercizio');
    div.remove();
  });
});
