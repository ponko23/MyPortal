import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { CanvasError } from "@github/copilot-sdk/extension";

const FORMAT = "myportal-book-memo-kanban";
const VERSION = 2;
const LEGACY_FORMAT = "myportal-book-memo-usage-plan";
const LEGACY_VERSION = 1;
const MAX_CARDS = 500;
const MAX_LABELS = 20;

export const COLUMNS = [
  { id: "unsorted", name: "未整理" },
  { id: "ready", name: "着手可能" },
  { id: "in-progress", name: "進行中" },
  { id: "blocked", name: "保留・要確認" },
  { id: "done", name: "完了" },
];

const COLUMN_IDS = new Set(COLUMNS.map((column) => column.id));
const CARD_TYPES = new Set(["epic", "task", "scenario", "decision"]);
const PRIORITIES = new Set(["must", "should", "could", "wont"]);

const FEATURES = [
  {
    id: "213257a7-0868-4981-b743-fab9e18746bf",
    name: "一覧画面",
    rationale: "状況を問わず登録した本のタイトル一覧を表示する。状況によるフィルターとソート、詳細画面や新規追加への導線、一括削除を備える。",
    priority: "must",
    tasks: [
      ["一覧の表示項目と並び順を決める", "タイトル一覧に表示する情報と初期の並び順を定義する。"],
      ["状況フィルターとソート条件を決める", "本の状況に応じた絞り込みと並べ替えの条件を定義する。"],
      ["詳細・新規登録への導線を設計する", "一覧から詳細表示と新規登録を始める操作を設計する。"],
      ["一括削除の選択・確認方法を設計する", "削除対象の選択方法と誤操作を防ぐ確認方法を決める。"],
    ],
  },
  {
    id: "1aad65bb-8a75-41c2-adfd-cce8810a3ea6",
    name: "詳細画面",
    rationale: "本の所持形態、状態、購入日、読了日、一言メモ、ISBNコード、書影などを表示・管理する。",
    priority: "must",
    tasks: [
      ["所持形態と読書状態を定義する", "購入・借用・候補などの所持形態と、未読・読書中・読了などの状態を整理する。"],
      ["本の記録項目と必須条件を決める", "購入日・読了日・一言メモなどの項目と必須・任意を定義する。"],
      ["詳細情報の表示・編集を設計する", "ISBNコードや書影を含む詳細情報の表示と編集方法を決める。"],
    ],
  },
  {
    id: "ec39bffd-fe2c-4995-aa76-e7cbb76a2bb4",
    name: "新規登録画面",
    rationale: "必要情報を入力して本を登録する。ISBNコードが分かれば検索し、書誌情報を自動入力する。",
    priority: "must",
    tasks: [
      ["新規登録の入力項目を決める", "手入力する項目、必須条件、登録後の初期状態を定義する。"],
      ["ISBN検索の取得情報と代替手段を決める", "検索元、取得する書誌情報、検索失敗時の手入力方法を整理する。"],
      ["ISBN検索結果の確認・反映手順を設計する", "取得した情報を確認して登録内容へ反映する流れを設計する。"],
    ],
  },
];

const OPEN_QUESTIONS = [
  {
    id: "decision-status",
    title: "「状況」「状態」の選択肢と遷移を決める",
    description: "本の状況・読書状態の具体的な選択肢と、状態を変更するルールを決める。",
    parentId: "1aad65bb-8a75-41c2-adfd-cce8810a3ea6",
  },
  {
    id: "decision-ownership",
    title: "所持形態・購入判断の表現を決める",
    description: "購入・借用・候補などの所持形態と、購入するかどうかの選択肢を整理する。",
    parentId: "1aad65bb-8a75-41c2-adfd-cce8810a3ea6",
  },
  {
    id: "decision-fields",
    title: "各情報の必須・任意と日付の扱いを決める",
    description: "登録時に必須とする項目、任意項目、日付を記録するタイミングを決める。",
    parentId: "1aad65bb-8a75-41c2-adfd-cce8810a3ea6",
  },
  {
    id: "decision-isbn",
    title: "ISBN検索元と検索失敗時の方法を決める",
    description: "ISBN検索に利用する情報源と、検索できない場合の手入力方法を決める。",
    parentId: "ec39bffd-fe2c-4995-aa76-e7cbb76a2bb4",
  },
  {
    id: "decision-cover",
    title: "書影の取得・保存方法を決める",
    description: "書影の取得元、保存方法、表示できない場合の扱いを決める。",
    parentId: "1aad65bb-8a75-41c2-adfd-cce8810a3ea6",
  },
  {
    id: "decision-bulk-delete",
    title: "一括削除の対象選択と誤操作防止を決める",
    description: "複数の本を選択して削除する操作と、誤削除を防ぐ方法を決める。",
    parentId: "213257a7-0868-4981-b743-fab9e18746bf",
  },
];

