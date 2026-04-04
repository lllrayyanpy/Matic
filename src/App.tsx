import { useState, useEffect, useRef } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup,
  signOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  Timestamp,
  getDocFromServer,
  doc,
  updateDoc,
  deleteDoc,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage, googleProvider } from './firebase';
import { GoogleGenAI } from "@google/genai";
import { Mic, MicOff, LogOut, Trash2, Send, Loader2, History, User as UserIcon, UserCircle, Copy, Check, Sparkles, Waves, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Transcription {
  id: string;
  text: string;
  userId: string;
  createdAt: string;
  status: 'active' | 'archived';
  archivedAt?: string;
  audioUrl?: string;
}

interface UserProfile {
  email: string;
  transcriptionCount: number;
  subscriptionTier: 'free' | 'pro';
  createdAt: string;
}

// --- Components ---

const BackgroundMarquee = () => {
  const marqueeText = Array(20).fill("MATIC").join(" • ");
  
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 opacity-[0.03] select-none">
      <div className="absolute top-1/2 -translate-y-1/2 w-full">
        <motion.div
          animate={{ x: ["-100%", "100%"] }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: "linear",
          }}
          className="whitespace-nowrap text-[6vw] font-black uppercase tracking-[0.3em] text-white"
        >
          {marqueeText}
        </motion.div>
      </div>
      <div className="absolute top-1/4 -translate-y-1/2 w-full">
        <motion.div
          animate={{ x: ["100%", "-100%"] }}
          transition={{
            duration: 40,
            repeat: Infinity,
            ease: "linear",
          }}
          className="whitespace-nowrap text-[4vw] font-black uppercase tracking-[0.3em] text-white"
        >
          {marqueeText}
        </motion.div>
      </div>
      <div className="absolute top-3/4 -translate-y-1/2 w-full">
        <motion.div
          animate={{ x: ["100%", "-100%"] }}
          transition={{
            duration: 35,
            repeat: Infinity,
            ease: "linear",
          }}
          className="whitespace-nowrap text-[5vw] font-black uppercase tracking-[0.3em] text-white"
        >
          {marqueeText}
        </motion.div>
      </div>
    </div>
  );
};

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  const [hasError, setHasError] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      setHasError(true);
      setError(event.error);
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  if (hasError) {
    return (
      <div className="p-6 glass-card rounded-2xl text-red-400 max-w-md mx-auto mt-20">
        <h2 className="font-bold text-xl mb-3">Something went wrong</h2>
        <p className="text-sm opacity-80 mb-6">{error?.message || 'An unexpected error occurred.'}</p>
        <button 
          onClick={() => window.location.reload()}
          className="w-full py-3 bg-red-500/20 border border-red-500/50 text-red-400 rounded-xl hover:bg-red-500/30 transition"
        >
          Reload Page
        </button>
      </div>
    );
  }

  return <>{children}</>;
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              email: user.email,
              transcriptionCount: 0,
              subscriptionTier: 'free',
              createdAt: new Date().toISOString()
            });
          }
        } catch (err) {
          console.error("Error setting up user profile:", err);
        }
      }
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error('Auth error:', err.code, err.message);
      let errorMessage = 'حدث خطأ ما، يرجى المحاولة مرة أخرى.';
      
      switch (err.code) {
        case 'auth/wrong-password':
          errorMessage = 'كلمة المرور التي أدخلتها غير صحيحة.';
          break;
        case 'auth/user-not-found':
          errorMessage = 'لا يوجد حساب مسجل بهذا البريد الإلكتروني.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'صيغة البريد الإلكتروني غير صحيحة.';
          break;
        case 'auth/email-already-in-use':
          errorMessage = 'هذا البريد الإلكتروني مستخدم بالفعل في حساب آخر.';
          break;
        case 'auth/weak-password':
          errorMessage = 'كلمة المرور ضعيفة جداً، يرجى اختيار كلمة أقوى.';
          break;
        case 'auth/invalid-credential':
          errorMessage = 'بيانات الدخول غير صحيحة (البريد أو كلمة المرور).';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'تم حظر المحاولات مؤقتاً بسبب كثرة الطلبات، حاول لاحقاً.';
          break;
      }
      setError(errorMessage);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-white/10 border-t-white rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Mic className="w-6 h-6 text-white/50" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen text-zinc-100 font-sans selection:bg-brand-primary/30 relative">
        <BackgroundMarquee />
        {!user ? (
          <div className="min-h-screen flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-md p-10 glass-card rounded-[2.5rem] shadow-[0_0_50px_-12px_rgba(99,102,241,0.3)]"
            >
              <div className="flex flex-col items-center mb-10">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-brand-primary blur-2xl opacity-20 animate-pulse" />
                  <div className="relative w-16 h-16 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-2xl flex items-center justify-center shadow-xl">
                    <Mic className="text-white w-8 h-8" />
                  </div>
                </div>
                <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">Matic</h1>
              </div>

              <form onSubmit={handleAuth} className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] ml-1">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all placeholder:text-zinc-600"
                    placeholder="name@example.com"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-zinc-500 uppercase tracking-[0.2em] ml-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-brand-primary/50 transition-all placeholder:text-zinc-600"
                    placeholder="••••••••"
                    required
                  />
                </div>
                {error && (
                  <motion.p 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="text-red-400 text-xs font-medium bg-red-400/10 p-3 rounded-xl border border-red-400/20"
                  >
                    {error}
                  </motion.p>
                )}
                <button
                  type="submit"
                  className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-bold py-4 rounded-2xl hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all active:scale-[0.98] mt-2"
                >
                  {authMode === 'login' ? 'Sign In' : 'Create Account'}
                </button>
              </form>

              <div className="mt-8 flex flex-col gap-4">
                <div className="relative flex items-center gap-4">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">or</span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <button
                  type="button"
                  onClick={handleGoogleLogin}
                  className="w-full bg-white/5 text-white font-bold py-4 rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-3 border border-white/10"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </button>
                
                <button
                  onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                  className="text-sm text-zinc-500 hover:text-white transition-colors text-center font-medium"
                >
                  {authMode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
                </button>
              </div>
            </motion.div>
          </div>
        ) : (
          <Dashboard user={user} />
        )}
      </div>
    </ErrorBoundary>
  );
}

