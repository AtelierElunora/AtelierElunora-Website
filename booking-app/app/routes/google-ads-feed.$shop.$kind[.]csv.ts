import type { LoaderFunctionArgs } from "react-router";
import { googleAdsFeed } from "../google-ads.server";
export async function loader({ request, params }: LoaderFunctionArgs) {
  return googleAdsFeed(request, params.shop || "", params.kind || "");
}
