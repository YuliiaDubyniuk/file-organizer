
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { hashFile } from '../utils/hash.js';
import { walkFiles } from '../utils/fileWalker.js';
import { formatSize } from '../utils/formatSize.js';

export class DuplicateFinder extends EventEmitter {
    async find(directory = '.') {
        const root = path.resolve(directory);

        this.emit('search-start', { directory: root });

        // pass errors of some files through event and continue with others
        const files = await walkFiles(root, {
            onError: (error, filePath) => {
                this.emit('file-error', { error, filePath });
            },
        });

        this.emit('files-found', { total: files.length });

        // group files by size
        const filesBySize = new Map();

        for (const file of files) {
            if (!filesBySize.has(file.size)) {
                filesBySize.set(file.size, []);
            }

            filesBySize.get(file.size).push(file);
        }

        // hash files with the same size
        const candidates = [];

        for (const sameSizeFiles of filesBySize.values()) {
            if (sameSizeFiles.length > 1) {
                candidates.push(...sameSizeFiles);
            }
        }

        this.emit('hashing-start', {
            total: candidates.length,
        });

        const filesByHash = new Map();
        let hashedFiles = 0;
        let failedFiles = 0;

        for (let i = 0; i < candidates.length; i++) {
            const file = candidates[i];

            try {
                const hash = await hashFile(file.path);

                if (!filesByHash.has(hash)) {
                    filesByHash.set(hash, []);
                }

                filesByHash.get(hash).push(file);
                hashedFiles++;
            } catch (error) {
                failedFiles++;

                this.emit('file-error', {
                    error,
                    filePath: file.path,
                });
            }

            this.emit('file-processed', {
                file: file.path,
                processed: i + 1,
                total: candidates.length,
            });
        }

        // create duplicate groups
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
            hashedFiles,
            failedFiles,
            duplicateGroups: duplicates,
            totalDuplicateGroups: duplicates.length,
            totalWastedSpace,
        };

        this.emit('duplicates-found', result);

        return result;
    }
}


export function printDuplicatesReport(result) {
    console.log(
        `\nFound ${result.totalDuplicateGroups} duplicate groups ` +
        `(${formatSize(result.totalWastedSpace)} wasted):`,
    );

    if (result.totalDuplicateGroups === 0) {
        console.log('No duplicates found.');
        console.log(
            `Total wasted space: ${formatSize(result.totalWastedSpace)}`,
        );
        return;
    }

    console.log('━'.repeat(50));

    for (const [index, group] of result.duplicateGroups.entries()) {
        console.log(
            `Group ${index + 1} (${group.copyCount} copies, ` +
            `${formatSize(group.size)} each):`,
        );

        console.log(`  SHA-256: ${group.hash}`);

        for (const filePath of group.files) {
            console.log(`  ${filePath}`);
        }

        console.log(
            `\n  Wasted space: ${formatSize(group.wastedSpace)}`,
        );

        console.log('━'.repeat(50));
    }

    console.log(
        `Total wasted space: ${formatSize(result.totalWastedSpace)}`,
    );
}
