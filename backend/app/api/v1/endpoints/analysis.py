
import json
import pickle
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

BINARY_MODEL_PATH = Path("ml_models/aml_lgbm_binary.pkl")
BINARY_ARTIFACT_PATH = Path("ml_models/aml_lgbm_binary_artifact.json")
TRAIN_MEDIANS_PATH = Path("ml_models/train_medians.pkl")
SUBTYPE_MODEL_PATH = Path("ml_models/lightgbm_model.pkl")
SUBTYPE_FEATURE_COLUMNS_PATH = Path("ml_models/lightgbm_feature_columns.json")
SUBTYPE_ID2LABEL_PATH = Path("ml_models/lightgbm_id2label.json")

AML_BINARY_MODEL = None
AML_BINARY_ARTIFACT: Dict[str, Any] | None = None
TRAIN_MEDIANS = None
AML_SUBTYPE_MODEL = None
AML_SUBTYPE_FEATURES = None
AML_SUBTYPE_ID2LABEL = None

AML_BINARY_EXPLAINER = None
AML_SUBTYPE_EXPLAINER = None

# -------------------- Binary --------------------
try:
    AML_BINARY_MODEL = joblib.load(BINARY_MODEL_PATH)

    with open(BINARY_ARTIFACT_PATH, "r", encoding="utf-8") as f:
        AML_BINARY_ARTIFACT = json.load(f)

    print("✅ AML binary LightGBM model loaded")
    print("Model type:", type(AML_BINARY_MODEL))
    print("Feature count:", len(AML_BINARY_ARTIFACT["features"]))

except Exception as e:
    print(f"⚠️ Failed to load AML binary model/artifact: {e}")
    AML_BINARY_MODEL = None
    AML_BINARY_ARTIFACT = None

try:
    AML_BINARY_EXPLAINER = shap.TreeExplainer(AML_BINARY_MODEL)
    print("✅ AML binary SHAP explainer loaded")
except Exception as e:
    print(f"⚠️ Failed to create binary SHAP explainer: {e}")
    AML_BINARY_EXPLAINER = None

# -------------------- Subtype --------------------
try:
    AML_SUBTYPE_MODEL = joblib.load(SUBTYPE_MODEL_PATH)

    with open(SUBTYPE_FEATURE_COLUMNS_PATH, "r", encoding="utf-8") as f:
        AML_SUBTYPE_FEATURES = json.load(f)

    with open(SUBTYPE_ID2LABEL_PATH, "r", encoding="utf-8") as f:
        AML_SUBTYPE_ID2LABEL = json.load(f)

    AML_SUBTYPE_ID2LABEL = {int(k): v for k, v in AML_SUBTYPE_ID2LABEL.items()}

    print("✅ AML subtype LightGBM model loaded")
    print("Subtype model type:", type(AML_SUBTYPE_MODEL))
    print("Subtype feature count:", len(AML_SUBTYPE_FEATURES))
    print("Subtype labels:", AML_SUBTYPE_ID2LABEL)

except Exception as e:
    print(f"⚠️ Failed to load AML subtype model/artifacts: {e}")
    AML_SUBTYPE_MODEL = None
    AML_SUBTYPE_FEATURES = None
    AML_SUBTYPE_ID2LABEL = None

try:
    AML_SUBTYPE_EXPLAINER = shap.TreeExplainer(AML_SUBTYPE_MODEL)
    print("✅ AML subtype SHAP explainer loaded")
except Exception as e:
    print(f"⚠️ Failed to create subtype SHAP explainer: {e}")
    AML_SUBTYPE_EXPLAINER = None

try:
    with open(TRAIN_MEDIANS_PATH, "rb") as f:
        TRAIN_MEDIANS = pickle.load(f)
    print("✅ Training medians loaded")
except Exception as e:
    print(f"⚠️ Failed to load training medians: {e}")
    TRAIN_MEDIANS = None

# -------------------------------------------------------------------
# EXACT feature functions from training
# -------------------------------------------------------------------

def otsu_mask_from_gray(gray, blur_ksize=5):
    if blur_ksize % 2 == 0:
        blur_ksize += 1

    blurred = cv2.GaussianBlur(gray, (blur_ksize, blur_ksize), 0)

    _, mask = cv2.threshold(
        blurred, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
    )

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


