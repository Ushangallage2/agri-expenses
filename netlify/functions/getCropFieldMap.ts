import type { Handler } from "@netlify/functions";
import jwt from "jsonwebtoken";
import { loadFieldMapPayload } from "./utils/cropFieldMapDb";
import { cached } from "./utils/memoryCache";

const JWT_SECRET = process.env.JWT_SECRET!;
const TTL_MS = 12_000;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const crop = event.queryStringParameters?.crop;
    if (!crop) return { statusCode: 400, body: "crop query required" };

    const payload = await cached(`fieldMap:${crop}`, TTL_MS, () =>
      loadFieldMapPayload(crop)
    );
    if (!payload) return { statusCode: 404, body: "Crop not found" };

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
