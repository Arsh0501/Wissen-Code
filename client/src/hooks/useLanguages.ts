import { useState, useEffect } from 'react';
import { fetchJudgeLanguages, FALLBACK_LANGUAGES, type AppLanguage } from '../services/languages';

export function useLanguages() {
  const [languages, setLanguages] = useState<AppLanguage[]>(FALLBACK_LANGUAGES);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetchJudgeLanguages().then((langs) => {
      if (mounted) {
        setLanguages(langs);
        setLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  return { languages, loading };
}
