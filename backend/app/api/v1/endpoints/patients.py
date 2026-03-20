"""
Patient management endpoints
"""
import json
from datetime import datetime

from app.db.database import get_db
from app.models.patient import AnalysisResult, Image, Patient
from app.models.patient import CBCData as CBCDataModel
from app.schemas import CBCData, CBCDataCreate, PatientCreate, PatientResponse
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

router = APIRouter()

def generate_patient_id(db: Session) -> str:
    """Generate a unique patient ID in the format P-YYYY-XXX"""
    year = datetime.now().year
    
    # Query database for last patient this year
    last_patient = db.query(Patient).filter(
        Patient.patient_id.like(f"P-{year}-%")
    ).order_by(Patient.patient_id.desc()).first()
    
    if last_patient:
        # Extract number: P-2025-089 → 89
        last_num = int(last_patient.patient_id.split('-')[2])
        new_num = last_num + 1
    else:
        new_num = 1
    
    return f"P-{year}-{new_num:03d}"


@router.post("", response_model=PatientResponse, status_code=201)
async def create_patient(patient: PatientCreate, db: Session = Depends(get_db)):
    """Create a new patient record"""

    patient_id=generate_patient_id(db)

    db_patient = Patient(
        patient_id=patient_id,
        age=patient.age,
        sex=patient.sex.value,
        sample_date=str(patient.sample_date),
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    try: 
        db.add(db_patient)
        db.commit()
        db.refresh(db_patient)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    # Return Pydantic response
    return PatientResponse(
        patient_id=db_patient.patient_id,
        age=db_patient.age,
        sex=db_patient.sex,
        created_at=db_patient.created_at,
        updated_at=db_patient.updated_at
    )


def get_patient_status(patient_id: str, db: Session) -> dict:
    # Check CBC data
    has_cbc = db.query(CBCDataModel).filter(
        CBCDataModel.patient_id == patient_id
    ).first() is not None
    
    # Check images
    image_count = db.query(Image).filter(
        Image.patient_id == patient_id
    ).count()
    
    has_images = image_count > 0

    has_analysis = db.query(AnalysisResult).filter(
        AnalysisResult.patient_id == patient_id
    ).first() is not None
    
    # Determine status
    if not has_cbc:
        status = "Pending Haematology Data"
    elif not has_images:
        status = "Pending Images"
    elif has_analysis:
        status = "Analysis Complete"
    else:
        status = "Ready for Analysis"
    
    prediction = None
    confidence = None
    subtype_prediction = None  
    analysis = db.query(AnalysisResult).filter(
        AnalysisResult.patient_id == patient_id
    ).first()
    
    if analysis:
        prediction = analysis.prediction
        confidence = analysis.confidence

        # Extract subtype from stored JSON if AML
        if analysis.prediction == "AML" and analysis.cbc_features:
            try:
                cbc_features_json = json.loads(analysis.cbc_features)
                subtype_result = cbc_features_json.get("subtype_result")
                if subtype_result:
                    subtype_prediction = subtype_result.get("predicted_subtype")
            except Exception:
                pass
    
    return {
        "status": status,
        "has_cbc": has_cbc,
        "has_images": has_images,
        "has_analysis": has_analysis,
        "image_count": image_count,
        "prediction": prediction,
        "confidence": confidence,  
        "subtype_prediction": subtype_prediction, 
    }


@router.get("")
async def get_patients(db: Session = Depends(get_db), skip: int = 0, limit: int = 100):
    """Get list of all patients from MySQL"""

    total = db.query(Patient).count()
    patients = db.query(Patient).order_by(Patient.created_at.desc()).offset(skip).limit(limit).all()
    
    # Check CBC status for each patient
    patient_list = []
    for p in patients:
        patient_status = get_patient_status(p.patient_id, db)
        

        patient_list.append({
            "patient_id": p.patient_id,
            "age": p.age,
            "sex": p.sex,
            "sample_date": p.sample_date,
            "created_at": p.created_at,
            "status": patient_status["status"],
            "has_cbc": patient_status["has_cbc"],
            "has_images": patient_status["has_images"],
            "has_analysis": patient_status["has_analysis"],
            "image_count": patient_status["image_count"],
            "prediction": patient_status["prediction"],  
            "confidence": patient_status["confidence"], 
            "subtype_prediction": patient_status["subtype_prediction"], 
        })
    
    return {
        "total": total,
        "skip": skip,
        "limit": limit,
        "patients": patient_list
    }


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient(patient_id: str, db: Session = Depends(get_db)):
    """Get specific patient details"""
    patient = db.query(Patient).filter(
        Patient.patient_id == patient_id
    ).first()
    
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    return PatientResponse(
        patient_id=patient.patient_id,
        age=patient.age,
        sex=patient.sex,
        created_at=patient.created_at,
        updated_at=patient.updated_at
    )

@router.delete("/{patient_id}")
async def delete_patient(patient_id: str, db: Session = Depends(get_db)):
    """Delete patient record"""
    
    # Find patient
    db_patient = db.query(Patient).filter(
        Patient.patient_id == patient_id
    ).first()
    
    if not db_patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Check if has CBC data
    has_cbc = db.query(CBCDataModel).filter(
        CBCDataModel.patient_id == patient_id
    ).first()
    
    if has_cbc:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete patient with associated CBC data"
        )
    
    db.delete(db_patient)
    db.commit()
    
    return {"message": "Patient deleted successfully", "patient_id": patient_id}

