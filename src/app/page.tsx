import { redirect } from "next/navigation";
import { defaultPeriod } from "@/lib/data";

/**
 * The root. Lands on Home for the first partner, on its most recent run.
 *
 * It used to hardcode `/coffee-guru/overview` — both the period, implicitly,
 * and the surface. The period is now resolved rather than assumed, so adding a
 * newer extract does not leave the front door pointing at an old one.
 */
export default async function Root() {
  redirect(`/coffee-guru/${await defaultPeriod("coffee-guru")}`);
}
