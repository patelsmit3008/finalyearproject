/**
 * TopEmployeesLeaderboard - Displays top employees by Helix Points
 * Card container matching other chart components
 */
const TopEmployeesLeaderboard = ({ employees }) => {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 h-full flex flex-col">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">Top Employees</h3>
      <div className="space-y-3 flex-1">
        {employees.map((employee, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                index === 0 ? 'bg-yellow-100 text-yellow-800' :
                index === 1 ? 'bg-gray-100 text-gray-800' :
                index === 2 ? 'bg-orange-100 text-orange-800' :
                'bg-gray-50 text-gray-600'
              }`}>
                {index + 1}
              </div>
              <div>
                <p className="font-medium text-gray-900 text-sm">{employee.name}</p>
                <p className="text-xs text-gray-500">{employee.department}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold text-indigo-600">{employee.helixPoints.toLocaleString()}</p>
              <p className="text-xs text-gray-500">points</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default TopEmployeesLeaderboard;

