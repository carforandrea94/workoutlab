import { InjectionToken } from '@angular/core';
import {
  addOutline, addSharp, albumsOutline, albumsSharp, analyticsOutline, analyticsSharp, arrowBackSharp,
  barbell, barbellOutline, barbellSharp, body, bodyOutline, bodySharp, caretDownSharp, cartOutline, cartSharp,
  chatboxEllipsesOutline, chatboxEllipsesSharp, checkmarkOutline, checkmarkSharp, chevronBack, chevronBackOutline,
  chevronDownOutline, chevronDownSharp, chevronExpand, chevronExpandOutline, chevronExpandSharp, chevronForward,
  chevronForwardOutline, chevronForwardSharp, closeCircle, closeOutline, closeSharp, cloudUploadOutline,
  cloudUploadSharp, createOutline, createSharp, documentTextOutline, documentTextSharp, eyeOffOutline, eyeOffSharp,
  eyeOutline, eyeSharp, flagOutline, flagSharp,
  informationCircleOutline, informationCircleSharp, listOutline, listSharp, pause, pauseOutline, pauseSharp,
  pencilOutline, pencilSharp, person, personOutline, personSharp, play, playOutline, playSharp,
  reorderThreeOutline, reorderTwoSharp, restaurant, restaurantOutline, restaurantSharp, saveOutline, saveSharp,
  searchOutline, searchSharp, settingsOutline, settingsSharp,
  swapHorizontalOutline, swapHorizontalSharp,
  timeOutline, timeSharp, timerOutline, timerSharp, trashOutline, trashSharp
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
   * i simboli pieni) e su play/pausa, che sono pieni anche nelle app di Apple.
   * Su Android la variante "sharp" e' gia' piena.
   */
  piena?: string;
}

const svg = (viewBox: string, d: string) =>
  `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><path d="${d}"/></svg>`;

/**
 * Il corridore della tab Corsa. Ionicons non ne ha uno (ha le impronte, il
 * cronometro, la figura che cammina), quindi arriva da due set liberi, uno
 * per piattaforma, nello stesso formato delle altre voci:
 * - iOS: "person-simple-run" di Phosphor Icons (regular e fill), il piu'
 *   vicino al "figure.run" di iOS. MIT License, Copyright (c) 2023 Phosphor Icons.
 * - Android: "directions_run" di Material Symbols, l'icona di Android, stile
 *   sharp, peso 700: col 400 di serie era piu' sottile delle altre icone della
 *   barra. Apache License 2.0, Google.
 */
const CORRIDORE: Varianti = {
  ios: svg('0 0 256 256', 'M152,88a32,32,0,1,0-32-32A32,32,0,0,0,152,88Zm0-48a16,16,0,1,1-16,16A16,16,0,0,1,152,40Zm67.31,100.68c-.61.28-7.49,3.28-19.67,3.28-13.85,0-34.55-3.88-60.69-20a169.31,169.31,0,0,1-15.41,32.34,104.29,104.29,0,0,1,31.31,15.81C173.92,186.65,184,207.35,184,232a8,8,0,0,1-16,0c0-41.7-34.69-56.71-54.14-61.85-.55.7-1.12,1.41-1.69,2.1-19.64,23.8-44.25,36.18-71.63,36.18A92.29,92.29,0,0,1,31.2,208,8,8,0,0,1,32.8,192c25.92,2.58,48.47-7.49,67-30,12.49-15.14,21-33.61,25.25-47C86.13,92.35,61.27,111.63,61,111.84A8,8,0,1,1,51,99.36c1.5-1.2,37.22-29,89.51,6.57,45.47,30.91,71.93,20.31,72.18,20.19a8,8,0,1,1,6.63,14.56Z'),
  md: svg('0 -960 960 960', 'M524-29v-244l-90-82-40 178-287-59 15-78 199 40 67-339-80 39v138h-84v-195l179-71q33-14 47.5-18.5T480-725q23 0 41 11t30 30l44 67q25 40 69.5 68.5T771-520v84q-69 0-122-28t-99-85l-33 132 89 82v306h-82Zm-42.5-761Q457-815 457-850.5t24.5-60q24.5-24.5 60-24.5t60 24.5q24.5 24.5 24.5 60T601.5-790q-24.5 25-60 25t-60-25Z'),
  piena: svg('0 0 256 256', 'M120,56a32,32,0,1,1,32,32A32,32,0,0,1,120,56Zm103.28,74.08a8,8,0,0,0-10.6-4c-.25.12-26.71,10.72-72.18-20.19-52.29-35.54-88-7.77-89.51-6.57a8,8,0,1,0,10,12.48c.26-.21,25.12-19.5,64.07,3.27-4.25,13.35-12.76,31.82-25.25,47-18.56,22.48-41.11,32.56-67,30A8,8,0,0,0,31.2,208a92.29,92.29,0,0,0,9.34.47c27.38,0,52-12.38,71.63-36.18.57-.69,1.14-1.4,1.69-2.1C133.31,175.29,168,190.3,168,232a8,8,0,0,0,16,0c0-24.65-10.08-45.35-29.15-59.86a104.29,104.29,0,0,0-31.31-15.81A169.31,169.31,0,0,0,139,124c26.14,16.09,46.84,20,60.69,20,12.18,0,19.06-3,19.67-3.28A8,8,0,0,0,223.28,130.08Z')
};

/**
 * Le sole icone che l'app usa, col nome che hanno in Ionicons (ionic.io/ionicons).
 * Ogni voce porta nel bundle le sue due varianti, quindi qui sta solo quello
 * che i template usano: un test controlla che non ci sia niente in piu'.
 *
 * Una voce non viene da Ionicons, che non ha una persona che corre:
 * `corridore` (vedi CORRIDORE).
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
  'body': { ios: bodyOutline, md: bodySharp, piena: body },
  'cart': { ios: cartOutline, md: cartSharp },
  'chatbox-ellipses': { ios: chatboxEllipsesOutline, md: chatboxEllipsesSharp },
  'checkmark': { ios: checkmarkOutline, md: checkmarkSharp },
  'chevron-down': { ios: chevronDownOutline, md: chevronDownSharp },
  'chevron-expand': { ios: chevronExpandOutline, md: chevronExpandSharp },
  'chevron-forward': { ios: chevronForwardOutline, md: chevronForwardSharp },
  'close': { ios: closeOutline, md: closeSharp },
  'cloud-upload': { ios: cloudUploadOutline, md: cloudUploadSharp },
  'corridore': CORRIDORE,
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
  'riordina': { ios: reorderThreeOutline, md: reorderTwoSharp },
  'save': { ios: saveOutline, md: saveSharp },
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
