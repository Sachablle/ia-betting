import { describe, it, expect } from 'vitest';
import { calcStd, isConsistentStat, blendedSeasonAvg, winsorizeRecent, probAtLeast, tCDF4 } from '../compute.js';

// Génère n matchs factices avec des minutes valides (>10, condition de calcStd/isConsistentStat)
function games(values, min = 25) {
  return values.map(v => ({ min, pts: v, reb: v, ast: v, tpm: v }));
}

// ─── tCDF4 ─────────────────────────────────────────────────────────────────
// CDF de Student df=4 — le commentaire du code donne 2 quantiles connus, on les revérifie.

describe('tCDF4', () => {
  it('t=0 → 0.5 (symétrique autour de 0)', () => {
    expect(tCDF4(0)).toBeCloseTo(0.5, 6);
  });

  it('valeurs connues documentées dans le code : t=1.0 → ~81.3%, t=2.132 → ~94.99%', () => {
    expect(tCDF4(1.0)).toBeCloseTo(0.813, 2);
    expect(tCDF4(2.132)).toBeCloseTo(0.9499, 2);
  });

  it('antisymétrique : F(-t) = 1 - F(t)', () => {
    expect(tCDF4(-1.5)).toBeCloseTo(1 - tCDF4(1.5), 10);
  });

  it('reste borné dans (0, 1) même pour un t extrême', () => {
    expect(tCDF4(100)).toBeLessThan(1);
    expect(tCDF4(100)).toBeGreaterThan(0.99);
    expect(tCDF4(-100)).toBeGreaterThan(0);
    expect(tCDF4(-100)).toBeLessThan(0.01);
  });
});

// ─── calcStd ───────────────────────────────────────────────────────────────

describe('calcStd', () => {
  it('renvoie null si moins de 3 matchs valides', () => {
    expect(calcStd(games([10, 12]), 'pts')).toBeNull();
  });

  it('ignore les matchs à faibles minutes (≤10)', () => {
    const gs = [...games([10, 12, 14]), { min: 5, pts: 40 }]; // 40 pts en 5 min doit être ignoré
    const std = calcStd(gs, 'pts');
    expect(std).toBeCloseTo(2, 1); // écart-type de [10,12,14], pas influencé par le 40
  });

  it('valeurs identiques → écart-type nul', () => {
    expect(calcStd(games([15, 15, 15, 15]), 'pts')).toBe(0);
  });

  it('plus la dispersion réelle est grande, plus le std calculé est grand', () => {
    const tight = calcStd(games([14, 15, 16, 15, 14]), 'pts');
    const spread = calcStd(games([5, 25, 8, 22, 10]), 'pts');
    expect(spread).toBeGreaterThan(tight);
  });
});

// ─── isConsistentStat ────────────────────────────────────────────────────
// Seuil de coefficient de variation par stat (CONSISTENCY_CV_CUTOFF), avec un minimum de 10 matchs.

describe('isConsistentStat', () => {
  it('faux si moins de 10 matchs (CONSISTENCY_MIN_SAMPLE)', () => {
    expect(isConsistentStat(games(Array(9).fill(15)), 'pts')).toBe(false);
  });

  it('joueuse parfaitement régulière (10 matchs identiques) → spécialiste', () => {
    expect(isConsistentStat(games(Array(10).fill(15)), 'pts')).toBe(true);
  });

  it('joueuse très irrégulière (grand écart-type relatif) → pas spécialiste', () => {
    const erratic = games([2, 28, 4, 26, 3, 27, 5, 25, 2, 29]);
    expect(isConsistentStat(erratic, 'pts')).toBe(false);
  });

  it('moyenne nulle ou négative → jamais spécialiste (division par une moyenne ≤0 évitée)', () => {
    expect(isConsistentStat(games(Array(10).fill(0)), 'pts')).toBe(false);
  });

  it('3pts sous 0.5 de moyenne → jamais spécialiste, même si parfaitement régulier (garde-fou dédié tpm)', () => {
    expect(isConsistentStat(games(Array(10).fill(0.2)), 'tpm')).toBe(false);
  });
});

// ─── blendedSeasonAvg ────────────────────────────────────────────────────
// Mélange moyenne saison + forme récente, pondéré par la confiance dans l'échantillon récent.

