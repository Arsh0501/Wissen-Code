import ReactMarkdown from 'react-markdown';
import type { Question } from '../../types';
import { ChevronDown } from 'lucide-react';
import { questionSections } from '../../services/questionSections';

export default function QuestionDescription({
  question,
  collapsible = false,
}: {
  question: Question;
  collapsible?: boolean;
}) {
  const samples = question.testCases?.filter((test) => test.isSample) ?? [];
  return (
    <div className="space-y-4 min-w-0 max-w-full [overflow-wrap:anywhere]">
      <div className="prose prose-invert prose-sm min-w-0 max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_pre]:[overflow-wrap:anywhere] [&_code]:[overflow-wrap:anywhere] [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto [&_img]:max-w-full">
        {collapsible ? (
          questionSections(question.statement).map((section, index) => (
            <details
              key={`${question.id}:${index}`}
              open={section.title.toLowerCase() === 'question' || undefined}
              className="group rounded-xl border border-surface-700 my-3 overflow-hidden"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-surface-100 [&::-webkit-details-marker]:hidden hover:bg-primary-500/5">
                <span>{section.title}</span>
                <ChevronDown
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-primary-600 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="border-t border-surface-800 px-4 py-3">
                <ReactMarkdown>{section.body}</ReactMarkdown>
              </div>
            </details>
          ))
        ) : (
          <ReactMarkdown>{question.statement}</ReactMarkdown>
        )}
      </div>
      {samples.length > 0 && (
        <details
          open={collapsible ? undefined : true}
          className="group space-y-3"
          aria-label="Sample inputs and outputs"
        >
          <summary
            className={`flex items-center justify-between gap-3 font-semibold text-sm ${collapsible ? 'cursor-pointer list-none rounded-xl border border-surface-700 px-4 py-3 [&::-webkit-details-marker]:hidden' : 'hidden'}`}
          >
            Sample test cases
            <ChevronDown
              aria-hidden="true"
              className="h-4 w-4 text-primary-600 transition-transform group-open:rotate-180"
            />
          </summary>
          {!collapsible && <h3 className="font-semibold text-sm">Sample test cases</h3>}
          {samples.map((sample, index) => (
            <div key={sample.id ?? index} className="grid sm:grid-cols-2 gap-3 min-w-0">
              <div className="min-w-0">
                <h4 className="text-xs font-semibold mb-1">Sample {index + 1} input</h4>
                <pre className="sample-box whitespace-pre-wrap text-xs max-w-full [overflow-wrap:anywhere]">
                  {sample.input || '(empty)'}
                </pre>
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold mb-1">Expected output</h4>
                <pre className="sample-box whitespace-pre-wrap text-xs max-w-full [overflow-wrap:anywhere]">
                  {sample.expectedOutput || '(empty)'}
                </pre>
              </div>
            </div>
          ))}
        </details>
      )}
      {!collapsible &&
        ['coding', 'debugging'].includes(question.questionType || 'coding') &&
        !!question.starterCodes?.length &&
        !question.statement.includes('Function contract') && (
          <p className="text-xs text-surface-400">
            Use Set to starter code to load the template for your language.
          </p>
        )}
    </div>
  );
}
