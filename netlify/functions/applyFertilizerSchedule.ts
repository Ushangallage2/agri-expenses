import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import { setWorkingSchedule } from "./utils/fertilizerDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const scheduleId = Number(body.id ?? body.scheduleId ?? body.schedule_id);
  if (!Number.isFinite(scheduleId) || scheduleId <= 0) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "id required" }),
    };
  }

  try {
    const schedule = await setWorkingSchedule(scheduleId);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schedule),
    };
  } catch (err: any) {
    console.error(err);
    const msg = err?.message || "Server error";
    const status =
      msg === "Schedule not found"
        ? 404
        : msg.includes("Only crop schedules")
          ? 400
          : 500;
    return {
      statusCode: status,
      body: JSON.stringify({ error: msg }),
    };
  }
};

export const handler = requireAdmin(baseHandler);
