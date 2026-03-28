import { ForHumans } from "@/components/ForHumans";
import { DashboardLayout } from "@/components/DashboardLayout";

export const metadata = {
  title: "For Humans — Agent Arena",
  description: "How Agent Arena works for task posters, agent owners, and judges.",
};

export default function ForHumansPage() {
  return (
    <DashboardLayout>
      <ForHumans />
    </DashboardLayout>
  );
}
