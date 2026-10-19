import { InjectionToken } from '@angular/core';
import {
  addOutline, addSharp, albumsOutline, albumsSharp, analyticsOutline, analyticsSharp, arrowBackSharp,
  barbell, barbellOutline, barbellSharp, caretDownSharp, cartOutline, cartSharp, chatboxEllipsesOutline,
  chatboxEllipsesSharp, checkmarkCircle, checkmarkCircleOutline, checkmarkCircleSharp, checkmarkOutline,
  checkmarkSharp, chevronBack, chevronBackOutline, chevronDownOutline, chevronDownSharp, chevronExpand,
  chevronExpandOutline, chevronExpandSharp, chevronForward, chevronForwardOutline, chevronForwardSharp,
  closeCircle, closeOutline, closeSharp, cloudUploadOutline, cloudUploadSharp, createOutline, createSharp,
  documentTextOutline, documentTextSharp, eyeOffOutline, eyeOffSharp, eyeOutline, eyeSharp, flagOutline,
  flagSharp, informationCircleOutline, informationCircleSharp, listOutline, listSharp, pause, pauseOutline,
  pauseSharp, pencilOutline, pencilSharp, person, personOutline, personSharp, play, playOutline, playSharp,
  removeCircle, removeCircleSharp, reorderThreeOutline, reorderTwoSharp, restaurant, restaurantOutline,
  restaurantSharp, saveOutline, saveSharp, searchOutline, searchSharp, settingsOutline, settingsSharp,
  swapHorizontalOutline, swapHorizontalSharp, timeOutline, timerOutline, timerSharp, timeSharp, trashOutline,
  trashSharp
} from 'ionicons/icons';

/**
 * Le icone sono quelle di Ionic (Ionicons), nella variante della piattaforma:
 * su iPhone, iPad e Safari quella iOS (a contorno, "outline"), su Android e
 * Chrome quella Material ("sharp", piena e a spigoli vivi). E' la stessa
 * coppia che Ionic usa per i suoi componenti e che consiglia nei suoi esempi
 * (`ios="mail-outline" md="mail-sharp"`).
 *
 * Il resto dell'app resta in modalita' iOS su ogni piattaforma (vedi
 * app.config.ts): cambiano solo le icone, non barre, interruttori e transizioni.
 */
export type StileIcone = 'ios' | 'md';

/**
 * Da quale piattaforma arriva l'app. Prima il dispositivo (un iPhone e' iOS
 * anche in Chrome, un telefono Android e' Android anche in Firefox), poi sul
 * computer il browser: Safari e' iOS, Chrome e tutto il resto Android.
 *
 * L'iPad da iPadOS 13 si presenta come un Mac: lo tradisce lo schermo touch,
 * che sui Mac non c'e'. Nell'app nativa (Capacitor) lo user agent e' quello
 * della WebView del sistema, quindi vale la stessa regola.
 */
export function stileIcone(ua: string, puntiTouch = 0): StileIcone {
  if (/Android/i.test(ua)) return 'md';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Macintosh/.test(ua) && puntiTouch > 1) return 'ios';
  // Chrome, Edge e Opera si dicono anche "Safari/": Safari e' quello che non e' Chromium.
  if (/Safari\//.test(ua) && !/Chrome\/|Chromium\//.test(ua)) return 'ios';
  return 'md';
}

/** Lo stile di questo dispositivo, letto una volta: non cambia mentre l'app e' aperta. */
export function stileDelDispositivo(): StileIcone {
  if (typeof navigator === 'undefined') return 'ios';
  return stileIcone(navigator.userAgent ?? '', navigator.maxTouchPoints ?? 0);
}

export const STILE_ICONE = new InjectionToken<StileIcone>('Lo stile delle icone (ios o md)', {
  providedIn: 'root',
  factory: stileDelDispositivo
});

interface Varianti {
  ios: string;
  md: string;
  /**
   * La versione piena per iOS, dove serve: nella barra delle tab (iOS ci mette
   * i simboli pieni), su play/pausa, che sono pieni anche nelle app di Apple, e
   * sulla spunta di un allenamento gia' fatto.
   * Su Android la variante "sharp" e' gia' piena.
   */
  piena?: string;
}

