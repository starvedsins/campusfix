import { Login } from "@/components/login";
import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function LoginPage() {
  const user = await getUser();
  if (user) redirect("/app");
  return <Login demo={process.env.DEMO_MODE === "true"} />;
}
