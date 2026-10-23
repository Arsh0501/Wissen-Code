import ReactMarkdown from 'react-markdown';
import type { Question } from '../../types';

export default function QuestionDescription({ question }: { question: Question }) {
  const samples = question.testCases?.filter((test) => test.isSample) ?? [];
  return <div className="space-y-4">
    <div className="prose prose-invert prose-sm max-w-none"><ReactMarkdown>{question.statement}</ReactMarkdown></div>
    {samples.length > 0 && <section className="space-y-3" aria-label="Sample inputs and outputs">
      <h3 className="font-semibold text-sm">Sample test cases</h3>
      {samples.map((sample, index) => <div key={sample.id ?? index} className="grid sm:grid-cols-2 gap-3">
        <div><h4 className="text-xs font-semibold mb-1">Sample {index + 1} input</h4><pre className="sample-box whitespace-pre-wrap text-xs">{sample.input || '(empty)'}</pre></div>
        <div><h4 className="text-xs font-semibold mb-1">Expected output</h4><pre className="sample-box whitespace-pre-wrap text-xs">{sample.expectedOutput || '(empty)'}</pre></div>
      </div>)}
    </section>}
    {['coding', 'debugging'].includes(question.questionType || 'coding') && !!question.starterCodes?.length &&
      <p className="text-xs text-surface-400">{question.statement.includes('Function contract') ? 'Implement the marked core function; keep the provided input/output driver unchanged.' : 'Use Set to starter code to load the template for your language.'}</p>}
  </div>;
}