@router.post("/{patient_id}/cbc")
async def create_or_update_cbc_data(
    patient_id: str,
    cbc_data: CBCDataCreate,
    db: Session = Depends(get_db)
):
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    existing_cbc = db.query(CBCDataModel).filter(CBCDataModel.patient_id == patient_id).first()

    if existing_cbc:
        existing_cbc.leucocytes_per_ul = cbc_data.leucocytes_per_ul
        existing_cbc.pb_myeloblast = cbc_data.pb_myeloblast
        existing_cbc.pb_promyelocyte = cbc_data.pb_promyelocyte
        existing_cbc.pb_myelocyte = cbc_data.pb_myelocyte
        existing_cbc.pb_metamyelocyte = cbc_data.pb_metamyelocyte
        existing_cbc.pb_neutrophil_band = cbc_data.pb_neutrophil_band
        existing_cbc.pb_neutrophil_segmented = cbc_data.pb_neutrophil_segmented
        existing_cbc.pb_eosinophil = cbc_data.pb_eosinophil
        existing_cbc.pb_basophil = cbc_data.pb_basophil
        existing_cbc.pb_monocyte = cbc_data.pb_monocyte
        existing_cbc.pb_lymph_typ = cbc_data.pb_lymph_typ
        existing_cbc.pb_lymph_atyp_react = cbc_data.pb_lymph_atyp_react
        existing_cbc.pb_lymph_atyp_neopl = cbc_data.pb_lymph_atyp_neopl
        existing_cbc.pb_other = cbc_data.pb_other
        existing_cbc.pb_total = cbc_data.pb_total
        db_cbc = existing_cbc
    else:
        db_cbc = CBCDataModel(
            patient_id=patient_id,
            leucocytes_per_ul=cbc_data.leucocytes_per_ul,
            pb_myeloblast=cbc_data.pb_myeloblast,
            pb_promyelocyte=cbc_data.pb_promyelocyte,
            pb_myelocyte=cbc_data.pb_myelocyte,
            pb_metamyelocyte=cbc_data.pb_metamyelocyte,
            pb_neutrophil_band=cbc_data.pb_neutrophil_band,
            pb_neutrophil_segmented=cbc_data.pb_neutrophil_segmented,
            pb_eosinophil=cbc_data.pb_eosinophil,
            pb_basophil=cbc_data.pb_basophil,
            pb_monocyte=cbc_data.pb_monocyte,
            pb_lymph_typ=cbc_data.pb_lymph_typ,
            pb_lymph_atyp_react=cbc_data.pb_lymph_atyp_react,
            pb_lymph_atyp_neopl=cbc_data.pb_lymph_atyp_neopl,
            pb_other=cbc_data.pb_other,
            pb_total=cbc_data.pb_total,
        )
        db.add(db_cbc)

    db.commit()
    db.refresh(db_cbc)

    return {
        "message": "CBC data saved successfully",
        "patient_id": patient_id,
        "cbc_data": {
            "leucocytes_per_ul": db_cbc.leucocytes_per_ul,
            "pb_myeloblast": db_cbc.pb_myeloblast,
            "pb_promyelocyte": db_cbc.pb_promyelocyte,
            "pb_myelocyte": db_cbc.pb_myelocyte,
            "pb_metamyelocyte": db_cbc.pb_metamyelocyte,
            "pb_neutrophil_band": db_cbc.pb_neutrophil_band,
            "pb_neutrophil_segmented": db_cbc.pb_neutrophil_segmented,
            "pb_eosinophil": db_cbc.pb_eosinophil,
            "pb_basophil": db_cbc.pb_basophil,
            "pb_monocyte": db_cbc.pb_monocyte,
            "pb_lymph_typ": db_cbc.pb_lymph_typ,
            "pb_lymph_atyp_react": db_cbc.pb_lymph_atyp_react,
            "pb_lymph_atyp_neopl": db_cbc.pb_lymph_atyp_neopl,
            "pb_other": db_cbc.pb_other,
            "pb_total": db_cbc.pb_total,
        }
    }

