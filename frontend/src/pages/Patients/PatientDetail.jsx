import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { patientsApi } from "../../api";

export default function PatientDetail() {
  const { patientId } = useParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [patient, setPatient] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await patientsApi.get(patientId);
        if (!mounted) return;
        setPatient(data);
      } catch (e) {
        if (!mounted) return;
        setErr(e.message);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => (mounted = false);
  }, [patientId]);

  return (
    <div style={{ padding: 24 }}>
      <Link to="/patients">← Back to patients</Link>
      <h2>Patient: {patientId}</h2>

      {loading && <p>Loading…</p>}
      {err && <p style={{ color: "crimson" }}>Error: {err}</p>}

      {patient && (
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(patient, null, 2)}
        </pre>
      )}
    </div>
  );
}
