import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="p-4 rounded-full bg-zinc-800/60">
        <Icon className="h-8 w-8 text-zinc-600" />
      </div>
      <div className="text-center">
        <p className="text-zinc-300 font-medium">{title}</p>
        <p className="text-zinc-500 text-sm mt-1">{description}</p>
      </div>
      {action && (
        <Button
          onClick={action.onClick}
          className="bg-[#16a34a] hover:bg-[#15803d] text-white mt-2"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
