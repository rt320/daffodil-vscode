import * as vscode from 'vscode'
import * as fs from 'fs';
import * as unzip from 'unzip-stream';
import * as os from 'os';
import * as child_process from 'child_process';
import { HttpClient } from 'typed-rest-client/HttpClient';
import { RestClient } from 'typed-rest-client/RestClient';

// Class for getting release data
export class Release {
    name: string;
    zipball_url: string;
    tarball_url: string;
    commit: JSON;
    node_id: string;

    constructor(name: string, zipball_url: string, tarball_url: string, commit: JSON, node_id: string) {
        this.name = name;
        this.zipball_url = zipball_url;
        this.tarball_url = tarball_url;
        this.commit = commit;
        this.node_id = node_id;
    }
}

// Function for handling getting the version of the debugger
export async function getDebugVersion(config: vscode.DebugConfiguration) {
    const client = new RestClient("client")
    let request = await client.get<Release[]>('https://api.github.com/repos/jw3/example-daffodil-debug/tags')
    
    if (request.statusCode !== 200 || !request.result) {
        const err: Error = new Error(`Check request url, and tags of the repo. Follow this template if not already https://api.github.com/repos/{owner}/{rep_name}/tags`);
        err["httpStatusCode"] = request.statusCode;
        throw err;
    }

    let releases: string[] = []
    request.result.forEach((release) => {
        releases.push(release.name);
    });

    let dapodilDebuggerVersion = await vscode.window.showQuickPick(releases);

    if (!dapodilDebuggerVersion || !(dapodilDebuggerVersion in releases)) {
        const err: Error = new Error(`Dapodil Debugger Version is not set or bad version entered.`);
        throw err;
    }

    dapodilDebuggerVersion = dapodilDebuggerVersion?.includes("v") ? dapodilDebuggerVersion : `v${dapodilDebuggerVersion}`;
    return dapodilDebuggerVersion
}


// Function for getting the da-podil debugger
export async function getDebugger(config: vscode.DebugConfiguration) {
    // If useExistingServer var set to false make sure version of debugger entered is downloaded then ran
    if (!config.useExistingServer) {
        let dapodilDebuggerVersion = await getDebugVersion(config);

        if (!dapodilDebuggerVersion) {
            const err: Error = new Error(`Dapodil Debugger Version is not set or bad version entered.`);
            throw err;
        }

        const delay = ms => new Promise(res => setTimeout(res, ms));

        if(vscode.workspace.workspaceFolders !== undefined) {
            let rootPath = vscode.workspace.workspaceFolders[0].uri.path;

            if (os.platform() === 'win32') {
                rootPath = rootPath.substring(1); // For windows the / at the start causes issues
            }

            // Code for downloading and setting up da-podil files
            if (!fs.existsSync(`${rootPath}/daffodil-debugger-${dapodilDebuggerVersion.substring(1)}`)) {
                // Get da-podil of version entered using http client
                const client = new HttpClient("client");
                const dapodilUrl = `https://github.com/jw3/example-daffodil-debug/releases/download/${dapodilDebuggerVersion}/daffodil-debugger-${dapodilDebuggerVersion.substring(1)}.zip`;
                const response = await client.get(dapodilUrl);
                
                if (response.message.statusCode !== 200) {
                    const err: Error = new Error(`Invalid dapodil release version. Check that release for version specified exists.`);
                    err["httpStatusCode"] = response.message.statusCode;
                    throw err;
                }

                // Create zip from rest call
                const filePath = `${rootPath}/daffodil-debugger-${dapodilDebuggerVersion.substring(1)}.zip`;
                const file = fs.createWriteStream(filePath);

                await new Promise((res, rej) => {
                    file.on("error", (err) => function () { throw err });
                    const stream = response.message.pipe(file);
                    stream.on("close", () => {
                        try { res(filePath); } catch (err) { rej(err); }
                    });
                });

                // Unzip file and remove zip file
                await new Promise ((res, rej) => { 
                    let stream = fs.createReadStream(filePath).pipe(unzip.Extract({ path: `${rootPath}` }));
                    stream.on("close", () => {
                        try { res(filePath); } catch (err) { rej(err); }
                    });
                });
                fs.unlinkSync(filePath);
            }

            // Stop debugger if running
            if (os.platform() === 'win32') {
                // Windows stop debugger if already running
                child_process.exec("tskill java");
            }
            else {
                // Linux/Mac stop debugger if already running and make sure script is executable
                child_process.exec("kill -9 $(ps -ef | grep 'daffodil' | grep 'jar' | awk '{ print $2 }') || return 0") // ensure debugger server not running and
                child_process.exec(`chmod +x ${rootPath}/daffodil-debugger-${dapodilDebuggerVersion.substring(1)}/bin/da-podil`)     // make sure da-podil is executable
            }

            // Assign script name based on os platform
            let scriptName = os.platform() === 'win32' ? "da-podil.bat": "./da-podil";

            // Start debugger in terminal based on scriptName
            let terminal = vscode.window.createTerminal({
                name: scriptName,
                cwd: `${rootPath}/daffodil-debugger-${dapodilDebuggerVersion.substring(1)}/bin/`,
                hideFromUser: false,
                shellPath: scriptName,
            });
            terminal.show();

            // Wait for 5000 ms to make sure debugger is running before the extension tries to connect to it
            await delay(5000);
        }
    }
}
