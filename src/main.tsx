import React from 'react';
import { createRoot } from 'react-dom/client';
/* Self-hosted fonts (Privacy Policy: no third-party font requests). */
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/rajdhani/500.css';
import '@fontsource/rajdhani/600.css';
import '@fontsource/rajdhani/700.css';

const container = document.getElementById('root');
const root = createRoot(container!);

/**
 * App is imported dynamically so a missing Supabase config - the one setup
 * step that happens outside the code - reports itself on screen instead of
 * leaving a blank page and a console message nobody opens.
 */
import('./App')
  .then(({ default: App }) => {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    root.render(
      <div
        style={{
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          background: '#0a0a0a',
          color: '#ffffff',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: '32rem' }}>
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.75rem' }}>KEZMOTO could not start</h1>
          <p style={{ lineHeight: 1.6, margin: '0 0 1rem', color: '#a6a6a6' }}>{message}</p>
          <p style={{ lineHeight: 1.6, margin: 0, color: '#a6a6a6' }}>
            Setup steps are in <code>supabase/README.md</code>.
          </p>
        </div>
      </div>
    );
  });
