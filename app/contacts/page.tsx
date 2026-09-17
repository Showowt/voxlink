'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { BackButton } from '@/app/components/ui/BackButton';
// Unified device id — contacts are SAVED by call/talk under los_device_id;
// the old inline entrevoz_device_id read a different id so the list was
// always empty.
import { getDeviceId } from '@/app/lib/language-os/device-id';
import { sendCallInvite } from '@/app/lib/ring-signal';
import { generateRoomCode } from '@/app/lib/room-code';
import { normalizeDialCode, isValidDialCode, formatDialCode } from '@/app/lib/dial-code';
import { resolveDialCode } from '@/app/lib/directory';

interface Contact {
  id: string;
  contact_device_id: string;
  display_name: string;
  language: string;
  last_called_at: string;
  call_count: number;
  is_favorite: boolean;
}

interface PendingInvite {
  invite_code: string;
  invitee_label: string | null;
  claimed_by_device_id: string | null;
  created_at: string;
}

// Manual adds whose code isn't registered yet are saved with a `code:` device
// id sentinel — still dialable (the code IS a ring address) and auto-upgraded
// to the real device id once the person registers.
const isCodeContact = (c: Contact) => c.contact_device_id.startsWith('code:');
const codeOf = (c: Contact) => c.contact_device_id.slice(5);

