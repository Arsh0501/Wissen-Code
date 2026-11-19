import RoleSelect from '../../components/ui/RoleSelect';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import AdminLayout from '../../components/layout/AdminLayout';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
type Member = {
  id: number;
  name: string;
  email: string;
  role: string;
  isGuest: boolean;
  _count?: { sessions: number };
};
export default function TeamPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const owner = (user?.accessRole ?? user?.role) === 'admin';
  const [search, setSearch] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<Member | null>(null);
  const [notice, setNotice] = useState('');
  const query = useQuery({
    queryKey: ['team-users', search],
    queryFn: () => apiData<Member[]>(`/users?search=${encodeURIComponent(search)}`),
    enabled: owner,
  });
  const update = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      apiData(`/users/${id}/role`, 'put', { role }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['team-users'] }),
  });
  const revoke = useMutation({
    mutationFn: (member: Member) =>
      apiData<{ revokedSessions: number }>(`/users/${member.id}/revoke-sessions`, 'post'),
    onSuccess: (result, member) => {
      setNotice(`${member.email}: ${result.revokedSessions} login session(s) revoked.`);
      return client.invalidateQueries({ queryKey: ['team-users'] });
    },
  });
  return (
    <AdminLayout
      title="Team access"
      subtitle="Manage user access, login sessions, and team permissions."
    >
      {!owner ? (
        <p className="card">Only an administrator can manage team access.</p>
      ) : (
        <div className="space-y-5">
          <section className="card overflow-auto">
            <h2 className="font-semibold mb-4">Accounts</h2>
            <input
              className="input mb-4"
              aria-label="Search accounts"
              placeholder="Search name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {notice && (
              <p role="status" className="mb-3">
                {notice}
              </p>
            )}
            {revoke.error && <p role="alert">{apiError(revoke.error)}</p>}
            {revokeTarget && (
              <ConfirmDialog
                title="Log out user from all devices?"
                description={`Revoke all login sessions for ${revokeTarget.email}? This interrupts any assessment in progress without resetting its timer or attempts. Accounts and results are kept.${revokeTarget.isGuest ? ' This guest cannot recover the same assessment after logout using the current guest flow.' : ''}${revokeTarget.id === user?.id ? ' This will also log you out.' : ''}`}
                confirmLabel="Log out all devices"
                onCancel={() => setRevokeTarget(null)}
                onConfirm={() => {
                  const member = revokeTarget;
                  setRevokeTarget(null);
                  setNotice('');
                  revoke.mutate(member);
                }}
              />
            )}
            {query.error && <p role="alert">{apiError(query.error)}</p>}
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-3">Member</th>
                  <th>Role</th>
                  <th>Active sessions</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.map((m) => (
                  <tr className="border-t border-surface-800" key={m.id}>
                    <td className="p-3">
                      {m.name}
                      <p className="text-surface-500">{m.email}</p>
                    </td>
                    <td>
                      {m.isGuest ? (
                        <span>Guest candidate</span>
                      ) : (
                        <RoleSelect
                          label={`Role for ${m.name}`}
                          disabled={m.id === user?.id || update.isPending}
                          value={m.role}
                          onChange={(role) => update.mutate({ id: m.id, role })}
                        />
                      )}
                    </td>
                    <td className="p-3">
                      {(m._count?.sessions ?? 0) > 0 ? (
                        <button
                          className="inline-flex min-w-9 items-center justify-center rounded-lg px-3 py-1.5 font-semibold text-primary-600 underline decoration-dotted underline-offset-4 hover:bg-primary-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50"
                          aria-label={`${m._count!.sessions} active sessions for ${m.email}. Log out all devices`}
                          title="Log out all devices"
                          disabled={revoke.isPending}
                          onClick={() => {
                            revoke.reset();
                            setRevokeTarget(m);
                          }}
                        >
                          {m._count!.sessions}
                        </button>
                      ) : (
                        <span className="px-3 text-surface-500">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {update.error && <p role="alert">{apiError(update.error)}</p>}
          </section>
        </div>
      )}
    </AdminLayout>
  );
}
