import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as semver from 'semver';
import { ParsedNode, Scalar, YAMLMap, YAMLSeq, parseDocument } from 'yaml';

const BASE_DIRECTORY = path.join(__dirname, '..', 'data');

function getDataPath(userVersion: string): string {
	const versions = fs.readdirSync(BASE_DIRECTORY).filter(folder => semver.valid(folder));

	// Sort versions in descending order
	const sortedVersions = versions.sort((a, b) => semver.rcompare(a, b));

	// Find the latest version that's less than or equal to the user's version
	const appropriateVersion = sortedVersions.find(version => semver.lte(version, userVersion));

	if (!appropriateVersion) {
		throw new Error(`No suitable autocompletion data found for MxOps version ${userVersion}.\nPlease update your extension or MxOps to a supported version.`);
	}

	return path.join(BASE_DIRECTORY, appropriateVersion);
}

function loadDefaultConfig(dataPath: string) {
	const defaultConfigPath = path.join(dataPath, 'default_scene.yaml');
	return fs.readFileSync(defaultConfigPath, 'utf-8');
}

function loadAutoCompletionYamlConfig(dataPath: string) {
	const filePath = path.join(dataPath, 'auto_completion.yaml');
	const rawData = fs.readFileSync(filePath, 'utf-8');
	return parseDocument(rawData);

}

function detectNumberOfTabs(document: vscode.TextDocument, position: vscode.Position): number {
	const lineText = document.lineAt(position).text;
	const spaceMatches = lineText.match(/^ +/);  // matches spaces at the start of the line
	const tabMatches = lineText.match(/^\t+/);   // matches tabs at the start of the line

	let spaceCount = spaceMatches ? spaceMatches[0].length : 0;
	let tabCount = tabMatches ? tabMatches[0].length : 0;

	return tabCount + Math.floor(spaceCount / 2);
}

function isUnderParentKey(document: vscode.TextDocument, position: vscode.Position, parentKey: string): boolean {
	const targetIndentation = detectNumberOfTabs(document, position);
	let currentLineNumber = position.line - 1; // Start from the line above

	while (currentLineNumber >= 0) {
		const line = document.lineAt(currentLineNumber);
		const lineText = line.text.trim();

		if (lineText) {  // If it's not an empty line
			// Check if the line is outdented
			if (detectNumberOfTabs(document, line.range.start) < targetIndentation) {
				return lineText.includes(parentKey);
			}
		}
		currentLineNumber--;
	}
	return false;
}

function nodeToString(node: ParsedNode, includeComments: boolean = true, parentIsSeq: boolean = false): string {
	if (node instanceof Scalar) {
		let result = '';
		if (node.value !== null) {
			result += node.value as string;
		}
		if (includeComments && node.commentBefore) {
			result = `# ${node.commentBefore}\n${result}`;
		}
		if (includeComments && node.comment) {
			result = `${result}  # ${node.comment}`;
		}
		return result;
	} else if (node instanceof YAMLMap) {
		let result = "";
		let isFirst = true;
		for (const pair of node.items) {
			let key = pair.key.toString();
			if (!isFirst && parentIsSeq) {
				key = '\t\t' + key;
			}
			const value = pair.value;
			const comments = includeComments && value?.commentBefore ? `# ${value.commentBefore}\n` : '';
			if (value instanceof YAMLSeq || value instanceof YAMLMap) {
				result += `${key}: ${comments || '\n'}${nodeToString(value, includeComments)}`;
			} else if (value !== null) {
				result += `${comments}${key}: ${nodeToString(value, includeComments)}\n`;
			} else {
				result += `${key}: {}\n`;
			}
			if (isFirst) {
				isFirst = false;
			}
		}
		if (result.length) {
			return result.substring(0, result.length - 1);  // remove last line break
		}
		return result;
	} else if (node instanceof YAMLSeq) {
		let result = "";
		for (const item of node.items) {
			if (includeComments && item.commentBefore) {
				result += `# ${item.commentBefore}\n`;
			}
			result += `\t- ${nodeToString(item, includeComments, true)}\n`;
		}
		return result;
	} else {
		throw new Error("Unsupported node type");
	}
}