export function getBoardPath(workspaceDirectory) {
  return path.join(workspaceDirectory, "apps", "book-memo", "doc", "usage-plan.json");
}

function assertString(value, field, maxLength, allowEmpty = true) {
  if (typeof value !== "string" || value.length > maxLength || (!allowEmpty && value.trim() === "")) {
    throw new CanvasError("invalid_board", `${field} must be a${allowEmpty ? "" : " non-empty"} string of at most ${maxLength} characters.`);
  }
}

function assertExactKeys(value, expectedKeys, field) {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (actualKeys.length !== sortedExpected.length ||
      actualKeys.some((key, index) => key !== sortedExpected[index])) {
    throw new CanvasError("invalid_board", `${field} contains missing or unsupported properties.`);
  }
}

function validateCardFields(card, index) {
  if (!card || typeof card !== "object" || Array.isArray(card)) {
    throw new CanvasError("invalid_board", `cards[${index}] must be an object.`);
  }
  assertExactKeys(card, ["id", "title", "description", "type", "priority", "columnId", "labels", "parentId"], `cards[${index}]`);
  assertString(card.id, `cards[${index}].id`, 64, false);
  assertString(card.title, `cards[${index}].title`, 200, false);
  assertString(card.description, `cards[${index}].description`, 3000);
  if (!CARD_TYPES.has(card.type)) {
    throw new CanvasError("invalid_board", `cards[${index}].type is not supported.`);
  }
  if (!PRIORITIES.has(card.priority)) {
    throw new CanvasError("invalid_board", `cards[${index}].priority is not supported.`);
  }
  if (!COLUMN_IDS.has(card.columnId)) {
    throw new CanvasError("invalid_board", `cards[${index}].columnId is not supported.`);
  }
  if (!Array.isArray(card.labels) || card.labels.length > MAX_LABELS) {
    throw new CanvasError("invalid_board", `cards[${index}].labels must contain at most ${MAX_LABELS} strings.`);
  }
  card.labels.forEach((label, labelIndex) => assertString(label, `cards[${index}].labels[${labelIndex}]`, 60, false));
  if (card.parentId !== null) {
    assertString(card.parentId, `cards[${index}].parentId`, 64, false);
    if (card.type !== "task" && card.type !== "decision") {
      throw new CanvasError("invalid_board", `cards[${index}] of type ${card.type} cannot have a parent.`);
    }
  }
}

function validateCards(cards) {
  if (!Array.isArray(cards) || cards.length > MAX_CARDS) {
    throw new CanvasError("invalid_board", `cards must be an array with at most ${MAX_CARDS} entries.`);
  }
  const ids = new Set();
  cards.forEach((card, index) => {
    validateCardFields(card, index);
    if (ids.has(card.id)) {
      throw new CanvasError("invalid_board", "Card IDs must be unique.");
    }
    ids.add(card.id);
  });
  for (const card of cards) {
    if (card.parentId !== null) {
      const parent = cards.find((candidate) => candidate.id === card.parentId);
      if (!parent || parent.type !== "epic") {
        throw new CanvasError("invalid_board", `Parent for card "${card.title}" must be an existing feature card.`);
      }
    }
  }
}

function validateBoardFields(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw new CanvasError("invalid_board", "Board data must be an object.");
  }
  assertExactKeys(fields, ["goal", "cards"], "Board data");
  assertString(fields.goal, "goal", 2000);
  validateCards(fields.cards);
}

