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
          50: '#faf7ff',
          100: '#f0e8ff',
          200: '#e2d2fc',
          300: '#c9aff5',
          400: '#ad86ed',
          500: '#9569e4',
          600: '#8055df',
          700: '#6b3fc4',
          800: '#583398',
          900: '#472b7a',
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
