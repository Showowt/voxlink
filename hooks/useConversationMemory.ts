"use client";

import { useState, useCallback } from "react";

const FEATURE_CONVERSATION_MEMORY = true;
const STORAGE_KEY = "entrevoz_conversation_memory";
const MAX_MEMORIES = 50;

interface ConversationMemory {
  partnerId: string; // room code + partner name hash
  partnerName: string;
  lastSeen: string;
  totalCalls: number;
  totalMinutes: number;
  languages: string[];
  keyTopics: string[];
  lastMessages: { text: string; speaker: string }[];
}

function getMemories(): ConversationMemory[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveMemories(memories: ConversationMemory[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(memories.slice(0, MAX_MEMORIES)));
}

function hashId(name: string, lang: string): string {
  return `${name.toLowerCase().trim()}_${lang}`;
}

export interface UseConversationMemoryReturn {
  memory: ConversationMemory | null;
  allMemories: ConversationMemory[];
  loadMemory: (partnerName: string, lang: string) => ConversationMemory | null;
  saveCallMemory: (params: {
    partnerName: string;
    lang: string;
    duration: number;
    languages: string[];
    messages: { text: string; speaker: string }[];
  }) => void;
  getContext: () => string;
}

export function useConversationMemory(): UseConversationMemoryReturn {
  const [memory, setMemory] = useState<ConversationMemory | null>(null);
  const [allMemories] = useState<ConversationMemory[]>(() => getMemories());

  const loadMemory = useCallback((partnerName: string, lang: string): ConversationMemory | null => {
    if (!FEATURE_CONVERSATION_MEMORY) return null;

    const id = hashId(partnerName, lang);
    const memories = getMemories();
    const found = memories.find((m) => m.partnerId === id);

    if (found) {
      setMemory(found);
      return found;
    }
    return null;
  }, []);

  const saveCallMemory = useCallback((params: {
    partnerName: string;
    lang: string;
    duration: number;
    languages: string[];
    messages: { text: string; speaker: string }[];
  }) => {
    if (!FEATURE_CONVERSATION_MEMORY) return;

    const { partnerName, lang, duration, languages, messages } = params;
    const id = hashId(partnerName, lang);
    const memories = getMemories();
    const existing = memories.find((m) => m.partnerId === id);

    // Extract key topics (longer messages from partner)
    const topics = messages
      .filter((m) => m.speaker === "partner" && m.text.length > 20)
      .slice(-5)
      .map((m) => m.text.slice(0, 80));

    if (existing) {
      existing.lastSeen = new Date().toISOString();
      existing.totalCalls++;
      existing.totalMinutes += Math.round(duration / 60);
      existing.languages = Array.from(new Set([...existing.languages, ...languages]));
      existing.keyTopics = [...topics, ...existing.keyTopics].slice(0, 10);
      existing.lastMessages = messages.slice(-10).map((m) => ({
        text: m.text.slice(0, 100),
        speaker: m.speaker,
      }));
    } else {
      memories.unshift({
        partnerId: id,
        partnerName,
        lastSeen: new Date().toISOString(),
        totalCalls: 1,
        totalMinutes: Math.round(duration / 60),
        languages,
        keyTopics: topics,
        lastMessages: messages.slice(-10).map((m) => ({
          text: m.text.slice(0, 100),
          speaker: m.speaker,
        })),
      });
    }

    saveMemories(memories);
    setMemory(memories.find((m) => m.partnerId === id) || null);
  }, []);

  const getContext = useCallback((): string => {
    if (!memory) return "";
    return `Returning partner: ${memory.partnerName}. ${memory.totalCalls} previous calls (${memory.totalMinutes} min total). Last spoke: ${memory.lastSeen}. Topics: ${memory.keyTopics.slice(0, 3).join(", ")}`;
  }, [memory]);

  return { memory, allMemories, loadMemory, saveCallMemory, getContext };
}

export default useConversationMemory;
