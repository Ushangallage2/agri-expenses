import { Line } from "react-chartjs-2";
import type { ChartOptions } from "chart.js";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
);

type Trend = {
  crop: string;
  date: string;
  total: number;
};

// Predefined colors (can extend as needed)
const COLORS = [
  "#EF4444", // red
  "#3B82F6", // blue
  "#10B981", // green
  "#F59E0B", // orange
  "#8B5CF6", // purple
  "#EC4899", // pink
  "#14B8A6", // teal
  "#F87171", // light red
];

export default function ExpenseChart({ trends = [] }: { trends?: Trend[] }) {
  // ---------- O(n) DATA TRANSFORMATION ----------
  const dateSet = new Set<string>();
  const cropMap = new Map<string, Map<string, number>>();

  for (const { crop, date: rawDate, total } of trends) {
    const date = rawDate.split("T")[0]; // YYYY-MM-DD
    dateSet.add(date);

    if (!cropMap.has(crop)) cropMap.set(crop, new Map());
    cropMap.get(crop)!.set(date, Number(total));
  }

  const dates = Array.from(dateSet).sort();

  // ---------- CALCULATE CUMULATIVE DATA ----------
  const cumulativeMap = new Map<string, number[]>();
  for (const [crop, dateMap] of cropMap.entries()) {
    let runningTotal = 0;
    const cumulativeData = dates.map((date) => {
      runningTotal += dateMap.get(date) ?? 0;
      return runningTotal;
    });
    cumulativeMap.set(crop, cumulativeData);
  }

  // ---------- FORMAT LABELS ----------
  const formattedDates = dates.map((d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  });

  // ---------- CREATE DATASETS WITH COLORS ----------
  const datasets = Array.from(cumulativeMap.entries()).map(([crop, data], index) => ({
    label: crop,
    data,
    tension: 0.3,
    borderWidth: 2,
    borderColor: COLORS[index % COLORS.length],
    backgroundColor: COLORS[index % COLORS.length] + "33", // semi-transparent
    fill: false,
    pointRadius: 3,
  }));

  // ---------- CALCULATE MAX ABS FOR Y SCALE ----------
  const allValues = datasets.flatMap((d) => d.data);
  const maxAbs = Math.max(...allValues.map((v) => Math.abs(v)), 1);
  const padding = Math.ceil(maxAbs * 0.1);

  const data = { labels: formattedDates, datasets };

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label: function (tooltipItem) {
            const value = tooltipItem.raw as number;
            return `${tooltipItem.dataset.label}: ${value.toLocaleString()}`;
          },
        },
      },
      legend: { position: "top" },
    },
    interaction: {
      mode: "nearest",
      axis: "x",
      intersect: false,
    },
    scales: {
      y: {
        type: "linear",
        suggestedMin: 0,
        suggestedMax: maxAbs + padding,
        ticks: {
          callback: (value) => {
            const num = Number(value);
            return num >= 1000 ? num / 1000 + "K" : num;
          },
        },
      },
      x: {
        type: "category",
      },
    },
  };

  return <Line data={data} options={options} />;
}
