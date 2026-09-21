import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { StoreProvider } from './lib/store';
import './lib/pwa'; // registra el listener de "instalar app" cuanto antes
import { startVersionWatch } from './lib/version'; // auto-actualización al nuevo deploy
import './index.css';

// Revisa si hay una versión nueva publicada y, de haberla, recarga sola.
startVersionWatch();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <StoreProvider>
        <App />
      </StoreProvider>
    </HashRouter>
  </React.StrictMode>,
);

// Registra el service worker (habilita "instalar app" y las notificaciones push).
if ('serviceWorker' in navigator) {
  // Si ya había un SW controlando, una versión nueva que tome el control
  // significa que hay que recargar UNA vez para mostrar la app actualizada
  // (evita quedarse pegado en una versión vieja). En la primera instalación
  // (sin controlador previo) NO se recarga.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    // updateViaCache: 'none' → el navegador siempre revalida /sw.js (no lo sirve
    // desde su caché), así detecta versiones nuevas de inmediato.
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {
        /* si falla el registro, la app sigue funcionando normal */
      });
  });
}
