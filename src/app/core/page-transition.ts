import { Animation, AnimationBuilder, createAnimation, iosTransitionAnimation } from '@ionic/angular';

/**
 * La transizione fra due pagine, nel disegno di iOS ma con la testata
 * coreografata a mano.
 *
 * Quella di serie di Ionic (iosTransitionAnimation) fa scorrere il titolo
 * per tutta la larghezza dello schermo, fa sparire e riapparire la freccia
 * "indietro" anche quando c'e' su tutte e due le pagine, e dissolve il fondo
 * della barra con la stessa curva a molla del resto: in pochi centesimi la
 * pagina che esce e' gia' sparita e quella che entra e' ancora a un quarto, e
 * la testata resta per un attimo quasi vuota. Su una barra come la nostra -
 * fondo uguale alla pagina, titolo a sinistra, nessuna linea - si vede come uno
 * sfarfallio, non come uno scorrimento.
 *
 * Qui:
 *  - il contenuto scorre come in iOS (entra da destra, l'altra pagina arretra
 *    di un terzo con l'ombra), un po' piu' svelto;
 *  - la freccia "indietro" sta ferma se c'e' su tutte e due le pagine, e si
 *    dissolve solo se manca da una;
 *  - il titolo e le azioni si dissolvono con la curva lineare, sfalsati: il
 *    vecchio esce nella prima meta', il nuovo entra dalla fine del primo terzo,
 *    cosi' non c'e' un momento senza niente; il titolo si sposta di pochi
 *    punti, non attraversa la barra;
 *  - il fondo della pagina in cima lascia vedere la testata sotto finche' gli
 *    elementi non si sono scambiati, poi la copre.
 *
 * La barra in basso di una pagina interna (ion-footer.barra-azione) e' la
 * barra delle tab di quella pagina: come lei non scorre di lato con il
 * contenuto, sale dal fondo con la pagina che entra e scende con quella che
 * esce. Prima scivolava con la pagina e insieme saliva per conto suo: entrava
 * in diagonale, e usciva di lato mentre la barra delle tab saliva.
 *
 * Il titolo grande (ion-header collapse="condense") sta nel contenuto e scorre
 * con la pagina: niente copia che vola verso la freccia, che qui non ha testo.
 * Il titolo piccolo della barra, quando Ionic lo tiene nascosto perche' il
 * grande e' in vista, non si tocca.
 *
 * Se una delle due pagine non ha la struttura attesa (testata e contenuto come
 * figli diretti: e' il caso del guscio delle tab) si lascia fare a Ionic.
 */
const DURATA = 420;
const CURVA = 'cubic-bezier(0.32,0.72,0,1)';
/** Quanto si sposta il titolo, in punti: abbastanza da sentirsi, troppo poco per scavalcare le azioni. */
const SPOSTAMENTO_TITOLO = 18;
const OPACITA_PAGINA_SOTTO = 0.8;

export interface Fotogramma { offset: number; opacity: number }

/** Ionic tipizza i fotogrammi come una tupla di due: qui sono liste con gli offset. */
type Fotogrammi = Parameters<Animation['keyframes']>[0];
const come = (frames: object[]): Fotogrammi => frames as unknown as Fotogrammi;

/** La pagina vera di una vista: l'elemento stesso se e' un ion-page, altrimenti il figlio che lo e' (come getIonPageElement di Ionic, che il pacchetto standalone non esporta). */
const paginaDi = (el: HTMLElement): HTMLElement =>
  el.classList.contains('ion-page') ? el : (el.querySelector(':scope > .ion-page, :scope > ion-nav, :scope > ion-tabs') as HTMLElement | null) ?? el;

/** Ionic modifica i fotogrammi che riceve: a ogni uso se ne passa una copia, o dalla seconda transizione le dissolvenze non partono. */
const copia = (frames: Fotogramma[]): Fotogramma[] => frames.map(f => ({ ...f }));

/** Dissolvenza in uscita: piena fino all'inizio, zero dalla meta' in poi. */
export const USCITA: Fotogramma[] = [
  { offset: 0, opacity: 0.99 },
  { offset: 0.45, opacity: 0 },
  { offset: 1, opacity: 0 }
];

