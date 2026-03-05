"use client";

import { useQuery } from "@tanstack/react-query";
import { listTeamMembersBasic } from "@/app/actions/users";

export type { TeamMemberBasic } from "@/app/actions/users";

export function useTeamMembers() {
  return useQuery({
    queryKey: ["team_members"],
    staleTime: 60_000 * 5,
    queryFn: () => listTeamMembersBasic(),
  });
}
