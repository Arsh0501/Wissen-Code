import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import AdminLayout from '../../components/AdminLayout';
import { Spinner, EmptyState, formatDate } from '../../components/ui';
import { apiError } from '../../services/api';
import { listInterviews } from '../../services/interviews';
import { Plus, MessagesSquare, Clock, ChevronRight, CalendarDays } from 'lucide-react';
import styles from './InterviewList.module.css';
import { INTERVIEW_STATUS_LABELS, RECOMMENDATION_LABELS, INTERVIEW_LIST_MESSAGES as MSG } from '../../constants';
import type { InterviewStatus, Recommendation } from '../../types';

export const STATUS_BADGE: Record<InterviewStatus, { label: string; className: string }> = {
  planned: { label: INTERVIEW_STATUS_LABELS.planned, className: styles.plannedClassName },
  in_progress: { label: INTERVIEW_STATUS_LABELS.in_progress, className: styles.inProgressClassName },
  completed: { label: INTERVIEW_STATUS_LABELS.completed, className: styles.completedClassName },
};

export const RECOMMENDATION: Record<Exclude<Recommendation, ''>, { label: string; className: string }> = {
  strong_hire: { label: RECOMMENDATION_LABELS.strong_hire, className: styles.strongHireClassName },
  hire: { label: RECOMMENDATION_LABELS.hire, className: styles.hireClassName },
  no_hire: { label: RECOMMENDATION_LABELS.no_hire, className: styles.noHireClassName },
  strong_no_hire: { label: RECOMMENDATION_LABELS.strong_no_hire, className: styles.strongNoHireClassName },
};

export default function InterviewList() {
  const { data, isLoading, error } = useQuery({ queryKey: ['interviews'], queryFn: listInterviews });

  return (
    <AdminLayout
      title="Interviews"
      subtitle={MSG.planInterviewsAiRun}
      actions={<Link to="/admin/interviews/new" className={styles.newInterviewLink}><Plus className={styles.plusIcon} /> New interview</Link>}
    >
      {isLoading ? (
        <Spinner label="Loading interviews..." />
      ) : error ? (
        <p className={styles.pText}>{apiError(error, MSG.failedLoadInterviews)}</p>
      ) : !data?.length ? (
        <EmptyState
          icon={MessagesSquare}
          title="No interviews yet"
          body={MSG.createInterviewGetAi}
          action={<Link to="/admin/interviews/new" className="btn-primary"><Plus className={styles.plusIcon} /> New interview</Link>}
        />
      ) : (
        <div className={styles.box}>
          <ul className={styles.ulList}>
            {data.map((i) => {
              const status = STATUS_BADGE[i.status];
              const rec = i.recommendation ? RECOMMENDATION[i.recommendation] : null;
              return (
                <li key={i.id}>
                  <Link to={`/admin/interviews/${i.id}`} className={styles.questionsLink}>
                    <div className={styles.candidateNameBox}>
                      <div className={styles.candidateNameBox2}>
                        <p className={styles.candidateNameText}>{i.candidateName}</p>
                        <span className={`${styles.label} ${status.className}`}>{status.label}</span>
                        {rec && <span className={`${styles.label} ${rec.className}`}>{rec.label}</span>}
                      </div>
                      <p className={styles.clockText}>
                        {i.role && <span>{i.role}</span>}
                        <span className={styles.durationMinutesLabel}><Clock className={styles.clockIcon} /> {i.durationMinutes} min</span>
                        {i.scheduledAt && <span className={styles.durationMinutesLabel}><CalendarDays className={styles.clockIcon} /> {formatDate(i.scheduledAt)}</span>}
                        <span>{i.skills.join(', ')}</span>
                      </p>
                    </div>
                    <span className={styles.questionsLabel}>
                      {i._count?.questions ?? 0} questions <ChevronRight className={styles.plusIcon} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </AdminLayout>
  );
}
