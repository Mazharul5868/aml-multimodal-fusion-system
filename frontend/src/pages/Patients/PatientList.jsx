import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PatientForm from './PatientForm';
import './PatientList.css';

const PatientList = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const PATIENTS_PER_PAGE = 20;

  // Fetch patients from API
  useEffect(() => {
    fetchPatients();
  }, []);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/v1/patients');
      const data = await response.json();
      setPatients(data.patients || []);
      setCurrentPage(1);
      setError(null);
    } catch (err) {
      console.error('Error fetching patients:', err);
      setError('Failed to load patients');
      setPatients([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePatient = async (patientData) => {
    try {
      const response = await fetch('http://localhost:8000/api/v1/patients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patientData),
      });

      if (!response.ok) {
        throw new Error('Failed to create patient');
      }

      const newPatient = await response.json();
      
      // Refresh patient list to get updated status
      await fetchPatients();
      
      // Close form
      setShowForm(false);
      
      // Navigate to data entry page for this patient
      navigate(`/patients/${newPatient.patient_id}/data-entry`);
    } catch (err) {
      console.error('Error creating patient:', err);
      throw err;
    }
  };

  const handleViewPatient = (patient) => {
    // Smart navigation 
    if (!patient.has_cbc) {
      // No CBC data → Go to CBC tab
      navigate(`/patients/${patient.patient_id}/data-entry?tab=cbc`);
    } else if (!patient.has_images) {
      // Has CBC but no images → Go to Images tab
      navigate(`/patients/${patient.patient_id}/data-entry?tab=images`);
    } else {
      // Everything complete → Go to data entry (default)
      navigate(`/patients/${patient.patient_id}/details`);
    }
  };

  const getActionButtonText = (patient) => {
    if (!patient.has_cbc) {
      return 'Enter Haematology Data';
    } else if (!patient.has_images) {
      return 'Upload Images';
    } else {
      return 'View Details';
    }
  };

  if (loading) {
    return (
      <div className="patient-list-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading patients...</p>
        </div>
      </div>
    );
  }

  const sortedPatients = [...patients].sort((a, b) =>
    b.patient_id.localeCompare(a.patient_id)
  );

  const totalPages = Math.ceil(sortedPatients.length / PATIENTS_PER_PAGE);
  const paginatedPatients = sortedPatients.slice(
    (currentPage - 1) * PATIENTS_PER_PAGE,
    currentPage * PATIENTS_PER_PAGE
  );

  return (
    <div className="patient-list-container">
      <div className="patient-list-header">
        <h2>Patient Management</h2>
        <button className="btn-primary" onClick={() => setShowForm(true)}>
          <span className="btn-icon">➕</span>
          New Patient
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {patients.length > 0 ? (
        <div className="patient-table-wrapper">
          <table className="patient-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Age</th>
                <th>Sex</th>
                <th>Haematology Data</th>
                <th>Images</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPatients.map((patient) => (
                <tr key={patient.patient_id}>
                  <td className="patient-id">{patient.patient_id}</td>
                  <td>{patient.age}</td>
                  <td>{patient.sex}</td>
                  <td>
                    <span className={`data-indicator ${patient.has_cbc ? 'complete' : 'pending'}`}>
                      {patient.has_cbc ? '✓' : '○'}
                    </span>
                  </td>
                  <td>
                    <span className={`data-indicator ${patient.has_images ? 'complete' : 'pending'}`}>
                      {patient.has_images ? `✓` : '○'}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge status-${patient.status.toLowerCase().replace(/ /g, '-')}`}>
                      {patient.status}
                    </span>
                  </td>
                  <td>
                    <button
                      className="btn-action"
                      onClick={() => handleViewPatient(patient)}
                    >
                      {getActionButtonText(patient)}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination-controls">
              <button
                className="btn-page"
                onClick={() => setCurrentPage((p) => p - 1)}
                disabled={currentPage === 1}
              >
                ← Prev
              </button>
              <span className="page-info">
                Page {currentPage} of {totalPages} &nbsp;·&nbsp; {patients.length} patients
              </span>
              <button
                className="btn-page"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={currentPage === totalPages}
              >
                Next →
              </button>
            </div>
          )}

        </div>
      ) : (
        <div className="empty-state">
          <p>No patients found</p>
          <p className="empty-subtitle">Create a new patient to get started</p>
        </div>
      )}

      {/* Patient Registration Form Modal */}
      {showForm && (
        <PatientForm
          onClose={() => setShowForm(false)}
          onSubmit={handleCreatePatient}
        />
      )}
    </div>
  );
};

export default PatientList;