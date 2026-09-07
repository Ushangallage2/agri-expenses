import type { Handler } from "@netlify/functions";
import jwt from "jsonwebtoken";
import { cached } from "./utils/memoryCache";
import {
  getCropPlantMeta,
  listPlantSummaries,
} from "./utils/plantMapDb";

const JWT_SECRET = process.env.JWT_SECRET!;
const TTL_MS = 20_000;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const crop = event.queryStringParameters?.crop;
    if (!crop) return { statusCode: 400, body: "crop query required" };

    const meta = await getCropPlantMeta(crop);
    if (!meta) return { statusCode: 404, body: "Crop not found" };

    const plants = await cached(`plantMap:${crop}`, TTL_MS, () =>
      listPlantSummaries(crop)
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        crop: meta.name,
        status: meta.status,
        plantCount: meta.plantCount,
        closedPlantCount: meta.closedPlantCount,
        displayCount: meta.displayCount,
        plants,
      }),
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
