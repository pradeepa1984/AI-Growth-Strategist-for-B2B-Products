/**
 * IndustryChart.jsx
 * Pie chart showing revenue share by industry.
 * Props:
 *   data — object keyed by industry name, e.g. { "Retail": 28.7, ... }
 *          Falls back to hardcoded values when not provided.
 *   ref  — forwarded to react-chartjs-2 <Pie>; call ref.current.toBase64Image()
 *          to capture the canvas as a PNG data URL (used by PDF generator).
 */

import { forwardRef } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Pie } from 'react-chartjs-2';

ChartJS.register(ArcElement, Tooltip, Legend);

const PALETTE = ['#14B8A6', '#0EA5E9', '#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#EC4899'];

// Fallback mirrors financials.json industry_distribution — only used when no data prop is passed
const FALLBACK = {
  Retail: 28.7,
  'Tech/Media': 28.3,
  Finance: 22.9,
  Manufacturing: 10.2,
  Healthcare: 2.6,
  Other: 7.3,
};

const IndustryChart = forwardRef(function IndustryChart({ data }, ref) {
  const src = data || FALLBACK;

  const chartData = {
    labels: Object.keys(src),
    datasets: [
      {
        data: Object.values(src),
        backgroundColor: PALETTE.slice(0, Object.keys(src).length),
        borderColor: '#ffffff',
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  };

  const options = {
    responsive: true,
    animation: false,   // instant render — needed for reliable toBase64Image() capture
    plugins: {
      legend: {
        position: 'right',
        labels: { boxWidth: 10, font: { size: 10 }, padding: 8 },
      },
      tooltip: {
        callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}%` },
      },
    },
  };

  return <Pie ref={ref} data={chartData} options={options} />;
});

export default IndustryChart;
