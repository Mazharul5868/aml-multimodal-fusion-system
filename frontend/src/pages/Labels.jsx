import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Labels.css';

const AML_SUBTYPES = ['CBFB_MYH11', 'NPM1', 'PML_RARA', 'RUNX1_RUNX1T1'];
const GROUND_TRUTH_OPTIONS = ['Control', ...AML_SUBTYPES];
const FILTERS = ['All', 'Labelled', 'Unlabelled', 'Match', 'Mismatch'];

const Labels = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [labels, setLabels] = useState({}); // { patient_id: groundTruthLabel }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [exportMsg, setExportMsg] = useState(null);
  const PATIENTS_PER_PAGE = 20;

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchQuery]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/v1/patients');
      const data = await response.json();
      const allPatients = data.patients || [];

      // Only show patients that have completed analysis
      const analysed = allPatients.filter((p) => p.status === 'Analysis Complete');
      setPatients(analysed);

      // Load saved labels from localStorage
      const saved = JSON.parse(localStorage.getItem('aml_ground_truth_labels') || '{}');
      setLabels(saved);
      setError(null);
    } catch (err) {
      setError(`Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLabelChange = (patientId, label) => {
    const updated = { ...labels, [patientId]: label };
    setLabels(updated);
    localStorage.setItem('aml_ground_truth_labels', JSON.stringify(updated));

    setSaving(patientId);
    setSaveSuccess(null);
    setTimeout(() => {
      setSaving(null);
      setSaveSuccess(patientId);
      setTimeout(() => setSaveSuccess(null), 2000);
    }, 400);
  };

  const handleClearLabel = (patientId) => {
    const updated = { ...labels };
    delete updated[patientId];
    setLabels(updated);
    localStorage.setItem('aml_ground_truth_labels', JSON.stringify(updated));
  };

  const getPrediction = (patient) => patient.prediction || null;

  const isMatch = (patient) => {
    const gt = labels[patient.patient_id];
    const pred = getPrediction(patient);
    if (!gt || !pred) return null;

    // Control vs Control
    if (gt === 'Control' && pred === 'Control') return true;
    // AML subtype: pred is 'AML', gt is one of the subtypes
    if (gt !== 'Control' && pred === 'AML') return true;
    if (gt === 'Control' && pred === 'AML') return false;
    if (gt !== 'Control' && pred === 'Control') return false;
    return null;
  };

  // --- Stats ---
  const labelled = patients.filter((p) => labels[p.patient_id]);
  const unlabelled = patients.filter((p) => !labels[p.patient_id]);
  const matched = patients.filter((p) => isMatch(p) === true);
  const mismatched = patients.filter((p) => isMatch(p) === false);
  const accuracy =
    labelled.length > 0
      ? ((matched.length / labelled.length) * 100).toFixed(1)
      : null;

  // --- Filter + search ---
  const filtered = patients
    .filter((p) => {
      if (activeFilter === 'All') return true;
      if (activeFilter === 'Labelled') return !!labels[p.patient_id];
      if (activeFilter === 'Unlabelled') return !labels[p.patient_id];
      if (activeFilter === 'Match') return isMatch(p) === true;
      if (activeFilter === 'Mismatch') return isMatch(p) === false;
      return true;
    })
    .filter(
      (p) =>
        searchQuery === '' ||
        p.patient_id.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => b.patient_id.localeCompare(a.patient_id));

  const totalPages = Math.ceil(filtered.length / PATIENTS_PER_PAGE);
  const paginated = filtered.slice(
    (currentPage - 1) * PATIENTS_PER_PAGE,
    currentPage * PATIENTS_PER_PAGE
  );

  // --- Export CSV ---
  const handleExport = () => {
    const rows = [
      ['Patient ID', 'Age', 'Sex', 'AI Prediction', 'AI Confidence', 'Ground Truth Label', 'Match'],
    ];

    patients.forEach((p) => {
      const gt = labels[p.patient_id] || '';
      const pred = p.prediction || '';
      const conf = p.confidence != null ? (p.confidence * 100).toFixed(1) + '%' : '';
      const match = isMatch(p);
      const matchStr = match === true ? 'Yes' : match === false ? 'No' : '';
      rows.push([p.patient_id, p.age, p.sex, pred, conf, gt, matchStr]);
    });

    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aml_ground_truth_labels_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMsg('Exported successfully');
    setTimeout(() => setExportMsg(null), 3000);
  };

  const getFilterCount = (f) => {
    if (f === 'All') return patients.length;
    if (f === 'Labelled') return labelled.length;
    if (f === 'Unlabelled') return unlabelled.length;
    if (f === 'Match') return matched.length;
    if (f === 'Mismatch') return mismatched.length;
    return 0;
  };

  if (loading) {
    return (
      <div className="labels-page">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading labelling interface…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="labels-page">

      {/* Header */}
      <div className="labels-header">
        <div className="labels-header-text">
          <h2>Labelling Interface</h2>
          <p className="labels-subtitle">
            Assign ground truth labels to analysed cases and evaluate model performance.
          </p>
        </div>
        <div className="labels-header-actions">
          {exportMsg && <span className="export-msg">✅ {exportMsg}</span>}
          <button className="btn-export" onClick={handleExport} disabled={labelled.length === 0}>
            ⬇ Export CSV
          </button>
          <button className="btn-refresh" onClick={fetchData}>🔄 Refresh</button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <span>⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Stats */}
      <div className="labels-stats-grid">
        <div className="label-stat-card" onClick={() => setActiveFilter('All')}>
          <div className="label-stat-value">{patients.length}</div>
          <div className="label-stat-label">Analysed Cases</div>
          <div className="label-stat-sub">Ready to label</div>
        </div>
        <div className="label-stat-card stat-labelled" onClick={() => setActiveFilter('Labelled')}>
          <div className="label-stat-value">{labelled.length}</div>
          <div className="label-stat-label">Labelled</div>
          <div className="label-stat-sub">Ground truth assigned</div>
        </div>
        <div className="label-stat-card stat-unlabelled" onClick={() => setActiveFilter('Unlabelled')}>
          <div className="label-stat-value">{unlabelled.length}</div>
          <div className="label-stat-label">Unlabelled</div>
          <div className="label-stat-sub">Awaiting review</div>
        </div>
        <div className="label-stat-card stat-match" onClick={() => setActiveFilter('Match')}>
          <div className="label-stat-value">{matched.length}</div>
          <div className="label-stat-label">Matches</div>
          <div className="label-stat-sub">AI ≡ Ground truth</div>
        </div>
        <div className="label-stat-card stat-mismatch" onClick={() => setActiveFilter('Mismatch')}>
          <div className="label-stat-value">{mismatched.length}</div>
          <div className="label-stat-label">Mismatches</div>
          <div className="label-stat-sub">AI ≠ Ground truth</div>
        </div>
        {accuracy !== null && (
          <div className="label-stat-card stat-accuracy">
            <div className="label-stat-value">{accuracy}%</div>
            <div className="label-stat-label">Label Accuracy</div>
            <div className="label-stat-sub">Based on {labelled.length} labels</div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {patients.length > 0 && (
        <div className="label-progress-card">
          <div className="label-progress-header">
            <span>Labelling Progress</span>
            <span className="label-progress-count">
              {labelled.length} / {patients.length} labelled
            </span>
          </div>
          <div className="label-progress-bar">
            <div
              className="label-progress-fill"
              style={{ width: `${(labelled.length / patients.length) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="labels-controls">
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`filter-tab ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
              <span className="filter-count">{getFilterCount(f)}</span>
            </button>
          ))}
        </div>
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            className="search-input"
            placeholder="Search by Patient ID…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button className="search-clear" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>
      </div>

      {/* No analysed cases */}
      {patients.length === 0 ? (
        <div className="empty-state">
          <p>No analysed cases found</p>
          <p className="empty-subtitle">
            Run AI analysis on patients first before assigning ground truth labels.
          </p>
          <button className="btn-go-analysis" onClick={() => navigate('/analysis')}>
            Go to Analysis →
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>No cases match this filter</p>
          <p className="empty-subtitle">Try a different filter or search query.</p>
        </div>
      ) : (
        <div className="labels-table-wrapper">
          <table className="labels-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Age</th>
                <th>Sex</th>
                <th>AI Prediction</th>
                <th>Confidence</th>
                <th>Ground Truth Label</th>
                <th>Match</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((patient) => {
                const gt = labels[patient.patient_id];
                const pred = patient.prediction;
                const conf = patient.confidence;
                const matchResult = isMatch(patient);
                const isSavingThis = saving === patient.patient_id;
                const isSavedThis = saveSuccess === patient.patient_id;

                return (
                  <tr key={patient.patient_id} className="label-row">
                    <td>
                      <button
                        className="patient-id-link"
                        onClick={() => navigate(`/patients/${patient.patient_id}/details`)}
                      >
                        {patient.patient_id}
                      </button>
                    </td>
                    <td>{patient.age}</td>
                    <td>{patient.sex}</td>
                    <td>
                        {pred ? (
                            <div className="pred-cell">
                            <span className={`pred-badge pred-${pred.toLowerCase()}`}>
                                {pred}
                            </span>
                            {patient.subtype_prediction && (
                                <span className="subtype-badge">
                                {patient.subtype_prediction}
                                </span>
                            )}
                            </div>
                        ) : (
                            <span className="no-data">—</span>
                        )}
                    </td>
                    <td>
                      {conf != null ? (
                        <div className="conf-cell">
                          <div className="conf-bar-bg">
                            <div
                              className={`conf-bar-fill ${conf >= 0.8 ? 'high' : conf >= 0.6 ? 'mid' : 'low'}`}
                              style={{ width: `${conf * 100}%` }}
                            />
                          </div>
                          <span className="conf-text">{(conf * 100).toFixed(1)}%</span>
                        </div>
                      ) : (
                        <span className="no-data">—</span>
                      )}
                    </td>
                    <td>
                      <div className="gt-select-wrapper">
                        <select
                          className={`gt-select ${gt ? 'has-value' : ''}`}
                          value={gt || ''}
                          onChange={(e) =>
                            e.target.value
                              ? handleLabelChange(patient.patient_id, e.target.value)
                              : handleClearLabel(patient.patient_id)
                          }
                        >
                          <option value="">— Select label —</option>
                          <option value="Control">Control</option>
                          <optgroup label="AML Subtypes">
                            {AML_SUBTYPES.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </optgroup>
                        </select>
                        {isSavingThis && <span className="save-indicator saving">saving…</span>}
                        {isSavedThis && <span className="save-indicator saved">✓ saved</span>}
                      </div>
                    </td>
                    <td>
                      {matchResult === true && (
                        <span className="match-badge match-yes">✓ Match</span>
                      )}
                      {matchResult === false && (
                        <span className="match-badge match-no">✗ Mismatch</span>
                      )}
                      {matchResult === null && (
                        <span className="no-data">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn-view-sm"
                        onClick={() => navigate(`/patients/${patient.patient_id}/details`)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="table-footer">
            <span>Showing {paginated.length} of {filtered.length} cases</span>
            {totalPages > 1 && (
              <div className="pagination-controls">
                <button
                  className="btn-page"
                  onClick={() => setCurrentPage((p) => p - 1)}
                  disabled={currentPage === 1}
                >
                  ← Prev
                </button>
                <span className="page-info">Page {currentPage} of {totalPages}</span>
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
        </div>
      )}

      {/* Info note */}
      <div className="labels-info-card">
        <span className="labels-info-icon">ℹ️</span>
        <div>
          <strong>How matching works:</strong> A "Match" means the AI binary prediction
          (AML vs Control) agrees with the ground truth. If you label a case as any AML
          subtype and the AI predicted AML, it counts as a match. Labels are saved locally
          in your browser and can be exported as CSV.
        </div>
      </div>
    </div>
  );
};

export default Labels;