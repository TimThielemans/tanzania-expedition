import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  fetchChallenges,
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
import { supabase, isSupabaseConfigured } from "@/lib/supabase";

const enabled = isSupabaseConfigured;

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: fetchSettings, enabled, staleTime: 60_000 });

export const useTeams = () => useQuery({ queryKey: ["teams"], queryFn: fetchTeams, enabled });

export const useZones = () => useQuery({ queryKey: ["zones"], queryFn: fetchZones, enabled });

export const useChallenges = () =>
  useQuery({ queryKey: ["challenges"], queryFn: fetchChallenges, enabled });

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
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const channel = supabase.channel(`bow-${tables.join("-")}`);
    tables.forEach((table) => {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, onChange);
    });
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(",")]);
}
