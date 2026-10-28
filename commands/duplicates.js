
import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { hashFile } from '../utils/hash.js';

export class DuplicateFinder extends EventEmitter {
    async find(directory = '.') {
        const root = path.resolve(directory);
        const rootStat = await fs.stat(root);

        if (!rootStat.isDirectory()) {
            throw new Error(`Path is not a directory: ${root}`);
        }

        console.log(`Search duplicates in: ${root}`);

        // recursively gather files and their sizes
        const folders = [root];
        const files = [];

        while (folders.length > 0) {
            const currentFolder = folders.pop();
            let entries;

            try {
                entries = await fs.readdir(currentFolder, {
                    withFileTypes: true,
                });
            } catch (error) {
                console.error(
                    `Error while reading directory ${currentFolder}: ${error.message}`,
                );
                continue;
            }

            for (const entry of entries) {
                const fullPath = path.join(currentFolder, entry.name);

                if (entry.isDirectory()) {
                    folders.push(fullPath);
                    continue;
                }

                if (!entry.isFile()) {
                    continue;
                }

                try {
                    const stat = await fs.stat(fullPath);

                    files.push({
                        path: fullPath,
                        size: stat.size,
                    });
                } catch (error) {
                    console.error(
                        `Error while getting info about file ${fullPath}: ${error.message}`,
                    );
                }
            }
        }

        console.log(`Files found: ${files.length}`);

        // group files by size
        const filesBySize = new Map();

        for (const file of files) {
            if (!filesBySize.has(file.size)) {
                filesBySize.set(file.size, []);
            }

            filesBySize.get(file.size).push(file);
        }

        // leave only files with same size
        const candidates = [];

        for (const sameSizeFiles of filesBySize.values()) {
            if (sameSizeFiles.length > 1) {
                candidates.push(...sameSizeFiles);
            }
        }

        console.log(`Files for SHA-256 check: ${candidates.length}`);

        // hash files and group by hash
        const filesByHash = new Map();

        for (let i = 0; i < candidates.length; i++) {
            const file = candidates[i];

            try {
                const hash = await hashFile(file.path);

                if (!filesByHash.has(hash)) {
                    filesByHash.set(hash, []);
                }

                filesByHash.get(hash).push(file);
            } catch (error) {
                console.error(
                    `Error while reading file ${file.path}: ${error.message}`,
                );
            }

            this.emit('file-processed', {
                file: file.path,
                processed: i + 1,
                total: candidates.length,
            });
        }

        //create duplicates list
        const duplicates = [];

        for (const [hash, matchingFiles] of filesByHash) {
            if (matchingFiles.length < 2) {
                continue;
            }

            const copyCount = matchingFiles.length;
            const size = matchingFiles[0].size;

            duplicates.push({
                hash,
                files: matchingFiles.map((file) => file.path),
                copyCount,
                size,
                wastedSpace: size * (copyCount - 1),
            });
        }

        const totalWastedSpace = duplicates.reduce(
            (total, group) => total + group.wastedSpace,
            0,
        );

        const result = {
            scannedFiles: files.length,
            hashedFiles: candidates.length,
            duplicateGroups: duplicates,
            totalDuplicateGroups: duplicates.length,
            totalWastedSpace,
        };

        this.emit('duplicates-found', result);

        return result;
    }
}

// converts bytes into a readable format
function formatSize(bytes) {
    if (bytes === 0) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const unitIndex = Math.min(
        Math.floor(Math.log(bytes) / Math.log(1024)),
        units.length - 1,
    );

    const size = bytes / 1024 ** unitIndex;

    return `${size.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

// display search results
export function printDuplicatesReport(result) {
    console.log('\n========== REPORT ON DUPLICATES ==========');
    console.log(`Total scanned files: ${result.scannedFiles}`);
    console.log(`Files checked with hash : ${result.hashedFiles}`);

    if (result.totalDuplicateGroups === 0) {
        console.log('\nNo duplicates found.');
    } else {
        for (const [index, group] of result.duplicateGroups.entries()) {
            console.log(`\nDuplicates group №${index + 1}`);
            console.log(`SHA-256: ${group.hash}`);
            console.log(`Copies quantity: ${group.copyCount}`);
            console.log(`One file size: ${formatSize(group.size)}`);
            console.log(
                `Wasted space in group: ${formatSize(group.wastedSpace)}`,
            );
            console.log('File paths:');

            for (const filePath of group.files) {
                console.log(`  ${filePath}`);
            }
        }
    }

    console.log('\n========== RESULT ==========');
    console.log(`Duplicates group q-ty: ${result.totalDuplicateGroups}`);
    console.log(
        `Total wasted space: ${formatSize(result.totalWastedSpace)}`,
    );
}


export async function runDuplicates(directory = '.') {
    const finder = new DuplicateFinder();

    finder.on('file-processed', ({ processed, total }) => {
        console.log(`Перевірено файлів: ${processed}/${total}`);
    });

    finder.on('duplicates-found', (result) => {
        printDuplicatesReport(result);
    });

    await finder.find(directory);
}