/** Dissolvenza in entrata: parte quando la vecchia e' a meta' strada, arriva piena a 4/5. */
export const ENTRATA: Fotogramma[] = [
  { offset: 0, opacity: 0.01 },
  { offset: 0.3, opacity: 0.01 },
  { offset: 0.8, opacity: 1 },
  { offset: 1, opacity: 1 }
];

/** Il fondo della barra della pagina in cima, in avanti: trasparente finche' i due titoli si cambiano, poi pieno. */
const FONDO_IN_AVANTI: Fotogramma[] = [
  { offset: 0, opacity: 0.01 },
  { offset: 0.45, opacity: 0.01 },
  { offset: 0.8, opacity: 1 },
  { offset: 1, opacity: 1 }
];

/** Il fondo della barra della pagina in cima, indietro: pieno finche' i suoi elementi spariscono, poi lascia vedere quella sotto. */
const FONDO_INDIETRO: Fotogramma[] = [
  { offset: 0, opacity: 1 },
  { offset: 0.15, opacity: 1 },
  { offset: 0.55, opacity: 0.01 },
  { offset: 1, opacity: 0.01 }
];

interface Testata {
  barra: HTMLElement;
  sfondo: Element | null;
  /** null se Ionic lo tiene nascosto (titolo grande in vista): e' lui a gestirne l'opacita'. */
  titolo: HTMLElement | null;
  indietro: HTMLElement | null;
  azioni: HTMLElement[];
  altri: Element[];
}

const barre = (pagina: HTMLElement): HTMLElement[] =>
  Array.from(pagina.querySelectorAll<HTMLElement>(':scope > ion-header > ion-toolbar'));

const ombra = (el: Element): ParentNode => el.shadowRoot || el;

function leggiBarra(barra: HTMLElement): Testata {
  const testata = barra.closest('ion-header');
  const inattiva = !!testata?.classList.contains('header-collapse-condense-inactive');
  const bottone = barra.querySelector<HTMLElement>('ion-back-button');
  const indietroVisibile = !!bottone && getComputedStyle(bottone).display !== 'none';
  const gruppi = Array.from(barra.querySelectorAll<HTMLElement>(':scope > ion-buttons'));
  return {
    barra,
    sfondo: ombra(barra).querySelector('.toolbar-background'),
    titolo: inattiva ? null : barra.querySelector<HTMLElement>(':scope > ion-title'),
    indietro: indietroVisibile ? bottone : null,
    azioni: gruppi.filter(g => !g.contains(bottone)),
    altri: Array.from(barra.querySelectorAll(':scope > *:not(ion-title):not(ion-buttons)'))
  };
}

/** Un elemento che si dissolve e, se serve, si sposta: due animazioni sullo stesso elemento, ciascuna con la sua curva. */
function elemento(radice: Animation, el: Element | Element[] | null, opacita: Fotogramma[], spostamento?: [string, string]): void {
  const lista = Array.isArray(el) ? el : el ? [el] : [];
  if (lista.length === 0) return;
  radice.addAnimation(
    createAnimation().addElement(lista).easing('linear').keyframes(come(copia(opacita))).afterClearStyles(['opacity'])
  );
  if (spostamento) {
    radice.addAnimation(
      createAnimation().addElement(lista).fromTo('transform', `translateX(${spostamento[0]})`, `translateX(${spostamento[1]})`)
        .afterClearStyles(['transform'])
    );
  }
}

function contenutoEPiedi(pagina: HTMLElement): { contenuto: HTMLElement | null; extra: Element[] } {
  return {
    contenuto: pagina.querySelector<HTMLElement>(':scope > ion-content'),
    extra: Array.from(pagina.querySelectorAll(':scope > ion-header > *:not(ion-toolbar), :scope > ion-footer:not(.barra-azione) > *'))
  };
}

/** Oltre il bordo dello schermo, l'ombra compresa: come la barra delle tab quando scivola via. */
const SOTTO_IL_BORDO = 28;

/**
 * La barra in basso di una pagina sale dal fondo (entra) o ci scende (esce),
 * con la curva e la durata della pagina: anche col dito, nel gesto per tornare
 * indietro, la segue passo passo. Con "riduci movimento" si dissolve sul posto.
 */
