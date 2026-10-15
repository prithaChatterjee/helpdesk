import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { AppErrorBoundary } from '@/components/common/app-error-boundary';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { initMonitoring, reportQueryError, reportReactError } from '@/lib/monitoring';
import './index.css';
import App from './App';

// First, so errors while starting up are reported too (sent once the SDK has loaded)
void initMonitoring();

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: reportQueryError }),
  mutationCache: new MutationCache({ onError: reportQueryError }),
});

createRoot(document.getElementById('root')!, {
  onCaughtError: reportReactError,
  onUncaughtError: reportReactError,
  onRecoverableError: reportReactError,
}).render(
  <StrictMode>
    <ThemeProvider>
      <AppErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
          <Toaster position="top-right" richColors />
        </QueryClientProvider>
      </AppErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
