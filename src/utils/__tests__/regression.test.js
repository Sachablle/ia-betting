import { describe, it, expect } from 'vitest';
import { BBALL_FIXTURES } from '../basketball.js';

// ─── Helpers copiés depuis PlaceBetPage (fonctions pures extraites) ───────────

function groupAlerts(alerts) {
  const map = {};
  for (const a of alerts) {
    if (!['over', 'under'].includes(a.direction)) continue;
    const dateKey = new Date(a.fixtureDate).toISOString().slice(0, 10);
    const key = `${a.player}__${dateKey}__${a.stat}__${a.direction}`;
    if (!map[key]) {
      map[key] = { key, player: a.player, stats: [], maxProb: 0, ids: [], status: a.status || 'pending' };
    }
    const STATUS_RANK = { accepted: 2, rejected: 1, pending: 0 };
    const rank = s => STATUS_RANK[s] ?? 0;
    if (rank(a.status) > rank(map[key].status)) map[key].status = a.status;
    const statKey = `${a.stat}__${a.direction}`;
    const existing = map[key].stats.findIndex(s => `${s.stat}__${s.direction}` === statKey);
    const entry = { stat: a.stat, direction: a.direction, line: a.line, probability: a.probability };
    if (existing === -1) map[key].stats.push(entry);
    else if (a.probability > map[key].stats[existing].probability) map[key].stats[existing] = entry;
    map[key].maxProb = Math.max(map[key].maxProb, a.probability);
    map[key].ids.push(a.id);
  }
  return Object.values(map);
}

// ─── 1. groupAlerts — déduplication ──────────────────────────────────────────

describe('groupAlerts — déduplication', () => {
  const base = { player: 'Tyrese Haliburton', fixtureDate: '2026-05-25T00:00:00Z', stat: 'pts', direction: 'over', line: 13.5 };

  it('déduplique 3 records identiques en 1 groupe', () => {
    const alerts = [
      { ...base, id: '1', probability: 0.78, status: 'pending' },
      { ...base, id: '2', probability: 0.82, status: 'pending' },
      { ...base, id: '3', probability: 0.75, status: 'pending' },
    ];
    const groups = groupAlerts(alerts);
    expect(groups).toHaveLength(1);
    expect(groups[0].maxProb).toBe(0.82);
    expect(groups[0].ids).toHaveLength(3);
  });

  it('garde 2 groupes si stat différente', () => {
    const alerts = [
      { ...base, id: '1', probability: 0.78, status: 'pending' },
      { ...base, id: '2', stat: 'ast', probability: 0.80, status: 'pending' },
    ];
    expect(groupAlerts(alerts)).toHaveLength(2);
  });

  it('statut accepted prime sur pending', () => {
    const alerts = [
      { ...base, id: '1', probability: 0.78, status: 'pending' },
      { ...base, id: '2', probability: 0.75, status: 'accepted' },
    ];
    const groups = groupAlerts(alerts);
    expect(groups[0].status).toBe('accepted');
  });

  it('compte correct avec totalGroups (pas rawAlerts.length)', () => {
    const alerts = [
      { ...base, id: '1', probability: 0.78, status: 'accepted' },
      { ...base, id: '2', probability: 0.75, status: 'accepted' },
      { ...base, id: '3', stat: 'ast', probability: 0.80, status: 'pending' },
    ];
    const groups = groupAlerts(alerts);
    expect(groups).toHaveLength(2); // 2 groupes, pas 3 records
  });
});

// ─── 2. makeAutoFixture — champs obligatoires ─────────────────────────────────

const ESPN_SHORT = { SA: 'SAS', NY: 'NYK', GS: 'GSW', NO: 'NOP', UT: 'UTA' };
const norm = a => ESPN_SHORT[a?.toUpperCase()] || a?.toUpperCase() || '';

function findTeamData(short) {
  for (const f of BBALL_FIXTURES) {
    if (f.home?.short === short) return f.home;
    if (f.away?.short === short) return f.away;
  }
  return null;
}

function makeAutoFixture(upcoming, patches) {
  const homeData = findTeamData(upcoming.home);
  const awayData = findTeamData(upcoming.away);
  return {
    id: `espn_${upcoming.espnId}`,
    league: 'nba',
    home: { ...(homeData || {}), name: upcoming.homeName, short: upcoming.home, logoId: upcoming.home.toLowerCase(), score: null },
    away: { ...(awayData || {}), name: upcoming.awayName, short: upcoming.away, logoId: upcoming.away.toLowerCase(), score: null },
    date: upcoming.date,
    round: upcoming.note,
    h2h: [],
    venue: upcoming.venue || null,
    _auto: true,
  };
}

