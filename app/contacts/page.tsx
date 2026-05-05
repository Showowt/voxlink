'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/app/components/ui/BackButton';

interface Contact {
  id: string;
  contact_device_id: string;
  display_name: string;
  language: string;
  last_called_at: string;
  call_count: number;
  is_favorite: boolean;
}

const FLAGS: Record<string, string> = {
  en: '\u{1F1FA}\u{1F1F8}', es: '\u{1F1EA}\u{1F1F8}', fr: '\u{1F1EB}\u{1F1F7}',
  de: '\u{1F1E9}\u{1F1EA}', it: '\u{1F1EE}\u{1F1F9}', pt: '\u{1F1E7}\u{1F1F7}',
  zh: '\u{1F1E8}\u{1F1F3}', ja: '\u{1F1EF}\u{1F1F5}', ko: '\u{1F1F0}\u{1F1F7}',
  ar: '\u{1F1F8}\u{1F1E6}', ru: '\u{1F1F7}\u{1F1FA}', hi: '\u{1F1EE}\u{1F1F3}',
};

function getDeviceId(): string {
  try {
    const s = localStorage.getItem('entrevoz_device_id');
    if (s) return s;
    const id = crypto.randomUUID();
    localStorage.setItem('entrevoz_device_id', id);
    return id;
  } catch { return `dev-${Date.now()}`; }
}

function timeAgo(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    fetch(`/api/contacts?deviceId=${encodeURIComponent(id)}`)
      .then(r => r.json())
      .then(d => setContacts(d.contacts ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const toggleFavorite = async (c: Contact) => {
    setContacts(prev => prev.map(x => x.id === c.id ? { ...x, is_favorite: !x.is_favorite } : x));
    await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerDeviceId: deviceId, contactDeviceId: c.contact_device_id, isFavorite: !c.is_favorite }),
    }).catch(() => {});
  };

  const deleteContact = async (c: Contact) => {
    setContacts(prev => prev.filter(x => x.id !== c.id));
    setActiveMenu(null);
    await fetch('/api/contacts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ownerDeviceId: deviceId, contactDeviceId: c.contact_device_id }),
    }).catch(() => {});
  };

  const callContact = (c: Contact, type: 'video' | 'audio') => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    router.push(type === 'video' ? `/call/${code}?lang=${c.language}` : `/talk/${code}?lang=${c.language}`);
  };

  const shareInvite = (c: Contact) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const url = `${window.location.origin}/call/${code}`;
    const msg = encodeURIComponent(`Let's catch up with live translation! Join here: ${url}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
    setActiveMenu(null);
  };

  const favorites = contacts.filter(c => c.is_favorite);
  const recent = contacts.filter(c => !c.is_favorite);

  return (
    <div className="min-h-[100dvh] bg-[#06060a] flex flex-col safe-top safe-bottom" onClick={() => setActiveMenu(null)}>

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-white/[0.06]">
        <BackButton href="/" label="Home" />
        <h1 className="text-white text-sm font-semibold tracking-tight">Contacts</h1>
        <div className="w-10" />
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#00C896]/30 border-t-[#00C896] rounded-full animate-spin" />
          </div>
        )}

        {!loading && contacts.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
              <svg className="w-7 h-7 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <p className="text-white font-medium text-base mb-2">No contacts yet</p>
            <p className="text-white/40 text-sm leading-relaxed max-w-[260px] mx-auto">
              People you call will appear here automatically. Star them to pin as favorites.
            </p>
            <button
              onClick={() => router.push('/')}
              className="mt-6 px-5 py-2.5 rounded-xl text-sm font-medium bg-[#00C896]/10 text-[#00C896] border border-[#00C896]/20 hover:bg-[#00C896]/15 transition-all active:scale-95"
            >
              Start a call
            </button>
          </div>
        )}

        {/* Favorites */}
        {favorites.length > 0 && (
          <div className="mb-6">
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-3 px-1">Favorites</p>
            <div className="space-y-2">
              {favorites.map(c => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  activeMenu={activeMenu}
                  setActiveMenu={setActiveMenu}
                  onToggleFavorite={() => toggleFavorite(c)}
                  onDelete={() => deleteContact(c)}
                  onCall={(type) => callContact(c, type)}
                  onShare={() => shareInvite(c)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Recent */}
        {recent.length > 0 && (
          <div>
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-3 px-1">Recent</p>
            <div className="space-y-2">
              {recent.map(c => (
                <ContactCard
                  key={c.id}
                  contact={c}
                  activeMenu={activeMenu}
                  setActiveMenu={setActiveMenu}
                  onToggleFavorite={() => toggleFavorite(c)}
                  onDelete={() => deleteContact(c)}
                  onCall={(type) => callContact(c, type)}
                  onShare={() => shareInvite(c)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ContactCard({
  contact: c,
  activeMenu,
  setActiveMenu,
  onToggleFavorite,
  onDelete,
  onCall,
  onShare,
}: {
  contact: Contact;
  activeMenu: string | null;
  setActiveMenu: (id: string | null) => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onCall: (type: 'video' | 'audio') => void;
  onShare: () => void;
}) {
  return (
    <div className="relative bg-white/[0.03] border border-white/[0.08] rounded-2xl p-4">
      <div className="flex items-center gap-3">
        {/* Avatar */}
        <div className="w-11 h-11 rounded-full bg-white/[0.08] border border-white/[0.1] flex items-center justify-center text-white font-semibold text-base flex-shrink-0">
          {c.display_name.charAt(0).toUpperCase()}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-white text-sm font-medium truncate">{c.display_name}</span>
            <span className="text-base leading-none">{FLAGS[c.language] || '\u{1F310}'}</span>
            {c.is_favorite && <span className="text-[#00C896] text-xs">★</span>}
          </div>
          <span className="text-white/30 text-xs">
            {c.call_count} {c.call_count === 1 ? 'call' : 'calls'} · {timeAgo(c.last_called_at)}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onCall('video'); }}
            className="w-9 h-9 rounded-xl bg-[#00C896]/10 border border-[#00C896]/20 flex items-center justify-center text-[#00C896] hover:bg-[#00C896]/20 transition-all active:scale-90"
            title="Video call"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCall('audio'); }}
            className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white/60 hover:bg-white/[0.1] transition-all active:scale-90"
            title="Audio call"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === c.id ? null : c.id); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Context menu */}
      {activeMenu === c.id && (
        <div
          className="absolute right-4 top-14 z-50 bg-[#12121a] border border-white/[0.12] rounded-xl overflow-hidden shadow-2xl"
          style={{ minWidth: 170, boxShadow: '0 8px 32px rgba(0,0,0,0.6)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onToggleFavorite}
            className="w-full text-left px-4 py-3 text-sm text-white/80 hover:bg-white/[0.06] transition-colors flex items-center gap-2"
          >
            <span className="text-[#00C896]">{c.is_favorite ? '★' : '☆'}</span>
            {c.is_favorite ? 'Remove favorite' : 'Add to favorites'}
          </button>
          <button
            onClick={onShare}
            className="w-full text-left px-4 py-3 text-sm text-white/80 hover:bg-white/[0.06] transition-colors border-t border-white/[0.06] flex items-center gap-2"
          >
            <span>↗</span>
            Share invite link
          </button>
          <button
            onClick={onDelete}
            className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors border-t border-white/[0.06] flex items-center gap-2"
          >
            <span>✕</span>
            Remove contact
          </button>
        </div>
      )}
    </div>
  );
}
