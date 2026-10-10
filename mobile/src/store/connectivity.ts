import { create } from "zustand";

/**
 * True while account-mode screens are showing responses saved on the phone
 * because the server could not be reached. Cleared by the next fresh response.
 */
export const useConnectivity = create<{ servingCached: boolean }>(() => ({
  servingCached: false,
}));

export function setServingCached(servingCached: boolean): void {
  if (useConnectivity.getState().servingCached !== servingCached) {
    useConnectivity.setState({ servingCached });
  }
}
