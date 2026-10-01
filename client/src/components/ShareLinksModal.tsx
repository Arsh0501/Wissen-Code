import { useEffect, useState, type FormEvent } from 'react';
import { listInvites, createInvite, revokeInvite, inviteUrl, apiError } from '../services/api';
import { formatDate } from './ui';
import { Link2, Copy, Check, X, Plus, Users, Ban, ChevronDown, AlertTriangle } from 'lucide-react';
import styles from './ShareLinksModal.module.css';
import type { InviteLink } from '../types';
import { INVITE_STATE_LABELS, SHARE_LINKS_MODAL_MESSAGES as MSG } from '../constants';

const STATE_BADGE: Record<InviteLink['state'], { label: string; className: string }> = {
  active: { label: INVITE_STATE_LABELS.active, className: styles.activeClassName },
  revoked: { label: INVITE_STATE_LABELS.revoked, className: styles.turnedOffClassName },
  expired: { label: INVITE_STATE_LABELS.expired, className: styles.expiredClassName },
  full: { label: INVITE_STATE_LABELS.full, className: styles.expiredClassName },
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
    listInvites(assessment.id).then(setLinks).catch((err) => setError(apiError(err, MSG.failedLoadLinks)));
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
      setError(apiError(err, MSG.failedCreateLink));
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
      setError(apiError(err, MSG.failedTurnOffLink));
    }
  }

  return (
    <div className={styles.closeBox} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        className={styles.dialogBox}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.closeBox2}>
          <div className={styles.linkBox}>
            <div className={styles.linkBox2}>
              <Link2 className={styles.linkIcon} />
            </div>
            <div className={styles.shareTitleBox}>
              <h2 id="share-title" className={styles.shareTitle}>Share test link</h2>
              <p className={styles.nameText}>{assessment.name}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={styles.closeButton} aria-label="Close"><X className={styles.xIcon} /></button>
        </div>

        <div className={styles.anyoneWithABox}>
          <p className={styles.anyoneWithAText}>
            {MSG.anyoneLinkTakeTest}</p>

          {assessment.status !== 'published' && (
            <div className={styles.alertTriangleBox}>
              <AlertTriangle className={styles.alertTriangleIcon} />
              <span>This assessment is <b>{assessment.status}</b>{MSG.peopleOpenLinkBut}</span>
            </div>
          )}

          {error && <div className={styles.errorBox}>{error}</div>}

          {/* Create */}
          {showForm ? (
            <form onSubmit={handleCreate} className={styles.invLabelForm}>
              <div>
                <label className="label" htmlFor="inv-label">Label <span className={styles.optionalOnlyYouLabel}>{MSG.optionalOnlySee}</span></label>
                <input id="inv-label" value={label} onChange={(e) => setLabel(e.target.value.slice(0, 100))} placeholder={MSG.campusDriveNieExample} className="input" autoFocus />
              </div>
              <div className={styles.invMaxBox}>
                <div>
                  <label className="label" htmlFor="inv-max">Participant limit</label>
                  <input id="inv-max" type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder="Unlimited" className="input" />
                </div>
                <div>
                  <label className="label" htmlFor="inv-exp">Link expires</label>
                  <input id="inv-exp" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="input" />
                </div>
              </div>
              <div className={styles.cancelBox}>
                <button type="button" onClick={() => setShowForm(false)} className={styles.cancelButton}>Cancel</button>
                <button type="submit" disabled={creating} className={styles.linkButton}><Link2 className={styles.xIcon} /> {creating ? 'Creating...' : 'Create link'}</button>
              </div>
            </form>
          ) : (
            <div className={styles.plusBox}>
              <button type="button" onClick={() => handleCreate()} disabled={creating} className={styles.linkButton}>
                <Plus className={styles.xIcon} /> {creating ? 'Creating...' : 'Create link'}
              </button>
              <button type="button" onClick={() => setShowForm(true)} className={styles.createWithOptionsButton}>Create with options…</button>
            </div>
          )}

          {/* Existing links */}
          <div>
            <p className={styles.linksText}>Links {links ? `(${links.length})` : ''}</p>
            {!links ? (
              <p className={styles.loadingText}>Loading...</p>
            ) : links.length === 0 ? (
              <p className={styles.noLinksYetText}>{MSG.noLinksYetCreate}</p>
            ) : (
              <ul className={styles.existingLinksList}>{links.map((l) => <LinkRow key={l.id} link={l} onRevoke={() => handleRevoke(l)} />)}</ul>
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
    <li className={`${styles.createdItem} ${active ? styles.createdItemActive : styles.createdItemInactive}`}>
      <div className={styles.createdBox}>
        <div className={styles.labelBox}>
          <span className={`${styles.label} ${badge.className}`}>{badge.label}</span>
          <span className={styles.existingLinksLabel}>{link.label || 'Untitled link'}</span>
        </div>
        <span className={styles.createdLabel}>Created {formatDate(link.createdAt)}</span>
      </div>

      <div className={styles.existingLinksBox}>
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className={`${styles.inviteLinkInput} ${active ? '' : styles.inviteLinkInputInactive}`}
          aria-label="Invite link"
        />
        <button type="button" onClick={copy} disabled={!active} className={styles.copyButton}>
          {copied ? <><Check className={styles.xIcon} /> Copied</> : <><Copy className={styles.xIcon} /> Copy</>}
        </button>
      </div>

      <div className={styles.usersBox}>
        <div className={styles.usersBox2}>
          <button type="button" onClick={() => setShowPeople((v) => !v)} className={styles.joinedButton} disabled={link.uses === 0}>
            <Users className={styles.usersIcon} />
            <span className={styles.usesLabel}>{link.uses}{link.maxUses !== null ? ` / ${link.maxUses}` : ''}</span> joined
            {link.uses > 0 && <ChevronDown className={`${styles.chevronDownIcon} ${showPeople ? styles.chevronDownIconPeople : ''}`} />}
          </button>
          <span>{link.expiresAt ? `Expires ${formatDate(link.expiresAt)}` : 'Never expires'}</span>
        </div>
        {active && (
          <button type="button" onClick={onRevoke} className={styles.revokeButton}>
            <Ban className={styles.usersIcon} /> Turn off
          </button>
        )}
      </div>

      {showPeople && link.participants.length > 0 && (
        <ul className={styles.existingLinksList2}>
          {link.participants.map((p) => (
            <li key={p.email} className={styles.nameItem}>
              <span className={styles.nameLabel}>{p.name} <span className={styles.existingLinksLabel2}>· {p.email}</span></span>
              <span className={styles.existingLinksLabel3}>{formatDate(p.joinedAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
