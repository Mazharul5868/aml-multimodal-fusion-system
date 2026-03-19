import json
import time
from pathlib import Path
from typing import Any, Dict, List

import cv2
import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.patient import AnalysisResult, CBCData, Image, Patient

router = APIRouter()

# -------------------------------------------------------------------
# Model + artifact loading
# -------------------------------------------------------------------

FUSION_MODEL_PATH = Path("ml_models/lgbm_gbdt_fusion.pkl")
FUSION_COLUMNS_PATH = Path("ml_models/fusion_columns.pkl")
LABEL_ENCODER_PATH = Path("ml_models/label_encoder.pkl")
PREPROCESSING_CONFIG_PATH = Path("ml_models/preprocessing_config.json")

FUSION_MODEL = None
FUSION_COLUMNS: List[str] = []
LABEL_ENCODER = None
PREPROCESSING_CONFIG: Dict[str, Any] = {}
FUSION_EXPLAINER = None

try:
    FUSION_MODEL = joblib.load(FUSION_MODEL_PATH)
    FUSION_COLUMNS = joblib.load(FUSION_COLUMNS_PATH)
    LABEL_ENCODER = joblib.load(LABEL_ENCODER_PATH)

    with open(PREPROCESSING_CONFIG_PATH, "r", encoding="utf-8") as f:
        PREPROCESSING_CONFIG = json.load(f)

    print("✅ Fusion model loaded")
    print("   Classes       :", list(LABEL_ENCODER.classes_))
    print("   Feature count :", len(FUSION_COLUMNS))

except Exception as e:
    print(f"⚠️  Failed to load fusion model/artifacts: {e}")
    FUSION_MODEL = None

try:
    if FUSION_MODEL is not None:
        FUSION_EXPLAINER = shap.TreeExplainer(FUSION_MODEL)
        print("✅ Fusion SHAP explainer loaded")
except Exception as e:
    print(f"⚠️  Failed to create fusion SHAP explainer: {e}")
    FUSION_EXPLAINER = None

# -------------------------------------------------------------------
# Image feature extraction 
# -------------------------------------------------------------------

def otsu_mask_from_gray(gray, blur_ksize=5):
    if blur_ksize % 2 == 0:
        blur_ksize += 1
    blurred = cv2.GaussianBlur(gray, (blur_ksize, blur_ksize), 0)
    _, mask = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    fg_frac = (mask > 0).mean()
    if fg_frac > 0.5:
        mask = cv2.bitwise_not(mask)
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=1)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=8)
    if num_labels > 1:
        largest_label = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])
        mask = np.where(labels == largest_label, 255, 0).astype(np.uint8)
    return mask


def mask_uint8_255(mask: np.ndarray) -> np.ndarray:
    if mask is None:
        raise ValueError("Mask cannot be None")
    if mask.dtype != np.uint8:
        mask = mask.astype(np.uint8)
    if mask.max() == 1:
        mask = (mask * 255).astype(np.uint8)
    return np.where(mask > 0, 255, 0).astype(np.uint8)


def ring_from_mask(mask_255: np.ndarray, ring_width: int = 2) -> np.ndarray:
    ring_width = int(max(1, ring_width))
    kernel = np.ones((3, 3), np.uint8)
    dilated = cv2.dilate(mask_255, kernel, iterations=ring_width)
    eroded = cv2.erode(mask_255, kernel, iterations=ring_width)
    ring = cv2.subtract(dilated, eroded)
    return np.where(ring > 0, 255, 0).astype(np.uint8)


def cell_area_ratio(mask):
    return np.sum(mask == 255) / mask.size


def extract_shape_features_from_mask(mask):
    if mask is None or mask.size == 0:
        return None
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    cnt = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(cnt))
    perimeter = float(cv2.arcLength(cnt, True))
    circularity = float(4 * np.pi * area / (perimeter ** 2)) if perimeter > 0 else np.nan
    hull = cv2.convexHull(cnt)
    hull_area = float(cv2.contourArea(hull))
    solidity = float(area / hull_area) if hull_area > 0 else np.nan
    eccentricity = np.nan
    if len(cnt) >= 5:
        (_, _), (MA, ma), _ = cv2.fitEllipse(cnt)
        major, minor = max(MA, ma), min(MA, ma)
        if major > 0:
            eccentricity = float(np.sqrt(1 - (minor / major) ** 2))
    return {
        "otsu_cell_area_ratio": float(cell_area_ratio(mask)),
        "otsu_area_px": area,
        "otsu_perimeter_px": perimeter,
        "otsu_circularity": circularity,
        "otsu_solidity": solidity,
        "otsu_eccentricity": eccentricity,
        "otsu_num_components": int(cv2.connectedComponents(mask)[0] - 1),
    }


