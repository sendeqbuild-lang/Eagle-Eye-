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
    const hasTrackingParams = params.has('l') || params.has('lang') || params.has('id') || params.has('n');
    
    // 1. Explicit tracking sub-paths ALWAYS show the portal
    if (['/s', '/v', '/track', '/secure'].includes(path)) {
      return <TrackerPortal />;
    }

    // 2. If we are on the root path AND have tracking parameters, show the portal
    if (path === '/' && hasTrackingParams) {
      return <TrackerPortal />;
    }
    
    // 3. EVERYTHING ELSE (including root without params) shows the AdminDashboard
    // This allows the admin to always access the control center at the root / or /admin
    return <AdminDashboard />;
  };

  return (
    <div className="min-h-screen bg-black">
      {renderPage()}
    </div>
  );
}
