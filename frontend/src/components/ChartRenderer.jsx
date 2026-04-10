/**
 * ChartRenderer.jsx
 * Decides and renders the correct Recharts chart type based on `variant` and
 * the shape/length of `data`. All chart-type selection logic lives here.
 *
 * Variants & rules
 * ───────────────────────────────────────────────────────────────
 *  'industry'        A  Pie (≤6 items) | Vertical Bar (>6)         Blue
 *  'skills'          B  Horizontal Bar — always                     Green
 *  'keywords'        C  Donut (≤10 items) | Vertical Bar (>10)      Purple
 *  'industry-match'  E  Donut of YES counts (≤5) | Stacked Bar (>5) Blue
 *  'keyword-match'   F  Vertical Bar (≤10) | Scrollable H-Bar (>10) Purple + clickable
 *  'location'           Pie (≤5) | Horizontal Bar (>5)              Cyan
 */

import { useMemo } from 'react';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

// ── Colour palettes ───────────────────────────────────────────────────────────
// Shared pie/donut palette: cycles blue → green → yellow for clear group distinction
const PIE_PALETTE = [
  '#2563eb',  // blue
  '#16a34a',  // green
  '#eab308',  // yellow
  '#1d4ed8',  // deep blue
  '#22c55e',  // bright green
  '#fbbf24',  // amber
  '#3b82f6',  // mid blue
  '#4ade80',  // light green
  '#fde047',  // light yellow
  '#60a5fa',  // pale blue
];

export const PALETTES = {
  industry: PIE_PALETTE,
  skills:   ['#16a34a', '#22c55e', '#4ade80', '#86efac', '#15803d', '#166534', '#84cc16', '#a3e635', '#65a30d', '#bef264'],
  keywords: PIE_PALETTE,
  location: PIE_PALETTE,
};

// ── Custom tooltip ─────────────────────────────────────────────────────────────
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="px-3 py-2 rounded-lg text-xs shadow-lg pointer-events-none"
      style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', minWidth: 100 }}
    >
      {label && (
        <p className="font-semibold text-gray-700 mb-1 max-w-[180px] truncate" title={label}>
          {label}
        </p>
      )}
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color || entry.fill || '#374151' }} className="leading-5">
          {entry.name && entry.name !== label ? `${entry.name}: ` : ''}
          <span className="font-bold">{Number(entry.value).toLocaleString()}</span>
        </p>
      ))}
    </div>
  );
};

// ── Custom pie centre label (% shown inside slice) ────────────────────────────
const PieInnerLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }) => {
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      fontSize={10} fontWeight="700">
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

// ── Sub-components ────────────────────────────────────────────────────────────

const PieComponent = ({ data, colors, isDonut, onItemClick }) => (
  <ResponsiveContainer width="100%" height={230}>
    <PieChart>
      <Pie
        data={data}
        dataKey="count"
        nameKey="name"
        cx="50%"
        cy="50%"
        outerRadius={isDonut ? 85 : 90}
        innerRadius={isDonut ? 48 : 0}
        labelLine={false}
        label={PieInnerLabel}
        onClick={onItemClick ? entry => onItemClick(entry) : undefined}
        style={onItemClick ? { cursor: 'pointer' } : undefined}
        animationDuration={600}
      >
        {data.map((_, i) => (
          <Cell key={i} fill={colors[i % colors.length]} stroke="#fff" strokeWidth={2} />
        ))}
      </Pie>
      <Tooltip content={<ChartTooltip />} />
      <Legend
        formatter={value => (
          <span className="text-[10px] text-gray-600" title={value}>
            {value.length > 18 ? value.slice(0, 17) + '…' : value}
          </span>
        )}
        iconSize={8}
        iconType="circle"
        wrapperStyle={{ fontSize: 10 }}
      />
    </PieChart>
  </ResponsiveContainer>
);

const VBarComponent = ({ data, color, onItemClick }) => (
  <ResponsiveContainer width="100%" height={230}>
    <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 48 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
      <XAxis
        dataKey="name"
        tick={{ fontSize: 9, fill: '#6b7280' }}
        angle={-38}
        textAnchor="end"
        interval={0}
        tickLine={false}
        axisLine={false}
      />
      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
      <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
      <Bar
        dataKey="count"
        fill={color}
        radius={[4, 4, 0, 0]}
        maxBarSize={44}
        animationDuration={500}
        onClick={onItemClick ? entry => onItemClick(entry) : undefined}
        style={onItemClick ? { cursor: 'pointer' } : undefined}
      />
    </BarChart>
  </ResponsiveContainer>
);

const HBarComponent = ({ data, color, height, onItemClick }) => (
  <ResponsiveContainer width="100%" height={height || Math.max(220, data.length * 29)}>
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 28, left: 4, bottom: 4 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
      <XAxis type="number" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
      <YAxis
        type="category"
        dataKey="name"
        tick={{ fontSize: 10, fill: '#374151' }}
        width={114}
        tickLine={false}
        axisLine={false}
        tickFormatter={v => (v?.length > 16 ? v.slice(0, 15) + '…' : v)}
      />
      <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
      <Bar
        dataKey="count"
        fill={color}
        radius={[0, 4, 4, 0]}
        maxBarSize={18}
        animationDuration={500}
        onClick={onItemClick ? entry => onItemClick(entry) : undefined}
        style={onItemClick ? { cursor: 'pointer' } : undefined}
      />
    </BarChart>
  </ResponsiveContainer>
);

const StackedBarComponent = ({ data }) => (
  <ResponsiveContainer width="100%" height={230}>
    <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 48 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
      <XAxis
        dataKey="name"
        tick={{ fontSize: 9, fill: '#6b7280' }}
        angle={-38}
        textAnchor="end"
        interval={0}
        tickLine={false}
        axisLine={false}
        tickFormatter={v => (v?.length > 12 ? v.slice(0, 11) + '…' : v)}
      />
      <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} />
      <Tooltip content={<ChartTooltip />} cursor={{ fill: '#f9fafb' }} />
      <Legend
        formatter={value => <span className="text-[10px] text-gray-600">{value}</span>}
        iconSize={8}
        wrapperStyle={{ fontSize: 10 }}
      />
      <Bar dataKey="yes" name="YES Match" stackId="s" fill="#22c55e" maxBarSize={44} animationDuration={500} />
      <Bar dataKey="no"  name="No Match"  stackId="s" fill="#e5e7eb" radius={[4, 4, 0, 0]} maxBarSize={44} animationDuration={500} />
    </BarChart>
  </ResponsiveContainer>
);

