# AML Multimodal Fusion System

A full-stack clinical decision support application for Acute Myeloid Leukaemia (AML) detection and subtype classification using peripheral blood smear morphology and haematological data.

## Live Demo

**Application:** [aml-multimodal-fusion-system.vercel.app](https://aml-multimodal-fusion-system.vercel.app)  
**API:** [aml-backend-hbnu.onrender.com/api/v1/docs](https://aml-backend-hbnu.onrender.com/api/v1/docs)

> Hosted on Render free tier — first request may take ~30 seconds to wake.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts |
| Backend | FastAPI, Python 3.11, Docker |
| Database | MySQL — Aiven Cloud |
| ML Model | LightGBM GBDT (multiclass fusion) |
| Explainability | SHAP TreeExplainer |
| Image Processing | OpenCV |
| Model Hosting | Hugging Face Hub |

---

## How It Works

1. Clinician registers a patient and submits haematological differential count data
2. Peripheral blood smear images are uploaded for morphological analysis
3. Features are extracted per image (Otsu, Sobel, Canny) and aggregated to patient level
4. A LightGBM fusion model classifies the patient as Healthy or one of four AML subtypes
5. Results are presented with confidence scores, class probability distribution, and SHAP feature explanations

---

## Disclaimer

This system is a research prototype intended for decision support only. It does not constitute a clinical diagnosis and must be reviewed alongside clinical and pathological assessment.