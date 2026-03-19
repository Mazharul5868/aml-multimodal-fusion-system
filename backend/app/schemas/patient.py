"""
Patient-related Pydantic schemas
"""
from datetime import date, datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class SexEnum(str, Enum):
    """Patient sex options"""
    MALE = "M"
    FEMALE = "F"


class PatientCreate(BaseModel):
    """Schema for creating a patient"""
    age: int
    sex: SexEnum
    sample_date: date


class PatientResponse(BaseModel):
    """Schema for patient response"""
    patient_id: str
    age: int
    sex: str
    created_at: datetime
    updated_at: datetime

# new schema for Post request
class CBCDataCreate(BaseModel):
    leucocytes_per_ul: Optional[float] = None
    pb_myeloblast: Optional[int] = None
    pb_promyelocyte: Optional[int] = None
    pb_myelocyte: Optional[int] = None
    pb_metamyelocyte: Optional[int] = None
    pb_neutrophil_band: Optional[int] = None
    pb_neutrophil_segmented: Optional[int] = None
    pb_eosinophil: Optional[int] = None
    pb_basophil: Optional[int] = None
    pb_monocyte: Optional[int] = None
    pb_lymph_typ: Optional[int] = None
    pb_lymph_atyp_react: Optional[int] = None
    pb_lymph_atyp_neopl: Optional[int] = None
    pb_other: Optional[int] = None
    pb_total: Optional[int] = None

class CBCData(BaseModel):
    patient_id: str
    leucocytes_per_ul: Optional[float] = None
    pb_myeloblast: Optional[float] = None
    pb_promyelocyte: Optional[float] = None
    pb_myelocyte: Optional[float] = None
    pb_metamyelocyte: Optional[float] = None
    pb_neutrophil_band: Optional[float] = None
    pb_neutrophil_segmented: Optional[float] = None
    pb_eosinophil: Optional[float] = None
    pb_basophil: Optional[float] = None
    pb_monocyte: Optional[float] = None
    pb_lymph_typ: Optional[float] = None
    pb_lymph_atyp_react: Optional[float] = None
    pb_lymph_atyp_neopl: Optional[float] = None
    pb_other: Optional[float] = None
    pb_total: Optional[float] = None


class ImageResponse(BaseModel):
    """Schema for image response"""
    id: int
    patient_id: str
    filename: str
    original_filename: str
    file_type: str
    file_size: int
    uploaded_at: datetime

    class Config:
        from_attributes = True

class ImageUploadResponse(BaseModel):
    """Schema for image upload response"""
    message: str
    patient_id: str
    uploaded_count: int 
    images: list[ImageResponse]
