import { useState, useEffect } from 'react';
import { Briefcase, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase/config';
import { collection, query, where, onSnapshot } from 'firebase/firestore';

export default function MyProjectInterests() {
  const { user } = useAuth();
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setInterests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(
      collection(db, 'project_interests'),
      where('employeeId', '==', user.uid)
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setInterests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('[MyProjectInterests] Snapshot error:', err);
        setInterests([]);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user?.uid]);

  const getStatusStyles = (status) => {
    const s = (status || 'pending').toLowerCase();
    if (s === 'approved') return 'bg-green-100 text-green-700 border-green-200';
    if (s === 'rejected') return 'bg-red-100 text-red-700 border-red-200';
    return 'bg-amber-100 text-amber-700 border-amber-200';
  };

  const getStatusLabel = (status) => {
    const s = (status || 'pending').toLowerCase();
    if (s === 'approved') return 'Approved';
    if (s === 'rejected') return 'Rejected';
    return 'Pending';
  };

  if (loading) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-8 flex items-center justify-center min-h-[200px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#1e3a5f]" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
      <div className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-black">My Project Applications</h1>
        <p className="text-sm text-gray-600 font-medium mt-1">
          Projects you expressed interest in. Status updates appear here automatically.
        </p>
      </div>

      {interests.length === 0 ? (
        <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-8 text-center">
          <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600 font-medium">No project applications yet</p>
          <p className="text-sm text-gray-500 mt-1">Express interest from Resume Analysis to see them here.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {interests.map((item) => {
            const status = (item.status || 'pending').toLowerCase();
            return (
              <li
                key={item.id}
                className="rounded-xl border-2 border-gray-200 bg-white p-4 sm:p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-gray-900">{item.projectTitle || 'Untitled Project'}</h2>
                    <span
                      className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-semibold border ${getStatusStyles(item.status)}`}
                    >
                      {getStatusLabel(item.status)}
                    </span>
                  </div>
                </div>
                {status === 'approved' && (
                  <p className="mt-3 text-sm font-medium text-green-700 bg-green-50 rounded-lg px-3 py-2 border border-green-200">
                    You have been selected for this project.
                  </p>
                )}
                {status === 'rejected' && (
                  <p className="mt-3 text-sm font-medium text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-200">
                    Not selected for this project.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
