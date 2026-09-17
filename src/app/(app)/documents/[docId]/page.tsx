import type { Metadata } from "next";
import { DocumentDetailView } from "@/components/secure/document-detail-view";

export const metadata: Metadata = { title: "Document" };

export default async function DocumentPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  return <DocumentDetailView documentId={docId} />;
}
