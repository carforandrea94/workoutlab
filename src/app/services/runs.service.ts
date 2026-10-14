import { Injectable } from '@angular/core';
import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore';
import { FirebaseService } from '../core/services/firebase.service';
import { AuthService } from '../core/services/auth.service';
import { ZoneFixService } from '../core/utils/zone.util';
import { sanitizeForFirestore } from '../core/utils/sanitize.util';
import { Run, normalizeRun } from '../models/run.model';

/**
 * Registro delle uscite di corsa: users/{uid}/runs/{id}.
 *
 * L'id NON e' la data, a differenza delle misure: nella stessa giornata ci
 * possono essere due uscite (mattina e sera) e con la data come chiave la
 * seconda cancellerebbe la prima. E' invece `${data}_${istante}`, cosi' resta
 * leggibile, ordinabile e unico senza dover interrogare Firestore per sapere
 * quale numero e' libero.
 */
@Injectable({ providedIn: 'root' })
export class RunsService {

  constructor(private fb: FirebaseService, private auth: AuthService, private zoneFix: ZoneFixService) {}

  private col() {
    const uid = this.auth.currentUser()!.uid;
    return collection(this.fb.db, 'users', uid, 'runs');
  }

  newId(date: string): string {
    return `${date}_${Date.now().toString(36)}`;
  }

  /** Tutte le uscite salvate, dalla piu' recente. */
  listAll(): Promise<{ id: string; run: Run }[]> {
    return this.zoneFix.run((async () => {
      const snap = await getDocs(this.col());
      // Normalizzate qui, in un punto solo: chi legge piu' avanti non deve
      // sapere che esistono uscite salvate col tempo in secondi.
      const rows: { id: string; run: Run }[] = [];
      for (const d of snap.docs) {
        const run = normalizeRun(d.data());
        if (run) rows.push({ id: d.id, run });
      }
      return rows.sort((a, b) => b.run.date.localeCompare(a.run.date) || b.id.localeCompare(a.id));
    })());
  }

  /** Crea o sovrascrive un'uscita. `id` assente = nuova uscita. */
  save(run: Run, id?: string): Promise<string | null> {
    return this.zoneFix.run((async () => {
      try {
        const runId = id ?? this.newId(run.date);
        await setDoc(doc(this.col(), runId), sanitizeForFirestore(run));
        return runId;
      } catch (e) {
        console.error('Errore salvataggio uscita di corsa:', e);
        return null;
      }
    })());
  }

  delete(id: string): Promise<boolean> {
    return this.zoneFix.run((async () => {
      try {
        await deleteDoc(doc(this.col(), id));
        return true;
      } catch (e) {
        console.error('Errore eliminazione uscita di corsa:', e);
        return false;
      }
    })());
  }
}
