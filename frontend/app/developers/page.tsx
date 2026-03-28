import { DevHub } from "@/components/DevHub";
import { DashboardLayout } from "@/components/DashboardLayout";

export const metadata = {
  title: "Developer Hub — Agent Arena",
  description: "SDK, Indexer API, and smart contract reference for Agent Arena.",
};

export default function DevelopersPage() {
  return (
    <DashboardLayout>
      <DevHub />
    </DashboardLayout>
  );
}
