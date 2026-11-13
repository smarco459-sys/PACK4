import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const localApiHandlers = {
  "/api/manual-identify": () => import("./api/manual-identify.js"),
  "/api/manual-maintenance": () => import("./api/manual-maintenance.js"),
};
const maxRequestBodyBytes = 512 * 1024;

function sendJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

async function parseJsonBody(request) {
  const chunks = [];
  let bodySize = 0;

  for await (const chunk of request) {
    bodySize += chunk.length;
    if (bodySize > maxRequestBodyBytes) {
      throw Object.assign(new Error("Request body too large"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw Object.assign(new Error("Invalid JSON body"), { statusCode: 400 });
  }
}

function installLocalApiMiddleware(server) {
  server.middlewares.use(async (request, response, next) => {
    const pathname = new URL(request.url || "/", "http://localhost").pathname;
    const loadHandler = localApiHandlers[pathname];
    if (!loadHandler) return next();

    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      return sendJson(response, 405, { error: "Método não permitido." });
    }

    try {
      request.body = await parseJsonBody(request);
    } catch (error) {
      const statusCode = error.statusCode || 400;
      const message = statusCode === 413
        ? "O pedido excede o tamanho permitido."
        : "O pedido contém JSON inválido.";
      return sendJson(response, statusCode, { error: message });
    }

    response.status = (statusCode) => {
      response.statusCode = statusCode;
      return response;
    };
    response.json = (body) => {
      sendJson(response, response.statusCode || 200, body);
      return response;
    };

    try {
      const { default: handler } = await loadHandler();
      await handler(request, response);
      if (!response.writableEnded) {
        response.statusCode = 204;
        response.end();
      }
    } catch {
      if (!response.headersSent) {
        sendJson(response, 500, { error: "O serviço não conseguiu processar o pedido." });
      } else {
        response.destroy();
      }
    }
  });
}

function localApiPlugin() {
  return {
    name: "pack4-local-api",
    configureServer(server) {
      installLocalApiMiddleware(server);
    },
    configurePreviewServer(server) {
      installLocalApiMiddleware(server);
    },
  };
}

export default defineConfig(({ mode }) => {
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), ""))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    plugins: [react(), tailwindcss(), localApiPlugin()],
    base: "./",
    envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  };
});
