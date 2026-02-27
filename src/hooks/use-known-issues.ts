import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import type { KnownIssue, IssueCategory, MainboardSection } from "@/lib/types/database";

function getSupabase() {
  return createClient();
}

export function useKnownIssues() {
  return useQuery({
    queryKey: ["known-issues"],
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("known_issues")
        .select("*")
        .eq("is_active", true)
        .order("frequency", { ascending: false });

      if (error) throw error;
      return data as KnownIssue[];
    },
  });
}

export function useKnownIssuesByCategory(
  category: IssueCategory,
  boardSection?: MainboardSection | null
) {
  return useQuery({
    queryKey: ["known-issues", category, boardSection],
    queryFn: async () => {
      const supabase = getSupabase();

      let query = supabase
        .from("known_issues")
        .select("*")
        .eq("is_active", true);

      if (boardSection) {
        query = query.or(
          `issue_category.eq.${category},board_section.eq.${boardSection}`
        );
      } else {
        query = query.eq("issue_category", category);
      }

      const { data, error } = await query.order("frequency", {
        ascending: false,
      });

      if (error) throw error;
      return data as KnownIssue[];
    },
    enabled: !!category,
  });
}
