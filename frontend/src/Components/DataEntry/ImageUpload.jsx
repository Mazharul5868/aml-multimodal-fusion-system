import { useRef, useState } from 'react';
import './ImageUpload.css';

const ImageUpload = ({ patientId, onUpload, onCancel }) => {
  const [images, setImages] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  // Accepted file types
  const acceptedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/tif', 'image/tiff'];
  const maxFileSize = 50 * 1024 * 1024; // 50MB for high-quality images 

  const validateFile = (file) => {

    // Check file extension
    const fileName = file.name.toLowerCase();
    const validExtensions = ['.jpg', '.jpeg', '.png', '.tif', '.tiff'];
    const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!hasValidExtension && !acceptedTypes.includes(file.type)) {
      return 'Only JPEG, PNG, and TIF images are accepted';
    }
    if (file.size > maxFileSize) {
      return 'File size must be less than 50MB';
    }
    return null;
  };

  const handleFiles = (files) => {
    const fileArray = Array.from(files);
    const validFiles = [];
    let hasError = false;

    fileArray.forEach(file => {
      const error = validateFile(file);
      if (error) {
        setError(error);
        hasError = true;
      } else {
        // Create preview URL
        const isTif = file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff');
        const preview = isTif ? null : URL.createObjectURL(file);

        validFiles.push({
          file,
          preview,
          name: file.name,
          size: file.size,
          type: file.type ||'image/tiff', 
          isTif,
          id: Date.now() + Math.random()
        });
      }
    });

    if (!hasError) {
      setImages(prev => [...prev, ...validFiles]);
      setError(null);
    }
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const handleFileInput = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleFiles(files);
    }
  };

  const removeImage = (id) => {
    setImages(prev => prev.filter(img => img.id !== id));
  };

  const handleSubmit = async () => {
    if (images.length === 0) {
      setError('Please upload at least one image');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      images.forEach((img) => {
        formData.append('images', img.file);
      });

      await onUpload(formData);
    } catch (err) {
      console.error('Error uploading images:', err);
      setError('Failed to upload images. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="image-upload-container">
      <div className="upload-header">
        <h3>Blood Smear Images</h3>
        <p className="upload-subtitle">
          Upload peripheral blood smear images for morphological analysis
        </p>
      </div>

      {/* Drag and Drop Area */}
      <div
        className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="dropzone-content">
          <span className="upload-icon">📤</span>
          <p className="dropzone-text">
            Drag and drop images here, or <span className="click-text">click to browse</span>
          </p>
          <p className="dropzone-hint">
            Accepts JPEG, PNG, TIF/TIFF • Max 50MB per file • Multiple files supported
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/jpeg,image/jpg,image/png,image/tif,image/tiff"
          onChange={handleFileInput}
          style={{ display: 'none' }}
        />
      </div>

      {error && (
        <div className="upload-error">
          <span className="error-icon">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Image Requirements */}
      <div className="requirements-box">
        <h4>Image Requirements</h4>
        <ul className="requirements-list">
          <li>✓ Wright–Giemsa or May–Grünwald–Giemsa staining</li>
          <li>✓ 100× oil immersion magnification (recommended)</li>
          <li>✓ Multiple fields (not single cell)</li>
          <li>✓ Clear focus and proper illumination</li>
          <li>✓ TIF/TIFF format recommended for best quality</li>
        </ul>
      </div>

      {/* Image Preview Grid */}
      {images.length > 0 && (
        <div className="preview-section">
          <h4>Uploaded Images ({images.length})</h4>
          <div className="preview-grid">
            {images.map((img) => (
              <div key={img.id} className="preview-card">
                {img.isTif ? (
                  <div className="tif-placeholder">
                    <span className="file-icon">🔬</span>
                    <span className="tif-label">TIF</span>
                  </div>
                ) : (
                  <img src={img.preview} alt={img.name} className="preview-image" />
                )}
                <div className="preview-info">
                  <span className="preview-name">{img.name}</span>
                  <span className="preview-size">{formatFileSize(img.size)}</span>
                </div>
                <button
                  type="button"
                  className="remove-button"
                  onClick={() => removeImage(img.id)}
                  disabled={uploading}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="upload-actions">
        {onCancel && (
          <button
            type="button"
            className="btn-cancel"
            onClick={onCancel}
            disabled={uploading}
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          className="btn-upload"
          onClick={handleSubmit}
          disabled={uploading || images.length === 0}
        >
          {uploading ? (
            <>
              <span className="spinner-small"></span>
              Uploading...
            </>
          ) : (
            <>
              Upload {images.length > 0 ? `${images.length} Image${images.length > 1 ? 's' : ''}` : 'Images'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default ImageUpload;