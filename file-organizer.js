import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Scanner, printReport } from './lib/scanner.js';
import { DuplicateFinder, printDuplicatesReport } from './lib/duplicates.js';
import { Organizer } from './lib/organizer.js';
import { formatSize } from './utils/formatSize.js';
import { Cleanup } from './lib/cleanup.js';

const COMMANDS = Object.freeze({
    scan: {
        description: 'Scan a directory and generate a report',
        run: runScan,
    },
    duplicates: {
        description: 'Find duplicate files using SHA-256',
        run: runDuplicates,
    },
    organize: {
        description: 'Sort and copy files into category folders',
        run: runOrganize,
    },
    cleanup: {
        description: 'Find and delete old files',
        run: runCleanup,
    },
});

function drawProgressBar(current, total, width = 20) {
    const percentage = total === 0 ? 0 : current / total;
    const filled = Math.round(percentage * width);
    const bar = '█'.repeat(filled) + '░'.repeat(width - filled);

    return `${bar} ${current}/${total}`;
}

async function runScan(directory = '.') {
    const scanner = new Scanner();

    scanner.on('scan-start', ({ directory }) => {
        console.log(`Scanning: ${directory}`);
    });

    scanner.on('progress', ({ current, total }) => {
        process.stdout.write(
            `\r${drawProgressBar(current, total)}`,
        );

        if (current === total) {
            console.log();
        }
    });

    scanner.on('scan-complete', (stats) => {
        console.log(`Scanning completed: ${stats.totalFiles} files.`);
        printReport(stats);
    });

    return scanner.scan(directory);
}


async function runDuplicates(directory = '.') {
    const finder = new DuplicateFinder();

    finder.on('search-start', ({ directory }) => {
        console.log(`\nSearching for duplicates in: ${directory}`);
    });

    finder.on('files-found', ({ total }) => {
        console.log(`Files found: ${total}`);
    });

    finder.on('hashing-start', ({ total }) => {
        if (total === 0) {
            console.log('No files with matching sizes to hash.');
            return;
        }

        process.stdout.write('Calculating hashes... ');
    });

    finder.on('file-processed', ({ processed, total }) => {
        const bar = drawProgressBar(processed, total);

        process.stdout.write(
            `\rCalculating hashes... ${bar} files`,
        );

        if (processed === total) {
            console.log();
        }
    });

    finder.on('file-error', ({ error, filePath }) => {
        let message;

        if (error.code === 'ENOENT') {
            message = 'File or directory not found';
        } else if (error.code === 'EACCES' || error.code === 'EPERM') {
            message = 'Permission denied';
        } else if (error.code === 'ENOTDIR') {
            message = 'Path is not a directory';
        } else {
            message = error.message;
        }

        console.error(`\nCannot process "${filePath}": ${message}`);
    });

    finder.on('duplicates-found', (result) => {
        printDuplicatesReport(result);
    });

    return finder.find(directory);
}


async function runOrganize(sourceDirectory, outputDirectory) {
    if (!sourceDirectory || !outputDirectory) {
        throw new Error(
            'Usage: node file-organizer.js organize <source> --output <target>',
        );
    }

    const organizer = new Organizer();

    organizer.on('organize-start', ({ source, target }) => {
        console.log(`\nOrganizing: ${source}`);
        console.log(`Target: ${target}`);
    });

    organizer.on('folders-created', ({ categories }) => {
        console.log('\nCreated category folders:');

        for (const category of categories) {
            console.log(`  ${category}/`);
        }
    });

    organizer.on('files-found', ({ total }) => {
        console.log(`\nFiles found: ${total}`);
        console.log('Copying files...');
    });

    organizer.on('copy-start', ({ processed, total }) => {
        process.stdout.write(
            `\r${drawProgressBar(processed, total)} files processed`
        );
    });

    organizer.on('copy-error', ({ file, error }) => {
        console.error(`\nCannot copy "${file}": ${error.message}`);
    });

    organizer.on('file-error', ({ filePath, error }) => {
        console.error(
            `\nCannot scan "${filePath}": ${error.message}`,
        );
    });

    organizer.on('organize-complete', (result) => {
        console.log('\n\nOrganization complete!');
        console.log('\nSummary:');

        for (const [category, data] of Object.entries(result.categories)) {
            console.log(
                `  ${category}: ${data.count} files, ` +
                `${formatSize(data.size)} → ` +
                `${path.join(result.target, category)}`,
            );
        }

        console.log(
            `\nTotal copied: ${result.copiedCount} files ` +
            `(${formatSize(result.copiedSize)})`,
        );

        if (result.errorCount > 0) {
            console.log(`Files that could not be copied: ${result.errorCount}`);
        }
    });

    return organizer.organize(sourceDirectory, outputDirectory);
}


