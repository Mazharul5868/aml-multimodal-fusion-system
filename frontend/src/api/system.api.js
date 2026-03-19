import { apiRequest } from "./http";

export const systemApi = {
  health: () => apiRequest("/system/health"),
};
