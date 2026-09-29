import { useEffect, useState, type FormEvent } from 'react';
import { listInvites, createInvite, revokeInvite, inviteUrl, apiError } from '../services/api';
import type { InviteLink } from '../services/api';
import { formatDate } from './ui';
import { Link2, Copy, Check, X, Plus, Users, Ban, ChevronDown, AlertTriangle } from 'lucide-react';

const STATE_BADGE: Record<InviteLink['state'], { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/25' },
  revoked: { label: 'Turned off', className: 'bg-surface-800 text-surface-500 ring-surface-700' },
  expired: { label: 'Expired', className: 'bg-amber-500/10 text-amber-700 ring-amber-500/25' },
  full: { label: 'Limit reached', className: 'bg-amber-500/10 text-amber-700 ring-amber-500/25' },
};

// Admin dialog: create, copy and turn off shareable links for one assessment
export default function ShareLinksModal({
  assessment,
  onClose,
}: {
  assessment: { id: number; name: string; status: string };
  onClose: () => void;
}) {
  const [links, setLinks] = useState<InviteLink[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');

  useEffect(() => {
    listInvites(assessment.id).then(setLinks).catch((err) => setError(apiError(err, 'Failed to load links')));
  }, [assessment.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleCreate(e?: FormEvent) {
    e?.preventDefault();
    setCreating(true);
    setError('');
    try {
      const link = await createInvite({
        assessmentId: assessment.id,
        label: label.trim() || undefined,
        maxUses: maxUses ? Number(maxUses) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setLinks((prev) => [link, ...(prev ?? [])]);
      setLabel('');
      setMaxUses('');
      setExpiresAt('');
      setShowForm(false);
    } catch (err) {
      setError(apiError(err, 'Failed to create link'));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(link: InviteLink) {
    setError('');
    try {
      await revokeInvite(link.id);
      setLinks((prev) => prev?.map((l) => (l.id === link.id ? { ...l, state: 'revoked', revokedAt: new Date().toISOString() } : l)) ?? null);
    } catch (err) {
      setError(apiError(err, 'Failed to turn off link'));
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className="card w-full max-w-2xl p-0 overflow-hidden shadow-2xl animate-fade-in my-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-surface-800">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-primary-500/10 text-primary-700 flex items-center justify-center shrink-0">
              <Link2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="share-title" className="text-lg font-semibold text-white">Share test link</h2>
              <p className="text-sm text-surface-500 truncate">{assessment.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn-ghost p-2" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
          <p className="text-sm text-surface-400">
            Anyone with a link can take this test. They enter their name and email and start straight away. No account or password needed.
          </p>

          {assessment.status !== 'published' && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/25 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>This assessment is <b>{assessment.status}</b>. People can open the link, but they can&apos;t start until you publish it.</span>
            </div>
          )}

          {error && <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/25 text-sm text-red-700">{error}</div>}

          {/* Create */}
          {showForm ? (
            <form onSubmit={handleCreate} className="rounded-xl border border-surface-700 p-4 space-y-4 bg-surface-950">
              <div>
                <label className="label" htmlFor="inv-label">Label <span className="text-surface-500 font-normal">(optional, only you see it)</span></label>
                <input id="inv-label" value={label} onChange={(e) => setLabel(e.target.value.slice(0, 100))} placeholder="e.g. Campus drive — NIE" className="input" autoFocus />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="label" htmlFor="inv-max">Participant limit</label>
                  <input id="inv-max" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="inv-exp">Link expires</label>
                  <input id="inv-exp" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-sm">Cancel</button>
                <button type="submit" disabled={creating} className="btn-primary text-sm"><Link2 className="w-4 h-4" /> {creating ? 'Creating...' : 'Create link'}</button>
              </div>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleCreate()} disabled={creating} className="btn-primary text-sm">
                <Plus className="w-4 h-4" /> {creating ? 'Creating...' : 'Create link'}
              </button>
              <button type="button" onClick={() => setShowForm(true)} className="btn-outline text-sm">Create with options…</button>
            </div>
          )}

          {/* Existing links */}
          <div>
            <p className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-2">Links {links ? `(${links.length})` : ''}</p>
            {!links ? (
              <p className="text-sm text-surface-500 py-4 text-center">Loading...</p>
            ) : links.length === 0 ? (
              <p className="text-sm text-surface-500 py-6 text-center rounded-xl border border-dashed border-surface-700">No links yet. Create one to share this test.</p>
            ) : (
              <ul className="space-y-3">{links.map((l) => <LinkRow key={l.id} link={l} onRevoke={() => handleRevoke(l)} />)}</ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function LinkRow({ link, onRevoke }: { link: InviteLink; onRevoke: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const url = inviteUrl(link.token);
  const badge = STATE_BADGE[link.state];
  const active = link.state === 'active';

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API can be blocked (e.g. non-secure origin): fall back to a temporary text area
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <li className={`rounded-xl border p-4 ${active ? 'border-surface-700 bg-surface-900' : 'border-surface-800 bg-surface-950'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`badge ring-1 ${badge.className}`}>{badge.label}</span>
          <span className="text-sm font-medium text-white truncate">{link.label || 'Untitled link'}</span>
        </div>
        <span className="text-xs text-surface-500">Created {formatDate(link.createdAt)}</span>
      </div>

      <div className="flex gap-2 mt-3">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className={`input font-mono text-xs flex-1 min-w-0 ${active ? '' : 'line-through text-surface-500'}`}
          aria-label="Invite link"
        />
        <button type="button" onClick={copy} disabled={!active} className="btn-primary text-sm shrink-0">
          {copied ? <><Check className="w-4 h-4" /> Copied</> : <><Copy className="w-4 h-4" /> Copy</>}
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mt-3 text-xs text-surface-500">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <button type="button" onClick={() => setShowPeople((v) => !v)} className="flex items-center gap-1 hover:text-surface-200 cursor-pointer" disabled={link.uses === 0}>
            <Users className="w-3.5 h-3.5" />
            <span className="tabular-nums">{link.uses}{link.maxUses !== null ? ` / ${link.maxUses}` : ''}</span> joined
            {link.uses > 0 && <ChevronDown className={`w-3 h-3 transition-transform ${showPeople ? 'rotate-180' : ''}`} />}
          </button>
          <span>{link.expiresAt ? `Expires ${formatDate(link.expiresAt)}` : 'Never expires'}</span>
        </div>
        {active && (
          <button type="button" onClick={onRevoke} className="flex items-center gap-1 text-red-600 hover:text-red-700 font-medium cursor-pointer">
            <Ban className="w-3.5 h-3.5" /> Turn off
          </button>
        )}
      </div>

      {showPeople && link.participants.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-surface-800 space-y-1.5 text-xs">
          {link.participants.map((p) => (
            <li key={p.email} className="flex justify-between gap-3">
              <span className="text-surface-200 truncate">{p.name} <span className="text-surface-500">· {p.email}</span></span>
              <span className="text-surface-500 shrink-0">{formatDate(p.joinedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
