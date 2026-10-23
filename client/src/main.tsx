import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15000 } } });
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}><ThemeProvider>
      <App />
    </ThemeProvider></QueryClientProvider>
  </React.StrictMode>
);
