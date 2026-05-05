// Fluency Score Calculator

const BENCHMARKS = {
  fp_for_100: 10000,
  vocab_for_100: 500,
  streak_for_100: 30,
  missions_for_100: 15,
};

export function calculateFluencyScore(params: {
  fluencyPoints: number;
  wordsLearned: number;
  streakDays: number;
  missionsCompleted: number;
  errorPatterns: Record<string, number>;
}): number {
  const { fluencyPoints, wordsLearned, streakDays, missionsCompleted, errorPatterns } = params;

  const fpScore = Math.min(40, (fluencyPoints / BENCHMARKS.fp_for_100) * 40);
  const vocabScore = Math.min(25, (wordsLearned / BENCHMARKS.vocab_for_100) * 25);
  const streakScore = Math.min(10, (streakDays / BENCHMARKS.streak_for_100) * 10);
  const missionScore = Math.min(15, (missionsCompleted / BENCHMARKS.missions_for_100) * 15);

  const errorRates = Object.values(errorPatterns);
  const avgErrorRate =
    errorRates.length > 0
      ? errorRates.reduce((a, b) => a + b, 0) / errorRates.length
      : 0.5;
  const errorScore = Math.min(10, (1 - avgErrorRate) * 10);

  const total = fpScore + vocabScore + streakScore + missionScore + errorScore;
  return Math.round(Math.min(100, Math.max(0, total)));
}

export function getLevelFromScore(score: number, levelNames: string[]): string {
  if (score < 20) return levelNames[0] || "Beginner";
  if (score < 40) return levelNames[1] || "Basic";
  if (score < 60) return levelNames[2] || "Intermediate";
  if (score < 80) return levelNames[3] || "Advanced";
  return levelNames[4] || "Fluent";
}

export function getFPForMessage(fluencyScore: number, isCorrect: boolean): number {
  const base = isCorrect ? 10 : 2;
  const multiplier = 1 + fluencyScore / 100;
  return Math.round(base * multiplier);
}

export function getAdaptiveDifficulty(fluencyScore: number): "beginner" | "intermediate" | "advanced" {
  if (fluencyScore < 35) return "beginner";
  if (fluencyScore < 70) return "intermediate";
  return "advanced";
}
