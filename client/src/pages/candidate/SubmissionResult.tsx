import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getSubmissionResults } from '../../services/api';
import { formatDate, formatDuration, scoreTextClass, PassFailBadge, Spinner } from '../../components/ui';
import type { SubmissionResult as SubmissionResultType, QuestionEvaluation } from '../../types';
import {
  Code2, CheckCircle, XCircle, Trophy, ArrowLeft, Clock, Award, Target, EyeOff, ChevronDown, MinusCircle,
} from 'lucide-react';
import styles from './SubmissionResult.module.css';
import { SUBMISSION_RESULT_MESSAGES as MSG } from '../../constants';

function QuestionResult({ q, index }: { q: QuestionEvaluation; index: number }) {
  const [open, setOpen] = useState(false);
  const results = q.submission?.testCaseResults ?? [];

  return (
    <div className={styles.chevronDownBox}>
      <button onClick={() => setOpen(!open)} className={styles.chevronDownButton}>
        <div className={styles.qBox}>
          <h4 className={styles.qTitle}>Q{index + 1}. {q.title}</h4>
          <div className={styles.difficultyBox}>
            <span className={`badge-${q.difficulty}`}>{q.difficulty}</span>
            {q.attempted ? <span>{q.submission?.languageName}</span> : <span className={styles.notAttemptedLabel}>Not attempted</span>}
          </div>
        </div>
        <div className={styles.chevronDownBox2}>
          <div className={styles.passedTestCasesBox}>
            <p className={styles.passedTestCasesText}>{q.passedTestCases}/{q.totalTestCases} tests</p>
            <p className={`${styles.marksObtainedText} ${scoreTextClass(q.score)}`}>
              {q.marksObtained}<span className={styles.label}>/{q.marks}</span>
            </p>
          </div>
          <ChevronDown className={`${styles.chevronDownIcon} ${open ? styles.chevronDownIconOpen : ''}`} />
        </div>
      </button>

      {/* Test case strip */}
      {results.length > 0 && (
        <div className={styles.testCaseBox}>
          {results.map((r, i) => (
            <div
              key={r.id}
              className={`${styles.testBox} ${r.passed ? styles.testBoxPassed : styles.testBoxDefault}`}
              title={`Test ${i + 1}: ${r.statusDesc} (${r.testCase?.isSample ? 'sample' : 'hidden'})`}
            >
              {r.passed ? <CheckCircle className={styles.checkCircleIcon} /> : <XCircle className={styles.checkCircleIcon} />}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className={styles.testCaseBox2}>
          {results.length === 0 ? (
            <p className={styles.noAnswerWasText}>{MSG.noAnswerWasSubmitted}</p>
          ) : (
            <table className={styles.testTable}>
              <thead>
                <tr className={styles.testRow}>
                  <th className={styles.testTh}>Test</th>
                  <th className={styles.testTh}>Type</th>
                  <th className={styles.testTh}>Verdict</th>
                  <th className={styles.timeTh}>Time</th>
                  <th className={styles.timeTh}>Memory</th>
                </tr>
              </thead>
              <tbody className={styles.testCaseBody}>
                {results.map((r, i) => (
                  <tr key={r.id}>
                    <td className={styles.testCaseCell}>#{i + 1}</td>
                    <td className={styles.testCaseCell2}>
                      {r.testCase?.isSample ? 'Sample' : <span className={styles.hiddenLabel}><EyeOff className={styles.eyeOffIcon} /> Hidden</span>}
                    </td>
                    <td className={`${styles.statusDescCell} ${r.passed ? styles.statusDescCellPassed : styles.statusDescCellDefault}`}>{r.statusDesc}</td>
                    <td className={styles.testCaseCell3}>{r.executionTime != null ? `${r.executionTime}s` : '—'}</td>
                    <td className={styles.testCaseCell3}>{r.memoryUsed != null ? `${Math.round(r.memoryUsed / 1024)} MB` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function SubmissionResult() {
  const { assessmentId } = useParams();
  const { candidateName } = useAuth();
  const navigate = useNavigate();
  const [result, setResult] = useState<SubmissionResultType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!assessmentId || !candidateName) return;
    loadResults();
  }, [assessmentId, candidateName]);

  async function loadResults() {
    try {
      setLoading(true);
      setError('');
      setResult(await getSubmissionResults(parseInt(assessmentId!), candidateName));
    } catch {
      setError(MSG.resultsNotFoundYet);
    } finally {
      setLoading(false);
    }
  }

  const e = result?.evaluation;

  return (
    <div className={styles.arrowLeftBox}>
      <header className={styles.arrowLeftHeader}>
        <div className={styles.arrowLeftBox2}>
          <div className={styles.codeBox}>
            <div className={styles.codeBox2}>
              <Code2 className={styles.codeIcon} />
            </div>
            <span className={styles.wissenCodeLabel}>WissenCode</span>
          </div>
          <button onClick={() => navigate('/exam')} className={styles.backToDashboardButton}>
            <ArrowLeft className={styles.arrowLeftIcon} /> Back to Dashboard
          </button>
        </div>
      </header>

      <main className={styles.testCaseMain}>
        {loading ? (
          <Spinner label="Loading results..." />
        ) : error || !e ? (
          <div className={styles.trophyBox}>
            <Trophy className={styles.trophyIcon} />
            <h2 className={styles.testSubmittedTitle}>Test Submitted!</h2>
            <p className={styles.yourTestHasText}>{MSG.testHasBeenSubmitted}</p>
            <p className={styles.errorText}>{error}</p>
            <button onClick={loadResults} className={styles.loadResultsButton}>Refresh Results</button>
          </div>
        ) : result?.resultsHidden ? (
          <div className={styles.checkCircleBox}>
            <div className={styles.checkCircleBox2}>
              <CheckCircle className={styles.checkCircleIcon2} />
            </div>
            <h2 className={styles.nameTitle}>{e.assessment.name}</h2>
            <p className={styles.thankYouText}>
              Thank you, <span className={styles.candidateNameLabel}>{e.candidateName}</span>{MSG.answersHaveBeenSubmitted}{e.finishedAt && <> on {formatDate(e.finishedAt)}</>}.
            </p>
            <p className={styles.scoresForThisText}>
              <EyeOff className={styles.arrowLeftIcon} /> {MSG.scoresAssessmentSharedHiring}</p>
          </div>
        ) : (
          <div className={styles.nameBox}>
            {/* Headline */}
            <div className={styles.trophyBox}>
              <p className={styles.nameText}>{e.assessment.name}</p>
              <div className={styles.yourResultBox}>
                <h2 className={styles.yourResultTitle}>Your result</h2>
                <PassFailBadge passed={!!e.passed} />
              </div>
              <p className={`${styles.headlineText} ${scoreTextClass(e.percentage ?? 0)}`}>
                {(e.percentage ?? 0).toFixed(1)}%
              </p>
              <p className={styles.marksObtainedText2}>
                {e.marksObtained} of {e.totalMarks} marks · passing score {e.assessment.passingScore}%
              </p>

              <div className={styles.awardBox}>
                <div className={styles.awardBox2}>
                  <Award className={styles.awardIcon} />
                  <p className={styles.lengthText}>
                    {e.questions?.filter((q) => q.score === 100).length}/{e.questions?.length}
                  </p>
                  <p className={styles.fullySolvedText}>Fully solved</p>
                </div>
                <div className={styles.awardBox2}>
                  <Target className={styles.awardIcon} />
                  <p className={styles.lengthText}>
                    {e.questions?.reduce((a, q) => a + q.passedTestCases, 0)}/{e.questions?.reduce((a, q) => a + q.totalTestCases, 0)}
                  </p>
                  <p className={styles.fullySolvedText}>Tests passed</p>
                </div>
                <div className={styles.awardBox2}>
                  <Clock className={styles.awardIcon} />
                  <p className={styles.lengthText}>{formatDuration(e.timeTakenSeconds)}</p>
                  <p className={styles.fullySolvedText}>of {e.assessment.timeLimitMinutes} min</p>
                </div>
              </div>
            </div>

            <div className={styles.questionWiseResultsBox}>
              <div className={styles.questionWiseResultsBox2}>
                <h3 className={styles.questionWiseResultsTitle}>Question-wise results</h3>
                <span className={styles.hiddenTestOutputsLabel}>
                  <MinusCircle className={styles.eyeOffIcon} /> {MSG.hiddenTestOutputsNot}</span>
              </div>
              {e.questions?.map((q, i) => <QuestionResult key={q.questionId} q={q} index={i} />)}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
