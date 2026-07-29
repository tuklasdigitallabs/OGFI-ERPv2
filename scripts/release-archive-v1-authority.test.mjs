import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const read = (name) => readFileSync(fileURLToPath(new URL(`./${name}`, import.meta.url)), "utf8");

test("release-archive/v1 source tooling has only fixed Git-object and local-file authority", () => {
  const library = read("release-archive-v1-lib.mjs");
  const command = read("release-archive-v1.mjs");
  const source = `${library}\n${command}`;
  assert.match(library, /const GIT = "\/usr\/bin\/git"/);
  assert.match(library, /spawnSync\(GIT, \["--no-replace-objects", \.\.\.args\]/);
  assert.match(library, /GIT_CONFIG_NOSYSTEM: "1"/);
  assert.match(library, /GIT_CONFIG_GLOBAL: "\/dev\/null"/);
  assert.match(library, /GIT_NO_REPLACE_OBJECTS: "1"/);
  assert.match(command, /constants\.O_RDONLY \| constants\.O_NOFOLLOW/);
  assert.match(command, /mkdtempSync\(join\(root, "\.release-archive-v1-"\)\)/);
  assert.doesNotMatch(source, /\b(?:docker|compose|buildx|podman|registry|https?|fetch|ssh|scp|systemctl|credential|token|secret)\b/i);
  assert.doesNotMatch(source, /\b(?:net|http|https|tls|child_process\.exec|spawn\()\b/i);
});
