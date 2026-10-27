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
};
export default function TeamPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const owner = (user?.accessRole ?? user?.role) === 'admin';
  const query = useQuery({
    queryKey: ['team-users'],
    queryFn: () => apiData<Member[]>('/users'),
    enabled: owner,
  });
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('interviewer');
  const invite = useMutation({
    mutationFn: () => apiData('/users/invite', 'post', { name, email, role }),
    onSuccess: () => {
      setName('');
      setEmail('');
      return client.invalidateQueries({ queryKey: ['team-users'] });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      apiData(`/users/${id}/role`, 'put', { role }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['team-users'] }),
  });
  return (
    <AdminLayout title="Team access" subtitle="Manage administrator and interviewer permissions.">
      {!owner ? (
        <p className="card">Only an administrator can manage team access.</p>
      ) : (
        <div className="space-y-5">
          <section className="card space-y-4">
            <h2 className="font-semibold">Invite a team member</h2>
            <p className="text-sm text-surface-500">
              Administrators manage team access, assessments, and candidate operations. Interviewers
              work with their assigned interviews. Role changes revoke existing login sessions.
            </p>
            <form
              className="grid sm:grid-cols-2 gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                invite.mutate();
              }}
            >
              <label className="label">
                Name
                <input
                  required
                  className="input mt-2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="label">
                Email
                <input
                  required
                  type="email"
                  className="input mt-2"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="label">
                Role
                <select
                  className="input mt-2"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {['interviewer', 'admin'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <button className="btn-primary self-end" disabled={invite.isPending}>
                Send invitation
              </button>
            </form>
            {invite.isSuccess && <p role="status">Team invitation queued. Check email delivery.</p>}
            {invite.error && <p role="alert">{apiError(invite.error)}</p>}
          </section>
          <section className="card overflow-auto">
            <h2 className="font-semibold mb-4">Accounts</h2>
            {query.error && <p role="alert">{apiError(query.error)}</p>}
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-3">Member</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {query.data
                  ?.filter((m) => !m.isGuest)
                  .map((m) => (
                    <tr className="border-t border-surface-800" key={m.id}>
                      <td className="p-3">
                        {m.name}
                        <p className="text-surface-500">{m.email}</p>
                      </td>
                      <td>
                        <select
                          aria-label={`Role for ${m.name}`}
                          className="input"
                          disabled={m.id === user?.id || update.isPending}
                          value={m.role}
                          onChange={(e) => update.mutate({ id: m.id, role: e.target.value })}
                        >
                          {['candidate', 'interviewer', 'admin'].map((v) => (
                            <option key={v}>{v}</option>
                          ))}
                        </select>
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
