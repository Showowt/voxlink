"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getLanguageConfig } from "@/app/lib/language-os/engine";
import { getDeviceId } from "@/app/lib/language-os/device-id";
import { getLevelFromScore } from "@/app/lib/language-os/algorithms/fluency";
import { LangTTS } from "@/app/lib/language-os/tts";
import type { CorrectionResult, Persona, UserProgress, DEFAULT_PROGRESS } from "@/app/lib/language-os/types";

interface SessionMessage {
  role: "user" | "assistant";
  content: string;
  correction?: CorrectionResult;
  translation?: string;
  timestamp: string;
}

type Tab = "talk" | "patterns" | "missions" | "vocab" | "progress";

export default function LanguageOSLangPage() {
  const params = useParams();
  const router = useRouter();
  const lang = params.lang as string;

  const config = getLanguageConfig(lang);

  // Redirect if invalid language
  useEffect(() => {
    if (!config) {
      router.replace("/language-os");
    }
  }, [config, router]);

  if (!config) return null;

  return <LanguageOSApp config={config} langCode={lang} />;
}

function LanguageOSApp({ config, langCode }: { config: NonNullable<ReturnType<typeof getLanguageConfig>>; langCode: string }) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("talk");
  const [activePersona, setActivePersona] = useState<Persona>(config.personas[0]);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [showTranslations, setShowTranslations] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const ttsRef = useRef<LangTTS | null>(null);
  const userId = useRef<string>("");

  // Initialize
  useEffect(() => {
    userId.current = getDeviceId();
    ttsRef.current = new LangTTS(config.targetLocale);

    // Load progress
    fetch(`/api/language-os/progress?userId=${userId.current}&languagePair=${langCode}`)
      .then((r) => r.json())
      .then((data) => setProgress(data))
      .catch(() => {});

    return () => {
      ttsRef.current?.stop();
    };
  }, [config.targetLocale, langCode]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isThinking) return;

    setInputText("");
    setIsThinking(true);

    const userMsg: SessionMessage = {
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const res = await fetch("/api/language-os/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          personaId: activePersona.id,
          languagePair: langCode,
          userId: userId.current,
          fluencyScore: progress?.fluencyScore || 0,
          weakPatterns: Object.entries(progress?.errorPatterns || {})
            .filter(([, rate]) => rate > 0.5)
            .slice(0, 3)
            .map(([id]) => id),
          sessionId,
          getCorrectionFor: text,
          includeTranslation: showTranslations,
        }),
      });

      const data = await res.json();

      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      const assistantMsg: SessionMessage = {
        role: "assistant",
        content: data.reply || "...",
        correction: data.correction,
        translation: data.translation,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      // Update progress locally
      if (data.fpEarned && progress) {
        setProgress({
          ...progress,
          fluencyPoints: progress.fluencyPoints + data.fpEarned,
          messagesSent: progress.messagesSent + 1,
          correctionsReceived: progress.correctionsReceived + (data.correction && !data.correction.isCorrect ? 1 : 0),
        });
      }

      // Async progress sync (fire and forget)
      fetch("/api/language-os/progress", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: userId.current,
          languagePair: langCode,
          delta: {
            fluencyPoints: data.fpEarned || 0,
            messagesSent: 1,
            correctionsReceived: data.correction && !data.correction.isCorrect ? 1 : 0,
          },
        }),
      }).catch(() => {});
    } catch (err) {
      console.error("[LangOS]", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: activePersona.fallbackResponses[Math.floor(Math.random() * activePersona.fallbackResponses.length)],
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  }, [inputText, isThinking, messages, activePersona, langCode, progress, sessionId, showTranslations]);

  const speakText = (text: string) => {
    ttsRef.current?.speak(text);
  };

  const startNewConversation = (persona: Persona) => {
    setActivePersona(persona);
    setMessages([]);
    setSessionId(null);
    setActiveTab("talk");
  };

  const level = progress ? getLevelFromScore(progress.fluencyScore, config.ui.levelNames) : config.ui.levelNames[0];

  return (
    <div className="min-h-screen bg-[#06060a] flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <button onClick={() => router.push("/language-os")} className="text-white/50 hover:text-white/80 p-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center">
          <span className="text-white text-sm font-semibold">{config.flag} {config.displayName}</span>
          <p className="text-[#00C896] text-[10px]">{level} — {progress?.fluencyScore || 0}%</p>
        </div>
        <button
          onClick={() => setShowTranslations(!showTranslations)}
          className={`p-2 text-xs ${showTranslations ? "text-[#00C896]" : "text-white/30"}`}
        >
          EN
        </button>
      </header>

      {/* Tab bar */}
      <nav className="flex border-b border-white/5 overflow-x-auto">
        {(["talk", "patterns", "missions", "vocab", "progress"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 min-w-[60px] py-2.5 text-[10px] font-bold tracking-wider uppercase transition-colors ${
              activeTab === tab ? "text-[#00C896] border-b-2 border-[#00C896]" : "text-white/30"
            }`}
          >
            {config.ui[`tab${tab.charAt(0).toUpperCase() + tab.slice(1)}` as keyof typeof config.ui] as string}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {activeTab === "talk" && (
          <div className="flex-1 flex flex-col">
            {/* Persona selector */}
            <div className="flex gap-2 p-3 overflow-x-auto border-b border-white/5">
              {config.personas.map((p) => (
                <button
                  key={p.id}
                  onClick={() => startNewConversation(p)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs whitespace-nowrap transition-all ${
                    activePersona.id === p.id
                      ? "border text-white"
                      : "bg-white/5 text-white/50 border border-transparent"
                  }`}
                  style={{
                    background: activePersona.id === p.id ? `${p.accentColor}15` : undefined,
                    borderColor: activePersona.id === p.id ? `${p.accentColor}50` : undefined,
                  }}
                >
                  <span>{p.avatar}</span>
                  <span>{p.name}</span>
                </button>
              ))}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 && (
                <div className="text-center py-12">
                  <span className="text-4xl">{activePersona.avatar}</span>
                  <p className="text-white/70 text-sm mt-3 font-medium">{activePersona.name}</p>
                  <p className="text-white/30 text-xs mt-1">{activePersona.role}</p>
                  <p className="text-white/20 text-xs mt-1 italic">{activePersona.setting}</p>
                  <div className="flex flex-wrap gap-2 justify-center mt-6">
                    {(config.quickPhrases[activePersona.id] || []).map((phrase, i) => (
                      <button
                        key={i}
                        onClick={() => { setInputText(phrase); inputRef.current?.focus(); }}
                        className="px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-white/60 text-xs hover:text-white/90 transition-colors"
                      >
                        {phrase}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] ${msg.role === "user" ? "order-1" : ""}`}>
                    {/* Correction badge */}
                    {msg.correction && !msg.correction.isCorrect && (
                      <div className="mb-1.5 p-2 rounded-lg text-xs" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <p className="text-red-300/80 line-through">{msg.correction.original}</p>
                        <p className="text-[#00C896] font-medium mt-0.5">{msg.correction.corrected}</p>
                        <p className="text-white/40 mt-1 text-[10px]">{msg.correction.explanation}</p>
                      </div>
                    )}
                    {msg.correction?.isCorrect && msg.correction.vibeCheck && (
                      <div className="mb-1 text-[10px] text-[#00C896]/70">{msg.correction.vibeCheck}</div>
                    )}

                    {/* Message bubble */}
                    <div
                      className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "bg-[#00C896]/15 text-white border border-[#00C896]/20"
                          : "bg-white/5 text-white/90 border border-white/8"
                      }`}
                    >
                      <p>{msg.content}</p>
                      {msg.translation && showTranslations && (
                        <p className="text-white/30 text-xs mt-1.5 italic">{msg.translation}</p>
                      )}
                    </div>

                    {/* TTS button for assistant messages */}
                    {msg.role === "assistant" && (
                      <button
                        onClick={() => speakText(msg.content)}
                        className="mt-1 text-white/20 hover:text-white/50 text-xs transition-colors"
                      >
                        🔊
                      </button>
                    )}

                    {/* Fluency score */}
                    {msg.correction && (
                      <div className="mt-1 flex items-center gap-1">
                        <div className="h-1 w-16 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(msg.correction.fluencyScore / 10) * 100}%`,
                              background: msg.correction.fluencyScore >= 7 ? "#00C896" : msg.correction.fluencyScore >= 4 ? "#f59e0b" : "#ef4444",
                            }}
                          />
                        </div>
                        <span className="text-[10px] text-white/30">{msg.correction.fluencyScore}/10</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isThinking && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 bg-white/5 rounded-2xl border border-white/8">
                    <div className="flex gap-1">
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="w-2 h-2 rounded-full bg-white/30 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-white/5">
              <div className="flex gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendMessage(); }}
                  placeholder={config.ui.startPrompt}
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 outline-none focus:border-[#00C896]/40 transition-colors"
                  disabled={isThinking}
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputText.trim() || isThinking}
                  className="px-4 py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-30"
                  style={{
                    background: inputText.trim() ? "rgba(0,200,150,0.15)" : "rgba(255,255,255,0.05)",
                    border: inputText.trim() ? "1px solid rgba(0,200,150,0.3)" : "1px solid rgba(255,255,255,0.08)",
                    color: "#00C896",
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "patterns" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {config.grammarPatterns.map((pattern) => (
              <div key={pattern.id} className="p-4 bg-white/[0.03] border border-white/8 rounded-xl">
                <h3 className="text-white font-semibold text-sm">{pattern.title}</h3>
                <p className="text-[#00C896] text-xs font-mono mt-1">{pattern.formula}</p>
                <p className="text-white/40 text-xs mt-2">{pattern.shortExplanation}</p>
                {progress?.errorPatterns[pattern.id] !== undefined && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="h-1.5 flex-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(1 - (progress.errorPatterns[pattern.id] || 0)) * 100}%`,
                          background: (progress.errorPatterns[pattern.id] || 0) < 0.3 ? "#00C896" : "#f59e0b",
                        }}
                      />
                    </div>
                    <span className="text-[10px] text-white/30">
                      {Math.round((1 - (progress.errorPatterns[pattern.id] || 0)) * 100)}%
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {activeTab === "missions" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {config.missions.map((mission) => {
              const isCompleted = progress?.completedMissions.includes(mission.id);
              return (
                <button
                  key={mission.id}
                  onClick={() => {
                    const persona = config.personas.find((p) => p.id === mission.linkedPersonaId);
                    if (persona) startNewConversation(persona);
                  }}
                  className="w-full text-left p-4 bg-white/[0.03] border border-white/8 rounded-xl transition-all hover:border-white/15"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-white font-semibold text-sm">{mission.title}</h3>
                      <p className="text-white/40 text-xs mt-1">{mission.description}</p>
                    </div>
                    {isCompleted && <span className="text-[#00C896] text-sm">✓</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-[10px] text-white/30">
                    <span>Week {mission.week}</span>
                    <span>~{mission.estimatedMinutes} min</span>
                    <span>{"★".repeat(mission.difficulty)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === "vocab" && (
          <div className="flex-1 overflow-y-auto p-4">
            {(!progress || progress.vocabBank.length === 0) ? (
              <div className="text-center py-12">
                <p className="text-white/30 text-sm">No vocabulary yet. Start a conversation!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {progress.vocabBank.slice(0, 50).map((word, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-white/[0.03] border border-white/8 rounded-xl">
                    <div>
                      <p className="text-white text-sm font-medium">{word.word}</p>
                      <p className="text-[#00C896] text-xs">{word.translation}</p>
                    </div>
                    <button onClick={() => speakText(word.word)} className="text-white/20 hover:text-white/50 p-2">
                      🔊
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "progress" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Fluency ring */}
            <div className="flex flex-col items-center py-6">
              <div className="relative w-32 h-32">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-white/10"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                  />
                  <path
                    className="text-[#00C896]"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray={`${progress?.fluencyScore || 0}, 100`}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-white text-2xl font-bold">{progress?.fluencyScore || 0}</span>
                  <span className="text-white/40 text-[10px]">{level}</span>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Streak" value={`${progress?.streakDays || 0} days`} />
              <StatCard label="Words" value={String(progress?.wordsLearned || 0)} />
              <StatCard label="Messages" value={String(progress?.messagesSent || 0)} />
              <StatCard label="Missions" value={`${progress?.missionsCompleted || 0}/${config.missions.length}`} />
              <StatCard label="Real Calls" value={String(progress?.realConversations || 0)} />
              <StatCard label="FP Total" value={String(progress?.fluencyPoints || 0)} />
            </div>

            {/* Link to Entrevoz */}
            <button
              onClick={() => router.push("/")}
              className="w-full p-4 rounded-xl text-center transition-all"
              style={{
                background: "rgba(0,200,150,0.05)",
                border: "1px solid rgba(0,200,150,0.15)",
              }}
            >
              <p className="text-[#00C896] text-sm font-medium">Ready for a real conversation?</p>
              <p className="text-white/30 text-xs mt-1">Start a call on Entrevoz</p>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 bg-white/[0.03] border border-white/8 rounded-xl text-center">
      <p className="text-white font-semibold text-lg">{value}</p>
      <p className="text-white/30 text-[10px] uppercase tracking-wider">{label}</p>
    </div>
  );
}
