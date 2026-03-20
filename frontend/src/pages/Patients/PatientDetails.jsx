import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
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

  const BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    fetchPatientData();
  }, [patientId]);

  const fetchPatientData = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}/api/v1/patients/${patientId}/data`);

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

      const response = await fetch(`${BASE_URL}/api/v1/analysis/${patientId}/analyse-aml`, {
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
      leucocytes_per_ul: 'Leucocyte count (WBC)',
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
      leucocytes_per_ul_missing: 'WBC count (missing indicator)',
      pb_lymph_atyp_neopl_missing: 'Neoplastic lymphocytes (missing indicator)',
      otsu_area_px: 'Cell area (morphology)',
      otsu_perimeter_px: 'Cell perimeter (morphology)',
      otsu_circularity: 'Cell circularity (morphology)',
      otsu_solidity: 'Cell solidity (morphology)',
      otsu_eccentricity: 'Cell eccentricity (morphology)',
      otsu_cell_area_ratio: 'Cell-to-image area ratio',
      sobel_mean: 'Gradient intensity (mean)',
      sobel_std: 'Gradient intensity (SD)',
      sobel_median: 'Gradient intensity (median)',
      sobel_p75: 'Gradient intensity (75th pct)',
      sobel_p90: 'Gradient intensity (90th pct)',
      sobel_max: 'Gradient intensity (max)',
      sobel_ring_p95: 'Cell boundary gradient (95th pct)',
      sobel_interior_mean: 'Cell interior gradient (mean)',
      sobel_interior_p95: 'Cell interior gradient (95th pct)',
      sobel_ring_minus_interior: 'Boundary vs interior gradient',
      sobel_ring_over_interior: 'Boundary/interior gradient ratio',
      sobel_edge_pixels: 'Sobel edge pixel count',
      sobel_edge_density: 'Sobel edge density',
      sobel_edge_components: 'Sobel edge components',
      canny_edge_density: 'Canny edge density',
      canny_edge_components: 'Canny edge components',
      canny_ring_density: 'Boundary edge density (Canny)',
      canny_ring_minus_interior: 'Boundary vs interior edges (Canny)',
    };
    return map[name] || name;
  };

  const getFeatureCategory = (name) => {
    if (name.startsWith('otsu_')) return 'morphology';
    if (name.startsWith('sobel_') || name.startsWith('canny_')) return 'texture';
    if (name.includes('missing')) return 'indicator';
    return 'haematology';
  };

  const categoryLabel = {
    haematology: { label: 'Haematology', color: '#2563eb' },
    morphology:  { label: 'Morphology',  color: '#7c3aed' },
    texture:     { label: 'Texture',     color: '#0891b2' },
    indicator:   { label: 'Indicator',   color: '#94a3b8' },
  };

  const ShapTooltip = ({ active, payload, label, isAML }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    const isPositive = d.impact >= 0;
    // towardAML = true means this feature pushes toward AML
    const towardAML = isAML ? isPositive : !isPositive;
    return (
      <div className={`shap-tooltip ${towardAML ? 'shap-tooltip-aml' : 'shap-tooltip-healthy'}`}>
        <div className="shap-tooltip-label">{label}</div>
        <div className="shap-tooltip-row">
          <span className="shap-tooltip-key">Feature value:</span>
          <span className="shap-tooltip-val">
            {d.value != null ? Number(d.value).toFixed(3) : 'N/A'}
          </span>
        </div>
        <div className="shap-tooltip-row">
          <span className="shap-tooltip-key">SHAP contribution:</span>
          <span className={`shap-tooltip-shap ${towardAML ? 'shap-tooltip-shap-aml' : 'shap-tooltip-shap-healthy'}`}>
            {isPositive ? '+' : ''}{d.impact.toFixed(4)}
          </span>
        </div>
        <div className={`shap-tooltip-footer ${towardAML ? 'shap-tooltip-footer-aml' : 'shap-tooltip-footer-healthy'}`}>
          {isAML
            ? isPositive ? '▲ Pushes prediction toward AML' : '▼ Pushes prediction toward Healthy'
            : isPositive ? '▲ Supports Healthy prediction' : '▼ Argues toward AML'}
        </div>
      </div>
    );
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

  // Full 5-class chart — works for both AML and Healthy predictions
  const allClassData = (() => {
    if (controlProb == null || !analysis?.subtype_probabilities) return [];

    const healthy = {
      name: 'Healthy',
      value: +(controlProb * 100).toFixed(1),
      isPredict: !isAML,
      isHealthy: true,
    };

    const subtypes = Object.entries(analysis.subtype_probabilities).map(
      ([name, value]) => ({
        name,
        value: +(value * 100).toFixed(1),
        isPredict: name === analysis.subtype_prediction,
        isHealthy: false,
      })
    );

    return [healthy, ...subtypes].sort((a, b) => b.value - a.value);
  })();

  // Extended with category for the SHAP detail table
  const binaryExplainData = analysis?.binary_explanation?.top_features
    ? analysis.binary_explanation.top_features.map((item) => ({
        name: prettifyFeatureName(item.feature),
        rawName: item.feature,
        impact: +item.shap_value.toFixed(4),
        value: item.value,
        category: getFeatureCategory(item.feature),
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
                      src={image.filepath}
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

            {/* ── Prediction Banner ── */}
            <div className={`prediction-banner ${isAML ? 'banner-aml' : 'banner-healthy'}`}>
              <div className="banner-left">
                <div className="banner-icon">{isAML ? '⚠️' : '✅'}</div>
                <div className="banner-text">
                  <div className="banner-verdict">{isAML ? 'AML Positive' : 'Healthy'}</div>
                  <div className="banner-sub">
                    {isAML
                      ? analysis.subtype_prediction
                        ? `Predicted subtype: ${analysis.subtype_prediction}`
                        : 'Subtype classification unavailable'
                      : 'No evidence of AML detected'}
                  </div>
                </div>
              </div>
              <div className="banner-right">
                <div className="banner-confidence">
                  {(analysis.confidence * 100).toFixed(1)}%
                </div>
                <div className="banner-confidence-label">Model confidence</div>
                <div className="banner-analyzed">
                  {new Date(analysis.analyzed_at).toLocaleString()}
                </div>
              </div>
            </div>

            {/* ── Unified Class Probability Chart ── */}
            {allClassData.length > 0 && (
              <div className="chart-card">
                <div className="chart-header">
                  <h4 className="chart-title">Class Probability Distribution</h4>
                  <p className="chart-subtitle">
                    Predicted probability across all five classes — Healthy and four AML subtypes
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={allClassData} layout="vertical" margin={{ left: 20, right: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis
                      type="number"
                      unit="%"
                      domain={[0, 100]}
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fontSize: 12, fontWeight: 600, fill: '#374151' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      formatter={(value) => [`${value}%`, 'Probability']}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: '0.85rem' }}
                    />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                      {allClassData.map((entry, index) => (
                        <Cell
                          key={`cell-unified-${index}`}
                          fill={
                            entry.isHealthy
                              ? entry.isPredict ? '#16a34a' : '#86efac'
                              : entry.isPredict ? '#dc2626' : '#c4b5fd'
                          }
                          fillOpacity={entry.isPredict ? 1 : 0.6}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="chart-legend-row">
                  <span className="chart-legend-item">
                    <span className="chart-legend-dot" style={{ background: '#dc2626' }}></span>
                    Predicted AML subtype
                  </span>
                  <span className="chart-legend-item">
                    <span className="chart-legend-dot" style={{ background: '#16a34a' }}></span>
                    Predicted Healthy
                  </span>
                  <span className="chart-legend-item">
                    <span className="chart-legend-dot" style={{ background: '#c4b5fd', opacity: 0.6 }}></span>
                    Other AML subtypes
                  </span>
                </div>
              </div>
            )}

            {/* ── SHAP Feature Contributions ── */}
            {binaryExplainData.length > 0 && (
              <>
                <div className="chart-card">
                  <div className="chart-header">
                    <h4 className="chart-title">Feature Contributions to Prediction</h4>
                    <p className="chart-subtitle">
                      SHAP values showing how each feature influenced the model's output.
                      Features are ranked by absolute contribution magnitude.
                    </p>
                  </div>

                  <div className="shap-legend">
                    <div className="shap-legend-item">
                      <span className={`shap-legend-dot ${isAML ? 'shap-legend-dot-aml' : 'shap-legend-dot-healthy'}`}></span>
                      <span>{isAML ? 'Increases AML probability' : 'Supports Healthy prediction'}</span>
                    </div>
                    <div className="shap-legend-item">
                      <span className={`shap-legend-dot ${isAML ? 'shap-legend-dot-healthy' : 'shap-legend-dot-aml'}`}></span>
                      <span>{isAML ? 'Decreases AML probability (supports Healthy)' : 'Argues against Healthy (toward AML)'}</span>
                    </div>
                  </div>

                  <div className="shap-category-legend">
                    {Object.entries(categoryLabel).map(([key, val]) => (
                      <div key={key} className="shap-cat-item">
                        <span className="shap-cat-dot" style={{ background: val.color }}></span>
                        <span className="shap-cat-label">{val.label}</span>
                      </div>
                    ))}
                  </div>

                  <ResponsiveContainer width="100%" height={Math.max(320, binaryExplainData.length * 38)}>
                    <BarChart
                      data={binaryExplainData}
                      layout="vertical"
                      margin={{ left: 10, right: 50, top: 8, bottom: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => v.toFixed(2)}
                        label={{ value: 'SHAP value', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#94a3b8' }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={210}
                        tick={{ fontSize: 11, fill: '#374151' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <ReferenceLine x={0} stroke="#cbd5e1" strokeWidth={1.5} />
                      <Tooltip content={<ShapTooltip isAML={isAML} />} />
                      <Bar dataKey="impact" radius={[0, 4, 4, 0]}>
                        {binaryExplainData.map((entry, index) => (
                          <Cell
                            key={`cell-shap-${index}`}
                            fill={
                              (isAML ? entry.impact >= 0 : entry.impact < 0)
                                ? '#dc2626'
                                : '#16a34a'
                            }
                            fillOpacity={0.85}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="chart-card">
                  <div className="shap-table-wrapper">
                    <div className="shap-table-title">Top Contributing Features — Detail View</div>
                    <table className="shap-table">
                      <thead>
                        <tr>
                          <th>Rank</th>
                          <th>Feature</th>
                          <th>Type</th>
                          <th>Value</th>
                          <th>SHAP</th>
                          <th>Direction</th>
                        </tr>
                      </thead>
                      <tbody>
                        {binaryExplainData.map((row, i) => {
                          const cat = categoryLabel[row.category];
                          return (
                            <tr key={i}>
                              <td className="shap-rank">#{i + 1}</td>
                              <td className="shap-feat-name">{row.name}</td>
                              <td>
                                <span
                                  className="shap-cat-badge"
                                  style={{
                                    background: cat.color + '18',
                                    color: cat.color,
                                    border: `1px solid ${cat.color}40`,
                                  }}
                                >
                                  {cat.label}
                                </span>
                              </td>
                              <td className="shap-feat-val">
                                {row.value != null ? Number(row.value).toFixed(3) : '—'}
                              </td>
                              <td
                                className="shap-feat-shap"
                                style={{
                                  color: (isAML ? row.impact >= 0 : row.impact < 0)
                                    ? '#dc2626'
                                    : '#16a34a'
                                }}
                              >
                                {row.impact >= 0 ? '+' : ''}{row.impact.toFixed(4)}
                              </td>
                              <td>
                                <span className={`shap-direction ${
                                  isAML
                                    ? row.impact >= 0 ? 'dir-aml' : 'dir-healthy'
                                    : row.impact >= 0 ? 'dir-healthy' : 'dir-aml'
                                }`}>
                                  {isAML
                                    ? row.impact >= 0 ? '▲ AML' : '▼ Healthy'
                                    : row.impact >= 0 ? '▲ Healthy' : '▼ AML'}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── Clinical Note ── */}
            <div className="clinical-note-card">
              <h4>⚕️ Interpretation Note</h4>
              <p>
                This result is AI-generated and intended for decision support only.
                It does not constitute a clinical diagnosis and must be reviewed
                alongside laboratory findings and pathological assessment.
              </p>
            </div>

            {/* ── Actions ── */}
            <div className="analysis-actions">
              <button className="btn-secondary" onClick={handleRunAnalysis} disabled={analysisRunning}>
                {analysisRunning
                  ? <><span className="spinner-small"></span> Re-analyzing...</>
                  : <>🔄 Re-run Analysis</>}
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