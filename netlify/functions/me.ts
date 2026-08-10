import type { Handler } from "@netlify/functions";
import { resolveAuthUser } from "./utils/session";

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, body: "" };
  }
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const user = await resolveAuthUser(event);
  if (!user) {
    return { statusCode: 401, body: "Unauthorized" };
  }

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: user.id,
      username: user.username,
      role: user.role,
    }),
  };
};
