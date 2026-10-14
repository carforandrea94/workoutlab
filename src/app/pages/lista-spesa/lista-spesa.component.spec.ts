import { describe, it, expect, vi } from 'vitest';
import { ListaSpesaComponent } from './lista-spesa.component';

/**
 * La lista della spesa porta i nomi e basta.
 *
 * Grammature, pasti di provenienza e note del coach ci stavano dentro e ne
 * sono uscite: la lista si legge in piedi al supermercato, dove le uniche
 * domande sono cosa prendere e cosa e' gia' nel carrello.
 */
function cibo(name: string, qty = '100 g', alt: any[] = []) {
  return { id: name, name, qty, alt };
}

function pasto(name: string, combo: any, alternatives: any = { carb: [], protein: [], fat: [] }) {
  return { id: name, name, combinations: [{ id: 'c1', label: 'Base', ...combo }], alternatives };
}

function componente(diet: any[], checked: Record<string, boolean> = {}) {
  const c = new ListaSpesaComponent(
    { diet } as any,
    { patch: vi.fn(), patchField: vi.fn(() => Promise.resolve()) } as any,
    { detectChanges: () => {} } as any
  );
  (c as any).buildItems(checked);
  return c;
}

const DIETA = [{
  id: 'p1', name: 'Giorno ON',
  meals: [
    pasto('Colazione',
      { carb: cibo('Cornflakes'), protein: cibo('Albume'), fat: cibo("Burro d'arachidi") },
      { carb: [cibo('Pane')], protein: [], fat: [] }),
    pasto('Pranzo',
      { carb: cibo('Riso'), protein: cibo('Calamaro'), fat: cibo('Olio EVO') })
  ]
}];

describe('ListaSpesa — la lista porta i nomi, e basta', () => {
  it('ogni voce ha il nome e il macro, niente altro', () => {
    const c = componente(DIETA);
    const riso = c.items.find(i => i.name === 'Riso')!;
    expect(riso).toEqual({ key: 'riso', name: 'Riso', cat: 'carb', checked: false });
    // Le grammature non arrivano fino a qui: la dieta le dice quando si cucina.
    expect(Object.keys(riso)).toEqual(['key', 'name', 'cat', 'checked']);
  });

  it('lo stesso alimento in piu\' pasti e\' una voce sola', () => {
    const dieta = [{
      id: 'p1', name: 'Giorno ON',
      meals: [
        pasto('Pranzo', { carb: null, protein: cibo('Calamaro', '300 g'), fat: null }),
        pasto('Cena', { carb: null, protein: cibo('Calamaro', '250 g'), fat: null })
      ]
    }];
    expect(componente(dieta).items.filter(i => i.name === 'Calamaro').length).toBe(1);
  });

  it('le alternative annidate entrano in lista col macro del padre', () => {
    const dieta = [{
      id: 'p1', name: 'Giorno ON',
      meals: [pasto('Colazione', {
        carb: cibo("Farina d'avena", '80 g', [cibo('Farina di riso')]), protein: null, fat: null
      })]
    }];
    const farina = componente(dieta).items.find(i => i.name === 'Farina di riso');
    expect(farina).toBeDefined();
    expect(farina!.cat).toBe('carb');
  });

  it('raggruppa per macro e conta quanti ne mancano', () => {
    const c = componente(DIETA);
    const g = c.groups;
    expect(g.map(x => x.label)).toEqual(['Carboidrati', 'Proteine', 'Grassi']);
    expect(g[0].totale).toBe(3);        // Cornflakes, Pane, Riso
    expect(g[0].presi).toBe(0);
    expect(g[1].daPrendere.map(i => i.name)).toEqual(['Albume', 'Calamaro']);
  });

  it('un macro senza alimenti non fa gruppo', () => {
    const dieta = [{
      id: 'p1', name: 'Giorno ON',
      meals: [pasto('Pranzo', { carb: cibo('Riso'), protein: null, fat: null })]
    }];
    expect(componente(dieta).groups.map(g => g.label)).toEqual(['Carboidrati']);
  });
});

