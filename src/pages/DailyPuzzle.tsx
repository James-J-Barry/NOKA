import React, { useEffect, useMemo, useState } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { auth, db } from '../firebase/firebase';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc, getDoc } from 'firebase/firestore';

type Prediction = 'up' | 'down';

type Company = {
  id: string;
  name: string;
  symbol: string;
  price: number;
  logoUrl?: string;
};

const DailyPuzzle: React.FC = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);

  const [predictions, setPredictions] = useState<Record<string, Prediction | null>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  // streak shown in header
  const [streak, setStreak] = useState<number>(0);
  // base streak from yesterday (0 if none)
  const [baseStreak, setBaseStreak] = useState<number>(0);

  const todayKey = useMemo(() => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const todayDisplay = useMemo(() => {
    return new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoadingUser(false);
      if (!u) navigate('/login');
    });
    return () => unsub();
  }, [navigate]);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      setLoadingCompanies(true);
      try {
        // Build refs
        const prevDocRef = doc(db, 'users', user.uid, 'predictions', yesterdayKey);
        const todayDocRef = doc(db, 'users', user.uid, 'predictions', todayKey);
        const puzzleDocRef = doc(db, 'puzzles', todayKey);

        // Load puzzle, yesterday's streak, and today's submission (if any)
        const [puzzleSnap, prevSnap, todaySnap] = await Promise.all([
          getDoc(puzzleDocRef),
          getDoc(prevDocRef),
          getDoc(todayDocRef),
        ]);

        // Base streak from yesterday's doc; reset to 0 if none
        const prevStreak = prevSnap.exists()
          ? Number((prevSnap.data() as any).streak) || 0
          : 0;
        setBaseStreak(prevStreak);

        // If puzzle not ready, show message and stop
        if (!puzzleSnap.exists() || !(puzzleSnap.data() as any).isReady) {
          setCompanies([]);
          if (todaySnap.exists()) {
            const tdata = todaySnap.data() as any;
            setSubmitted(true);
            setPredictions(tdata.predictions || {});
            setStreak(Number(tdata.streak) || prevStreak + 1);
          } else {
            setSubmitted(false);
            setPredictions({});
            setStreak(prevStreak);
          }
          return;
        }

        const symbols: string[] = ((puzzleSnap.data() as any).symbols || []) as string[];

        // Fetch companies by symbol, preserving order, and ensure only today's entries
        const companyDocs = await Promise.all(
          symbols.map((s) => getDoc(doc(db, 'dailyCompanies', s)))
        );

        const results: Company[] = companyDocs
          .map((d) => {
            if (!d.exists()) return null;
            const data = d.data() as any;
            if (data.dateKey !== todayKey) return null;
            return {
              id: d.id,
              name: data.name ?? d.id,
              symbol: data.symbol ?? d.id,
              price: Number(data.price) || 0,
              logoUrl: data.logoUrl,
            } as Company;
          })
          .filter(Boolean) as Company[];

        setCompanies(results);

        if (todaySnap.exists()) {
          // Already submitted today: lock and show today's streak
          const tdata = todaySnap.data() as any;
          setSubmitted(true);
          setPredictions(tdata.predictions || {});
          setStreak(Number(tdata.streak) || prevStreak + 1);
        } else {
          // Not submitted yet: initialize empty predictions and show base streak
          setSubmitted(false);
          setPredictions(Object.fromEntries(results.map((c) => [c.id, null])));
          setStreak(prevStreak);
        }
      } catch (e) {
        console.error('Failed to load puzzle data', e);
      } finally {
        setLoadingCompanies(false);
      }
    };

    fetchData();
  }, [user, todayKey, yesterdayKey]);

  const total = companies.length;
  const selectedCount = React.useMemo(
    () => Object.values(predictions).filter(Boolean).length,
    [predictions]
  );
  const allSelected = total > 0 && selectedCount === total;

  const selectPrediction = (companyId: string, value: Prediction) => {
    if (submitted) return;
    setPredictions((prev) => ({ ...prev, [companyId]: value }));
  };

  const handleSubmit = async () => {
    if (!allSelected || !user) return;

    const ok = window.confirm('Submit your predictions? You will not be able to change them afterwards.');
    if (!ok) return;

    setSaving(true);
    try {
      // Today's streak = yesterday's streak (or 0) + 1
      const newStreak = baseStreak + 1;

      await setDoc(
        doc(db, 'users', user.uid, 'predictions', todayKey),
        {
          dateKey: todayKey,
          predictions,
          streak: newStreak,
          createdAt: new Date().toISOString(),
        },
        { merge: true }
      );

      setSubmitted(true);
      setStreak(newStreak);
    } catch (e) {
      console.error('Failed to save predictions', e);
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut(auth);
  };

  if (loadingUser) {
    return (
      <div className="flex justify-center items-center h-screen bg-gray-50 dark:bg-gray-900">
        <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6">
      <div className="max-w-5xl mx-auto">
        {/* Header Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-gray-600 dark:text-gray-400">{todayDisplay}</div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Puzzle</h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-400">Streak</span>
                <div className="flex items-center gap-1">
                  <span className="text-lg">🔥</span>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{streak}</span>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 bg-white dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 transition"
              >
                Sign out
              </button>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4">
            <div className="text-xs text-gray-600 dark:text-gray-400 mb-1">
              Progress: {selectedCount}/{total}
            </div>
            <div className="w-full h-2 rounded bg-gray-200 dark:bg-gray-700 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all"
                style={{ width: `${total ? (selectedCount / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        </div>

        {/* Companies Card */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          {loadingCompanies ? (
            <div className="text-gray-600 dark:text-gray-400">Loading today’s companies...</div>
          ) : companies.length === 0 ? (
            <div className="text-gray-700 dark:text-gray-300">
              Today’s puzzle isn’t available yet. Please check back soon.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {companies.map((c) => {
                  const selection = predictions[c.id];
                  const upSelected = selection === 'up';
                  const downSelected = selection === 'down';

                  return (
                    <div
                      key={c.id}
                      className={`rounded-lg border p-4 shadow-sm transition ring-0
                        ${
                          selection
                            ? 'border-blue-400 ring-2 ring-blue-300 dark:ring-blue-500'
                            : 'border-gray-200 dark:border-gray-700 hover:shadow'
                        }
                        bg-white dark:bg-gray-800
                      `}
                    >
                      <div className="flex items-center gap-3">
                        {c.logoUrl ? (
                          <img
                            src={c.logoUrl}
                            alt={c.symbol}
                            className="h-10 w-10 rounded bg-gray-100 dark:bg-gray-700"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded bg-gray-200 dark:bg-gray-700" />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium truncate text-gray-900 dark:text-white">{c.name}</p>
                            <span className="text-xs text-gray-500 dark:text-gray-400">({c.symbol})</span>
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-300">Price at opening: ${c.price.toFixed(2)}</div>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-2">
                        <button
                          disabled={submitted}
                          onClick={() => selectPrediction(c.id, 'up')}
                          className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition
                            ${
                              upSelected
                                ? 'bg-green-600 text-white border-green-600'
                                : 'border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-green-50 dark:hover:bg-green-900/20'
                            }
                            ${submitted ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          Up
                        </button>
                        <button
                          disabled={submitted}
                          onClick={() => selectPrediction(c.id, 'down')}
                          className={`flex-1 px-3 py-2 rounded-md border text-sm font-medium transition
                            ${
                              downSelected
                                ? 'bg-red-600 text-white border-red-600'
                                : 'border-gray-300 dark:border-gray-600 text-gray-800 dark:text-gray-100 hover:bg-red-50 dark:hover:bg-red-900/20'
                            }
                            ${submitted ? 'opacity-50 cursor-not-allowed' : ''}
                          `}
                        >
                          Down
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Submit */}
              <div className="mt-6">
                {!submitted && allSelected && (
                  <button
                    onClick={handleSubmit}
                    disabled={saving}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? 'Submitting...' : 'Submit Predictions'}
                  </button>
                )}
                {submitted && (
                  <div className="rounded-md border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-3 text-green-800 dark:text-green-300">
                    Answers locked in. Good luck!
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Info Card */}
        <div className="mt-6 bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6 border border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">About Today’s Puzzle</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Choose whether each company’s stock will finish up or down by market close. Make your best guess
            and lock it in. Come back tomorrow to build your streak.
          </p>
          <ul className="mt-3 list-disc pl-5 text-sm text-gray-700 dark:text-gray-300">
            <li>Tip: Check recent news and market sentiment.</li>
            <li>Tip: Diversify your picks; don’t rely on a single factor.</li>
            <li>Tip: Track your results to improve over time.</li>
          </ul>
        </div>
        <div className="flex items-center gap-4 mt-6">
            <button 
                onClick={() => navigate('/Dashboard')} 
                className="w-full py-2.5 px-4 rounded-md bg-red-600 text-white font-medium hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-colors"
            >
                Dashboard
            </button>
        </div>
      </div>
    </div>
  );
};

export default DailyPuzzle;
