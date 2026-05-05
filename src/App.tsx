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
      return <div className="min-h-screen bg-black" />; // Blank placeholder during server/initial render
    }

    if (route === '/s' || route.startsWith('/s/') || route === '/v' || route.startsWith('/v/') || route === '/track' || route.startsWith('/track/')) {
      return <TrackerPortal />;
    }
    
    // Default to the Intelligence Dashboard (Admin View)
    return <AdminDashboard />;
  };

  return (
    <div className="min-h-screen bg-black">
      {renderPage()}
    </div>
  );
}
