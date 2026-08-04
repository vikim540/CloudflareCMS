/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ─── Vercel-Inspired Design Tokens (DESIGN.md) ───
        // Surface
        border: '#ebebeb',        // hairline — 1px dividers, input borders
        input: '#ebebeb',         // alias of border for form inputs
        ring: '#171717',          // ink — focus ring
        background: '#ffffff',    // canvas — pure white card surface
        foreground: '#171717',    // ink — primary text on light surfaces

        // Primary (ink-near-black CTA)
        primary: {
          DEFAULT: '#171717',     // ink — the single primary CTA color
          foreground: '#ffffff',  // on-primary — white text on ink
        },

        // Secondary (canvas-soft surface)
        secondary: {
          DEFAULT: '#fafafa',     // canvas-soft — 98% white, default page bg
          foreground: '#171717',  // ink text on soft surface
        },

        // Destructive (error red)
        destructive: {
          DEFAULT: '#ee0000',     // error — validation/destructive
          foreground: '#ffffff',
        },

        // Muted (inset surface + low-priority text)
        muted: {
          DEFAULT: '#f5f5f5',     // canvas-soft-2 — 95% white, inset regions
          foreground: '#888888',  // mute — lowest-priority text
        },

        // Accent (same as muted, for hover/active states)
        accent: {
          DEFAULT: '#f5f5f5',
          foreground: '#171717',
        },

        // ─── Extended semantic tokens ───
        link: {
          DEFAULT: '#0070f3',     // link blue — primary link color
          deep: '#0761d1',        // pressed/visited
        },
        success: '#0070f3',       // Vercel: success === link blue
        warning: {
          DEFAULT: '#f5a623',     // caution/pending
          soft: '#ffefcf',        // soft background
          deep: '#ab570a',        // pressed text
        },
        body: '#4d4d4d',          // secondary body text
        canvas: {
          DEFAULT: '#ffffff',     // pure white
          soft: '#fafafa',        // 98% white — page background
          soft2: '#f5f5f5',       // 95% white — inset regions
        },
        hairline: {
          DEFAULT: '#ebebeb',     // 1px dividers
          strong: '#a1a1a1',      // 500-level gray, stronger divider
        },
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',                // --geist-radius: base UI (inputs, buttons)
        md: '8px',                // --geist-marketing-radius: cards
        lg: '12px',               // larger card chrome (pricing, modals)
        xl: '16px',               // largest card (hero image cap)
        '2xl': '20px',
        '3xl': '24px',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'monospace'],
      },
      boxShadow: {
        // Stacked shadows per DESIGN.md elevation system
        // Level 1 — inset hairline (default card chrome)
        'level-1': '0 0 0 1px #00000014',
        // Level 2 — subtle drop (template-grid, marketing-card)
        'level-2': '0px 1px 1px #00000005, 0px 2px 2px #0000000a, 0 0 0 1px #ebebeb',
        // Level 3 — soft stack (feature-grid cards)
        'level-3': '0px 2px 2px #0000000a, 0px 8px 8px -8px #0000000a, 0 0 0 1px #ebebeb',
        // Level 4 — float stack (pricing cards, callout panels)
        'level-4': '0px 2px 2px #0000000a, 0px 8px 16px -4px #0000000a, 0 0 0 1px #ebebeb',
        // Level 5 — modal (dialogs, dropdowns)
        'level-5': '0px 1px 1px #00000005, 0px 8px 16px -4px #0000000a, 0px 24px 32px -8px #0000000f, 0 0 0 1px #ebebeb',
      },
    },
  },
  plugins: [],
}
