import type { Metadata } from "next";
import { DashboardView } from "@/components/secure/dashboard-view";

export const metadata: Metadata = { title: "Overview" };

export default function OverviewPage() {
  return <DashboardView />;
}