describe('ListaSpesa — il carrello', () => {
  it('quello che e\' preso esce dal reparto ed entra nel carrello', () => {
    const c = componente(DIETA);
    const riso = c.items.find(i => i.name === 'Riso')!;
    c.toggle(riso);

    const carbo = c.groups.find(g => g.label === 'Carboidrati')!;
    expect(carbo.daPrendere.map(i => i.name)).not.toContain('Riso');
    expect(carbo.presi).toBe(1);
    expect(carbo.totale).toBe(3);
    expect(c.itemsPresi.map(i => i.name)).toEqual(['Riso']);
  });

  it('togliere la spunta lo rimanda nel suo reparto', () => {
    const c = componente(DIETA);
    const riso = c.items.find(i => i.name === 'Riso')!;
    c.toggle(riso);
    c.toggle(riso);
    expect(c.groups.find(g => g.label === 'Carboidrati')!.daPrendere.map(i => i.name)).toContain('Riso');
    expect(c.itemsPresi).toEqual([]);
  });

  it('nasce chiuso e si apre al tocco', () => {
    const c = componente(DIETA);
    expect(c.cartOpen).toBe(false);
    c.toggleCart();
    expect(c.cartOpen).toBe(true);
  });

  it('svuotare riporta tutto nei reparti e richiude il carrello', async () => {
    const c = componente(DIETA);
    c.toggle(c.items[0]);
    c.cartOpen = true;

    await c.resetAll();

    expect(c.checkedCount).toBe(0);
    expect(c.cartOpen).toBe(false);
  });

  it('l\'avanzamento conta anche gli alimenti aggiunti a mano', () => {
    const c = componente(DIETA);
    c.customItems = [{ id: 'x', name: 'Caffè', checked: true }];
    // 7 dalla dieta + 1 aggiunto, uno solo preso
    expect(c.totalCount).toBe(8);
    expect(c.checkedCount).toBe(1);
    expect(c.progress).toBe(13);
    expect(c.customDaPrendere).toEqual([]);
    expect(c.customPresi.map(i => i.name)).toEqual(['Caffè']);
  });

  it('senza niente in lista l\'avanzamento non divide per zero', () => {
    const c = componente([]);
    expect(c.totalCount).toBe(0);
    expect(c.progress).toBe(0);
  });

  it('riprende le spunte salvate', () => {
    const c = componente(DIETA, { riso: true });
    expect(c.items.find(i => i.name === 'Riso')!.checked).toBe(true);
    expect(c.checkedCount).toBe(1);
  });
});

/**
 * La ricerca. Cinquanta voci sono troppe da scorrere con una mano sola e il
 * carrello nell'altra: si scrive il nome e la lista si stringe.
 */
describe('ListaSpesa — cercare un alimento', () => {
  it('senza ricerca passano tutti', () => {
    const c = componente(DIETA);
    expect(c.filtroAttivo).toBe(false);
    expect(c.risultati).toBe(7);
  });

  it('trova per pezzo di parola, non solo dall\'inizio', () => {
    const c = componente(DIETA);
    c.query = 'lama';
    expect(c.groups.find(g => g.label === 'Proteine')!.daPrendere.map(i => i.name)).toEqual(['Calamaro']);
    expect(c.risultati).toBe(1);
  });

  it('ignora maiuscole e accenti: "caffe" trova "Caffè"', () => {
    const c = componente(DIETA);
    c.customItems = [{ id: 'x', name: 'Caffè', checked: false }];
    c.query = 'CAFFE';
    expect(c.customDaPrendere.map(i => i.name)).toEqual(['Caffè']);
  });

  it('i reparti senza niente da mostrare spariscono, ma i conteggi restano veri', () => {
    const c = componente(DIETA);
    c.query = 'riso';
    const carbo = c.groups.find(g => g.label === 'Carboidrati')!;
    expect(carbo.daPrendere.map(i => i.name)).toEqual(['Riso']);
    // "1 / 14" descrive il reparto, non la ricerca: non si restringe con lei.
    expect(carbo.totale).toBe(3);
    expect(c.groups.find(g => g.label === 'Proteine')!.daPrendere).toEqual([]);
  });

  it('il carrello si apre da solo se la risposta e\' li\' dentro', () => {
    const c = componente(DIETA);
    const riso = c.items.find(i => i.name === 'Riso')!;
    c.toggle(riso);
    expect(c.carrelloAperto).toBe(false);

    c.query = 'riso';
    // Nascosto in una sezione chiusa si leggerebbe come "non ce l'hai".
    expect(c.carrelloAperto).toBe(true);
    expect(c.itemsPresi.map(i => i.name)).toEqual(['Riso']);
  });

  it('il carrello resta chiuso se la risposta non e\' li\'', () => {
    const c = componente(DIETA);
    c.toggle(c.items.find(i => i.name === 'Riso')!);
    c.query = 'calamaro';
    expect(c.carrelloAperto).toBe(false);
  });

  it('cercato e non trovato e\' diverso da lista vuota', () => {
    const c = componente(DIETA);
    c.query = 'ananas';
    expect(c.risultati).toBe(0);
    expect(c.nessunRisultato).toBe(true);

    const vuota = componente([]);
    vuota.query = 'ananas';
    expect(vuota.nessunRisultato).toBe(false);
  });

  it('quello che si cercava invano si puo\' aggiungere, e la ricerca si spegne', () => {
    const c = componente(DIETA);
    c.query = '  Ananas  ';
    c.aggiungiCercato();
    expect(c.customItems.map(i => i.name)).toEqual(['Ananas']);
    expect(c.query).toBe('');
    expect(c.filtroAttivo).toBe(false);
  });

  it('pulire la ricerca rimette tutto in lista', () => {
    const c = componente(DIETA);
    c.query = 'riso';
    c.pulisciRicerca();
    expect(c.query).toBe('');
    expect(c.risultati).toBe(7);
  });
});
