import { useState } from 'react';
import { Users, UserCheck, TrendingUp, Award, Percent, Search, Bell, MessageSquare, ChevronDown, LayoutDashboard, Inbox, CheckSquare, FolderOpen } from 'lucide-react';
import DepartmentDistributionChart from './charts/DepartmentDistributionChart';
import PerformanceTrendChart from './charts/PerformanceTrendChart';
import EmployeeStatusChart from './charts/EmployeeStatusChart';
import TopEmployeesLeaderboard from './TopEmployeesLeaderboard';
import DepartmentSkillView from './DepartmentSkillView';
import HRDocuments from './HRDocuments';
import HRInbox from './HRInbox';
import HRTasks from './HRTasks';
import { kpiData, departmentDistribution, performanceTrendData, topEmployees, employeeStatusData, employeesWithSkills } from '../data/mockData';

export default function Dashboard() {
  // Extract user's first name from full name
  const userFullName = "Smit Patel";
  const firstName = userFullName.split(' ')[0];
  
  // Navigation state
  const [activeView, setActiveView] = useState('dashboard');
  
  // Check if user is HR (for access control)
  const isHRUser = true; // In real app, this would come from auth context

  const kpiCards = [
    { 
      label: 'Total Employees', 
      value: kpiData.totalEmployees, 
      icon: Users,
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-600'
    },
    { 
      label: 'Active Employees', 
      value: kpiData.activeEmployees, 
      icon: UserCheck,
      iconBg: 'bg-green-50',
      iconColor: 'text-green-600'
    },
    { 
      label: 'Avg Performance', 
      value: `${kpiData.avgPerformance}%`, 
      icon: TrendingUp,
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-600'
    },
    { 
      label: 'Helix Points', 
      value: kpiData.avgHelixPoints.toLocaleString(), 
      icon: Award,
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-600'
    },
    { 
      label: 'Engagement Rate', 
      value: `${kpiData.engagementRate}%`, 
      icon: Percent,
      iconBg: 'bg-orange-50',
      iconColor: 'text-orange-600'
    },
  ];

  return (
    <div className="flex min-h-screen w-full bg-gray-50">
      {/* Sidebar - Fixed width, sticky position, in normal flow */}
      <aside className="w-64 shrink-0 sticky top-0 h-screen bg-white border-r border-gray-200 overflow-y-auto">
        <div className="flex flex-col h-full">
          {/* Logo/Brand */}
          <div className="px-6 py-6 border-b border-gray-200 shrink-0">
            <h2 className="text-xl font-bold text-gray-900">Helix AI</h2>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 overflow-y-auto">
            <div className="space-y-1">
              <button
                onClick={() => setActiveView('dashboard')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeView === 'dashboard'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <LayoutDashboard className="w-5 h-5 shrink-0" />
                <span>Dashboard</span>
              </button>
              <button
                onClick={() => setActiveView('inbox')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeView === 'inbox'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Inbox className="w-5 h-5 shrink-0" />
                <span>Inbox</span>
              </button>
              <button
                onClick={() => setActiveView('tasks')}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  activeView === 'tasks'
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <CheckSquare className="w-5 h-5 shrink-0" />
                <span>Tasks</span>
              </button>
              {isHRUser && (
                <button
                  onClick={() => setActiveView('hr-documents')}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    activeView === 'hr-documents'
                      ? 'bg-indigo-50 text-indigo-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50'
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
        <header className="sticky top-0 h-16 bg-white border-b border-gray-200 z-20 flex items-center justify-between px-4 sm:px-6 shrink-0 overflow-hidden">
          <div className="min-w-0 shrink">
            <h1 className="text-lg sm:text-xl font-bold text-gray-900 truncate">HR Admin Dashboard</h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 min-w-0 shrink-0">
            {/* Search Bar */}
            <div className="relative hidden md:block shrink">
              <input
                type="text"
                placeholder="Search..."
                className="pl-4 pr-10 py-2 rounded-lg border border-gray-300 bg-white text-sm w-40 lg:w-56 xl:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none z-10" />
            </div>

            {/* Notifications */}
            <button 
              type="button"
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors relative shrink-0"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>

            {/* Messages */}
            <button 
              type="button"
              className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors relative shrink-0"
              aria-label="Messages"
            >
              <MessageSquare className="w-5 h-5" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
            </button>

            {/* User Profile */}
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-4 border-l border-gray-200 shrink-0 min-w-0">
              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-sm shrink-0">
                SP
              </div>
              <div className="flex items-center gap-1 cursor-pointer min-w-0">
                <span className="text-sm font-medium text-gray-900 hidden xl:block whitespace-nowrap">Smit Patel</span>
                <span className="text-sm font-medium text-gray-900 lg:block xl:hidden whitespace-nowrap">Smit</span>
                <ChevronDown className="w-4 h-4 text-gray-500 shrink-0" />
              </div>
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
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-12">
              {/* Vertical Flex Container for Even Spacing */}
              <div className="flex flex-col gap-6">
              {/* Welcome Section */}
              <div>
                <p className="text-lg sm:text-xl font-bold text-gray-900">
                  Welcome Back, <span className="text-gray-900">{firstName}</span>! Here's what's happening with your team.
                </p>
              </div>

              {/* KPI Cards Grid */}
              <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {kpiCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.label}
                      className="bg-white rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow duration-200 min-w-0"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <div className={`p-2.5 rounded-lg ${card.iconBg} shrink-0`}>
                          <Icon className={`w-5 h-5 ${card.iconColor}`} />
                        </div>
                      </div>
                      <p className="text-sm font-medium text-gray-500 mb-1 truncate">{card.label}</p>
                      <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                    </div>
                  );
                })}
              </section>

              {/* Charts Grid - Row 1 */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Employee Distribution Chart */}
                <div className="bg-white rounded-lg p-6 shadow-sm min-w-0 flex flex-col">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">
                    Employee Distribution by Department
                  </h3>
                  <div className="w-full min-w-0 flex-1 flex items-center">
                    <DepartmentDistributionChart data={departmentDistribution} />
                  </div>
                </div>

                {/* Performance Trend Chart */}
                <div className="bg-white rounded-lg p-6 shadow-sm min-w-0 flex flex-col">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">
                    Performance Over Time
                  </h3>
                  <div className="w-full min-w-0 flex-1 flex items-center">
                    <PerformanceTrendChart data={performanceTrendData} />
                  </div>
                </div>
              </section>

              {/* Secondary Content Grid - Row 2 */}
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Top Employees Leaderboard */}
                <div className="min-w-0">
                  <TopEmployeesLeaderboard employees={topEmployees} />
                </div>

                {/* Employee Status Chart */}
                <div className="bg-white rounded-lg p-6 shadow-sm min-w-0 flex flex-col lg:col-span-2">
                  <h3 className="text-lg font-semibold text-gray-900 mb-6">
                    Employee Status Overview
                  </h3>
                  <div className="w-full min-w-0 flex-1 flex items-center">
                    <EmployeeStatusChart data={employeeStatusData} />
                  </div>
                </div>
              </section>

              {/* Department-Wise Employee Skills Section */}
              <section>
                <DepartmentSkillView employeesWithSkills={employeesWithSkills} />
              </section>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}