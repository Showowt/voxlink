// SM-2 Spaced Repetition Algorithm
// Source: https://www.supermemo.com/en/archives1990-2015/english/ol/sm2

export interface SM2Input {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  quality: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface SM2Output {
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewDate: string;
}

export function calculateSM2(input: SM2Input): SM2Output {
  const { quality, easeFactor: ef, intervalDays: interval, repetitions } = input;

  let newEF = ef;
  let newInterval = interval;
  let newRepetitions = repetitions;

  if (quality >= 3) {
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * ef);
    }
    newRepetitions = repetitions + 1;
  } else {
    newInterval = 1;
    newRepetitions = 0;
  }

  newEF = ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  newEF = Math.max(1.3, newEF);
  newInterval = Math.min(365, newInterval);

  const nextDate = new Date();
  nextDate.setDate(nextDate.getDate() + newInterval);

  return {
    easeFactor: Math.round(newEF * 100) / 100,
    intervalDays: newInterval,
    repetitions: newRepetitions,
    nextReviewDate: nextDate.toISOString().split("T")[0],
  };
}

export function getDueCards<T extends { nextReviewDate: string }>(cards: T[]): T[] {
  const today = new Date().toISOString().split("T")[0];
  return cards.filter((card) => card.nextReviewDate <= today);
}

export function getInitialCard(): Pick<SM2Input, "easeFactor" | "intervalDays" | "repetitions"> {
  return { easeFactor: 2.5, intervalDays: 1, repetitions: 0 };
}
