import type { Metadata } from "next";
import { UploadView } from "@/components/secure/upload-view";

export const metadata: Metadata = { title: "Ingest" };

export default function IngestPage() {
  return <UploadView />;
}
