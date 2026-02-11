import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    Title,
    Tooltip,
    Legend,
  } from "chart.js";
  import { Bar } from "react-chartjs-2";
  
  ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);
  
  type Expense = {
    amount: number;
    reason: string;
    user: string;
    created_at: string;
  };
  
  export default function ExpenseChart({ expenses }: { expenses: Expense[] }) {
    const data = {
      labels: expenses.map((e) => e.reason),
      datasets: [
        {
          label: "Expenses",
          data: expenses.map((e) => Math.abs(e.amount)),
          backgroundColor: "rgba(239, 68, 68, 0.7)", // Tailwind red-500
        },
      ],
    };
  
    const options = {
      responsive: true,
      maintainAspectRatio: false, // <-- important
      plugins: {
        legend: { display: false },
      },
      scales: {
        x: { grid: { display: false } },
        y: { grid: { color: "rgba(255,255,255,0.1)" }, ticks: { stepSize: 50 } },
      },
    };
  
    return <Bar data={data} options={options} />;
  }
  