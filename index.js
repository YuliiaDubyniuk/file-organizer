import fs from "node:fs/promises";
import path from "node:path";
import { EventEmitter } from "node:events";
import { fileURLToPath } from "node:url";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

class Scanner extends EventEmitter {
    async scan(directory) {
        const root = path.resolve(directory);

        let rootStat;

        try {
            rootStat = await fs.stat(root);
        } catch (error) {
            throw error;
        }

        if (!rootStat.isDirectory()) {
            throw new Error(`Provided path is not a directory: ${root}`);
        }

        const files = [];
        const folders = [root];

        console.log(`Scanning: ${root}`);

        while (folders.length > 0) {
            const currentFolder = folders.pop();
            let entries;

            try {
                entries = await fs.readdir(currentFolder, {
                    withFileTypes: true,
                });
            } catch (error) {
                console.error(`Error riding a folder: ${error.message}`);
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

                let stat;

                try {
                    stat = await fs.stat(fullPath);
                } catch (error) {
                    console.error(
                        `Error while getting information about the file: ${error.message}`,
                    );
                    continue;
                }

                const fileData = {
                    path: fullPath,
                    name: entry.name,
                    extension: path.extname(entry.name).toLowerCase() || "(other)",
                    size: stat.size,
                    mtime: stat.mtime,
                };

                files.push(fileData);

                this.emit("file-found", fileData);
                this.emit("progress", files.length);
            }
        }

        const statistics = this.createStatistics(files);

        this.emit("scan-complete", statistics);

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

            const daysOld = Math.max(0, (now - file.mtime.getTime()) / DAY_IN_MS);

            if (daysOld <= 7) {
                age.last7Days += 1;
            } else if (daysOld <= 30) {
                age.last30Days += 1;
            } else if (daysOld > 90) {
                age.olderThan90Days += 1;
            }
        }

        const largestFiles = [...files].sort((a, b) => b.size - a.size).slice(0, 3);

        const oldestFile = files.reduce((oldest, file) => {
            if (!oldest || file.mtime < oldest.mtime) {
                return file;
            }

            return oldest;
        }, null);

        return {
            totalFiles: files.length,
            totalSize: files.reduce((sum, file) => sum + file.size, 0),
            byType,
            age,
            largestFiles,
            oldestFile,
        };
    }
}

function formatSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    const units = ["KB", "MB", "GB", "TB"];
    let size = bytes / 1024;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
}

function printReport(stats) {
    console.log("\nScan Results");
    console.log("─".repeat(40));

    console.log(`Total files: ${stats.totalFiles}`);
    console.log(`Total size: ${formatSize(stats.totalSize)}`);

    console.log("\nBy File Type:");

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

    console.log("\nFile Age:");
    console.log(`  Last 7 days:    ${stats.age.last7Days} files`);
    console.log(`  Days 8-30:      ${stats.age.last30Days} files`);
    console.log(`  Older than 90:  ${stats.age.olderThan90Days} files`);

    console.log("\nLargest files:");

    if (stats.largestFiles.length === 0) {
        console.log("Files not found");
    }

    stats.largestFiles.forEach((file, index) => {
        console.log(`  ${index + 1}. ${file.name} — ${formatSize(file.size)}`);
    });

    console.log("\nOldest file:");

    if (stats.oldestFile) {
        const days = Math.floor(
            (Date.now() - stats.oldestFile.mtime.getTime()) / DAY_IN_MS,
        );

        console.log(`  ${stats.oldestFile.name} (modified ${days} days ago)`);
    } else {
        console.log("Files not found");
    }
}

async function main() {
    const [command, directory] = process.argv.slice(2);

    if (command !== "scan") {
        console.error("Please run: node index.js scan <directory>");
        process.exitCode = 1;
        return;
    }

    if (!directory) {
        console.error("Please provide path to directory");
        process.exitCode = 1;
        return;
    }

    const scanner = new Scanner();
    let processed = 0;

    scanner.on("file-found", () => {
        processed += 1;
    });

    scanner.on("progress", (count) => {
        if (count % 100 === 0) {
            console.log(`Files processed: ${count}`);
        }
    });

    scanner.on("scan-complete", (stats) => {
        console.log(`\nScanning is completed: ${processed} files.`);
        printReport(stats);
    });

    try {
        await scanner.scan(directory);
    } catch (error) {
        console.error(`Scanning error: ${error.message}`);
        process.exitCode = 1;
    }
}

const currentFile = fileURLToPath(import.meta.url);

const isMain = process.argv[1] && path.resolve(process.argv[1]) === currentFile;

if (isMain) {
    main();
}

export { Scanner, formatSize, printReport };
