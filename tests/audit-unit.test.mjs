// Unit tests for the Auditor's Rubric parsing (no worker needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { submission } from "../worker/src/audit.js";

test("audit: reads the Submission rows of the Rubric, skipping placeholders", () => {
  const csv = [
    ",Vibe Code Audit: Parts Pals,,,,",
    ",Submission,,,,",
    ',Team members,"Findley Bowie, Julia Boyer",,,',
    ",Product charter and design notes,https://docs.google.com/document/d/abcdefghijklmnopqrstuvwxyz123/edit,,,",
    ",Repo,[GitHub link],,,",
    ",Deployed app (optional),https://parts.example.com,,,",
    ",A1. The experiment,,,https://github.com/x/y/blob/main/docs/a.md,",
  ].join("\n");
  assert.deepEqual(submission(csv), { notes: "https://docs.google.com/document/d/abcdefghijklmnopqrstuvwxyz123/edit", deployed: "https://parts.example.com" });
  assert.equal(submission(csv.replace("[GitHub link]", "https://github.com/team/app")).repo, "https://github.com/team/app");
});
