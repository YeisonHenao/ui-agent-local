/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#09090b",
        panel: "#111114",
        line: "#27272a",
        accent: "#a3e635"
      },
      boxShadow: {
        glow: "0 0 32px rgba(163, 230, 53, .10)"
      }
    }
  },
  plugins: []
};
