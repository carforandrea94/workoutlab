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
  searchOutline, searchSharp, settingsOutline, settingsSharp, stopwatch, stopwatchOutline, stopwatchSharp,
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

/**
 * Le sole icone che l'app usa, col nome che hanno in Ionicons (ionic.io/ionicons).
 * Ogni voce porta nel bundle le sue due varianti, quindi qui sta solo quello
 * che i template usano: un test controlla che non ci sia niente in piu'.
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
  'stopwatch': { ios: stopwatchOutline, md: stopwatchSharp, piena: stopwatch },
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
