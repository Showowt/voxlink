// ═══════════════════════════════════════════════════════════════
// LANGUAGE OS — CORE TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════

export interface LanguageConfig {
  code: string;
  sourceLanguage: string;
  targetLanguage: string;
  targetRegion: string;
  targetLocale: string;
  displayName: string;
  nativeName: string;
  flag: string;
  available: boolean;

  ui: {
    tabTalk: string;
    tabPatterns: string;
    tabMissions: string;
    tabVocab: string;
    tabProgress: string;
    levelNames: string[];
    startPrompt: string;
    correctLabel: string;
    errorLabel: string;
    readyMessage: string;
  };

  personas: Persona[];
  grammarPatterns: GrammarPattern[];
  missions: Mission[];
  quickPhrases: Record<string, string[]>;
  culturalNotes: CulturalNote[];
  emergencyPhrases: EmergencyPhrase[];
}

export interface Persona {
  id: string;
  name: string;
  age: number;
  role: string;
  setting: string;
  personality: string;
  systemPrompt: string;
  accentColor: string;
  avatar: string;
  difficulty: 1 | 2 | 3;
  tags: string[];
  fallbackResponses: string[];
  difficultyModifiers: {
    beginner: string;
    intermediate: string;
    advanced: string;
  };
}

export interface GrammarPattern {
  id: string;
  title: string;
  formula: string;
  shortExplanation: string;
  fullExplanation: string;
  examples: GrammarExample[];
  drillPrompt: string;
  commonErrors: string[];
  linkedPersonaIds: string[];
  difficulty: 1 | 2 | 3;
}

export interface GrammarExample {
  target: string;
  source: string;
  isCorrect: boolean;
  explanation: string;
  audioText: string;
}

export interface Mission {
  id: string;
  week: 1 | 2 | 3 | 4;
  title: string;
  description: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  estimatedMinutes: number;
  keyPhrases: KeyPhrase[];
  linkedPersonaId: string;
  successCriteria: string;
  culturalContext: string;
}

export interface KeyPhrase {
  phrase: string;
  translation: string;
  phonetic: string;
  audioText: string;
}

export interface CulturalNote {
  id: string;
  trigger: string;
  tip: string;
  category: "time" | "food" | "etiquette" | "relationship" | "money" | "social";
  urgency: "now" | "soon";
  contexts: string[];
}

export interface EmergencyPhrase {
  id: string;
  category: "emergency" | "medical" | "safety" | "transport" | "food" | "hotel" | "social" | "money";
  source: string;
  target: string;
  phonetic: string;
  audioText: string;
  urgencyLevel: 1 | 2 | 3;
}

// ═══════════════════════════════════════════════════════════════
// STATE TYPES
// ═══════════════════════════════════════════════════════════════

export interface UserProgress {
  userId: string;
  languagePair: string;
  fluencyScore: number;
  fluencyPoints: number;
  streakDays: number;
  lastActiveDate: string;
  messagesSent: number;
  correctionsReceived: number;
  conversationsStarted: number;
  missionsCompleted: number;
  wordsLearned: number;
  errorPatterns: Record<string, number>;
  vocabBank: VocabWord[];
  completedMissions: string[];
  weeklyStats: WeeklyStats[];
  realConversations: number;
  realVocabImports: number;
}

export interface VocabWord {
  word: string;
  translation: string;
  language: string;
  phonetic: string;
  learnedAt: string;
  nextReview: string;
  intervalDays: number;
  easeFactor: number;
  repetitions: number;
  cardId?: string;
}

export interface WeeklyStats {
  week: string;
  messages: number;
  words: number;
  fp: number;
  conversations: number;
  corrections: number;
}

export interface SRSCard {
  id: string;
  front: string;
  back: string;
  phonetic?: string;
  exampleSentence?: string;
  audioText: string;
  cardType: "vocab" | "phrase" | "grammar" | "pattern";
  source: "conversation" | "pattern" | "mission" | "manual";
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReviewDate: string;
  lastReviewedAt?: string;
  totalReviews: number;
  correctReviews: number;
}

export interface SRSReviewResult {
  cardId: string;
  quality: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface CorrectionResult {
  original: string;
  corrected: string;
  isCorrect: boolean;
  explanation: string;
  patternId: string | null;
  patternName: string | null;
  fluencyScore: number;
  flowConnector: string | null;
  vibeCheck: string | null;
}

export interface WeeklyReport {
  weekIdentifier: string;
  summary: string;
  stats: WeeklyStats;
  biggestWeakness: { patternId: string; errorRate: number; name: string } | null;
  biggestWin: { patternId: string; improvement: number; name: string } | null;
  fluencyDelta: number;
  nextWeekFocus: string;
  recommendedMissions: string[];
  levelUp: boolean;
}

// ═══════════════════════════════════════════════════════════════
// API CONTRACT TYPES
// ═══════════════════════════════════════════════════════════════

export interface ChatAPIRequest {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  personaId: string;
  languagePair: string;
  userId: string;
  fluencyScore: number;
  weakPatterns: string[];
  sessionId?: string;
  getCorrectionFor?: string;
  includeTranslation?: boolean;
}

export interface ChatAPIResponse {
  reply: string;
  translation?: string;
  correction?: CorrectionResult;
  grammarPatternId?: string;
  vocabWords?: string[];
  fpEarned: number;
  sessionId: string;
  error?: string;
}

export interface SummaryAPIRequest {
  sessionId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    correction?: CorrectionResult;
    timestamp: string;
  }>;
  languagePair: string;
  durationSeconds: number;
  avgFluencyScore: number;
}

export interface SummaryAPIResponse {
  overview: string;
  keyPhrases: Array<{ phrase: string; translation: string; language: string; phonetic: string }>;
  grammarPatternsPracticed: string[];
  mood: "warm" | "professional" | "tense" | "playful";
  followUps: string[];
  srsCardsCreated: number;
  error?: string;
}

export const DEFAULT_PROGRESS: UserProgress = {
  userId: "",
  languagePair: "",
  fluencyScore: 0,
  fluencyPoints: 0,
  streakDays: 0,
  lastActiveDate: new Date().toISOString().split("T")[0],
  messagesSent: 0,
  correctionsReceived: 0,
  conversationsStarted: 0,
  missionsCompleted: 0,
  wordsLearned: 0,
  errorPatterns: {},
  vocabBank: [],
  completedMissions: [],
  weeklyStats: [],
  realConversations: 0,
  realVocabImports: 0,
};
