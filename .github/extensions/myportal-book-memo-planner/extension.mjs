import { CanvasError, createCanvas, joinSession } from "@github/copilot-sdk/extension";
import {
  addInstanceCard,
  closeInstance,
  moveInstanceCard,
  openInstance,
  readInstanceBoard,
  updateInstanceBoard,
} from "./server.mjs";

let session;

function logUnexpectedError(operation, error) {
  session?.log?.(`Book Memo planner ${operation} failed: ${error instanceof Error ? error.message : String(error)}`);
}

function getWorkspaceDirectory(context) {
  const directory = context.session?.workingDirectory;
  if (typeof directory !== "string" || directory.trim() === "") {
    throw new CanvasError("workspace_unavailable", "The active session does not provide a workspace directory.");
  }
  return directory;
}

const cardSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string", maxLength: 64 },
    title: { type: "string", maxLength: 200 },
    description: { type: "string", maxLength: 3000 },
    type: { type: "string", enum: ["epic", "task", "scenario", "decision"] },
    priority: { type: "string", enum: ["must", "should", "could", "wont"] },
    columnId: { type: "string", enum: ["unsorted", "ready", "in-progress", "blocked", "done"] },
    labels: { type: "array", maxItems: 20, items: { type: "string", maxLength: 60 } },
    parentId: { type: ["string", "null"], maxLength: 64 },
  },
  required: ["id", "title", "description", "type", "priority", "columnId", "labels", "parentId"],
};

const boardSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    goal: { type: "string", maxLength: 2000 },
    cards: {
      type: "array",
      maxItems: 500,
      items: cardSchema,
    },
  },
  required: ["goal", "cards"],
};

const newCardSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", maxLength: 200 },
    description: { type: "string", maxLength: 3000 },
    type: { type: "string", enum: ["epic", "task", "scenario", "decision"] },
    priority: { type: "string", enum: ["must", "should", "could", "wont"] },
    columnId: { type: "string", enum: ["unsorted", "ready", "in-progress", "blocked", "done"] },
    labels: { type: "array", maxItems: 20, items: { type: "string", maxLength: 60 } },
    parentId: { type: ["string", "null"], maxLength: 64 },
  },
  required: ["title", "description", "type", "priority", "columnId", "labels", "parentId"],
};

const moveCardSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    cardId: { type: "string", maxLength: 64 },
    columnId: { type: "string", enum: ["unsorted", "ready", "in-progress", "blocked", "done"] },
  },
  required: ["cardId", "columnId"],
};

const canvas = createCanvas({
  id: "myportal-book-memo-planning",
  displayName: "Book Memo カンバン",
  description: "book-memo の要件とタスクを5列のカンバンで整理し、親機能と子タスクを管理します。",
  actions: [
    {
      name: "read-book-memo-board",
      description: "現在のbook-memoカンバンとカードを読み込みます。",
      handler: async (context) => {
        try {
          return await readInstanceBoard(context.instanceId);
        } catch (error) {
          logUnexpectedError("board read", error);
          if (error instanceof CanvasError) throw error;
          throw new CanvasError("storage_read_failed", "book-memoのカンバンを読み込めませんでした。");
        }
      },
    },
    {
      name: "update-book-memo-board",
      description: "book-memoの目的と全カードの内容・列・優先度・親子関係をまとめて更新します。",
      inputSchema: boardSchema,
      handler: async (context) => {
        try {
          return await updateInstanceBoard(context.instanceId, context.input);
        } catch (error) {
          logUnexpectedError("board update", error);
          if (error instanceof CanvasError) throw error;
          throw new CanvasError("storage_write_failed", "book-memoのカンバンを保存できませんでした。");
        }
      },
    },
    {
      name: "add-book-memo-card",
      description: "book-memoカンバンに機能・タスク・利用場面・仕様判断カードを追加します。",
      inputSchema: newCardSchema,
      handler: async (context) => {
        try {
          return await addInstanceCard(context.instanceId, context.input);
        } catch (error) {
          logUnexpectedError("card creation", error);
          if (error instanceof CanvasError) throw error;
          throw new CanvasError("storage_write_failed", "カンバンカードを追加できませんでした。");
        }
      },
    },
    {
      name: "move-book-memo-card",
      description: "指定したbook-memoカードを別のカンバン列へ移動します。",
      inputSchema: moveCardSchema,
      handler: async (context) => {
        try {
          return await moveInstanceCard(context.instanceId, context.input.cardId, context.input.columnId);
        } catch (error) {
          logUnexpectedError("card move", error);
          if (error instanceof CanvasError) throw error;
          throw new CanvasError("storage_write_failed", "カンバンカードを移動できませんでした。");
        }
      },
    },
  ],
  open: async (context) => {
    try {
      const { url } = await openInstance(context.instanceId, getWorkspaceDirectory(context));
      return { url, title: "Book Memo カンバン" };
    } catch (error) {
      logUnexpectedError("open", error);
      if (error instanceof CanvasError) throw error;
      throw new CanvasError("storage_open_failed", "book-memoの計画キャンバスを開けませんでした。");
    }
  },
  onClose: async ({ instanceId }) => {
    await closeInstance(instanceId);
  },
});

session = await joinSession({ canvases: [canvas] });