function validateStoredBoard(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      data.format !== FORMAT || data.version !== VERSION) {
    throw new CanvasError("storage_unrecognized", "The Book Memo board has an unsupported format or version.");
  }
  assertExactKeys(data, ["format", "version", "goal", "cards", "updatedAt"], "Stored board");
  try {
    validateBoardFields({ goal: data.goal, cards: data.cards });
  } catch (error) {
    if (error instanceof CanvasError) {
      throw new CanvasError("storage_corrupt", `The Book Memo board has an invalid shape: ${error.message}`);
    }
    throw error;
  }
  assertString(data.updatedAt, "updatedAt", 40, false);
  if (Number.isNaN(Date.parse(data.updatedAt))) {
    throw new CanvasError("storage_corrupt", "The Book Memo board contains an invalid updatedAt value.");
  }
  return data;
}

function makeCard({ id = randomUUID(), title, description = "", type, priority = "should", columnId = "unsorted", labels = [], parentId = null }) {
  return { id, title, description, type, priority, columnId, labels, parentId };
}

function buildInitialCards(goal, scenarios, features, decisions) {
  const cards = [];
  const featureIds = new Set(features.map((feature) => feature.id));
  for (const feature of features) {
    cards.push(makeCard({
      id: feature.id,
      title: feature.name,
      description: feature.rationale,
      type: "epic",
      priority: feature.priority,
      labels: ["機能"],
    }));
    const template = FEATURES.find((candidate) => candidate.id === feature.id);
    for (const [title, description] of template?.tasks ?? []) {
      cards.push(makeCard({
        title,
        description,
        type: "task",
        priority: feature.priority,
        labels: ["要件整理"],
        parentId: feature.id,
      }));
    }
  }
  scenarios.forEach((scenario, index) => {
    cards.push(makeCard({
      id: `scenario-${index + 1}`,
      title: scenario,
      type: "scenario",
      priority: "should",
      labels: ["利用場面"],
    }));
  });
  for (const question of OPEN_QUESTIONS) {
    cards.push(makeCard({
      id: question.id,
      title: question.title,
      description: question.description,
      type: "decision",
      priority: "should",
      columnId: "blocked",
      labels: ["仕様決定"],
      parentId: featureIds.has(question.parentId) ? question.parentId : null,
    }));
  }
  for (const decision of decisions) {
    cards.push(makeCard({
      id: decision.id,
      title: decision.question,
      description: decision.answer,
      type: "decision",
      priority: "should",
      columnId: decision.status === "open" ? "blocked" : "done",
      labels: ["仕様決定"],
    }));
  }
  return cards;
}

function migrateLegacyPlan(data) {
  if (!data || typeof data !== "object" || Array.isArray(data) ||
      data.format !== LEGACY_FORMAT || data.version !== LEGACY_VERSION) {
    throw new CanvasError("storage_unrecognized", "The Book Memo plan has an unsupported format or version.");
  }
  const expectedKeys = ["format", "version", "goal", "scenarios", "features", "decisions", "updatedAt"];
  assertExactKeys(data, expectedKeys, "Legacy plan");
  assertString(data.goal, "goal", 2000);
  if (!Array.isArray(data.scenarios) || data.scenarios.length > 100) {
    throw new CanvasError("storage_corrupt", "The previous Book Memo plan has invalid scenarios.");
  }
  data.scenarios.forEach((scenario, index) => assertString(scenario, `scenarios[${index}]`, 500, false));
  if (!Array.isArray(data.features) || data.features.length > MAX_CARDS ||
      !Array.isArray(data.decisions) || data.decisions.length > MAX_CARDS) {
    throw new CanvasError("storage_corrupt", "The previous Book Memo plan has invalid feature or decision data.");
  }
  const featureIds = new Set();
  for (const [index, feature] of data.features.entries()) {
    if (!feature || typeof feature !== "object" || Array.isArray(feature)) {
      throw new CanvasError("storage_corrupt", `The previous plan feature ${index + 1} is invalid.`);
    }
    assertExactKeys(feature, ["id", "name", "rationale", "priority"], `Legacy feature ${index + 1}`);
    assertString(feature.id, `features[${index}].id`, 64, false);
    assertString(feature.name, `features[${index}].name`, 200, false);
    assertString(feature.rationale, `features[${index}].rationale`, 1000);
    if (!PRIORITIES.has(feature.priority) || featureIds.has(feature.id)) {
      throw new CanvasError("storage_corrupt", `The previous plan feature ${index + 1} has invalid priority or duplicate identity.`);
    }
    featureIds.add(feature.id);
  }
  for (const [index, decision] of data.decisions.entries()) {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) {
      throw new CanvasError("storage_corrupt", `The previous plan decision ${index + 1} is invalid.`);
    }
    assertExactKeys(decision, ["id", "question", "answer", "status"], `Legacy decision ${index + 1}`);
    assertString(decision.id, `decisions[${index}].id`, 64, false);
    assertString(decision.question, `decisions[${index}].question`, 500, false);
    assertString(decision.answer, `decisions[${index}].answer`, 1000);
    if (!["open", "decided"].includes(decision.status)) {
      throw new CanvasError("storage_corrupt", `The previous plan decision ${index + 1} has an invalid status.`);
    }
  }
  assertString(data.updatedAt, "updatedAt", 40, false);
  if (Number.isNaN(Date.parse(data.updatedAt))) {
    throw new CanvasError("storage_corrupt", "The previous Book Memo plan contains an invalid updatedAt value.");
  }
  const migrated = {
    format: FORMAT,
    version: VERSION,
    goal: data.goal,
    cards: buildInitialCards(data.goal, data.scenarios, data.features, data.decisions),
    updatedAt: new Date().toISOString(),
  };
  return validateStoredBoard(migrated);
}

