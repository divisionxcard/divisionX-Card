/** @type {import('tailwindcss').Config} */
const { dxColors } = require("./components/shared/design-tokens")

module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // DivisionX Design System — ใช้ผ่าน class `bg-dx-*`, `text-dx-*`, `border-dx-*`
        dx: dxColors,
      },
      boxShadow: {
        // Neon cyan glow effects (ตามรูป brand)
        "dx-glow":      "0 0 0 1px rgba(0,212,255,0.4), 0 0 16px rgba(0,212,255,0.25)",
        "dx-glow-soft": "0 0 0 1px rgba(0,212,255,0.2), 0 0 8px rgba(0,212,255,0.10)",
        "dx-card":      "0 2px 8px rgba(0,0,0,0.3)",
      },
    },
  },
  plugins: [],
}
