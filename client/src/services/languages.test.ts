import { describe, it, expect } from 'vitest';
import { getMonacoLanguage, getDefaultComment } from './languages';

describe('languages service', () => {
  it('maps Judge0 languages correctly to Monaco modes', () => {
    expect(getMonacoLanguage('Python (3.8.1)')).toBe('python');
    expect(getMonacoLanguage('Python (3.12.5)')).toBe('python');
    expect(getMonacoLanguage('Java (OpenJDK 13.0.1)')).toBe('java');
    expect(getMonacoLanguage('Java (JDK 17.0.6)')).toBe('java');
    expect(getMonacoLanguage('C++ (GCC 9.2.0)')).toBe('cpp');
    expect(getMonacoLanguage('C++ (Clang 7.0.1)')).toBe('cpp');
    expect(getMonacoLanguage('C (GCC 9.2.0)')).toBe('c');
    expect(getMonacoLanguage('JavaScript (Node.js 12.14.0)')).toBe('javascript');
    expect(getMonacoLanguage('JavaScript (Node.js 22.08.0)')).toBe('javascript');
    expect(getMonacoLanguage('TypeScript (3.7.4)')).toBe('typescript');
    expect(getMonacoLanguage('TypeScript (5.6.2)')).toBe('typescript');
    expect(getMonacoLanguage('Go (1.18.5)')).toBe('go');
    expect(getMonacoLanguage('Go (1.23.5)')).toBe('go');
    expect(getMonacoLanguage('Rust (1.40.0)')).toBe('rust');
    expect(getMonacoLanguage('Rust (1.85.0)')).toBe('rust');
    expect(getMonacoLanguage('Ruby (2.7.0)')).toBe('ruby');
    expect(getMonacoLanguage('C# (Mono 6.6.0.161)')).toBe('csharp');
    expect(getMonacoLanguage('Kotlin (2.1.10)')).toBe('kotlin');
    expect(getMonacoLanguage('SQL (SQLite 3.27.2)')).toBe('sql');
    expect(getMonacoLanguage('Bash (5.0.0)')).toBe('shell');
    expect(getMonacoLanguage('Pascal (FPC 3.0.4)')).toBe('pascal');
    expect(getMonacoLanguage('Lua (5.3.5)')).toBe('lua');
    expect(getMonacoLanguage('Perl (5.28.1)')).toBe('perl');
    expect(getMonacoLanguage('PHP (8.3.11)')).toBe('php');
    expect(getMonacoLanguage('Swift (5.2.3)')).toBe('swift');
  });

  it('provides appropriate starter code fallback comments for different languages', () => {
    expect(getDefaultComment('python')).toBe('# Write your solution here\n');
    expect(getDefaultComment('ruby')).toBe('# Write your solution here\n');
    expect(getDefaultComment('shell')).toBe('# Write your solution here\n');
    expect(getDefaultComment('sql')).toBe('-- Write your solution here\n');
    expect(getDefaultComment('lua')).toBe('-- Write your solution here\n');
    expect(getDefaultComment('haskell')).toBe('-- Write your solution here\n');
    expect(getDefaultComment('clojure')).toBe('; Write your solution here\n');
    expect(getDefaultComment('pascal')).toBe('(* Write your solution here *)\n');
    expect(getDefaultComment('cpp')).toBe('// Write your solution here\n');
    expect(getDefaultComment('java')).toBe('// Write your solution here\n');
    expect(getDefaultComment('javascript')).toBe('// Write your solution here\n');
    expect(getDefaultComment('go')).toBe('// Write your solution here\n');
    expect(getDefaultComment('rust')).toBe('// Write your solution here\n');
  });
});
