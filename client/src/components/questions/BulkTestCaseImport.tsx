import { useState } from 'react';
import { apiData } from '../../services/workflows';
import { apiError } from '../../services/api';
type ImportedCase = { input: string; expectedOutput: string; isSample: boolean };
export default function BulkTestCaseImport({
  remaining,
  onImport,
}: {
  remaining: number;
  onImport: (cases: ImportedCase[]) => void;
}) {
  const [preview, setPreview] = useState<ImportedCase[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  return (
    <section className="card space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Import test cases</h2>
        <details className="text-sm">
          <summary className="cursor-pointer text-primary-600 font-medium">
            Text file format
          </summary>
          <div className="mt-3 rounded-xl border border-surface-700 bg-surface-950 p-4 space-y-3">
            <p>
              Start each case with sample or hidden. The last line is the expected output; preceding
              lines are input.
            </p>
            <pre className="text-xs whitespace-pre-wrap">
              {'sample\n3\n1 2 3\n6\nhidden\n2\n10 20\n30'}
            </pre>
            <p>
              One-line output only. Use manual entry for multiline or empty output, or input
              containing a line that is exactly sample or hidden.
            </p>
          </div>
        </details>
      </div>
      <label className="label block">
        Upload test cases (.txt)
        <input
          className="input mt-2"
          type="file"
          accept=".txt,text/plain"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setPreview([]);
            setError('');
            setNotice('');
            if (!/\.txt$/i.test(file.name) || file.size > 256000) {
              setError('Choose a .txt file smaller than 250 KB.');
              return;
            }
            setBusy(true);
            try {
              const result = await apiData<{ testCases: ImportedCase[] }>(
                '/questions/testcases/parse',
                'post',
                { text: await file.text() },
              );
              if (result.testCases.length > remaining)
                throw new Error(`Only ${Math.max(0, remaining)} more test cases can be added.`);
              setPreview(result.testCases);
            } catch (error) {
              setError(apiError(error));
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      <p className="text-xs text-surface-500">
        Up to 100 cases per question. Preview the file before adding it.
      </p>
      {busy && <p role="status">Reading test cases...</p>}
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {!!preview.length && (
        <>
          <div className="max-h-72 overflow-auto rounded-xl border border-surface-700">
            <table className="w-full text-sm text-left">
              <thead className="sticky top-0 bg-surface-900">
                <tr>
                  {['Type', 'Input', 'Expected output'].map((label) => (
                    <th key={label} className="p-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((test, index) => (
                  <tr key={index} className="border-t border-surface-800">
                    <td className="p-3 align-top">{test.isSample ? 'Sample' : 'Hidden'}</td>
                    <td className="p-3 align-top">
                      <pre className="whitespace-pre-wrap break-all">{test.input || '(empty)'}</pre>
                    </td>
                    <td className="p-3 align-top">
                      <pre className="whitespace-pre-wrap break-all">{test.expectedOutput}</pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-outline" onClick={() => setPreview([])}>
              Cancel import
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={preview.length > remaining}
              onClick={() => {
                onImport(preview);
                setNotice(`${preview.length} test cases added. Save the question to keep them.`);
                setPreview([]);
              }}
            >
              Add {preview.length} test cases
            </button>
          </div>
        </>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-600">
          {notice}
        </p>
      )}
    </section>
  );
}
