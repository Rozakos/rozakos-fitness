import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RefreshControl } from "react-native";

import { colors } from "@/theme/colors";

/**
 * Pull-to-refresh for a screen's scroll container: refetches every query that
 * is currently on screen. Pass the result straight to `refreshControl`.
 */
export function useRefreshControl() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  };
  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.accentBright}
      colors={[colors.accentBright]}
      progressBackgroundColor={colors.surface}
    />
  );
}
