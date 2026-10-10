import Link from "next/link";
import { Boxes } from "lucide-react";
import { modelsUrl } from "@/lib/site";

export function SiteNav() {
  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link href="/" className="rounded-full px-3.5 py-1.5 text-muted transition-colors hover:text-fg">
        All games
      </Link>
      <a href={modelsUrl("/")} className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-fg px-4 py-1.5 font-medium text-bg transition hover:bg-white">
        <Boxes className="size-3.5" /> Free 3D models
      </a>
    </nav>
  );
}
