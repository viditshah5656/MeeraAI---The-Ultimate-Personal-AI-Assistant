import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { initializeApp, getApps, getApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { browserLocalPersistence, getAuth, onAuthStateChanged, setPersistence, type User } from "firebase/auth";

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  loading: true,
});

export const useAuth = () => useContext(AuthContext);

type FirebaseConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  messagingSenderId: string;
  storageBucket?: string;
  measurementId?: string;
};

const FIREBASE_STORAGE_KEY = "meera.firebaseConfig";
const FIREBASE_ENV_CONFIG: FirebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAElzlkSZfep_4UELxbrcCMgDj7jbL5z6A",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "meera-9538c.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "meera-9538c",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:425383998728:web:f653d73d67d4248362a8bd",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "425383998728",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "meera-9538c.firebasestorage.app",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-Z00XV61B7K",
};

const normalizeFirebaseConfig = (input?: Partial<FirebaseConfig> | null): FirebaseConfig | null => {
  if (!input) {
    return null;
  }
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const authDomain = typeof input.authDomain === "string" ? input.authDomain.trim() : "";
  const projectId = typeof input.projectId === "string" ? input.projectId.trim() : "";
  const appId = typeof input.appId === "string" ? input.appId.trim() : "";
  const messagingSenderId = typeof input.messagingSenderId === "string" ? input.messagingSenderId.trim() : "";
  const storageBucket = typeof input.storageBucket === "string" ? input.storageBucket.trim() : "";
  const measurementId = typeof input.measurementId === "string" ? input.measurementId.trim() : "";
  const candidate: FirebaseConfig = {
    apiKey,
    authDomain,
    projectId,
    appId,
    messagingSenderId,
    storageBucket: storageBucket || undefined,
    measurementId: measurementId || undefined,
  };
  return apiKey && authDomain && projectId && appId && messagingSenderId ? candidate : null;
};

const loadFirebaseConfig = async (): Promise<FirebaseConfig | null> => {
  if (typeof window !== "undefined" && window.meera?.getFirebaseConfig) {
    try {
      const result = await window.meera.getFirebaseConfig();
      if (result?.ok && result.config) {
        return normalizeFirebaseConfig(result.config);
      }
    } catch {
      // ignore read errors
    }
  }
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(FIREBASE_STORAGE_KEY);
      if (raw) {
        return normalizeFirebaseConfig(JSON.parse(raw) as Partial<FirebaseConfig>);
      }
    } catch {
      // ignore read errors
    }
  }
  return normalizeFirebaseConfig(FIREBASE_ENV_CONFIG);
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    const boot = async () => {
      const firebaseConfig = await loadFirebaseConfig();
      if (cancelled) {
        return;
      }
      if (!firebaseConfig) {
        setLoading(false);
        return;
      }
      let firebaseApp: FirebaseApp;
      const apps = getApps();
      if (apps.length > 0) {
        const existingApp = getApp();
        firebaseApp = existingApp;
      } else {
        firebaseApp = initializeApp(firebaseConfig as FirebaseOptions);
      }
      const auth = getAuth(firebaseApp);
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch {
        // ignore persistence errors
      }
      unsubscribe = onAuthStateChanged(auth, (nextUser) => {
        if (cancelled) {
          return;
        }
        setUser(nextUser);
        setLoading(false);
      });
    };

    void boot();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
