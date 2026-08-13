import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AddExpense from "./pages/AddExpense";
import CropNotes from "./pages/CropNotes";
import ActivityLog from "./pages/ActivityLog";
import EmailReports from "./pages/EmailReports";
import Fertilizer from "./pages/Fertilizer";
import { AuthProvider } from "./utils/AuthContext";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/add-expense" element={<AddExpense />} />
          <Route path="/crops/:cropName/notes" element={<CropNotes />} />
          <Route path="/activity" element={<ActivityLog />} />
          <Route path="/email-reports" element={<EmailReports />} />
          <Route path="/fertilizer" element={<Fertilizer />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
