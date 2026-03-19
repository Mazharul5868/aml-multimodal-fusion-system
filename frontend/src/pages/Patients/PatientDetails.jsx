import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './PatientDetails.css';

const PatientDetails = () => {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [patientData, setPatientData] = useState(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    fetchPatientData();
  }, [patientId]);

  const fetchPatientData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`http://localhost:8000/api/v1/patients/${patientId}/data`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to load patient data');
      }

      const data = await response.json();
      setPatientData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching patient data:', err);
      setError('Failed to load patient data');
    } finally {
      setLoading(false);
    }
  };

  const handleRunAnalysis = async () => {
    try {
      setAnalysisRunning(true);

      const response = await fetch(`http://localhost:8000/api/v1/analysis/${patientId}/analyse-aml`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Analysis failed');
      }

      await response.json();
      await fetchPatientData();

      const isRerun = patientData?.analysis_result !== null;
      setSuccessMessage(isRerun ? 'Analysis updated successfully' : 'Analysis completed successfully');
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error running analysis:', err);
      alert(err.message || 'Failed to run analysis');
    } finally {
      setAnalysisRunning(false);
    }
  };

  const displayValue = (value) => (value != null ? value : 'N/A');
  const displayNumber = (value) => (value != null ? value.toLocaleString() : 'N/A');

  const prettifyFeatureName = (name) => {
    const map = {
      leucocytes_per_ul: 'Leucocyte count',
      pb_myeloblast: 'Myeloblast count',
      pb_promyelocyte: 'Promyelocyte count',
      pb_myelocyte: 'Myelocyte count',
      pb_metamyelocyte: 'Metamyelocyte count',
      pb_neutrophil_band: 'Band neutrophils',
      pb_neutrophil_segmented: 'Segmented neutrophils',
      pb_eosinophil: 'Eosinophils',
      pb_basophil: 'Basophils',
      pb_monocyte: 'Monocytes',
      pb_lymph_typ: 'Typical lymphocytes',
      pb_lymph_atyp_react: 'Reactive atypical lymphocytes',
      pb_lymph_atyp_neopl: 'Neoplastic atypical lymphocytes',
      pb_other: 'Other cells',
      pb_total: 'Total counted cells',
      otsu_area_px: 'Cell area',
      otsu_perimeter_px: 'Cell perimeter',
      otsu_circularity: 'Cell circularity',
      otsu_solidity: 'Cell solidity',
      otsu_eccentricity: 'Cell eccentricity',
      sobel_mean: 'Texture gradient mean',
      sobel_std: 'Texture gradient SD',
      sobel_edge_density: 'Sobel edge density',
      canny_edge_density: 'Canny edge density',
      canny_ring_density: 'Boundary edge density',
    };
    return map[name] || name;
  };

  if (loading) {
    return (
      <div className="patient-details-container">
        <div className="loading-state">
          <div className="spinner"></div>
          <p>Loading patient data...</p>
        </div>
      </div>
    );
  }

  if (error || !patientData) {
    return (
      <div className="patient-details-container">
        <div className="error-state">
          <span className="error-icon">⚠️</span>
          <p>{error || 'Patient not found'}</p>
          <button className="btn-secondary" onClick={() => navigate('/patients')}>
            Back to Patient List
          </button>
        </div>
      </div>
    );
  }

  const cbc = patientData?.cbc_data;
  const analysis = patientData?.analysis_result;
  const isAML = analysis?.prediction === 'AML';
  const amlProb = analysis?.probabilities?.aml ?? null;
  const controlProb = analysis?.probabilities?.control ?? null;
  const binaryExplanation = analysis?.binary_explanation;
  const subtypeExplanation = analysis?.subtype_explanation;

  const probabilityChartData =
    amlProb != null && controlProb != null
      ? [
          { name: 'Control', value: +(controlProb * 100).toFixed(1) },
          { name: 'AML', value: +(amlProb * 100).toFixed(1) },
        ]
      : [];

  const subtypeProbData = analysis?.subtype_probabilities
    ? Object.entries(analysis.subtype_probabilities).map(([name, value]) => ({
        name,
        value: +(value * 100).toFixed(1),
      }))
    : [];

  const binaryExplainData = analysis?.binary_explanation?.top_features
    ? analysis.binary_explanation.top_features.map((item) => ({
        name: prettifyFeatureName(item.feature),
        impact: +item.shap_value.toFixed(4),
        value: item.value,
      }))
    : [];

  const subtypeExplainData = analysis?.subtype_explanation?.top_features
    ? analysis.subtype_explanation.top_features.map((item) => ({
        name: prettifyFeatureName(item.feature),
        impact: +item.shap_value.toFixed(4),
        value: item.value,
      }))
    : [];

  

  return (
    <div className="patient-details-container">
      {successMessage && (
        <div className="toast-notification success">
          <span className="toast-icon">✅</span>
          <span>{successMessage}</span>
        </div>
      )}

      <div className="details-header">
        <button className="back-button" onClick={() => navigate('/patients')}>
          ← Back to Patients
        </button>
        <div className="header-info">
          <h2>Patient Details</h2>
          <span className="patient-id-badge">{patientId}</span>
        </div>
      </div>

      <div className="details-section">
        <h3 className="section-title">📋 Demographics</h3>
        <div className="info-grid">
          <div className="info-item">
            <span className="info-label">Age:</span>
            <span className="info-value">{patientData.demographics.age} years</span>
          </div>
          <div className="info-item">
            <span className="info-label">Sex:</span>
            <span className="info-value">{patientData.demographics.sex === 'M' ? 'Male' : 'Female'}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Sample Date:</span>
            <span className="info-value">{patientData.demographics.sample_date}</span>
          </div>
          <div className="info-item">
            <span className="info-label">Status:</span>
            <span className={`status-badge status-${patientData.status.toLowerCase().replace(/ /g, '-')}`}>
              {patientData.status}
            </span>
          </div>
        </div>
      </div>

      {cbc && (
        <div className="details-section">
          <h3 className="section-title">🩸 Haematology Differential Count</h3>
          <div className="cbc-summary-grid">
            <div className="cbc-card">
              <div className="cbc-card-label">Total WBC</div>
              <div className="cbc-card-value">{displayNumber(cbc.leucocytes_per_ul)}</div>
              <div className="cbc-card-unit">per µL</div>
            </div>
            <div className="cbc-card highlight">
              <div className="cbc-card-label">Myeloblast Count</div>
              <div className="cbc-card-value">{displayValue(cbc.pb_myeloblast)}</div>
              <div className="cbc-card-unit">cells counted</div>
            </div>
            <div className="cbc-card">
              <div className="cbc-card-label">Total Cells Counted</div>
              <div className="cbc-card-value">{displayValue(cbc.pb_total)}</div>
              <div className="cbc-card-unit">cells</div>
            </div>
          </div>
        </div>
      )}

      {patientData.images && patientData.images.length > 0 && (
        <div className="details-section">
          <h3 className="section-title">🔬 Blood Smear Images ({patientData.images.length})</h3>
          <div className="images-grid">
            {patientData.images.map((image) => (
              <div key={image.id} className="image-card">
                <div className="image-thumbnail">
                  {image.file_type === 'tif' || image.file_type === 'tiff' ? (
                    <div className="tif-placeholder">
                      <span className="file-icon">🔬</span>
                      <span className="tif-label">TIF</span>
                    </div>
                  ) : (
                    <img
                      src={`http://localhost:8000/uploads/images/${patientId}/${image.filename}`}
                      alt={image.original_filename}
                    />
                  )}
                </div>
                <div className="image-info">
                  <div className="image-filename">{image.original_filename}</div>
                  <div className="image-meta">
                    <span>{(image.file_size / (1024 * 1024)).toFixed(2)} MB</span>
                    <span>•</span>
                    <span>{image.file_type.toUpperCase()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="details-section analysis-section">
        <h3 className="section-title">🤖 AI Analysis</h3>

        {!analysis ? (
          <div className="analysis-prompt">
            <p className="analysis-description">
              Run AI-assisted AML screening and subtype assessment using hematological data and blood smear morphology features.
            </p>
            <button className="btn-analyze" onClick={handleRunAnalysis} disabled={analysisRunning}>
              {analysisRunning ? (
                <>
                  <span className="spinner-small"></span>
                  Running Analysis...
                </>
              ) : (
                <>
                  <span className="analyze-icon">🚀</span>
                  Run AML Detection Analysis
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="analysis-results">
            <div className="result-header">
              <span className="result-icon">✅</span>
              <span className="result-title">Analysis Complete</span>
              <span className="result-date">{new Date(analysis.analyzed_at).toLocaleString()}</span>
            </div>

            <div className="prediction-cards">
              <div className="prediction-card primary">
                <div className="prediction-label">Prediction</div>
                <div className="prediction-value">{analysis.prediction}</div>
                <div className="confidence-bar">
                  <div
                    className="confidence-fill"
                    style={{ width: `${analysis.confidence * 100}%` }}
                  ></div>
                </div>
                <div className="confidence-label">
                  Confidence: {(analysis.confidence * 100).toFixed(1)}%
                </div>
              </div>

              {isAML && analysis.subtype_prediction && (
                <div className="prediction-card secondary">
                  <div className="prediction-label">Predicted AML Subtype</div>
                  <div className="prediction-value">{analysis.subtype_prediction}</div>
                  <div className="confidence-bar">
                    <div
                      className="confidence-fill"
                      style={{ width: `${analysis.subtype_confidence * 100}%` }}
                    ></div>
                  </div>
                  <div className="confidence-label">
                    Confidence: {(analysis.subtype_confidence * 100).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>

            {probabilityChartData.length > 0 && (
              <div className="chart-card">
                <h4>Diagnostic Probability</h4>
                <div style={{ width: '100%', height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={probabilityChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis unit="%" />
                      <Tooltip formatter={(value) => [`${value}%`, 'Probability']} />
                      <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                        {probabilityChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.name === 'AML' ? '#dc2626' : '#2563eb'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {isAML && subtypeProbData.length > 0 && (
              <div className="chart-card">
                <h4>Subtype Probability Distribution</h4>
                <div style={{ width: '100%', height: 320 }}>
                  <ResponsiveContainer>
                    <BarChart data={subtypeProbData} layout="vertical" margin={{ left: 30, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" unit="%" />
                      <YAxis type="category" dataKey="name" width={120} />
                      <Tooltip formatter={(value) => [`${value}%`, 'Probability']} />
                      <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                        {subtypeProbData.map((_, index) => (
                          <Cell key={`cell-sub-${index}`} fill="#7c3aed" />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {binaryExplainData.length > 0 && (
              <div className="chart-card">
                <h4>Key Factors Influencing AML Prediction</h4>
                <p className="explain-note">
                  Positive values push the model toward AML. Negative values push toward Control.
                </p>
                <div style={{ width: '100%', height: 420 }}>
                  <ResponsiveContainer>
                    <BarChart data={binaryExplainData} layout="vertical" margin={{ left: 80, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={180} />
                      <Tooltip
                        formatter={(value, name, props) => [
                          `${value}`,
                          'SHAP impact',
                        ]}
                        labelFormatter={(label) => `${label}`}
                      />
                      <Bar dataKey="impact" radius={[0, 8, 8, 0]}>
                        {binaryExplainData.map((entry, index) => (
                          <Cell key={`cell-exp-${index}`} fill={entry.impact >= 0 ? '#dc2626' : '#2563eb'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            {isAML && subtypeExplainData.length > 0 && (
              <div className="chart-card">
                <h4>Key Factors Influencing Subtype Prediction</h4>
                <p className="explain-note">
                  Positive values support the predicted subtype. Negative values argue against it.
                </p>
                <div style={{ width: '100%', height: 420 }}>
                  <ResponsiveContainer>
                    <BarChart data={subtypeExplainData} layout="vertical" margin={{ left: 80, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" />
                      <YAxis type="category" dataKey="name" width={180} />
                      <Tooltip />
                      <Bar dataKey="impact" radius={[0, 8, 8, 0]}>
                        {subtypeExplainData.map((entry, index) => (
                          <Cell key={`cell-subexp-${index}`} fill={entry.impact >= 0 ? '#7c3aed' : '#64748b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="clinical-note-card">
              <h4>Interpretation Note</h4>
              <p>
                This output is an AI model assessment based on hematological data and morphology-derived features.
                It is intended for decision support and should be interpreted alongside clinical,
                laboratory, and pathological review.
              </p>
            </div>

            <div className="analysis-actions">
              <button className="btn-secondary" onClick={handleRunAnalysis} disabled={analysisRunning}>
                {analysisRunning ? (
                  <>
                    <span className="spinner-small"></span> Re-analyzing...
                  </>
                ) : (
                  <>🔄 Re-run Analysis</>
                )}
              </button>

              <button className="btn-primary" onClick={() => navigate('/patients')}>
                Back to Patient List
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PatientDetails;