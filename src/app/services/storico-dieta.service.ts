import { Injectable } from '@angular/core';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { FirebaseService } from '../core/services/firebase.service';
import { AuthService } from '../core/services/auth.service';
import { ZoneFixService } from '../core/utils/zone.util';
import { sanitizeForFirestore } from '../core/utils/sanitize.util';
import { GiornoDieta, PianoDelGiorno, normalizzaGiorno } from '../core/utils/storico-dieta.util';

/**
 * Lo storico della dieta: users/{uid}/giorniDieta/{data}, un documento per
 * giorno (vedi storico-dieta.util). Si tiene finche' c'e' l'account: un
 * documento al giorno resta piccolo, e la raccolta puo' crescere per anni
 * senza toccare il limite di grandezza di un documento solo.
 */
@Injectable({ providedIn: 'root' })
export class StoricoDietaService {

  constructor(private fb: FirebaseService, private auth: AuthService, private zoneFix: ZoneFixService) {}

  private col() {
    const uid = this.auth.currentUser()!.uid;
    return collection(this.fb.db, 'users', uid, 'giorniDieta');
  }

  /** Tutti i giorni salvati, dal piu' recente. */
  elenco(): Promise<GiornoDieta[]> {
    return this.zoneFix.run((async () => {
      const snap = await getDocs(this.col());
      const giorni: GiornoDieta[] = [];
      for (const d of snap.docs) {
        const g = normalizzaGiorno(d.id, d.data());
        if (g) giorni.push(g);
      }
      return giorni.sort((a, b) => b.date.localeCompare(a.date));
    })());
  }

  /**
   * Scrive il piano di quel giorno. Con merge Firestore unisce le mappe
   * annidate: gli altri piani dello stesso giorno restano come sono, e questo
   * si sostituisce intero (l'elenco dei pasti e' un array, che non si unisce).
   */
  salva(date: string, pianoId: string, piano: PianoDelGiorno): Promise<void> {
    return this.zoneFix.run((async () => {
      await setDoc(doc(this.col(), date), sanitizeForFirestore({ date, piani: { [pianoId]: piano } }), { merge: true });
    })());
  }
}
