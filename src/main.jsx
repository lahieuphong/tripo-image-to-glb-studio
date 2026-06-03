import React from 'react';
import { createRoot } from 'react-dom/client';
import '@google/model-viewer';
import App from './App.jsx';
import JobsPage from './pages/JobsPage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import './styles.css';

const path = window.location.pathname;
const isPricing = path === '/pricing';
const isJobsList = path === '/jobs'
  && !new URLSearchParams(window.location.search).has('id');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {isPricing ? <PricingPage /> : isJobsList ? <JobsPage /> : <App />}
  </React.StrictMode>
);