describe('blendedSeasonAvg', () => {
  it('renvoie seasonAvg tel quel si null', () => {
    expect(blendedSeasonAvg(games([10, 10]), 'pts', null)).toBeNull();
  });

  it('sans matchs récents valides, retombe sur seasonAvg', () => {
    expect(blendedSeasonAvg([], 'pts', 17.0)).toBe(17.0);
  });

  it('cas réel documenté (McBride) : forme récente chaude tire la moyenne effective vers le haut, sans l\'atteindre complètement (shrinkage)', () => {
    const recentHot = games(Array(10).fill(26.2));
    const blended = blendedSeasonAvg(recentHot, 'pts', 17.0);
    expect(blended).toBeGreaterThan(17.0);
    expect(blended).toBeLessThan(26.2);
  });

  it('forme récente = moyenne saison → le mélange reste égal à la moyenne saison', () => {
    const recentSame = games(Array(10).fill(17.0));
    expect(blendedSeasonAvg(recentSame, 'pts', 17.0)).toBeCloseTo(17.0, 6);
  });
});

// ─── winsorizeRecent ─────────────────────────────────────────────────────
// Plafonne les n matchs les plus récents à [moyenne ± cap×std] — cas réel documenté : Pauline Astier.

describe('winsorizeRecent', () => {
  it('sans std ou sans seasonAvg, renvoie les matchs inchangés', () => {
    const gs = games([1, 2, 3]);
    expect(winsorizeRecent(gs, 'reb', null, 2)).toBe(gs);
    expect(winsorizeRecent(gs, 'reb', 3, null)).toBe(gs);
  });

  it('cas réel documenté (Pauline Astier) : un rebond exceptionnel (8) est plafonné vers la borne haute', () => {
    const seasonAvg = 3.27, std = 2.28;
    const gs = [{ min: 25, reb: 8 }, { min: 25, reb: 3 }, { min: 25, reb: 4 }];
    const result = winsorizeRecent(gs, 'reb', seasonAvg, std, 3, 1.5);
    const hi = seasonAvg + 1.5 * std;
    expect(result[0].reb).toBeCloseTo(hi, 6);
    expect(result[0].reb).toBeLessThan(8);
  });

  it('ne touche pas les matchs au-delà du rang n (seuls les plus récents sont plafonnés)', () => {
    const gs = [{ min: 25, reb: 3 }, { min: 25, reb: 3 }, { min: 25, reb: 3 }, { min: 25, reb: 99 }];
    const result = winsorizeRecent(gs, 'reb', 3, 1, 3, 1.5); // n=3 → le 4e match (idx 3) n'est pas plafonné
    expect(result[3].reb).toBe(99);
  });

  it('une valeur déjà dans la plage normale reste inchangée', () => {
    const gs = [{ min: 25, reb: 4 }];
    const result = winsorizeRecent(gs, 'reb', 3.5, 2, 3, 1.5);
    expect(result[0].reb).toBe(4);
  });
});

// ─── probAtLeast ─────────────────────────────────────────────────────────
// Le cœur du modèle props basket — convertit une estimation + une ligne bookmaker en probabilité.

describe('probAtLeast', () => {
  it('reste toujours dans les bornes de sécurité [0.01, 0.99]', () => {
    const veryLikely = probAtLeast(40, 2, 5, 'pts');
    const veryUnlikely = probAtLeast(5, 2, 40, 'pts');
    expect(veryLikely).toBeLessThanOrEqual(0.99);
    expect(veryUnlikely).toBeGreaterThanOrEqual(0.01);
  });

  it('estimation très supérieure à la ligne → forte probabilité', () => {
    const p = probAtLeast(25, 4, 15, 'pts', 0, false, 20);
    expect(p).toBeGreaterThan(0.7);
  });

  it('estimation très inférieure à la ligne → faible probabilité', () => {
    const p = probAtLeast(10, 4, 20, 'pts', 0, false, 20);
    expect(p).toBeLessThan(0.3);
  });

  it('estimation = ligne exactement → autour de 50% (à la correction de continuité près)', () => {
    const p = probAtLeast(15, 4, 15, 'pts', 0, false, 20);
    expect(p).toBeGreaterThan(0.4);
    expect(p).toBeLessThan(0.65);
  });

  it('petit échantillon (sampleSize bas) réduit la confiance par rapport à un grand échantillon, à edge identique', () => {
    const pSmallSample = probAtLeast(22, 4, 15, 'pts', 0, false, 4);
    const pLargeSample = probAtLeast(22, 4, 15, 'pts', 0, false, 25);
    expect(pSmallSample).toBeLessThan(pLargeSample);
  });

  it('deviation plus grande (projection qui s\'écarte fort de la moyenne saison) réduit la confiance', () => {
    const pLowDev = probAtLeast(22, 4, 15, 'pts', 0, false, 20);
    const pHighDev = probAtLeast(22, 4, 15, 'pts', 0.8, false, 20);
    expect(pHighDev).toBeLessThanOrEqual(pLowDev);
  });
});
