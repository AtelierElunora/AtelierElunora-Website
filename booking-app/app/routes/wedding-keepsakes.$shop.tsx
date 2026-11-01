import type { LoaderFunctionArgs } from "react-router";
import { data } from "react-router";
import { customerBookingAllowed } from "../live-store";
import { loadWeddingKeepsakes } from "../wedding-keepsakes.server";

export async function loader({ params }: LoaderFunctionArgs) {
  if (!customerBookingAllowed(params.shop)) throw new Response("Not found", { status: 404 });
  try {
    return data({ ...await loadWeddingKeepsakes(params.shop!), unavailable: false }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return data({ products: [], incomplete: true, unavailable: true }, { headers: { "Cache-Control": "no-store" } });
  }
}
