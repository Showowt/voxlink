'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'es', name: 'Spanish', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'fr', name: 'French', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'de', name: 'German', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'it', name: 'Italian', flag: '\u{1F1EE}\u{1F1F9}' },
  { code: 'pt', name: 'Portuguese', flag: '\u{1F1E7}\u{1F1F7}' },
  { code: 'zh', name: 'Mandarin', flag: '\u{1F1E8}\u{1F1F3}' },
  { code: 'ja', name: 'Japanese', flag: '\u{1F1EF}\u{1F1F5}' },
  { code: 'ko', name: 'Korean', flag: '\u{1F1F0}\u{1F1F7}' },
  { code: 'ar', name: 'Arabic', flag: '\u{1F1F8}\u{1F1E6}' },
  { code: 'ru', name: 'Russian', flag: '\u{1F1F7}\u{1F1FA}' },
  { code: 'hi', name: 'Hindi', flag: '\u{1F1EE}\u{1F1F3}' },
  { code: 'lt', name: 'Lithuanian', flag: '\u{1F1F1}\u{1F1F9}' },
];

function getDeviceId(): string {
  try {
    const stored = localStorage.getItem('entrevoz_device_id');
    if (stored) return stored;
    const id = crypto.randomUUID();
    localStorage.setItem('entrevoz_device_id', id);
    return id;
  } catch {
    return `device-${Date.now()}`;
  }
}

export default function GroupLandingPage() {
  const router = useRouter();
  const [callType, setCallType] = useState<'video' | 'audio'>('video');
  const [myLanguage, setMyLanguage] = useState('en');
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setIsCreating(true);
    setError('');
    try {
      const res = await fetch('/api/group/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callType, deviceId: getDeviceId() }),
      });
      if (!res.ok) throw new Error('Failed to create room');
      const { roomCode } = await res.json();
      router.push(`/group/${roomCode}?type=${callType}&lang=${myLanguage}`);
    } catch {
      setError('Could not create room. Try again.');
      setIsCreating(false);
    }
  };

  const handleJoin = () => {
    const code = joinCode.trim().toUpperCase();
    if (code.length !== 6) { setError('Enter a 6-character room code'); return; }
    setIsJoining(true);
    router.push(`/group/${code}?lang=${myLanguage}`);
  };

  return (
    <div className="min-h-[100dvh] bg-[#06060a] flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md">

        {/* Back button */}
        <button
          onClick={() => router.push('/')}
          className="mb-4 text-white/40 hover:text-white/70 flex items-center gap-1.5 text-sm transition-colors min-h-[44px]"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-[#00C896]/10 border border-[#00C896]/20 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#00C896] text-xs font-medium tracking-widest uppercase">Group Call</span>
          </div>
          <h1 className="text-white text-3xl font-semibold mb-2">Everyone understood.</h1>
          <p className="text-white/40 text-sm">Up to 4 people · Every language · Real-time translation</p>
        </div>

        {/* Create card */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 mb-4 backdrop-blur-sm">
          <div className="text-white/60 text-xs font-medium uppercase tracking-wide mb-4">Start a new call</div>

          {/* Call type */}
          <div className="flex gap-2 mb-4">
            {(['video', 'audio'] as const).map(ct => (
              <button
                key={ct}
                onClick={() => setCallType(ct)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  callType === ct
                    ? 'bg-[#00C896] text-[#06060a]'
                    : 'bg-white/10 text-white/60 hover:bg-white/15'
                }`}
              >
                {ct === 'video' ? 'Video' : 'Audio Only'}
              </button>
            ))}
          </div>

          {/* Language */}
          <div className="mb-4">
            <div className="text-white/40 text-xs mb-2">Your language</div>
            <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
              {LANGUAGES.map(l => (
                <button
                  key={l.code}
                  onClick={() => setMyLanguage(l.code)}
                  className={`py-2 rounded-lg text-xs flex flex-col items-center gap-0.5 transition-all ${
                    myLanguage === l.code
                      ? 'bg-[#00C896]/20 border border-[#00C896]/40 text-[#00C896]'
                      : 'bg-white/5 border border-transparent text-white/50 hover:bg-white/10'
                  }`}
                >
                  <span className="text-base leading-none">{l.flag}</span>
                  <span className="truncate w-full text-center leading-tight">{l.name.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={isCreating}
            className="w-full py-3.5 bg-[#00C896] text-[#06060a] font-semibold rounded-xl hover:bg-[#00b886] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isCreating ? 'Creating...' : 'Create Group Call'}
          </button>
        </div>

        {/* Join card */}
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-sm">
          <div className="text-white/60 text-xs font-medium uppercase tracking-wide mb-4">Join with a code</div>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={e => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="ABC123"
              maxLength={6}
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white font-mono text-lg tracking-widest text-center placeholder-white/20 focus:outline-none focus:border-[#00C896] uppercase"
            />
            <button
              onClick={handleJoin}
              disabled={isJoining || joinCode.trim().length !== 6}
              className="px-5 py-3 bg-white/15 text-white rounded-xl font-medium disabled:opacity-40 hover:bg-white/20 transition-colors"
            >
              Join
            </button>
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center mt-3">{error}</p>
        )}

        <p className="text-white/20 text-xs text-center mt-6">
          No account needed · Works in any browser · Invite anyone via link
        </p>
      </div>
    </div>
  );
}
