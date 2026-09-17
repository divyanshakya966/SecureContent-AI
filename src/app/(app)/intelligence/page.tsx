import type { Metadata } from "next";
import { IntelligenceView } from "@/components/secure/intelligence-view";

export const metadata: Metadata = { title: "Intelligence" };

export default function IntelligencePage() {
  return <IntelligenceView />;
}
