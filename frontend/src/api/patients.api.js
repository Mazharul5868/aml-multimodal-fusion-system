import { apiRequest } from "./http";

export const patientsApi = {
  list: (skip = 0, limit = 100) =>
    apiRequest(`/patients?skip=${skip}&limit=${limit}`),

  create: (payload) =>
    apiRequest("/patients", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  get: (patientId) =>
    apiRequest(`/patients/${encodeURIComponent(patientId)}`),

  update: (patientId, payload) =>
    apiRequest(`/patients/${encodeURIComponent(patientId)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  remove: (patientId) =>
    apiRequest(`/patients/${encodeURIComponent(patientId)}`, {
      method: "DELETE",
    }),

  submitCbc: (patientId, payload) =>
    apiRequest(`/patients/${encodeURIComponent(patientId)}/cbc`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  data: (patientId) =>
    apiRequest(`/patients/${encodeURIComponent(patientId)}/data`),
};
