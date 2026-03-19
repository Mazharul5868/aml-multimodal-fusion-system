import { useState } from "react";
import "./PatientForm.css";

export default function PatientForm({ onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    age: "",
    sex: "",
    sample_date: new Date().toISOString().split("T")[0],
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // clear field-level error as user edits
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validate = () => {
    const newErrors = {};

    const ageNum = Number(formData.age);

    if (formData.age === "" || Number.isNaN(ageNum)) {
      newErrors.age = "Age is required";
    } else if (ageNum < 0 || ageNum > 120) {
      newErrors.age = "Age must be between 0 and 120";
    }

    if (!formData.sex) {
      newErrors.sex = "Please select a sex";
    }

    if (!formData.sample_date) {
      newErrors.sample_date = "Sample date is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setErrors((prev) => ({ ...prev, submit: "" }));

    const payload = {
      age: Number(formData.age),
      sex: formData.sex,
      sample_date: formData.sample_date,
    };

    try {
      await onSubmit(payload);
    } catch (error) {
      console.error("Error creating patient:", error);
      setErrors((prev) => ({
        ...prev,
        submit: error?.message || "Failed to create patient. Please try again.",
      }));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Register New Patient</h2>
          <button className="close-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="patient-form">
          {/* Age */}
          <div className="form-group">
            <label htmlFor="age" className="form-label">
              Age <span className="required">*</span>
            </label>
            <input
              type="number"
              id="age"
              name="age"
              value={formData.age}
              onChange={handleChange}
              min="0"
              max="120"
              placeholder="45"
              className={`form-input ${errors.age ? "error" : ""}`}
            />
            {errors.age && <span className="error-message">{errors.age}</span>}
          </div>

          {/* Sex */}
          <div className="form-group">
            <label htmlFor="sex" className="form-label">
              Sex <span className="required">*</span>
            </label>
            <select
              id="sex"
              name="sex"
              value={formData.sex}
              onChange={handleChange}
              className={`form-input ${errors.sex ? "error" : ""}`}
            >
              <option value="" disabled>Select Sex</option>
              <option value="M">Male</option>
              <option value="F">Female</option>
            </select>
            {errors.sex && <span className="error-message">{errors.sex}</span>}
          </div>

          {/* Sample Date */}
          <div className="form-group">
            <label htmlFor="sample_date" className="form-label">
              Sample Date <span className="required">*</span>
            </label>
            <input
              type="date"
              id="sample_date"
              name="sample_date"
              value={formData.sample_date}
              onChange={handleChange}
              className={`form-input ${errors.sample_date ? "error" : ""}`}
            />
            {errors.sample_date && (
              <span className="error-message">{errors.sample_date}</span>
            )}
          </div>

          {/* Submit Error */}
          {errors.submit && <div className="submit-error">{errors.submit}</div>}

          {/* Form Actions */}
          <div className="form-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={submitting}>
              {submitting ? "Registering…" : "Register Patient"}
            </button>
          </div>
        </form>

        <div className="privacy-notice">
          <span className="privacy-icon">🔒</span>
          <span className="privacy-text">
            Do not enter personal identifiers (names, NHS numbers, DOB). The system generates a pseudonymised case ID automatically.
          </span>
        </div>
      </div>
    </div>
  );
}
