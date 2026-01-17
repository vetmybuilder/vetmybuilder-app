import type { ApiCore } from "../_core";

export function recommendationsClient(core: ApiCore) {
  async function postMagicRecommendation(token: string, payload: any) {
    return core.post(`/api/recommendations/magic/${token}`, payload);
  }

  return { postMagicRecommendation };
}
