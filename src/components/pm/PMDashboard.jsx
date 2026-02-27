import { useState, useEffect, useMemo } from 'react';
import { FolderKanban, Users, CheckCircle2, Clock } from 'lucide-react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import WelcomeHeader from '../common/WelcomeHeader';
import { getProjectsSubscription } from '../../services/projectService';
import { getProjectInterestsSubscription } from '../../services/projectInterestService';

function normalizeStatus(s) {
  if (!s) return '';
  return String(s).toLowerCase().replace(/\s+/g, ' ');
}

export default function PMDashboard() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [interests, setInterests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subProjects = getProjectsSubscription((list) => {
      setProjects(list);
      setLoading((prev) => (prev ? false : prev));
    });
    const subInterests = getProjectInterestsSubscription(setInterests);
    const unsubscribeProjects = onSnapshot(subProjects.query, subProjects.onNext, subProjects.onError);
    const unsubscribeInterests = onSnapshot(subInterests.query, subInterests.onNext, subInterests.onError);
    return () => {
      unsubscribeProjects();
      unsubscribeInterests();
    };
  }, []);

  const { activeCount, upcomingCount, completedCount, totalAssignments, assignmentsByProject } = useMemo(() => {
    const approved = interests.filter((i) => normalizeStatus(i.status) === 'approved');
    const byProject = {};
    approved.forEach((i) => {
      const pid = i.projectId;
      if (pid) byProject[pid] = (byProject[pid] ?? 0) + 1;
    });

    let active = 0;
    let upcoming = 0;
    let completed = 0;
    projects.forEach((p) => {
      const s = normalizeStatus(p.status);
      if (s === 'in progress') active += 1;
      else if (s === 'planning' || s === 'upcoming') upcoming += 1;
      else if (s === 'completed') completed += 1;
      else upcoming += 1;
    });

    return {
      activeCount: active,
      upcomingCount: upcoming,
      completedCount: completed,
      totalAssignments: approved.length,
      assignmentsByProject: byProject,
    };
  }, [projects, interests]);

  const recentProjects = useMemo(() => {
    const sorted = [...projects].sort((a, b) => {
      const tA = a.updatedAt?.toMillis?.() ?? a.updatedAt ?? 0;
      const tB = b.updatedAt?.toMillis?.() ?? b.updatedAt ?? 0;
      return tB - tA;
    });
    return sorted.map((p) => ({
      ...p,
      assignedCount: assignmentsByProject[p.id] ?? 0,
    }));
  }, [projects, assignmentsByProject]);

  const statsConfig = [
    { label: 'Active Projects', value: activeCount, icon: FolderKanban, color: 'bg-blue-50', iconColor: 'text-blue-600' },
    { label: 'Upcoming Projects', value: upcomingCount, icon: Clock, color: 'bg-amber-50', iconColor: 'text-amber-600' },
    { label: 'Total Assignments', value: totalAssignments, icon: Users, color: 'bg-indigo-50', iconColor: 'text-indigo-600' },
    { label: 'Completed Projects', value: completedCount, icon: CheckCircle2, color: 'bg-green-50', iconColor: 'text-green-600' },
  ];

  const firstName = user?.name ? user.name.split(' ')[0] : 'User';

  return (
    <div className="w-full max-w-full box-border px-4 sm:px-6 lg:px-8 py-8 pb-16">
      <div className="mb-8">
        <WelcomeHeader
          title={`Welcome Back, ${firstName}`}
          subtitle="Here's what's happening with your team."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {statsConfig.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="bg-white rounded-xl p-7 shadow-sm border-2 border-gray-200 hover:shadow-lg hover:border-[#1e3a5f]/30 transition-all duration-200 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1e3a5f]"></div>
              <div className="flex items-start justify-between mb-5">
                <div className={`p-3.5 rounded-xl ${stat.color} shrink-0`}>
                  <Icon className={`w-6 h-6 ${stat.iconColor}`} />
                </div>
              </div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{stat.label}</p>
              {loading ? (
                <div className="h-9 w-16 bg-gray-200 rounded animate-pulse" aria-hidden />
              ) : (
                <p className="text-3xl font-bold text-black leading-tight">{stat.value}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border-2 border-gray-200 p-8">
        <h2 className="text-xl font-bold text-black mb-6">Recent Projects</h2>
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-5 border-2 border-gray-200 rounded-xl animate-pulse">
                <div className="flex-1">
                  <div className="h-5 w-48 bg-gray-200 rounded mb-2" />
                  <div className="h-4 w-64 bg-gray-100 rounded" />
                </div>
                <div className="h-8 w-20 bg-gray-200 rounded-full" />
              </div>
            ))}
          </div>
        ) : !recentProjects.length ? (
          <div className="text-center py-12">
            <FolderKanban className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-sm text-gray-600 font-medium">No projects yet</p>
          </div>
        ) : (
          <div className="space-y-4">
            {recentProjects.map((project) => {
              const skills = project.requiredSkills?.length
                ? project.requiredSkills.join(', ')
                : 'N/A';
              const status = project.status || 'Unknown';
              const isActive = normalizeStatus(status) === 'in progress';
              const isPlanning = normalizeStatus(status) === 'planning' || normalizeStatus(status) === 'upcoming';
              const isCompleted = normalizeStatus(status) === 'completed';
              return (
                <div
                  key={project.id}
                  className="flex items-center justify-between p-5 border-2 border-gray-200 rounded-xl hover:bg-gray-50 hover:border-[#1e3a5f] hover:shadow-md transition-all duration-200"
                >
                  <div className="flex-1">
                    <h3 className="font-bold text-black text-lg mb-1">{project.name || 'Unnamed Project'}</h3>
                    <p className="text-sm text-gray-600 font-medium">
                      Requires {skills}
                      {project.minHelixScore ? ` (${project.minHelixScore}% min helix score)` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 ${
                        isActive ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]' :
                        isPlanning ? 'bg-amber-100 text-amber-700 border-amber-200' :
                        isCompleted ? 'bg-green-100 text-green-700 border-green-200' :
                        'bg-gray-100 text-gray-700 border-gray-200'
                      }`}
                    >
                      {status}
                    </span>
                    <span className="text-sm text-gray-600 font-semibold">
                      {project.assignedCount ?? 0} assigned
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
