import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { walkFiles } from '../utils/fileWalker.js';


const DAY_IN_MS = 24 * 60 * 60 * 1000;
const DISPLAY_LIMIT = 20;

export class Cleanup extends EventEmitter {
    async findOldFiles(directory, olderThanDays) {
        const files = await walkFiles(directory);

        const now = Date.now();

        const oldFiles = files
            .map((file) => ({
                ...file,
                ageInDays: Math.floor(
                    (now - file.mtime.getTime()) / DAY_IN_MS,
                ),
            }))
            .filter((file) => file.ageInDays > olderThanDays);

        for (const file of oldFiles) {
            this.emit('file-found', file);
        }

        return oldFiles;
    }

    formatSize(bytes) {
        if (bytes === 0) {
            return '0 B';
        }

        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const index = Math.min(
            Math.floor(Math.log(bytes) / Math.log(1024)),
            units.length - 1,
        );

        return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
    }

    printFileList(files) {
        for (const file of files.slice(0, DISPLAY_LIMIT)) {
            console.log(`\n${file.name}`);
            console.log(`  Path: ${file.path}`);
            console.log(`  Size: ${this.formatSize(file.size)}`);
            console.log(
                `  Modified: ${file.ageInDays} days ago (${file.mtime.toLocaleDateString()})`,
            );
        }

        if (files.length > DISPLAY_LIMIT) {
            console.log(`\n... (${files.length - DISPLAY_LIMIT} more files)`);
        }
    }

    async run(directory, { olderThan = 90, confirm = false } = {}) {
        if (
            typeof olderThan !== 'number' ||
            !Number.isFinite(olderThan) ||
            olderThan < 0
        ) {
            throw new Error('--older-than must be a non-negative number.');
        }

        const root = path.resolve(directory);

        console.log(`Cleanup: ${root}`);
        console.log(`Looking for files older than ${olderThan} days...\n`);

        const files = await this.findOldFiles(root, olderThan);
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);

        console.log(`Found ${files.length} files to delete:`);
        console.log('━'.repeat(50));

        this.printFileList(files);

        console.log('\n' + '━'.repeat(50));
        console.log(`Total: ${files.length} files (${this.formatSize(totalSize)})`);

        let deletedCount = 0;
        let deletedSize = 0;
        const errors = [];

        if (!confirm) {
            console.log(
                '\n DRY RUN MODE: No files were deleted. ' +
                'To actually delete these files, run with --confirm.',
            );

            const result = {
                found: files.length,
                deleted: 0,
                totalSize,
                deletedSize: 0,
                errors: [],
                dryRun: true,
            };

            this.emit('cleanup-complete', result);
            return result;
        }

        if (files.length === 0) {
            console.log('\nNo files need to be deleted.');

            const result = {
                found: 0,
                deleted: 0,
                totalSize: 0,
                deletedSize: 0,
                errors: [],
                dryRun: false,
            };

            this.emit('cleanup-complete', result);
            return result;
        }

        console.log(
            `\n DELETING ${files.length} files ` +
            `(${this.formatSize(totalSize)}). This action cannot be undone!`,
        );

        console.log('\nDeleting...');

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            try {
                await fs.unlink(file.path);

                deletedCount++;
                deletedSize += file.size;

                this.emit('file-deleted', {
                    file: file.path,
                    size: file.size,
                    processed: i + 1,
                    total: files.length,
                });
            } catch (error) {
                errors.push({
                    file: file.path,
                    message: error.message,
                });

                console.error(
                    `\nCannot delete ${file.path}: ${error.message}`,
                );
            }

            process.stdout.write(
                `\rProgress: ${i + 1}/${files.length}`,
            );
        }

        console.log('\n\n Cleanup complete!');
        console.log(
            `Deleted: ${deletedCount} files (${this.formatSize(deletedSize)} freed)`,
        );

        if (errors.length > 0) {
            console.log(`Failed to delete: ${errors.length} files`);
        }

        const result = {
            found: files.length,
            deleted: deletedCount,
            totalSize,
            deletedSize,
            errors,
            dryRun: false,
        };

        this.emit('cleanup-complete', result);
        return result;
    }
}

export async function runCleanup(
    directory = '.',
    { olderThan = 90, confirm = false } = {},
) {
    const cleanup = new Cleanup();

    return cleanup.run(directory, { olderThan, confirm });
}
