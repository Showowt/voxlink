// Error Pattern Tracking

export function updateErrorPattern(
  currentPattern: {
    totalOccurrences: number;
    errorCount: number;
    correctCount: number;
    errorRate: number;
    recentResults: boolean[];
    trend: "improving" | "declining" | "stable";
  },
  wasCorrect: boolean,
) {
  const newTotal = currentPattern.totalOccurrences + 1;
  const newErrors = currentPattern.errorCount + (wasCorrect ? 0 : 1);
  const newCorrect = currentPattern.correctCount + (wasCorrect ? 1 : 0);
  const newErrorRate = newErrors / newTotal;

  const newRecent = [...currentPattern.recentResults, wasCorrect].slice(-10);

  let trend: "improving" | "declining" | "stable" = "stable";
  if (newRecent.length >= 6) {
    const half = Math.floor(newRecent.length / 2);
    const firstHalfErrors = newRecent.slice(0, half).filter((r) => !r).length / half;
    const secondHalfErrors =
      newRecent.slice(half).filter((r) => !r).length / (newRecent.length - half);
    if (secondHalfErrors < firstHalfErrors - 0.15) trend = "improving";
    else if (secondHalfErrors > firstHalfErrors + 0.15) trend = "declining";
  }

  return {
    totalOccurrences: newTotal,
    errorCount: newErrors,
    correctCount: newCorrect,
    errorRate: Math.round(newErrorRate * 100) / 100,
    recentResults: newRecent,
    trend,
  };
}