function Dashboard({ user }: { user: User }) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [view, setView] = useState<'active' | 'archived'>('active');
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    // Check for Stripe success redirect
    const query = new URLSearchParams(window.location.search);
    if (query.get("success") && query.get("session_id")) {
      const sessionId = query.get("session_id");
      
      const verifySession = async () => {
        try {
          const res = await fetch('/api/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId })
          });
          const data = await res.json();
          if (data.success) {
            // Update user tier in Firestore
            const userRef = doc(db, 'users', user.uid);
            await updateDoc(userRef, { subscriptionTier: 'pro' });
            alert("Payment successful! You are now a Pro user.");
          }
        } catch (err) {
          console.error("Error verifying session:", err);
        } finally {
          // Clean up URL
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };
      
      verifySession();
    }
  }, [user.uid]);

  useEffect(() => {
    const userRef = doc(db, 'users', user.uid);
    const unsubscribeUser = onSnapshot(userRef, (docSnap) => {
      if (docSnap.exists()) {
        setUserProfile(docSnap.data() as UserProfile);
      }
    });

    const q = query(
      collection(db, 'transcriptions'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeTranscriptions = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Transcription[];
      setTranscriptions(data);
    });

    return () => {
      unsubscribeUser();
      unsubscribeTranscriptions();
    };
  }, [user.uid]);

  const filteredTranscriptions = transcriptions.filter(t => {
    if (view === 'active') {
      return t.status === 'active' || !t.status;
    }
    return t.status === 'archived';
  });

  const playBeep = (frequency: number, duration: number, volume: number = 0.3) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      // Use a slightly more complex sound (triangle for clarity)
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(volume, audioCtx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
      console.error('Error playing beep:', e);
    }
  };

  const startRecording = async () => {
    if (userProfile && userProfile.subscriptionTier === 'free' && userProfile.transcriptionCount >= 10) {
      setShowPricing(true);
      return;
    }

    try {
      playBeep(1200, 0.15, 0.4); // Clear, high start beep
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Error accessing microphone:', err);
      alert('Could not access microphone. Please check permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      playBeep(600, 0.2, 0.4); // Clear, lower stop beep
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const transcribeAudio = async (blob: Blob) => {
    setTranscribing(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
      });
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: "Transcribe the following audio precisely. Return ONLY the transcription text. Do not include any introductory or concluding remarks, conversational filler, or explanations. If there is no speech, return an empty string." },
              { inlineData: { data: base64Data, mimeType: "audio/webm" } }
            ]
          }
        ]
      });

      let text = response.text || "";
      
      // Clean up common AI conversational filler just in case the model ignores the strict prompt
      text = text
        .replace(/^(here is the transcription|show here is the transcription|transcription|output|result):?\s*/i, '')
        .replace(/\n*(i hope this helps|let me know if you have any more questions|is there anything else).*$/is, '')
        .trim();

      if (text) {
        try {
          await addDoc(collection(db, 'transcriptions'), {
            text,
            userId: user.uid,
            createdAt: new Date().toISOString(),
            status: 'active'
          });
        } catch (dbErr) {
          console.error('Error saving transcription to database:', dbErr);
        }

        try {
          const userRef = doc(db, 'users', user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            await updateDoc(userRef, {
              transcriptionCount: (userSnap.data().transcriptionCount || 0) + 1
            });
          }
        } catch (userErr) {
          console.error('Error updating user transcription count:', userErr);
        }
      }
    } catch (err) {
      console.error('Transcription error:', err);
    } finally {
      setTranscribing(false);
    }
  };

  const cleanText = (text: string) => {
    return text
      .replace(/^(here is the transcription|show here is the transcription|transcription|output|result):?\s*/i, '')
      .replace(/\n*(i hope this helps|let me know if you have any more questions|is there anything else).*$/is, '')
      .trim();
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(cleanText(text));
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const archiveTranscription = async (id: string) => {
    try {
      const docRef = doc(db, 'transcriptions', id);
      await updateDoc(docRef, {
        status: 'archived',
        archivedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error('Archive error:', err);
    }
  };

  const restoreTranscription = async (id: string) => {
    try {
      const docRef = doc(db, 'transcriptions', id);
      await updateDoc(docRef, {
        status: 'active',
        archivedAt: null
      });
    } catch (err) {
      console.error('Restore error:', err);
    }
  };

  const deletePermanently = async (id: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this?')) return;
    try {
      const docRef = doc(db, 'transcriptions', id);
      await deleteDoc(docRef);
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  if (showPricing) {
    return (
      <div className="max-w-4xl mx-auto p-6 md:p-12">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black mb-4">Upgrade to Pro</h2>
          <p className="text-zinc-400">You've reached your limit of 10 free transcriptions.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-8 max-w-2xl mx-auto">
          <div className="glass-card p-8 rounded-[2.5rem] border border-white/10 relative overflow-hidden">
            <h3 className="text-xl font-bold mb-2">Free</h3>
            <div className="text-4xl font-black mb-6">$0<span className="text-lg text-zinc-500 font-medium">/mo</span></div>
            <ul className="space-y-4 mb-8 text-zinc-400">
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-brand-primary" /> 10 transcriptions total</li>
            </ul>
            <button disabled className="w-full py-4 rounded-2xl bg-white/5 text-zinc-500 font-bold cursor-not-allowed">Current Plan</button>
          </div>
          <div className="glass-card p-8 rounded-[2.5rem] border border-brand-primary/50 relative overflow-hidden">
            <div className="absolute top-0 right-0 bg-brand-primary text-white text-xs font-bold px-4 py-1 rounded-bl-2xl">POPULAR</div>
            <h3 className="text-xl font-bold mb-2">Pro</h3>
            <div className="text-4xl font-black mb-6">$5<span className="text-lg text-zinc-500 font-medium">/mo</span></div>
            <ul className="space-y-4 mb-8 text-zinc-300">
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-brand-primary" /> Unlimited transcriptions</li>
              <li className="flex items-center gap-3"><Check className="w-5 h-5 text-brand-primary" /> Priority support</li>
            </ul>
            <button 
              onClick={async () => {
                try {
                  setIsUpgrading(true);
                  const res = await fetch('/api/create-checkout-session', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: user.uid })
                  });
                  const data = await res.json();
                  if (data.url) {
                    window.location.href = data.url;
                  } else {
                    throw new Error(data.error || "Failed to create checkout session");
                  }
                } catch (err) {
                  console.error(err);
                  alert("Failed to start checkout. Please check your Stripe configuration.");
                  setIsUpgrading(false);
                }
              }}
              disabled={isUpgrading}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-brand-primary to-brand-secondary text-white font-bold hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {isUpgrading ? 'Redirecting...' : 'Subscribe Now'}
            </button>
          </div>
        </div>
        <button onClick={() => setShowPricing(false)} className="mt-8 mx-auto block text-zinc-500 hover:text-white transition-colors">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 md:p-12">
      {/* Header */}
      <header className="flex items-center justify-between mb-16">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-brand-primary blur-xl opacity-20" />
            <div className="relative w-12 h-12 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-2xl flex items-center justify-center shadow-xl">
              <Mic className="text-white w-6 h-6" />
            </div>
          </div>
          <div>
            <h2 className="font-black text-2xl tracking-tight leading-none">Matic</h2>
            <p className="text-zinc-500 text-[10px] font-bold uppercase tracking-[0.2em] mt-1.5">
              {userProfile?.subscriptionTier === 'pro' ? 'Pro Plan' : `Free Plan (${userProfile?.transcriptionCount || 0}/10)`}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut(auth)}
          className="p-3 text-zinc-500 hover:text-white transition-all hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/10"
          title="Sign Out"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Main Recording Area */}
      <div className="relative group mb-20">
        <div className="absolute -inset-1 bg-gradient-to-r from-brand-primary to-brand-secondary rounded-[3rem] blur opacity-20 group-hover:opacity-30 transition duration-1000 group-hover:duration-200" />
        <div className="relative flex flex-col items-center justify-center py-24 glass-card rounded-[3rem] overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
          
          <AnimatePresence mode="wait">
            {isRecording ? (
              <motion.div
                key="recording"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="flex flex-col items-center"
              >
                <div className="relative mb-10">
                  <motion.div
                    animate={{ scale: [1, 1.4, 1], opacity: [0.3, 0.6, 0.3] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute inset-0 bg-red-500 rounded-full blur-3xl"
                  />
                  <button
                    onClick={stopRecording}
                    className="relative w-32 h-32 bg-red-500 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(239,68,68,0.4)] active:scale-95 transition-transform"
                  >
                    <MicOff className="w-12 h-12 text-white" />
                  </button>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <p className="text-red-400 font-black uppercase tracking-[0.3em] text-xs">Recording Live</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="idle"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="flex flex-col items-center"
              >
                <button
                  onClick={startRecording}
                  disabled={transcribing}
                  className={cn(
                    "w-32 h-32 bg-white rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.1)] active:scale-95 transition-all group/btn",
                    transcribing && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {transcribing ? (
                    <Loader2 className="w-12 h-12 text-zinc-950 animate-spin" />
                  ) : (
                    <Mic className="w-12 h-12 text-zinc-950 group-hover/btn:scale-110 transition-transform" />
                  )}
                </button>
                <div className="mt-10 flex flex-col items-center gap-2">
                  <p className="text-white font-black uppercase tracking-[0.2em] text-sm">
                    {transcribing ? 'AI Processing...' : 'Ready to Matic'}
                  </p>
                  <p className="text-zinc-500 text-xs font-medium">
                    {transcribing ? 'Analyzing audio patterns' : 'Tap to start dictation'}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* History Section */}
      <section>
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 px-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/5 rounded-lg border border-white/10">
              <History className="w-4 h-4 text-zinc-400" />
            </div>
            <h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.3em]">
              {view === 'active' ? 'Recent Transcripts' : 'Archived Transcripts'}
            </h3>
          </div>
          
          <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
            <button
              onClick={() => setView('active')}
              className={cn(
                "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all",
                view === 'active' ? "bg-white/10 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Active
            </button>
            <button
              onClick={() => setView('archived')}
              className={cn(
                "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex items-center gap-2",
                view === 'archived' ? "bg-white/10 text-white shadow-lg" : "text-zinc-500 hover:text-zinc-300"
              )}
            >
              Archive
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {filteredTranscriptions.length === 0 ? (
            <div className="text-center py-20 glass-card rounded-[2rem] border-dashed border-white/5">
              <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <Waves className="w-8 h-8 text-zinc-700" />
              </div>
              <p className="text-zinc-500 text-sm font-medium">
                {view === 'active' ? 'Your voice notes will appear here.' : 'No archived items found.'}
              </p>
            </div>
          ) : (
            filteredTranscriptions.map((t) => (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="group relative p-8 glass-card rounded-[2rem] hover:border-brand-primary/30 transition-all duration-500"
              >
                <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 bg-brand-primary rounded-full" />
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
                      {new Date(t.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {view === 'active' ? (
                      <>
                        <button
                          onClick={() => {
                            const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(t.text)}`;
                            window.open(url, '_blank');
                          }}
                          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group-hover:border-white/10 text-zinc-500 hover:text-red-500"
                          title="Search on YouTube"
                        >
                          <Waves className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            const url = `https://www.google.com/search?q=${encodeURIComponent(t.text)}`;
                            window.open(url, '_blank');
                          }}
                          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group-hover:border-white/10 text-zinc-500 hover:text-brand-accent"
                          title="Search on Google"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button
                          onClick={async () => {
                            if (navigator.share) {
                              try {
                                await navigator.share({ text: t.text });
                              } catch (err) {
                                console.error('Error sharing:', err);
                              }
                            } else {
                              copyToClipboard(t.text, t.id);
                            }
                          }}
                          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group-hover:border-white/10 text-zinc-500 hover:text-white"
                          title="Share"
                        >
                          <Sparkles className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => copyToClipboard(t.text, t.id)}
                          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group-hover:border-white/10"
                        >
                          {copiedId === t.id ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4 text-zinc-500 group-hover:text-white transition-colors" />
                          )}
                        </button>
                        <button
                          onClick={() => archiveTranscription(t.id)}
                          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group-hover:border-white/10 text-zinc-500 hover:text-red-400"
                          title="Archive"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => restoreTranscription(t.id)}
                          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group-hover:border-white/10 text-zinc-500 hover:text-green-400"
                          title="Restore"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deletePermanently(t.id)}
                          className="p-2.5 bg-white/5 hover:bg-white/10 rounded-xl transition-all border border-white/5 group-hover:border-white/10 text-zinc-500 hover:text-red-600"
                          title="Delete Permanently"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="prose prose-invert prose-sm max-w-none text-zinc-300 leading-relaxed font-medium mb-6">
                  <Markdown>{cleanText(t.text)}</Markdown>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
