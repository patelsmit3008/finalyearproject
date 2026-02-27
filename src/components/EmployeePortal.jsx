import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, FileText, TrendingUp, Search, Bell, ChevronDown, User, LogOut, Briefcase, ClipboardList, Inbox } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import EmployeeDashboard from './employee/EmployeeDashboard';
import HelixChat from './employee/HelixChat';
import ResumeAnalysis from './employee/ResumeAnalysis';
import MyProgress from './employee/MyProgress';
import ProjectContributions from './employee/ProjectContributions';
import MyProjectInterests from './employee/MyProjectInterests';
import EmployeeInbox from './employee/EmployeeInbox';

export default function EmployeePortal() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState('dashboard');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);
  const firstName = user.name.split(' ')[0];
  const initials = user.avatar || user.name.split(' ').map(n => n[0]).join('').toUpperCase();

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

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'inbox', label: 'Inbox', icon: Inbox },
    { id: 'helix-chat', label: 'Helix Chat', icon: MessageSquare },
    { id: 'resume-analysis', label: 'Resume Analysis', icon: FileText },
    { id: 'my-progress', label: 'My Progress', icon: TrendingUp },
    { id: 'project-contributions', label: 'Project Skill Contributions', icon: Briefcase },
    { id: 'project-interests', label: 'My Project Applications', icon: ClipboardList },
  ];

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return <EmployeeDashboard onNavigate={setActiveView} />;
      case 'inbox':
        return <EmployeeInbox />;
      case 'helix-chat':
        return <HelixChat />;
      case 'resume-analysis':
        return <ResumeAnalysis />;
      case 'my-progress':
        return <MyProgress />;
      case 'project-contributions':
        return <ProjectContributions />;
      case 'project-interests':
        return <MyProjectInterests />;
      default:
        return <EmployeeDashboard />;
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-gray-50 overflow-x-hidden">
      {/* Sidebar - Fixed width, does not scroll horizontally */}
      <aside className="w-64 shrink-0 sticky top-0 h-screen bg-white border-r-2 border-gray-200 overflow-y-auto overflow-x-hidden shadow-sm">
        <div className="flex flex-col h-full">
          {/* Logo/Brand */}
          <div className="px-6 py-8 border-b-2 border-gray-200 shrink-0 bg-[#1e3a5f]">
            <h2 className="text-2xl font-bold text-white">Helix AI</h2>
            <p className="text-xs text-gray-200 mt-2 font-medium">Employee Portal</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 overflow-y-auto overflow-x-hidden">
            <div className="space-y-2">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveView(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl transition-all duration-200 ${
                      activeView === item.id
                        ? 'bg-[#1e3a5f] text-white font-bold shadow-md'
                        : 'text-gray-700 hover:bg-[#1e3a5f]/10 hover:text-[#1e3a5f] font-medium'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </aside>

      {/* Main Content Area - Starts after sidebar, uses flex-grow */}
      <div className="flex-1 flex flex-col min-w-0 max-w-full overflow-x-hidden">
        {/* Top Navbar */}
        <header className="sticky top-0 h-16 bg-white border-b-2 border-gray-200 z-20 flex items-center justify-between px-4 sm:px-6 lg:px-8 shrink-0 shadow-sm">
          <div className="min-w-0 shrink overflow-hidden">
            <h1 className="text-lg sm:text-xl font-bold text-black truncate">Employee Portal</h1>
          </div>

          <div className="flex items-center gap-3 sm:gap-4 min-w-0 shrink-0">
            {/* Search Bar */}
            <div className="relative hidden md:block shrink">
              <input
                type="text"
                placeholder="Search..."
                className="pl-4 pr-10 py-2.5 rounded-xl border-2 border-gray-300 bg-white text-sm w-40 lg:w-56 xl:w-64 focus:outline-none focus:ring-2 focus:ring-[#1e3a5f] focus:border-[#1e3a5f] max-w-full"
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
                  <span className="text-sm font-semibold text-black hidden xl:block whitespace-nowrap">{user.name}</span>
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

        {/* Main Content - Scrollable, constrained width */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 w-full max-w-full">
          <div className="w-full max-w-full box-border">
            {renderContent()}
          </div>
        </main>
      </div>
    </div>
  );
}

