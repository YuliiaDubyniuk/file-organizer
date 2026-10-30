import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { pipeline } from 'node:stream/promises';
import { walkFiles } from '../utils/fileWalker.js';

const MB = 1024 * 1024;
const STREAM_THRESHOLD = 10 * MB;

const categories = {
    Documents: ['.pdf', '.docx', '.doc', '.txt', '.md', '.xlsx', '.pptx'],
    Images: ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp'],
    Archives: ['.zip', '.rar', '.tar', '.gz', '.7z'],
    Code: ['.js', '.py', '.java', '.cpp', '.html', '.css', '.json'],
    Videos: ['.mp4', '.avi', '.mkv', '.mov', '.webm'],
    Other: [],
};

export class Organizer extends EventEmitter {
    getCategory(filePath) {
        const extension = path.extname(filePath).toLowerCase();

        for (const [category, extensions] of Object.entries(categories)) {
            if (extensions.includes(extension)) {
                return category;
            }
        }

        return 'Other';
    }

    async getAvailablePath(directory, fileName) {
        const extension = path.extname(fileName);
        const baseName = path.basename(fileName, extension);

        let candidate = path.join(directory, fileName);
        let counter = 1;

        while (true) {
            try {
                await fs.access(candidate);

                candidate = path.join(
                    directory,
                    `${baseName}(${counter})${extension}`,
                );

                counter++;
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return candidate;
                }

                throw error;
            }
        }
    }

    async copyFile(file, targetPath) {
        if (file.size < STREAM_THRESHOLD) {
            await fs.copyFile(
                file.sourcePath,
                targetPath,
                constants.COPYFILE_EXCL,
            );
        } else {
            await pipeline(
                createReadStream(file.sourcePath),
                createWriteStream(targetPath, { flags: 'wx' }),
            );
        }
    }

    async organize(sourceDirectory, outputDirectory) {
        const source = path.resolve(sourceDirectory);
        const target = path.resolve(outputDirectory);

        if (source === target) {
            const error = new Error(
                'Source and output directories must be different.',
            );
            error.code = 'EINVAL';
            throw error;
        }

        this.emit('organize-start', { source, target });

        // walkFiles перевіряє джерело й повертає помилки файлової системи.
        const allFiles = await walkFiles(source, {
            onError: (error, filePath) => {
                this.emit('file-error', { error, filePath });
            },
        });

        // Не скануємо файли, які вже лежать у вихідній папці.
        const files = allFiles
            .filter((file) => {
                const relativePath = path.relative(target, file.path);

                return (
                    relativePath === '..' ||
                    relativePath.startsWith(`..${path.sep}`) ||
                    path.isAbsolute(relativePath)
                );
            })
            .map((file) => ({
                sourcePath: file.path,
                name: file.name,
                size: file.size,
                category: this.getCategory(file.name),
            }));

        // Створюємо папки категорій.
        try {
            await fs.mkdir(target, { recursive: true });

            for (const category of Object.keys(categories)) {
                await fs.mkdir(path.join(target, category), {
                    recursive: true,
                });
            }
        } catch (error) {
            error.message = `Cannot create output directories: ${error.message}`;
            throw error;
        }

        this.emit('folders-created', {
            target,
            categories: Object.keys(categories),
        });

        this.emit('files-found', { total: files.length });

        const stats = Object.fromEntries(
            Object.keys(categories).map((category) => [
                category,
                { count: 0, size: 0 },
            ]),
        );

        let copiedCount = 0;
        let copiedSize = 0;
        let errorCount = 0;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            this.emit('copy-start', {
                file: file.sourcePath,
                processed: i + 1,
                total: files.length,
            });

            try {
                const categoryDirectory = path.join(
                    target,
                    file.category,
                );

                const targetPath = await this.getAvailablePath(
                    categoryDirectory,
                    file.name,
                );

                await this.copyFile(file, targetPath);

                stats[file.category].count++;
                stats[file.category].size += file.size;
                copiedCount++;
                copiedSize += file.size;

                this.emit('copy-complete', {
                    source: file.sourcePath,
                    target: targetPath,
                    category: file.category,
                    size: file.size,
                    processed: i + 1,
                    total: files.length,
                });
            } catch (error) {
                errorCount++;

                this.emit('copy-error', {
                    file: file.sourcePath,
                    error,
                    processed: i + 1,
                    total: files.length,
                });
            }
        }

        const result = {
            source,
            target,
            totalFound: files.length,
            copiedCount,
            copiedSize,
            errorCount,
            categories: stats,
        };

        this.emit('organize-complete', result);

        return result;
    }
}
