/**
 * DashboardCard - Reusable card component for KPI metrics
 * Modern SaaS-style stat card with icon, large value, and label
 */
const DashboardCard = ({ icon: Icon, label, value, formatValue }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-500 mb-2">{label}</p>
          <p className="text-3xl font-bold text-gray-900">
            {formatValue ? formatValue(value) : value}
          </p>
        </div>
        <div className="p-3 bg-indigo-50 rounded-lg flex-shrink-0">
          {Icon && <Icon className="w-6 h-6 text-indigo-600" />}
        </div>
      </div>
    </div>
  );
};

export default DashboardCard;

