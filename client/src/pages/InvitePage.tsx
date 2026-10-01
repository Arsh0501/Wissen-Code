import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPublicInvite, joinInvite, apiError } from '../services/api';
import { formatDate } from '../components/ui';
import ThemeToggle from '../components/ThemeToggle';
import { Code2, Clock, FileText, Target, Calendar, ArrowRight, AlertTriangle, ShieldCheck, Link2Off } from 'lucide-react';
import styles from './InvitePage.module.css';
import type { PublicInvite } from '../types';
import { INVITE_PAGE_MESSAGES as MSG } from '../constants';

// Public landing page for a shared test link: shows the test and asks only for name + email
export default function InvitePage() {
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const { user, signInWithToken } = useAuth();
  const [invite, setInvite] = useState<PublicInvite | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [hasAccount, setHasAccount] = useState(false);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    getPublicInvite(token).then(setInvite).catch((err) => setLoadError(apiError(err, MSG.linkCouldNotOpened)));
  }, [token]);

  async function handleJoin(e: FormEvent) {
    e.preventDefault();
    setError('');
    setHasAccount(false);
    setJoining(true);
    try {
      const res = await joinInvite(token, { name, email });
      signInWithToken(res.user, res.token);
      navigate(`/exam/${res.assessmentId}`, { replace: true });
    } catch (err: any) {
      setHasAccount(err?.response?.data?.code === 'HAS_ACCOUNT');
      setError(apiError(err, MSG.couldNotStartTest));
      setJoining(false);
    }
  }

  const a = invite?.assessment;

  return (
    <div className={styles.codeBox}>
      <div className={styles.box} />
      <div className={styles.box2} />

      <ThemeToggle className={styles.themeToggle} />
      <div className={styles.codeBox2}>
        <div className={styles.codeBox3}>
          <div className={styles.codeBox4}>
            <Code2 className={styles.codeIcon} />
          </div>
          <span className={styles.wissenCodeLabel}>WissenCode</span>
        </div>

        {loadError ? (
          <div className={styles.link2offBox}>
            <div className={styles.link2offBox2}>
              <Link2Off className={styles.link2offIcon} />
            </div>
            <h1 className={styles.linkNotAvailableTitle}>Link not available</h1>
            <p className={styles.loadErrorText}>{loadError}</p>
          </div>
        ) : !invite || !a ? (
          <div className={styles.box3}>
            <div className={styles.box4} />
          </div>
        ) : (
          <div className={styles.youAposVeBox}>
            <div className={styles.youAposVeBox2}>
              <p className={styles.youAposVeText}>{MSG.youveBeenInvitedCoding}</p>
              <h1 className={styles.nameTitle}>{a.name}</h1>
              {a.description && <p className={styles.loadErrorText}>{a.description}</p>}
              <div className={styles.box5}>
                {[
                  { icon: Clock, label: 'Time', value: `${a.timeLimitMinutes} min` },
                  { icon: FileText, label: 'Questions', value: String(a.questionCount) },
                  { icon: Target, label: 'Pass mark', value: `${a.passingScore}%` },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className={styles.labelBox}>
                    <div className={styles.labelBox2}><Icon className={styles.icon} /> {label}</div>
                    <div className={styles.valueBox}>{value}</div>
                  </div>
                ))}
              </div>
              {a.endAt && (
                <p className={styles.availableUntilText}><Calendar className={styles.calendarIcon} /> Available until {formatDate(a.endAt)}</p>
              )}
            </div>

            {invite.canJoin ? (
              <form onSubmit={handleJoin} className={styles.invNameForm}>
                {user && (
                  <p className={styles.youAposReText}>
                    {MSG.youreCurrentlySigned}<b className={styles.nameBox}>{user.name}</b>{MSG.continuingSwitchDetailsBelow}</p>
                )}
                <div>
                  <label className="label" htmlFor="inv-name">Full name</label>
                  <input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} className="input" autoComplete="name" required minLength={2} maxLength={80} autoFocus />
                </div>
                <div>
                  <label className="label" htmlFor="inv-email">Email</label>
                  <input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" autoComplete="email" required maxLength={200} />
                  <p className={styles.useTheSameText}>{MSG.useSameEmailIf}</p>
                </div>

                {error && (
                  <div className={styles.errorBox}>
                    {error}
                    {hasAccount && (
                      <button type="button" onClick={() => navigate('/login')} className={styles.goToSignButton}>{MSG.goSign}</button>
                    )}
                  </div>
                )}

                <div className={styles.shieldCheckBox}>
                  <ShieldCheck className={styles.shieldCheckIcon} />
                  <span>{MSG.timerStartsOnlyWhen}<b className={styles.startAssessmentBox}>Start Assessment</b> {MSG.nextScreenDuringTest}</span>
                </div>

                <button type="submit" disabled={joining} className={styles.button}>
                  {joining ? 'Opening test...' : <>Continue to test <ArrowRight className={styles.arrowRightIcon} /></>}
                </button>
              </form>
            ) : (
              <div className={styles.alertTriangleBox}>
                <div className={styles.alertTriangleBox2}>
                  <AlertTriangle className={styles.alertTriangleIcon} />
                  <span>{invite.problem}</span>
                </div>
                <p className={styles.ifYouThinkText}>{MSG.ifThinkMistakeContact}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