function createCompletionItemfromYaml(element: ParsedNode, linePrefix: string, includeComments: boolean = true): vscode.CompletionItem {
	if (!(element instanceof YAMLMap)) {
		throw Error("element is not of type YAMLMap");
	}

	const label = element.get("label")?.toString();
	const contentNode = element.get("content");

	if (!label) {
		throw Error("label is empty");
	}

	if (contentNode === null || contentNode === undefined) {
		throw Error("contentNode is null or undefined");

	}
	const content = nodeToString(contentNode, includeComments);
	const completionItem = new vscode.CompletionItem(label, vscode.CompletionItemKind.Snippet);
	const firstLine = linePrefix.endsWith(' ') ? label : ' ' + label;
	const text = firstLine + '\n' + content;
	completionItem.insertText = text.replace(/\n/g, '\n\t'); // add a level of indentation
	return completionItem;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// fetch the user MxOps version
	const mxopsVersion = vscode.workspace.getConfiguration('mxopsHelper').get<string>('pythonLibraryVersion');
	if (mxopsVersion === undefined) {
		const message = "No MxOps version found in the extension settings";
		console.error(message);
		vscode.window.showErrorMessage(message);
		return undefined;
	}

	// find the latest autocompletion data for the user version
	let dataPath: string;
	try {
		dataPath = getDataPath(mxopsVersion);
	} catch (error) {
		if (error instanceof Error) {
			console.error(error.message);
			vscode.window.showErrorMessage(error.message);
		} else {
			console.error(error);
			vscode.window.showErrorMessage("The extension got an error while searching for data");
		}
		return undefined;
	}

	// load the default configuration
	const defaultConfig = loadDefaultConfig(dataPath);
	let configDisposable = vscode.workspace.onDidChangeTextDocument(event => {
		const doc = event.document;
		const content = doc.getText();
		if (content.trim() === 'mxops') {
			const edit = new vscode.WorkspaceEdit();
			edit.replace(doc.uri, new vscode.Range(doc.positionAt(0), doc.positionAt(content.length)), defaultConfig);
			vscode.workspace.applyEdit(edit);
		}
	});
	context.subscriptions.push(configDisposable);

	// provide the steps and checks auto completion
	//const autoCompletionConfig = loadAutoCompletionConfig(dataPath);
	const autoCompletionYamlConfig = loadAutoCompletionYamlConfig(dataPath);
	if (!autoCompletionYamlConfig || !autoCompletionYamlConfig.contents) {
		const message = "The yaml configuration of mxops-helper is empty";
		console.error(message);
		vscode.window.showErrorMessage(message);
		return undefined;
	}
	const includeComments = vscode.workspace.getConfiguration('mxopsHelper').get<boolean>('includeComments') ?? true;

	const completionProvider: vscode.CompletionItemProvider = {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
			const linePrefix = document.lineAt(position).text.slice(0, position.character);
			if (!['- type:', '- type: '].includes(linePrefix.trim())) {
				return undefined;
			}
			if (!autoCompletionYamlConfig || !autoCompletionYamlConfig.contents || !(autoCompletionYamlConfig.contents instanceof YAMLMap)) {
				return undefined;
			}
			if (isUnderParentKey(document, position, "steps:")) {
				const steps = autoCompletionYamlConfig.contents.get("steps");
				if (steps && steps instanceof YAMLSeq) {
					return steps.items.map((step: ParsedNode) => createCompletionItemfromYaml(step, linePrefix, includeComments));
				}

			} else if (isUnderParentKey(document, position, "checks:")) {
				const checks = autoCompletionYamlConfig.contents.get("checks");
				if (checks && checks instanceof YAMLSeq) {
					return checks.items.map((step: ParsedNode) => createCompletionItemfromYaml(step, linePrefix, includeComments));
				}
			}
			return undefined;
		}
	};

	let autoCompletionDisposable = vscode.languages.registerCompletionItemProvider('yaml', completionProvider, ":", " ");

	context.subscriptions.push(autoCompletionDisposable);
}

export function deactivate() { }
