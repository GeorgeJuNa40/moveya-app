import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Id único de esta compilación. Se inyecta en la app (__BUILD_ID__) y se escribe
// en dist/version.json. La app compara ambos para detectar un despliegue nuevo y
// recargarse sola (ver src/lib/version.ts).
const BUILD_ID = String(Date.now());

// Escribe dist/version.json al terminar el build (para el auto-refresco).
function versionFilePlugin() {
  return {
    name: 'moveya-version-file',
    closeBundle() {
      try {
        writeFileSync(resolve(__dirname, 'dist/version.json'), JSON.stringify({ id: BUILD_ID }));
      } catch {
        /* si falla, la app simplemente no auto-recarga; no es crítico */
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), versionFilePlugin()],
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  server: {
    port: 5173,
    host: true,
  },
});