def otsu_mask(image_path, blur_ksize=5):
    gray = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    if gray is None:
        raise ValueError(f"Could not load image: {image_path}")
    return otsu_mask_from_gray(gray, blur_ksize)


def mask_uint8_255(mask: np.ndarray) -> np.ndarray:
    if mask is None:
        raise ValueError("Mask cannot be None")
    if mask.dtype != np.uint8:
        mask = mask.astype(np.uint8)
    if mask.max() == 1:
        mask = (mask * 255).astype(np.uint8)

    mask = np.where(mask > 0, 255, 0).astype(np.uint8)
    return mask


def ring_from_mask(mask_255: np.ndarray, ring_width: int = 2) -> np.ndarray:
    ring_width = int(max(1, ring_width))
    kernel = np.ones((3, 3), np.uint8)
    dilated = cv2.dilate(mask_255, kernel, iterations=ring_width)
    eroded = cv2.erode(mask_255, kernel, iterations=ring_width)
    ring = cv2.subtract(dilated, eroded)
    ring = np.where(ring > 0, 255, 0).astype(np.uint8)
    return ring


def cell_area_ratio(mask):
    return np.sum(mask == 255) / mask.size


def extract_shape_features_from_mask(mask):
    if mask is None or mask.size == 0:
        return None

    num_components = cv2.connectedComponents(mask)[0] - 1

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None

    cnt = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(cnt))
    perimeter = float(cv2.arcLength(cnt, True))

    circularity = np.nan
    if perimeter > 0:
        circularity = float(4 * np.pi * area / (perimeter ** 2))

    hull = cv2.convexHull(cnt)
    hull_area = float(cv2.contourArea(hull))
    solidity = float(area / hull_area) if hull_area > 0 else np.nan

    eccentricity = np.nan
    if len(cnt) >= 5:
        (_, _), (MA, ma), _ = cv2.fitEllipse(cnt)
        major = max(MA, ma)
        minor = min(MA, ma)
        if major > 0:
            eccentricity = float(np.sqrt(1 - (minor / major) ** 2))

    return {
        "otsu_cell_area_ratio": float(cell_area_ratio(mask)),
        "otsu_area_px": area,
        "otsu_perimeter_px": perimeter,
        "otsu_circularity": circularity,
        "otsu_solidity": solidity,
        "otsu_eccentricity": eccentricity,
        "otsu_num_components": num_components,
    }


