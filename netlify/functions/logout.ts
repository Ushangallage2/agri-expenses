import { Handler } from "@netlify/functions";

export const handler: Handler = async () => {
  return {
    statusCode: 200,
    headers: {
      "Set-Cookie": "token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict",
    },
    body: "Logged out",
  };
};
