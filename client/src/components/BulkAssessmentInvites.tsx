import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiData } from '../services/workflows';
import { apiError } from '../services/api';
import { candidateRows, detectCandidateColumns, readCandidateFile, type ImportSheet } from '../services/candidateImport';

type Candidate = { id: number; name: string; email: string };
export default function BulkAssessmentInvites({ assessment, onClose }: { assessment: { id: number; name: string }; onClose: () => void }) {
  const [sheets, setSheets] = useState<ImportSheet[]>([]), [sheet, setSheet] = useState(0);
  const [nameColumn, setNameColumn] = useState(''), [emailColumn, setEmailColumn] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [dbSelected, setDbSelected] = useState<Map<number, Candidate>>(new Map());
  const [showDb, setShowDb] = useState(false), [search, setSearch] = useState('');
  const [fileError, setFileError] = useState(''), [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [submitted, setSubmitted] = useState(false);
  const importRevision = useRef(0);
  const rows = sheets[sheet]?.rows ?? [];
  const validMapping = nameColumn !== '' && emailColumn !== '' && nameColumn !== emailColumn;
  const preview = useMemo(() => validMapping ? candidateRows(rows, Number(nameColumn), Number(emailColumn)) : [], [rows, nameColumn, emailColumn]);
  const picked = preview.filter(row => !row.error && selectedRows.has(row.row));
  const uniqueCount = new Set([...picked.map(row => row.email), ...[...dbSelected.values()].map(row => row.email.toLowerCase())]).size;
  const changed = () => { setRequestId(crypto.randomUUID()); send.reset(); };
  const chooseSheet = (next: number, source = sheets) => {
    setSheet(next); const columns = detectCandidateColumns(source[next]?.rows[0] ?? []);
    setNameColumn(columns.name); setEmailColumn(columns.email); setSelectedRows(new Set());
  };
  const candidates = useQuery({ queryKey: ['bulk-invite-candidates', search], queryFn: () => apiData<{ candidates: Candidate[]; hasMore: boolean }>(`/invites/candidates?search=${encodeURIComponent(search)}`), enabled: showDb });
  const delivery = useQuery({ queryKey: ['bulk-invite-status', assessment.id, requestId], queryFn: () => apiData<{ messages: { recipient: string; status: string; error?: string }[] }>(`/invites/bulk-assessment/status?assessmentId=${assessment.id}&requestId=${requestId}`), enabled: submitted, refetchInterval: submitted ? 5000 : false });
  const send = useMutation({ mutationFn: () => apiData<{ count: number; reused: boolean }>('/invites/bulk-assessment', 'post', { assessmentId: assessment.id, requestId, recipients: picked.map(({ name, email }) => ({ name, email })), candidateIds: [...dbSelected.keys()] }), onSuccess: () => setSubmitted(true) });
  const frozen = submitted || send.isPending;
  return <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-3"><section role="dialog" aria-modal="true" aria-label="Bulk assessment invitations" className="card w-full max-w-4xl max-h-[90vh] overflow-auto space-y-4">
    <div className="flex justify-between gap-3"><div><h2 className="text-lg font-semibold">Bulk assessment invitations</h2><p className="text-sm">{assessment.name}</p></div><button type="button" className="btn-outline" disabled={send.isPending} onClick={onClose}>Close</button></div>
    <p className="text-sm text-surface-400">Import candidates, add database candidates, then review your selection before sending. Each email receives an individual single-use assessment link. Duplicate emails are sent once per batch.</p>
    <fieldset disabled={frozen || loading} className="space-y-3">
      <label className="label">Import CSV or Excel (.xlsx)<input className="input mt-1" type="file" accept=".csv,.xlsx" onChange={async event => {
        const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
        const revision = ++importRevision.current; setLoading(true); setFileError('');
        setSheets([]); setSheet(0); setNameColumn(''); setEmailColumn(''); setSelectedRows(new Set()); changed();
        try { const result = await readCandidateFile(file); if (revision !== importRevision.current) return; setSheets(result); chooseSheet(0, result); changed(); }
        catch (error) { setFileError((error as Error).message); }
        finally { if (revision === importRevision.current) setLoading(false); }
      }} /></label>
      {loading && <p role="status">Reading candidate file…</p>}
      {fileError && <p role="alert" className="text-red-400">{fileError}</p>}
      {!!sheets.length && <>
        {sheets.length > 1 && <label className="label">Worksheet<select className="input mt-1" value={sheet} onChange={e => { chooseSheet(Number(e.target.value)); changed(); }}>{sheets.map((item, index) => <option key={index} value={index}>{item.name}</option>)}</select></label>}
        <p className="text-xs text-surface-400">The first row must contain headers. Columns can appear in any order; other columns are ignored. Confirm or change the detected mapping.</p>
        <div className="grid sm:grid-cols-2 gap-3">{(['name', 'email'] as const).map(kind => <label className="label" key={kind}>{kind === 'name' ? 'Candidate name column' : 'Candidate email column'}<select className="input mt-1" value={kind === 'name' ? nameColumn : emailColumn} onChange={e => { if (kind === 'name') setNameColumn(e.target.value); else setEmailColumn(e.target.value); setSelectedRows(new Set()); changed(); }}><option value="">Select column</option>{rows[0]?.map((header, index) => <option key={index} value={index}>{header || '(blank header)'} · Column {index + 1}</option>)}</select></label>)}</div>
        {!validMapping && <p role="status">Select distinct name and email columns to preview candidates.</p>}
        {validMapping && <><button type="button" className="btn-outline text-xs" onClick={() => { setSelectedRows(new Set(preview.filter(row => !row.error).map(row => row.row))); changed(); }}>Select all valid imported candidates</button> <button type="button" className="btn-outline text-xs" onClick={() => { setSelectedRows(new Set()); changed(); }}>Clear imported selection</button>
          <div className="max-h-60 overflow-auto"><table className="w-full text-sm text-left"><thead><tr><th>Select</th><th>Name</th><th>Email</th><th>Row / validation</th></tr></thead><tbody>{preview.map(row => <tr key={row.row}><td><input type="checkbox" aria-label={`Select imported row ${row.row}`} disabled={!!row.error} checked={selectedRows.has(row.row)} onChange={e => { setSelectedRows(old => { const next = new Set(old); if (e.target.checked) next.add(row.row); else next.delete(row.row); return next; }); changed(); }} /></td><td>{row.name}</td><td>{row.email}</td><td>{row.row}{row.error && ` · ${row.error}`}</td></tr>)}</tbody></table></div>
        </>}
      </>}
      <button type="button" className="btn-outline" aria-expanded={showDb} onClick={() => setShowDb(v => !v)}>Add candidates from database</button>
      {showDb && <div className="space-y-2"><label className="label">Search database candidates<input className="input mt-1" value={search} onChange={e => setSearch(e.target.value)} /></label>
        {candidates.isLoading && <p>Loading candidates…</p>}{candidates.error && <p role="alert">{apiError(candidates.error)}</p>}
        {candidates.data?.hasMore && <p className="text-xs">Showing the first 100 matches. Search to narrow the list.</p>}
        <div className="max-h-48 overflow-auto space-y-2">{candidates.data?.candidates.map(candidate => <label className="flex gap-2 text-sm" key={candidate.id}><input type="checkbox" checked={dbSelected.has(candidate.id)} onChange={e => { setDbSelected(old => { const next = new Map(old); if (e.target.checked) next.set(candidate.id, candidate); else next.delete(candidate.id); return next; }); changed(); }} />{candidate.name} · {candidate.email}</label>)}</div>
        {candidates.data?.candidates.length === 0 && <p>No matching database candidates.</p>}
      </div>}
      {!!dbSelected.size && <div className="text-sm"><p>Selected database candidates:</p>{[...dbSelected.values()].map(candidate => <button type="button" className="btn-outline text-xs mr-2" key={candidate.id} onClick={() => { setDbSelected(old => { const next = new Map(old); next.delete(candidate.id); return next; }); changed(); }}>{candidate.name} ({candidate.email}) ×</button>)}</div>}
    </fieldset>
    <p className="font-medium">{uniqueCount} unique recipients selected (maximum 500).</p>
    {!submitted && <button type="button" className="btn-primary" disabled={send.isPending || loading || !uniqueCount || uniqueCount > 500} onClick={() => send.mutate()}>{send.isPending ? 'Queueing invitations…' : `Send assessment invitations to ${uniqueCount} candidates`}</button>}
    {send.error && <p role="alert" className="text-red-400">{apiError(send.error)}</p>}
    {submitted && <><p role="status">{send.data?.count} invitations queued. The mail worker sends them; queued does not mean delivered.</p>
      {delivery.data && <div className="max-h-48 overflow-auto text-sm">{delivery.data.messages.map(row => <p key={row.recipient}>{row.recipient} · {row.status}{row.error ? ` · ${row.error}` : ''}</p>)}</div>}
      {delivery.error && <p role="alert">{apiError(delivery.error)}</p>}
    </>}
  </section></div>;
}