const FLAGS: Record<string, string> = {
  en: '\u{1F1FA}\u{1F1F8}', es: '\u{1F1EA}\u{1F1F8}', fr: '\u{1F1EB}\u{1F1F7}',
  de: '\u{1F1E9}\u{1F1EA}', it: '\u{1F1EE}\u{1F1F9}', pt: '\u{1F1E7}\u{1F1F7}',
  zh: '\u{1F1E8}\u{1F1F3}', ja: '\u{1F1EF}\u{1F1F5}', ko: '\u{1F1F0}\u{1F1F7}',
  ar: '\u{1F1F8}\u{1F1E6}', ru: '\u{1F1F7}\u{1F1FA}', hi: '\u{1F1EE}\u{1F1F3}',
};

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
  const [fetchError, setFetchError] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const [pending, setPending] = useState<PendingInvite[]>([]);

  useEffect(() => {
    const id = getDeviceId();
    setDeviceId(id);
    const upgraded = new Set<string>();
    const load = () => {
      fetch(`/api/contacts?deviceId=${encodeURIComponent(id)}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(async d => {
          const list: Contact[] = d.contacts ?? [];
          setContacts(list);
          setFetchError(false);
          // Upgrade pass: code-sentinel contacts whose person has since
          // registered get swapped to their real device id (same name).
          for (const c of list.filter(isCodeContact)) {
            const code = codeOf(c);
            if (upgraded.has(code)) continue;
            upgraded.add(code);
            const resolved = await resolveDialCode(code).catch(() => null);
            if (resolved && resolved.deviceId !== id) {
              await fetch('/api/contacts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  ownerDeviceId: id,
                  contactDeviceId: resolved.deviceId,
                  displayName: c.display_name,
                  language: resolved.language || c.language,
                }),
              }).catch(() => {});
              await fetch('/api/contacts', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ownerDeviceId: id, contactDeviceId: c.contact_device_id }),
              }).catch(() => {});
              fetch(`/api/contacts?deviceId=${encodeURIComponent(id)}`, { cache: 'no-store' })
                .then(r => r.json())
                .then(dd => setContacts(dd.contacts ?? []))
                .catch(() => {});
            }
          }
        })
        .catch(() => { setFetchError(true); })
        .finally(() => setLoading(false));
      // Pending invites → shown as "Invited — waiting" entries.
      fetch(`/api/invite?inviterDeviceId=${encodeURIComponent(id)}`, { cache: 'no-store' })
        .then(r => r.json())
        .then(d => setPending((d.invites ?? []).filter((i: PendingInvite) => !i.claimed_by_device_id)))
        .catch(() => {});
    };
    load();
    // Refresh whenever the page regains focus/visibility — in the native shell
    // pages stay mounted, so a mount-only fetch shows a stale (pre-call) list
    // and freshly saved contacts look like they never saved.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    window.addEventListener('focus', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
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

  const [editing, setEditing] = useState<Contact | null>(null);
  const [editName, setEditName] = useState('');

  const startRename = (c: Contact) => {
    setEditing(c);
    setEditName(c.display_name);
    setActiveMenu(null);
  };

  const saveRename = async () => {
    const target = editing;
    const name = editName.trim();
    setEditing(null);
    if (!target || !name || name === target.display_name) return;
    setContacts(prev =>
      prev.map(x => (x.id === target.id ? { ...x, display_name: name } : x)),
    );
    await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerDeviceId: deviceId,
        contactDeviceId: target.contact_device_id,
        displayName: name,
      }),
    }).catch(() => {});
  };

  const callContact = async (c: Contact, type: 'video' | 'audio') => {
    const code = generateRoomCode();
    // lang = MY language (drives my STT); the contact's language is only a
    // hint for the expected partner. Presetting lang to the contact's
    // language ran speech recognition in the wrong language.
    const myLang = localStorage.getItem('entrevoz_lang') || 'en';
    const myName = localStorage.getItem('entrevoz_name') || 'Someone';
    // Ring the contact on their device (Realtime) so they can accept — no link
    // to send. A code-sentinel contact rings by its dial code (the code IS an
    // address); a real contact rings by device id.
    const ringTarget = isCodeContact(c) ? codeOf(c) : c.contact_device_id;
    await sendCallInvite(ringTarget, {
      room: code,
      type,
      fromDevice: deviceId || getDeviceId(),
      fromName: myName,
      fromLang: myLang,
      targetLang: c.language,
    });
    // Only seed pd for a real device id — a code can't be saved as a partner.
    const seed =
      `&name=${encodeURIComponent(myName)}` +
      (isCodeContact(c)
        ? ''
        : `&pd=${encodeURIComponent(c.contact_device_id)}&pn=${encodeURIComponent(c.display_name)}`);
    router.push(
      type === 'video'
        ? `/call/${code}?lang=${myLang}&hostLang=${c.language}&host=true${seed}`
        : `/talk/${code}?lang=${myLang}&partnerLang=${c.language}&host=true${seed}`,
    );
  };

  // ── Add contact / invite ──────────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false);
  const [addMode, setAddMode] = useState<'code' | 'invite'>('code');
  const [addName, setAddName] = useState('');
  const [addCode, setAddCode] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [addNote, setAddNote] = useState('');
  const [inviteLink, setInviteLink] = useState('');

  const resetAdd = () => {
    setShowAdd(false);
    setAddMode('code');
    setAddName('');
    setAddCode('');
    setAddBusy(false);
    setAddNote('');
    setInviteLink('');
  };

  const refreshList = () => {
    fetch(`/api/contacts?deviceId=${encodeURIComponent(deviceId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setContacts(d.contacts ?? []))
      .catch(() => {});
    fetch(`/api/invite?inviterDeviceId=${encodeURIComponent(deviceId)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => setPending((d.invites ?? []).filter((i: PendingInvite) => !i.claimed_by_device_id)))
      .catch(() => {});
  };

  const submitAddByCode = async () => {
    const code = normalizeDialCode(addCode);
    if (!isValidDialCode(code)) {
      setAddNote('Enter a valid 6-character code (like ABC-DEF).');
      return;
    }
    setAddBusy(true);
    setAddNote('');
    const resolved = await resolveDialCode(code).catch(() => null);
    if (resolved && resolved.deviceId === deviceId) {
      setAddBusy(false);
      setAddNote("That's your own code.");
      return;
    }
    const body = resolved
      ? {
          ownerDeviceId: deviceId,
          contactDeviceId: resolved.deviceId,
          displayName: addName.trim() || resolved.displayName || `Contact ${formatDialCode(code)}`,
          language: resolved.language || 'en',
        }
      : {
          // Not registered yet — save as a dialable code-contact; auto-upgrades
          // to their real device id once they open Entrevoz.
          ownerDeviceId: deviceId,
          contactDeviceId: `code:${code}`,
          displayName: addName.trim() || `Contact ${formatDialCode(code)}`,
          language: 'en',
        };
    const r = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    setAddBusy(false);
    if (r?.ok) {
      refreshList();
      resetAdd();
    } else {
      setAddNote("Couldn't save — check your connection and try again.");
    }
  };

  const submitInvite = async () => {
    setAddBusy(true);
    setAddNote('');
    const r = await fetch('/api/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        inviterName: localStorage.getItem('entrevoz_name') || '',
        inviterLang: localStorage.getItem('entrevoz_lang') || 'en',
        inviteeLabel: addName.trim() || undefined,
      }),
    }).catch(() => null);
    setAddBusy(false);
    const d = r?.ok ? await r.json().catch(() => null) : null;
    if (d?.inviteCode) {
      setInviteLink(`${window.location.origin}/i/${d.inviteCode}`);
      refreshList();
    } else {
      setAddNote("Couldn't create the invite — try again.");
    }
  };

  const shareInviteLink = async (link: string, label?: string | null) => {
    const who = label ? `${label}, ` : '';
    const text = `${who}let's talk with live translation on Entrevoz — tap to connect with me: ${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Entrevoz', text });
        return;
      } catch {
        /* fall through */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const cancelInvite = async (inv: PendingInvite) => {
    setPending(prev => prev.filter(p => p.invite_code !== inv.invite_code));
    await fetch('/api/invite', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, inviteCode: inv.invite_code }),
    }).catch(() => {});
  };

  const shareInvite = (c: Contact) => {
    const code = generateRoomCode();
    const url = `${window.location.origin}/call/${code}`;
    const msg = encodeURIComponent(`Let's catch up with live translation! Join here: ${url}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
    setActiveMenu(null);
    // Join the shared room OURSELVES — sharing a room and not entering it
    // stranded the recipient alone in an empty call.
    const myLang = localStorage.getItem('entrevoz_lang') || 'en';
    const myName = localStorage.getItem('entrevoz_name') || 'Someone';
    const seed = isCodeContact(c)
      ? ''
      : `&pd=${encodeURIComponent(c.contact_device_id)}&pn=${encodeURIComponent(c.display_name)}`;
    router.push(
      `/call/${code}?lang=${myLang}&hostLang=${c.language}&host=true&name=${encodeURIComponent(myName)}${seed}`,
    );
  };

  const favorites = contacts.filter(c => c.is_favorite);
  const recent = contacts.filter(c => !c.is_favorite);

  return (
    <div className="min-h-[100dvh] bg-[#06060a] flex flex-col safe-top safe-bottom" onClick={() => setActiveMenu(null)}>

      {/* Rename contact */}
      {editing && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={(e) => { e.stopPropagation(); setEditing(null); }}
        >
          <div
            className="w-full max-w-sm bg-[#12121a] border border-white/[0.12] rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-white/40 text-[10px] uppercase tracking-widest mb-3">Contact name</p>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); }}
              autoFocus
              maxLength={60}
              placeholder="Name"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-base placeholder-white/25 focus:outline-none focus:border-[#00C896]/50 mb-4 min-h-[48px]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(null)}
                className="flex-1 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white/70 text-sm font-semibold min-h-[48px]"
              >
                Cancel
              </button>
              <button
                onClick={saveRename}
                className="flex-1 py-3 rounded-xl bg-[#00C896] text-black text-sm font-bold min-h-[48px]"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 border-b border-white/[0.06]">
        <BackButton href="/" label="Home" />
        <h1 className="text-white text-sm font-semibold tracking-tight">Contacts</h1>
        <button
          onClick={(e) => { e.stopPropagation(); setShowAdd(true); }}
          className="w-10 h-10 rounded-xl bg-[#00C896]/10 border border-[#00C896]/25 flex items-center justify-center text-[#00C896] text-xl font-bold active:scale-90 transition-all"
          aria-label="Add contact"
        >
          +
        </button>
      </header>

      {/* Add contact / invite modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center px-6"
          onClick={(e) => { e.stopPropagation(); resetAdd(); }}
        >
          <div
            className="w-full max-w-sm bg-[#12121a] border border-white/[0.12] rounded-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            {inviteLink ? (
              <>
                <div className="text-center mb-4">
                  <div className="text-3xl mb-2">✉️</div>
                  <p className="text-white font-semibold">
                    Invite {addName.trim() ? `for ${addName.trim()}` : 'ready'}
                  </p>
                  <p className="text-white/40 text-xs mt-1">
                    They tap the link, and you both become contacts automatically.
                  </p>
                </div>
                <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-white/70 text-xs break-all mb-4">
                  {inviteLink}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => shareInviteLink(inviteLink, addName.trim() || null)}
                    className="flex-1 py-3 rounded-xl bg-[#00C896] text-black text-sm font-bold min-h-[48px]"
                  >
                    Send invite
                  </button>
                  <button
                    onClick={resetAdd}
                    className="px-5 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white/70 text-sm font-semibold min-h-[48px]"
                  >
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Mode toggle */}
                <div className="flex gap-1 p-1 rounded-xl bg-white/[0.04] border border-white/[0.06] mb-4">
                  <button
                    onClick={() => { setAddMode('code'); setAddNote(''); }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                      addMode === 'code' ? 'bg-white/[0.10] text-white border border-white/[0.10]' : 'text-white/40'
                    }`}
                  >
                    Have their code
                  </button>
                  <button
                    onClick={() => { setAddMode('invite'); setAddNote(''); }}
                    className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px] ${
                      addMode === 'invite' ? 'bg-white/[0.10] text-white border border-white/[0.10]' : 'text-white/40'
                    }`}
                  >
                    Invite them
                  </button>
                </div>

                <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">Name</p>
                <input
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder={addMode === 'code' ? 'Who is this?' : 'Who are you inviting?'}
                  maxLength={60}
                  autoCorrect="off"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-base placeholder-white/25 focus:outline-none focus:border-[#00C896]/50 mb-4 min-h-[48px]"
                />

                {addMode === 'code' ? (
                  <>
                    <p className="text-white/40 text-[10px] uppercase tracking-widest mb-2">Their Entrevoz code</p>
                    <input
                      value={addCode}
                      onChange={(e) => setAddCode(formatDialCode(normalizeDialCode(e.target.value)))}
                      onKeyDown={(e) => { if (e.key === 'Enter') submitAddByCode(); }}
                      placeholder="ABC-DEF"
                      inputMode="text"
                      autoCapitalize="characters"
                      autoCorrect="off"
                      spellCheck={false}
                      className="w-full text-center text-xl font-black tracking-[0.2em] bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-[#00C896]/50 mb-2 min-h-[52px]"
                    />
                    <p className="text-white/30 text-[11px] mb-4">
                      If they haven&apos;t opened Entrevoz yet, we&apos;ll save them anyway — their
                      phone rings by code, and the contact links up when they join.
                    </p>
                  </>
                ) : (
                  <p className="text-white/35 text-xs leading-relaxed mb-4">
                    No code needed — we create a personal link. The moment they open it,
                    you&apos;re both saved as contacts and can call with live translation.
                  </p>
                )}

                {addNote && <p className="text-amber-400/90 text-xs mb-3">{addNote}</p>}

                <div className="flex gap-2">
                  <button
                    onClick={resetAdd}
                    className="flex-1 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white/70 text-sm font-semibold min-h-[48px]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addMode === 'code' ? submitAddByCode : submitInvite}
                    disabled={addBusy || (addMode === 'code' && !normalizeDialCode(addCode))}
                    className="flex-1 py-3 rounded-xl bg-[#00C896] text-black text-sm font-bold min-h-[48px] disabled:opacity-40"
                  >
                    {addBusy ? 'Saving…' : addMode === 'code' ? 'Save contact' : 'Create invite'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" style={{ WebkitOverflowScrolling: 'touch' }}>
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-[#00C896]/30 border-t-[#00C896] rounded-full animate-spin" />
          </div>
        )}

        {/* Pending invites */}
        {!loading && pending.length > 0 && (
          <div className="mb-6">
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold mb-3 px-1">Invited</p>
            <div className="space-y-2">
              {pending.map(inv => (
                <div key={inv.invite_code} className="bg-white/[0.03] border border-dashed border-white/[0.12] rounded-2xl p-4 flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white/50 font-semibold text-base flex-shrink-0">
                    {(inv.invitee_label || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-white text-sm font-medium truncate block">
                      {inv.invitee_label || 'Invited friend'}
                    </span>
                    <span className="text-amber-400/70 text-xs">Invited — waiting to join</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      shareInviteLink(`${window.location.origin}/i/${inv.invite_code}`, inv.invitee_label);
                    }}
                    className="px-3.5 py-2.5 rounded-xl bg-[#00C896]/10 border border-[#00C896]/20 text-[#00C896] text-xs font-semibold active:scale-95 transition-all min-h-[44px]"
                  >
                    Resend
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); cancelInvite(inv); }}
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white/25 hover:text-red-400 transition-colors"
                    aria-label="Cancel invite"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && contacts.length === 0 && pending.length === 0 && (
          <div className="text-center py-16">
            {fetchError ? (
              <>
                <div className="w-16 h-16 mx-auto rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-white font-medium text-base mb-2">Failed to load contacts</p>
                <p className="text-white/40 text-sm leading-relaxed max-w-[260px] mx-auto">
                  Something went wrong. Check your connection and try again.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="mt-6 px-5 py-2.5 rounded-xl text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 transition-all active:scale-95"
                >
                  Retry
                </button>
              </>
            ) : (
              <>
                <div className="w-16 h-16 mx-auto rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-4">
                  <svg className="w-7 h-7 text-white/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                </div>
                <p className="text-white font-medium text-base mb-2">No contacts yet</p>
                <p className="text-white/40 text-sm leading-relaxed max-w-[260px] mx-auto">
                  Add someone by their code, invite them with a link, or just call —
                  people you talk to save automatically.
                </p>
                <div className="mt-6 flex flex-col gap-2 items-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowAdd(true); }}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-[#00C896] text-black transition-all active:scale-95 min-h-[44px]"
                  >
                    + Add or invite someone
                  </button>
                  <button
                    onClick={() => router.push('/dial')}
                    className="px-5 py-2.5 rounded-xl text-sm font-medium bg-[#00C896]/10 text-[#00C896] border border-[#00C896]/20 hover:bg-[#00C896]/15 transition-all active:scale-95 min-h-[44px]"
                  >
                    Dial a code
                  </button>
                </div>
              </>
            )}
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
                  onRename={() => startRename(c)}
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
                  onRename={() => startRename(c)}
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
  onRename,
}: {
  contact: Contact;
  activeMenu: string | null;
  setActiveMenu: (id: string | null) => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onCall: (type: 'video' | 'audio') => void;
  onShare: () => void;
  onRename: () => void;
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
            {isCodeContact(c)
              ? `Rings by code ${formatDialCode(codeOf(c))} · links up when they join`
              : `${c.call_count} ${c.call_count === 1 ? 'call' : 'calls'} · ${timeAgo(c.last_called_at)}`}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onCall('video'); }}
            className="w-11 h-11 rounded-xl bg-[#00C896]/10 border border-[#00C896]/20 flex items-center justify-center text-[#00C896] hover:bg-[#00C896]/20 transition-all active:scale-90"
            title="Video call"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCall('audio'); }}
            className="w-11 h-11 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center text-white/60 hover:bg-white/[0.1] transition-all active:scale-90"
            title="Audio call"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setActiveMenu(activeMenu === c.id ? null : c.id); }}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
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
            onClick={onRename}
            className="w-full text-left px-4 py-3 text-sm text-white/80 hover:bg-white/[0.06] transition-colors border-t border-white/[0.06] flex items-center gap-2"
          >
            <span>✎</span>
            Rename
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
