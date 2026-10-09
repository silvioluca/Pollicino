import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // Su GitHub Pages il sito è servito da https://<utente>.github.io/Pollicino/, non dalla radice.
  base: process.env.GITHUB_ACTIONS ? '/Pollicino/' : '/',
  plugins: [react()],
})
