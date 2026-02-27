import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Label } from 'recharts';

/**
 * PerformanceTrendChart - Modern line chart showing performance trends over time
 * Enhanced with gradients, better visibility, and improved UX
 */
const PerformanceTrendChart = ({ data, benchmark = 85 }) => {
  // Calculate Y-axis domain with better fit for employee data
  const calculateYAxisDomain = () => {
    if (!data || data.length === 0) return [65, 105];
    
    let minValue = Infinity;
    let maxValue = 0;
    
    data.forEach((item) => {
      if (item.overallScore !== null && item.overallScore !== undefined) {
        if (item.overallScore < minValue) minValue = item.overallScore;
        if (item.overallScore > maxValue) maxValue = item.overallScore;
      }
    });
    
    // Set minimum around 65-70, but adjust based on actual data
    const lowerBound = Math.max(65, Math.floor(minValue - 5));
    
    // Add headroom at the top, ensure minimum of 100, max of 105
    const headroom = Math.max(maxValue * 0.1, 5);
    const upperBound = Math.min(Math.ceil(maxValue + headroom), 105);
    
    return [lowerBound, Math.max(upperBound, 100)];
  };

  const yAxisDomain = calculateYAxisDomain();
  
  // Get active period (last data point - "Current")
  const activePeriodIndex = data.length - 1;
  const activePeriodData = data[activePeriodIndex];
  const activeScore = activePeriodData?.overallScore;
  
  // Calculate gap vs benchmark for annotation
  const gapVsBenchmark = activeScore !== null && activeScore !== undefined
    ? activeScore - benchmark
    : 0;
  
  // Determine line color based on performance vs benchmark
  const getLineColor = (score) => {
    if (score === null || score === undefined) return '#3b82f6'; // Default blue
    const diff = score - benchmark;
    if (diff >= 0) return '#3b82f6'; // Blue - meets or exceeds
    if (diff >= -2) return '#f59e0b'; // Amber - within 2% below
    return '#ef4444'; // Red - below benchmark
  };
  
  // Get color for the line (based on active/last point)
  const lineColor = getLineColor(activeScore);
  
  // Add benchmark value and color info to each data point
  const chartData = data.map((item, index) => ({
    ...item,
    benchmark: benchmark,
    isActive: index === activePeriodIndex || item.isCurrent,
    pointColor: getLineColor(item.overallScore),
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const performanceEntry = payload.find(e => e.dataKey === 'overallScore');
      const benchmarkEntry = payload.find(e => e.dataKey === 'benchmark');
      const score = performanceEntry?.value;
      const gap = score !== null && score !== undefined && benchmarkEntry?.value
        ? score - benchmarkEntry.value
        : null;
      
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-900 mb-2 text-sm">{label}</p>
          <div className="space-y-1.5">
            {payload.map((entry, index) => {
              if (entry.dataKey === 'benchmark') return null; // Hide benchmark in tooltip
              return (
                <div key={index} className="flex items-center gap-2">
                  <div 
                    className="w-2.5 h-2.5 rounded-full" 
                    style={{ backgroundColor: entry.color }}
                  />
                  <span className="text-xs font-medium text-gray-700">
                    {entry.name}:
                  </span>
                  <span 
                    className="text-xs font-bold"
                    style={{ color: entry.color }}
                  >
                    {entry.value !== null && entry.value !== undefined ? entry.value : 'N/A'}
                  </span>
                </div>
              );
            })}
            {gap !== null && (
              <div className="pt-1.5 mt-1.5 border-t border-gray-200">
                <span className={`text-xs font-medium ${gap >= 0 ? 'text-green-600' : gap >= -2 ? 'text-amber-600' : 'text-red-600'}`}>
                  {gap > 0 ? '+' : ''}{gap.toFixed(1)}% vs benchmark
                </span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };
  
  // Custom label for active month - shows "Current: XX%"
  const CustomActiveLabel = (props) => {
    if (!props || !props.payload || !props.payload.isActive) return null;
    const score = props.payload.overallScore;
    if (score === null || score === undefined) return null;
    
    const labelColor = getLineColor(score);
    
    return (
      <g>
        <rect
          x={props.x - 35}
          y={props.y - 32}
          width={70}
          height={20}
          fill="white"
          stroke={labelColor}
          strokeWidth={2}
          rx={4}
          opacity={0.95}
        />
        <text
          x={props.x}
          y={props.y - 18}
          fill={labelColor}
          fontSize={12}
          fontWeight={700}
          textAnchor="middle"
        >
          Current: {score}%
        </text>
      </g>
    );
  };
  
  // Get status text for benchmark relationship
  const getBenchmarkStatus = () => {
    if (activeScore === null || activeScore === undefined) return null;
    const gap = activeScore - benchmark;
    if (gap >= 2) return { text: 'Above Target', color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200', dotColor: 'bg-green-600' };
    if (gap >= 0) return { text: 'At Target', color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200', dotColor: 'bg-blue-600' };
    if (gap >= -2) return { text: 'Slightly Below Target', color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200', dotColor: 'bg-amber-600' };
    return { text: 'Below Target', color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200', dotColor: 'bg-red-600' };
  };
  
  const benchmarkStatus = getBenchmarkStatus();

  return (
    <div className="w-full">
      {/* Status Indicator */}
      {benchmarkStatus && activeScore !== null && activeScore !== undefined && (
        <div className={`mb-3 px-3 py-2 rounded-lg border ${benchmarkStatus.bg} ${benchmarkStatus.border} inline-flex items-center gap-2`}>
          <div className={`w-2 h-2 rounded-full ${benchmarkStatus.dotColor}`}></div>
          <span className={`text-sm font-semibold ${benchmarkStatus.color}`}>
            {benchmarkStatus.text}
          </span>
          <span className="text-xs text-gray-600">
            ({activeScore}% vs {benchmark}% target)
          </span>
        </div>
      )}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart 
          data={chartData} 
          margin={{ top: 50, right: 30, left: 50, bottom: 60 }}
        >
        {/* Very light gridlines - reduced visual noise */}
        <CartesianGrid 
          strokeDasharray="3 3" 
          stroke="#e5e7eb" 
          strokeOpacity={0.15}
          vertical={false}
        />
        
        {/* X-Axis with relative time labels */}
        <XAxis 
          dataKey="period" 
          stroke="#9ca3af" 
          tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 400 }}
          tickMargin={8}
          label={{ 
            value: 'Review Period', 
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
        
        {/* Y-Axis with softer styling and dynamic domain */}
        <YAxis 
          domain={yAxisDomain}
          stroke="#9ca3af"
          tick={{ fill: '#6b7280', fontSize: 11, fontWeight: 400 }}
          tickMargin={8}
          allowDecimals={false}
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
        
        {/* Legend positioned at top with proper spacing */}
        <Legend 
          wrapperStyle={{ 
            paddingTop: '5px',
            paddingBottom: '15px'
          }}
          iconType="line"
          iconSize={14}
          formatter={(value) => <span className="text-xs font-medium text-gray-700">{value}</span>}
        />
        
        {/* Area fill under performance line - subtle with low opacity */}
        <Area
          type="monotone"
          dataKey="overallScore"
          fill={lineColor}
          fillOpacity={0.08}
          stroke="none"
        />
        
        {/* Overall Score line - Primary line with conditional coloring */}
        <Line
          type="monotone"
          dataKey="overallScore"
          stroke={lineColor}
          strokeWidth={3.5}
          name="Your Performance"
          activeDot={{ 
            r: 8,
            strokeWidth: 3,
            stroke: '#fff',
            fill: lineColor
          }}
          // Show prominent dot only for active month, subtle dots for others
          dot={(props) => {
            if (props.payload?.isActive) {
              // Large, prominent marker for current month
              return (
                <circle
                  cx={props.cx}
                  cy={props.cy}
                  r={8}
                  fill={props.payload.pointColor || lineColor}
                  stroke="#fff"
                  strokeWidth={4}
                />
              );
            }
            // Subtle, small dots for previous months
            return (
              <circle
                cx={props.cx}
                cy={props.cy}
                r={2}
                fill={lineColor}
                fillOpacity={0.3}
                stroke="none"
              />
            );
          }}
          label={<CustomActiveLabel />}
        />
        
        {/* Benchmark line - Expected performance (minimal, secondary) */}
        <Line
          type="monotone"
          dataKey="benchmark"
          stroke="#9ca3af"
          strokeWidth={1}
          strokeOpacity={0.3}
          strokeDasharray="8 4"
          name={`Expected Performance (${benchmark}%)`}
          activeDot={false}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
    </div>
  );
};

export default PerformanceTrendChart;

