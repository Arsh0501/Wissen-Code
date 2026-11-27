import { useState } from 'react';
import { Link } from 'react-router-dom';
import AdminLayout from '../../components/layout/AdminLayout';
import CodingQuestionWizard from '../../components/questions/CodingQuestionWizard';
import MCQQuestionsStudio from './MCQQuestionsStudio';
export default function AIQuestions() {
  const [type, setType] = useState<'coding' | 'mcq'>('coding');
  return (
    <AdminLayout
      title="AI Questions"
      eyebrow={null}
      actions={
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div
            className="ai-question-studio inline-flex gap-1 rounded-xl border border-surface-700 p-1"
            role="tablist"
            aria-label="Question type"
          >
            {(['coding', 'mcq'] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={type === t}
                className={type === t ? 'btn-primary' : 'btn-ghost'}
                onClick={() => setType(t)}
              >
                {t === 'coding' ? 'Coding' : 'MCQ'}
              </button>
            ))}
          </div>
          <Link to="/admin/questions" className="btn-outline">
            Question Bank
          </Link>
        </div>
      }
    >
      {type === 'coding' ? <CodingQuestionWizard /> : <MCQQuestionsStudio />}
    </AdminLayout>
  );
}
