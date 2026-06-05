'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useGroupCall } from '@/hooks/useGroupCall';
import type { SlotIndex } from '@/app/lib/group-call/types';

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
  } catch { return `device-${Date.now()}`; }
}

function getBrowserLanguage(): string {
  const lang = navigator.language?.split('-')[0] ?? 'en';
  const supported = ['en','es','fr','de','it','pt','zh','ja','ko','ar','ru','hi','lt'];
  return supported.includes(lang) ? lang : 'en';
}

function QualityBars({ q }: { q: 1|2|3|4 }) {
  const color = q >= 3 ? '#00C896' : q === 2 ? '#EF9F27' : '#E24B4A';
  return (
    <div className="flex items-end gap-0.5 h-3">
      {[1,2,3,4].map(i => (
        <div key={i} style={{ height: `${i * 25}%`, background: i <= q ? color : 'rgba(255,255,255,0.15)', width: 3, borderRadius: 1 }} />
      ))}
    </div>
  );
}

export default function GroupCallPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const roomCode = typeof params.id === 'string' ? params.id.toUpperCase() : '';
  const callType = searchParams.get('type') === 'audio' ? 'audio' as const : 'video' as const;
  const urlLang = searchParams.get('lang') ?? '';

  useEffect(() => {
    if (!roomCode || roomCode.length !== 6) router.replace('/group');
  }, [roomCode, router]);

  const gc = useGroupCall();

  // Lobby state
  const [displayName, setDisplayName] = useState('');
  const [selectedLang, setSelectedLang] = useState(() => {
    if (urlLang && LANGUAGES.find(l => l.code === urlLang)) return urlLang;
    return getBrowserLanguage();
  });
  const [lobbyErr, setLobbyErr] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [shareMsg, setShareMsg] = useState('');

  // Video refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null, null]);

  // Attach local stream
  useEffect(() => {
    if (localVideoRef.current && gc.localStream) {
      localVideoRef.current.srcObject = gc.localStream;
    }
  }, [gc.localStream]);

  // Attach remote streams
  useEffect(() => {
    gc.participants.forEach((p, idx) => {
      const el = remoteVideoRefs.current[idx];
      if (el && p?.stream && el.srcObject !== p.stream) {
        el.srcObject = p.stream;
      }
    });
  }, [gc.participants]);

  const handleJoin = async () => {
    if (!displayName.trim()) { setLobbyErr('Enter your name to join'); return; }
    setIsJoining(true);
    setLobbyErr('');
    await gc.joinRoom(roomCode, {
      displayName: displayName.trim(),
      language: selectedLang,
      callType,
      deviceId: getDeviceId(),
    });
    setIsJoining(false);
  };

  const handleLeave = () => { gc.leaveRoom(); router.push('/'); };

  const handleShare = async () => {
    const url = `${window.location.origin}/group/${roomCode}?type=${callType}`;
    const text = `Join my translated group call - speak your language, everyone understands!\n\n${url}`;
    try {
      await navigator.share({ title: 'Join Entrevoz Group Call', text, url });
    } catch {
      await navigator.clipboard.writeText(url).catch(() => {});
      setShareMsg('Copied!');
      setTimeout(() => setShareMsg(''), 2000);
    }
  };

  const handleWhatsApp = () => {
    const url = `${window.location.origin}/group/${roomCode}?type=${callType}`;
    const msg = encodeURIComponent(`Join my translated group call!\n\nSpeak your language - everyone understands in real time.\n\nJoin here: ${url}\n\n(No download needed)`);
    window.open(`whatsapp://send?text=${msg}`, '_blank');
  };

  // ── LOBBY ──────────────────────────────────────────────────────────────────────

  if (gc.phase === 'lobby' || gc.phase === 'joining') {
    return (
      <div className="min-h-[100dvh] bg-[#06060a] flex items-center justify-center p-4 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <div className="text-[#00C896] text-xs font-medium tracking-widest uppercase mb-1">Group Call</div>
            <div className="font-mono text-white text-3xl font-medium tracking-[0.3em] mb-1">{roomCode}</div>
            <div className="text-white/40 text-sm">{callType === 'video' ? 'Video + Audio' : 'Audio Only'}</div>
          </div>

          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 mb-3 backdrop-blur-sm">
            <div className="mb-4">
              <label className="text-white/50 text-xs uppercase tracking-wide block mb-1.5">Your name</label>
              <input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder="Enter your name..."
                maxLength={30}
                autoFocus
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-[#00C896] transition-colors"
              />
            </div>

            <div className="mb-5">
              <label className="text-white/50 text-xs uppercase tracking-wide block mb-1.5">Your language</label>
              <div className="grid grid-cols-4 gap-1.5 max-h-32 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
                {LANGUAGES.map(l => (
                  <button
                    key={l.code}
                    onClick={() => setSelectedLang(l.code)}
                    className={`py-2 rounded-lg text-xs flex flex-col items-center gap-0.5 transition-all ${
                      selectedLang === l.code
                        ? 'bg-[#00C896]/20 border border-[#00C896]/40 text-[#00C896]'
                        : 'bg-white/5 border border-transparent text-white/50 hover:bg-white/10'
                    }`}
                  >
                    <span className="text-base leading-none">{l.flag}</span>
                    <span className="truncate w-full text-center text-[10px]">{l.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>

            {lobbyErr && <p className="text-red-400 text-sm mb-3 text-center">{lobbyErr}</p>}

            <button
              onClick={handleJoin}
              disabled={isJoining || !displayName.trim()}
              className="w-full py-3.5 bg-[#00C896] text-[#06060a] font-semibold rounded-xl disabled:opacity-40 hover:bg-[#00b886] transition-colors"
            >
              {isJoining ? 'Joining...' : 'Join Call'}
            </button>
          </div>

          {/* Invite others */}
          <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4 backdrop-blur-sm">
            <div className="text-white/40 text-xs mb-3 text-center">Invite others to this call</div>
            <div className="flex gap-2">
              <button onClick={handleWhatsApp} className="flex-1 py-2.5 bg-[#25D366]/20 text-[#25D366] rounded-xl text-sm font-medium hover:bg-[#25D366]/30 transition-colors">
                WhatsApp
              </button>
              <button onClick={handleShare} className="flex-1 py-2.5 bg-white/10 text-white rounded-xl text-sm font-medium hover:bg-white/15 transition-colors">
                {shareMsg || 'Copy Link'}
              </button>
            </div>
          </div>

          <p className="text-white/20 text-xs text-center mt-4">No app needed for guests · Works in any browser</p>
        </div>
      </div>
    );
  }

  // ── ERROR ──────────────────────────────────────────────────────────────────────

  if (gc.phase === 'error') {
    return (
      <div className="min-h-[100dvh] bg-[#06060a] flex items-center justify-center p-6">
        <div className="text-center max-w-xs">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-white text-lg font-medium mb-2">Something went wrong</h2>
          <p className="text-white/50 text-sm mb-6 leading-relaxed">{gc.error}</p>
          <div className="flex gap-3">
            <button onClick={() => router.push('/group')} className="flex-1 py-2.5 bg-white/10 text-white rounded-xl text-sm">Back</button>
            <button onClick={() => window.location.reload()} className="flex-1 py-2.5 bg-[#00C896] text-[#06060a] rounded-xl text-sm font-medium">Retry</button>
          </div>
        </div>
      </div>
    );
  }

  // ── ENDED ──────────────────────────────────────────────────────────────────────

  if (gc.phase === 'ended') {
    return (
      <div className="min-h-[100dvh] bg-[#06060a] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#00C896]/10 border border-[#00C896]/20 flex items-center justify-center">
            <svg className="w-7 h-7 text-[#00C896]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-white text-xl font-medium mb-2">Call ended</h2>
          <p className="text-white/40 mb-6">Thanks for using Entrevoz</p>
          <button onClick={() => router.push('/')} className="px-6 py-3 bg-[#00C896] text-[#06060a] rounded-xl font-medium">
            Go home
          </button>
        </div>
      </div>
    );
  }

  // ── ACTIVE CALL ────────────────────────────────────────────────────────────────

  const remoteParts = gc.participants.filter((p, i) => p !== null && i !== gc.mySlotIndex);
  const myLangObj = LANGUAGES.find(l => l.code === gc.myLanguage);

  // Detect translation mode — are there different languages in the room?
  const activeLanguages = new Set<string>();
  activeLanguages.add(gc.myLanguage);
  gc.participants.forEach(p => { if (p?.language) activeLanguages.add(p.language); });
  const isMultiLingual = activeLanguages.size > 1;
  const languageList = Array.from(activeLanguages).map(code => {
    const l = LANGUAGES.find(x => x.code === code);
    return l ? `${l.flag} ${l.name}` : code;
  });

  return (
    <div className="h-[100dvh] bg-[#06060a] flex flex-col overflow-hidden select-none">

      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-black/30 flex-shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[#00C896] text-sm font-medium tracking-widest">{roomCode}</span>
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00C896] animate-pulse" />
            <span className="text-white/50 text-xs">{gc.participantCount} {gc.participantCount === 1 ? 'person' : 'people'}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleWhatsApp}
            className="text-xs px-2.5 py-1 bg-[#25D366]/20 text-[#25D366] rounded-lg"
          >
            + Invite
          </button>
          <button
            onClick={() => setShowSubtitles(s => !s)}
            className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${showSubtitles ? 'bg-[#00C896]/20 text-[#00C896]' : 'bg-white/10 text-white/40'}`}
          >
            CC
          </button>
        </div>
      </div>

      {/* Translation status indicator */}
      <div className={`flex-shrink-0 px-4 py-1.5 text-xs text-center border-b ${
        isMultiLingual
          ? 'bg-[#00C896]/10 border-[#00C896]/20 text-[#00C896]'
          : 'bg-white/5 border-white/5 text-white/40'
      }`}>
        {isMultiLingual ? (
          <span>🌐 Live Translation Active — {languageList.join(' · ')}</span>
        ) : (
          <span>📝 Same Language — Live Transcription Only · Select different languages to enable translation</span>
        )}
      </div>

      {/* Video grid */}
      <div className="flex-1 min-h-0 p-2 grid grid-cols-2 gap-2">

        {/* My tile */}
        <div className="relative rounded-xl overflow-hidden bg-[#111]">
          {callType === 'video' && !gc.isCameraOff && gc.localStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-center">
                <div className="w-14 h-14 rounded-full bg-[#00C896]/20 border-2 border-[#00C896]/40 flex items-center justify-center mx-auto mb-2">
                  <span className="text-[#00C896] font-medium text-lg">{displayName.charAt(0).toUpperCase() || 'Y'}</span>
                </div>
              </div>
            </div>
          )}
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-white text-xs font-medium bg-black/60 px-2 py-0.5 rounded-full">
                You {myLangObj?.flag}
              </span>
              {gc.isMuted && <span className="text-xs bg-red-500/80 px-1.5 py-0.5 rounded-full text-white">Muted</span>}
            </div>
          </div>
        </div>

        {/* Remote participants */}
        {[0, 1, 2].map(remoteIdx => {
          const participant = remoteParts[remoteIdx] ?? null;
          const globalSlot = participant ? gc.participants.findIndex(p => p === participant) : -1;
          const langObj = participant ? LANGUAGES.find(l => l.code === participant.language) : null;

          if (!participant) {
            return (
              <div key={`empty-${remoteIdx}`} className="rounded-xl border border-white/10 border-dashed bg-white/[0.02] flex flex-col items-center justify-center gap-2">
                <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">
                  <span className="text-white/20 text-xl">+</span>
                </div>
                <span className="text-white/20 text-xs">Waiting...</span>
              </div>
            );
          }

          return (
            <div
              key={`slot-${globalSlot}`}
              className={`relative rounded-xl overflow-hidden bg-[#111] transition-all duration-200 ${
                participant.isSpeaking ? 'ring-2 ring-[#00C896] ring-offset-0' : ''
              }`}
            >
              {callType === 'video' && !participant.isCameraOff && participant.stream ? (
                <video
                  ref={el => { if (globalSlot >= 0) remoteVideoRefs.current[globalSlot] = el; }}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center min-h-[100px]">
                  <div className="text-center">
                    <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-2">
                      <span className="text-white font-medium text-lg">{participant.displayName.charAt(0).toUpperCase()}</span>
                    </div>
                    {participant.status === 'connecting' && (
                      <span className="text-white/30 text-xs">Connecting...</span>
                    )}
                  </div>
                </div>
              )}

              {/* Info overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-white text-xs font-medium truncate max-w-[80px]">{participant.displayName}</span>
                    {langObj && <span className="text-xs">{langObj.flag}</span>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {participant.isMuted && <span className="text-xs text-red-400">Muted</span>}
                    <QualityBars q={participant.connectionQuality} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Subtitles */}
      {showSubtitles && gc.subtitles.length > 0 && (
        <div className="flex-shrink-0 px-3 py-2 max-h-36 overflow-y-auto overscroll-contain border-t border-white/5 bg-black/40" style={{ WebkitOverflowScrolling: 'touch' }}>
          {gc.subtitles.slice(-6).map(sub => {
            const isMe = sub.speakerSlot === gc.mySlotIndex;
            const lang = LANGUAGES.find(l => l.code === sub.speakerLanguage);
            const isSameLang = sub.speakerLanguage === gc.myLanguage;
            const isTranslating = sub.translated === null && !isSameLang;
            const hasTranslation = sub.translated !== null && !isSameLang;

            return (
              <div key={sub.id} className="mb-2 last:mb-0">
                <div className="flex gap-2 items-start">
                  <span className="text-sm flex-shrink-0 mt-0.5">{isMe ? '\u{1F7E2}' : (lang?.flag ?? '\u{1F310}')}</span>
                  <div className="min-w-0 flex-1">
                    <span className={`text-xs mr-1 ${isMe ? 'text-[#00C896]/60' : 'text-white/40'}`}>{sub.speakerName}:</span>
                    <span className="text-white/60 text-xs leading-snug">
                      {sub.original}
                    </span>
                    {isTranslating && (
                      <span className="text-white/30 text-xs italic ml-1">translating...</span>
                    )}
                    {hasTranslation && (
                      <p className="text-white text-sm font-medium leading-snug mt-0.5">
                        → {sub.translated}
                      </p>
                    )}
                    {isSameLang && !isMe && (
                      <p className="text-white text-sm leading-snug mt-0.5">
                        {sub.original}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Controls */}
      <div className="flex-shrink-0 flex items-center justify-center gap-3 px-4 py-3 bg-black/40 border-t border-white/5 pb-[max(0.75rem,env(safe-area-inset-bottom))]">

        {/* Mute */}
        <button
          onClick={gc.toggleMute}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
            gc.isMuted ? 'bg-red-500 text-white' : 'bg-white/15 text-white hover:bg-white/20'
          }`}
          title={gc.isMuted ? 'Unmute' : 'Mute'}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {gc.isMuted ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            )}
          </svg>
        </button>

        {/* Camera */}
        {callType === 'video' && (
          <button
            onClick={gc.toggleCamera}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
              gc.isCameraOff ? 'bg-red-500 text-white' : 'bg-white/15 text-white hover:bg-white/20'
            }`}
            title={gc.isCameraOff ? 'Turn on camera' : 'Turn off camera'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {gc.isCameraOff ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L5.636 5.636" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              )}
            </svg>
          </button>
        )}

        {/* Language */}
        <select
          value={gc.myLanguage}
          onChange={e => gc.setMyLanguage(e.target.value)}
          className="h-12 px-3 bg-white/15 text-white rounded-full text-sm border-none focus:outline-none cursor-pointer hover:bg-white/20 appearance-none"
          title="Your language"
        >
          {LANGUAGES.map(l => (
            <option key={l.code} value={l.code} className="bg-[#06060a]">
              {l.flag} {l.name}
            </option>
          ))}
        </select>

        {/* Share */}
        <button
          onClick={handleShare}
          className="w-12 h-12 rounded-full bg-white/15 text-white flex items-center justify-center hover:bg-white/20 transition-all"
          title="Invite others"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
        </button>

        {/* End call */}
        <button
          onClick={handleLeave}
          className="w-12 h-12 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
          title="Leave call"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
