import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from '@/lib/firebase/client';
import {
  scenarios as fallbackScenarios,
  getScenario as getFallbackScenario,
  type Scenario,
} from '@/config/scenarios';

export interface StoredScenario extends Scenario {
  order: number;
  archived: boolean;
}

function isStoredScenario(data: unknown): data is Omit<StoredScenario, 'id'> {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.title === 'string' &&
    typeof d.description === 'string' &&
    typeof d.icon === 'string' &&
    typeof d.prompts === 'object' &&
    d.prompts !== null &&
    typeof (d.prompts as Record<string, unknown>).easy === 'string' &&
    typeof (d.prompts as Record<string, unknown>).medium === 'string' &&
    typeof (d.prompts as Record<string, unknown>).hard === 'string'
  );
}

function fallbackList(): StoredScenario[] {
  return fallbackScenarios.map((s, i) => ({
    ...s,
    order: (i + 1) * 10,
    archived: false,
  }));
}

export async function fetchAllScenarios(opts?: {
  includeArchived?: boolean;
}): Promise<StoredScenario[]> {
  try {
    const q = query(collection(db, 'scenarios'), orderBy('order', 'asc'));
    const snap = await getDocs(q);
    if (snap.empty) return fallbackList();

    const list: StoredScenario[] = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data();
      if (!isStoredScenario(data)) continue;
      const archived = data.archived === true;
      if (archived && !opts?.includeArchived) continue;
      list.push({
        id: docSnap.id,
        title: data.title,
        description: data.description,
        icon: data.icon,
        ...(typeof data.iconKey === 'string' ? { iconKey: data.iconKey } : {}),
        prompts: {
          easy: (data.prompts as { easy: string }).easy,
          medium: (data.prompts as { medium: string }).medium,
          hard: (data.prompts as { hard: string }).hard,
        },
        order: typeof data.order === 'number' ? data.order : 999,
        archived,
      });
    }
    return list.length > 0 ? list : fallbackList();
  } catch (err) {
    console.error('fetchAllScenarios failed, using fallback:', err);
    return fallbackList();
  }
}

// Returns the scenario doc whether or not it's archived (history needs to
// resolve title/icon for archived scenarios). Falls back to the hardcoded
// module if the doc is missing.
export async function fetchScenario(id: string): Promise<StoredScenario | undefined> {
  try {
    const ref = doc(db, 'scenarios', id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data();
      if (isStoredScenario(data)) {
        return {
          id: snap.id,
          title: data.title,
          description: data.description,
          icon: data.icon,
          ...(typeof data.iconKey === 'string' ? { iconKey: data.iconKey } : {}),
          prompts: {
            easy: (data.prompts as { easy: string }).easy,
            medium: (data.prompts as { medium: string }).medium,
            hard: (data.prompts as { hard: string }).hard,
          },
          order: typeof data.order === 'number' ? data.order : 999,
          archived: data.archived === true,
        };
      }
    }
  } catch (err) {
    console.error(`fetchScenario(${id}) failed, using fallback:`, err);
  }

  const fallback = getFallbackScenario(id);
  if (!fallback) return undefined;
  return { ...fallback, order: 999, archived: false };
}
