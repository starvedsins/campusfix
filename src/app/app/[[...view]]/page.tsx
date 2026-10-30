import { CampusApp } from "@/components/campus-app";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function AppPage({
  params,
}: {
  params: Promise<{ view?: string[] }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  return <CampusApp user={user} view={(await params).view ?? []} />;
}
