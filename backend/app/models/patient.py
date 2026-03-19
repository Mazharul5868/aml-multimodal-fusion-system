"""
Database models for patient data
"""
from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import relationship

from app.db.database import Base


class Patient(Base):
    __tablename__ = "patients"
    
    patient_id = Column(String(20), primary_key=True)
    age = Column(Integer, nullable=False)
    sex = Column(String(10), nullable=False)
    sample_date = Column(String(20), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # Relationships
    cbc_data = relationship("CBCData", back_populates="patient", uselist=False)
    images = relationship("Image", back_populates="patient")
    analysis_results = relationship("AnalysisResult", back_populates="patient")


class CBCData(Base):
    __tablename__ = "cbc_data"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(20), ForeignKey("patients.patient_id"), unique=True)
    
    # CBC fields
    leucocytes_per_ul = Column(Float, nullable=True)
    pb_myeloblast = Column(Float, nullable=True)
    pb_promyelocyte = Column(Float, nullable=True)
    pb_myelocyte = Column(Float, nullable=True)
    pb_metamyelocyte = Column(Float, nullable=True)
    pb_neutrophil_band = Column(Float, nullable=True)
    pb_neutrophil_segmented = Column(Float, nullable=True)
    pb_eosinophil = Column(Float, nullable=True)
    pb_basophil = Column(Float, nullable=True)
    pb_monocyte = Column(Float, nullable=True)
    pb_lymph_typ = Column(Float, nullable=True)
    pb_lymph_atyp_react = Column(Float, nullable=True)
    pb_lymph_atyp_neopl = Column(Float, nullable=True)
    pb_other = Column(Float, nullable=True)
    pb_total = Column(Float, nullable=True)
    
    created_at = Column(DateTime, default=datetime.now)
    
    # Relationship
    patient = relationship("Patient", back_populates="cbc_data")


class Image(Base):
    __tablename__ = "images"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    patient_id = Column(String(20), ForeignKey("patients.patient_id"))
    
    filename = Column(String(255), nullable=False)
    original_filename = Column(String(255), nullable=False)
    filepath = Column(String(500), nullable=False)
    file_type = Column(String(50), nullable=False)              # jpb, png, tif
    file_size = Column(Integer)

    #Image data
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    quality_score = Column(Float, nullable=True)  # quality score (0-1)
    is_segmented = Column(Integer, default=0)  # 0 = No, 1 = Yes
    
    uploaded_at = Column(DateTime, default=datetime.now)
    
    # Relationship
    patient = relationship("Patient", back_populates="images")


class AnalysisResult(Base):
    """Store AML detection analysis results"""
    __tablename__ = "analysis_results"
    
    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(String(50), ForeignKey("patients.patient_id"), nullable=False, index=True)
    
    # Prediction results
    prediction = Column(String(20), nullable=False)
    confidence = Column(Float, nullable=False)
    
    # Feature data (JSON)
    morphological_features = Column(Text, nullable=True)
    hue_features = Column(Text, nullable=True)
    cbc_features = Column(Text, nullable=True)
    
    # Processing info
    images_analyzed = Column(Integer, default=0)
    processing_time_seconds = Column(Float, nullable=True)
    model_version = Column(String(50), default="v1.0")
    
    # Timestamps
    analyzed_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship
    patient = relationship("Patient", back_populates="analysis_results")