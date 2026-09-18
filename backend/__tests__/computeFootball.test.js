import { describe, it, expect } from 'vitest';
import {
  poissonPmf, computeLambdas, computeBTTSProb, computeOUProb, compute1X2Probs,
  computeScoreGrid, dixonColesTau, DIXON_COLES_RHO, computeTeamGoalsProb,
  shrinkFactor, computeTeamAttackDefenseFactor, poissonCdf, computeIndependentOUProb,
} from '../computeFootball.js';

// ─── poissonPmf ────────────────────────────────────────────────────────────

describe('poissonPmf', () => {
  it('P(X=0) = e^-λ', () => {
    expect(poissonPmf(1.5, 0)).toBeCloseTo(Math.exp(-1.5), 10);
  });

  it('somme sur k=0..30 vaut ~1 (distribution normalisée)', () => {
    const total = Array.from({ length: 31 }, (_, k) => poissonPmf(2.3, k)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('valeur connue : λ=2, k=2 → 2*e^-2 ≈ 0.2707', () => {
    expect(poissonPmf(2, 2)).toBeCloseTo(0.270670566, 8);
  });
});

// ─── shrinkFactor ──────────────────────────────────────────────────────────

describe('shrinkFactor', () => {
  it('games=0 → confiance nulle, retombe exactement sur 1.0', () => {
    expect(shrinkFactor(1.8, 0)).toBe(1);
  });

  it('petit échantillon (3 matchs) tire le facteur vers 1.0, pas la valeur brute', () => {
    const shrunk = shrinkFactor(2.0, 3);
    expect(shrunk).toBeGreaterThan(1);
    expect(shrunk).toBeLessThan(2.0);
  });

  it('grand échantillon (200 matchs) fait quasiment confiance à la valeur brute', () => {
    const shrunk = shrinkFactor(1.5, 200);
    expect(shrunk).toBeCloseTo(1.5, 1);
  });

  it('rawFactor=1.0 (équipe parfaitement moyenne) reste 1.0 quel que soit l\'échantillon', () => {
    expect(shrinkFactor(1.0, 3)).toBe(1);
    expect(shrinkFactor(1.0, 50)).toBe(1);
  });
});

// ─── computeTeamAttackDefenseFactor ───────────────────────────────────────

describe('computeTeamAttackDefenseFactor', () => {
  it('renvoie null si played=0', () => {
    expect(computeTeamAttackDefenseFactor(10, 8, 0, 1.35)).toBeNull();
  });

  it('renvoie null si goalsFor/goalsAgainst manquent', () => {
    expect(computeTeamAttackDefenseFactor(null, 8, 10, 1.35)).toBeNull();
    expect(computeTeamAttackDefenseFactor(10, undefined, 10, 1.35)).toBeNull();
  });

  it('équipe pile dans la moyenne de la ligue → facteurs ≈ 1.0', () => {
    const f = computeTeamAttackDefenseFactor(13.5, 13.5, 10, 1.35);
    expect(f.attack).toBeCloseTo(1.0, 6);
    expect(f.defense).toBeCloseTo(1.0, 6);
  });

  it('attaque au-dessus de la moyenne → facteur attaque > 1', () => {
    const f = computeTeamAttackDefenseFactor(20, 13.5, 10, 1.35);
    expect(f.attack).toBeGreaterThan(1);
  });
});

// ─── computeLambdas ────────────────────────────────────────────────────────

describe('computeLambdas', () => {
  const base = { homeGF: 15, homeGA: 10, homePlayed: 10, awayGF: 12, awayGA: 13, awayPlayed: 10, leagueAvgGoals: 1.35 };

  it('renvoie null si un played est manquant/zéro', () => {
    expect(computeLambdas({ ...base, homePlayed: 0 })).toBeNull();
  });

  it('renvoie null si un total de buts est null', () => {
    expect(computeLambdas({ ...base, awayGA: null })).toBeNull();
  });

  it('homeAdv=1.10 avantage le λ domicile par rapport à un match neutre (homeAdv=1.0)', () => {
    const withAdv = computeLambdas({ ...base, homeAdv: 1.10 });
    const neutral = computeLambdas({ ...base, homeAdv: 1.0 });
    expect(withAdv.lambdaHome).toBeGreaterThan(neutral.lambdaHome);
    expect(withAdv.lambdaAway).toBeLessThan(neutral.lambdaAway);
  });

  it('deux équipes strictement identiques et symétriques + homeAdv=1.0 → lambdas égaux', () => {
    const r = computeLambdas({
      homeGF: 15, homeGA: 10, homePlayed: 10,
      awayGF: 15, awayGA: 10, awayPlayed: 10,
      leagueAvgGoals: 1.35, homeAdv: 1.0,
    });
    expect(r.lambdaHome).toBeCloseTo(r.lambdaAway, 10);
  });

  it('pénalité attaque (< 1) réduit le lambda de l\'équipe concernée, rien d\'autre', () => {
    const normal = computeLambdas(base);
    const penalized = computeLambdas({ ...base, homeAttackPenalty: 0.90 });
    expect(penalized.lambdaHome).toBeLessThan(normal.lambdaHome);
    expect(penalized.lambdaAway).toBeCloseTo(normal.lambdaAway, 10);
  });

  it('expose les 4 facteurs bruts dans factors, cohérents avec le calcul de lambdaHome', () => {
    const r = computeLambdas(base);
    const recomputed = r.factors.homeAttack * r.factors.awayDefense * base.leagueAvgGoals * r.factors.homeAdv;
    expect(r.lambdaHome).toBeCloseTo(recomputed, 10);
  });
});

// ─── dixonColesTau ─────────────────────────────────────────────────────────

describe('dixonColesTau', () => {
  it('rho=0 → tau=1 sur les 4 cases spéciales (aucune correction)', () => {
    expect(dixonColesTau(0, 0, 1.4, 1.1, 0)).toBe(1);
    expect(dixonColesTau(0, 1, 1.4, 1.1, 0)).toBe(1);
    expect(dixonColesTau(1, 0, 1.4, 1.1, 0)).toBe(1);
    expect(dixonColesTau(1, 1, 1.4, 1.1, 0)).toBe(1);
  });

  it('cases hors (0,0)/(0,1)/(1,0)/(1,1) → toujours tau=1, quel que soit rho', () => {
    expect(dixonColesTau(2, 2, 1.4, 1.1, 0.10)).toBe(1);
    expect(dixonColesTau(3, 0, 1.4, 1.1, 0.10)).toBe(1);
  });

  it('formules exactes du papier Dixon-Coles 1997 pour rho=0.10', () => {
    const lh = 1.4, la = 1.1, rho = 0.10;
    expect(dixonColesTau(0, 0, lh, la, rho)).toBeCloseTo(1 - lh * la * rho, 10);
    expect(dixonColesTau(0, 1, lh, la, rho)).toBeCloseTo(1 + lh * rho, 10);
    expect(dixonColesTau(1, 0, lh, la, rho)).toBeCloseTo(1 + la * rho, 10);
    expect(dixonColesTau(1, 1, lh, la, rho)).toBeCloseTo(1 - rho, 10);
  });
});

// ─── computeScoreGrid ──────────────────────────────────────────────────────

describe('computeScoreGrid', () => {
  it('la grille est toujours normalisée : somme des cases = 1', () => {
    const grid = computeScoreGrid(1.6, 1.1, DIXON_COLES_RHO);
    const total = grid.flat().reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('rho=0 reproduit le produit de deux Poisson indépendants (filet de sécurité documenté, aux erreurs d\'arrondi de renormalisation près)', () => {
    const lh = 1.6, la = 1.1;
    const grid = computeScoreGrid(lh, la, 0);
    for (let i = 0; i <= 3; i++) {
      for (let j = 0; j <= 3; j++) {
        expect(grid[i][j]).toBeCloseTo(poissonPmf(lh, i) * poissonPmf(la, j), 6);
      }
    }
  });

  it('rho=0.10 modifie bien les 4 cases basses par rapport à rho=0', () => {
    const g0 = computeScoreGrid(1.6, 1.1, 0);
    const g1 = computeScoreGrid(1.6, 1.1, 0.10);
    expect(g1[0][0]).not.toBeCloseTo(g0[0][0], 6);
    expect(g1[1][1]).not.toBeCloseTo(g0[1][1], 6);
  });
});

// ─── computeBTTSProb ───────────────────────────────────────────────────────

describe('computeBTTSProb', () => {
  it('rho=0 (indépendance) égale la formule fermée (1-P(home=0))·(1-P(away=0))', () => {
    const lh = 1.6, la = 1.1;
    const closed = (1 - poissonPmf(lh, 0)) * (1 - poissonPmf(la, 0));
    expect(computeBTTSProb(lh, la, 0)).toBeCloseTo(closed, 6);
  });

  it('reste entre 0 et 1', () => {
    const p = computeBTTSProb(1.4, 0.9, DIXON_COLES_RHO);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThan(1);
  });

  it('deux attaques fortes → BTTS plus probable que deux attaques faibles', () => {
    const strong = computeBTTSProb(2.2, 1.8, DIXON_COLES_RHO);
    const weak = computeBTTSProb(0.4, 0.3, DIXON_COLES_RHO);
    expect(strong).toBeGreaterThan(weak);
  });
});

// ─── computeOUProb ─────────────────────────────────────────────────────────

describe('computeOUProb', () => {
  it('pOver + pUnder = 1', () => {
    const { pOver, pUnder } = computeOUProb(1.6, 1.1, 2.5);
    expect(pOver + pUnder).toBeCloseTo(1, 10);
  });

  it('ligne 1.5 et 1.9 donnent le même seuil (floor identique) — comportement documenté du code', () => {
    const a = computeOUProb(1.6, 1.1, 1.5);
    const b = computeOUProb(1.6, 1.1, 1.9);
    expect(a.pOver).toBeCloseTo(b.pOver, 10);
  });

  it('ligne plus haute → pOver plus faible (monotone)', () => {
    const r15 = computeOUProb(1.6, 1.1, 1.5);
    const r25 = computeOUProb(1.6, 1.1, 2.5);
    const r35 = computeOUProb(1.6, 1.1, 3.5);
    expect(r15.pOver).toBeGreaterThan(r25.pOver);
    expect(r25.pOver).toBeGreaterThan(r35.pOver);
  });

  it('lambdaTotal = lambdaHome + lambdaAway', () => {
    const { lambdaTotal } = computeOUProb(1.6, 1.1, 2.5);
    expect(lambdaTotal).toBeCloseTo(2.7, 10);
  });
});

// ─── compute1X2Probs ───────────────────────────────────────────────────────

describe('compute1X2Probs', () => {
  it('pHome + pDraw + pAway = 1', () => {
    const { pHome, pDraw, pAway } = compute1X2Probs(1.6, 1.1);
    expect(pHome + pDraw + pAway).toBeCloseTo(1, 10);
  });

  it('lambdas égaux → pHome = pAway (symétrie)', () => {
    const { pHome, pAway } = compute1X2Probs(1.4, 1.4);
    expect(pHome).toBeCloseTo(pAway, 10);
  });

  it('inverser home/away inverse pHome et pAway', () => {
    const a = compute1X2Probs(1.8, 1.0);
    const b = compute1X2Probs(1.0, 1.8);
    expect(a.pHome).toBeCloseTo(b.pAway, 10);
    expect(a.pAway).toBeCloseTo(b.pHome, 10);
    expect(a.pDraw).toBeCloseTo(b.pDraw, 10);
  });

  it('grosse équipe favorite → pHome > pAway', () => {
    const { pHome, pAway } = compute1X2Probs(2.4, 0.8);
    expect(pHome).toBeGreaterThan(pAway);
  });
});

// ─── computeTeamGoalsProb ──────────────────────────────────────────────────

describe('computeTeamGoalsProb', () => {
  it('pOver + pUnder = 1, côté home comme away', () => {
    const home = computeTeamGoalsProb(1.6, 1.1, 1.5, 'home');
    const away = computeTeamGoalsProb(1.6, 1.1, 1.5, 'away');
    expect(home.pOver + home.pUnder).toBeCloseTo(1, 10);
    expect(away.pOver + away.pUnder).toBeCloseTo(1, 10);
  });

  it('équipe avec un plus gros lambda a une proba "+0.5 but" plus haute', () => {
    const strongSide = computeTeamGoalsProb(2.2, 0.7, 0.5, 'home');
    const weakSide = computeTeamGoalsProb(2.2, 0.7, 0.5, 'away');
    expect(strongSide.pOver).toBeGreaterThan(weakSide.pOver);
  });

  it('ligne plus haute → pOver plus faible pour la même équipe', () => {
    const r05 = computeTeamGoalsProb(1.6, 1.1, 0.5, 'home');
    const r15 = computeTeamGoalsProb(1.6, 1.1, 1.5, 'home');
    const r25 = computeTeamGoalsProb(1.6, 1.1, 2.5, 'home');
    expect(r05.pOver).toBeGreaterThan(r15.pOver);
    expect(r15.pOver).toBeGreaterThan(r25.pOver);
  });
});

// ─── poissonCdf / computeIndependentOUProb ────────────────────────────────
// Marché Tirs/Tirs cadrés (14 sept 2026) — régression du bug documenté dans le code : la grille
// jointe Dixon-Coles (kMax=10) tronque et renvoie des résultats corrompus (0%/100%/NaN) sur des
// comptages qui dépassent largement 10 par équipe (tirs : 8-20/équipe). computeIndependentOUProb
// existe précisément pour ne jamais reproduire ce bug.

describe('poissonCdf / computeIndependentOUProb — cas réel Tirs (λ élevés, hors de portée de computeScoreGrid)', () => {
  it('pOver + pUnder = 1 même avec un lambda total > kMax=10 de la grille jointe', () => {
    const lambdaTotal = 15.5 + 9.1; // cas réel documenté dans le code (computeFootball.js)
    const { pOver, pUnder } = computeIndependentOUProb(lambdaTotal, 22.5);
    expect(pOver + pUnder).toBeCloseTo(1, 10);
  });

  it('ne renvoie jamais NaN ni 0/1 exact sur un match équilibré à lambda élevé (régression du bug corrigé)', () => {
    const { pOver, pUnder } = computeIndependentOUProb(24.6, 22.5);
    expect(Number.isNaN(pOver)).toBe(false);
    expect(Number.isNaN(pUnder)).toBe(false);
    expect(pOver).toBeGreaterThan(0);
    expect(pOver).toBeLessThan(1);
  });

  it('poissonCdf(k, λ) croît vers 1 quand k augmente', () => {
    const c10 = poissonCdf(10, 24.6);
    const c25 = poissonCdf(25, 24.6);
    const c50 = poissonCdf(50, 24.6);
    expect(c10).toBeLessThan(c25);
    expect(c25).toBeLessThan(c50);
    expect(c50).toBeCloseTo(1, 4);
  });

  it('ligne juste au-dessus du lambda → environ 50/50 (médiane ≈ moyenne pour Poisson à grand λ)', () => {
    const { pOver, pUnder } = computeIndependentOUProb(24.6, 24.5);
    expect(pOver).toBeGreaterThan(0.4);
    expect(pOver).toBeLessThan(0.6);
    expect(pUnder).toBeGreaterThan(0.4);
    expect(pUnder).toBeLessThan(0.6);
  });
});
