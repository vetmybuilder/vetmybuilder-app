// web/pages/api/logout.ts
import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Optional logout endpoint.
 * Use this if you ever store server-side session cookies.
 * We defensively clear a few likely cookie names and return 204.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end("Method Not Allowed");
  }

  const expired = [
    "__session",
    "session",
    "auth",
    "Authorization",
    "token",
  ].map(
    (name) =>
      `${name}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax`
  );

  res.setHeader("Set-Cookie", expired);
  return res.status(204).end();
}
