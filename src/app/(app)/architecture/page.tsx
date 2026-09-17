import type { Metadata } from "next";
import { ArchitectureView } from "@/components/secure/architecture-view";

export const metadata: Metadata = { title: "Architecture" };

export default function ArchitecturePage() {
  return <ArchitectureView />;
}
