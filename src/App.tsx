import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AddExpense from "./pages/AddExpense";
import CropNotes from "./pages/CropNotes";
import ActivityLog from "./pages/ActivityLog";
import EmailReports from "./pages/EmailReports";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/add-expense" element={<AddExpense />} />
        <Route path="/crops/:cropName/notes" element={<CropNotes />} />
        <Route path="/activity" element={<ActivityLog />} />
        <Route path="/email-reports" element={<EmailReports />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    </BrowserRouter>
  );
}
