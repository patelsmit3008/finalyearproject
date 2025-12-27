import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';

/**
 * DepartmentDistributionChart - Donut chart showing employee distribution by department
 */
const DepartmentDistributionChart = ({ data }) => {
  const COLORS = data.map(item => item.color);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-slate-200 rounded-lg shadow-lg">
          <p className="font-semibold text-slate-900">{payload[0].name}</p>
          <p className="text-indigo-600 font-medium">{`${payload[0].value}%`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="35%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
          outerRadius={80}
          innerRadius={50}
          fill="#8884d8"
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[index]} />
          ))}
        </Pie>
        <Tooltip content={<CustomTooltip />} />
        <Legend
          verticalAlign="middle"
          align="right"
          layout="vertical"
          formatter={(value, entry) => (
            <span style={{ color: entry.color, fontSize: '13px', fontWeight: 500 }}>
              {value}: {entry.payload.value}%
            </span>
          )}
          wrapperStyle={{ fontSize: '13px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};

export default DepartmentDistributionChart;

