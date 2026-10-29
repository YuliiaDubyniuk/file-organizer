
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runScan } from "./lib/scanner.js";
import { runDuplicates } from "./lib/duplicates.js";
import { runOrganize } from "./lib/organizer.js";

const COMMANDS = Object.freeze({
    scan: {
        description: "Scan a directory and generate a report",
        run: runScan,
    },
    duplicates: {
        description: "Find duplicate files using SHA-256",
        run: runDuplicates,
    },
    organize: {
        description: "Sort and copy files into category folders",
        run: runOrganize,
    },
});

function printHelp() {
    console.log("Usage: node file-organizer.js <command> [arguments]");
    console.log("\nAvailable commands:");

    for (const [name, command] of Object.entries(COMMANDS)) {
        console.log(`  ${name.padEnd(12)} ${command.description}`);
    }

    console.log("\nExamples:");
    console.log("  node file-organizer.js scan ./Downloads");
    console.log("  node file-organizer.js duplicates ./Downloads");
    console.log(
        "  node file-organizer.js organize ./Downloads --output ./Organized",
    );
}

async function main() {
    const args = process.argv.slice(2);
    const [commandName] = args;

    if (
        !commandName ||
        commandName === "--help" ||
        commandName === "-h"
    ) {
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

    try {
        // handle the organize command separately because it accepts --output
        if (commandName === "organize") {
            const sourceDirectory = args[1];
            const outputIndex = args.indexOf("--output");
            const outputDirectory =
                outputIndex !== -1 ? args[outputIndex + 1] : undefined;

            if (
                !sourceDirectory ||
                sourceDirectory.startsWith("--") ||
                !outputDirectory ||
                outputDirectory.startsWith("--")
            ) {
                console.error(
                    "Please provide a source directory and an output directory.\n",
                );
                console.log(
                    "Usage: node file-organizer.js organize <source> --output <target>",
                );
                process.exitCode = 1;
                return;
            }

            await command.run(sourceDirectory, outputDirectory);
            return;
        }

        // scan and duplicates commands accept a single directory
        const directory = args[1];

        if (!directory || directory.startsWith("--")) {
            console.error(
                `Please provide a directory for "${commandName}".\n`,
            );
            console.log(
                `Usage: node file-organizer.js ${commandName} <directory>`,
            );
            process.exitCode = 1;
            return;
        }

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
