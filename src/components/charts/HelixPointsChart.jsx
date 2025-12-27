import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/**
 * HelixPointsChart - Bar chart comparing Helix Points by department
 */
const HelixPointsChart = ({ data }) => {
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold mb-2">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {`${entry.name}: ${entry.value}%`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="department" stroke="#6b7280" />
        <YAxis stroke="#6b7280" />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="engineering" fill="#3b82f6" name="Engineering" />
        <Bar dataKey="sales" fill="#f59e0b" name="Sales" />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default HelixPointsChart;

