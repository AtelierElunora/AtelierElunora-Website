import { createHash } from "node:crypto";
export const googleAdsEventId = (shop: string, id: string, kind: string) =>
  "gads-" +
  createHash("sha256")
    .update(shop + ":" + id + ":" + kind)
    .digest("hex");
