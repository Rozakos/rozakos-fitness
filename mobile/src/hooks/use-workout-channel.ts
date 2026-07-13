import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { WS_URL } from "@/api/config";
import type { LiveMessage } from "@/api/types";
import { useAuth } from "@/store/auth";

export interface LiveRep {
  exerciseId: number;
  count: number;
  at: number;
}

/**
 * Joins the live channel of the active workout. Device-logged sets arrive as
 * `set_logged` (we refetch the workout); in-progress reps arrive as `rep`
 * events and are surfaced for the live rep badge.
 */
export function useWorkoutChannel(workoutId: number | undefined) {
  const token = useAuth((s) => s.token);
  const qc = useQueryClient();
  const [liveRep, setLiveRep] = useState<LiveRep | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (workoutId === undefined || !token) return;
    let closed = false;
    const ws = new WebSocket(`${WS_URL}/ws/workout/${workoutId}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      if (!closed) setConnected(false);
    };
    ws.onmessage = (event) => {
      let msg: LiveMessage;
      try {
        msg = JSON.parse(event.data as string);
      } catch {
        return;
      }
      if (msg.type === "rep") {
        setLiveRep({ exerciseId: msg.exercise_id, count: msg.count, at: Date.now() });
      } else if (msg.type === "set_logged") {
        setLiveRep(null);
        qc.invalidateQueries({ queryKey: ["active-workout"] });
      }
    };

    return () => {
      closed = true;
      setConnected(false);
      ws.close();
    };
  }, [workoutId, token, qc]);

  return { liveRep, connected };
}
