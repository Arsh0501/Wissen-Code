/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Built dynamically as `badge-${difficulty}`, so the scanner can't see them
  safelist: ['badge-easy', 'badge-medium', 'badge-hard'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Neutral scale driven by CSS variables (see index.css) — values are set for the light theme,
        // where low numbers are dark ink and high numbers are light backgrounds.
        surface: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((n) => [
            n,
            `rgb(var(--surface-${n}) / <alpha-value>)`,
          ])
        ),
        // Heading/emphasis ink (was literal white in the dark theme)
        white: 'rgb(var(--ink) / <alpha-value>)',
        // Text that sits on a solid accent background (buttons, badges, avatars)
        'on-accent': '#ffffff',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
};
