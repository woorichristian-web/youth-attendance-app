import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function login(email, password) {
    await setPersistence(auth, browserLocalPersistence);
    return signInWithEmailAndPassword(auth, email, password);
  }

  async function logout() {
    return signOut(auth);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserProfile(userDoc.data());
          } else {
            setUserProfile(null);
          }
        } catch (error) {
          console.error('사용자 프로필 로드 오류:', error);
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  // 관리자로 인정하는 계정 (전호진·강현미·전성배·김정나)
  const ADMIN_EMAILS = [
    'admin@songrim.church',
    'leader1@songrim.church',
    'leader2@songrim.church',
    'admin2@songrim.church',
  ];
  const isAdmin =
    userProfile?.role === 'admin' ||
    ADMIN_EMAILS.includes((currentUser?.email || '').toLowerCase());

  const value = {
    currentUser,
    userProfile,
    login,
    logout,
    isAdmin,
    isTeacher: userProfile?.role === 'teacher',
    canRegisterStudents: isAdmin || !!userProfile?.canRegisterStudents,
    isLimited: !isAdmin && !!userProfile?.limitedAccess,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
