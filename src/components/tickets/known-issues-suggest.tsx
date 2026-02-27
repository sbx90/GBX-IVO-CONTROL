"use client";

import { Lightbulb, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useKnownIssuesByCategory } from "@/hooks/use-known-issues";
import type { IssueCategory, MainboardSection } from "@/lib/types/database";

interface KnownIssuesSuggestProps {
  issueCategory: IssueCategory;
  boardSection?: MainboardSection | null;
}

const frequencyConfig = {
  HIGH: { label: "High frequency", color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
  MEDIUM: { label: "Medium frequency", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  LOW: { label: "Low frequency", color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
};

export function KnownIssuesSuggest({
  issueCategory,
  boardSection,
}: KnownIssuesSuggestProps) {
  const { data: issues } = useKnownIssuesByCategory(issueCategory, boardSection);

  if (!issues || issues.length === 0) return null;

  return (
    <Card className="bg-amber-400/5 border-amber-400/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-amber-300 flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          Suggested Solutions ({issues.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Accordion type="multiple" className="space-y-2">
          {issues.map((issue) => {
            const freq = frequencyConfig[issue.frequency];
            return (
              <AccordionItem
                key={issue.id}
                value={issue.id}
                className="bg-zinc-800/50 rounded-lg border border-zinc-700/50 px-3"
              >
                <AccordionTrigger className="py-3 hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <span className="text-sm font-medium text-zinc-200">
                      {issue.title}
                    </span>
                    <Badge
                      className={`text-xs px-1.5 py-0 h-4 ${freq.bg} ${freq.color} border flex-shrink-0`}
                    >
                      {freq.label}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <p className="text-sm text-zinc-400 mb-3">{issue.description}</p>
                  <div className="rounded-lg bg-zinc-900 border border-zinc-700 p-3">
                    <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1.5">
                      Suggested Fix
                    </p>
                    <p className="text-sm text-zinc-300 leading-relaxed">
                      {issue.solution}
                    </p>
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </CardContent>
    </Card>
  );
}
