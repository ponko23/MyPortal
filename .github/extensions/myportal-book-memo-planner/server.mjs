import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CanvasError } from "@github/copilot-sdk/extension";
import { addBoardCard, COLUMNS, loadBoard, moveBoardCard, saveBoard } from "./storage.mjs";

const assetDirectory = path.dirname(fileURLToPath(import.meta.url));
const instances = new Map();
const MAX_BODY_BYTES = 512 * 1024;

function assertInstanceId(instanceId) {
  if (typeof instanceId !== "string" || instanceId.length === 0 || instanceId.length > 200) {
    throw new CanvasError("invalid_instance", "A valid canvas instance ID is required.");
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function sendAsset(response, contentType, body) {
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'",
  });
  response.end(body);
}

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new CanvasError("request_too_large", "The board update is too large.");
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new CanvasError("invalid_json", "The request body must contain valid JSON.");
    }
    throw error;
  }
}

async function handleRequest(instance, request, response) {
  if (request.headers.host !== instance.host) {
    sendJson(response, 403, { error: "Invalid host." });
    return;
  }
  const origin = request.headers.origin;
  if (origin && origin !== instance.origin) {
    sendJson(response, 403, { error: "Cross-origin requests are not allowed." });
    return;
  }

  const requestUrl = new URL(request.url ?? "/", instance.origin);
  if (request.method === "GET" && requestUrl.pathname === "/") {
    sendAsset(response, "text/html; charset=utf-8", await readFile(path.join(assetDirectory, "index.html"), "utf8"));
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/client.js") {
    sendAsset(response, "text/javascript; charset=utf-8", await readFile(path.join(assetDirectory, "client.js"), "utf8"));
    return;
  }
  if (request.method === "GET" && requestUrl.pathname === "/styles.css") {
    sendAsset(response, "text/css; charset=utf-8", await readFile(path.join(assetDirectory, "styles.css"), "utf8"));
    return;
  }
  if (requestUrl.pathname === "/api/board" && request.method === "GET") {
    sendJson(response, 200, { ...await loadBoard(instance.workspaceDirectory), columns: COLUMNS });
    return;
  }
  if (requestUrl.pathname === "/api/board" && request.method === "PUT") {
    sendJson(response, 200, { ...await saveBoard(instance.workspaceDirectory, await readRequestBody(request)), columns: COLUMNS });
    return;
  }
  if (requestUrl.pathname === "/api/cards" && request.method === "POST") {
    sendJson(response, 201, { ...await addBoardCard(instance.workspaceDirectory, await readRequestBody(request)), columns: COLUMNS });
    return;
  }
  const moveMatch = requestUrl.pathname.match(/^\/api\/cards\/([a-z0-9_-]{1,64})\/column$/i);
  if (moveMatch && request.method === "PATCH") {
    const body = await readRequestBody(request);
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        Object.keys(body).length !== 1 || typeof body.columnId !== "string") {
      throw new CanvasError("invalid_move", "A card move must contain only a columnId.");
    }
    sendJson(response, 200, {
      ...await moveBoardCard(instance.workspaceDirectory, moveMatch[1], body.columnId),
      columns: COLUMNS,
    });
    return;
  }
  sendJson(response, 404, { error: "Not found." });
}

function mapHttpError(error) {
  if (error instanceof CanvasError) {
    const status = error.code === "invalid_json" || error.code.startsWith("invalid_") ? 400
      : error.code === "request_too_large" ? 413
        : error.code === "card_not_found" ? 404
          : error.code.startsWith("storage_") ? 500 : 400;
    return { status, message: error.message };
  }
  return { status: 500, message: "The request could not be completed." };
}

async function resolveWorkspaceDirectory(workspaceDirectory) {
  if (typeof workspaceDirectory !== "string" || !path.isAbsolute(workspaceDirectory)) {
    throw new CanvasError("workspace_unavailable", "An absolute workspace directory is required.");
  }
  const workspace = await realpath(workspaceDirectory);
  const information = await stat(workspace);
  if (!information.isDirectory()) {
    throw new CanvasError("workspace_unavailable", "The active workspace path is not a directory.");
  }
  return workspace;
}

export async function openInstance(instanceId, workspaceDirectory) {
  assertInstanceId(instanceId);
  const workspace = await resolveWorkspaceDirectory(workspaceDirectory);
  await loadBoard(workspace);

  const existing = instances.get(instanceId);
  if (existing?.workspaceDirectory === workspace && existing.server.listening) {
    return { url: existing.url };
  }
  if (existing) await closeInstance(instanceId);

  const instance = { workspaceDirectory: workspace, server: null, host: "", origin: "", url: "" };
  const server = createServer((request, response) => {
    void handleRequest(instance, request, response).catch((error) => {
      const mapped = mapHttpError(error);
      sendJson(response, mapped.status, { error: mapped.message });
    });
  });
  instance.server = server;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => server.close(resolve));
    throw new CanvasError("server_start_failed", "The Book Memo board server did not receive a local address.");
  }
  instance.host = `127.0.0.1:${address.port}`;
  instance.origin = `http://${instance.host}`;
  instance.url = `${instance.origin}/`;
  instances.set(instanceId, instance);
  return { url: instance.url };
}

function getOpenInstance(instanceId) {
  assertInstanceId(instanceId);
  const instance = instances.get(instanceId);
  if (!instance || !instance.server.listening) {
    throw new CanvasError("instance_not_open", "Open the Book Memo board before using this action.");
  }
  return instance;
}

export async function readInstanceBoard(instanceId) {
  const instance = getOpenInstance(instanceId);
  return { ...await loadBoard(instance.workspaceDirectory), columns: COLUMNS };
}

export async function updateInstanceBoard(instanceId, board) {
  return saveBoard(getOpenInstance(instanceId).workspaceDirectory, board);
}

export async function addInstanceCard(instanceId, card) {
  const board = await addBoardCard(getOpenInstance(instanceId).workspaceDirectory, card);
  return { ...board, columns: COLUMNS };
}

export async function moveInstanceCard(instanceId, cardId, columnId) {
  const board = await moveBoardCard(getOpenInstance(instanceId).workspaceDirectory, cardId, columnId);
  return { ...board, columns: COLUMNS };
}

export async function closeInstance(instanceId) {
  const instance = instances.get(instanceId);
  if (!instance) return;
  instances.delete(instanceId);
  await new Promise((resolve, reject) => {
    instance.server.close((error) => error ? reject(error) : resolve());
  });
}
