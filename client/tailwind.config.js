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
          50: '#f0f0ff',
          100: '#e0e0ff',
          200: '#c4b5fd',
          300: '#a78bfa',
          400: '#8b5cf6',
          500: '#7c3aed',
          600: '#6d28d9',
          700: '#5b21b6',
          800: '#4c1d95',
          900: '#3b0764',
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
