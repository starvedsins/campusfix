import { getUser } from "@/lib/auth";
import { redirect } from "next/navigation";
export const dynamic = "force-dynamic";
export default async function Home() {
  const user = await getUser();
  redirect(user ? "/app" : "/login");
}
