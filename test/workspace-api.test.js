import assert from "node:assert/strict";
import test from "node:test";

import { resolveWorkspaceMarkdownLink, workspaceFileAssetUrl } from "../public/services/workspace-api.js";

test("relative Markdown links resolve through the selected workspace", () => {
  assert.equal(
    workspaceFileAssetUrl("/tmp/project", "reports/latest.html"),
    "/api/workspace-file-asset?workspace=%2Ftmp%2Fproject&path=reports%2Flatest.html",
  );
  assert.deepEqual(resolveWorkspaceMarkdownLink("/tmp/project", "./trump-news-latest.html"), {
    href: "/api/workspace-file-asset?workspace=%2Ftmp%2Fproject&path=trump-news-latest.html",
    previewImage: false,
  });
});

test("workspace image links are marked for chat preview", () => {
  assert.deepEqual(resolveWorkspaceMarkdownLink("/tmp/project", "./images/trump-news-latest.PNG"), {
    href: "/api/workspace-file-asset?workspace=%2Ftmp%2Fproject&path=images%2Ftrump-news-latest.PNG",
    previewImage: true,
  });
});

test("workspace links cannot traverse above the selected workspace", () => {
  assert.deepEqual(resolveWorkspaceMarkdownLink("/tmp/project", "../secret.png"), {
    href: "",
    previewImage: false,
  });
  assert.deepEqual(resolveWorkspaceMarkdownLink("/tmp/project", "https://example.com/image.png"), {
    href: "https://example.com/image.png",
    previewImage: false,
  });
});