export function createEmptyBoard() {
  return {
    format: FORMAT,
    version: VERSION,
    goal: "",
    cards: [],
    updatedAt: new Date().toISOString(),
  };
}

async function writeAtomically(filePath, data) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let temporaryExists = false;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(data, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    temporaryExists = true;
    await rename(temporaryPath, filePath);
    temporaryExists = false;
  } finally {
    if (temporaryExists) {
      await unlink(temporaryPath);
    }
  }
}

export async function loadBoard(workspaceDirectory) {
  const filePath = getBoardPath(workspaceDirectory);
  await mkdir(path.dirname(filePath), { recursive: true });

  let data;
  try {
    const fileInfo = await lstat(filePath);
    if (fileInfo.isSymbolicLink() || !fileInfo.isFile()) {
      throw new CanvasError("storage_invalid_path", "The Book Memo board path must be a regular file, not a symbolic link.");
    }
    try {
      data = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new CanvasError("storage_corrupt", "The Book Memo plan is not valid JSON; it was left unchanged.");
      }
      throw error;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const emptyBoard = createEmptyBoard();
    await writeAtomically(filePath, emptyBoard);
    return emptyBoard;
  }

  if (data?.format === LEGACY_FORMAT && data?.version === LEGACY_VERSION) {
    const migrated = migrateLegacyPlan(data);
    await writeAtomically(filePath, migrated);
    return migrated;
  }
  return validateStoredBoard(data);
}

export async function saveBoard(workspaceDirectory, fields) {
  validateBoardFields(fields);
  await loadBoard(workspaceDirectory);
  const board = validateStoredBoard({
    ...fields,
    format: FORMAT,
    version: VERSION,
    updatedAt: new Date().toISOString(),
  });
  await writeAtomically(getBoardPath(workspaceDirectory), board);
  return board;
}

export async function addBoardCard(workspaceDirectory, cardFields) {
  if (!cardFields || typeof cardFields !== "object" || Array.isArray(cardFields)) {
    throw new CanvasError("invalid_card", "Card data must be an object.");
  }
  assertExactKeys(cardFields, ["title", "description", "type", "priority", "columnId", "labels", "parentId"], "Card data");
  const board = await loadBoard(workspaceDirectory);
  const card = makeCard(cardFields);
  const nextBoard = { goal: board.goal, cards: [...board.cards, card] };
  validateBoardFields(nextBoard);
  return saveBoard(workspaceDirectory, nextBoard);
}

export async function moveBoardCard(workspaceDirectory, cardId, columnId) {
  assertString(cardId, "cardId", 64, false);
  if (!COLUMN_IDS.has(columnId)) {
    throw new CanvasError("invalid_column", "The target board column is not supported.");
  }
  const board = await loadBoard(workspaceDirectory);
  let found = false;
  const cards = board.cards.map((card) => {
    if (card.id !== cardId) return card;
    found = true;
    return { ...card, columnId };
  });
  if (!found) throw new CanvasError("card_not_found", "The requested Book Memo card was not found.");
  return saveBoard(workspaceDirectory, { goal: board.goal, cards });
}
