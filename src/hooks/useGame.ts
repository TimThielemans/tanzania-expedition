import { useQuery } from "@tanstack/react-query";
import { useEffect, useId } from "react";
import {
  fetchChallenges,
  fetchAllChallenges,
  fetchPhotos,
  fetchPointActions,
  fetchProgress,
  fetchRanking,
  fetchSettings,
  fetchTeams,
  fetchZones,
  fetchAnswers,
  fetchQuizAnswers,
} from "@/lib/api";
import { fetchNotifications, fetchNotificationReads } from "@/lib/notifications";
import {
  fetchLocationChallengeStates,
  fetchLocationEvents,
  fetchLocationTriggers,
  fetchTeamLocations,
  fetchTrackingDevices,
} from "@/lib/locations";
import { supabase, isSupabaseConfigured } from "@/lib/supabase";


const enabled = isSupabaseConfigured;

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: fetchSettings, enabled, staleTime: 60_000 });

export const useTeams = () => useQuery({ queryKey: ["teams"], queryFn: fetchTeams, enabled });

export const useZones = () => useQuery({ queryKey: ["zones"], queryFn: fetchZones, enabled });

export const useChallenges = () =>
  useQuery({ queryKey: ["challenges"], queryFn: fetchChallenges, enabled });

export const useAllChallenges = () =>
  useQuery({ queryKey: ["all-challenges"], queryFn: fetchAllChallenges, enabled });

export const useProgress = (teamId?: string) =>
  useQuery({
    queryKey: ["progress", teamId ?? "all"],
    queryFn: () => fetchProgress(teamId),
    enabled: enabled && (teamId ? true : true),
  });

export const useRanking = () => useQuery({ queryKey: ["ranking"], queryFn: fetchRanking, enabled });

export const useAnswers = (teamId?: string) =>
  useQuery({ queryKey: ["answers", teamId ?? "all"], queryFn: () => fetchAnswers(teamId), enabled });

export const useQuizAnswers = (teamId?: string) =>
  useQuery({ queryKey: ["quiz", teamId ?? "all"], queryFn: () => fetchQuizAnswers(teamId), enabled });

export const usePhotos = (teamId?: string) =>
  useQuery({ queryKey: ["photos", teamId ?? "all"], queryFn: () => fetchPhotos(teamId), enabled });

export const usePointActions = () =>
  useQuery({ queryKey: ["point-actions"], queryFn: fetchPointActions, enabled });

/** Live updates via Supabase Realtime. */
export function useRealtime(tables: string[], onChange: () => void) {
  const id = useId();
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase.channel(`bow-${id}-${tables.join("-")}`);
    tables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, tables.join(",")]);
}

/* ------------------------------ meldingen ------------------------------ */

export const useNotifications = () =>
  useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications, enabled });

export const useNotificationReads = (reader: string) =>
  useQuery({
    queryKey: ["notification-reads", reader],
    queryFn: () => fetchNotificationReads(reader),
    enabled: enabled && Boolean(reader),
  });

/* ------------------------------ locatie ------------------------------ */

export const useTeamLocations = () =>
  useQuery({ queryKey: ["team-locations"], queryFn: fetchTeamLocations, enabled });

export const useLocationEvents = () =>
  useQuery({ queryKey: ["location-events"], queryFn: fetchLocationEvents, enabled });

export const useLocationTriggers = () =>
  useQuery({ queryKey: ["location-triggers"], queryFn: fetchLocationTriggers, enabled });

export const useTrackingDevices = () =>
  useQuery({ queryKey: ["tracking-devices"], queryFn: fetchTrackingDevices, enabled });

export const useLocationChallengeStates = (teamId?: string) =>
  useQuery({
    queryKey: ["location-challenge-states", teamId ?? "all"],
    queryFn: () => fetchLocationChallengeStates(teamId),
    enabled,
  });
