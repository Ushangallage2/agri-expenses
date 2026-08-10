import type { Handler } from "@netlify/functions";
import { requireAdmin } from "../../src/utils/requireAuth";
import {
  ensureDefaultTemplate,
  getScheduleWithSteps,
  seedScheduleForCrop,
} from "./utils/fertilizerDb";

const baseHandler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const body = JSON.parse(event.body || "{}");
  const cropName = String(body.cropName ?? body.crop_name ?? "").trim();

  try {
    if (cropName) {
      const schedule = await seedScheduleForCrop(cropName);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      };
    }

    const templateId = await ensureDefaultTemplate();
    const template = await getScheduleWithSteps(templateId);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(template),
    };
  } catch (err: any) {
    console.error(err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err?.message || "Server error" }),
    };
  }
};

export const handler = requireAdmin(baseHandler);
