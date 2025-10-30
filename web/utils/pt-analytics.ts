import { AxiosInstance } from "axios";

export type TypeQueryLog = {
  query: string;
  matchedLabel?: string | null;
  confidence?: number | null;
  suggestions?: string[];
};

export async function logProjectTypeQuery(
  api: AxiosInstance,
  payload: TypeQueryLog
) {
  try {
    await api.post("/api/project-types/queries", payload);
  } catch {
    /* swallow – analytics must never block UX */
  }
}
