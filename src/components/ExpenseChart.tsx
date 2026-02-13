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

  // ---------- FORMAT LABELS ----------
  const formattedDates = dates.map((d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  });

  // ---------- CREATE DATASETS WITH COLORS ----------
  const datasets = Array.from(cropMap.entries()).map(([crop, dateMap], index) => ({
    label: crop,
    data: dates.map((date) => dateMap.get(date) ?? 0),
    tension: 0.3,
    borderWidth: 2,
    borderColor: COLORS[index % COLORS.length], // assign color cyclically
    backgroundColor: COLORS[index % COLORS.length] + "33", // semi-transparent fill for hover
    fill: false, // no area under line
    pointRadius: 3, // small points
  }));

  // ---------- CALCULATE MAX ABS FOR Y SCALE ----------
  const allValues = datasets.flatMap((d) => d.data);
  const maxAbs = Math.max(...allValues.map((v) => Math.abs(v)), 1);
  const padding = Math.ceil(maxAbs * 0.1); // add 10% extra space

  const data = {
    labels: formattedDates,
    datasets,
  };

  // ---------- TYPED OPTIONS ----------
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
        suggestedMin: -maxAbs - padding,
        suggestedMax: maxAbs + padding,
        ticks: {
          callback: (value) => {
            const num = Number(value);
            return Math.abs(num) >= 1000 ? num / 1000 + "K" : num;
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
