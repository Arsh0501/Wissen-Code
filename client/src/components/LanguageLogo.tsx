import React from 'react';

interface LanguageLogoProps {
  languageId?: number;
  name?: string;
  className?: string;
}

export default function LanguageLogo({
  languageId,
  name,
  className = 'w-4 h-4',
}: LanguageLogoProps) {
  const norm = (name || '').toLowerCase();
  const isPython = languageId === 71 || norm.includes('python');
  const isJava = (languageId === 62 || norm.includes('java')) && !norm.includes('javascript');
  const isCpp = languageId === 54 || norm.includes('c++') || norm === 'cpp';
  const isJs = languageId === 63 || norm.includes('javascript') || norm === 'js' || norm.includes('node');

  if (isPython) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Python logo">
        <path
          d="M11.91 2C6.98 2 7.29 4.14 7.29 4.14l.01 2.22h4.72v.66H5.46S2.85 6.74 2.85 11.7c0 4.95 2.28 4.77 2.28 4.77h1.35v-1.92s-.07-2.28 2.25-2.28h4.71s2.19.04 2.19-2.14V6.28S16.34 2 11.91 2zm-2.54 1.46a.78.78 0 1 1 0 1.56.78.78 0 0 1 0-1.56z"
          fill="#387EB8"
        />
        <path
          d="M12.09 22c4.93 0 4.62-2.14 4.62-2.14l-.01-2.22h-4.72v-.66h6.56s2.61.28 2.61-4.68c0-4.95-2.28-4.77-2.28-4.77h-1.35v1.92s.07 2.28-2.25 2.28H10.8s-2.19-.04-2.19 2.14v4.55S7.66 22 12.09 22zm2.54-1.46a.78.78 0 1 1 0-1.56.78.78 0 0 1 0 1.56z"
          fill="#FFE052"
        />
      </svg>
    );
  }

  if (isJava) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Java logo">
        <path
          d="M8.7 18.2c2.8.6 6.3.3 9-.1-.3.3-.7.6-1.2.9-2.7.6-6.4.6-9.1-.1.3-.2.8-.5 1.3-.7z"
          fill="#E76F00"
        />
        <path
          d="M7.7 16.5c3.7.7 7.8.5 11.5-.2-.4.4-.9.7-1.5 1-3.3.6-7.8.7-11.2-.1.3-.2.7-.5 1.2-.7z"
          fill="#E76F00"
        />
        <path
          d="M11.7 12.1c1.3 1.5-.4 2.9-.4 2.9 3.3-1.7 1.8-4 1.8-4-2.4-2.4-.6-4.9-.6-4.9-2.8 2.7-.9 6-.9 6z"
          fill="#5382A1"
        />
        <path
          d="M16.4 15.3c2.2-1.1 1.2-3.2 1.2-3.2-.4.5-.9.8-1.6 1 1 1.2-.2 1.9-.2 1.9.2.1.4.2.6.3z"
          fill="#E76F00"
        />
        <path
          d="M15.2 6.9s1.7-1.6-1.6-4c-1.2-.9-.8-2-.8-2-2.1 2.4.4 4.2 1.1 4.7 1 .7 1.3 1.3 1.3 1.3z"
          fill="#5382A1"
        />
        <path
          d="M6.5 20.6c3.3.5 7.2.4 10.4-.3-.3.3-.6.5-1 .7-3.5.7-8.3.7-10.9-.1.4-.1 1-.2 1.5-.3z"
          fill="#E76F00"
        />
        <path
          d="M15.4 10.3c2.8.6 4.1 2.4 2.8 3.8-.9.9-2.6 1.4-4.2 1.8 1.3-.4 2.4-.9 3-1.5 1-1.1-.2-2.5-1.6-4.1z"
          fill="#5382A1"
        />
      </svg>
    );
  }

  if (isCpp) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="C++ logo">
        <path
          d="M21.5 15.8L12.9 20.8c-.6.3-1.3.3-1.8 0L2.5 15.8c-.6-.3-.9-.9-.9-1.6V4.2c0-.7.3-1.3.9-1.6L11.1 0.2c.6-.3 1.3-.3 1.8 0l8.6 5c.6.3.9.9.9 1.6v10c0 .7-.3 1.3-.9 1.6z"
          fill="#00599C"
          transform="translate(0, 1.5)"
        />
        <path
          d="M11.6 7.4c-2.8 0-5 2.2-5 5s2.2 5 5 5c1.8 0 3.4-1 4.3-2.4l-1.9-1.1c-.5.8-1.4 1.4-2.4 1.4-1.6 0-2.8-1.3-2.8-2.8s1.3-2.8 2.8-2.8c1 0 1.9.6 2.4 1.4l1.9-1.1c-.9-1.5-2.5-2.6-4.3-2.6z"
          fill="#FFFFFF"
        />
        <path
          d="M15.8 11.4h.9v-.9h.8v.9h.9v.8h-.9v.9h-.8v-.9h-.9v-.8zm3.6 0h.9v-.9h.8v.9h.9v.8h-.9v.9h-.8v-.9h-.9v-.8z"
          fill="#FFFFFF"
        />
      </svg>
    );
  }

  if (isJs) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="JavaScript logo">
        <rect width="24" height="24" rx="3" fill="#F7DF1E" />
        <path
          d="M6.5 16.5c.5.8 1.2 1.5 2.2 2 1.6.8 3.5.6 4.7-.5 1-.9 1.5-2.3 1.5-3.6 0-3.3-2.5-4.2-4.7-5.1-.8-.3-1.7-.7-1.7-1.4 0-.6.5-1.1 1.3-1.1.7 0 1.3.3 1.8.8l1.4-1.5C12 5.3 11 4.8 9.8 4.8c-2 0-3.4 1.3-3.4 3.2 0 2.8 2.1 3.7 4.2 4.5 1 .4 2.2.9 2.2 1.8 0 .8-.7 1.4-1.8 1.4-.9 0-1.7-.5-2.3-1.3l-2.2 2.1z"
          fill="#000000"
          transform="translate(4, 0.5) scale(0.75)"
        />
        <path
          d="M4.5 14.5c.5.8 1.1 1.4 1.9 1.8.7.4 1.5.6 2.3.6 1.4 0 2.2-.7 2.2-2.1V5.2H8.6v9.3c0 .5-.3.8-.8.8-.4 0-.8-.2-1.1-.5l-2.2-1.1z"
          fill="#000000"
          transform="translate(0, 0.5) scale(0.75)"
        />
      </svg>
    );
  }

  return null;
}
