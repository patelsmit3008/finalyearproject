import { useMemo, useState, useEffect } from 'react';
import { User, Award, TrendingUp, Briefcase, ArrowUpRight, Target, Calendar, CheckCircle2, Clock, Zap, FileText } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { employeePersonalData } from '../../data/mockData';
import WelcomeHeader from '../common/WelcomeHeader';
import PerformanceTrendChart from '../charts/PerformanceTrendChart';
import SmartShortcuts from './SmartShortcuts';
import { getEmployeeDashboardStats } from '../../firebase/services/employeeDashboardService';

export default function EmployeeDashboard({ onNavigate }) {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setStatsLoading(false);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    getEmployeeDashboardStats(user.uid)
      .then((s) => {
        if (!cancelled) setStats(s);
      })
      .catch((err) => {
        if (!cancelled) console.error('Employee dashboard stats error:', err);
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.uid]);

  const firstName = useMemo(() => {
    if (!user?.name) return 'User';
    return user.name.split(' ')[0];
  }, [user?.name]);

  const data = employeePersonalData;

  const performanceChartData = useMemo(() => {
    const scores = stats?.performanceScores ?? [];
    if (scores.length === 0) return [];
    return scores.map((item, index) => {
      const isLast = index === scores.length - 1;
      const label = isLast
        ? 'Current'
        : `${scores.length - index} reviews ago`;
      return {
        period: label,
        overallScore: item.score ?? 0,
        reviewDate: item.reviewDate ?? '',
        isCurrent: isLast,
      };
    });
  }, [stats?.performanceScores]);

  const benchmark = stats?.benchmark ?? 85;

  const summaryCards = useMemo(() => {
    const activeProjectsCount = stats?.activeProjectsCount ?? 0;
    const skillsCount = stats?.skillsCount ?? 0;
    const totalPoints = stats?.totalPoints ?? 0;
    const performanceScore = stats?.averagePerformanceScore ?? 0;

    return [
      {
        label: 'Performance Score',
        value: `${performanceScore}%`,
        icon: TrendingUp,
        gradient: 'bg-[#1e3a5f]',
        iconBg: 'bg-[#1e3a5f]/10',
        iconColor: 'text-[#1e3a5f]',
        trend: null,
        trendColor: 'text-black',
        description: 'From reviews'
      },
      {
        label: 'Helix Points',
        value: Number(totalPoints).toLocaleString(),
        icon: Award,
        gradient: 'bg-[#1e3a5f]',
        iconBg: 'bg-[#1e3a5f]/10',
        iconColor: 'text-[#1e3a5f]',
        trend: null,
        trendColor: 'text-black',
        description: 'Total points'
      },
      {
        label: 'Skills Acquired',
        value: skillsCount,
        icon: User,
        gradient: 'bg-[#1e3a5f]',
        iconBg: 'bg-[#1e3a5f]/10',
        iconColor: 'text-[#1e3a5f]',
        trend: null,
        trendColor: 'text-black',
        description: 'Tracked skills'
      },
      {
        label: 'Active Projects',
        value: activeProjectsCount,
        icon: Briefcase,
        gradient: 'bg-[#1e3a5f]',
        iconBg: 'bg-[#1e3a5f]/10',
        iconColor: 'text-[#1e3a5f]',
        trend: String(activeProjectsCount),
        trendColor: 'text-gray-600',
        description: 'In progress'
      },
    ];
  }, [stats?.activeProjectsCount, stats?.skillsCount, stats?.totalPoints, stats?.averagePerformanceScore]);

  const quickStats = useMemo(() => {
    const completionRate = stats?.completionRate ?? 0;
    const completedTasks = stats?.completedTasks ?? 0;
    return [
      {
        label: 'Completion Rate',
        value: `${completionRate}%`,
        icon: Target,
        color: 'text-[#1e3a5f]'
      },
      {
        label: 'Avg. Response Time',
        value: '—',
        icon: Clock,
        color: 'text-[#1e3a5f]'
      },
      {
        label: 'Tasks Completed',
        value: String(completedTasks),
        icon: CheckCircle2,
        color: 'text-[#1e3a5f]'
      }
    ];
  }, [stats?.completionRate, stats?.completedTasks]);

  return (
    <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16 box-border">
      <div className="flex flex-col gap-8 w-full">
        <WelcomeHeader
          title={`Welcome Back, ${firstName}`}
          subtitle="Here's your performance overview and key metrics"
        />

        {statsLoading && (
          <p className="text-sm text-gray-500 font-medium">Loading dashboard…</p>
        )}

        {/* Enhanced Summary Cards with Gradients */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {summaryCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                className="group bg-white rounded-xl p-7 shadow-sm hover:shadow-xl transition-all duration-300 border border-gray-200 hover:border-[#1e3a5f]/30 relative overflow-hidden"
              >
                {/* Dark blue accent bar */}
                <div className={`absolute top-0 left-0 right-0 h-1.5 ${card.gradient}`}></div>
                
                <div className="flex items-start justify-between mb-5">
                  <div className={`p-3.5 rounded-xl ${card.iconBg} group-hover:scale-110 transition-transform duration-300`}>
                    <Icon className={`w-6 h-6 ${card.iconColor}`} />
                  </div>
                  {card.trend != null && card.trend !== '' && (
                    <span className={`text-xs font-semibold flex items-center gap-1 ${card.trendColor} bg-gray-50 px-2 py-1 rounded-md`}>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                      {card.trend}
                    </span>
                  )}
                </div>
                
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{card.label}</p>
                <p className="text-3xl font-bold text-black mb-2 leading-tight">{card.value}</p>
                <p className="text-xs text-gray-500 font-medium">{card.description}</p>
              </div>
            );
          })}
        </section>

        {/* Quick Stats Row */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {quickStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 hover:shadow-md hover:border-[#1e3a5f]/20 transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{stat.label}</p>
                    <p className="text-2xl font-bold text-black">{stat.value}</p>
                  </div>
                  <Icon className={`w-10 h-10 ${stat.color} opacity-15`} />
                </div>
              </div>
            );
          })}
        </section>

        {/* Two Column Layout */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - 2/3 width */}
          <div className="lg:col-span-2 space-y-8">
            {/* Performance Trend Chart - Enhanced */}
            <div className="bg-white rounded-xl p-8 shadow-sm border-2 border-gray-200">
              <div className="flex items-start justify-between mb-8">
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-black">Performance Trend</h3>
                  <p className="text-sm text-gray-500 font-medium">
                    Based on the last {performanceChartData.length} performance review cycles
                  </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-[#1e3a5f]/10 rounded-lg border border-[#1e3a5f]/20">
                  <Target className="w-4 h-4 text-[#1e3a5f]" />
                  <span className="text-xs font-semibold text-[#1e3a5f]">Benchmark: {benchmark}%</span>
                </div>
              </div>
              {performanceChartData.length === 0 ? (
                <div className="text-center py-12">
                  <Target className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm text-gray-600 font-medium">No performance data available</p>
                </div>
              ) : (
                <div className="w-full min-w-0 max-w-full overflow-hidden pt-2">
                  <PerformanceTrendChart data={performanceChartData} benchmark={benchmark} />
                </div>
              )}
            </div>

            {/* Assigned Projects - Enhanced */}
            <div className="bg-white rounded-xl p-8 shadow-sm border-2 border-gray-200">
              <div className="flex items-start justify-between mb-8">
                <div className="space-y-1">
                  <h3 className="text-xl font-bold text-black">Assigned Projects</h3>
                  <p className="text-sm text-gray-500 font-medium">Track your project progress and deadlines</p>
                </div>
                {data?.assignedProjects && data.assignedProjects.length > 0 && (
                  <button className="text-sm text-[#1e3a5f] hover:text-black font-semibold flex items-center gap-1.5 transition-colors px-3 py-1.5 hover:bg-[#1e3a5f]/5 rounded-lg">
                    View All
                    <ArrowUpRight className="w-4 h-4" />
                  </button>
                )}
              </div>
              {!data?.assignedProjects || data.assignedProjects.length === 0 ? (
                <div className="text-center py-12">
                  <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-sm text-gray-600 font-medium">No projects assigned yet</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {data.assignedProjects.map((project) => (
                  <div 
                    key={project.id} 
                    className="border border-gray-200 rounded-xl p-6 hover:border-[#1e3a5f] hover:shadow-lg transition-all duration-200 group bg-white"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 space-y-2">
                        <h4 className="text-lg font-bold text-black mb-1 group-hover:text-[#1e3a5f] transition-colors">
                          {project.name}
                        </h4>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Calendar className="w-4 h-4" />
                          <span>Due: {project.dueDate || 'N/A'}</span>
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1.5 rounded-full text-xs font-bold shrink-0 ${
                          project.status === 'Completed'
                            ? 'bg-black text-white'
                            : project.status === 'In Progress'
                            ? 'bg-[#1e3a5f] text-white'
                            : 'bg-gray-200 text-black'
                        }`}
                      >
                        {project.status}
                      </span>
                    </div>
                    <div className="mt-5">
                      <div className="flex items-center justify-between text-sm mb-3">
                        <span className="text-gray-600 font-semibold">Progress</span>
                        <span className="text-black font-bold">{project.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                        <div
                          className={`h-3 rounded-full transition-all duration-500 ${
                            project.status === 'Completed'
                              ? 'bg-black'
                              : 'bg-[#1e3a5f]'
                          }`}
                          style={{ width: `${project.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - 1/3 width */}
          <div className="space-y-8">
            {/* Current Role & Department - Enhanced */}
            <div className="bg-white rounded-xl p-7 shadow-sm border-2 border-[#1e3a5f]">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-[#1e3a5f] rounded-xl">
                  <User className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-black">Current Role</h3>
              </div>
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Role</p>
                  <p className="text-base font-bold text-black">{data?.role || 'Not specified'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-5 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Department</p>
                  <p className="text-base font-bold text-black">{data?.department || 'Not specified'}</p>
                </div>
              </div>
            </div>

            {/* Skills Acquired - Enhanced */}
            <div className="bg-white rounded-xl p-7 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-[#1e3a5f]/10 rounded-xl">
                    <Zap className="w-6 h-6 text-[#1e3a5f]" />
                  </div>
                  <h3 className="text-xl font-bold text-black">Top Skills</h3>
                </div>
                <span className="text-xs font-bold text-[#1e3a5f] bg-[#1e3a5f]/10 px-3 py-1.5 rounded-lg border border-[#1e3a5f]/20">
                  {data?.skillsAcquired?.length || 0} total
                </span>
              </div>
              {!data?.skillsAcquired || data.skillsAcquired.length === 0 ? (
                <div className="text-center py-8">
                  <Zap className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-600 font-medium">No skills recorded yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.skillsAcquired.slice(0, 5).map((skill, index) => (
                    <div 
                      key={skill?.name || index} 
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-xl hover:bg-gray-100 hover:border hover:border-[#1e3a5f]/20 transition-all duration-200 group border border-transparent"
                    >
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-bold text-black truncate">{skill?.name || 'Unknown Skill'}</p>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{skill?.level || 'N/A'}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Award className="w-5 h-5 text-[#1e3a5f]" />
                        <span className="text-sm font-bold text-[#1e3a5f]">
                          {(skill?.helixPoints || 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                  {data.skillsAcquired.length > 5 && (
                    <button className="w-full text-sm text-[#1e3a5f] hover:text-black font-semibold py-3 hover:bg-[#1e3a5f]/10 rounded-xl transition-all duration-200 border-2 border-[#1e3a5f]/20 hover:border-[#1e3a5f]/40 mt-2">
                      View All Skills ({data.skillsAcquired.length})
                    </button>
                  )}
                </div>
              )}
            </div>

            <SmartShortcuts stats={stats} onNavigate={onNavigate} />
          </div>
        </section>
      </div>
    </div>
  );
}
