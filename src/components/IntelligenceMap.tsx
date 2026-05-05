import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, Box, Maximize, Target, Navigation } from 'lucide-react';

// Custom icon logic
const createTargetIcon = (status: string, isSelected: boolean) => {
  return L.divIcon({
    className: 'custom-target-icon',
    html: `
      <div class="relative flex items-center justify-center">
        ${isSelected ? '<div class="absolute w-12 h-12 rounded-full border border-red-500/50 animate-ping opacity-75"></div>' : ''}
        <div class="absolute w-8 h-8 rounded-full border-2 border-red-500 animate-[ping_3s_infinite] opacity-75"></div>
        <div class="w-4 h-4 rounded-full ${isSelected ? 'bg-red-600 w-5 h-5 shadow-[0_0_15px_#ef4444]' : 'bg-red-500'} border-2 border-white shadow-lg transition-all duration-500"></div>
        ${isSelected ? '<div class="absolute -top-6 whitespace-nowrap text-[8px] font-bold bg-red-600 text-white px-1 tracking-widest uppercase">Target_Locked</div>' : ''}
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
  history?: { lat: number, lng: number, time: string }[];
}

interface IntelligenceMapProps {
  targets: TargetLocation[];
  selectedTargetId?: string;
  historyIndex?: number;
}

// Helper to center map and handle view changes
function MapControls({ center, zoom, is3D }: { center: [number, number], zoom: number, is3D: boolean }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);

  return null;
}

export const IntelligenceMap: React.FC<IntelligenceMapProps> = ({ targets, selectedTargetId, historyIndex = -1 }) => {
  const [zoomLevel, setZoomLevel] = useState(13);
  const [viewMode, setViewMode] = useState<'2D' | '3D'>('2D');
  
  const selectedTarget = targets.find(t => t.id === selectedTargetId);
  
  // Determine map center based on history playback or live position
  const activePosition: [number, number] | null = selectedTarget?.history && historyIndex >= 0 && historyIndex < selectedTarget.history.length
    ? [selectedTarget.history[historyIndex].lat, selectedTarget.history[historyIndex].lng]
    : selectedTarget 
      ? [selectedTarget.lat, selectedTarget.lng]
      : null;

  const mapCenter: [number, number] = activePosition || [9.012, 38.757];

  return (
    <div className="w-full h-full relative overflow-hidden bg-[#020305]">
      <MapContainer 
        center={mapCenter} 
        zoom={zoomLevel} 
        style={{ height: '100%', width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={false}
        className={viewMode === '3D' ? 'perspective-map' : ''}
      >
        <TileLayer
          attribution='&copy; ESRI Satellite'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        
        {/* Military Grid Overlay */}
        <TileLayer
          attribution='&copy; OpenStreetMap Hybrid'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          opacity={0.15}
        />

        <AnimatePresence>
          {targets.map(target => (
            <React.Fragment key={target.id}>
              {target.history && target.history.length > 1 && (
                <Polyline 
                  positions={target.history.map(h => [h.lat, h.lng] as [number, number])} 
                  pathOptions={{ color: '#3b82f6', weight: 2, dashArray: '8, 8', opacity: 0.4 }} 
                />
              )}
              
              {/* If history playback is active for this target, show a ghost marker */}
              {selectedTargetId === target.id && target.history && historyIndex >= 0 && historyIndex < target.history.length && (
                <Marker 
                  position={[target.history[historyIndex].lat, target.history[historyIndex].lng]}
                  icon={L.divIcon({
                    className: 'history-ghost-icon',
                    html: `
                      <div class="relative flex items-center justify-center">
                        <div class="w-3 h-3 rounded-full bg-blue-500/80 border border-white/50 shadow-[0_0_10px_#3b82f6] animate-pulse"></div>
                        <div class="absolute -top-4 text-[7px] text-blue-400 font-bold uppercase whitespace-nowrap bg-black/50 px-1">T-${new Date(target.history[historyIndex].time).toLocaleTimeString()}</div>
                      </div>
                    `,
                    iconSize: [16, 16],
                    iconAnchor: [8, 8],
                  })}
                />
              )}

              <Marker 
                position={[target.lat, target.lng]} 
                icon={createTargetIcon('active', selectedTargetId === target.id)}
              >
                <Popup className="military-popup">
                  <div className="bg-[#0a0c12] text-slate-300 p-3 border border-slate-700 font-mono text-[10px] space-y-1 shadow-2xl min-w-[150px]">
                    <div className="flex justify-between items-center border-b border-slate-700 pb-1 mb-1">
                      <p className="font-bold text-emerald-400">TRK_ID: {target.id.slice(0,8).toUpperCase()}</p>
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
                    </div>
                    <p className="opacity-70 lowercase">Label: {target.name}</p>
                    <p>LAT: {target.lat.toFixed(6)}</p>
                    <p>LNG: {target.lng.toFixed(6)}</p>
                    <p>ACC: ±{target.accuracy?.toFixed(1) || '0'}m</p>
                    <p className="pt-1 text-[8px] opacity-50 italic">TRANSMISSION_TS: {new Date(target.lastSeen).toISOString()}</p>
                  </div>
                </Popup>
              </Marker>
            </React.Fragment>
          ))}
        </AnimatePresence>

        <MapControls center={mapCenter} zoom={zoomLevel} is3D={viewMode === '3D'} />
      </MapContainer>

      {/* Military HUD Overlays */}
      <div className="absolute top-6 right-6 z-[1000] flex flex-col gap-2">
        <div className="bg-black/80 border border-slate-800 p-1 flex flex-col gap-1 backdrop-blur-md rounded shadow-2xl">
          <button 
            onClick={() => setZoomLevel(prev => Math.min(prev + 1, 19))}
            className="w-10 h-10 flex items-center justify-center hover:bg-slate-800 text-slate-400 transition-colors"
            title="Zoom In"
          >
            <Plus className="w-4 h-4" />
          </button>
          <div className="h-[1px] bg-slate-800 mx-2"></div>
          <button 
            onClick={() => setZoomLevel(prev => Math.max(prev - 1, 3))}
            className="w-10 h-10 flex items-center justify-center hover:bg-slate-800 text-slate-400 transition-colors"
            title="Zoom Out"
          >
            <Minus className="w-4 h-4" />
          </button>
        </div>

        <div className="bg-black/80 border border-slate-800 p-1 flex flex-col gap-1 backdrop-blur-md rounded shadow-2xl">
          <button 
            onClick={() => setViewMode(prev => prev === '2D' ? '3D' : '2D')}
            className={`w-10 h-10 flex items-center justify-center transition-colors ${viewMode === '3D' ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'}`}
            title="Toggle 3D View"
          >
            <Box className="w-4 h-4" />
          </button>
          <div className="h-[1px] bg-slate-800 mx-2"></div>
          <button 
            className="w-10 h-10 flex items-center justify-center hover:bg-slate-800 text-slate-400 transition-colors"
            title="Fullscreen Mode"
          >
            <Maximize className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Compass / Orientation HUD */}
      <div className="absolute bottom-10 right-10 z-[1000] pointer-events-none opacity-40">
        <div className="relative w-24 h-24 border border-slate-800 rounded-full flex items-center justify-center">
          <div className="absolute inset-0 border border-slate-800/20 m-2 rounded-full"></div>
          <div className="text-[10px] font-mono font-black text-slate-600 absolute -top-4">N</div>
          <div className="text-[10px] font-mono font-black text-slate-600 absolute -bottom-4">S</div>
          <div className="text-[10px] font-mono font-black text-slate-600 absolute -left-4">W</div>
          <div className="text-[10px] font-mono font-black text-slate-600 absolute -right-4">E</div>
          <div className="w-px h-full bg-slate-800/50 absolute"></div>
          <div className="h-px w-full bg-slate-800/50 absolute"></div>
          <Navigation className="w-4 h-4 text-emerald-500 transform rotate-45" />
        </div>
      </div>

      {/* Scanning Crosshair */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="relative w-40 h-40 border border-emerald-500/10 rounded-full">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-4 bg-emerald-500/40"></div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-4 bg-emerald-500/40"></div>
          <div className="absolute left-0 top-1/2 -translate-y-1/2 h-px w-4 bg-emerald-500/40"></div>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 h-px w-4 bg-emerald-500/40"></div>
          {/* Radar Sweep */}
          <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_270deg,rgba(16,185,129,0.1)_360deg)] animate-[spin_4s_linear_infinite]"></div>
        </div>
      </div>

      {/* Subtle Scan Lines Effect overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%]"></div>
      
      <style>{`
        .perspective-map .leaflet-container {
          transform: perspective(1000px) rotateX(15deg);
          transition: transform 1s ease-in-out;
        }
        .military-popup .leaflet-popup-content-wrapper {
          background: transparent;
          box-shadow: none;
          padding: 0;
        }
        .military-popup .leaflet-popup-tip {
          background: #0a0c12;
          border: 1px solid #334155;
        }
      `}</style>
    </div>
  );
};
