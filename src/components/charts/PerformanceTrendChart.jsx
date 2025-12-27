import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

/**
 * PerformanceTrendChart - Modern line chart showing performance trends over time
 * Enhanced with gradients, better visibility, and improved UX
 */
const PerformanceTrendChart = ({ data }) => {
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-4 border border-gray-200 rounded-lg shadow-xl">
          <p className="font-semibold text-gray-900 mb-3 text-sm">{label}</p>
          <div className="space-y-2">
            {payload.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <div 
                  className="w-3 h-3 rounded-full" 
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-sm font-medium text-gray-700">
                  {entry.name}:
                </span>
                <span 
                  className="text-sm font-bold"
                  style={{ color: entry.color }}
                >
                  {entry.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  // Get the last data point index for highlighting
  const lastIndex = data.length - 1;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 20, right: 30, left: 50, bottom: 60 }}>
        {/* Subtle gridlines with reduced opacity */}
        <CartesianGrid 
          strokeDasharray="3 3" 
          stroke="#e5e7eb" 
          strokeOpacity={0.4}
          vertical={false}
        />
        
        {/* X-Axis with softer styling */}
        <XAxis 
          dataKey="month" 
          stroke="#9ca3af" 
          tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 400 }}
          tickMargin={8}
          label={{ 
            value: 'Month', 
            position: 'insideBottom', 
            offset: -5, 
            style: { 
              textAnchor: 'middle', 
              fill: '#64748b', 
              fontSize: 14, 
              fontWeight: 500 
            } 
          }}
        />
        
        {/* Y-Axis with softer styling */}
        <YAxis 
          stroke="#9ca3af"
          tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 400 }}
          tickMargin={8}
          label={{ 
            value: 'Performance Score', 
            angle: -90, 
            position: 'insideLeft', 
            style: { 
              textAnchor: 'middle', 
              fill: '#64748b', 
              fontSize: 14, 
              fontWeight: 500 
            } 
          }}
        />
        
        <Tooltip content={<CustomTooltip />} />
        
        {/* Legend positioned at top-right */}
        <Legend 
          wrapperStyle={{ 
            paddingTop: '10px',
            paddingBottom: '10px'
          }}
          iconType="line"
          iconSize={12}
          formatter={(value) => <span className="text-xs font-medium text-gray-700">{value}</span>}
        />
        
        {/* Overall Score line with enhanced styling */}
        <Line
          type="monotone"
          dataKey="overallScore"
          stroke="#3b82f6"
          strokeWidth={3}
          name="Overall Score"
          activeDot={{ 
            r: 7,
            strokeWidth: 2,
            stroke: '#fff',
            fill: '#3b82f6'
          }}
          // Custom dot renderer to highlight last point
          dot={(props) => {
            const isLastPoint = props.index === lastIndex;
            return (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={isLastPoint ? 7 : 5}
                fill="#3b82f6"
                stroke="#fff"
                strokeWidth={isLastPoint ? 3 : 2}
              />
            );
          }}
        />
        
        {/* Top Employees line with enhanced styling */}
        <Line
          type="monotone"
          dataKey="topEmployees"
          stroke="#f59e0b"
          strokeWidth={3}
          name="Top Employees"
          activeDot={{ 
            r: 7,
            strokeWidth: 2,
            stroke: '#fff',
            fill: '#f59e0b'
          }}
          // Custom dot renderer to highlight last point
          dot={(props) => {
            const isLastPoint = props.index === lastIndex;
            return (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={isLastPoint ? 7 : 5}
                fill="#f59e0b"
                stroke="#fff"
                strokeWidth={isLastPoint ? 3 : 2}
              />
            );
          }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default PerformanceTrendChart;

