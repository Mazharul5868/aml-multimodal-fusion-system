import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import CBCDataForm from './CBCDataForm';
import ImageUpload from './ImageUpload';
import './PatientDataEntry.css';

const PatientDataEntry = () => {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  
  // Check URL parameter for initial tab
  const initialTab = searchParams.get('tab') || 'cbc';
  
  const [activeTab, setActiveTab] = useState(initialTab);
  const [cbcCompleted, setCbcCompleted] = useState(false);
  const [imagesCompleted, setImagesCompleted] = useState(false);

  // Fetch patient status on mount
  useEffect(() => {
    fetchPatientStatus();
  }, [patientId]);

  const fetchPatientStatus = async () => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/patients`);
      const data = await response.json();
      
      // Find current patient
      const patient = data.patients.find(p => p.patient_id === patientId);
      
      if (patient) {
        setCbcCompleted(patient.has_cbc);
        setImagesCompleted(patient.has_images);
        
        // Auto-switch to correct tab based on status
        if (!patient.has_cbc) {
          setActiveTab('cbc');
        } else if (!patient.has_images && searchParams.get('tab') === 'images') {
          setActiveTab('images');
        }
      }
    } catch (error) {
      console.error('Error fetching patient status:', error);
    }
  };

  const handleCBCSubmit = async (cbcData) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/patients/${patientId}/cbc`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(cbcData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to submit CBC data');
      }

      setCbcCompleted(true);
      
      // Show success and move to images tab
      console.log('CBC data submitted successfully');
      setActiveTab('images');
    } catch (error) {
      console.error('Error submitting CBC data:', error);
      throw error;
    }
  };

  const handleImageUpload = async (formData) => {
    try {
      const response = await fetch(`http://localhost:8000/api/v1/images/${patientId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to upload images');
      }

      setImagesCompleted(true);
      
      console.log('Images uploaded successfully');
      
      // Navigate to patient details page after short delay
      setTimeout(() => {
        navigate(`/patients/${patientId}/details`);
      }, 1500);
    } catch (error) {
      console.error('Error uploading images:', error);
      throw error;
    }
  };

  const handleCancel = () => {
    navigate('/patients');
  };

  return (
    <div className="data-entry-container">
      <div className="data-entry-wrapper">
        {/* Header */}
        <div className="entry-header">
          <div className="header-content">
            <button className="back-button" onClick={handleCancel}>
              ← Back to Patients
            </button>
            <div className="header-info">
              <h2>Patient Data Entry</h2>
              <span className="patient-id-badge">{patientId}</span>
            </div>
          </div>
          
          {/* Progress Indicator */}
          <div className="progress-steps">
            <div className={`step ${cbcCompleted ? 'completed' : activeTab === 'cbc' ? 'active' : ''}`}>
              <span className="step-number">1</span>
              <span className="step-label">Haematology Data</span>
              {cbcCompleted && <span className="check-icon">✓</span>}
            </div>
            <div className="step-divider"></div>
            <div className={`step ${imagesCompleted ? 'completed' : activeTab === 'images' ? 'active' : ''}`}>
              <span className="step-number">2</span>
              <span className="step-label">Blood Smear Images</span>
              {imagesCompleted && <span className="check-icon">✓</span>}
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'cbc' ? 'active' : ''} ${cbcCompleted ? 'completed' : ''}`}
            onClick={() => setActiveTab('cbc')}
            disabled={!cbcCompleted && activeTab === 'images'}
          >
            <span className="tab-icon">🩸</span>
            <span className="tab-text">Haematology Data Entry</span>
            {cbcCompleted && <span className="tab-check">✓</span>}
          </button>
          <button
            className={`tab-button ${activeTab === 'images' ? 'active' : ''} ${imagesCompleted ? 'completed' : ''}`}
            onClick={() => setActiveTab('images')}
            disabled={!cbcCompleted}
          >
            <span className="tab-icon">🔬</span>
            <span className="tab-text">Image Upload</span>
            {imagesCompleted && <span className="tab-check">✓</span>}
          </button>
        </div>

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'cbc' && (
            <CBCDataForm
              patientId={patientId}
              onSubmit={handleCBCSubmit}
              onCancel={handleCancel}
            />
          )}

          {activeTab === 'images' && (
            <ImageUpload
              patientId={patientId}
              onUpload={handleImageUpload}
              onCancel={handleCancel}
            />
          )}
        </div>

        {/* Completion Message */}
        {cbcCompleted && imagesCompleted && (
          <div className="completion-banner">
            <span className="completion-icon">🎉</span>
            <div className="completion-text">
              <strong>Data collection complete!</strong>
              <p>Patient is ready for analysis. Redirecting to patient list...</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientDataEntry;