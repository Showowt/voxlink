#!/bin/bash

# Add focus-visible classes to all interactive elements in wingman page

FILE="app/wingman/page.tsx"

# SuggestionCard button (line ~173)
perl -i -pe 's/(className=\[\n\s+)"w-full text-left rounded-2xl border p-4 transition-all duration-200 group",\n(\s+)"active:scale-\[0\.98\] hover:scale-\[1\.01\]",/$1"w-full text-left rounded-2xl border p-4 transition-all duration-200 group",\n$2"active:scale-[0.98] hover:scale-[1.01]",\n$2"focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-voxxo-400",/' "$FILE"

# Back button in setup screen (line ~308)
perl -i -pe 's/className="text-white\/70 hover:text-white\/80 transition-colors min-h-\[44px\] min-w-\[44px\] flex items-center justify-center"/className="text-white\/70 hover:text-white\/80 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-voxxo-400"/' "$FILE"

# Situation Mode buttons (line ~333)
perl -i -pe 's/(className=\[\n\s+)"rounded-2xl border p-4 text-left transition-all duration-200 min-h-\[56px\]",/$1"rounded-2xl border p-4 text-left transition-all duration-200 min-h-[56px]",\n                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-voxxo-400",/' "$FILE"

# Output Mode buttons (line ~358)
perl -i -pe 's/(className=\[\n\s+)"rounded-xl border p-3\.5 flex items-center gap-3 transition-all min-h-\[56px\]",/$1"rounded-xl border p-3.5 flex items-center gap-3 transition-all min-h-[56px]",\n                    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-voxxo-400",/' "$FILE"

# Language selects (lines ~388, ~402)
perl -i -pe 's/className="w-full bg-white\/\[0\.05\] border border-white\/10 rounded-xl px-3 py-2\.5 text-sm text-white outline-none focus:border-white\/25"/className="w-full bg-white\/[0.05] border border-white\/10 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-white\/25 focus-visible:ring-2 focus-visible:ring-voxxo-400 focus-visible:ring-offset-2"/' "$FILE"

# TTS toggle button in setup (line ~418)
perl -i -pe 's/(onClick=\{\(\) => setTtsEnabled\(!ttsEnabled\)\}\n\s+className=\[\n\s+)"w-full flex items-center justify-between p-4 rounded-xl border transition-all",/$1"w-full flex items-center justify-between p-4 rounded-xl border transition-all",\n                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-voxxo-400",/' "$FILE"

# Activate Wingman button (line ~453)
perl -i -pe 's/className="w-full bg-white text-black font-bold py-4 rounded-2xl text-base tracking-tight hover:bg-white\/90 active:bg-white\/80 transition-all"/className="w-full bg-white text-black font-bold py-4 rounded-2xl text-base tracking-tight hover:bg-white\/90 active:bg-white\/80 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-voxxo-400"/' "$FILE"

# Setup button in active session (line ~492)
perl -i -pe 's/className="text-white\/70 hover:text-white\/90 text-sm transition-colors"/className="text-white\/70 hover:text-white\/90 text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-voxxo-400"/g' "$FILE"

# Pause/Resume button (line ~519)
perl -i -pe 's/className="text-white\/60 hover:text-white text-xs border border-white\/15 rounded-lg px-3 py-1\.5 transition-all"/className="text-white\/60 hover:text-white text-xs border border-white\/15 rounded-lg px-3 py-1.5 transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-voxxo-400"/' "$FILE"

# Text input (line ~701)
perl -i -pe 's/className="flex-1 bg-white\/\[0\.06\] border border-white\/\[0\.12\] rounded-xl px-4 py-3 text-sm text-white placeholder-white\/70 outline-none focus:border-white\/25 transition-colors"/className="flex-1 bg-white\/[0.06] border border-white\/[0.12] rounded-xl px-4 py-3 text-sm text-white placeholder-white\/70 outline-none focus:border-white\/25 transition-colors focus-visible:ring-2 focus-visible:ring-voxxo-400 focus-visible:ring-offset-2"/' "$FILE"

# Submit button (line ~707)
perl -i -pe 's/className="bg-white text-black font-bold px-4 rounded-xl text-sm disabled:opacity-30 transition-all active:scale-95"/className="bg-white text-black font-bold px-4 rounded-xl text-sm disabled:opacity-30 transition-all active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-voxxo-400"/' "$FILE"

# Noise monitor and TTS toggles at bottom (lines ~727, ~743)
perl -i -pe 's/(className=\[\n\s+)"flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all",/$1"flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all",\n                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-voxxo-400",/' "$FILE"

echo "Focus states added successfully!"
