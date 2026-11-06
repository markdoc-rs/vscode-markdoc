// The VS Code client. It starts `markdoc-ls` and gets out of the way.
//
// Every language feature a writer sees -- the diagnostics, the completions,
// the go-to-definition, the colouring of tags -- comes from the server,
// which is the same code CI runs. A client that knew anything about Markdoc
// would be a third place for the rules to disagree, and the one being
// replaced is exactly that: `markdoc_extension/` carries 2 090 lines of
// hand-written providers that re-derive, in TypeScript and by regular
// expression, what the parser already knows. Besides starting and
// restarting the server, the one thing this extension does itself is a
// question only an editor asks: a new document from a template, on the
// New File menu (templates.ts).
//
// No grammar of its own: that extension's TextMate grammar and themes do
// not move here. This attaches the server to VS Code's own `markdown`
// language rather than defining a Markdoc one -- `.md` is what the corpus
// is -- and that language's grammar has no rule for `{% %}` tags. What
// colours a tag is the server's semantic tokens, computed by the same parser
// that produces the diagnostics, in standard token types a colour theme
// already styles. VS Code shows them when semantic highlighting is on, which
// by default the colour theme decides (README.md has the setting).

import { ExtensionContext, window, workspace, commands } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import * as templates from './templates';

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  await start(context);

  context.subscriptions.push(
    commands.registerCommand('markdoc.restartServer', async () => {
      await stop();
      await start(context);
      window.showInformationMessage('Markdoc language server restarted.');
    })
  );

  // The New File menu entry. Client-side by necessity -- see templates.ts.
  templates.register(context);
}

async function start(context: ExtensionContext): Promise<void> {
  const configured = workspace
    .getConfiguration('markdoc')
    .get<string>('serverPath', 'markdoc-ls');

  const server: ServerOptions = {
    // stdio, because that is what the server speaks and what every other
    // transport would have to be translated into anyway.
    run: { command: configured, transport: TransportKind.stdio },
    debug: {
      command: configured,
      transport: TransportKind.stdio,
      options: { env: { ...process.env, RUST_BACKTRACE: '1' } },
    },
  };

  const options: LanguageClientOptions = {
    // `.md` is what the corpus is; there is no separate Markdoc language id
    // and inventing one would cost every writer their Markdown tooling.
    documentSelector: [{ scheme: 'file', language: 'markdown' }],
    // No `synchronize.fileEvents` here. The server registers its own
    // `workspace/didChangeWatchedFiles` after initialize, which every client
    // that supports dynamic registration honours -- so VS Code and Zed watch
    // the same files for the same reason, and the list lives next to the
    // code that rebuilds the index rather than in one of the two clients.
    outputChannelName: 'Markdoc',
  };

  client = new LanguageClient('markdoc', 'Markdoc', server, options);

  try {
    await client.start();
    context.subscriptions.push(client);
  } catch (err) {
    // The overwhelmingly likely cause is that the binary is not installed,
    // so say that rather than showing a spawn error.
    client = undefined;
    window.showErrorMessage(
      `Could not start the Markdoc language server (\`${configured}\`). ` +
        'Download markdoc-ls-<platform> from github.com/markdoc-rs/markdoc-ls/releases, ' +
        'check it against the .sha256 beside it, and save it on PATH as markdoc-ls ' +
        '(markdoc-ls.exe on Windows) or set markdoc.serverPath to where you saved it. ' +
        "If your project's own setup installed it, set markdoc.serverPath to the file it " +
        "installed, or put the file's directory on PATH if the file is named markdoc-ls. " +
        `(${err instanceof Error ? err.message : err})`
    );
  }
}

async function stop(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
