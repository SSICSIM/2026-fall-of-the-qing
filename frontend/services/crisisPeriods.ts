import { apiClient } from "@/lib/apiClient";
import type { CrisisPeriodCreate, CrisisPeriodResponse } from "@/types/api";

export const crisisPeriodsService = {
  list: () => apiClient.get<CrisisPeriodResponse[]>("/api/periods"),
  getActive: () => apiClient.get<CrisisPeriodResponse | null>("/api/periods/active"),
  create: (body: CrisisPeriodCreate) =>
    apiClient.post<CrisisPeriodResponse>("/api/periods", body),
  archive: (id: number) =>
    apiClient.post<CrisisPeriodResponse>(`/api/periods/${id}/archive`, {}),
  reopen: (id: number) =>
    apiClient.post<CrisisPeriodResponse>(`/api/periods/${id}/reopen`, {}),
  delete: (id: number) => apiClient.delete<void>(`/api/periods/${id}`),
};
