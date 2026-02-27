import { useState, useEffect, useMemo } from 'react';
import { FileText, Inbox, Briefcase, TrendingUp, Target } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase/config';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';

/**
 * Smart Shortcuts - Rule-based shortcut buttons from employee data.
 * No ML/AI; conditional logic only. Uses existing Firestore reads (no new services).
 */
export default function SmartShortcuts({ stats = null, onNavigate }) {
  const { user } = useAuth();
  const [resumeUploaded, setResumeUploaded] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);

  const userId = user?.uid ?? null;

  useEffect(() => {
    if (!userId) {
      setDataLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const [resumeSnap, inboxSnap] = await Promise.all([
          getDoc(doc(db, 'resumes', userId)).catch(() => null),
          getDocs(
            query(
              collection(db, 'inbox_items'),
              where('recipientId', '==', userId),
              where('status', '==', 'unread')
            )
          ).catch(() => ({ size: 0 })),
        ]);

        if (cancelled) return;
        setResumeUploaded(!!(resumeSnap?.exists?.() && resumeSnap?.data()?.resumeUrl));
        setUnreadCount(inboxSnap?.size ?? 0);
      } catch (e) {
        if (!cancelled) console.warn('[SmartShortcuts] fetch error:', e);
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [userId]);

  const shortcuts = useMemo(() => {
    const activeProjectsCount = stats?.activeProjectsCount ?? 0;
    const performanceScore = stats?.averagePerformanceScore ?? 0;

    const list = [];

    list.push({
      id: 'resume',
      label: resumeUploaded ? 'Re-analyze Resume' : 'Upload Resume',
      icon: FileText,
      primary: true,
      onClick: () => onNavigate?.('resume-analysis'),
    });

    if (unreadCount > 0) {
      list.push({
        id: 'inbox',
        label: 'Go to Inbox',
        icon: Inbox,
        primary: true,
        onClick: () => onNavigate?.('inbox'),
      });
    }

    list.push({
      id: 'projects',
      label: activeProjectsCount > 0 ? 'My Projects' : 'Browse Projects',
      icon: Briefcase,
      primary: false,
      onClick: () => onNavigate?.('project-interests'),
    });

    list.push({
      id: 'progress',
      label: performanceScore < 70 ? 'View Improvement Plan' : 'My Progress',
      icon: performanceScore < 70 ? Target : TrendingUp,
      primary: false,
      onClick: () => onNavigate?.('my-progress'),
    });

    return list.slice(0, 4);
  }, [resumeUploaded, unreadCount, stats?.activeProjectsCount, stats?.averagePerformanceScore, onNavigate]);

  if (dataLoading && shortcuts.every((s) => s.id === 'resume')) {
    return (
      <div className="bg-white rounded-xl p-7 shadow-sm border border-gray-200">
        <h3 className="text-xl font-bold text-black mb-6">Smart Shortcuts</h3>
        <div className="space-y-3">
          <div className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-14 bg-gray-100 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-7 shadow-sm border border-gray-200">
      <h3 className="text-xl font-bold text-black mb-6">Smart Shortcuts</h3>
      <div className="space-y-3">
        {shortcuts.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={`w-full flex items-center gap-3 px-5 py-4 rounded-xl transition-all duration-200 text-sm font-semibold shadow-sm hover:shadow-md ${
                item.primary
                  ? 'bg-[#1e3a5f] hover:bg-[#1e3a5f]/90 text-white'
                  : 'bg-white hover:bg-gray-50 text-black border-2 border-gray-300 hover:border-[#1e3a5f]'
              }`}
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
