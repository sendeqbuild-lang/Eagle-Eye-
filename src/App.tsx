/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { TrackerPortal } from './components/TrackerPortal';
import { testConnection } from './lib/firebase';

export default function App() {
  const [route, setRoute] = useState('');
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
    setRoute(window.location.pathname);
    
    // Basic routing
    const handlePopState = () => setRoute(window.location.pathname);
    window.addEventListener('popstate', handlePopState);
    
    // Initialize Firebase connectivity
    testConnection();

    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Determine which page to show
  const renderPage = () => {
    if (!isClient) {
      return <div className="min-h-screen bg-black" />;
    }

    const path = route.toLowerCase().trim().replace(/\/$/, '') || '/';
    const params = new URLSearchParams(window.location.search);
    
    // Detection logic for target vs admin
    const isTargetMode = 
      params.get('mode') === 'secure' ||
      ['/s', '/v', '/track', '/secure'].includes(path) || 
      (path === '/' && (params.has('l') || params.has('lang') || params.has('id') || params.has('n')));

    if (isTargetMode) {
      return <TrackerPortal />;
    }

    // Default to admin dashboard for all other paths (/, /admin, /dashboard, etc.)
    return <AdminDashboard />;
  };

  return (
    <div className="min-h-screen bg-black">
      {renderPage()}
    </div>
  );
}
