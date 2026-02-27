import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <h1 className="text-5xl font-bold text-zinc-700">404</h1>
      <p className="text-zinc-400">Page not found.</p>
      <Link href="/">
        <Button className="bg-[#16a34a] hover:bg-[#15803d] text-white">
          Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}
