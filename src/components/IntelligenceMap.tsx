import React from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'motion/react';

// Custom icon logic
const createTargetIcon = (status: string) => {
  return L.divIcon({
    className: 'custom-target-icon',
    html: `
      <div class="relative flex items-center justify-center">
        <div class="absolute w-8 h-8 rounded-full border-2 border-red-500 animate-ping opacity-75"></div>
        <div class="w-4 h-4 rounded-full bg-red-500 border-2 border-white shadow-lg"></div>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

interface TargetLocation {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lastSeen: string;
  accuracy?: number;
}

interface IntelligenceMapProps {
  targets: TargetLocation[];
  selectedTargetId?: string;
}

// Helper to center map when target is selected
function MapUpdater({ center }: { center: [number, number] }) {
  const map = useMap();
  React.useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export const IntelligenceMap: React.FC<IntelligenceMapProps> = ({ targets, selectedTargetId }) => {
  const selectedTarget = targets.find(t => t.id === selectedTargetId);
  const initialCenter: [number, number] = selectedTarget ? [selectedTarget.lat, selectedTarget.lng] : [9.012, 38.757];

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#020305]">
      <MapContainer 
        center={initialCenter} 
        zoom={13} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; ESRI Satellite'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        
        <TileLayer
          attribution='&copy; OpenStreetMap Hybrid'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          opacity={0.2}
        />

        <AnimatePresence>
          {targets.map(target => (
            <Marker 
              key={target.id}
              position={[target.lat, target.lng]} 
              icon={createTargetIcon('active')}
            >
              <Popup>
                <div className="bg-[#0a0c12] text-slate-300 p-3 border border-slate-700 font-mono text-[10px] space-y-1 shadow-2xl">
                  <p className="font-bold border-b border-slate-700 pb-1 mb-1 text-emerald-400">TARGET: {target.name.toUpperCase()}</p>
                  <p>COORD_LAT: {target.lat.toFixed(6)}</p>
                  <p>COORD_LNG: {target.lng.toFixed(6)}</p>
                  <p>PRECISION: {target.accuracy?.toFixed(1) || '0'}m</p>
                  <p>LAST_SEEN: {new Date(target.lastSeen).toLocaleTimeString()}</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </AnimatePresence>

        {selectedTarget && (
          <MapUpdater center={[selectedTarget.lat, selectedTarget.lng]} />
        )}
      </MapContainer>

      {/* Subtle Scan Lines Effect overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>
      
      {/* Grid Pattern Overlay from design */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
    </div>
  );
};
