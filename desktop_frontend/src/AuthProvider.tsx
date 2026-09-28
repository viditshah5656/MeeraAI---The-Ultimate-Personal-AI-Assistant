import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";

// Fake User type to replace firebase User
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  phoneNumber: string | null;
  photoURL: string | null;
  emailVerified: boolean;
}

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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const boot = () => {
      if (cancelled) return;
      // Provide a mock user to completely bypass authentication and make the app feel free
      setUser({
        uid: "local-user",
        email: "local@meera.ai",
        displayName: localStorage.getItem("meera_local_name") || "User",
        phoneNumber: null,
        photoURL: null,
        emailVerified: true,
      });
      setLoading(false);
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
