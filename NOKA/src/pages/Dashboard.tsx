import React, { useEffect, useState } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, db } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';
import { getDocs, collection, query, where } from 'firebase/firestore';

interface UserInfo {
  uid: string;
  username: string;
  email: string;
  createdAt: { seconds: number; nanoseconds: number } | Date;
}

const Dashboard: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          setLoading(true);
          setError('');
          const q = query(collection(db, 'users'), where('uid', '==', firebaseUser.uid));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            setUserInfo(querySnapshot.docs[0].data() as UserInfo);
          } else {
            setUserInfo(null);
            setError('User info not found in database.');
          }
        } catch (err: any) {
          setError('Failed to fetch user info.');
        } finally {
          setLoading(false);
        }
      } else {
        setUserInfo(null);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col justify-center items-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg text-center">
          <h2 className="text-xl font-bold mb-4 dark:text-white">Not Logged In</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">Please login to access your dashboard</p>
          <button 
            onClick={() => navigate('/login')}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6">
      <div className="max-w-lg mx-auto">
        {/* Header Section */}
        <div className="bg-white dark:bg-gray-800 rounded-t-lg shadow-sm p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
            <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">
              {userInfo?.username?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Welcome back, {userInfo?.username || user.email?.split('@')[0]}!
          </h1>
        </div>
        
        {/* User Info Section */}
        <div className="bg-white dark:bg-gray-800 shadow-sm p-6">
          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 p-4 rounded-md border-l-4 border-red-500">
              <p className="text-red-800 dark:text-red-400">{error}</p>
            </div>
          )}
          
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Information</h2>
          
          <div className="space-y-4">
            <div className="flex items-start">
              <div className="text-left">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</p>
              <p className="text-gray-900 dark:text-white">{userInfo?.email || user.email}</p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="text-left">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Username</p>
              <p className="text-gray-900 dark:text-white">{userInfo?.username || '-'}</p>
              </div>
            </div>
            
            <div className="flex items-start">
              <div className="text-left">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Account Created</p>
              <p className="text-gray-900 dark:text-white">
                {userInfo?.createdAt 
                ? (userInfo.createdAt instanceof Date 
                  ? userInfo.createdAt.toLocaleString() 
                  : new Date(userInfo.createdAt.seconds * 1000).toLocaleString()) 
                : '-'}
              </p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Actions Section */}
        <div className="bg-white dark:bg-gray-800 rounded-b-lg shadow-sm p-6 border-t border-gray-200 dark:border-gray-700">
          <button 
            onClick={handleLogout} 
            className="w-full py-2.5 px-4 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
          >
            Log Out
          </button>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;