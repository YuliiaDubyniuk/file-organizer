import fs from 'node:fs/promises';
import path from 'node:path';

export async function walkFiles(directory, { onError } = {}) {
    const root = path.resolve(directory);
    const rootStat = await fs.stat(root);

    if (!rootStat.isDirectory()) {
        throw new Error(`Path is not a directory: ${root}`);
    }

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
            if (onError) {
                onError(error, currentFolder);
            } else {
                console.error(
                    `Cannot read directory ${currentFolder}: ${error.message}`,
                );
            }

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
                const stats = await fs.stat(fullPath);

                files.push({
                    path: fullPath,
                    name: entry.name,
                    size: stats.size,
                    mtime: stats.mtime,
                    extension: path.extname(entry.name).toLowerCase() || '(other)',
                });
            } catch (error) {
                if (onError) {
                    onError(error, fullPath);
                } else {
                    console.error(
                        `Cannot get file information for ${fullPath}: ${error.message}`,
                    );
                }
            }
        }
    }

    return files;
}
