/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        gold: "#D4AF37",
        black: "#000000",
        silver: "#C0C0C0",
      },
    },
  },
  plugins: [require("tailwind-scrollbar")],
};
