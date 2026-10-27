import { describe, it, expect } from 'vitest';
import { getStarterCodeForLanguage, getAvailableQuestionLanguages } from './starterCodes';

describe('starterCodes helper', () => {
  it('offers prepared languages so candidates receive a question-specific starter', () => {
    expect(
      getAvailableQuestionLanguages({
        starterCodes: [
          { languageId: 71, languageName: 'Python', code: 'def solve(n): pass' },
        ] as any,
      }),
    ).toEqual([{ id: 71, name: 'Python' }]);
  });
  it('returns generic starter code when question has no custom starters', () => {
    const pythonCode = getStarterCodeForLanguage(null, 71);
    expect(pythonCode).toContain('def solve():');

    const jsCode = getStarterCodeForLanguage(null, 63);
    expect(jsCode).toContain("require('fs')");

    const javaCode = getStarterCodeForLanguage(null, 62);
    expect(javaCode).toContain('public class Main');

    const cppCode = getStarterCodeForLanguage(null, 54);
    expect(cppCode).toContain('#include <iostream>');

    const sqlCode = getStarterCodeForLanguage(null, 82);
    expect(sqlCode).toContain('SELECT * FROM');
  });

  it('prefers question starterCodes array when matching language is available', () => {
    const question = {
      starterCodes: [
        { languageId: 71, languageName: 'Python', code: 'print("custom python")' },
        { languageId: 63, languageName: 'JavaScript', code: 'console.log("custom js");' },
      ],
    };

    expect(getStarterCodeForLanguage(question, 71)).toBe('print("custom python")');
    expect(getStarterCodeForLanguage(question, 63)).toBe('console.log("custom js");');
    // Non-configured language falls back to default template
    expect(getStarterCodeForLanguage(question, 62)).toContain('public class Main');
  });

  it('uses starterCodePython when languageId is 71 and starterCodes array is empty', () => {
    const question = {
      starterCodePython: 'def twoSum(): pass',
      starterCodes: [],
    };

    expect(getStarterCodeForLanguage(question, 71)).toBe('def twoSum(): pass');
    expect(getStarterCodeForLanguage(question, 63)).toContain("require('fs')");
  });
});
