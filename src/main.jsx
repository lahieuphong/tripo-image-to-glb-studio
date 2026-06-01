import React from 'react';
import { createRoot } from 'react-dom/client';
import '@google/model-viewer';
import App from './App.jsx';
import JobsPage from './pages/JobsPage.jsx';
import './styles.css';

const isJobsList = window.location.pathname === '/jobs'
  && !new URLSearchParams(window.location.search).has('id');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isJobsList ? <JobsPage /> : <App />}
  </React.StrictMode>
);
