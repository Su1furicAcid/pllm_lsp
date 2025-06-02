/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	DocumentDiagnosticReportKind,
	type DocumentDiagnosticReport,
	Hover,
	HoverParams
} from 'vscode-languageserver/node';

import {
	TextDocument
} from 'vscode-languageserver-textdocument';

import { spawn } from 'child_process';
import * as fs from 'fs';
// import * as url from 'url';
import * as path from 'path';
import * as os from 'os';

import hoverData from './data/hover/hover_data.js';
import completionData from './data/completion/completion_data.js';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents = new TextDocuments(TextDocument);

let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
// let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;

	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	// hasDiagnosticRelatedInformationCapability = !!(
	// 	capabilities.textDocument &&
	// 	capabilities.textDocument.publishDiagnostics &&
	// 	capabilities.textDocument.publishDiagnostics.relatedInformation
	// );

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: false
			},
			diagnosticProvider: {
				interFileDependencies: false,
				workspaceDiagnostics: false
			},
			hoverProvider: true
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

const sliceCurrentWord = (text: string, offset: number): string => {
	const left = text.slice(0, offset).search(/\b\w+$/);
	const right = text.slice(offset).search(/\W/);
	let word = '';
	if (left !== -1 && right !== -1) {
		word = text.slice(left, offset + right);
	} else if (left !== -1) {
		word = text.slice(left);
	} else if (right !== -1) {
		word = text.slice(offset, offset + right);
	}
	if (!word) { return ''; }
	return word;
};

connection.onHover((params: HoverParams): Promise<Hover> => {
	const document = documents.get(params.textDocument.uri);
	if (!document) { return Promise.resolve({ contents: [] }); }
	const offset = document.offsetAt(params.position);
	const text = document.getText();
	const word = sliceCurrentWord(text, offset);
	if (!word) { return Promise.resolve({ contents: [] }); }
	const keywordData = hoverData.intraFuncs.find(k => k.name === word) || hoverData.keyWords.find(k => k.name === word);
	if (!keywordData) { return Promise.resolve({ contents: [] }); }
	return Promise.resolve({
		contents: {
			kind: 'markdown',
			value: `**${keywordData.name}**\n\n${keywordData.description}\n\n${keywordData.signature}`
		}
	});
});

connection.onCompletion(
	(params: TextDocumentPositionParams): CompletionItem[] => {
		const document = documents.get(params.textDocument.uri);
		if (!document) { return []; }
		const offset = document.offsetAt(params.position);
		const text = document.getText();
		const word = sliceCurrentWord(text, offset);
		if (!word) { return []; }
		return completionData.keywords
			.filter(c => c.startsWith(word))
			.map((c, idx) => ({
				label: c,
				kind: CompletionItemKind.Keyword,
				data: idx
			}));
	}
);

// The example settings
interface ExampleSettings {
	maxNumberOfProblems: number;
}

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
let globalSettings: ExampleSettings = defaultSettings;

// Cache the settings of all open documents
const documentSettings = new Map<string, Thenable<ExampleSettings>>();

connection.onDidChangeConfiguration(change => {
	if (hasConfigurationCapability) {
		// Reset all cached document settings
		documentSettings.clear();
	} else {
		globalSettings = (
			(change.settings.languageServerExample || defaultSettings)
		);
	}
	// Refresh the diagnostics since the `maxNumberOfProblems` could have changed.
	// We could optimize things here and re-fetch the setting first can compare it
	// to the existing setting, but this is out of scope for this example.
	connection.languages.diagnostics.refresh();
});

function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
	if (!hasConfigurationCapability) {
		return Promise.resolve(globalSettings);
	}
	let result = documentSettings.get(resource);
	if (!result) {
		result = connection.workspace.getConfiguration({
			scopeUri: resource,
			section: 'languageServerExample'
		});
		documentSettings.set(resource, result);
	}
	return result;
}

// Only keep settings for open documents
documents.onDidClose(e => {
	documentSettings.delete(e.document.uri);
});


connection.languages.diagnostics.on(async (params) => {
	const document = documents.get(params.textDocument.uri);
	if (document !== undefined) {
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: await validateTextDocument(document)
		} satisfies DocumentDiagnosticReport;
	} else {
		// We don't know the document. We can either try to read it from disk
		// or we don't report problems for it.
		return {
			kind: DocumentDiagnosticReportKind.Full,
			items: []
		} satisfies DocumentDiagnosticReport;
	}
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async change => {
	const diagnostics = await validateTextDocument(change.document);
	await connection.sendDiagnostics({ uri: change.document.uri, diagnostics });
});

function log(message: string) {
	fs.appendFileSync('D:/pllm_lsp/server/logs/debug.log', `${new Date().toISOString()}: ${message}\n`);
}

// function uriToFilePath(uri: string): string {
// 	const parsed = url.parse(uri);
// 	let filePath = decodeURIComponent(parsed.pathname || '');

// 	// 处理 Windows 路径
// 	if (process.platform === 'win32' && filePath.startsWith('/')) {
// 		filePath = filePath.substring(1);
// 	}

// 	return filePath;
// }

async function validateTextDocument(textDocument: TextDocument): Promise<Diagnostic[]> {
	const settings = await getDocumentSettings(textDocument.uri);
	if (settings.maxNumberOfProblems <= 0) {
		// No validation needed
		return [];
	}
	return new Promise<Diagnostic[]>((resolve) => {
		// Run the Python diagnostics script
		const tempFilePath = path.join(os.tmpdir(), `pllm_lsp_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
		fs.writeFileSync(tempFilePath, textDocument.getText(), 'utf8');
		const pythonProcess = spawn('python', ['D:/pllm_c/diagnostics.py', tempFilePath], {
			cwd: 'D:/pllm_c/'
		});
		let outputData = '';
		let errorData = '';
		pythonProcess.stdout.on('data', (data) => {
			outputData += data.toString();
		});
		pythonProcess.stderr.on('data', (data) => {
			errorData += data.toString();
		});
		pythonProcess.on('close', (code) => {
			log(`Python process exited with code ${code}`);
			log(`Output: ${outputData}`);
			log(`Error: ${errorData}`);
			const diagnostics: Diagnostic[] = [];
			if (code !== 0) {
				connection.console.error(`Python process exited with code ${code}`);
				connection.console.error(`Error: ${errorData}`);
				return resolve(diagnostics);
			}
			try {
				const origin = JSON.parse(outputData);
				const origin_result = origin.result;
				if (origin_result == 'success') { resolve([]); }
				const origin_diagnostics = origin.diagnostics;
				log(`Parsed diagnostics: ${JSON.stringify(origin_diagnostics)}`);
				for (const diagnostic of origin_diagnostics) {
					diagnostics.push({
						severity: DiagnosticSeverity.Error,
						range: {
							start: { line: diagnostic.start.line, character: diagnostic.start.column },
							end: { line: diagnostic.end.line, character: diagnostic.end.column }
						},
						message: diagnostic.message,
						source: 'diagnostics'
					});
				}
			} catch (e) {
				connection.console.error(`Failed to parse diagnostics: ${e}`);
			}
			log(`Diagnostics: ${JSON.stringify(diagnostics)}`);
			resolve(diagnostics);
		});
	});
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received a file change event');
});

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
