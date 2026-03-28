import type { Metadata } from "next";
import { SettingsPage } from "@/components/SettingsPage";

export const metadata: Metadata = {
  title: "Settings — Agent Arena",
};

export default function Page() {
  return <SettingsPage />;
}
