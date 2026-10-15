import {
  ChartLine, Check, ChevronDown, ChevronLeft, ChevronRight, CirclePlus, Dumbbell, Eye, EyeOff,
  FileText, FileUp, GalleryHorizontal, GripVertical, History, Info, List,
  Pause, Play, Plus, Ruler, Save, Settings, ShoppingCart, SquarePen, Timer,
  Trash2, User, Utensils, X
} from 'lucide-angular';

/**
 * Scarpa da corsa. Non arriva da lucide-angular ma dal set ufficiale
 * (lucide-static): il pacchetto Angular e' fermo a 1704 icone contro le 2112
 * del set, e `sport-shoe` e' stata aggiunta a monte dopo la sua pubblicazione.
 * I dati sono copiati dall'SVG ufficiale e vanno tolti da qui, sostituendoli
 * con l'import, appena il wrapper si allinea.
 */
const SportShoe = [
  ['path', { d: 'm15 10.42 4.8-5.07' }],
  ['path', { d: 'M19 18h3' }],
  ['path', { d: 'M9.5 22 21.414 9.415A2 2 0 0 0 21.2 6.4l-5.61-4.208A1 1 0 0 0 14 3v2a2 2 0 0 1-1.394 1.906L8.677 8.053A1 1 0 0 0 8 9c-.155 6.393-2.082 9-4 9a2 2 0 0 0 0 4h14' }]
] as const;

/**
 * Le sole icone che l'app usa davvero. Lucide dichiara `sideEffects: false`,
 * quindi nel bundle finisce solo quello che sta in questo elenco: aggiungerne
 * una costa quello che pesa lei, non quello che pesa la libreria.
 *
 * Restano disegnate a mano, perche' nessuna libreria le ha: i sette gruppi
 * muscolari (workout-data.service.ts) e il marchio (components/logo).
 */
export const APP_ICONS = {
  ChartLine, Check, ChevronDown, ChevronLeft, ChevronRight, CirclePlus, Dumbbell, Eye, EyeOff,
  FileText, FileUp, GalleryHorizontal, GripVertical, History, Info, List,
  Pause, Play, Plus, Ruler, Save, Settings, ShoppingCart, SportShoe,
  SquarePen, Timer, Trash2, User, Utensils, X
};
