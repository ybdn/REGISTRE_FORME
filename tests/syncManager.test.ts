import { synchroniser } from '@/donnees/sync/syncManager';
import {
  BORNE_INITIALE,
  type DepotLocalSync,
  type EnregistrementSync,
  type EtatSync,
  type TransportSync,
} from '@/donnees/sync/types';
import { describe, expect, it } from 'vitest';

// Tests du SyncManager (docs/07 §10.2) : push marque dirty=0, pull applique LWW, conflit
// (entite,cle) résolu par le maj_le le plus récent, tombstones propagés, premier rapprochement.
// Aucune I/O : on injecte un local en mémoire et un « cloud » en mémoire.

/** Horodatage croissant lisible (ISO comparable lexicographiquement). */
function t(n: number): string {
  return `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`;
}

/** Fake local : Map d'enregistrements {contenu, supprime, majLe, dirty} + borne derniereSync. */
function creerLocalMemoire() {
  const store = new Map<
    string,
    { contenu: unknown; supprime: boolean; majLe: string; dirty: boolean }
  >();
  let derniere = BORNE_INITIALE;
  const k = (e: string, c: string) => `${e}|${c}`;

  const api: DepotLocalSync &
    EtatSync & {
      store: typeof store;
      ecrireLocal(entite: string, cle: string, contenu: unknown, majLe: string): void;
      poser(
        entite: string,
        cle: string,
        v: { contenu: unknown; supprime: boolean; majLe: string },
      ): void;
    } = {
    store,
    ecrireLocal(entite, cle, contenu, majLe) {
      store.set(k(entite, cle), { contenu, supprime: false, majLe, dirty: true });
    },
    poser(entite, cle, v) {
      store.set(k(entite, cle), { ...v, dirty: false });
    },
    async lireSales() {
      return [...store.entries()]
        .filter(([, v]) => v.dirty)
        .map(([key, v]): EnregistrementSync => {
          const [entite, cle] = key.split('|') as [string, string];
          return { entite, cle, contenu: v.contenu, supprime: v.supprime, majLe: v.majLe };
        });
    },
    async marquerSynchronises(enrs) {
      for (const e of enrs) {
        const v = store.get(k(e.entite, e.cle));
        if (v) {
          v.dirty = false;
          v.majLe = e.majLe;
        }
      }
    },
    async majLeLocal(entite, cle) {
      const v = store.get(k(entite, cle));
      return v ? v.majLe : null;
    },
    async appliquerDistant(enr) {
      store.set(k(enr.entite, enr.cle), {
        contenu: enr.contenu,
        supprime: enr.supprime,
        majLe: enr.majLe,
        dirty: false,
      });
    },
    async lireDerniereSync() {
      return derniere;
    },
    async ecrireDerniereSync(b) {
      derniere = b;
    },
  };
  return api;
}

/** Fake cloud : Map + horloge serveur monotone (le serveur réhorodate à chaque push, §5.1). */
function creerCloudMemoire() {
  const store = new Map<string, { contenu: unknown; supprime: boolean; majLe: string }>();
  let horloge = 100;
  const k = (e: string, c: string) => `${e}|${c}`;

  const api: TransportSync & {
    store: typeof store;
    seed(entite: string, cle: string, contenu: unknown, majLe: string, supprime?: boolean): void;
  } = {
    store,
    seed(entite, cle, contenu, majLe, supprime = false) {
      store.set(k(entite, cle), { contenu, supprime, majLe });
    },
    async pousser(enrs) {
      const out: EnregistrementSync[] = [];
      for (const e of enrs) {
        horloge += 1;
        const majLe = t(horloge);
        store.set(k(e.entite, e.cle), {
          contenu: e.supprime ? null : e.contenu,
          supprime: e.supprime,
          majLe,
        });
        out.push({ entite: e.entite, cle: e.cle, contenu: null, supprime: e.supprime, majLe });
      }
      return out;
    },
    async recupererDepuis(borne) {
      return [...store.entries()]
        .filter(([, v]) => v.majLe > borne)
        .map(([key, v]): EnregistrementSync => {
          const [entite, cle] = key.split('|') as [string, string];
          return { entite, cle, contenu: v.contenu, supprime: v.supprime, majLe: v.majLe };
        })
        .sort((a, b) => a.majLe.localeCompare(b.majLe));
    },
  };
  return api;
}

describe('SyncManager — push', () => {
  it('pousse les locaux sales puis les marque synchronisés (dirty=0)', async () => {
    const local = creerLocalMemoire();
    const cloud = creerCloudMemoire();
    local.ecrireLocal('journal_crohn', '2026-01-05', { date: '2026-01-05', douleur: 2 }, t(1));

    const res = await synchroniser(local, cloud, local);

    expect(res).toMatchObject({ statut: 'ok', pousses: 1, appliques: 0 });
    // Plus rien à pousser : la ligne a été marquée propre.
    expect(await local.lireSales()).toHaveLength(0);
    // Le cloud a reçu l'enregistrement.
    expect(cloud.store.get('journal_crohn|2026-01-05')?.contenu).toMatchObject({ douleur: 2 });
    // L'horloge locale s'est alignée sur le serveur (> horodatage client initial).
    expect(await local.majLeLocal('journal_crohn', '2026-01-05')).not.toBe(t(1));
  });
});

