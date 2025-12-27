import { LayoutDashboard, Inbox, CheckSquare } from 'lucide-react';

/**
 * Sidebar - Navigation sidebar component
 */
const Sidebar = () => {
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', active: true },
    { icon: Inbox, label: 'Inbox', active: false },
    { icon: CheckSquare, label: 'Tasks', active: false },
  ];

  return (
    <div className="w-64 bg-white border-r border-gray-200 h-screen fixed left-0 top-0 z-20">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-8">HR Admin Dashboard</h1>
        <nav className="space-y-1">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <a
                key={index}
                href="#"
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  item.active
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default Sidebar;

