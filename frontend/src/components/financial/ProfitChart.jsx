/**
 * ProfitChart.jsx
 * Bar chart showing profitability metrics (Net Income and EBITDA).
 * Props:
 *   data — financialData.profitability: { net_income, ebitda }
 *          Falls back to hardcoded values when not provided.
 *   ref  — forwarded to react-chartjs-2 <Bar>; call ref.current.toBase64Image()
 *          to capture the canvas as a PNG data URL (used by PDF generator).
 */

import { forwardRef } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const ProfitChart = forwardRef(function ProfitChart({ data }, ref) {
  const netIncome = data?.net_income ?? 35.1;  // Non-GAAP, FY 2025
  const ebitda    = data?.ebitda    ?? 53.8;   // FY 2025

  const chartData = {
    labels: ['Net Income', 'EBITDA'],
    datasets: [
      {
        label: '2025 ($M)',
        data: [netIncome, ebitda],
        backgroundColor: ['rgba(20,184,166,0.75)', 'rgba(16,185,129,0.75)'],
        borderColor:     ['#14B8A6',               '#10B981'],
        borderWidth: 2,
        borderRadius: 5,
        hoverBackgroundColor: ['rgba(106,56,160,0.9)', 'rgba(16,185,129,0.9)'],
      },
    ],
  };

  const options = {
    responsive: true,
    animation: false,   // instant render — needed for reliable toBase64Image() capture
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => `$${ctx.parsed.y}M` } },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: v => `$${v}M`, font: { size: 10 } },
        grid: { color: '#f3f4f6' },
      },
      x: { ticks: { font: { size: 10 } } },
    },
  };

  return <Bar ref={ref} data={chartData} options={options} />;
});

export default ProfitChart;
