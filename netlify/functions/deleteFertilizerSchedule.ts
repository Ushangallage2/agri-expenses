import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import { deleteSchedulesByIds } from "./utils/fertilizerDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const rawIds = body.ids ?? (body.id != null ? [body.id] : []);
  const ids = (Array.isArray(rawIds) ? rawIds : [rawIds])
    .map((x: unknown) => Number(x))
    .filter((id: number) => Number.isFinite(id) && id > 0);

  if (!ids.length) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "id or ids required" }),
    };
  }

  try {
    const deleted = await deleteSchedulesByIds(ids);
    if (!deleted) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Schedule not found" }),
      };
    }
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, deleted }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error" }),
    };
  }
};

export const handler = requireAdmin(baseHandler);
