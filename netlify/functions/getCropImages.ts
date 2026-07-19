import type { Handler } from "@netlify/functions";
import jwt from "jsonwebtoken";
import { listCropImages } from "./utils/cropImagesDb";

const JWT_SECRET = process.env.JWT_SECRET!;

export const handler: Handler = async (event) => {
  try {
    const token = event.headers.cookie?.split("token=")?.[1];
    if (!token) return { statusCode: 401, body: "Unauthorized" };
    jwt.verify(token, JWT_SECRET);

    const crop = event.queryStringParameters?.crop;
    if (!crop) return { statusCode: 400, body: "crop query required" };

    const rows = await listCropImages(crop);
    return { statusCode: 200, body: JSON.stringify(rows) };
  } catch (err) {
    console.error(err);
    return { statusCode: 401, body: "Unauthorized" };
  }
};
