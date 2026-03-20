import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './Analysis.css';

const FILTERS = ['All', 'Pending', 'Pending Haematology Data', 'Pending Images', 'Ready for Analysis', 'Analysis Complete', 'Today'];

const Analysis = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeFilter, setActiveFilter] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [runningAnalysis, setRunningAnalysis] = useState(null); 
  const [currentPage, setCurrentPage] = useState(1);
  const PATIENTS_PER_PAGE = 20;

  const BASE_URL = import.meta.env.VITE_API_BASE_URL;

  useEffect(() => {
    const incoming = location.state?.filter;
    if (incoming === 'Analysis Complete') setActiveFilter('Analysis Complete');
    else if (incoming === 'Pending') setActiveFilter('Pending');
    else if (incoming === 'Today') setActiveFilter('Today');
    fetchPatients();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter, searchQuery]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${BASE_URL}/api/v1/patients`);
      const data = await response.json();
      setPatients(data.patients || []);
      setCurrentPage(1);
      setError(null);
    } catch (err) {
      console.error('Error fetching patients:', err);
      setError(`Failed to load: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRunAnalysis = async (patientId, e) => {
    e.stopPropagation();
    try {
      setRunningAnalysis(patientId);
      const response = await fetch(
        `${BASE_URL}/api/v1/analysis/${patientId}/analyse-aml`,
        { method: 'POST' }
      );
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Analysis failed');
      }
      await fetchPatients();
    } catch (err) {
      console.error('Error running analysis:', err);
      alert(err.message || 'Failed to run analysis');
    } finally {
      setRunningAnalysis(null);
    }
  };

  // --- Derived stats ---
  const stats = {
    total: patients.length,
    pendingCbc: patients.filter((p) => p.status === 'Pending Haematology Data').length,
    pendingImages: patients.filter((p) => p.status === 'Pending Images').length,
    ready: patients.filter((p) => p.status === 'Ready for Analysis').length,
    complete: patients.filter((p) => p.status === 'Analysis Complete').length,
    };

  // --- Filter + search ---
  const today = new Date().toISOString().slice(0, 10);

  const filtered = patients
    .filter((p) => {
      if (activeFilter === 'All') return true;
      if (activeFilter === 'Pending')
        return p.status === 'Pending Haematology Data' || p.status === 'Pending Images';
      if (activeFilter === 'Today')
        return p.created_at && p.created_at.toString().slice(0, 10) === today;
      return p.status === activeFilter;
    })
    .filter(
      (p) =>
        searchQuery === '' ||
        p.patient_id.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => b.patient_id.localeCompare(a.patient_id));

    const totalPages = Math.ceil(filtered.length / PATIENTS_PER_PAGE);
    const paginatedPatients = filtered.slice(
        (currentPage - 1) * PATIENTS_PER_PAGE,
        currentPage * PATIENTS_PER_PAGE
    );


  // --- Helpers ---
  const getStatusClass = (status) =>
    `status-badge status-${(status || '').toLowerCase().replace(/ /g, '-')}`;

  const canRunAnalysis = (patient) =>
    patient.has_cbc && patient.has_images && patient.status !== 'Analysis Complete';

  const getActionButton = (patient) => {
    if (!patient.has_cbc || !patient.has_images) {
      return (
        <button
          className="btn-action-sm btn-incomplete"
          onClick={(e) => {
            e.stopPropagation();
            navigate(
              !patient.has_cbc
                ? `/patients/${patient.patient_id}/data-entry?tab=cbc`
                : `/patients/${patient.patient_id}/data-entry?tab=images`
            );
          }}
        >
          {!patient.has_cbc ? 'Enter Haematology' : 'Upload Images'}
        </button>
      );
    }

    if (patient.status === 'Analysis Complete') {
      return (
        <button
          className="btn-action-sm btn-view"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/patients/${patient.patient_id}/details`);
          }}
        >
          View Results
        </button>
      );
    }

    return (
      <button
        className="btn-action-sm btn-run"
        onClick={(e) => handleRunAnalysis(patient.patient_id, e)}
        disabled={runningAnalysis === patient.patient_id}
      >
        {runningAnalysis === patient.patient_id ? (
          <>
            <span className="spinner-tiny" />
            Running…
          </>
        ) : (
          <>🚀 Run Analysis</>
        )}
      </button>
    );
  };

  if (loading) {
    return (
      <div className="analysis-page">
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading analysis data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analysis-page">
      {/* Page Header */}
      <div className="analysis-header">
        <div className="analysis-header-text">
          <h2>Analysis Dashboard</h2>
          <p className="analysis-subtitle">
            Review pending and completed AML analyses across all patient cases.
          </p>
        </div>
        <button className="btn-refresh" onClick={fetchPatients}>
          🔄 Refresh
        </button>
      </div>

      {error && (
        <div className="error-banner">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Summary Stats */}
      <div className="stats-grid">
        <div className="stat-card" onClick={() => setActiveFilter('All')}>
          <div className="stat-value">{stats.total}</div>
          <div className="stat-label">Total Cases</div>
          <div className="stat-sub">All patients</div>
        </div>
        <div
          className="stat-card stat-pending"
          onClick={() => setActiveFilter('Pending Haematology Data')}
        >
          <div className="stat-value">{stats.pendingCbc}</div>
          <div className="stat-label">Pending Haematology</div>
          <div className="stat-sub">Pending haematology entry</div>
        </div>
        <div
            className="stat-card stat-images"
            onClick={() => setActiveFilter('Pending Images')}
        >
            <div className="stat-value">{stats.pendingImages}</div>
            <div className="stat-label">Pending Images</div>
            <div className="stat-sub">Awaiting upload</div>
        </div>
        <div
          className="stat-card stat-ready"
          onClick={() => setActiveFilter('Ready for Analysis')}
        >
          <div className="stat-value">{stats.ready}</div>
          <div className="stat-label">Ready</div>
          <div className="stat-sub">Data complete</div>
        </div>
        <div
          className="stat-card stat-complete"
          onClick={() => setActiveFilter('Analysis Complete')}
        >
          <div className="stat-value">{stats.complete}</div>
          <div className="stat-label">Completed</div>
          <div className="stat-sub">Analysis done</div>
        </div>
      </div>

      {/* Filter Tabs + Search */}
      <div className="analysis-controls">
        <div className="filter-tabs">
          {FILTERS.map((f) => (
            <button
              key={f}
              className={`filter-tab ${activeFilter === f ? 'active' : ''}`}
              onClick={() => setActiveFilter(f)}
            >
              {f}
              <span className="filter-count">
                {f === 'All'
                  ? patients.length
                  : f === 'Pending'
                  ? patients.filter((p) => p.status === 'Pending Haematology Data' || p.status === 'Pending Images').length
                  : f === 'Today'
                  ? patients.filter((p) => p.created_at && p.created_at.toString().slice(0, 10) === today).length
                  : patients.filter((p) => p.status === f).length}
              </span>
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
            <button className="search-clear" onClick={() => setSearchQuery('')}>
              ×
            </button>
          )}
        </div>
      </div>

      {/* Analysis Table */}
      {filtered.length > 0 ? (
        <div className="analysis-table-wrapper">
          <table className="analysis-table">
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Age</th>
                <th>Sex</th>
                <th>Haematology</th>
                <th>Images</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedPatients.map((patient) => (
                <tr
                  key={patient.patient_id}
                  className="analysis-row"
                  onClick={() =>
                    patient.status === 'Analysis Complete'
                      ? navigate(`/patients/${patient.patient_id}/details`)
                      : undefined
                  }
                  style={{
                    cursor:
                      patient.status === 'Analysis Complete'
                        ? 'pointer'
                        : 'default',
                  }}
                >
                  <td className="patient-id-cell">{patient.patient_id}</td>
                  <td>{patient.age}</td>
                  <td>{patient.sex}</td>
                  <td>
                    <span
                      className={`data-indicator ${patient.has_cbc ? 'complete' : 'pending'}`}
                    >
                      {patient.has_cbc ? '✓' : '○'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`data-indicator ${patient.has_images ? 'complete' : 'pending'}`}
                    >
                      {patient.has_images ? '✓' : '○'}
                    </span>
                  </td>
                  <td>
                    <span className={getStatusClass(patient.status)}>
                      {patient.status}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="action-cell">
                      {getActionButton(patient)}
                      {patient.status === 'Analysis Complete' && (
                        <button
                          className="btn-action-sm btn-rerun"
                          onClick={(e) => handleRunAnalysis(patient.patient_id, e)}
                          disabled={runningAnalysis === patient.patient_id}
                          title="Re-run analysis"
                        >
                          🔄
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="table-footer">
            <span>Showing {paginatedPatients.length} of {filtered.length} cases</span>
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
                    Page {currentPage} of {totalPages}
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
        </div>
      ) : (
        <div className="empty-state">
          <p>No cases match the current filter</p>
          <p className="empty-subtitle">Try changing the filter or search query</p>
        </div>
      )}

      {/* Clinical Disclaimer */}
      <div className="disclaimer-card">
        <span className="disclaimer-icon">⚕️</span>
        <p>
          AI analysis results are intended for decision support only and should be
          interpreted alongside clinical, laboratory, and pathological review.
        </p>
      </div>
    </div>
  );
};

export default Analysis;