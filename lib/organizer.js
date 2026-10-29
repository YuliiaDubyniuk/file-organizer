import fs from 'node:fs/promises';
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
            await fs.copyFile(file.sourcePath, targetPath);
        } else {
            await pipeline(
                createReadStream(file.sourcePath),
                createWriteStream(targetPath, { flags: 'wx' }),
            );
        }
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

    async organize(sourceDirectory, outputDirectory) {
        const source = path.resolve(sourceDirectory);
        const target = path.resolve(outputDirectory);

        const sourceStat = await fs.stat(source);

        if (!sourceStat.isDirectory()) {
            throw new Error(`Source path is not a directory: ${source}`);
        }

        if (source === target) {
            throw new Error(
                'Source and output directories must be different.',
            );
        }

        console.log(`Organizing: ${source}`);
        console.log(`Target: ${target}\n`);
        console.log('Creating folders...');

        await fs.mkdir(target, { recursive: true });

        for (const category of Object.keys(categories)) {
            await fs.mkdir(path.join(target, category), {
                recursive: true,
            });

            console.log(`${category}/`);
        }

        const allFiles = await walkFiles(source, {
            onError: (error, filePath) => {
                console.error(
                    `Cannot scan ${filePath}: ${error.message}`,
                );
            },
        });

        // Exclude the output directory if it is inside the source.
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

        const stats = Object.fromEntries(
            Object.keys(categories).map((category) => [
                category,
                { count: 0, size: 0 },
            ]),
        );

        let copiedCount = 0;
        let copiedSize = 0;
        let errorCount = 0;

        console.log(`\nFiles found: ${files.length}`);
        console.log('\nCopying files...');

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

        console.log('\nOrganization complete!');
        console.log('\nSummary:');

        for (const [category, data] of Object.entries(stats)) {
            console.log(
                `  ${category}: ${data.count} files → ${path.join(target, category)}/`,
            );
        }

        console.log(
            `\nTotal copied: ${copiedCount} files (${this.formatSize(copiedSize)})`,
        );

        if (errorCount > 0) {
            console.log(`Files that could not be copied: ${errorCount}`);
        }

        this.emit('organize-complete', result);

        return result;
    }
}

export async function runOrganize(sourceDirectory, outputDirectory) {
    if (!sourceDirectory || !outputDirectory) {
        throw new Error(
            'Usage: node file-organizer.js organize <source> --output <target>',
        );
    }

    const organizer = new Organizer();

    organizer.on('copy-start', ({ processed, total }) => {
        process.stdout.write(
            `\rCopying files: ${processed}/${total}`,
        );
    });

    organizer.on('copy-error', ({ file, error, processed, total }) => {
        console.error(
            `\nError copying ${file}: ${error.message} (${processed}/${total})`,
        );
    });

    await organizer.organize(sourceDirectory, outputDirectory);
}
