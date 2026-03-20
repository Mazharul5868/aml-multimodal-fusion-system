import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

const Home = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);

  const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

  useEffect(() => {
    fetch(`${BASE_URL}/api/v1/patients?limit=1000`)
      .then((res) => res.json())
      .then((data) => setPatients(data.patients || []))
      .catch((err) => console.error('Failed to load patients:', err))
      .finally(() => setLoading(false));
  }, []);

  const totalCases = patients.length;
  const pendingAnalysis = patients.filter(
    (p) => p.status === 'Pending Haematology Data' ||
           p.status === 'Pending Images' ||
           p.status === 'Ready for Analysis'
  ).length;
  const today = new Date().toISOString().slice(0, 10);
  const completedToday = patients.filter(
    (p) => p.status === 'Analysis Complete' &&
           p.created_at?.toString().slice(0, 10) === today
  ).length;
  const analysisComplete = patients.filter(
    (p) => p.status === 'Analysis Complete'
  ).length;

  const systemStats = {
    totalCases,
    pendingAnalysis,
    completedToday,
    analysisComplete,
  };

  const recentActivity = [...patients]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5)
    .map((p) => ({
      patientId: p.patient_id,
      status: p.status,
      timestamp: formatRelativeTime(p.created_at),
    }));

    const quickActions = [
      { title: 'New Patient Case', description: 'Register patient and begin analysis', icon: '🩺', route: '/patients', color: 'primary' },
      { title: 'Manage Patients', description: 'View and manage existing cases', icon: '👥', route: '/patients', color: 'secondary' },
      { title: 'Analysis Dashboard', description: 'Review pending and completed analyses', icon: '📊', route: '/analysis', color: 'tertiary' },
      { title: 'Labelling Interface', description: 'Annotate and review dataset samples', icon: '🏷️', route: '/labels', color: 'quaternary' },
    ];

  return (
    <div className="home-container">

      {/* Main Content */}
      <main className="home-main">
        {/* Welcome Section */}
        <section className="welcome-section">
          <h2>Welcome to AML Multimodal Analysis</h2>
          <p className="welcome-text">
            This decision-support system integrates Haematological  data and
            morphological features from blood smear images
            to assist in acute myeloid leukemia detection.
          </p>
          <div className="disclaimer">
            <span className="disclaimer-icon">⚕️</span>
            <span className="disclaimer-text">
              For research and decision-support purposes only. Not intended as standalone diagnostic tool.
            </span>
          </div>
        </section>

        {/* Statistics Cards */}
        <section className="stats-section">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="stat-card stat-skeleton" />
            ))
          ) : (
            <>
              <div className="stat-card" onClick={() => navigate('/patients')}>
                <div className="stat-value">{systemStats.totalCases}</div>
                <div className="stat-label">Total Cases</div>
                <div className="stat-trend neutral">All registered patients</div>
              </div>
              <div className="stat-card" onClick={() => navigate('/analysis', { state: { filter: 'Pending' } })}>
                <div className="stat-value">{systemStats.pendingAnalysis}</div>
                <div className="stat-label">Pending Analysis</div>
                <div className="stat-trend neutral">Awaiting data or review</div>
              </div>
              <div className="stat-card" onClick={() => navigate('/analysis', { state: { filter: 'Today' } })}>
                <div className="stat-value">{systemStats.completedToday}</div>
                <div className="stat-label">Registered Today</div>
                <div className="stat-trend positive">New cases today</div>
              </div>
              <div className="stat-card" onClick={() => navigate('/analysis', { state: { filter: 'Analysis Complete' } })}>
                <div className="stat-value">{systemStats.analysisComplete}</div>
                <div className="stat-label">Analysis Complete</div>
                <div className="stat-trend positive">Ready for review</div>
              </div>
            </>
          )}
        </section>

        {/* Quick Actions */}
        <section className="actions-section">
          <h3 className="section-title">Quick Actions</h3>
          <div className="action-grid">
            {quickActions.map((action, index) => (
              <div key={index} className={`action-card ${action.color}`}>
                <div className="action-icon">{action.icon}</div>
                <h4 className="action-title">{action.title}</h4>
                <p className="action-description">{action.description}</p>
                <button className="action-button" onClick={() => navigate(action.route)}>
                  Get Started
                  <span className="button-arrow">→</span>
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Activity */}
        <section className="activity-section">
          <h3 className="section-title">Recent Activity</h3>
          {loading ? (
            <div className="activity-list">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="activity-item activity-skeleton" />
              ))}
            </div>
          ) : recentActivity.length > 0 ? (
            <div className="activity-list">
              {recentActivity.map((activity, i) => (
                <div key={i} className="activity-item">
                  <div className="activity-indicator" />
                  <div className="activity-content">
                    <div className="activity-header">
                      <span className="activity-patient">{activity.patientId}</span>
                      <span className={`activity-status status-${(activity.status || '').toLowerCase().replace(/ /g, '-')}`}>
                        {activity.status}
                      </span>
                    </div>
                    <div className="activity-time">{activity.timestamp}</div>
                  </div>
                  <button
                    className="activity-view"
                    onClick={() => navigate(`/patients/${activity.patientId}/details`)}
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>No recent activity yet.</p>
          )}
        </section>

        {/* System Information */}
        <section className="info-section">
          <div className="info-card">
            <h4>System Capabilities</h4>
            <ul className="info-list">
              <li>AML detection vs healthy classification</li>
              <li>AML subtype classification (CBFB::MYH11, NPM1, PML::RARA, RUNX1::RUNX1T1)</li>
              <li>Multimodal fusion — haematology + blood smear morphology</li>
              <li>SHAP-based feature contribution explanations</li>
              <li>Re-runnable analysis with result history</li>
            </ul>
          </div>
          <div className="info-card">
            <h4>Model Information</h4>
            <ul className="info-list">
              <li>LightGBM GBDT multiclass fusion model</li>
              <li>Otsu thresholding — cell segmentation and morphological features</li>
              <li>Sobel gradient and Canny edge texture features</li>
              <li>Patient-level feature aggregation</li>
              <li>SHAP TreeExplainer for per-prediction interpretability</li>
            </ul>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="home-footer">
        <p>BSc (Hons) Computer Science (AI) Dissertation Project | Brunel University London</p>
        <p className="footer-secondary">Developed by Mazharul | Academic Research System</p>
      </footer>
    </div>
  );
};

function formatRelativeTime(dateStr) {
  if (!dateStr) return 'Unknown';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export default Home;