describe('makeAutoFixture — champs obligatoires', () => {
  const upcoming = {
    espnId: '12345',
    date: '2026-05-27T00:30:00Z',
    home: 'OKC', away: 'SAS',
    homeName: 'Oklahoma City Thunder',
    awayName: 'San Antonio Spurs',
    note: 'Western Conference Finals - Game 5',
    venue: { name: 'Paycom Center', city: 'Oklahoma City' },
    gameNum: 5,
  };

  it('produit un logoId pour home et away', () => {
    const f = makeAutoFixture(upcoming, []);
    expect(f.home.logoId).toBe('okc');
    expect(f.away.logoId).toBe('sas');
  });

  it('inclut le venue', () => {
    const f = makeAutoFixture(upcoming, []);
    expect(f.venue).toEqual({ name: 'Paycom Center', city: 'Oklahoma City' });
  });

  it('copie les stats depuis BBALL_FIXTURES (ppg, form, wins)', () => {
    const f = makeAutoFixture(upcoming, []);
    // OKC et SAS existent dans basketball.js → leurs stats doivent être copiées
    expect(f.home.ppg).toBeDefined();
    expect(f.home.form).toBeDefined();
    expect(f.home.wins).toBeDefined();
    expect(f.away.ppg).toBeDefined();
  });

  it('name/short/score écrasent les données statiques', () => {
    const f = makeAutoFixture(upcoming, []);
    expect(f.home.name).toBe('Oklahoma City Thunder');
    expect(f.home.short).toBe('OKC');
    expect(f.home.score).toBeNull();
  });

  it('venue null si non fourni', () => {
    const f = makeAutoFixture({ ...upcoming, venue: null }, []);
    expect(f.venue).toBeNull();
  });
});

// ─── 3. basketball.js — intégrité des fixtures statiques ─────────────────────

describe('BBALL_FIXTURES — intégrité', () => {
  it('tous les fixtures ont un id unique', () => {
    const ids = BBALL_FIXTURES.map(f => f.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('tous les fixtures NBA ont logoId sur home et away', () => {
    const nba = BBALL_FIXTURES.filter(f => f.league === 'nba');
    for (const f of nba) {
      expect(f.home.logoId, `${f.id} home.logoId`).toBeTruthy();
      expect(f.away.logoId, `${f.id} away.logoId`).toBeTruthy();
    }
  });

  it('tous les fixtures ont une date valide', () => {
    for (const f of BBALL_FIXTURES) {
      expect(isNaN(new Date(f.date).getTime()), `${f.id} date invalide`).toBe(false);
    }
  });

  it('fixtures NBA ont ppg et form sur home/away', () => {
    const nba = BBALL_FIXTURES.filter(f => f.league === 'nba' && !f.home.score);
    for (const f of nba) {
      expect(f.home.ppg, `${f.id} home.ppg`).toBeDefined();
      expect(f.home.form, `${f.id} home.form`).toBeDefined();
    }
  });
});

// ─── 4. Résolution alertes — timestamps ──────────────────────────────────────

describe('acceptedAt — backfill', () => {
  const RESOLVED = ['accepted', 'won', 'lost', 'void'];

  function backfill(alerts) {
    return alerts.map(a =>
      RESOLVED.includes(a.status) && !a.acceptedAt && a.savedAt
        ? { ...a, acceptedAt: a.savedAt }
        : a
    );
  }

  it('backfille acceptedAt depuis savedAt si absent', () => {
    const alerts = [{ id: '1', status: 'accepted', savedAt: 1748131200000 }];
    const result = backfill(alerts);
    expect(result[0].acceptedAt).toBe(1748131200000);
  });

  it('ne touche pas acceptedAt si déjà défini', () => {
    const alerts = [{ id: '1', status: 'accepted', savedAt: 1000, acceptedAt: 2000 }];
    const result = backfill(alerts);
    expect(result[0].acceptedAt).toBe(2000);
  });

  it('ne backfille pas les alertes pending', () => {
    const alerts = [{ id: '1', status: 'pending', savedAt: 1748131200000 }];
    const result = backfill(alerts);
    expect(result[0].acceptedAt).toBeUndefined();
  });

  it('le chart groupe les alertes au bon jour', () => {
    const MAY_24 = new Date('2026-05-24T14:00:00Z').getTime();
    const MAY_25 = new Date('2026-05-25T14:00:00Z').getTime();
    const alerts = [
      { status: 'accepted', acceptedAt: MAY_24 },
      { status: 'accepted', acceptedAt: MAY_24 },
      { status: 'accepted', acceptedAt: MAY_25 },
    ];
    const byDay = {};
    alerts.forEach(a => {
      const ts = a.acceptedAt ?? a.savedAt ?? Date.now();
      const raw = new Date(ts);
      const day = new Date(raw.getTime() - raw.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    });
    expect(byDay['2026-05-24']).toBe(2);
    expect(byDay['2026-05-25']).toBe(1);
  });
});

// ─── 5. Résolution prématurée — buffer 12h ───────────────────────────────────

describe('resolveCompletedBets — buffer 12h', () => {
  it('ne résout pas un match dont la date + 12h est dans le futur', () => {
    const now = new Date('2026-05-25T10:00:00Z').getTime();
    const fixtureDate = '2026-05-25'; // minuit UTC → 12h plus tard = midi UTC > now
    const accepted = [{ status: 'accepted', fixtureDate }];
    const toResolve = accepted.filter(a =>
      new Date(a.fixtureDate).getTime() + 12 * 3600_000 < now
    );
    expect(toResolve).toHaveLength(0);
  });

  it('résout un match dont la date + 12h est dans le passé', () => {
    const now = new Date('2026-05-26T14:00:00Z').getTime();
    const fixtureDate = '2026-05-25'; // + 12h = midi UTC 25 mai < 14h UTC 26 mai
    const accepted = [{ status: 'accepted', fixtureDate }];
    const toResolve = accepted.filter(a =>
      new Date(a.fixtureDate).getTime() + 12 * 3600_000 < now
    );
    expect(toResolve).toHaveLength(1);
  });
});
