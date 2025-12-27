/**
 * ChartContainer - Wrapper component for charts
 * White card container with title, padding, rounded corners, and shadow
 * Ensures all charts have consistent SaaS styling
 */
const ChartContainer = ({ title, children, className = '' }) => {
  return (
    <div className={`bg-white rounded-lg shadow-sm border border-gray-200 p-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-6">{title}</h3>
      <div className="w-full">
        {children}
      </div>
    </div>
  );
};

export default ChartContainer;

