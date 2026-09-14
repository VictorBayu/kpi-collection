import { redirect } from "next/navigation";
import { readSession } from "@/lib/auth";

export default async function Home() {
  const s = await readSession();
  if (!s) redirect("/login");
  redirect(s.peran === "admin" ? "/admin/analitik" : "/dashboard");
}
