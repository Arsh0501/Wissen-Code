import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Code2, Shield, UserCheck } from 'lucide-react';

export default function LoginPage() {
  const { login } = useAuth();
  const [name, setName] = useState('');
  const [selectedRole, setSelectedRole] = useState<'admin' | 'examinee'>('examinee');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    login(selectedRole, name.trim());
  };

  return (
    <div className="min-h-screen bg-surface-950 flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary-400/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-600/30">
              <Code2 className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">WissenCode</h1>
              <p className="text-xs text-surface-500 uppercase tracking-widest">Assessment Platform</p>
            </div>
          </div>
          <p className="text-surface-400 text-sm">Sign in to continue to the platform</p>
        </div>

        {/* Login Card */}
        <div className="card">
          <form onSubmit={handleLogin} className="space-y-6">
            {/* Name Input */}
            <div>
              <label className="label">Your Name</label>
              <input
                type="text"
                className="input"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Role Selection */}
            <div>
              <label className="label">Select Role</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedRole('admin')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                    selectedRole === 'admin'
                      ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                      : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                  }`}
                >
                  <Shield className="w-8 h-8" />
                  <span className="text-sm font-medium">Admin</span>
                  <span className="text-xs text-surface-500">Manage questions</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedRole('examinee')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                    selectedRole === 'examinee'
                      ? 'border-primary-500 bg-primary-500/10 text-primary-300'
                      : 'border-surface-700 bg-surface-800 text-surface-400 hover:border-surface-600'
                  }`}
                >
                  <UserCheck className="w-8 h-8" />
                  <span className="text-sm font-medium">Candidate</span>
                  <span className="text-xs text-surface-500">Take assessment</span>
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={!name.trim()}
              className="btn-primary w-full py-3 text-base"
            >
              Continue as {selectedRole === 'admin' ? 'Admin' : 'Candidate'}
            </button>
          </form>
        </div>

        <p className="text-center text-surface-600 text-xs mt-6">
          Demo prototype — no real authentication
        </p>
      </div>
    </div>
  );
}
