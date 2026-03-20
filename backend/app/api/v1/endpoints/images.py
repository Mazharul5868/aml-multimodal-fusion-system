import os
import uuid
from datetime import datetime
from typing import List

import cloudinary
import cloudinary.uploader
from app.core.config import settings
from app.db.database import get_db
from app.models.patient import Image, Patient
from app.schemas import ImageUploadResponse
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

router = APIRouter()

ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.tif', '.tiff'}
MAX_FILE_SIZE = 50 * 1024 * 1024

# Configure Cloudinary
cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
)

def get_file_extension(filename: str) -> str:
    return os.path.splitext(filename)[1].lower()

def validate_image_file(file: UploadFile) -> tuple[bool, str]:
    ext = get_file_extension(file.filename)
    if ext not in ALLOWED_EXTENSIONS:
        return False, f"File type {ext} not allowed."
    return True, ""

def generate_unique_filename(original_filename: str, patient_id: str) -> str:
    ext = get_file_extension(original_filename)
    unique_id = uuid.uuid4().hex[:8]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{patient_id}_{timestamp}_{unique_id}{ext}"


@router.post("/{patient_id}/upload", response_model=ImageUploadResponse)
async def upload_images(
    patient_id: str,
    images: List[UploadFile] = File(...),
    db: Session = Depends(get_db)
):
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if not images:
        raise HTTPException(status_code=400, detail="No images provided")

    for image in images:
        valid, error_msg = validate_image_file(image)
        if not valid:
            raise HTTPException(status_code=400, detail=error_msg)

    uploaded_images = []

    try:
        for image in images:
            content = await image.read()
            file_size = len(content)

            if file_size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=400,
                    detail=f"File {image.filename} exceeds 50MB limit"
                )

            unique_filename = generate_unique_filename(image.filename, patient_id)
            ext = get_file_extension(image.filename)

            # Upload to Cloudinary
            upload_result = cloudinary.uploader.upload(
                content,
                folder=f"aml/{patient_id}",
                public_id=unique_filename.replace(ext, ''),
                resource_type="raw",
            )

            filepath = upload_result["secure_url"]

            db_image = Image(
                patient_id=patient_id,
                filename=unique_filename,
                original_filename=image.filename,
                filepath=filepath,
                file_type=ext.replace('.', ''),
                file_size=file_size
            )

            db.add(db_image)
            db.flush()
            uploaded_images.append(db_image)

        db.commit()

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
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@router.get("/{patient_id}/images")
async def get_patient_images(patient_id: str, db: Session = Depends(get_db)):
    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

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
    image = db.query(Image).filter(
        Image.id == image_id,
        Image.patient_id == patient_id
    ).first()

    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete from Cloudinary
    try:
        public_id = f"aml/{patient_id}/{image.filename.rsplit('.', 1)[0]}"
        cloudinary.uploader.destroy(public_id, resource_type="raw")
    except Exception as e:
        print(f"Cloudinary delete failed: {e}")

    db.delete(image)
    db.commit()

    return {"message": "Image deleted successfully", "image_id": image_id}