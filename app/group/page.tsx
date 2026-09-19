'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LANGUAGE_MAP, getLanguage } from '../lib/languages';
import { getDeviceId } from '../lib/language-os/device-id';
import LanguagePick from '../components/LanguagePick';

// The app-wide language the user already chose (entrevoz_lang), else the
// first supported browser language — defaulting everyone to English made
// Spanish speakers create calls whose captions ran in English.
function savedOrBrowserLanguage(): string {
  try {
    const saved = localStorage.getItem('entrevoz_lang') ?? '';
    if (LANGUAGE_MAP[saved]) return saved;
  } catch {
    /* storage blocked */
  }
  const list = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of list) {
    const base = (raw || '').toLowerCase().split('-')[0];
    const code = base === 'fil' ? 'tl' : base === 'nb' || base === 'nn' ? 'no' : base === 'iw' ? 'he' : base === 'in' ? 'id' : base;
    if (LANGUAGE_MAP[code]) return code;
  }
  return 'en';
}


export default function GroupLandingPage() {
  const router = useRouter();
  const [callType, setCallType] = useState<'video' | 'audio'>('video');
  const [myLanguage, setMyLanguage] = useState('en');
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');

  // After mount (not during render) so server and client markup agree
  useEffect(() => {
    setMyLanguage(savedOrBrowserLanguage());
  }, []);

  const pickLanguage = (code: string) => {
    if (!LANGUAGE_MAP[code]) return;
    setMyLanguage(code);
    try { localStorage.setItem('entrevoz_lang', code); } catch { /* storage blocked */ }
  };

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
    <div className="min-h-[100dvh] bg-[#06060a] flex items-center justify-center p-4 overflow-y-auto overscroll-contain safe-top safe-bottom" style={{ WebkitOverflowScrolling: 'touch' }}>
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
            <div className="text-white/40 text-xs mb-2">I speak / Hablo</div>
            <LanguagePick value={myLanguage} onChange={pickLanguage} accent="#00C896" />
            <p className="text-white/35 text-[11px] mt-2">
              {getLanguage(myLanguage).flag} {getLanguage(myLanguage).nativeName} — everyone else is translated into it for you
            </p>
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
