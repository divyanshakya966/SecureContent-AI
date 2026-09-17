import type { Metadata } from "next";
import { PolicyCompareView } from "@/components/secure/policy-compare-view";

export const metadata: Metadata = { title: "Policy Lab" };

export default function PolicyLabPage() {
  return <PolicyCompareView />;
}
