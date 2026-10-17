import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
  id: string;
  email: string;
  displayName: string;
  isGuest?: boolean;
}

export interface HouseholdSummary {
  id: string;
  name: string;
  weekly_waste_target: number;
  timezone: string;
  role: 'owner' | 'member' | 'guest';
}

interface AuthContextType {
  user: User | null;
  households: HouseholdSummary[];
  currentHousehold: HouseholdSummary | null;
  setCurrentHousehold: (h: HouseholdSummary | null) => void;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  claimGuest: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [households, setHouseholds] = useState<HouseholdSummary[]>([]);
  const [currentHousehold, setCurrentHousehold] = useState<HouseholdSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        setHouseholds(data.households || []);
        if (data.households && data.households.length > 0) {
          setCurrentHousehold(prev => {
            if (prev) {
              const matched = data.households.find((h: any) => h.id === prev.id);
              return matched || data.households[0];
            }
            return data.households[0];
          });
        } else {
          setCurrentHousehold(null);
        }
      } else {
        // Automatically start in guest mode for seamless first-open trial
        const guestRes = await fetch('/api/auth/guest', { method: 'POST' });
        if (guestRes.ok) {
          const guestData = await guestRes.json();
          setUser(guestData.user);
          setHouseholds(guestData.households || []);
          setCurrentHousehold(guestData.households?.[0] || null);
        } else {
          setUser(null);
          setHouseholds([]);
          setCurrentHousehold(null);
        }
      }
    } catch {
      // Offline fallback: keep cached session if present
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Login failed');
    }

    await refreshAuth();
  };

  const register = async (email: string, password: string, displayName: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Registration failed');
    }

    await refreshAuth();
  };

  const claimGuest = async (email: string, password: string, displayName?: string) => {
    const res = await fetch('/api/auth/claim-guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, displayName }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Account creation failed');
    }

    await refreshAuth();
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    // After logging out, refreshAuth automatically sets up a clean guest session
    await refreshAuth();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        households,
        currentHousehold,
        setCurrentHousehold,
        isLoading,
        login,
        register,
        claimGuest,
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
