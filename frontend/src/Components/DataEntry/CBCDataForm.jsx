import { useState } from 'react';
import './CBCDataForm.css';

const CBCDataForm = ({ patientId, onSubmit, onCancel }) => {
  const [cbcData, setCbcData] = useState({
    leucocytes_per_ul: '',
    pb_myeloblast: '',
    pb_promyelocyte: '',
    pb_myelocyte: '',
    pb_metamyelocyte: '',
    pb_neutrophil_band: '',
    pb_neutrophil_segmented: '',
    pb_eosinophil: '',
    pb_basophil: '',
    pb_monocyte: '',
    pb_lymph_typ: '',
    pb_lymph_atyp_react: '',
    pb_lymph_atyp_neopl: '',
    pb_other: ''
  });

  const [errors, setErrors] = useState({});

  // Fields allowed to be blank and later imputed in backend
  const optionalFields = ['leucocytes_per_ul', 'pb_lymph_atyp_neopl'];

  const toNumberOrNull = (value) => (value === '' ? null : parseFloat(value));

  const fieldGroups = {
    absolute: {
      title: 'Absolute Count',
      fields: {
        leucocytes_per_ul: {
          label: 'Leucocytes (WBC)',
          unit: 'per µL',
          min: 0,
          max: 100000,
          step: 0.01,
          isInteger: false
        }
      }
    },
    immature: {
      title: 'Immature Cells (Cell Count)',
      fields: {
        pb_myeloblast: {
          label: 'Myeloblast',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        },
        pb_promyelocyte: {
          label: 'Promyelocyte',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        },
        pb_myelocyte: {
          label: 'Myelocyte',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        },
        pb_metamyelocyte: {
          label: 'Metamyelocyte',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        }
      }
    },
    granulocytes: {
      title: 'Mature Granulocytes (Cells Count)',
      fields: {
        pb_neutrophil_band: {
          label: 'Neutrophil (Band)',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        },
        pb_neutrophil_segmented: {
          label: 'Neutrophil (Segmented)',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        },
        pb_eosinophil: {
          label: 'Eosinophil',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        },
        pb_basophil: {
          label: 'Basophil',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        }
      }
    },
    mononuclear: {
      title: 'Mononuclear Cells',
      fields: {
        pb_monocyte: {
          label: 'Monocyte',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        },
        pb_lymph_typ: {
          label: 'Lymphocyte (Typical)',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        },
        pb_lymph_atyp_react: {
          label: 'Lymphocyte (Atypical Reactive)',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        },
        pb_lymph_atyp_neopl: {
          label: 'Lymphocyte (Atypical Neoplastic)',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        }
      }
    },
    other: {
      title: 'Other',
      fields: {
        pb_other: {
          label: 'Other Cells',
          unit: 'cells',
          min: 0,
          max: 1000,
          step: '1',
          isInteger: true
        }
      }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setCbcData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const getAllFields = () => {
    let allFields = {};
    Object.values(fieldGroups).forEach((group) => {
      allFields = { ...allFields, ...group.fields };
    });
    return allFields;
  };

  const calculateTotal = () => {
    const cellCountFields = Object.keys(cbcData).filter(
      (key) => key !== 'leucocytes_per_ul'
    );

    const total = cellCountFields.reduce((sum, key) => {
      const value = parseFloat(cbcData[key]);
      return sum + (isNaN(value) ? 0 : value);
    }, 0);

    return Math.round(total);
  };

  const validate = () => {
    const newErrors = {};
    const allFields = getAllFields();

    Object.keys(cbcData).forEach((key) => {
      const field = allFields[key];
      const raw = cbcData[key];

      if (raw === '' && !optionalFields.includes(key)) {
        newErrors[key] = 'Required';
        return;
      }

      if (raw === '') {
        return;
      }

      const value = parseFloat(raw);

      if (isNaN(value)) {
        newErrors[key] = 'Must be a number';
      } else if (value < field.min || value > field.max) {
        newErrors[key] = `Out of range (${field.min}-${field.max})`;
      } else if (field.isInteger && !Number.isInteger(value)) {
        newErrors[key] = 'Must be an integer';
      }
    });

    const total = calculateTotal();
    if (total < 50) {
      newErrors.total = 'Total cell count should be at least 50 for reliable differential';
    } else if (total > 500) {
      newErrors.total = 'Total cell count exceeds maximum expected value';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      const formattedData = {
        leucocytes_per_ul: toNumberOrNull(cbcData.leucocytes_per_ul),
        pb_myeloblast: toNumberOrNull(cbcData.pb_myeloblast),
        pb_promyelocyte: toNumberOrNull(cbcData.pb_promyelocyte),
        pb_myelocyte: toNumberOrNull(cbcData.pb_myelocyte),
        pb_metamyelocyte: toNumberOrNull(cbcData.pb_metamyelocyte),
        pb_neutrophil_band: toNumberOrNull(cbcData.pb_neutrophil_band),
        pb_neutrophil_segmented: toNumberOrNull(cbcData.pb_neutrophil_segmented),
        pb_eosinophil: toNumberOrNull(cbcData.pb_eosinophil),
        pb_basophil: toNumberOrNull(cbcData.pb_basophil),
        pb_monocyte: toNumberOrNull(cbcData.pb_monocyte),
        pb_lymph_typ: toNumberOrNull(cbcData.pb_lymph_typ),
        pb_lymph_atyp_react: toNumberOrNull(cbcData.pb_lymph_atyp_react),
        pb_lymph_atyp_neopl: toNumberOrNull(cbcData.pb_lymph_atyp_neopl),
        pb_other: toNumberOrNull(cbcData.pb_other),
        pb_total: parseFloat(calculateTotal())
      };

      await onSubmit(formattedData);
    } catch (error) {
      console.error('Error submitting CBC data:', error);
      setErrors({ submit: 'Failed to submit CBC data. Please try again.' });
    }
  };

  const total = calculateTotal();

  return (
    <form onSubmit={handleSubmit} className="cbc-form">
      <div className="form-header">
        <h3>Peripheral Blood Haematology</h3>
        <p className="form-subtitle">Enter haematological differential count data</p>
      </div>

      {Object.entries(fieldGroups).map(([groupKey, group]) => (
        <div key={groupKey} className="field-group-section">
          <h4 className="group-title">{group.title}</h4>
          <div className="cbc-fields">
            {Object.entries(group.fields).map(([fieldName, field]) => {
              const isOptional = optionalFields.includes(fieldName);

              return (
                <div key={fieldName} className="cbc-field-group">
                  <label htmlFor={fieldName} className="cbc-label">
                    {field.label} {!isOptional && <span className="required">*</span>}
                  </label>

                  <div className="input-wrapper">
                    <input
                      type="number"
                      id={fieldName}
                      name={fieldName}
                      value={cbcData[fieldName]}
                      onChange={handleChange}
                      onWheel={(e) => e.currentTarget.blur()}
                      step={field.step}
                      className={`cbc-input ${errors[fieldName] ? 'error' : ''}`}
                      placeholder={isOptional ? 'Optional' : '0.0'}
                    />
                    <span className="unit-label">{field.unit}</span>
                  </div>

                  {errors[fieldName] && (
                    <div className="field-info">
                      <span className="error-message">{errors[fieldName]}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div className={`total-display ${total < 50 || total > 500 ? 'warning' : ''}`}>
        <div className="total-row">
          <span className="total-label">Total Cells Counted:</span>
          <span className="total-value">{total}</span>
        </div>
        {total < 50 && (
          <div className="total-hint warning">
            ⚠️ Recommended minimum: 100 cells for reliable differential
          </div>
        )}
        {total >= 50 && total <= 200 && (
          <div className="total-hint success">
            ✓ Good differential count (typical range: 100-200)
          </div>
        )}
        {total > 200 && total <= 500 && (
          <div className="total-hint info">
            ℹ️ Extended differential count
          </div>
        )}
        {total > 500 && (
          <div className="total-hint warning">
            ⚠️ Total exceeds typical range
          </div>
        )}
      </div>

      {errors.total && <div className="form-error">{errors.total}</div>}
      {errors.submit && <div className="submit-error">{errors.submit}</div>}

      <div className="form-actions">
        {onCancel && (
          <button type="button" className="btn-cancel" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-submit-cbc">
          Save Haematology Data
        </button>
      </div>
    </form>
  );
};

export default CBCDataForm;