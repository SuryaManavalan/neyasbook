/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                serif: ['"EB Garamond"', 'serif'],
                display: ['"Playfair Display"', 'serif'],
            },
            colors: {
                paper: '#F9F7F2',
                ink: '#2C2C2B',
                accent: '#D4AF37', // Gold/Brass accent
            }
        },
    },
    plugins: [],
}
