import { Injectable } from '@angular/core';
import {
  doc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  addDoc
} from 'firebase/firestore';
import { Subject } from 'rxjs';
import { FirebaseService } from '../core/services/firebase.service';
import { AuthService } from '../core/services/auth.service';
import { Protocol, emptyProtocol } from '../models/protocol.model';
import { ZoneFixService } from '../core/utils/zone.util';
import { sanitizeForFirestore } from '../core/utils/sanitize.util';

const LEGACY_MEAL_KEYS = ['colazione', 'spuntino', 'pranzo', 'merenda', 'cena'];
const LEGACY_MEAL_LABELS: Record<string, string> = {
  colazione: 'Colazione', spuntino: 'Spuntino', pranzo: 'Pranzo', merenda: 'Merenda', cena: 'Cena'
};

function emptyAlternatives() {
  return { carb: [] as any[], protein: [] as any[], fat: [] as any[] };
}

/** Distribuisce una lista piatta di alimenti (formato pre-macro) tra carb/protein/fat in base al campo category. */
function splitByCategory(items: any[]): { carb: any[]; protein: any[]; fat: any[] } {
  const out = emptyAlternatives();
  for (const it of items) {
    const cat = (it.category ?? 'carb') as 'carb' | 'protein' | 'fat';
    (out[cat] ?? out.carb).push(it);
  }
  return out;
}

function normalizeMeal(meal: any): any {
  const alternatives = meal.alternatives && !Array.isArray(meal.alternatives)
    ? { carb: meal.alternatives.carb ?? [], protein: meal.alternatives.protein ?? [], fat: meal.alternatives.fat ?? [] }
    : emptyAlternatives();

  // Combinazioni gia' nel formato attuale (1 alimento per macro)
  const alreadyCurrent = Array.isArray(meal.combinations) &&
    meal.combinations.every((c: any) => !Array.isArray(c.items));
  if (alreadyCurrent) {
    return { id: meal.id, name: meal.name, combinations: meal.combinations, alternatives, supplements: meal.supplements };
  }

  console.warn(`Pasto "${meal.name}" in formato legacy, normalizzato al nuovo modello (1 alimento per macro + alternative).`);

  // Raccoglie tutti gli alimenti "piatti" che il vecchio formato aveva, da qualunque punto provengano
  let flatItems: any[] = [];
  if (Array.isArray(meal.combinations)) {
    meal.combinations.forEach((c: any) => { flatItems.push(...(c.items ?? [])); });
  } else {
    flatItems.push(...(meal.items ?? []));
    (meal.variants ?? []).forEach((v: any) => flatItems.push(...(v.items ?? [])));
  }

  const byCat = splitByCategory(flatItems);
  const base = {
    id: meal.id ?? 'base',
    label: 'Base',
    carb: byCat.carb[0] ?? null,
    protein: byCat.protein[0] ?? null,
    fat: byCat.fat[0] ?? null
  };
  const mergedAlt = {
    carb: [...alternatives.carb, ...byCat.carb.slice(1)],
    protein: [...alternatives.protein, ...byCat.protein.slice(1)],
    fat: [...alternatives.fat, ...byCat.fat.slice(1)]
  };

  return { id: meal.id, name: meal.name, combinations: [base], alternatives: mergedAlt, supplements: meal.supplements };
}

/**
 * Protocolli creati prima della migrazione dieta ON/OFF -> lista libera di
 * piani hanno ancora diet: {on:{...}, off:{...}} invece di un array.
 * Piani creati nella finestra intermedia (lista di piani, ma pasti ancora
 * a chiavi fisse colazione/spuntino/...) non hanno il campo meals[].
 * Pasti creati prima delle combinazioni non hanno combinations[].
 * Normalizziamo tutti i casi in lettura, cosi' il resto del codice puo'
 * sempre assumere che protocol.diet sia un array di piani con
 * meals[].combinations[].
 */
function normalizeProtocol(p: Protocol): Protocol {
  if (!Array.isArray(p.diet)) {
    console.warn(`Protocollo ${p.id}: campo diet in formato legacy (non array), normalizzato ad array vuoto.`);
    p.diet = [];
    return p;
  }
  p.diet = p.diet.map((plan: any) => {
    let meals = plan.meals;
    if (!Array.isArray(meals)) {
      console.warn(`Protocollo ${p.id}: piano "${plan.name}" in formato legacy (senza meals[]), normalizzato.`);
      meals = LEGACY_MEAL_KEYS
        .filter(key => plan[key])
        .map(key => ({ id: key, name: LEGACY_MEAL_LABELS[key], ...plan[key] }));
    }
    return { id: plan.id, name: plan.name, meals: meals.map(normalizeMeal) };
  });
  return p;
}

@Injectable({ providedIn: 'root' })
export class ProtocolService {
  /**
   * Scatta quando un protocollo cambia (modifica, attivazione, eliminazione):
   * chi tiene in memoria quello attivo lo rilegge. Non scatta per la
   * creazione, che produce sempre una bozza.
   */
  readonly changed$ = new Subject<void>();

  constructor(private fb: FirebaseService, private zoneFix: ZoneFixService, private auth: AuthService) {}

  /** I protocolli sono dell'utente collegato, e di nessun altro. */
  private get uid(): string {
    const user = this.auth.currentUser();
    if (!user) throw new Error('Sessione scaduta. Accedi di nuovo.');
    return user.uid;
  }

  private col() {
    return collection(this.fb.db, 'users', this.uid, 'protocols');
  }

  list(): Promise<Protocol[]> {
    return this.zoneFix.run((async () => {
      const snap = await getDocs(this.col());
      return snap.docs
        .map(d => normalizeProtocol({ id: d.id, ...d.data() } as Protocol))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    })());
  }

  get(id: string): Promise<Protocol | null> {
    return this.zoneFix.run((async () => {
      const snap = await getDoc(doc(this.col(), id));
      return snap.exists() ? normalizeProtocol({ id: snap.id, ...snap.data() } as Protocol) : null;
    })());
  }

  getActive(): Promise<Protocol | null> {
    return this.zoneFix.run((async () => {
      const q = query(this.col(), where('status', '==', 'active'));
      const snap = await getDocs(q);
      if (snap.empty) return null;
      const d = snap.docs[0];
      return normalizeProtocol({ id: d.id, ...d.data() } as Protocol);
    })());
  }

  create(): Promise<string> {
    return this.zoneFix.run((async () => {
      const data = emptyProtocol(this.uid);
      const ref = await addDoc(this.col(), data);
      return ref.id;
    })());
  }

  update(id: string, patch: Partial<Protocol>): Promise<void> {
    const clean = sanitizeForFirestore({ ...patch, updatedAt: new Date().toISOString() });
    return this.zoneFix.run((async () => {
      await updateDoc(doc(this.col(), id), clean as any);
      this.changed$.next();
    })());
  }

  delete(id: string): Promise<void> {
    return this.zoneFix.run((async () => {
      await deleteDoc(doc(this.col(), id));
      this.changed$.next();
    })());
  }

  /** Attiva questo protocollo (e' quello che si vede in Scheda, Dieta e Corsa) e archivia l'eventuale precedente attivo. */
  activate(id: string): Promise<void> {
    return this.zoneFix.run((async () => {
      const all = await this.list();
      await Promise.all(
        all
          .filter(p => p.status === 'active' && p.id !== id)
          .map(p => this.update(p.id, { status: 'archived' }))
      );
      await this.update(id, { status: 'active' });
    })());
  }
}
