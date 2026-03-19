"""
Image upload endpoints
"""
import os
import uuid
from datetime import datetime
from typing import List

from app.core.config import settings
from app.db.database import get_db
from app.models.patient import Image, Patient
from app.schemas import ImageUploadResponse
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

router = APIRouter()

# Allowed file types
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.tif', '.tiff'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB for high-quality microscopic images


def get_file_extension(filename: str) -> str:
    """Get file extension in lowercase"""
    return os.path.splitext(filename)[1].lower()


def validate_image_file(file: UploadFile) -> tuple[bool, str]:
    """Validate image file type and size"""
    # Check file extension
    ext = get_file_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type {ext} not allowed. Accepted: {', '.join(ALLOWED_EXTENSIONS)}"
    
    # File size will be checked during upload
    return True, ""


def generate_unique_filename(original_filename: str, patient_id: str) -> str:
    """Generate unique filename to avoid conflicts"""
    ext = get_file_extension(original_filename)
    unique_id = uuid.uuid4().hex[:8]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{patient_id}_{timestamp}_{unique_id}{ext}"


def ensure_upload_directory(patient_id: str) -> str:
    """Ensure upload directory exists for patient"""
    # Create directory structure: uploads/images/{patient_id}/
    upload_dir = os.path.join(settings.UPLOAD_DIR, "images", patient_id)
    os.makedirs(upload_dir, exist_ok=True)
    return upload_dir


@router.post("/{patient_id}/upload", response_model=ImageUploadResponse)
async def upload_images(
    patient_id: str,
    images: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    """Upload blood smear images for a patient"""
    
    # Check if patient exists
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    if not images or len(images) == 0:
        raise HTTPException(status_code=400, detail="No images provided")
    
    # Validate all files first
    for image in images:
        valid, error_msg = validate_image_file(image)
        if not valid:
            raise HTTPException(status_code=400, detail=error_msg)
    
    # Ensure upload directory exists
    upload_dir = ensure_upload_directory(patient_id)
    
    uploaded_images = []
    
    try:
        for image in images:
            # Read file content
            content = await image.read()
            file_size = len(content)
            
            # Check file size
            if file_size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File {image.filename} exceeds maximum size of {MAX_FILE_SIZE / (1024 * 1024)}MB"
                )
            
            # Generate unique filename
            unique_filename = generate_unique_filename(image.filename, patient_id)
            filepath = os.path.join(upload_dir, unique_filename)
            
            # Save file
            with open(filepath, "wb") as f:
                f.write(content)
            
            # Get file extension
            file_ext = get_file_extension(image.filename).replace('.', '')
            
            # Create database record
            db_image = Image(
                patient_id=patient_id,
                filename=unique_filename,
                original_filename=image.filename,
                filepath=filepath,
                file_type=file_ext,
                file_size=file_size
            )
            
            db.add(db_image)
            db.flush()  # Get the ID without committing
            
            uploaded_images.append(db_image)
        
        # Commit all images
        db.commit()
        
        # Refresh to get all fields
        for img in uploaded_images:
            db.refresh(img)
        
        return ImageUploadResponse(
            message=f"Successfully uploaded {len(uploaded_images)} image(s)",
            patient_id=patient_id,
            uploaded_count=len(uploaded_images),
            images=[
                {
                    "id": img.id,
                    "patient_id": img.patient_id,
                    "filename": img.filename,
                    "original_filename": img.original_filename,
                    "file_type": img.file_type,
                    "file_size": img.file_size,
                    "uploaded_at": img.uploaded_at
                }
                for img in uploaded_images
            ]
        )
        
    except Exception as e:
        db.rollback()
        # Clean up files if database operation fails
        for img in uploaded_images:
            try:
                if os.path.exists(img.filepath):
                    os.remove(img.filepath)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/{patient_id}/images")
async def get_patient_images(patient_id: str, db: Session = Depends(get_db)):
    """Get all images for a patient"""
    
    # Check if patient exists
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    
    # Get all images
    images = db.query(Image).filter(Image.patient_id == patient_id).all()
    
    return {
        "patient_id": patient_id,
        "image_count": len(images),
        "images": [
            {
                "id": img.id,
                "filename": img.filename,
                "original_filename": img.original_filename,
                "file_type": img.file_type,
                "file_size": img.file_size,
                "uploaded_at": img.uploaded_at
            }
            for img in images
        ]
    }


@router.delete("/{patient_id}/images/{image_id}")
async def delete_image(
    patient_id: str,
    image_id: int,
    db: Session = Depends(get_db)
):
    """Delete a specific image"""
    
    # Find image
    image = db.query(Image).filter(
        Image.id == image_id,
        Image.patient_id == patient_id
    ).first()
    
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Delete file from filesystem
    try:
        if os.path.exists(image.filepath):
            os.remove(image.filepath)
    except Exception as e:
        print(f"Error deleting file: {e}")
    
    # Delete from database
    db.delete(image)
    db.commit()
    
    return {
        "message": "Image deleted successfully",
        "image_id": image_id,
        "patient_id": patient_id
    }