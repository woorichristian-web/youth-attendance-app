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
    // 직접 로그아웃한 경우, 로그인 페이지에서 자동 로그인이 곧바로 다시 실행되지 않도록 표시
    try { sessionStorage.setItem('songrim_skip_autologin', '1'); } catch { /* 무시 */ }
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

  // 소통(메시지) 관리 권한 — 전호진(admin@)과 김정나(admin2@)만 사용
  const MESSAGE_ADMIN_EMAILS = ['admin@songrim.church', 'admin2@songrim.church'];
  const isAdminRole = userProfile?.role === 'admin';

  const value = {
    currentUser,
    userProfile,
    login,
    logout,
    isAdmin: isAdminRole,
    canManageMessages: !isAdminRole || MESSAGE_ADMIN_EMAILS.includes(currentUser?.email || ''),
    isTeacher: userProfile?.role === 'teacher',
    canRegisterStudents: userProfile?.role === 'admin' || !!userProfile?.canRegisterStudents,
    isLimited: !!userProfile?.limitedAccess,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
