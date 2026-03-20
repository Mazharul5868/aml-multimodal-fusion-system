import { Navigate, Route, Routes } from "react-router-dom";
import MainLayout from "../layouts/MainLayout";
import Analysis from "../pages/Analysis";
import Home from "../pages/Home";
import Labels from "../pages/Labels";
// Patients pages
import PatientDataEntry from "../Components/DataEntry/PatientDataEntry";
import PatientDetails from "../pages/Patients/PatientDetails";
import PatientList from "../pages/Patients/PatientList";

export default function AppRouter() {
    // Temporary component for pages we haven't built yet
    const ComingSoon = ({ page }) => (
    <div className="coming-soon">
        <h2>🚧 {page} Page</h2>
        <p>This page is under development</p>
    </div>
    );

  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<Home />} />

        {/* Patients */}
        <Route path="/patients" element={<PatientList />} />
        <Route path="/patients/:patientId/data-entry" element={<PatientDataEntry />} />
        <Route path="/patients/:patientId/details" element={<PatientDetails />} />
        <Route path="/analysis" element={<Analysis/>} />
        <Route path="/labels" element={<Labels />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    
  );
  
}
