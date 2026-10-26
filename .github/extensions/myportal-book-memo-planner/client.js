const boardRegion = document.querySelector("#board");
const goalRegion = document.querySelector("#goal");
const statusMessage = document.querySelector("#board-status");
const saveButton = document.querySelector("#save-board");
const addCardButton = document.querySelector("#add-card");
const dialog = document.querySelector("#card-dialog");
const cardForm = document.querySelector("#card-form");
const cardTypeSelect = document.querySelector("#card-type");
const parentSelect = document.querySelector("#card-parent");
let board;
let dirty = false;

const typeNames = {
  epic: "機能",
  task: "タスク",
  scenario: "利用場面",
  decision: "仕様判断",
};

const priorityNames = {
  must: "必須",
  should: "できれば必要",
  could: "余裕があれば",
  wont: "対象外",
};

function setStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.dataset.error = String(isError);
}

function setDirty(message = "未保存の変更があります") {
  dirty = true;
  saveButton.disabled = false;
  setStatus(message);
}

function createElement(tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createButton(label, className, onClick, ariaLabel = label) {
  const button = createElement("button", className, label);
  button.type = "button";
  button.setAttribute("aria-label", ariaLabel);
  button.addEventListener("click", onClick);
  return button;
}

function createColumnSelect(value, onChange, label) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", label);
  for (const column of board.columns) {
    const option = document.createElement("option");
    option.value = column.id;
    option.textContent = column.name;
    select.append(option);
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

function createBadge(text, className = "badge") {
  return createElement("span", className, text);
}

function getColumnName(columnId) {
  return board.columns.find((column) => column.id === columnId)?.name ?? "未整理";
}

function renderCard(card) {
  const element = createElement("article", "card");
  element.setAttribute("aria-labelledby", `card-title-${card.id}`);

  const heading = createElement("div", "card-heading");
  const title = createElement("h3", "", card.title);
  title.id = `card-title-${card.id}`;
  heading.append(title, createBadge(typeNames[card.type] ?? "カード"));
  element.append(heading);

  if (card.description) {
    element.append(createElement("p", "card-description", card.description));
  }

  const meta = createElement("div", "card-meta");
  meta.append(createBadge(priorityNames[card.priority], `badge badge-priority-${card.priority}`));
  for (const label of card.labels) meta.append(createBadge(label));
  element.append(meta);

  if (card.parentId) {
    const parent = board.cards.find((candidate) => candidate.id === card.parentId);
    if (parent) element.append(createElement("p", "parent-label", `親機能: ${parent.title}`));
  }

  if (card.type === "epic") {
    const children = board.cards.filter((candidate) => candidate.parentId === card.id);
    const completed = children.filter((child) => child.columnId === "done").length;
    element.append(createElement("p", "subtask-summary", `子タスク ${completed}/${children.length} 完了`));
  }

  const footer = createElement("div", "card-footer");
  footer.append(createColumnSelect(card.columnId, (columnId) => {
    card.columnId = columnId;
    render();
    setDirty(`${card.title}を「${getColumnName(columnId)}」へ移動しました`);
  }, `${card.title}の列`));

  const actions = createElement("div", "card-actions");
  actions.append(createButton("編集", "button button-secondary button-small", () => openCardDialog(card)));
  if (card.type === "epic") {
    actions.append(createButton("＋子", "button button-secondary button-small", () => {
      openCardDialog(null, card.id);
    }, `${card.title}の子タスクを追加`));
  }
  actions.append(createButton("削除", "button button-danger button-small", () => removeCard(card), `${card.title}を削除`));
  footer.append(actions);
  element.append(footer);
  return element;
}

function render() {
  goalRegion.textContent = board.goal;
  boardRegion.replaceChildren();
  for (const column of board.columns) {
    const cards = board.cards.filter((card) => card.columnId === column.id);
    const section = createElement("section", "column");
    section.setAttribute("aria-labelledby", `column-title-${column.id}`);
    const header = createElement("div", "column-header");
    const title = createElement("h2", "", column.name);
    title.id = `column-title-${column.id}`;
    header.append(title, createBadge(String(cards.length), "column-count"));
    const cardList = createElement("div", "column-cards");
    if (cards.length === 0) {
      cardList.append(createElement("p", "empty-column", "カードはありません"));
    } else {
      for (const card of cards) cardList.append(renderCard(card));
    }
    section.append(header, cardList);
    boardRegion.append(section);
  }
}

function refreshParentOptions(selectedParentId = "") {
  parentSelect.replaceChildren();
  const noParent = document.createElement("option");
  noParent.value = "";
  noParent.textContent = "なし";
  parentSelect.append(noParent);
  for (const parent of board.cards.filter((card) => card.type === "epic")) {
    const option = document.createElement("option");
    option.value = parent.id;
    option.textContent = parent.title;
    parentSelect.append(option);
  }
  parentSelect.value = selectedParentId;
}

function openCardDialog(card = null, parentId = "") {
  cardForm.reset();
  document.querySelector("#dialog-title").textContent = card ? "カードを編集" : "カードを追加";
  document.querySelector("#card-id").value = card?.id ?? "";
  document.querySelector("#card-title").value = card?.title ?? "";
  document.querySelector("#card-description").value = card?.description ?? "";
  cardTypeSelect.value = card?.type ?? (parentId ? "task" : "epic");
  document.querySelector("#card-priority").value = card?.priority ?? "should";
  document.querySelector("#card-column").replaceChildren();
  for (const column of board.columns) {
    const option = document.createElement("option");
    option.value = column.id;
    option.textContent = column.name;
    document.querySelector("#card-column").append(option);
  }
  document.querySelector("#card-column").value = card?.columnId ?? "unsorted";
  document.querySelector("#card-labels").value = card?.labels.join(", ") ?? "";
  refreshParentOptions(card?.parentId ?? parentId);
  parentSelect.disabled = cardTypeSelect.value !== "task" && cardTypeSelect.value !== "decision";
  dialog.showModal();
  document.querySelector("#card-title").focus();
}

function removeCard(card) {
  const childCount = board.cards.filter((candidate) => candidate.parentId === card.id).length;
  const prompt = childCount
    ? `「${card.title}」と子タスク${childCount}件を削除します。この操作は保存前なら取り消せません。`
    : `「${card.title}」を削除します。この操作は保存前なら取り消せません。`;
  if (!window.confirm(prompt)) return;
  const idsToDelete = new Set([card.id]);
  if (card.type === "epic") {
    for (const child of board.cards) {
      if (child.parentId === card.id) idsToDelete.add(child.id);
    }
  }
  board.cards = board.cards.filter((candidate) => !idsToDelete.has(candidate.id));
  render();
  setDirty("カードを削除しました。確定するには変更を保存してください");
}

cardTypeSelect.addEventListener("change", () => {
  parentSelect.disabled = cardTypeSelect.value !== "task" && cardTypeSelect.value !== "decision";
  if (parentSelect.disabled) parentSelect.value = "";
});

addCardButton.addEventListener("click", () => openCardDialog());

document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => dialog.close());

cardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const id = document.querySelector("#card-id").value;
  const labels = document.querySelector("#card-labels").value
    .split(",")
    .map((label) => label.trim())
    .filter(Boolean);
  const card = {
    id: id || crypto.randomUUID(),
    title: document.querySelector("#card-title").value.trim(),
    description: document.querySelector("#card-description").value,
    type: cardTypeSelect.value,
    priority: document.querySelector("#card-priority").value,
    columnId: document.querySelector("#card-column").value,
    labels: [...new Set(labels)],
    parentId: parentSelect.disabled || !parentSelect.value ? null : parentSelect.value,
  };
  if (id) {
    const index = board.cards.findIndex((candidate) => candidate.id === id);
    if (index < 0) {
      setStatus("編集中のカードが見つかりません。読み込み直してください。", true);
      dialog.close();
      return;
    }
    board.cards[index] = card;
  } else {
    board.cards.push(card);
  }
  dialog.close();
  render();
  setDirty(id ? "カードを更新しました" : "カードを追加しました");
});

document.querySelector("#save-board").addEventListener("click", async () => {
  if (!board || !dirty) return;
  saveButton.disabled = true;
  setStatus("保存しています…");
  try {
    const response = await fetch("/api/board", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ goal: board.goal, cards: board.cards }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "カンバンを保存できませんでした。");
    board = result;
    dirty = false;
    render();
    setStatus(`保存しました: ${new Date(board.updatedAt).toLocaleString("ja-JP")}`);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "カンバンを保存できませんでした。", true);
  } finally {
    saveButton.disabled = !dirty;
  }
});

async function loadBoard() {
  const response = await fetch("/api/board", { headers: { Accept: "application/json" } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "カンバンを読み込めませんでした。");
  board = result;
  render();
  setStatus(`最終更新: ${new Date(board.updatedAt).toLocaleString("ja-JP")}`);
}

loadBoard().catch((error) => {
  addCardButton.disabled = true;
  saveButton.disabled = true;
  setStatus(error instanceof Error ? error.message : "カンバンを読み込めませんでした。", true);
});
