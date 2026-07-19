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
  Filler,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

export type Trend = {
  crop: string;
  date: string;
  income?: number;
  expense?: number;
  profit?: number;
  total?: number;
};

type Metric = "income" | "expense" | "profit";

const COLORS = [
  "#D4AF37",
  "#F5D76E",
  "#C9A227",
  "#E8C547",
  "#A8892D",
  "#FFD700",
  "#B8860B",
  "#DAA520",
];

function metricValue(row: Trend, metric: Metric): number {
  if (metric === "income") return Number(row.income ?? (Number(row.total) > 0 ? row.total : 0));
  if (metric === "expense") return Number(row.expense ?? (Number(row.total) < 0 ? Math.abs(Number(row.total)) : 0));
  return Number(row.profit ?? row.total ?? 0);
}

export default function ExpenseChart({
  trends = [],
  metric = "profit",
}: {
  trends?: Trend[];
  metric?: Metric;
}) {
  const dateSet = new Set<string>();
  const cropMap = new Map<string, Map<string, number>>();

  for (const row of trends) {
    const date = String(row.date).split("T")[0];
    dateSet.add(date);
    if (!cropMap.has(row.crop)) cropMap.set(row.crop, new Map());
    cropMap.get(row.crop)!.set(date, metricValue(row, metric));
  }

  const dates = Array.from(dateSet).sort();

  const cumulativeMap = new Map<string, number[]>();
  for (const [crop, dateMap] of cropMap.entries()) {
    let running = 0;
    cumulativeMap.set(
      crop,
      dates.map((date) => {
        running += dateMap.get(date) ?? 0;
        return running;
      })
    );
  }

  const formattedDates = dates.map((d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  });

  const datasets = Array.from(cumulativeMap.entries()).map(([crop, data], index) => ({
    label: crop,
    data,
    tension: 0.35,
    borderWidth: 2.5,
    borderColor: COLORS[index % COLORS.length],
    backgroundColor: COLORS[index % COLORS.length] + "22",
    fill: true,
    pointRadius: 3,
    pointBackgroundColor: COLORS[index % COLORS.length],
  }));

  const allValues = datasets.flatMap((d) => d.data);
  const maxAbs = Math.max(...allValues.map((v) => Math.abs(v)), 1);
  const padding = Math.ceil(maxAbs * 0.1);

  const options: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      tooltip: {
        mode: "index",
        intersect: false,
        backgroundColor: "rgba(10,10,10,0.92)",
        titleColor: "#F5D76E",
        bodyColor: "#f5f0e6",
        borderColor: "rgba(212,175,55,0.4)",
        borderWidth: 1,
        callbacks: {
          label: (tooltipItem) => {
            const value = tooltipItem.raw as number;
            return `${tooltipItem.dataset.label}: ${value.toLocaleString()}`;
          },
        },
      },
      legend: {
        position: "top",
        labels: { color: "#e8d5a3", font: { family: "Outfit" } },
      },
    },
    interaction: { mode: "nearest", axis: "x", intersect: false },
    scales: {
      y: {
        type: "linear",
        suggestedMin: metric === "profit" ? undefined : 0,
        suggestedMax: maxAbs + padding,
        grid: { color: "rgba(212,175,55,0.08)" },
        ticks: {
          color: "#c9b896",
          callback: (value) => {
            const num = Number(value);
            return num >= 1000 ? num / 1000 + "K" : num;
          },
        },
      },
      x: {
        type: "category",
        grid: { color: "rgba(212,175,55,0.05)" },
        ticks: { color: "#c9b896" },
      },
    },
  };

  if (!datasets.length) {
    return (
      <div className="h-full flex items-center justify-center text-gold-muted text-sm">
        No {metric} data yet
      </div>
    );
  }

  return <Line data={{ labels: formattedDates, datasets }} options={options} />;
}