async function runCleanup(
    directory = '.',
    { olderThan = 90, confirm = false } = {},
) {
    const cleanup = new Cleanup();
    const displayLimit = 20;

    cleanup.on('cleanup-start', ({ directory, olderThan, confirm }) => {
        console.log(`\nCleanup: ${directory}`);
        console.log(`Looking for files older than ${olderThan} days...`);

        if (confirm) {
            console.log('Delete mode enabled.');
        } else {
            console.log('Dry run mode: files will not be deleted.');
        }
    });

    cleanup.on('file-error', ({ filePath, error }) => {
        console.error(
            `\nCannot scan "${filePath}": ${error.message}`,
        );
    });

    cleanup.on('files-found', ({ files, total, totalSize }) => {
        console.log(`\nFound ${total} files:`);
        console.log('━'.repeat(50));

        for (const file of files.slice(0, displayLimit)) {
            console.log(`\n${file.name}`);
            console.log(`  Path: ${file.path}`);
            console.log(`  Size: ${formatSize(file.size)}`);
            console.log(
                `  Modified: ${file.ageInDays} days ago ` +
                `(${file.mtime.toLocaleDateString()})`,
            )
        }

        if (total > displayLimit) {
            console.log(`\n... (${total - displayLimit} more files)`);
        }

        console.log('\n' + '━'.repeat(50));
        console.log(`Total: ${total} files (${formatSize(totalSize)})`);
    });

    cleanup.on('deletion-start', ({ total, totalSize }) => {
        console.log(
            `\nDeleting ${total} files (${formatSize(totalSize)}).`,
        );
    });

    cleanup.on('delete-error', ({ file, error }) => {
        console.error(`\nCannot delete "${file}": ${error.message}`);
    });

    cleanup.on('progress', ({ processed, total }) => {
        process.stdout.write(
            `\r${drawProgressBar(processed, total)} files processed`,
        );

        if (processed === total) {
            console.log();
        }
    });

    cleanup.on('cleanup-complete', (result) => {
        console.log('\nCleanup complete!');

        if (result.dryRun) {
            console.log('Dry run: no files were deleted.');
            console.log(
                'To delete these files, add the --confirm option.',
            );
            return;
        }

        console.log(
            `Deleted: ${result.deleted} files ` +
            `(${formatSize(result.deletedSize)} freed)`,
        );

        if (result.errors.length > 0) {
            console.log(
                `Failed to delete: ${result.errors.length} files`,
            );
        }
    });

    return cleanup.run(directory, { olderThan, confirm });
}



function printHelp() {
    console.log('Usage: node file-organizer.js <command> <directory>');
    console.log('\nCommands:');

    for (const [name, command] of Object.entries(COMMANDS)) {
        console.log(`  ${name.padEnd(12)} ${command.description}`);
    }

    console.log('\nOptions:');
    console.log('  organize <source> --output <destination>');
    console.log('  cleanup <directory> [--older-than <days>] [--confirm]');
}


async function main() {
    const args = process.argv.slice(2);
    const commandName = args[0];

    if (!commandName || commandName === 'help' || commandName === '--help') {
        printHelp();
        return;
    }

    const command = COMMANDS[commandName];

    if (!command) {
        console.error(`Unknown command: ${commandName}`);
        printHelp();
        process.exit(1);
    }

    try {
        if (commandName === 'cleanup') {
            const directory = args[1];
            const olderThanIndex = args.indexOf('--older-than');

            const olderThan = olderThanIndex !== -1
                ? Number(args[olderThanIndex + 1])
                : 90;

            const confirm = args.includes('--confirm');

            if (
                !directory ||
                directory.startsWith('--') ||
                (olderThanIndex !== -1 && (
                    args[olderThanIndex + 1] === undefined ||
                    !Number.isFinite(olderThan)
                ))
            ) {
                console.error(
                    'Usage: node file-organizer.js cleanup <directory> ' +
                    '[--older-than <days>] [--confirm]',
                );
                process.exit(1);
            }

            await command.run(directory, { olderThan, confirm });
            return;
        }
        if (commandName === 'organize') {
            const sourceDirectory = args[1];
            const outputIndex = args.indexOf('--output');

            const outputDirectory =
                outputIndex !== -1 ? args[outputIndex + 1] : undefined;

            if (
                !sourceDirectory ||
                sourceDirectory.startsWith('--') ||
                outputIndex === -1 ||
                !outputDirectory ||
                outputDirectory.startsWith('--')
            ) {
                console.error(
                    'Usage: node file-organizer.js organize <source> --output <destination>',
                );
                process.exit(1);
            }

            await command.run(sourceDirectory, outputDirectory);
            return;
        }

        const directory = args[1];

        if (!directory || directory.startsWith('--')) {
            console.error(
                `Usage: node file-organizer.js ${commandName} <directory>`,
            );
            process.exit(1);
        }

        await command.run(directory);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error(`Error: File or directory not found. ${error.message}`);
        } else if (error.code === 'EACCES' || error.code === 'EPERM') {
            console.error(`Error: Permission denied. ${error.message}`);
        } else if (error.code === 'ENOTDIR') {
            console.error(`Error: The specified path is not a directory. ${error.message}`);
        } else {
            console.error(`Error: ${error.message}`);
        }

        process.exit(1);
    }
}

const currentFile = fileURLToPath(import.meta.url);
const isMain = process.argv[1] &&
    path.resolve(process.argv[1]) === currentFile;

if (isMain) {
    main();
}
