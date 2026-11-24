import { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
import {
  candidateRows,
  detectCandidateColumns,
  readCandidateFile,
  type ImportSheet,
} from '../../services/candidateImport';

type Candidate = { id: number; name: string; email: string };
export default function BulkAssessmentInvites({
  assessment,
  onClose,
}: {
  assessment: { id: number; name: string };
  onClose: () => void;
}) {
  const [sheets, setSheets] = useState<ImportSheet[]>([]),
    [sheet, setSheet] = useState(0);
  const [nameColumn, setNameColumn] = useState(''),
    [emailColumn, setEmailColumn] = useState('');
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [dbSelected, setDbSelected] = useState<Map<number, Candidate>>(new Map());
  const [showDb, setShowDb] = useState(false),
    [search, setSearch] = useState('');
  const [fileError, setFileError] = useState(''),
    [loading, setLoading] = useState(false);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [submitted, setSubmitted] = useState(false);
  const importRevision = useRef(0);
  const rows = sheets[sheet]?.rows ?? [];
  const validMapping = nameColumn !== '' && emailColumn !== '' && nameColumn !== emailColumn;
  const preview = useMemo(
    () => (validMapping ? candidateRows(rows, Number(nameColumn), Number(emailColumn)) : []),
    [rows, nameColumn, emailColumn],
  );
  const delivery = useQuery({
    queryKey: ['bulk-invite-status', assessment.id],
    queryFn: () =>
      apiData<{ messages: { recipient: string; status: string; error?: string }[] }>(
        `/invites/bulk-assessment/status?assessmentId=${assessment.id}`,
      ),
    refetchInterval: (query) =>
      query.state.data?.messages.some((row) => ['pending', 'sending'].includes(row.status))
        ? 3000
        : false,
  });
  const existing = new Map(
    (delivery.data?.messages ?? []).map((row) => [row.recipient.toLowerCase(), row.status]),
  );
  const deliveryLabel = (status: string) =>
    ({
      pending: 'Pending / queued for sending',
      sending: 'Sending - waiting for email provider',
      sent: 'Done sending',
      failed: 'Failed after retries',
    })[status] || status;
  const picked = preview.filter(
    (row) => !row.error && selectedRows.has(row.row) && !existing.has(row.email.toLowerCase()),
  );
  const pickedDb = [...dbSelected.values()].filter((row) => !existing.has(row.email.toLowerCase()));
  const uniqueCount = new Set([
    ...picked.map((row) => row.email),
    ...pickedDb.map((row) => row.email.toLowerCase()),
  ]).size;
  const changed = () => {
    setRequestId(crypto.randomUUID());
    send.reset();
  };
  const chooseSheet = (next: number, source = sheets) => {
    setSheet(next);
    const columns = detectCandidateColumns(source[next]?.rows[0] ?? []);
    setNameColumn(columns.name);
    setEmailColumn(columns.email);
    setSelectedRows(new Set());
  };
  const candidates = useQuery({
    queryKey: ['bulk-invite-candidates', search],
    queryFn: () =>
      apiData<{ candidates: Candidate[]; hasMore: boolean }>(
        `/invites/candidates?search=${encodeURIComponent(search)}`,
      ),
    enabled: showDb,
  });
  const send = useMutation({
    mutationFn: () =>
      apiData<{ count: number; reused: boolean; queuedCount?: number; skippedCount?: number }>(
        '/invites/bulk-assessment',
        'post',
        {
          assessmentId: assessment.id,
          requestId,
          recipients: picked.map(({ name, email }) => ({ name, email })),
          candidateIds: pickedDb.map((row) => row.id),
        },
      ),
    onSuccess: async () => {
      setSubmitted(true);
      await delivery.refetch();
    },
  });
  const frozen = submitted || send.isPending;
  return createPortal(
    <div
      data-bulk-invite-modal
      className="fixed inset-0 z-[80] bg-black/70 flex items-center justify-center p-3"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Bulk assessment invitations"
        className="card w-full max-w-4xl max-h-[90dvh] overflow-hidden !p-0 flex flex-col"
      >
        <div className="flex items-center justify-between gap-3 border-b border-surface-800 px-5 py-4 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">Bulk assessment invitations</h2>
            <p className="text-sm text-surface-500 mt-1 break-words">{assessment.name}</p>
          </div>
          <button type="button" className="btn-outline" disabled={send.isPending} onClick={onClose}>
            Close
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-5 space-y-5">
          <fieldset disabled={frozen || loading} className="space-y-4 min-w-0">
            <label className="label">
              Import CSV or Excel (.xlsx)
              <input
                className="input mt-2 file:mr-3 file:rounded-md file:border-0 file:bg-primary-500/10 file:px-3 file:py-1.5 file:text-primary-600 file:font-medium"
                type="file"
                accept=".csv,.xlsx"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (!file) return;
                  const revision = ++importRevision.current;
                  setLoading(true);
                  setFileError('');
                  setSheets([]);
                  setSheet(0);
                  setNameColumn('');
                  setEmailColumn('');
                  setSelectedRows(new Set());
                  changed();
                  try {
                    const result = await readCandidateFile(file);
                    if (revision !== importRevision.current) return;
                    setSheets(result);
                    chooseSheet(0, result);
                    changed();
                  } catch (error) {
                    setFileError((error as Error).message);
                  } finally {
                    if (revision === importRevision.current) setLoading(false);
                  }
                }}
              />
            </label>
            {loading && <p role="status">Reading candidate file…</p>}
            {fileError && (
              <p role="alert" className="text-red-400">
                {fileError}
              </p>
            )}
            {!!sheets.length && (
              <>
                {sheets.length > 1 && (
                  <label className="label">
                    Worksheet
                    <select
                      className="input mt-1"
                      value={sheet}
                      onChange={(e) => {
                        chooseSheet(Number(e.target.value));
                        changed();
                      }}
                    >
                      {sheets.map((item, index) => (
                        <option key={index} value={index}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="grid sm:grid-cols-2 gap-3 rounded-xl border border-surface-800 bg-surface-950/40 p-4">
                  {(['name', 'email'] as const).map((kind) => (
                    <label className="label" key={kind}>
                      {kind === 'name' ? 'Candidate name column' : 'Candidate email column'}
                      <select
                        className="input mt-1"
                        value={kind === 'name' ? nameColumn : emailColumn}
                        onChange={(e) => {
                          if (kind === 'name') setNameColumn(e.target.value);
                          else setEmailColumn(e.target.value);
                          setSelectedRows(new Set());
                          changed();
                        }}
                      >
                        <option value="">Select column</option>
                        {rows[0]?.map((header, index) => (
                          <option key={index} value={index}>
                            {header || '(blank header)'} · Column {index + 1}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                {!validMapping && (
                  <p role="status">Select distinct name and email columns to preview candidates.</p>
                )}
                {validMapping && (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold">
                        Imported candidates ({preview.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="btn-outline text-xs"
                          onClick={() => {
                            setSelectedRows(
                              new Set(
                                preview
                                  .filter(
                                    (row) => !row.error && !existing.has(row.email.toLowerCase()),
                                  )
                                  .map((row) => row.row),
                              ),
                            );
                            changed();
                          }}
                        >
                          Select all valid imported candidates
                        </button>
                        <button
                          type="button"
                          className="btn-outline text-xs"
                          onClick={() => {
                            setSelectedRows(new Set());
                            changed();
                          }}
                        >
                          Clear imported selection
                        </button>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-auto rounded-xl border border-surface-700">
                      <table className="w-full min-w-[600px] text-sm text-left">
                        <thead className="sticky top-0 z-10 bg-surface-900 text-xs text-surface-500">
                          <tr>
                            <th scope="col" className="px-4 py-3 w-16">
                              Select
                            </th>
                            <th scope="col" className="px-4 py-3">
                              Name
                            </th>
                            <th scope="col" className="px-4 py-3">
                              Email
                            </th>
                            <th scope="col" className="px-4 py-3">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.map((row) => (
                            <tr
                              key={row.row}
                              className={`border-t border-surface-800 ${selectedRows.has(row.row) ? 'bg-primary-500/5' : ''}`}
                            >
                              <td className="px-4 py-3 align-top">
                                <input
                                  type="checkbox"
                                  className="accent-primary-500"
                                  aria-label={`Select imported row ${row.row}`}
                                  disabled={!!row.error || existing.has(row.email.toLowerCase())}
                                  checked={selectedRows.has(row.row)}
                                  onChange={(e) => {
                                    setSelectedRows((old) => {
                                      const next = new Set(old);
                                      if (e.target.checked) next.add(row.row);
                                      else next.delete(row.row);
                                      return next;
                                    });
                                    changed();
                                  }}
                                />
                              </td>
                              <td className="px-4 py-3 align-top break-words max-w-[200px]">
                                {row.name}
                              </td>
                              <td className="px-4 py-3 align-top break-all">{row.email}</td>
                              <td className="px-4 py-3 align-top text-xs">
                                <span className="block text-surface-500 mb-1">Row {row.row}</span>
                                {row.error ? (
                                  <span className="text-red-600">{row.error}</span>
                                ) : (
                                  !existing.has(row.email.toLowerCase()) && (
                                    <span className="text-emerald-600">Ready</span>
                                  )
                                )}
                                {existing.has(row.email.toLowerCase()) && (
                                  <span className="block text-xs text-surface-400">
                                    {deliveryLabel(existing.get(row.email.toLowerCase())!)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </>
            )}
            <button
              type="button"
              className="btn-outline"
              aria-expanded={showDb}
              onClick={() => setShowDb((v) => !v)}
            >
              Add candidates from database
            </button>
            {showDb && (
              <div className="space-y-3 rounded-xl border border-surface-700 p-4">
                <label className="label">
                  Search database candidates
                  <input
                    className="input mt-1"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                {candidates.isLoading && <p>Loading candidates…</p>}
                {candidates.error && <p role="alert">{apiError(candidates.error)}</p>}
                {candidates.data?.hasMore && (
                  <p className="text-xs">
                    Showing the first 100 matches. Search to narrow the list.
                  </p>
                )}
                <div className="max-h-48 overflow-auto space-y-2">
                  {candidates.data?.candidates.map((candidate) => (
                    <label
                      className="flex items-start gap-2 text-sm rounded-lg border border-surface-800 p-3 break-all"
                      key={candidate.id}
                    >
                      <input
                        type="checkbox"
                        disabled={existing.has(candidate.email.toLowerCase())}
                        checked={dbSelected.has(candidate.id)}
                        onChange={(e) => {
                          setDbSelected((old) => {
                            const next = new Map(old);
                            if (e.target.checked) next.set(candidate.id, candidate);
                            else next.delete(candidate.id);
                            return next;
                          });
                          changed();
                        }}
                      />
                      {candidate.name} · {candidate.email}
                      {existing.has(candidate.email.toLowerCase()) && (
                        <span className="text-xs text-surface-400">
                          {deliveryLabel(existing.get(candidate.email.toLowerCase())!)}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
                {candidates.data?.candidates.length === 0 && (
                  <p>No matching database candidates.</p>
                )}
              </div>
            )}
            {!!dbSelected.size && (
              <div className="text-sm space-y-2">
                <p className="font-semibold">Selected database candidates</p>
                <div className="flex flex-wrap gap-2">
                  {[...dbSelected.values()].map((candidate) => (
                    <button
                      type="button"
                      className="btn-outline text-xs max-w-full break-all"
                      key={candidate.id}
                      onClick={() => {
                        setDbSelected((old) => {
                          const next = new Map(old);
                          next.delete(candidate.id);
                          return next;
                        });
                        changed();
                      }}
                    >
                      {candidate.name} ({candidate.email}) ×
                    </button>
                  ))}
                </div>
              </div>
            )}
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-800 pt-4">
            <p className="text-sm font-medium">
              {uniqueCount} recipients selected{' '}
              <span className="text-xs text-surface-500 font-normal">/ 500 maximum</span>
            </p>
            {!submitted && (
              <button
                type="button"
                className="btn-primary"
                disabled={
                  send.isPending ||
                  delivery.isLoading ||
                  loading ||
                  !uniqueCount ||
                  uniqueCount > 500
                }
                onClick={() => send.mutate()}
              >
                {send.isPending
                  ? 'Queueing invitations…'
                  : `Send assessment invitations to ${uniqueCount} candidates`}
              </button>
            )}
          </div>
          {send.error && (
            <p role="alert" className="text-red-400">
              {apiError(send.error)}
            </p>
          )}
          {submitted && (
            <p role="status">
              {send.data?.queuedCount ?? send.data?.count} invitations queued.{' '}
              {send.data?.skippedCount ?? 0} already invited candidates skipped. Queued does not
              mean delivered.
            </p>
          )}
          {delivery.isLoading && (
            <p role="status">Checking invitations already sent for this assessment...</p>
          )}
          {!!delivery.data?.messages.length && (
            <section
              aria-label="Invitation sending status"
              className="rounded-xl border border-surface-700 overflow-hidden"
            >
              <div className="p-4 border-b border-surface-800 space-y-2">
                <h3 className="font-semibold">Invitation sending status</h3>
                <p role="status" className="text-sm">
                  {delivery.data.messages.filter((row) => row.status === 'sent').length} done
                  sending |{' '}
                  {
                    delivery.data.messages.filter((row) =>
                      ['pending', 'sending'].includes(row.status),
                    ).length
                  }{' '}
                  still pending |{' '}
                  {delivery.data.messages.filter((row) => row.status === 'failed').length} failed
                </p>
              </div>
              <div className="max-h-48 overflow-auto text-sm divide-y divide-surface-800">
                {delivery.data.messages.map((row) => (
                  <div
                    key={row.recipient}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                  >
                    <span className="min-w-0 break-all">{row.recipient}</span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${row.status === 'sent' ? 'bg-emerald-500/10 text-emerald-600' : row.status === 'failed' ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-600'}`}
                    >
                      {deliveryLabel(row.status)}
                    </span>
                    {row.error && (
                      <p className="w-full text-xs text-red-600 break-words">{row.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          {delivery.error && (
            <p role="alert">
              {apiError(delivery.error)}{' '}
              <button className="btn-outline text-xs" onClick={() => delivery.refetch()}>
                Refresh invitation status
              </button>
            </p>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
