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
import { CHART_LINE_COLORS } from "../utils/chartColors";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler
);

export type PlantCountPoint = {
  crop: string;
  plant_count: number;
  date: string;
};

export default function PlantCountChart({
  points = [],
}: {
  points?: PlantCountPoint[];
}) {
  const dateSet = new Set<string>();
  const cropMap = new Map<string, Map<string, number>>();

  for (const row of points) {
    const date = String(row.date).split("T")[0];
    dateSet.add(date);
    if (!cropMap.has(row.crop)) cropMap.set(row.crop, new Map());
    cropMap.get(row.crop)!.set(date, Number(row.plant_count) || 0);
  }

  const dates = Array.from(dateSet).sort();

  // Forward-fill so each crop keeps its last known count across dates
  const seriesMap = new Map<string, (number | null)[]>();
  for (const [crop, dateMap] of cropMap.entries()) {
    let last: number | null = null;
    seriesMap.set(
      crop,
      dates.map((date) => {
        if (dateMap.has(date)) last = dateMap.get(date)!;
        return last;
      })
    );
  }

  const formattedDates = dates.map((d) => {
    const dt = new Date(d);
    return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
  });

  const datasets = Array.from(seriesMap.entries()).map(([crop, data], index) => {
    const color = CHART_LINE_COLORS[index % CHART_LINE_COLORS.length];
    return {
      label: crop,
      data,
      tension: 0.25,
      borderWidth: 2.5,
      borderColor: color,
      backgroundColor: color + "18",
      fill: false,
      spanGaps: true,
      pointRadius: 3,
      pointBackgroundColor: color,
      stepped: false,
    };
  });

  const numeric = datasets.flatMap((d) =>
    d.data.filter((v): v is number => v != null)
  );
  const maxVal = Math.max(...numeric, 1);
  const padding = Math.ceil(maxVal * 0.1);

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
            const value = tooltipItem.raw as number | null;
            if (value == null) return `${tooltipItem.dataset.label}: —`;
            return `${tooltipItem.dataset.label}: ${value.toLocaleString()} plants`;
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
        suggestedMin: 0,
        suggestedMax: maxVal + padding,
        grid: { color: "rgba(212,175,55,0.08)" },
        ticks: {
          color: "#c9b896",
          precision: 0,
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
        No plant count history yet — save counts on crop notes pages
      </div>
    );
  }

  return <Line data={{ labels: formattedDates, datasets }} options={options} />;
}