describe('SyncManager — pull (LWW)', () => {
  it('applique un enregistrement distant absent en local', async () => {
    const local = creerLocalMemoire();
    const cloud = creerCloudMemoire();
    cloud.seed('mesure_corporelle', '2026-01-03', { date: '2026-01-03', poidsKg: 70 }, t(50));

    const res = await synchroniser(local, cloud, local);

    expect(res).toMatchObject({ statut: 'ok', pousses: 0, appliques: 1 });
    expect(local.store.get('mesure_corporelle|2026-01-03')?.contenu).toMatchObject({ poidsKg: 70 });
    expect(await local.lireDerniereSync()).toBe(t(50));
  });

  it('le distant plus récent gagne (LWW)', async () => {
    const local = creerLocalMemoire();
    const cloud = creerCloudMemoire();
    local.poser('journal_crohn', '2026-01-05', {
      contenu: { date: '2026-01-05', douleur: 2 },
      supprime: false,
      majLe: t(10),
    });
    cloud.seed('journal_crohn', '2026-01-05', { date: '2026-01-05', douleur: 8 }, t(20));

    const res = await synchroniser(local, cloud, local);

    expect(res.appliques).toBe(1);
    expect(local.store.get('journal_crohn|2026-01-05')?.contenu).toMatchObject({ douleur: 8 });
  });

  it('le local plus récent est conservé (distant ignoré)', async () => {
    const local = creerLocalMemoire();
    const cloud = creerCloudMemoire();
    local.poser('journal_crohn', '2026-01-05', {
      contenu: { date: '2026-01-05', douleur: 2 },
      supprime: false,
      majLe: t(30),
    });
    cloud.seed('journal_crohn', '2026-01-05', { date: '2026-01-05', douleur: 8 }, t(20));

    const res = await synchroniser(local, cloud, local);

    expect(res.appliques).toBe(0);
    expect(local.store.get('journal_crohn|2026-01-05')?.contenu).toMatchObject({ douleur: 2 });
  });
});

describe('SyncManager — tombstones', () => {
  it('propage une suppression distante en local', async () => {
    const local = creerLocalMemoire();
    const cloud = creerCloudMemoire();
    local.poser('aliment_statut', 'café', {
      contenu: { aliment: 'café', statut: 'tolere' },
      supprime: false,
      majLe: t(5),
    });
    cloud.seed('aliment_statut', 'café', null, t(40), true);

    const res = await synchroniser(local, cloud, local);

    expect(res.appliques).toBe(1);
    expect(local.store.get('aliment_statut|café')?.supprime).toBe(true);
  });

  it('pousse un tombstone local vers le cloud', async () => {
    const local = creerLocalMemoire();
    const cloud = creerCloudMemoire();
    local.store.set('aliment_statut|piment', {
      contenu: null,
      supprime: true,
      majLe: t(5),
      dirty: true,
    });

    const res = await synchroniser(local, cloud, local);

    expect(res.pousses).toBe(1);
    expect(cloud.store.get('aliment_statut|piment')?.supprime).toBe(true);
  });
});

describe('SyncManager — premier rapprochement (§6.2)', () => {
  it('demande confirmation quand les deux côtés ont des données', async () => {
    const local = creerLocalMemoire();
    const cloud = creerCloudMemoire();
    local.ecrireLocal('journal_crohn', '2026-01-05', { date: '2026-01-05', douleur: 2 }, t(1));
    cloud.seed('mesure_corporelle', '2026-01-03', { date: '2026-01-03', poidsKg: 70 }, t(50));

    const res = await synchroniser(local, cloud, local);

    expect(res.statut).toBe('confirmationRequise');
    expect(res.pousses).toBe(0);
    // Rien n'a été poussé ni appliqué : l'utilisateur doit trancher.
    expect(cloud.store.has('journal_crohn|2026-01-05')).toBe(false);
    expect(local.store.has('mesure_corporelle|2026-01-03')).toBe(false);
  });

  it('forcer=true effectue la fusion malgré les deux côtés peuplés', async () => {
    const local = creerLocalMemoire();
    const cloud = creerCloudMemoire();
    local.ecrireLocal('journal_crohn', '2026-01-05', { date: '2026-01-05', douleur: 2 }, t(1));
    cloud.seed('mesure_corporelle', '2026-01-03', { date: '2026-01-03', poidsKg: 70 }, t(50));

    const res = await synchroniser(local, cloud, local, { forcer: true });

    expect(res.statut).toBe('ok');
    expect(res.pousses).toBe(1);
    expect(res.appliques).toBe(1);
    expect(cloud.store.has('journal_crohn|2026-01-05')).toBe(true);
    expect(local.store.has('mesure_corporelle|2026-01-03')).toBe(true);
  });

  it('aucune confirmation si un seul côté a des données', async () => {
    const local = creerLocalMemoire();
    const cloud = creerCloudMemoire();
    local.ecrireLocal('journal_crohn', '2026-01-05', { date: '2026-01-05', douleur: 2 }, t(1));

    const res = await synchroniser(local, cloud, local);

    expect(res.statut).toBe('ok');
    expect(res.pousses).toBe(1);
  });
});

describe('SyncManager — idempotence', () => {
  it('une 2ᵉ passe sans changement ne pousse ni applique rien', async () => {
    const local = creerLocalMemoire();
    const cloud = creerCloudMemoire();
    local.ecrireLocal('journal_crohn', '2026-01-05', { date: '2026-01-05', douleur: 2 }, t(1));

    await synchroniser(local, cloud, local);
    const res2 = await synchroniser(local, cloud, local);

    expect(res2).toMatchObject({ statut: 'ok', pousses: 0, appliques: 0 });
  });
});
