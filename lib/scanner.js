
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { walkFiles } from '../utils/fileWalker.js';
import { formatSize } from '../utils/formatSize.js';

const DAY_IN_MS = 24 * 60 * 60 * 1000;

class Scanner extends EventEmitter {
    async scan(directory) {
        const root = path.resolve(directory);

        this.emit('scan-start', { directory: root });

        const files = await walkFiles(root);

        for (let i = 0; i < files.length; i++) {
            this.emit('file-found', files[i]);

            this.emit('progress', {
                current: i + 1,
                total: files.length,
            });
        }

        const statistics = this.createStatistics(files);

        this.emit('scan-complete', statistics);

        return statistics;
    }

    createStatistics(files) {
        const now = Date.now();
        const byType = new Map();

        const age = {
            last7Days: 0,
            last30Days: 0,
            olderThan90Days: 0,
        };

        for (const file of files) {
            const typeStats = byType.get(file.extension) ?? {
                count: 0,
                totalSize: 0,
            };

            typeStats.count += 1;
            typeStats.totalSize += file.size;

            byType.set(file.extension, typeStats);

            const daysOld = Math.max(
                0,
                (now - file.mtime.getTime()) / DAY_IN_MS,
            );

            if (daysOld <= 7) {
                age.last7Days += 1;
            } else if (daysOld <= 30) {
                age.last30Days += 1;
            } else if (daysOld > 90) {
                age.olderThan90Days += 1;
            }
        }

        const largestFiles = [...files]
            .sort((a, b) => b.size - a.size)
            .slice(0, 3);

        const oldestFile = files.reduce((oldest, file) => {
            if (!oldest || file.mtime < oldest.mtime) {
                return file;
            }

            return oldest;
        }, null);

        return {
            totalFiles: files.length,
            totalSize: files.reduce(
                (sum, file) => sum + file.size,
                0,
            ),
            byType,
            age,
            largestFiles,
            oldestFile,
        };
    }
}

export function printReport(stats) {
    console.log('\nScan Results:');
    console.log('─'.repeat(40));

    console.log(`Total files: ${stats.totalFiles}`);
    console.log(`Total size: ${formatSize(stats.totalSize)}`);

    console.log('\nBy File Type:');

    const types = [...stats.byType.entries()].sort(
        (a, b) => b[1].totalSize - a[1].totalSize,
    );

    for (const [extension, data] of types) {
        console.log(
            `  ${extension.padEnd(12)} ` +
            `${String(data.count).padStart(5)} files  ` +
            `${formatSize(data.totalSize)}`,
        );
    }

    console.log('\nFile Age:');
    console.log(`  Last 7 days:    ${stats.age.last7Days} files`);
    console.log(`  Last 30 days:     ${stats.age.last30Days} files`);
    console.log(`  Older than 90:  ${stats.age.olderThan90Days} files`);

    console.log('\nLargest files:');

    if (stats.largestFiles.length === 0) {
        console.log('Files not found');
    }

    stats.largestFiles.forEach((file, index) => {
        console.log(
            `  ${index + 1}. ${file.name} — ${formatSize(file.size)}`,
        );
    });

    console.log('\nOldest file:');

    if (stats.oldestFile) {
        const days = Math.floor(
            (Date.now() - stats.oldestFile.mtime.getTime()) /
            DAY_IN_MS,
        );

        console.log(
            `  ${stats.oldestFile.name} (modified ${days} days ago)`,
        );
    } else {
        console.log('Files not found');
    }
}

export { Scanner };
