import { getLanguages } from './api';
import type { Language } from '../types';

export interface AppLanguage {
  id: number;
  name: string;
  monacoLang: string;
}

export const MAIN_LANGUAGES: AppLanguage[] = [
  { id: 54, name: 'C++', monacoLang: 'cpp' },
  { id: 71, name: 'Python', monacoLang: 'python' },
  { id: 62, name: 'Java', monacoLang: 'java' },
  { id: 63, name: 'JavaScript', monacoLang: 'javascript' },
];

export const FALLBACK_LANGUAGES: AppLanguage[] = MAIN_LANGUAGES;

/**
 * Maps Judge0 language name to a Monaco Editor language identifier.
 */
export function getMonacoLanguage(name: string): string {
  const n = (name || '').toLowerCase();
  if (n.startsWith('c++')) return 'cpp';
  if (n.startsWith('c#')) return 'csharp';
  if (n.startsWith('c ') || n.startsWith('c(')) return 'c';
  if (n.includes('python')) return 'python';
  if (n.includes('javascript') || n.includes('node.js')) return 'javascript';
  if (n.includes('typescript')) return 'typescript';
  if (n.includes('java') && !n.includes('javascript')) return 'java';
  if (n.includes('kotlin')) return 'kotlin';
  if (n.startsWith('go ') || n.startsWith('go(') || n === 'go') return 'go';
  if (n.includes('rust')) return 'rust';
  if (n.includes('ruby')) return 'ruby';
  if (n.includes('php')) return 'php';
  if (n.includes('swift')) return 'swift';
  if (n.includes('sql')) return 'sql';
  if (n.includes('bash') || n.includes('shell')) return 'shell';
  if (n.includes('lua')) return 'lua';
  if (n.includes('perl')) return 'perl';
  if (n.includes('pascal')) return 'pascal';
  if (n.includes('scala')) return 'scala';
  if (n.includes('r ') || n.includes('r(')) return 'r';
  if (n.includes('f#')) return 'fsharp';
  if (n.includes('basic')) return 'vb';
  if (n.includes('objective-c')) return 'objective-c';
  if (n.includes('haskell')) return 'haskell';
  if (n.includes('clojure')) return 'clojure';
  if (n.includes('elixir')) return 'elixir';
  if (n.includes('erlang')) return 'erlang';
  if (n.includes('dart')) return 'dart';
  if (n.includes('lisp')) return 'scheme';
  return 'plaintext';
}

/**
 * Returns a clean starter comment template appropriate for the language's syntax.
 */
export function getDefaultComment(monacoLang: string): string {
  switch (monacoLang) {
    case 'python':
    case 'ruby':
    case 'shell':
    case 'perl':
    case 'r':
    case 'elixir':
      return '# Write your solution here\n';
    case 'sql':
    case 'lua':
    case 'haskell':
      return '-- Write your solution here\n';
    case 'clojure':
    case 'scheme':
      return '; Write your solution here\n';
    case 'pascal':
      return '(* Write your solution here *)\n';
    case 'fortran':
      return '! Write your solution here\n';
    default:
      return '// Write your solution here\n';
  }
}

// In-memory cache for client session
let cachedAppLanguages: AppLanguage[] | null = null;
let languageFetchPromise: Promise<AppLanguage[]> | null = null;

export async function fetchJudgeLanguages(): Promise<AppLanguage[]> {
  if (cachedAppLanguages && cachedAppLanguages.length > 0) {
    return cachedAppLanguages;
  }
  if (languageFetchPromise) {
    return languageFetchPromise;
  }

  languageFetchPromise = (async () => {
    try {
      const rawList: Language[] = await getLanguages();
      if (Array.isArray(rawList) && rawList.length > 0) {
        const mainIds = new Set([54, 71, 62, 63]);
        const filtered = rawList.filter((item) => mainIds.has(item.id));
        const listToUse = filtered.length > 0 ? filtered : MAIN_LANGUAGES;
        const mapped: AppLanguage[] = listToUse.map((item) => ({
          id: item.id,
          name: item.name,
          monacoLang: item.monacoLang || getMonacoLanguage(item.name),
        }));
        cachedAppLanguages = mapped;
        return mapped;
      }
    } catch (err) {
      console.warn('Failed to fetch Judge0 languages, using fallback:', err);
    } finally {
      languageFetchPromise = null;
    }
    return MAIN_LANGUAGES;
  })();

  return languageFetchPromise;
}
