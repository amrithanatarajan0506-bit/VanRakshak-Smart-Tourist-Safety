/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* ── Tiranga Palette (Saffron / Green / Navy) ── */
        "primary":                   "#FF9933", // Saffron
        "on-primary":                "#FFFFFF",
        "primary-container":         "#FFD9DF",
        "on-primary-container":      "#3B001F",
        "primary-fixed":             "#FFD9DF",
        "primary-fixed-dim":         "#FFB1C5",
        "on-primary-fixed":          "#3B001F",
        "on-primary-fixed-variant":  "#762045",
        "inverse-primary":           "#FFB1C5",

        "secondary":                 "#138808", // Green
        "on-secondary":              "#FFFFFF",
        "secondary-container":       "#CFE9D3",
        "on-secondary-container":    "#0E3821",
        "secondary-fixed":           "#CFE9D3",
        "secondary-fixed-dim":       "#B3CCB8",
        "on-secondary-fixed":        "#062111",
        "on-secondary-fixed-variant":"#344D3A",

        "tertiary":                  "#000080", // Navy Blue
        "on-tertiary":               "#FFFFFF",
        "tertiary-container":        "#FFD8EB",
        "on-tertiary-container":     "#36001B",
        "tertiary-fixed":            "#FFD8EB",
        "tertiary-fixed-dim":        "#F1B4D6",
        "on-tertiary-fixed":         "#3E0021",
        "on-tertiary-fixed-variant": "#713256",

        "error":                     "#BA1A1A",
        "on-error":                  "#FFFFFF",
        "error-container":           "#FFDAD6",
        "on-error-container":        "#410002",

        "surface":                   "#FFFFFF",
        "surface-dim":               "#DCDAD4",
        "surface-bright":            "#FCFAF5",
        "surface-container-lowest":  "#FFFFFF",
        "surface-container-low":     "#FCFAF5",
        "surface-container":         "#F6F4EF",
        "surface-container-high":    "#F0EFEA",
        "surface-container-highest": "#E4E3DE",
        "surface-tint":              "#FF9933",
        "surface-variant":           "#E4E2DB",
        "inverse-surface":           "#30302C",
        "inverse-on-surface":        "#F4F0E8",

        "on-surface":                "#1B1C18",
        "on-surface-variant":        "#494741",
        "on-background":             "#1B1C18",
        "background":                "#FFFFFF",

        "outline":                   "#787670",
        "outline-variant":           "#C8C6BF",
      },

      borderRadius: {
        DEFAULT: "0.125rem",
        sm:      "0.125rem",
        md:      "0.25rem",
        lg:      "0.25rem",
        xl:      "0.5rem",
        full:    "0.75rem",
      },

      spacing: {
        unit:             "4px",
        xs:               "4px",
        sm:               "8px",
        md:               "16px",
        lg:               "24px",
        xl:               "48px",
        gutter:           "16px",
        "margin-mobile":  "16px",
        "margin-desktop": "64px",
      },

      fontFamily: {
        "headline-lg": ["Literata", "Georgia", "serif"],
        "headline-md": ["Literata", "Georgia", "serif"],
        "headline-sm": ["Literata", "Georgia", "serif"],
        "body-lg":     ["Hanken Grotesk", "Inter", "sans-serif"],
        "body-md":     ["Hanken Grotesk", "Inter", "sans-serif"],
        "data-mono":   ["JetBrains Mono", "Fira Code", "monospace"],
        "label-caps":  ["JetBrains Mono", "Fira Code", "monospace"],
      },

      fontSize: {
        "headline-lg": ["40px", { lineHeight: "1.2",  letterSpacing: "-0.02em", fontWeight: "600" }],
        "headline-md": ["28px", { lineHeight: "1.3",  fontWeight: "500" }],
        "headline-sm": ["20px", { lineHeight: "1.4",  fontWeight: "500" }],
        "body-lg":     ["18px", { lineHeight: "1.6",  fontWeight: "400" }],
        "body-md":     ["16px", { lineHeight: "1.5",  fontWeight: "400" }],
        "data-mono":   ["14px", { lineHeight: "1.2",  letterSpacing: "0.05em", fontWeight: "400" }],
        "label-caps":  ["12px", { lineHeight: "1",    letterSpacing: "0.1em",  fontWeight: "600" }],
      },
    },
  },
  plugins: [],
}
