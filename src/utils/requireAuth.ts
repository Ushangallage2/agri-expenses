import type { Handler, HandlerEvent, HandlerContext } from "@netlify/functions";
import { verifyToken } from "./auth";

export function requireAuth(handler: Handler): Handler {
  return async (event: HandlerEvent, context: HandlerContext) => {
    const cookie = event.headers.cookie;
    if (!cookie) {
      return { statusCode: 401, body: "Unauthorized: No cookie" };
    }

    const token = cookie
      .split(";")
      .map(c => c.trim())
      .find(c => c.startsWith("token="))
      ?.split("=")[1];

    if (!token) {
      return { statusCode: 401, body: "Unauthorized: No token" };
    }

    try {
      const decoded = verifyToken(token);
      (context as any).user = decoded;
      return (await handler(event, context)) ?? { statusCode: 204, body: "" };
    } catch (err) {
      return { statusCode: 401, body: "Invalid token" };
    }
  };
}
