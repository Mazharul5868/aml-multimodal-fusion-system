<<<<<<< HEAD
# aml-multimodal-fusion-system
=======
# Multimodal Fusion System for Acute Myeloid Leukaemia (AML) Detection

A full-stack machine learning project for automated Acute Myeloid Leukaemia (AML) detection and subtype classification using peripheral blood smear image-derived features and patient-level haematological data.

## Project Overview

Acute Myeloid Leukaemia (AML) is a fast-progressing blood cancer that requires early and accurate diagnosis. In clinical practice, diagnosis often depends on manual microscopic examination of blood smears together with interpretation of haematological measurements. Although effective, this process can be time-consuming, subjective, and difficult to scale.

This project addresses that problem by developing a multimodal fusion system that combines two complementary sources of information:

- cytomorphological features extracted from microscopic blood smear images
- structured patient-level haematological variables

By integrating both modalities within a unified predictive framework, the system aims to support more robust and clinically meaningful AML detection and subtype classification than image-only or tabular-only approaches.

## The Problem

Most existing AI-based AML detection systems focus on a single data type, usually medical images. This limits their ability to capture the broader clinical picture, since morphological abnormalities in blood cells are often more informative when interpreted alongside patient-level blood measurements.

The main problem addressed in this project is the lack of an automated system that effectively combines blood smear image information with haematological data for patient-level AML classification.

## Proposed Solution

The proposed solution is a multimodal machine learning system that:

- processes peripheral blood smear images to extract handcrafted morphological and structural descriptors
- combines these image-derived features with patient-level haematological data
- performs patient-level classification across AML subtypes and control cases
- provides a deployable full-stack application for interacting with the model outputs

Rather than relying solely on end-to-end deep learning, the project uses interpretable feature engineering techniques to capture cell shape, gradient behaviour, and edge structure, which are then fused with clinical variables for classification.

## How the System Works

The system operates through the following workflow:

1. **Image Processing and Feature Extraction**  
   Blood smear images are processed to isolate cells and extract interpretable image-derived features. These include:
   - morphological features from Otsu-based segmentation
   - gradient-based features using the Sobel operator
   - edge-based features using the Canny detector

2. **Patient-Level Feature Construction**  
   Since multiple cell images belong to the same patient, image-level features are aggregated to patient level to produce a single representative feature vector per patient.

3. **Multimodal Feature Fusion**  
   The aggregated image-derived features are merged with structured haematological variables to create a unified multimodal feature space.

4. **Classification**  
   Machine learning models are trained to classify patients into one of the diagnostic groups:
   - AML subtypes (`NPM1`, `CBFB::MYH11`, `RUNX1::RUNX1T1`, and `PML::RARA`)
   - control

5. **System Deployment**  
   The final model is integrated into a full-stack application that enables interaction with the prediction pipeline and presentation of results.

## System Development

The project was implemented as a full-stack system consisting of:

- **Frontend:** React
- **Backend:** FastAPI
- **Database:** MySQL
- **Machine Learning:** Python, scikit-learn, XGBoost, LightGBM, CatBoost
- **Image Processing:** OpenCV, NumPy, pandas

The application was designed to support data handling, model execution, result presentation, and system integration within a single workflow.

## Modelling Approach

The project evaluates three types of modelling approaches:

- **Tabular baseline models:** Random Forest, XGBoost
- **Image-only baseline model:** EfficientNetB0
- **Multimodal fusion models:** LightGBM, CatBoost

The final system uses **LightGBM** as the selected deployment model based on its overall classification performance and strongest multiclass discriminative capability.
>>>>>>> 747b262 (Initial commit: AML multimodal fusion system)