def sobel_roi_features(
    gray: np.ndarray,
    cell_mask: np.ndarray,
    blur_ksize: int = 3,
    sobel_ksize: int = 3,
    ring_width: int = 2,
    compute_edges: bool = True,
    edge_threshold_method: str = "otsu",
) -> dict:
    mask = mask_uint8_255(cell_mask)
    roi = mask > 0
    roi_area = int(roi.sum())
    if roi_area < 30:
        return None

    blur_ksize = int(blur_ksize)
    if blur_ksize % 2 == 0:
        blur_ksize += 1
    if blur_ksize > 1:
        gray_blur = cv2.GaussianBlur(gray, (blur_ksize, blur_ksize), 0)
    else:
        gray_blur = gray

    sobel_ksize = int(sobel_ksize)
    if sobel_ksize not in (1, 3, 5, 7):
        raise ValueError("Sobel kernel size must be {1, 3, 5, or 7}")

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
        ring_vals = mag[ring]
        ring_vals = ring_vals[np.isfinite(ring_vals)]
        if ring_vals.size > 0:
            feats["sobel_ring_mean"] = float(np.mean(ring_vals))
            feats["sobel_ring_p95"] = float(np.percentile(ring_vals, 95))
        else:
            feats["sobel_ring_mean"] = np.nan
            feats["sobel_ring_p95"] = np.nan
    else:
        feats["sobel_ring_mean"] = np.nan
        feats["sobel_ring_p95"] = np.nan

    if interior.sum() >= 10:
        interior_vals = mag[interior]
        interior_vals = interior_vals[np.isfinite(interior_vals)]
        if interior_vals.size > 0:
            feats["sobel_interior_mean"] = float(np.mean(interior_vals))
            feats["sobel_interior_p95"] = float(np.percentile(interior_vals, 95))
        else:
            feats["sobel_interior_mean"] = np.nan
            feats["sobel_interior_p95"] = np.nan
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

        if edge_threshold_method == "otsu":
            _, edge_map = cv2.threshold(mag_u8, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        else:
            raise ValueError("edge threshold method must be 'otsu'")

        edge_roi = np.zeros_like(edge_map)
        edge_roi[roi] = edge_map[roi]

        edge_pixels = int((edge_roi > 0).sum())
        feats["sobel_edge_pixels"] = edge_pixels
        feats["sobel_edge_density"] = float(edge_pixels / roi_area)

        num_labels, _, _, _ = cv2.connectedComponentsWithStats(
            (edge_roi > 0).astype(np.uint8), connectivity=8
        )
        feats["sobel_edge_components"] = int(max(0, num_labels - 1))

    return feats


def canny_roi_features(
    gray: np.ndarray,
    cell_mask: np.ndarray,
    low_thresh: int = 50,
    high_thresh: int = 150,
    ring_width: int = 2,
) -> dict:
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

    num_labels, _, _, _ = cv2.connectedComponentsWithStats(
        (edge_roi > 0).astype(np.uint8),
        connectivity=8
    )
    edge_components = int(max(0, num_labels - 1))

    feats = {
        "canny_edge_pixels": edge_pixels,
        "canny_edge_density": edge_density,
        "canny_edge_components": edge_components,
    }

    ring = (ring_from_mask(mask, ring_width=ring_width) > 0) & roi
    interior = roi & (~ring)

    if ring.sum() > 0:
        feats["canny_ring_density"] = float((edge_roi[ring] > 0).sum() / ring.sum())
    else:
        feats["canny_ring_density"] = np.nan

    if interior.sum() > 0:
        feats["canny_interior_density"] = float((edge_roi[interior] > 0).sum() / interior.sum())
    else:
        feats["canny_interior_density"] = np.nan

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
        raise ValueError(f"Could not extract shape features from image: {image_path}")

    sobel_feats = sobel_roi_features(
        gray,
        mask,
        blur_ksize=3,
        sobel_ksize=3,
        ring_width=2,
        compute_edges=True,
        edge_threshold_method="otsu",
    )
    if sobel_feats is None:
        raise ValueError(f"Could not extract sobel features from image: {image_path}")

    canny_feats = canny_roi_features(
        gray,
        mask,
        low_thresh=50,
        high_thresh=150,
        ring_width=2
    )
    if canny_feats is None:
        raise ValueError(f"Could not extract canny features from image: {image_path}")

    return {
        **shape_feats,
        **sobel_feats,
        **canny_feats,
    }


def aggregate_patient_features(per_image_features: List[Dict[str, float]]) -> Dict[str, float]:
    if not per_image_features:
        raise ValueError("No valid per-image features to aggregate.")

    all_keys = sorted(set().union(*[d.keys() for d in per_image_features]))
    aggregated = {}

    for key in all_keys:
        vals = []
        for d in per_image_features:
            if key in d:
                v = d[key]
                if isinstance(v, (int, float, np.integer, np.floating)) and np.isfinite(v):
                    vals.append(float(v))
        aggregated[key] = float(np.mean(vals)) if vals else 0.0

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
    if AML_BINARY_ARTIFACT is None:
        raise ValueError("Model artifact not loaded.")

    image_paths = get_patient_image_paths(db, patient_id)

    if not image_paths:
        raise ValueError(f"No images found for patient {patient_id}")

    per_image_features = []
    failures = []

    for image_path in image_paths:
        try:
            feats = extract_morphology_features_from_image(image_path)
            per_image_features.append(feats)
        except Exception as e:
            failures.append({"image_path": image_path, "error": str(e)})

    if not per_image_features:
        raise ValueError(
            f"All image feature extraction failed for patient {patient_id}. Failures: {failures}"
        )

    aggregated = aggregate_patient_features(per_image_features)

    required_features = AML_BINARY_ARTIFACT["features"]
    missing = [
        f for f in required_features
        if f not in aggregated and not f.startswith(("sex_", "age", "leucocytes_", "pb_"))
    ]
    if missing:
        raise ValueError(f"Missing aggregated morphology features: {missing}")

    return {k: float(v) for k, v in aggregated.items()}


def prepare_binary_features(
    patient: Patient,
    cbc_data: CBCData,
    morphology_features: Dict[str, float],
    artifact: Dict[str, Any],
) -> pd.DataFrame:
    sex_encoded = 2 if patient.sex == "M" else 1

    feature_map = {
        "sex_1f_2m": sex_encoded,
        "age": patient.age,
        "leucocytes_per_ul": cbc_data.leucocytes_per_ul,
        "pb_promyelocyte": cbc_data.pb_promyelocyte,
        "pb_myelocyte": cbc_data.pb_myelocyte,
        "pb_metamyelocyte": cbc_data.pb_metamyelocyte,
        "pb_neutrophil_band": cbc_data.pb_neutrophil_band,
        "pb_eosinophil": cbc_data.pb_eosinophil,
        "pb_basophil": cbc_data.pb_basophil,
        "pb_monocyte": cbc_data.pb_monocyte,
        "pb_lymph_typ": cbc_data.pb_lymph_typ,
        "pb_lymph_atyp_react": cbc_data.pb_lymph_atyp_react,
        "pb_lymph_atyp_neopl": cbc_data.pb_lymph_atyp_neopl,
        "pb_other": cbc_data.pb_other,
        **morphology_features,
    }

    ordered_features = artifact["features"]
    missing = [f for f in ordered_features if f not in feature_map]
    if missing:
        raise ValueError(f"Missing required features for binary model: {missing}")

    X = pd.DataFrame(
        [[feature_map[f] for f in ordered_features]],
        columns=ordered_features
    ).astype("float32")

    median_cols = []
    if TRAIN_MEDIANS is not None:
        median_cols = [c for c in TRAIN_MEDIANS.index if c in X.columns]
        X[median_cols] = X[median_cols].fillna(TRAIN_MEDIANS[median_cols])
        
    return X

def prepare_subtype_features(
    patient: Patient,
    cbc_data: CBCData,
    morphology_features: Dict[str, float],
    feature_columns: List[str],
) -> pd.DataFrame:
    sex_encoded = 2 if patient.sex == "M" else 1

    feature_map = {
        "sex_1f_2m": sex_encoded,
        "age": patient.age,
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
        "pb_total": cbc_data.pb_total,
        **morphology_features,
    }

    missing = [f for f in feature_columns if f not in feature_map]
    if missing:
        raise ValueError(f"Missing required features for subtype model: {missing}")

    X_sub = pd.DataFrame(
        [[feature_map[f] for f in feature_columns]],
        columns=feature_columns
    ).astype("float32")

    median_cols = []
    if TRAIN_MEDIANS is not None:
        median_cols = [c for c in TRAIN_MEDIANS.index if c in X_sub.columns]
        X_sub[median_cols] = X_sub[median_cols].fillna(TRAIN_MEDIANS[median_cols])

    return X_sub

def run_subtype_prediction(X_sub: pd.DataFrame) -> Dict[str, Any]:
    if AML_SUBTYPE_MODEL is None or AML_SUBTYPE_FEATURES is None or AML_SUBTYPE_ID2LABEL is None:
        raise ValueError("Subtype model/artifacts not loaded.")

    # Booster model
    if hasattr(AML_SUBTYPE_MODEL, "predict") and not hasattr(AML_SUBTYPE_MODEL, "predict_proba"):
        proba = AML_SUBTYPE_MODEL.predict(X_sub)
        proba = np.array(proba)

        if proba.ndim == 2:
            proba = proba[0]
        else:
            raise ValueError("Subtype Booster prediction output is not multiclass probabilities.")

    # sklearn wrapper model
    elif hasattr(AML_SUBTYPE_MODEL, "predict_proba"):
        proba = AML_SUBTYPE_MODEL.predict_proba(X_sub)[0]

    else:
        raise ValueError("Unsupported subtype model type.")

    pred_id = int(np.argmax(proba))
    pred_label = AML_SUBTYPE_ID2LABEL[pred_id]

    probabilities = {
        AML_SUBTYPE_ID2LABEL[i]: float(proba[i])
        for i in range(len(proba))
    }

    return {
        "predicted_subtype_id": pred_id,
        "predicted_subtype": pred_label,
        "subtype_probabilities": probabilities,
        "subtype_confidence": float(proba[pred_id]),
    }


def build_feature_importance_list(feature_names, feature_values, shap_values, top_k=10):
    rows = []

    for name, value, shap_val in zip(feature_names, feature_values, shap_values):
        rows.append({
            "feature": name,
            "value": float(value) if value is not None and np.isfinite(value) else None,
            "shap_value": float(shap_val),
            "abs_shap_value": float(abs(shap_val)),
            "direction": "increases_risk" if shap_val > 0 else "decreases_risk"
        })

    rows = sorted(rows, key=lambda x: x["abs_shap_value"], reverse=True)
    return rows[:top_k]


def explain_binary_prediction(X: pd.DataFrame) -> Dict[str, Any] | None:
    if AML_BINARY_EXPLAINER is None:
        return None

    shap_values = AML_BINARY_EXPLAINER.shap_values(X)
    shap_values = np.array(shap_values, dtype=object)

    # Handle different SHAP output formats
    if isinstance(AML_BINARY_EXPLAINER.shap_values(X), list):
        class_1_shap = np.asarray(AML_BINARY_EXPLAINER.shap_values(X)[1])[0]
    else:
        sv = np.asarray(AML_BINARY_EXPLAINER.shap_values(X))
        if sv.ndim == 3:
            # shape: (n_samples, n_features, n_classes)
            class_1_shap = sv[0, :, 1]
        elif sv.ndim == 2:
            # shape: (n_samples, n_features)
            class_1_shap = sv[0]
        else:
            raise ValueError(f"Unexpected binary SHAP shape: {sv.shape}")

    feature_names = X.columns.tolist()
    feature_values = X.iloc[0].tolist()

    top_features = build_feature_importance_list(
        feature_names=feature_names,
        feature_values=feature_values,
        shap_values=class_1_shap,
        top_k=10
    )

    base_value = None
    try:
        expected_value = AML_BINARY_EXPLAINER.expected_value
        if isinstance(expected_value, (list, np.ndarray)):
            if len(expected_value) > 1:
                base_value = float(expected_value[1])
            else:
                base_value = float(expected_value[0])
        else:
            base_value = float(expected_value)
    except Exception:
        base_value = None

    return {
        "model": "binary_aml_vs_control",
        "base_value": base_value,
        "top_features": top_features
    }


def explain_subtype_prediction(X_sub: pd.DataFrame, predicted_subtype_id: int) -> Dict[str, Any] | None:
    if AML_SUBTYPE_EXPLAINER is None:
        return None

    raw_shap_values = AML_SUBTYPE_EXPLAINER.shap_values(X_sub)

    if isinstance(raw_shap_values, list):
        class_shap = np.asarray(raw_shap_values[predicted_subtype_id])[0]
    else:
        sv = np.asarray(raw_shap_values)
        if sv.ndim == 3:
            # shape: (n_samples, n_features, n_classes)
            class_shap = sv[0, :, predicted_subtype_id]
        elif sv.ndim == 2:
            class_shap = sv[0]
        else:
            raise ValueError(f"Unexpected subtype SHAP shape: {sv.shape}")

    feature_names = X_sub.columns.tolist()
    feature_values = X_sub.iloc[0].tolist()

    top_features = build_feature_importance_list(
        feature_names=feature_names,
        feature_values=feature_values,
        shap_values=class_shap,
        top_k=10
    )

    base_value = None
    try:
        expected_value = AML_SUBTYPE_EXPLAINER.expected_value
        if isinstance(expected_value, (list, np.ndarray)):
            base_value = float(expected_value[predicted_subtype_id])
        else:
            base_value = float(expected_value)
    except Exception:
        base_value = None

    return {
        "model": "aml_subtype",
        "base_value": base_value,
        "top_features": top_features
    }


@router.post("/{patient_id}/analyse-aml")
async def analyse_aml(
    patient_id: str,
    db: Session = Depends(get_db)
):
    if AML_BINARY_MODEL is None or AML_BINARY_ARTIFACT is None:
        raise HTTPException(status_code=500, detail="AML binary model/artifact not loaded.")

    patient = db.query(Patient).filter(Patient.patient_id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    cbc_data = db.query(CBCData).filter(CBCData.patient_id == patient_id).first()
    if not cbc_data:
        raise HTTPException(status_code=400, detail="CBC data not found. Please enter CBC data first.")

    start_time = time.time()

    try:
        image_paths = get_patient_image_paths(db, patient_id)
        morphology_features = get_patient_morphology_features(db, patient_id)

        X = prepare_binary_features(
            patient=patient,
            cbc_data=cbc_data,
            morphology_features=morphology_features,
            artifact=AML_BINARY_ARTIFACT,
        )

        threshold = float(AML_BINARY_ARTIFACT.get("threshold", 0.5))

        proba = AML_BINARY_MODEL.predict_proba(X)[0]
        aml_probability = float(proba[1])
        control_probability = float(proba[0])

        pred_class = int(aml_probability >= threshold)
        predicted_label = "AML" if pred_class == 1 else "Control"
        confidence = aml_probability if pred_class == 1 else control_probability

        binary_explanation = explain_binary_prediction(X)

        subtype_result = None
        subtype_explanation = None

        if predicted_label == "AML":
            X_sub = prepare_subtype_features(
                patient=patient,
                cbc_data=cbc_data,
                morphology_features=morphology_features,
                feature_columns=AML_SUBTYPE_FEATURES,
            )

            subtype_result = run_subtype_prediction(X_sub)
            subtype_explanation = explain_subtype_prediction(
                X_sub,
                subtype_result["predicted_subtype_id"]
            )
        else:
            subtype_explanation = None

        processing_time = time.time() - start_time

        feature_payload = {
            "task": AML_BINARY_ARTIFACT.get("task"),
            "threshold": threshold,
            "prediction_probabilities": {
                "control": control_probability,
                "aml": aml_probability,
            },
            "binary_features_used": AML_BINARY_ARTIFACT["features"],
            "input_values": X.iloc[0].to_dict(),
            "subtype_result": subtype_result,
            "explainability": {
                "binary": binary_explanation,
                "subtype": subtype_explanation,
            }
        }

        feature_json = json.dumps(feature_payload)

        existing_analysis = db.query(AnalysisResult).filter(
            AnalysisResult.patient_id == patient_id
        ).first()

        if existing_analysis:
            existing_analysis.prediction = predicted_label
            existing_analysis.confidence = confidence
            existing_analysis.cbc_features = feature_json
            existing_analysis.images_analyzed = len(image_paths)
            existing_analysis.processing_time_seconds = processing_time
            existing_analysis.model_version = "aml_binary_plus_subtype_v1.0"
            db_analysis = existing_analysis
        else:
            db_analysis = AnalysisResult(
                patient_id=patient_id,
                prediction=predicted_label,
                confidence=confidence,
                cbc_features=feature_json,
                morphological_features=None,
                hue_features=None,
                images_analyzed=len(image_paths),
                processing_time_seconds=processing_time,
                model_version="aml_binary_plus_subtype_v1.0"
            )
            db.add(db_analysis)

        db.commit()
        db.refresh(db_analysis)

        return {
        "message": "AML analysis completed successfully",
        "patient_id": patient_id,
        "prediction": predicted_label,
        "confidence": confidence,
        "threshold": threshold,
        "probabilities": {
            "control": control_probability,
            "aml": aml_probability,
        },
        "subtype_prediction": subtype_result["predicted_subtype"] if subtype_result else None,
        "subtype_confidence": subtype_result["subtype_confidence"] if subtype_result else None,
        "subtype_probabilities": subtype_result["subtype_probabilities"] if subtype_result else None,
        "explainability": {
            "binary": binary_explanation,
            "subtype": subtype_explanation,
        },
        "processing_time_seconds": processing_time,
        "model_version": "aml_binary_plus_subtype_v1.0",
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