@router.get("/{patient_id}/data")
async def get_patient_data(patient_id: str, db: Session = Depends(get_db)):
    """Get all patient data (demographics, CBC, images, analysis results)"""
    
    # Get patient
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Get patient status
    patient_status = get_patient_status(patient_id, db)
    
    # Get CBC data
    cbc_data = db.query(CBCDataModel).filter(CBCDataModel.patient_id == patient_id).first()
    
    # Get images
    images = db.query(Image).filter(Image.patient_id == patient_id).all()
    
    # GET ANALYSIS RESULT
    analysis_result = db.query(AnalysisResult).filter(
        AnalysisResult.patient_id == patient_id
    ).order_by(AnalysisResult.analyzed_at.desc()).first()

    # Format analysis result
    analysis_data = None
    if analysis_result:
        subtype_prediction = None
        subtype_confidence = None
        subtype_probabilities = None
        probabilities = None
        binary_explanation = None
        subtype_explanation = None

        if analysis_result.cbc_features:
            try:
                cbc_features_json = json.loads(analysis_result.cbc_features)
        
                probabilities = cbc_features_json.get("prediction_probabilities")

                subtype_result = cbc_features_json.get("subtype_result")
                if subtype_result:
                    subtype_prediction = subtype_result.get("predicted_subtype")
                    subtype_confidence = subtype_result.get("subtype_confidence")
                    subtype_probabilities = subtype_result.get("subtype_probabilities")

                explainability = cbc_features_json.get("explainability", {})
              
                binary_explanation = explainability.get("binary")
                subtype_explanation = explainability.get("subtype")

            except Exception as e:
                print("Failed to parse analysis_result.cbc_features:", e)

        analysis_data = {
            "prediction": analysis_result.prediction,
            "confidence": analysis_result.confidence,
            "model_version": analysis_result.model_version,
            "analyzed_at": analysis_result.analyzed_at.isoformat(),
            "processing_time": analysis_result.processing_time_seconds,
            "probabilities": probabilities,
            "subtype_prediction": subtype_prediction,
            "subtype_confidence": subtype_confidence,
            "subtype_probabilities": subtype_probabilities,
            "binary_explanation": binary_explanation,
            "subtype_explanation": subtype_explanation,
        }
    
    return {
        "patient_id": patient.patient_id,
        "status": patient_status["status"],
        "demographics": {
            "age": patient.age,
            "sex": patient.sex,
            "sample_date": patient.sample_date,
            "created_at": patient.created_at
        },
        "cbc_data": {
            "leucocytes_per_ul": cbc_data.leucocytes_per_ul,
            "pb_myeloblast": cbc_data.pb_myeloblast,
            "pb_promyelocyte": cbc_data.pb_promyelocyte,
            "pb_myelocyte": cbc_data.pb_myelocyte,
            "pb_metamyelocyte": cbc_data.pb_metamyelocyte,
            "pb_neutrophil_band": cbc_data.pb_neutrophil_band,
            "pb_neutrophil_segmented": cbc_data.pb_neutrophil_segmented,
            "pb_eosinophil": cbc_data.pb_eosinophil,
            "pb_basophil": cbc_data.pb_basophil,
            "pb_monocyte": cbc_data.pb_monocyte,
            "pb_lymph_typ": cbc_data.pb_lymph_typ,
            "pb_lymph_atyp_react": cbc_data.pb_lymph_atyp_react,
            "pb_lymph_atyp_neopl": cbc_data.pb_lymph_atyp_neopl,
            "pb_other": cbc_data.pb_other,
            "pb_total": cbc_data.pb_total
        } if cbc_data else None,
        "images": [
            {
                "id": img.id,
                "filename": img.filename,
                "original_filename": img.original_filename,
                "filepath": img.filepath,
                "file_type": img.file_type,
                "file_size": img.file_size,
                "uploaded_at": img.uploaded_at
            }
            for img in images
        ],
        "analysis_result": analysis_data
    }