const svg = (viewBox: string, d: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${d}"/></svg>`;

/**
 * La scarpa da corsa della tab Corsa. Ionicons non ne ha una (ha le impronte,
 * il cronometro, la figura che cammina): e' la "sneaker-move" di Phosphor
 * Icons, la stessa su iOS e su Android, nello stesso formato delle altre voci.
 * Su iOS a contorno ("regular") e, nella barra delle tab, piena ("fill"); su
 * Android piena, come le varianti Material delle altre icone.
 * MIT License, Copyright (c) 2023 Phosphor Icons.
 */
const SCARPA: Varianti = {
  ios: svg('0 0 256 256', 'M231.16,166.63l-28.63-14.31A47.74,47.74,0,0,1,176,109.39V80a8,8,0,0,0-8-8,48.05,48.05,0,0,1-48-48,8,8,0,0,0-12.83-6.37L30.13,76l-.2.16a16,16,0,0,0-1.24,23.75L142.4,213.66a8,8,0,0,0,5.66,2.34H224a16,16,0,0,0,16-16V180.94A15.92,15.92,0,0,0,231.16,166.63ZM224,200H151.37L40,88.63l12.87-9.76,38.79,38.79A8,8,0,0,0,103,106.34L65.74,69.11l40-30.31A64.15,64.15,0,0,0,160,87.5v21.89a63.65,63.65,0,0,0,35.38,57.24L224,180.94ZM70.8,184H32a8,8,0,0,1,0-16H70.8a8,8,0,1,1,0,16Zm40,24a8,8,0,0,1-8,8H48a8,8,0,0,1,0-16h54.8A8,8,0,0,1,110.8,208Z'),
  md: svg('0 0 256 256', 'M70.8,184H32a8,8,0,0,1,0-16H70.8a8,8,0,1,1,0,16Zm32,16H48a8,8,0,0,0,0,16h54.8a8,8,0,1,0,0-16Zm128.36-33.37-28.63-14.31A47.74,47.74,0,0,1,176,109.39V80a8,8,0,0,0-7.93-8A48.05,48.05,0,0,1,120,24.07a8,8,0,0,0-12.83-6.44L45.11,64.68a4,4,0,0,0-.41,6l51.44,51.44a8.19,8.19,0,0,1,.6,11.09,8,8,0,0,1-11.71.43l-53-53a4,4,0,0,0-6.44,1.09,16,16,0,0,0,3.12,18.22L142.4,213.66a8,8,0,0,0,5.66,2.34H224a16,16,0,0,0,16-16V180.94A15.92,15.92,0,0,0,231.16,166.63Z'),
  piena: svg('0 0 256 256', 'M70.8,184H32a8,8,0,0,1,0-16H70.8a8,8,0,1,1,0,16Zm32,16H48a8,8,0,0,0,0,16h54.8a8,8,0,1,0,0-16Zm128.36-33.37-28.63-14.31A47.74,47.74,0,0,1,176,109.39V80a8,8,0,0,0-7.93-8A48.05,48.05,0,0,1,120,24.07a8,8,0,0,0-12.83-6.44L45.11,64.68a4,4,0,0,0-.41,6l51.44,51.44a8.19,8.19,0,0,1,.6,11.09,8,8,0,0,1-11.71.43l-53-53a4,4,0,0,0-6.44,1.09,16,16,0,0,0,3.12,18.22L142.4,213.66a8,8,0,0,0,5.66,2.34H224a16,16,0,0,0,16-16V180.94A15.92,15.92,0,0,0,231.16,166.63Z')
};

/**
 * Le sole icone che l'app usa, col nome che hanno in Ionicons (ionic.io/ionicons).
 * Ogni voce porta nel bundle le sue due varianti, quindi qui sta solo quello
 * che i template usano: un test controlla che non ci sia niente in piu'.
 *
 * Una voce non viene da Ionicons, che non ha una scarpa da corsa: `scarpa`
 * (vedi SCARPA).
 *
 * Due voci non sono un'icona sola ma un gesto, e su Android cambiano forma
 * come cambiano nei componenti di Ionic: `indietro` (chevron su iOS, freccia
 * su Android, come ion-back-button) e `riordina` (tre righe su iOS, due su
 * Android, come ion-reorder).
 *
 * Restano disegnati a mano, perche' nessuna libreria li ha: i gruppi
 * muscolari (workout-data.service.ts), il marchio (components/logo) e la G
 * di Google, che ha i colori del marchio.
 */
export const ICONE = {
  'add': { ios: addOutline, md: addSharp },
  'albums': { ios: albumsOutline, md: albumsSharp },
  'analytics': { ios: analyticsOutline, md: analyticsSharp },
  'barbell': { ios: barbellOutline, md: barbellSharp, piena: barbell },
  'cart': { ios: cartOutline, md: cartSharp },
  'chatbox-ellipses': { ios: chatboxEllipsesOutline, md: chatboxEllipsesSharp },
  'checkmark': { ios: checkmarkOutline, md: checkmarkSharp },
  'checkmark-circle': { ios: checkmarkCircleOutline, md: checkmarkCircleSharp, piena: checkmarkCircle },
  'chevron-down': { ios: chevronDownOutline, md: chevronDownSharp },
  'chevron-expand': { ios: chevronExpandOutline, md: chevronExpandSharp },
  'chevron-forward': { ios: chevronForwardOutline, md: chevronForwardSharp },
  'close': { ios: closeOutline, md: closeSharp },
  'cloud-upload': { ios: cloudUploadOutline, md: cloudUploadSharp },
  'create': { ios: createOutline, md: createSharp },
  'document-text': { ios: documentTextOutline, md: documentTextSharp },
  'eye': { ios: eyeOutline, md: eyeSharp },
  'eye-off': { ios: eyeOffOutline, md: eyeOffSharp },
  'flag': { ios: flagOutline, md: flagSharp },
  'indietro': { ios: chevronBackOutline, md: arrowBackSharp },
  'information-circle': { ios: informationCircleOutline, md: informationCircleSharp },
  'list': { ios: listOutline, md: listSharp },
  'pause': { ios: pauseOutline, md: pauseSharp, piena: pause },
  'pencil': { ios: pencilOutline, md: pencilSharp },
  'person': { ios: personOutline, md: personSharp, piena: person },
  'play': { ios: playOutline, md: playSharp, piena: play },
  'restaurant': { ios: restaurantOutline, md: restaurantSharp, piena: restaurant },
  'remove-circle': { ios: removeCircle, md: removeCircleSharp },
  'riordina': { ios: reorderThreeOutline, md: reorderTwoSharp },
  'save': { ios: saveOutline, md: saveSharp },
  'scarpa': SCARPA,
  'settings': { ios: settingsOutline, md: settingsSharp },
  'swap-horizontal': { ios: swapHorizontalOutline, md: swapHorizontalSharp },
  'time': { ios: timeOutline, md: timeSharp },
  'timer': { ios: timerOutline, md: timerSharp },
  'trash': { ios: trashOutline, md: trashSharp }
} satisfies Record<string, Varianti>;

export type NomeIcona = keyof typeof ICONE;

/** L'SVG da disegnare: la variante della piattaforma, o quella piena su iOS se richiesta e se c'e'. */
export function svgIcona(nome: NomeIcona, stile: StileIcone, piena = false): string {
  const v: Varianti = ICONE[nome];
  if (stile === 'md') return v.md;
  return (piena && v.piena) || v.ios;
}

/**
 * Le icone che disegnano i componenti di Ionic, nella variante della
 * piattaforma. L'app e' in modalita' iOS dappertutto, e Ionic le sceglierebbe
 * sempre iOS: qui si rifa' la scelta che Ionic farebbe in modalita' Android.
 */
export function iconeIonic(stile: StileIcone) {
  const md = stile === 'md';
  return {
    /** ion-back-button: chevron su iOS, freccia su Android. */
    indietro: md ? arrowBackSharp : chevronBack,
    /** ion-item con la freccia di dettaglio. */
    dettaglio: md ? chevronForwardSharp : chevronForward,
    /** ion-select chiuso: le due frecce su iOS, il triangolo in giu' su Android. */
    select: md ? caretDownSharp : chevronExpand,
    /** ion-searchbar: la lente e la X per svuotare. */
    cerca: md ? searchSharp : searchOutline,
    svuota: md ? closeSharp : closeCircle
  };
}
