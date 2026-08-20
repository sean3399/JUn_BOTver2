/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx}",
    "./components/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        teams: {
          purple: "#5B5FC7",
          purpleDark: "#464775",
          purpleLight: "#EBEBF9",
          bubble: "#E1DFFD",
          bg: "#FAF9F8",
          sidebar: "#F5F5F5",
          border: "#E1E1E1",
          text: "#242424",
          muted: "#616161",
          green: "#6BB700",
        },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", "Segoe UI", "Malgun Gothic", "sans-serif"],
      },
    },
  },
  plugins: [],
};
