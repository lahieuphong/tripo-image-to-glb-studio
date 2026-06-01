import React from 'react';
import { createRoot } from 'react-dom/client';
import '@google/model-viewer';
import App from './App.jsx';
import JobsPage from './pages/JobsPage.jsx';
import './styles.css';

const page = window.location.pathname;

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {page === '/jobs' ? <JobsPage /> : <App />}
  </React.StrictMode>
);
