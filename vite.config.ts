import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base: './' permite desplegar bajo cualquier ruta y funciona en vite preview
// sin red (public/bundles viaja dentro del build).
export default defineConfig({
  plugins: [react()],
  base: './',
})
