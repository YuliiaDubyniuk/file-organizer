import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { walkFiles } from '../utils/fileWalker.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export class Cleanup extends EventEmitter {
    async findOldFiles(directory, olderThanDays) {
        const files = await walkFiles(directory, {
            onError: (error, filePath) => {
                this.emit('file-error', { error, filePath });
            },
        });

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

    async run(directory = '.', { olderThan = 90, confirm = false } = {}) {
        if (
            typeof olderThan !== 'number' ||
            !Number.isFinite(olderThan) ||
            olderThan < 0
        ) {
            const error = new Error(
                '--older-than must be a non-negative number.',
            );
            error.code = 'EINVAL';
            throw error;
        }

        const root = path.resolve(directory);

        this.emit('cleanup-start', {
            directory: root,
            olderThan,
            confirm,
        });

        const files = await this.findOldFiles(root, olderThan);

        const totalSize = files.reduce(
            (sum, file) => sum + file.size,
            0,
        );

        this.emit('files-found', {
            files,
            total: files.length,
            totalSize,
        });

        let deletedCount = 0;
        let deletedSize = 0;
        const errors = [];

        if (!confirm || files.length === 0) {
            const result = {
                directory: root,
                olderThan,
                found: files.length,
                deleted: 0,
                totalSize,
                deletedSize: 0,
                errors,
                dryRun: !confirm,
            };

            this.emit('cleanup-complete', result);
            return result;
        }

        this.emit('deletion-start', {
            total: files.length,
            totalSize,
        });

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
                    code: error.code,
                    message: error.message,
                });

                this.emit('delete-error', {
                    file: file.path,
                    error,
                    processed: i + 1,
                    total: files.length,
                });
            }

            this.emit('progress', {
                processed: i + 1,
                total: files.length,
            });
        }

        const result = {
            directory: root,
            olderThan,
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
