import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ─────────────────────────────────────
      // DSAT Design Tokens
      // ─────────────────────────────────────
      colors: {
        // Brand — Indigo (professional, premium, distinctive)
        primary: {
          50:  '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#4F46E5',  // Main brand
          600: '#4338CA',
          700: '#3730A3',
          800: '#312E81',
          900: '#1E1B4B',
        },

        // Neutral (premium dark)
        neutral: {
          50:  '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
          950: '#020617',
        },

        // Semantic
        success: { DEFAULT: '#10B981', light: '#D1FAE5', dark: '#065F46' },
        warning: { DEFAULT: '#F59E0B', light: '#FEF3C7', dark: '#78350F' },
        error:   { DEFAULT: '#EF4444', light: '#FEE2E2', dark: '#7F1D1D' },
        info:    { DEFAULT: '#3B82F6', light: '#DBEAFE', dark: '#1E3A5F' },

        // Math module color
        math:    { DEFAULT: '#7C3AED', light: '#EDE9FE' },
        // R&W module color
        rw:      { DEFAULT: '#059669', light: '#ECFDF5' },

        // Difficulty
        easy:   '#10B981',
        medium: '#F59E0B',
        hard:   '#EF4444',
      },

      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },

      fontSize: {
        xs:   ['12px', { lineHeight: '16px' }],
        sm:   ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg:   ['18px', { lineHeight: '28px' }],
        xl:   ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '36px' }],
        '4xl': ['36px', { lineHeight: '40px' }],
      },

      spacing: {
        // 8px grid
        '1':  '4px',
        '2':  '8px',
        '3':  '12px',
        '4':  '16px',
        '5':  '20px',
        '6':  '24px',
        '8':  '32px',
        '10': '40px',
        '12': '48px',
        '16': '64px',
        '20': '80px',
        '24': '96px',
      },

      borderRadius: {
        none:  '0',
        sm:    '4px',
        DEFAULT: '6px',
        md:    '8px',
        lg:    '12px',
        xl:    '16px',
        '2xl': '24px',
        full:  '9999px',
      },

      boxShadow: {
        sm:  '0 1px 2px 0 rgb(0 0 0 / 0.05)',
        DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
        md:  '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        lg:  '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
        xl:  '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      },

      // Test engine fullscreen
      screens: {
        'xs':    '375px',
        'sm':    '640px',
        'md':    '768px',
        'lg':    '1024px',
        'xl':    '1280px',
        '2xl':   '1536px',
      },

      // Sidebar width
      width: {
        'sidebar':       '240px',
        'sidebar-sm':    '64px',
      },
    },
  },
  plugins: [],
}

export default config
