import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Users, UserCheck, TrendingUp, Award, Percent, Search, Bell, MessageSquare, ChevronDown, LayoutDashboard, Inbox, CheckSquare, FolderOpen, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import DepartmentDistributionChart from './charts/DepartmentDistributionChart';
import PerformanceTrendChart from './charts/PerformanceTrendChart';
import EmployeeStatusChart from './charts/EmployeeStatusChart';
import TopEmployeesLeaderboard from './TopEmployeesLeaderboard';
import DepartmentSkillView from './DepartmentSkillView';
import HRDocuments from './HRDocuments';
import HRInbox from './HRInbox';
import HRTasks from './HRTasks';
import WelcomeHeader from './common/WelcomeHeader';
import { useHRDashboardData } from '../hooks/useHRDashboardData';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('dashboard');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  const {
    loading: dashboardLoading,
    kpiData,
    departmentDistribution,
    performanceTrendData,
    topEmployees,
    employeeStatusData,
    employeesWithSkills,
  } = useHRDashboardData();
  
  // Safely extract user's first name from full name with memoization
  const userFullName = useMemo(() => user?.name || "User", [user?.name]);
  const firstName = useMemo(() => userFullName.split(' ')[0], [userFullName]);
  const initials = useMemo(() => {
    if (user?.avatar) return user.avatar;
    return userFullName.split(' ').map(n => n[0]).join('').toUpperCase();
  }, [user?.avatar, userFullName]);
  
  // Check if user is HR (for access control)
  // Note: This component should only be accessible to HR users via routing
  const isHRUser = true; // Access control handled at routing level

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    if (showUserMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  // Memoize KPI cards from live Firestore-derived kpiData
  const kpiCards = useMemo(() => [
    { 
      label: 'Total Employees', 
      value: kpiData?.totalEmployees ?? 0, 
      icon: Users,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600'
    },
    { 
      label: 'Active Employees', 
      value: kpiData?.activeEmployees ?? 0, 
      icon: UserCheck,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600'
    },
    { 
      label: 'Avg Performance', 
      value: `${kpiData?.avgPerformance ?? 0}%`, 
      icon: TrendingUp,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-600'
    },
    { 
      label: 'Helix Points', 
      value: (kpiData?.totalHelixPoints ?? 0).toLocaleString(), 
      icon: Award,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600'
    },
    { 
      label: 'Engagement Rate', 
      value: `${kpiData?.engagementRate ?? 0}%`, 
      icon: Percent,
      iconBg: 'bg-orange-50',
      iconColor: 'text-orange-600'
    },
  ], [kpiData]);

  return (
    <div className="flex min-h-screen w-full bg-gray-50">
      {/* Sidebar - Fixed width, sticky position, in normal flow */}
      <aside className="w-64 shrink-0 sticky top-0 h-screen bg-white border-r-2 border-gray-200 overflow-y-auto shadow-sm">
        <div className="flex flex-col h-full">
          {/* Logo/Brand */}
          <div className="px-6 py-8 border-b-2 border-gray-200 shrink-0 bg-[#1e3a5f]">
            <h2 className="text-2xl font-bold text-white">Helix AI</h2>
            <p className="text-xs text-gray-200 mt-2 font-medium">HR Admin Portal</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 overflow-y-auto">
            <div className="space-y-2">
              <button
                onClick={() => setActiveView('dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 ${
                  activeView === 'dashboard'
                    ? 'bg-[#1e3a5f] text-white font-bold shadow-md'
                    : 'text-gray-700 hover:bg-[#1e3a5f]/10 hover:text-[#1e3a5f] font-medium'
                }`}
              >
                <LayoutDashboard className="w-5 h-5 shrink-0" />
                <span>Dashboard</span>
              </button>
              <button
                onClick={() => setActiveView('inbox')}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 ${
                  activeView === 'inbox'
                    ? 'bg-[#1e3a5f] text-white font-bold shadow-md'
                    : 'text-gray-700 hover:bg-[#1e3a5f]/10 hover:text-[#1e3a5f] font-medium'
                }`}
              >
                <Inbox className="w-5 h-5 shrink-0" />
                <span>Inbox</span>
              </button>
              <button
                onClick={() => setActiveView('tasks')}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 ${
                  activeView === 'tasks'
                    ? 'bg-[#1e3a5f] text-white font-bold shadow-md'
                    : 'text-gray-700 hover:bg-[#1e3a5f]/10 hover:text-[#1e3a5f] font-medium'
                }`}
              >
                <CheckSquare className="w-5 h-5 shrink-0" />
                <span>Action Center</span>
              </button>
              {isHRUser && (
                <button
                  onClick={() => setActiveView('hr-documents')}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 ${
                    activeView === 'hr-documents'
                      ? 'bg-[#1e3a5f] text-white font-bold shadow-md'
                      : 'text-gray-700 hover:bg-[#1e3a5f]/10 hover:text-[#1e3a5f] font-medium'
                  }`}
                >
                  <FolderOpen className="w-5 h-5 shrink-0" />
                  <span>HR Documents</span>
                </button>
              )}
            </div>
          </nav>
        </div>
      </aside>

      {/* Main Content Area - Flex to fill remaining space, no margin needed */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Fixed Top Navbar */}
        <header className="sticky top-0 h-16 bg-white border-b-2 border-gray-200 z-20 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0 shadow-sm">
          <div className="min-w-0 shrink overflow-hidden" aria-hidden="true" />

          <div className="flex items-center gap-3 sm:gap-4 min-w-0 shrink-0">
            {/* Search Bar */}
            <div className="relative hidden md:block shrink">
              <input
                type="text"
                placeholder="Search..."
                className="pl-4 pr-10 py-2.5 rounded-xl border-2 border-gray-300 bg-white text-sm w-40 lg:w-56 xl:w-64 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f]"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
            </div>

            {/* Notifications */}
            <button 
              type="button"
              className="p-2.5 text-gray-600 hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/10 rounded-xl transition-all duration-200 relative shrink-0"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>

            {/* Messages */}
            <button 
              type="button"
              className="p-2.5 text-gray-600 hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/10 rounded-xl transition-all duration-200 relative shrink-0"
              aria-label="Messages"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
            </button>

            {/* User Profile */}
            <div className="relative shrink-0 min-w-0 z-30" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 sm:gap-3 pl-3 sm:pl-4 border-l-2 border-gray-200 min-w-0 hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors"
              >
                <div className="w-9 h-9 rounded-full bg-[#1e3a5f] flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {initials}
                </div>
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-sm font-semibold text-black hidden xl:block whitespace-nowrap">{userFullName}</span>
                  <span className="text-sm font-semibold text-black lg:block xl:hidden whitespace-nowrap">{firstName}</span>
                  <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
                </div>
              </button>
              
              {/* User Menu Dropdown */}
              {showUserMenu && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-xl border-2 border-gray-200 py-2 z-50">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-[#1e3a5f]/10 hover:text-[#1e3a5f] transition-colors rounded-lg mx-1"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content - Scrollable */}
        <main className="flex-1 overflow-y-auto min-h-0">
          {activeView === 'hr-documents' ? (
            <HRDocuments />
          ) : activeView === 'inbox' ? (
            <HRInbox />
          ) : activeView === 'tasks' ? (
            <HRTasks />
          ) : (
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-16">
              {dashboardLoading ? (
                <div className="flex items-center justify-center py-24">
                  <p className="text-gray-500 font-medium">Loading dashboard data...</p>
                </div>
              ) : (
              <div className="flex flex-col gap-8">
              <WelcomeHeader
                title={`Welcome Back, ${firstName}`}
                subtitle="Here's what's happening with your team."
              />

              {/* KPI Cards Grid */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
                {kpiCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.label}
                      className="bg-white rounded-xl p-7 shadow-sm border-2 border-gray-200 hover:shadow-lg hover:border-[#1e3a5f]/30 transition-all duration-200 min-w-0 relative overflow-hidden"
                    >
                      <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#1e3a5f]"></div>
                      <div className="flex items-start justify-between mb-5">
                        <div className={`p-3.5 rounded-xl ${card.iconBg} shrink-0`}>
                          <Icon className={`w-6 h-6 ${card.iconColor}`} />
                        </div>
                      </div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 truncate">{card.label}</p>
                      <p className="text-3xl font-bold text-black leading-tight">{card.value}</p>
                    </div>
                  );
                })}
              </section>

              {/* Charts Grid - Row 1 */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Employee Distribution Chart */}
                <div className="bg-white rounded-xl p-8 shadow-sm border-2 border-gray-200 min-w-0 flex flex-col hover:shadow-md transition-all duration-200">
                  <h3 className="text-xl font-bold text-black mb-8">
                    Employee Distribution by Department
                  </h3>
                  <div className="w-full min-w-0 flex-1 flex items-center">
                    <DepartmentDistributionChart data={departmentDistribution ?? []} />
                  </div>
                </div>

                {/* Performance Trend Chart */}
                <div className="bg-white rounded-xl p-8 shadow-sm border-2 border-gray-200 min-w-0 flex flex-col hover:shadow-md transition-all duration-200">
                  <h3 className="text-xl font-bold text-black mb-8">
                    Performance Over Time
                  </h3>
                  <div className="w-full min-w-0 flex-1 flex items-center">
                    <PerformanceTrendChart data={performanceTrendData ?? []} benchmark={85} />
                  </div>
                </div>
              </section>

              {/* Secondary Content Grid - Row 2 */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Top Employees Leaderboard */}
                <div className="min-w-0">
                  <TopEmployeesLeaderboard employees={topEmployees ?? []} />
                </div>

                {/* Employee Status Chart */}
                <div className="bg-white rounded-xl p-8 shadow-sm border-2 border-gray-200 min-w-0 flex flex-col lg:col-span-2 hover:shadow-md transition-all duration-200">
                  <h3 className="text-xl font-bold text-black mb-8">
                    Employee Status Overview
                  </h3>
                  <div className="w-full min-w-0 flex-1 flex items-center">
                    <EmployeeStatusChart data={employeeStatusData ?? []} />
                  </div>
                </div>
              </section>

              {/* Department-Wise Employee Skills Section */}
              <section>
                <DepartmentSkillView employeesWithSkills={employeesWithSkills ?? []} />
              </section>
              </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}