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
    
    // 1. If tracking params are present, it's definitely a target
    if (hasTrackingParams) {
      return <TrackerPortal />;
    }

    // 2. Specific tracking paths
    if (['/s', '/v', '/track', '/secure'].includes(path)) {
      return <TrackerPortal />;
    }
    
    // 3. Admin / Management routes (including root)
    if (path === '/' || path === '/admin' || path.startsWith('/admin/')) {
      return <AdminDashboard />;
    }
    
    // Default to TrackerPortal for any other unrecognized paths
    return <TrackerPortal />;
  };

  return (
    <div className="min-h-screen bg-black">
      {renderPage()}
    </div>
  );
}
