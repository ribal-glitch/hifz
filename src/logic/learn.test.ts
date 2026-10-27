import { describe, expect, it } from 'vitest';
import { learnedPlanPages, newPlan, planFinished, planTask, planTitle, suraRange } from './learn';
import { archivePlan, effectiveBestand, learnTasks, upsertPlan } from './plan';
import { createProfile } from './profile';
import { suraStartLine } from './quran';

const D = '2026-10-30'; // Freitag, Woche beginnt nach Vortrag am Donnerstag

describe('Lernpläne', () => {
  it('mitten in der Woche angelegt: beginnt mit der ersten Portion', () => {
    const tue = '2026-11-03'; // Dienstag, Tag 4 der Woche (Vortrag donnerstags)
    const pl = newPlan(suraRange('1405', 67, 67), 1, 4, tue);
    const t = planTask('1405', pl, tue)!;
    expect(t.kind).toBe('portion');
    expect(t.segs[0].from).toBe(t.week[0].from); // erste Zeile der Woche
    // am Vortragstag angelegt: startet erst nächste Woche
    const thu = newPlan(suraRange('1405', 67, 67), 1, 4, '2026-11-05');
    expect(planTask('1405', thu, '2026-11-05')).toBeNull();
    expect(planTask('1405', thu, '2026-11-06')!.week[0].page).toBe(562);
  });

  it('beginnt bei einer Sura an ihrem Kopf, nicht am Seitenanfang', () => {
    const pl = newPlan(suraRange('1405', 29, 29), 1, 4, D);
    expect(pl.fromPage).toBe(396);
    expect(pl.fromLine).toBe(suraStartLine('1405', 29));
    expect(planTitle('1405', pl)).toBe('Al-‘Ankabūt');
    const t = planTask('1405', pl, D)!;
    expect(t.kind).toBe('portion');
    expect(t.segs[0].page).toBe(396);
    expect(t.segs[0].from).toBeGreaterThanOrEqual(pl.fromLine);
  });

  it('2 Seiten pro Woche: die Woche umfasst zwei Seiten, danach geht es zwei weiter', () => {
    const pl = newPlan(suraRange('1405', 67, 67), 2, 4, D); // al-Mulk, S. 562–564
    expect(planTask('1405', pl, D)!.week.map((s) => s.page)).toEqual([562, 563]);
    expect(planTask('1405', pl, '2026-11-06')!.week.map((s) => s.page)).toEqual([564]);
    expect(learnedPlanPages('1405', pl, '2026-11-06')).toEqual([562, 563]);
  });

  it('½ Seite pro Woche: erst die erste, dann die zweite Hälfte', () => {
    const pl = newPlan(suraRange('1405', 67, 67), 0.5, 4, D);
    const w1 = planTask('1405', pl, D)!.week;
    const w2 = planTask('1405', pl, '2026-11-06')!.week;
    expect(w1[0].page).toBe(562);
    expect(w2[0].page).toBe(562);
    expect(w2[0].from).toBeGreaterThan(w1[0].to);
  });

  it('ist am Ende fertig; weggelegt bleiben die Seiten in der Wiederholung', () => {
    let p = createProfile({ name: 'T', today: D });
    const pl = newPlan(suraRange('1405', 114, 114), 1, 4, D); // an-Nās, eine Seite
    p = upsertPlan(p, pl);
    expect(learnTasks(p, D)).toHaveLength(1);
    expect(planFinished('1405', pl, '2026-11-06')).toBe(true);
    expect(learnTasks(p, '2026-11-06')).toHaveLength(0);
    p = archivePlan(p, pl.id);
    expect(p.bestand).toContain(604);
    expect(effectiveBestand(p, '2026-11-06').has(604)).toBe(true);
  });
});
