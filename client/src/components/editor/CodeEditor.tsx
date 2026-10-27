import { lazy, Suspense, type ComponentProps } from 'react';
import type Editor from '@monaco-editor/react';
const LocalEditor = lazy(async () => {
  if (import.meta.env.MODE !== 'test') await import('../../app/monaco');
  return import('@monaco-editor/react');
});
export default function CodeEditor(props: ComponentProps<typeof Editor>) {
  return (
    <Suspense
      fallback={
        <p role="status" className="p-5">
          Loading editor…
        </p>
      }
    >
      <LocalEditor {...props} />
    </Suspense>
  );
}
