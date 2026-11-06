// New document from a template, on the editor's New File menu.
//
// This is the one feature in this extension that is genuinely a *client*
// concern, which is why it lives here rather than behind the language
// server. "The New File menu" is a VS Code construct; there is no LSP
// request for it, and a server that grew one would be answering a question
// only one editor asks.
//
// What it is NOT is a second place that knows what a Markdoc document means.
// A template is an ordinary file in the corpus, written by a writer, and
// this copies it and substitutes a handful of obvious placeholders. The
// moment it starts generating frontmatter from rules, those rules have to
// agree with the linter's, and that is the arrangement being retired.

import { ExtensionContext, Uri, window, workspace, commands } from 'vscode';

const DEFAULT_DIR = '.tooling/templates';

/** Placeholders a template may use. Deliberately few and obvious. */
function substitute(body: string, title: string, slug: string): string {
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
  return body
    .replace(/\{\{\s*TITLE\s*\}\}/g, title)
    .replace(/\{\{\s*SLUG\s*\}\}/g, slug)
    .replace(/\{\{\s*DATE\s*\}\}/g, date)
    .replace(/\{\{\s*ID\s*\}\}/g, slug);
}

/** `Some Title.md` -> `some_title`, matching how this corpus names files. */
function slugOf(name: string): string {
  return name
    .replace(/\.md$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const STARTER = `---
id: item-{{SLUG}}
doc_type: article
title: {{TITLE}}
status: draft
version: "1.0"
language: en
releaseDate: "{{DATE}}"
updateDate: "{{DATE}}"
---

# {{TITLE}} {% tag "{{SLUG}}" /%}

Write the article here.
`;

export function register(context: ExtensionContext): void {
  context.subscriptions.push(
    commands.registerCommand('markdoc.newFromTemplate', () => newFromTemplate())
  );
}

async function newFromTemplate(): Promise<void> {
  const folder = workspace.workspaceFolders?.[0];
  if (!folder) {
    window.showErrorMessage('Open the documentation folder first.');
    return;
  }

  const configured = workspace
    .getConfiguration('markdoc')
    .get<string>('templateDirectory', DEFAULT_DIR);
  const dir = Uri.joinPath(folder.uri, configured);

  let entries: [string, unknown][];
  try {
    entries = (await workspace.fs.readDirectory(dir)) as [string, unknown][];
  } catch {
    await offerToCreateDirectory(dir, configured);
    return;
  }

  const templates = entries
    .map(([name]) => name)
    .filter((name) => name.toLowerCase().endsWith('.md'))
    .sort();

  if (templates.length === 0) {
    await offerToCreateDirectory(dir, configured);
    return;
  }

  const picked = await window.showQuickPick(templates, {
    title: 'New Markdoc document',
    placeHolder: `Template from ${configured}`,
  });
  if (!picked) {
    return;
  }

  const filename = await window.showInputBox({
    title: 'File name',
    prompt: 'Created next to the file that is open, or at the root.',
    value: 'new_document.md',
    validateInput: (v) => {
      if (!v.trim()) return 'A name is required.';
      if (v.includes('/') || v.includes('\\')) return 'Name only — no directories.';
      if (!v.toLowerCase().endsWith('.md')) return 'Must end in .md';
      return undefined;
    },
  });
  if (!filename) {
    return;
  }

  // Next to whatever is open, because that is nearly always the section the
  // writer is working in. Falling back to the workspace root is better than
  // guessing a section.
  const active = window.activeTextEditor?.document.uri;
  const parent =
    active && active.scheme === 'file' ? Uri.joinPath(active, '..') : folder.uri;
  const target = Uri.joinPath(parent, filename);

  try {
    await workspace.fs.stat(target);
    window.showErrorMessage(`${filename} already exists here.`);
    return;
  } catch {
    // Does not exist, which is what we want.
  }

  const raw = await workspace.fs.readFile(Uri.joinPath(dir, picked));
  const slug = slugOf(filename);
  const title = slug.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const body = substitute(new TextDecoder().decode(raw), title, slug);

  await workspace.fs.writeFile(target, new TextEncoder().encode(body));
  const doc = await workspace.openTextDocument(target);
  await window.showTextDocument(doc);
}

async function offerToCreateDirectory(dir: Uri, shown: string): Promise<void> {
  const create = 'Create it';
  const answer = await window.showInformationMessage(
    `No templates found in ${shown}. Templates are ordinary .md files; ` +
      '{{TITLE}}, {{SLUG}} and {{DATE}} are substituted when one is used.',
    create
  );
  if (answer !== create) {
    return;
  }
  await workspace.fs.createDirectory(dir);
  const starter = Uri.joinPath(dir, 'article.md');
  await workspace.fs.writeFile(starter, new TextEncoder().encode(STARTER));
  const doc = await workspace.openTextDocument(starter);
  await window.showTextDocument(doc);
}
