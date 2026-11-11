import type {
  Attachment,
  ChecklistItem,
  Comment,
  CreateChecklistItemInput,
  CreateCommentInput,
  CreateTagInput,
  Tag,
  UpdateChecklistItemInput,
  UpdateTagInput,
} from "@/bindings";
import { type Changes, type Recorder, track } from "./activity";
import { fail } from "./failure";
import { byPosition, placeAfter, previousSiblingId, rank, reposition } from "./ordering";
import type { Clock } from "./projects";
import type { State, StoredTag } from "./state";
import { optionalText, requireText } from "./text";

const ITEM_TEXT_MAX_LENGTH = 500;
const MAX_ITEMS_PER_TASK = 100;
const COMMENT_MAX_LENGTH = 10_000;
const TAG_NAME_MAX_LENGTH = 40;
const MAX_ATTACHMENTS_PER_TASK = 50;
const ATTACHMENT_SIZE_BYTES = 2048;

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
};

function baseName(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

export function createDetails(state: State, clock: Clock, record: Recorder) {
  function ensureTask(taskId: string) {
    const task = state.tasks.find((candidate) => candidate.id === taskId);
    if (task === undefined) {
      fail("NOT_FOUND", "task not found");
    }
    return task;
  }

  function itemsOf(taskId: string): ChecklistItem[] {
    return state.checklist.filter((item) => item.taskId === taskId).sort(byPosition);
  }

  function findItem(id: string): ChecklistItem {
    const item = state.checklist.find((candidate) => candidate.id === id);
    if (item === undefined) {
      fail("NOT_FOUND", "checklist item not found");
    }
    return item;
  }

  function createItem(input: CreateChecklistItemInput): ChecklistItem {
    const text = requireText("checklist item", input.text, ITEM_TEXT_MAX_LENGTH);
    const task = ensureTask(input.taskId);
    if (task.archivedAt !== null) {
      fail("CONFLICT", "archived tasks cannot receive checklist items; restore the task first");
    }
    const siblings = itemsOf(task.id);
    if (siblings.length >= MAX_ITEMS_PER_TASK) {
      fail("VALIDATION", `a checklist cannot have more than ${MAX_ITEMS_PER_TASK} items`);
    }
    const now = clock.now();
    const item: ChecklistItem = {
      id: clock.nextId("k"),
      taskId: task.id,
      text,
      isDone: false,
      position: rank(siblings.length),
      createdAt: now,
      updatedAt: now,
    };
    state.checklist.push(item);
    return item;
  }

  function updateItem(id: string, input: UpdateChecklistItemInput): ChecklistItem {
    const item = findItem(id);
    if (input.text !== undefined && input.text !== null) {
      item.text = requireText("checklist item", input.text, ITEM_TEXT_MAX_LENGTH);
    }
    if (input.isDone !== undefined && input.isDone !== null) {
      item.isDone = input.isDone;
    }
    item.updatedAt = clock.now();
    return item;
  }

  function moveItem(id: string, afterItemId: string | null): ChecklistItem {
    const item = findItem(id);
    const ordered = itemsOf(item.taskId);
    if (previousSiblingId(ordered, id) === afterItemId) {
      return item;
    }
    reposition(placeAfter(ordered, item, afterItemId));
    item.updatedAt = clock.now();
    return item;
  }

  function deleteItem(id: string): null {
    findItem(id);
    state.checklist = state.checklist.filter((item) => item.id !== id);
    return null;
  }

  function createComment(input: CreateCommentInput): Comment {
    const body = requireText("comment", input.body, COMMENT_MAX_LENGTH);
    ensureTask(input.taskId);
    const now = clock.now();
    const comment: Comment = {
      id: clock.nextId("m"),
      taskId: input.taskId,
      body,
      createdAt: now,
      updatedAt: now,
    };
    state.comments.push(comment);
    return comment;
  }

  function findComment(id: string): Comment {
    const comment = state.comments.find((candidate) => candidate.id === id);
    if (comment === undefined) {
      fail("NOT_FOUND", "comment not found");
    }
    return comment;
  }

  function updateComment(id: string, body: string): Comment {
    const comment = findComment(id);
    const text = requireText("comment", body, COMMENT_MAX_LENGTH);
    if (text !== comment.body) {
      comment.body = text;
      comment.updatedAt = clock.now();
    }
    return comment;
  }

  function deleteComment(id: string): null {
    findComment(id);
    state.comments = state.comments.filter((comment) => comment.id !== id);
    return null;
  }

  function present(tag: StoredTag): Tag {
    return {
      ...tag,
      taskCount: state.taskTags.filter((link) => link.tagId === tag.id).length,
    };
  }

  function sortedTags(tags: StoredTag[]): Tag[] {
    return [...tags]
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      .map(present);
  }

  function findTag(id: string): StoredTag {
    const tag = state.tags.find((candidate) => candidate.id === id);
    if (tag === undefined) {
      fail("NOT_FOUND", "tag not found");
    }
    return tag;
  }

  function ensureNameIsFree(name: string, ownId: string | null) {
    const lowered = name.toLowerCase();
    const taken = state.tags.some((tag) => tag.id !== ownId && tag.name.toLowerCase() === lowered);
    if (taken) {
      fail("CONFLICT", `a tag named '${name}' already exists`);
    }
  }

  function createTag(input: CreateTagInput): Tag {
    const name = requireText("tag name", input.name, TAG_NAME_MAX_LENGTH);
    ensureNameIsFree(name, null);
    const now = clock.now();
    const tag: StoredTag = {
      id: clock.nextId("g"),
      name,
      color: optionalText(input.color),
      createdAt: now,
      updatedAt: now,
    };
    state.tags.push(tag);
    return present(tag);
  }

  function updateTag(id: string, input: UpdateTagInput): Tag {
    const tag = findTag(id);
    if (input.name !== undefined && input.name !== null) {
      const name = requireText("tag name", input.name, TAG_NAME_MAX_LENGTH);
      ensureNameIsFree(name, id);
      tag.name = name;
    }
    if (input.color !== undefined) {
      tag.color = optionalText(input.color);
    }
    tag.updatedAt = clock.now();
    return present(tag);
  }

  function deleteTag(id: string): null {
    findTag(id);
    state.tags = state.tags.filter((tag) => tag.id !== id);
    state.taskTags = state.taskTags.filter((link) => link.tagId !== id);
    return null;
  }

  function listTaskTags(taskId: string): Tag[] {
    ensureTask(taskId);
    const ids = new Set(
      state.taskTags.filter((link) => link.taskId === taskId).map((link) => link.tagId),
    );
    return sortedTags(state.tags.filter((tag) => ids.has(tag.id)));
  }

  function assignTag(taskId: string, tagId: string): null {
    ensureTask(taskId);
    const tag = findTag(tagId);
    const isAssigned = state.taskTags.some(
      (link) => link.taskId === taskId && link.tagId === tagId,
    );
    if (!isAssigned) {
      state.taskTags.push({ taskId, tagId });
      const changes: Changes = {};
      track(changes, "tag", null, tag.name);
      record("task", taskId, "updated", changes);
    }
    return null;
  }

  function unassignTag(taskId: string, tagId: string): null {
    ensureTask(taskId);
    const tag = findTag(tagId);
    const before = state.taskTags.length;
    state.taskTags = state.taskTags.filter(
      (link) => !(link.taskId === taskId && link.tagId === tagId),
    );
    if (state.taskTags.length < before) {
      const changes: Changes = {};
      track(changes, "tag", tag.name, null);
      record("task", taskId, "updated", changes);
    }
    return null;
  }

  function listAttachments(taskId: string): Attachment[] {
    ensureTask(taskId);
    return state.attachments
      .filter((attachment) => attachment.taskId === taskId)
      .sort((a, b) => (a.createdAt === b.createdAt ? 0 : a.createdAt < b.createdAt ? -1 : 1));
  }

  function importAttachment(taskId: string, sourcePath: string): Attachment {
    ensureTask(taskId);
    const trimmed = sourcePath.trim();
    if (trimmed === "") {
      fail("VALIDATION", "file path cannot be empty");
    }
    const fileName = baseName(trimmed);
    if (fileName === "") {
      fail("VALIDATION", "the file has no name");
    }
    const dot = fileName.lastIndexOf(".");
    const extension = dot > 0 ? fileName.slice(dot + 1).toLowerCase() : "";
    if (extension === "") {
      fail("VALIDATION", "files without an extension are not allowed");
    }
    const mimeType = MIME_BY_EXTENSION[extension];
    if (mimeType === undefined) {
      fail("VALIDATION", `files of type '.${extension}' are not allowed`);
    }
    if (listAttachments(taskId).length >= MAX_ATTACHMENTS_PER_TASK) {
      fail("VALIDATION", `a task cannot have more than ${MAX_ATTACHMENTS_PER_TASK} attachments`);
    }
    const attachment: Attachment = {
      id: clock.nextId("f"),
      taskId,
      fileName,
      mimeType,
      sizeBytes: ATTACHMENT_SIZE_BYTES,
      createdAt: clock.now(),
    };
    state.attachments.push(attachment);
    return attachment;
  }

  function removeAttachment(id: string): null {
    if (!state.attachments.some((attachment) => attachment.id === id)) {
      fail("NOT_FOUND", "attachment not found");
    }
    state.attachments = state.attachments.filter((attachment) => attachment.id !== id);
    return null;
  }

  function openAttachment(id: string): null {
    if (!state.attachments.some((attachment) => attachment.id === id)) {
      fail("NOT_FOUND", "attachment not found");
    }
    return null;
  }

  return {
    checklist: {
      list: (taskId: string) => {
        ensureTask(taskId);
        return itemsOf(taskId);
      },
      create: createItem,
      update: updateItem,
      move: moveItem,
      remove: deleteItem,
    },
    comments: {
      list: (taskId: string) => {
        ensureTask(taskId);
        return state.comments.filter((comment) => comment.taskId === taskId);
      },
      create: createComment,
      update: updateComment,
      remove: deleteComment,
    },
    tags: {
      list: () => sortedTags(state.tags),
      create: createTag,
      update: updateTag,
      remove: deleteTag,
      listForTask: listTaskTags,
      assign: assignTag,
      unassign: unassignTag,
    },
    attachments: {
      list: listAttachments,
      import: importAttachment,
      remove: removeAttachment,
      open: openAttachment,
    },
  };
}