/** Scrollable wrapper for the H-Bar when there are many items. */
const ScrollHBarComponent = ({ data, color, onItemClick, maxHeight = 300 }) => {
  const innerH = Math.max(data.length * 30 + 40, 220);
  return (
    <div
      className="overflow-y-auto rounded"
      style={{ maxHeight, scrollbarWidth: 'thin', scrollbarColor: '#94a3b8 #f1f5f9' }}
    >
      <div style={{ height: innerH }}>
        <HBarComponent data={data} color={color} height={innerH} onItemClick={onItemClick} />
      </div>
    </div>
  );
};

// ── Empty / no-CI placeholders ────────────────────────────────────────────────
const Empty = () => (
  <div className="flex flex-col items-center justify-center h-44 text-gray-300 select-none">
    <svg className="w-10 h-10 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
    <p className="text-sm font-medium">No data</p>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

/**
 * ChartRenderer
 * @param {object[]} data       — aggregated data items
 * @param {string}   variant    — 'industry' | 'skills' | 'keywords' | 'industry-match' | 'keyword-match' | 'location'
 * @param {function} onItemClick — optional; called with the clicked datum {name, count, ...}
 */
const ChartRenderer = ({ data = [], variant = 'industry', onItemClick }) => {
  const resolved = useMemo(() => {
    if (!data || data.length === 0) return { type: 'empty' };

    switch (variant) {
      case 'industry':
        return data.length <= 6
          ? { type: 'pie',   colors: PALETTES.industry }
          : { type: 'vbar',  color:  '#2563eb' };

      case 'skills':
        return { type: 'hbar', color: '#16a34a' };

      case 'keywords':
        return data.length <= 10
          ? { type: 'donut', colors: PALETTES.keywords }
          : { type: 'vbar',  color:  '#f97316' };

      case 'industry-match': {
        // Always pie — show YES counts per industry
        const pieData = data
          .map(d => ({ name: d.name, count: d.yes }))
          .filter(d => d.count > 0);
        return { type: 'donut', colors: PALETTES.industry, pieData };
      }

      case 'keyword-match':
        return data.length <= 10
          ? { type: 'vbar',        color: '#f97316', clickable: true }
          : { type: 'scroll-hbar', color: '#f97316', clickable: true };

      case 'location':
        return { type: 'scroll-hbar', color: '#0284c7', clickable: false };

      default:
        return { type: 'vbar', color: '#6b7280' };
    }
  }, [data, variant]);

  if (resolved.type === 'empty') return <Empty />;

  if (resolved.type === 'pie')
    return <PieComponent data={data} colors={resolved.colors} onItemClick={onItemClick} />;

  if (resolved.type === 'donut') {
    const chartData = resolved.pieData || data;
    return <PieComponent data={chartData} colors={resolved.colors} isDonut onItemClick={onItemClick} />;
  }

  if (resolved.type === 'vbar')
    return (
      <VBarComponent
        data={data}
        color={resolved.color}
        onItemClick={resolved.clickable ? onItemClick : undefined}
      />
    );

  if (resolved.type === 'hbar')
    return <HBarComponent data={data} color={resolved.color} onItemClick={onItemClick} />;

  if (resolved.type === 'scroll-hbar')
    return (
      <ScrollHBarComponent
        data={data}
        color={resolved.color}
        onItemClick={resolved.clickable ? onItemClick : undefined}
        maxHeight={variant === 'location' ? 360 : 300}
      />
    );

  return <Empty />;
};

export default ChartRenderer;
