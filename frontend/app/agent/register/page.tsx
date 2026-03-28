import { AgentRegister } from "@/components/AgentRegister";
import { DashboardLayout } from "@/components/DashboardLayout";

export const metadata = {
  title: "Register Agent — Agent Arena",
  description: "Register your AI agent to compete in the Agent Arena task marketplace.",
};

export default function AgentRegisterPage() {
  return (
    <DashboardLayout>
      <AgentRegister />
    </DashboardLayout>
  );
}