def sobel_roi_features(
    gray, cell_mask, blur_ksize=3, sobel_ksize=3,
    ring_width=2, compute_edges=True, edge_threshold_method="otsu"
):
    mask = mask_uint8_255(cell_mask)
    roi = mask > 0
    roi_area = int(roi.sum())
    if roi_area < 30:
        return None
    blur_ksize = int(blur_ksize)
    if blur_ksize % 2 == 0:
        blur_ksize += 1
    gray_blur = cv2.GaussianBlur(gray, (blur_ksize, blur_ksize), 0) if blur_ksize > 1 else gray
    if sobel_ksize not in (1, 3, 5, 7):
        raise ValueError("Sobel kernel size must be 1, 3, 5, or 7")
    gx = cv2.Sobel(gray_blur, cv2.CV_32F, 1, 0, ksize=sobel_ksize)
    gy = cv2.Sobel(gray_blur, cv2.CV_32F, 0, 1, ksize=sobel_ksize)
    mag = cv2.magnitude(gx, gy)
    vals = mag[roi]
    vals = vals[np.isfinite(vals)]
    if vals.size == 0:
        return None
    feats = {
        "sobel_mean": float(np.mean(vals)),
        "sobel_std": float(np.std(vals)),
        "sobel_median": float(np.median(vals)),
        "sobel_p75": float(np.percentile(vals, 75)),
        "sobel_p90": float(np.percentile(vals, 90)),
        "sobel_p95": float(np.percentile(vals, 95)),
        "sobel_max": float(np.max(vals)),
    }
    ring = (ring_from_mask(mask, ring_width=ring_width) > 0) & roi
    interior = roi & (~ring)
    if ring.sum() >= 10:
        rv = mag[ring]; rv = rv[np.isfinite(rv)]
        feats["sobel_ring_mean"] = float(np.mean(rv)) if rv.size > 0 else np.nan
        feats["sobel_ring_p95"] = float(np.percentile(rv, 95)) if rv.size > 0 else np.nan
    else:
        feats["sobel_ring_mean"] = np.nan
        feats["sobel_ring_p95"] = np.nan
    if interior.sum() >= 10:
        iv = mag[interior]; iv = iv[np.isfinite(iv)]
        feats["sobel_interior_mean"] = float(np.mean(iv)) if iv.size > 0 else np.nan
        feats["sobel_interior_p95"] = float(np.percentile(iv, 95)) if iv.size > 0 else np.nan
    else:
        feats["sobel_interior_mean"] = np.nan
        feats["sobel_interior_p95"] = np.nan
    if np.isfinite(feats["sobel_ring_mean"]) and np.isfinite(feats["sobel_interior_mean"]):
        feats["sobel_ring_minus_interior"] = float(feats["sobel_ring_mean"] - feats["sobel_interior_mean"])
        feats["sobel_ring_over_interior"] = float(feats["sobel_ring_mean"] / (feats["sobel_interior_mean"] + 1e-6))
    else:
        feats["sobel_ring_minus_interior"] = np.nan
        feats["sobel_ring_over_interior"] = np.nan
    if compute_edges:
        mag_u8 = cv2.normalize(mag, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
        _, edge_map = cv2.threshold(mag_u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        edge_roi = np.zeros_like(edge_map)
        edge_roi[roi] = edge_map[roi]
        edge_pixels = int((edge_roi > 0).sum())
        feats["sobel_edge_pixels"] = edge_pixels
        feats["sobel_edge_density"] = float(edge_pixels / roi_area)
        nl, _, _, _ = cv2.connectedComponentsWithStats((edge_roi > 0).astype(np.uint8), connectivity=8)
        feats["sobel_edge_components"] = int(max(0, nl - 1))
    return feats


def canny_roi_features(gray, cell_mask, low_thresh=50, high_thresh=150, ring_width=2):
    mask = mask_uint8_255(cell_mask)
    roi = mask > 0
    roi_area = int(roi.sum())
    if roi_area < 30:
        return None
    edges = cv2.Canny(gray, low_thresh, high_thresh)
    edge_roi = np.zeros_like(edges)
    edge_roi[roi] = edges[roi]
    edge_pixels = int((edge_roi > 0).sum())
    edge_density = float(edge_pixels / roi_area)
    nl, _, _, _ = cv2.connectedComponentsWithStats((edge_roi > 0).astype(np.uint8), connectivity=8)
    edge_components = int(max(0, nl - 1))
    feats = {
        "canny_edge_pixels": edge_pixels,
        "canny_edge_density": edge_density,
        "canny_edge_components": edge_components,
    }
    ring = (ring_from_mask(mask, ring_width=ring_width) > 0) & roi
    interior = roi & (~ring)
    feats["canny_ring_density"] = float((edge_roi[ring] > 0).sum() / ring.sum()) if ring.sum() > 0 else np.nan
    feats["canny_interior_density"] = float((edge_roi[interior] > 0).sum() / interior.sum()) if interior.sum() > 0 else np.nan
    if np.isfinite(feats["canny_ring_density"]) and np.isfinite(feats["canny_interior_density"]):
        feats["canny_ring_minus_interior"] = feats["canny_ring_density"] - feats["canny_interior_density"]
    else:
        feats["canny_ring_minus_interior"] = np.nan
    feats["canny_low_thresh"] = low_thresh
    feats["canny_high_thresh"] = high_thresh
    return feats


def extract_morphology_features_from_image(image_path: str) -> Dict[str, float]:
    gray = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise ValueError(f"Could not load image: {image_path}")
    mask = otsu_mask_from_gray(gray)
    shape_feats = extract_shape_features_from_mask(mask)
    if shape_feats is None:
        raise ValueError(f"Could not extract shape features: {image_path}")
    sobel_feats = sobel_roi_features(gray, mask, blur_ksize=3, sobel_ksize=3,
                                     ring_width=2, compute_edges=True,
                                     edge_threshold_method="otsu")
    if sobel_feats is None:
        raise ValueError(f"Could not extract sobel features: {image_path}")
    canny_feats = canny_roi_features(gray, mask, low_thresh=50, high_thresh=150, ring_width=2)
    if canny_feats is None:
        raise ValueError(f"Could not extract canny features: {image_path}")
    return {**shape_feats, **sobel_feats, **canny_feats}


def aggregate_patient_features(per_image_features: List[Dict[str, float]]) -> Dict[str, float]:
    """
    Aggregate per-image features to patient level using the median,
    matching the patient-level aggregation used during model training.
    """
    if not per_image_features:
        raise ValueError("No valid per-image features to aggregate.")
    all_keys = sorted(set().union(*[d.keys() for d in per_image_features]))
    aggregated = {}
    for key in all_keys:
        vals = [
            float(d[key])
            for d in per_image_features
            if key in d and isinstance(d[key], (int, float, np.integer, np.floating))
            and np.isfinite(d[key])
        ]
        aggregated[key] = float(np.median(vals)) if vals else 0.0
    return aggregated


def get_patient_image_paths(db: Session, patient_id: str) -> List[str]:
    images = (
        db.query(Image)
        .filter(Image.patient_id == patient_id)
        .order_by(Image.uploaded_at.asc())
        .all()
    )
    return [img.filepath for img in images if img.filepath]


def get_patient_morphology_features(db: Session, patient_id: str) -> Dict[str, float]:
    image_paths = get_patient_image_paths(db, patient_id)
    if not image_paths:
        raise ValueError(f"No images found for patient {patient_id}")
    per_image_features, failures = [], []
    for image_path in image_paths:
        try:
            per_image_features.append(extract_morphology_features_from_image(image_path))
        except Exception as e:
            failures.append({"image_path": image_path, "error": str(e)})
    if not per_image_features:
        raise ValueError(
            f"All image feature extraction failed for patient {patient_id}. Failures: {failures}"
        )
    return {k: float(v) for k, v in aggregate_patient_features(per_image_features).items()}


# -------------------------------------------------------------------
# Feature preparation for the fusion model
# -------------------------------------------------------------------

def prepare_fusion_features(
    patient: Patient,
    cbc_data: CBCData,
    morphology_features: Dict[str, float],
    fusion_columns: List[str],
) -> pd.DataFrame:
    """
    Build the feature DataFrame expected by lgbm_gbdt_fusion.
    Includes missing-indicator columns and applies the same
    preprocessing used during training (inf → NaN → 0).
    """
    sex_encoded = 2 if patient.sex == "M" else 1

    # Missing indicators — computed before any imputation
    leucocytes_missing = 1 if cbc_data.leucocytes_per_ul is None else 0
    lymph_neopl_missing = 1 if cbc_data.pb_lymph_atyp_neopl is None else 0

    feature_map = {
        # Demographics
        "sex_1f_2m": sex_encoded,
        "age": patient.age,
        # Haematology
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
        # Missing indicators
        "leucocytes_per_ul_missing": leucocytes_missing,
        "pb_lymph_atyp_neopl_missing": lymph_neopl_missing,
        # Image-derived features (otsu, sobel, canny)
        **morphology_features,
    }

    missing_cols = [f for f in fusion_columns if f not in feature_map]
    if missing_cols:
        raise ValueError(f"Missing required features for fusion model: {missing_cols}")

    X = pd.DataFrame(
        [[feature_map.get(f) for f in fusion_columns]],
        columns=fusion_columns,
    ).astype("float32")

    # Preprocessing — matches training: replace inf → NaN → 0
    X = X.replace([np.inf, -np.inf], np.nan).fillna(0)

    return X


# -------------------------------------------------------------------
# Prediction
# -------------------------------------------------------------------

def run_fusion_prediction(X: pd.DataFrame) -> Dict[str, Any]:
    """
    Run a single multiclass prediction.
    Maps 'control' → Control, any AML subtype → AML + subtype label.
    """
    proba = FUSION_MODEL.predict_proba(X)[0]
    classes = list(LABEL_ENCODER.classes_)  # sorted alphabetically by LabelEncoder

    pred_idx = int(np.argmax(proba))
    predicted_class = classes[pred_idx]

    control_idx = classes.index("control")
    control_prob = float(proba[control_idx])
    aml_prob = round(1.0 - control_prob, 6)

    subtype_probs = {
        cls: float(proba[i])
        for i, cls in enumerate(classes)
        if cls != "control"
    }

    if predicted_class == "control":
        prediction = "Control"
        confidence = control_prob
        subtype_prediction = None
        subtype_confidence = None
    else:
        prediction = "AML"
        confidence = float(proba[pred_idx])
        subtype_prediction = predicted_class
        subtype_confidence = confidence

    return {
        "prediction": prediction,
        "confidence": confidence,
        "probabilities": {"control": control_prob, "aml": aml_prob},
        "subtype_prediction": subtype_prediction,
        "subtype_confidence": subtype_confidence,
        "subtype_probabilities": subtype_probs,
        "pred_idx": pred_idx,
    }


# -------------------------------------------------------------------
# Explainability
# -------------------------------------------------------------------

def build_feature_importance_list(feature_names, feature_values, shap_values, top_k=10):
    rows = [
        {
            "feature": name,
            "value": float(value) if value is not None and np.isfinite(float(value)) else None,
            "shap_value": float(shap_val),
            "abs_shap_value": float(abs(shap_val)),
            "direction": "increases_risk" if shap_val > 0 else "decreases_risk",
        }
        for name, value, shap_val in zip(feature_names, feature_values, shap_values)
    ]
    rows.sort(key=lambda x: x["abs_shap_value"], reverse=True)
    return rows[:top_k]


def explain_fusion_prediction(X: pd.DataFrame, pred_idx: int) -> Dict[str, Any] | None:
    """
    Compute SHAP values for the predicted class from the multiclass fusion model.
    Returns a single explanation used as binary_explanation in the response.
    """
    if FUSION_EXPLAINER is None:
        return None
    try:
        raw_shap = FUSION_EXPLAINER.shap_values(X)

        if isinstance(raw_shap, list):
            # list of (n_samples, n_features) — one per class
            class_shap = np.asarray(raw_shap[pred_idx])[0]
        else:
            sv = np.asarray(raw_shap)
            if sv.ndim == 3:
                # (n_samples, n_features, n_classes)
                class_shap = sv[0, :, pred_idx]
            elif sv.ndim == 2:
                class_shap = sv[0]
            else:
                return None

        top_features = build_feature_importance_list(
            feature_names=X.columns.tolist(),
            feature_values=X.iloc[0].tolist(),
            shap_values=class_shap,
            top_k=10,
        )

        base_value = None
        try:
            ev = FUSION_EXPLAINER.expected_value
            if isinstance(ev, (list, np.ndarray)):
                base_value = float(ev[pred_idx])
            else:
                base_value = float(ev)
        except Exception:
            pass

        return {
            "model": "lgbm_fusion_multiclass",
            "base_value": base_value,
            "top_features": top_features,
        }
    except Exception as e:
        print(f"⚠️  SHAP explanation failed: {e}")
        return None


# -------------------------------------------------------------------
# Endpoint
# -------------------------------------------------------------------

@router.post("/{patient_id}/analyse-aml")
async def analyse_aml(patient_id: str, db: Session = Depends(get_db)):

    if FUSION_MODEL is None or not FUSION_COLUMNS or LABEL_ENCODER is None:
        raise HTTPException(status_code=500, detail="Fusion model or artifacts not loaded.")

    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    cbc_data = db.query(CBCData).filter(CBCData.patient_id == patient_id).first()
    if not cbc_data:
        raise HTTPException(
            status_code=400,
            detail="Haematology data not found. Please enter haematology data first."
        )

    start_time = time.time()

    try:
        image_paths = get_patient_image_paths(db, patient_id)
        morphology_features = get_patient_morphology_features(db, patient_id)

        X = prepare_fusion_features(
            patient=patient,
            cbc_data=cbc_data,
            morphology_features=morphology_features,
            fusion_columns=FUSION_COLUMNS,
        )

        result = run_fusion_prediction(X)

        # Single explanation for the predicted class
        explanation = explain_fusion_prediction(X, result["pred_idx"])

        processing_time = time.time() - start_time

        # --- Persist ---
        feature_payload = {
            "model": "lgbm_gbdt_fusion_v2.0",
            "prediction_probabilities": result["probabilities"],
            "subtype_result": {
                "predicted_subtype": result["subtype_prediction"],
                "subtype_confidence": result["subtype_confidence"],
                "subtype_probabilities": result["subtype_probabilities"],
            } if result["subtype_prediction"] else None,
            "explainability": {
                "binary": explanation,
                "subtype": None,   # single model — one explanation only
            },
            "fusion_features_used": FUSION_COLUMNS,
            "input_values": X.iloc[0].to_dict(),
        }

        existing = db.query(AnalysisResult).filter(
            AnalysisResult.patient_id == patient_id
        ).first()

        if existing:
            existing.prediction = result["prediction"]
            existing.confidence = result["confidence"]
            existing.cbc_features = json.dumps(feature_payload)
            existing.images_analyzed = len(image_paths)
            existing.processing_time_seconds = processing_time
            existing.model_version = "lgbm_gbdt_fusion_v2.0"
            db_analysis = existing
        else:
            db_analysis = AnalysisResult(
                patient_id=patient_id,
                prediction=result["prediction"],
                confidence=result["confidence"],
                cbc_features=json.dumps(feature_payload),
                morphological_features=None,
                hue_features=None,
                images_analyzed=len(image_paths),
                processing_time_seconds=processing_time,
                model_version="lgbm_gbdt_fusion_v2.0",
            )
            db.add(db_analysis)

        db.commit()
        db.refresh(db_analysis)

        return {
            "message": "AML analysis completed successfully",
            "patient_id": patient_id,
            "prediction": result["prediction"],
            "confidence": result["confidence"],
            "probabilities": result["probabilities"],
            "subtype_prediction": result["subtype_prediction"],
            "subtype_confidence": result["subtype_confidence"],
            "subtype_probabilities": result["subtype_probabilities"],
            "explainability": {
                "binary": explanation,
                "subtype": None,
            },
            "processing_time_seconds": processing_time,
            "model_version": "lgbm_gbdt_fusion_v2.0",
            "analyzed_at": db_analysis.analyzed_at.isoformat(),
        }

    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")