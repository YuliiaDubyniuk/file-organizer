import path from "node:path";
import { fileURLToPath } from "node:url";
import { runScan } from "./commands/scan.js";
import { runDuplicates } from "./commands/duplicates.js";

const COMMANDS = Object.freeze({
    scan: {
        description: "Scan a directory and generate a report",
        run: runScan,
    },
    duplicates: {
        description: "Find duplicate files using SHA-256",
        run: runDuplicates,
    },

});

function printHelp() {
    console.log("Usage: node index.js <command> <directory>");
    console.log("\nAvailable commands:");

    for (const [name, command] of Object.entries(COMMANDS)) {
        console.log(`  ${name.padEnd(12)} ${command.description}`);
    }
}

async function main() {
    const [commandName, directory] = process.argv.slice(2);

    if (!commandName || commandName === "--help" || commandName === "-h") {
        printHelp();
        return;
    }

    const command = COMMANDS[commandName];

    if (!command) {
        console.error(`Unknown command: ${commandName}\n`);
        printHelp();
        process.exitCode = 1;
        return;
    }

    if (!directory) {
        console.error(`Please provide a directory for "${commandName}".`);
        console.log(`Usage: node index.js ${commandName} <directory>`);
        process.exitCode = 1;
        return;
    }

    try {
        await command.run(directory);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
    }
}

const currentFile = fileURLToPath(import.meta.url);
const isMain =
    process.argv[1] &&
    path.resolve(process.argv[1]) === currentFile;

if (isMain) {
    main();
}

export { COMMANDS, main, printHelp };