function barraInBasso(radice: Animation, pagina: HTMLElement, entra: boolean): void {
  const barre = Array.from(pagina.querySelectorAll<HTMLElement>(':scope > ion-footer.barra-azione'))
    .filter(b => b.getBoundingClientRect().height > 0);
  if (barre.length === 0) return;
  const vista = pagina.ownerDocument.defaultView;
  const ridotto = !!vista?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const anim = createAnimation().addElement(barre).fromTo('opacity', entra ? 0 : 1, entra ? 1 : 0);
  if (!ridotto) {
    const alto = Math.min(...barre.map(b => b.getBoundingClientRect().top));
    const sotto = `translateY(${Math.max(0, Math.ceil((vista?.innerHeight ?? 0) - alto)) + SOTTO_IL_BORDO}px)`;
    anim.fromTo('transform', entra ? sotto : 'translateY(0px)', entra ? 'translateY(0px)' : sotto);
  }
  radice.addAnimation(anim.afterClearStyles(['opacity', 'transform']));
}

/** Ombra e velo che Ionic mette sul contenuto durante lo scorrimento: stanno nello shadow di ion-content. */
function effettoContenuto(radice: Animation, contenuto: HTMLElement | null, entra: boolean): void {
  if (!contenuto) return;
  const effetto = ombra(contenuto).querySelector('.transition-effect');
  if (!effetto) return;
  const velo = effetto.querySelector('.transition-cover');
  const ombraEl = effetto.querySelector('.transition-shadow');
  const gruppo = createAnimation()
    .addElement(effetto)
    .beforeStyles({ opacity: '1', display: 'block' })
    .afterStyles({ opacity: '', display: '' });
  gruppo.addAnimation([
    createAnimation().addElement(velo!).beforeClearStyles(['opacity']).fromTo('opacity', entra ? 0 : 0.1, entra ? 0.1 : 0),
    createAnimation().addElement(ombraEl!).beforeClearStyles(['opacity']).fromTo('opacity', entra ? 0.03 : 0.7, entra ? 0.7 : 0.03)
  ]);
  radice.addAnimation(gruppo);
}

export const transizionePagina: AnimationBuilder = (navEl, opts) => {
  const entrando: HTMLElement | undefined = opts?.enteringEl;
  const uscendo: HTMLElement | undefined = opts?.leavingEl;

  // Pagine senza testata e contenuto come figli diretti (il guscio delle tab,
  // per esempio): la struttura che serve qui non c'e', ci pensa Ionic.
  const attesa = (p: HTMLElement | undefined) => !p || !!p.querySelector(':scope > ion-content, :scope > ion-header');
  if (!entrando || !attesa(entrando) || !attesa(uscendo) || !entrando.querySelector(':scope > ion-content, :scope > ion-header')) {
    return iosTransitionAnimation(navEl, opts);
  }

  try {
    const indietro = opts.direction === 'back';
    const rtl = navEl.ownerDocument.dir === 'rtl';
    const lato = rtl ? -1 : 1;
    const FUORI_DESTRA = rtl ? '-99.5%' : '99.5%';
    const FUORI_SINISTRA = rtl ? '33%' : '-33%';
    const CENTRO = '0%';

    const radice = createAnimation()
      .addElement(entrando)
      .duration((opts.duration ?? 0) || DURATA)
      .easing(opts.easing || CURVA)
      .fill('both')
      .beforeRemoveClass('ion-page-invisible');

    if (uscendo && navEl) radice.addAnimation(createAnimation().addElement(navEl));

    // ---- contenuto di chi entra
    const dentro = contenutoEPiedi(entrando);
    const animDentro = createAnimation().addElement(dentro.contenuto ?? []).addElement(dentro.extra).beforeClearStyles(['opacity']);
    if (indietro) {
      animDentro
        .fromTo('transform', `translateX(${FUORI_SINISTRA})`, `translateX(${CENTRO})`)
        .fromTo('opacity', OPACITA_PAGINA_SOTTO, 1);
    } else {
      animDentro.fromTo('transform', `translateX(${FUORI_DESTRA})`, `translateX(${CENTRO})`);
    }
    radice.addAnimation(animDentro);
    effettoContenuto(animDentro, dentro.contenuto, true);
    barraInBasso(radice, entrando, true);

    // ---- contenuto di chi esce
    if (uscendo) {
      const fuori = contenutoEPiedi(uscendo);
      const animFuori = createAnimation().addElement(fuori.contenuto ?? []).addElement(fuori.extra);
      if (indietro) {
        animFuori.beforeClearStyles(['opacity']).fromTo('transform', `translateX(${CENTRO})`, rtl ? 'translateX(-100%)' : 'translateX(100%)');
        const paginaCheEsce = paginaDi(uscendo);
        radice.afterAddWrite(() => {
          if (radice.getDirection() === 'normal') paginaCheEsce.style.setProperty('display', 'none');
        });
      } else {
        animFuori.fromTo('transform', `translateX(${CENTRO})`, `translateX(${FUORI_SINISTRA})`).fromTo('opacity', 1, OPACITA_PAGINA_SOTTO);
      }
      radice.addAnimation(animFuori);
      effettoContenuto(animFuori, fuori.contenuto, false);
      barraInBasso(radice, uscendo, false);
    }

    // ---- testata
    const barreDentro = barre(entrando).map(leggiBarra);
    const barreFuori = uscendo ? barre(uscendo).map(leggiBarra) : [];
    const haIndietroDentro = barreDentro.some(b => b.indietro);
    const haIndietroFuori = barreFuori.some(b => b.indietro);

    const spostamento = (verso: 'entra' | 'esce'): [string, string] => {
      const px = SPOSTAMENTO_TITOLO * lato;
      // in avanti il nuovo arriva da destra e il vecchio parte a sinistra; indietro il contrario
      if (verso === 'entra') return indietro ? [`${-px}px`, '0px'] : [`${px}px`, '0px'];
      return indietro ? ['0px', `${px}px`] : ['0px', `${-px}px`];
    };

    // Lo sfondo della testata (ion-header{background} in styles.css) e' pieno e
    // coprirebbe da subito la testata della pagina sotto, che sparirebbe di
    // colpo: la testata di chi sta in cima e' trasparente per la durata della
    // transizione, e il suo fondo torna con quello della barra (sotto).
    const inCima = indietro ? uscendo : entrando;
    if (inCima) {
      const testate = Array.from(inCima.querySelectorAll(':scope > ion-header'));
      if (testate.length) {
        // Un'animazione vera (due fotogrammi uguali) e non beforeStyles: una
        // senza fotogrammi finisce subito e i suoi stili si ripuliscono prima di partire.
        radice.addAnimation(
          createAnimation().addElement(testate).fill('both').keyframes(come([
            { offset: 0, backgroundColor: 'transparent' },
            { offset: 1, backgroundColor: 'transparent' }
          ]))
        );
      }
    }

    for (const b of barreDentro) {
      elemento(radice, b.titolo, ENTRATA, spostamento('entra'));
      elemento(radice, b.azioni, ENTRATA);
      elemento(radice, b.altri.length ? (b.altri as HTMLElement[]) : null, ENTRATA);
      if (b.indietro && !haIndietroFuori) elemento(radice, b.indietro, ENTRATA);
      // Il fondo della barra e' quello che copre la testata sotto: in avanti e' la pagina
      // che entra a stare in cima, e lo mostra solo a scambio fatto.
      if (!indietro && b.sfondo) {
        radice.addAnimation(
          createAnimation().addElement(b.sfondo).beforeClearStyles(['opacity', 'transform']).easing('linear')
            .keyframes(come(copia(FONDO_IN_AVANTI))).afterClearStyles(['opacity'])
        );
      }
    }
    for (const b of barreFuori) {
      elemento(radice, b.titolo, USCITA, spostamento('esce'));
      elemento(radice, b.azioni, USCITA);
      elemento(radice, b.altri.length ? (b.altri as HTMLElement[]) : null, USCITA);
      if (b.indietro && !haIndietroDentro) elemento(radice, b.indietro, USCITA);
      // Indietro e' la pagina che esce a stare in cima: il suo fondo lascia vedere quella sotto.
      if (indietro && b.sfondo) {
        radice.addAnimation(
          createAnimation().addElement(b.sfondo).beforeClearStyles(['opacity', 'transform']).easing('linear')
            .keyframes(come(copia(FONDO_INDIETRO)))
        );
      }
    }

    return radice;
  } catch (errore) {
    throw errore;
  }
};
