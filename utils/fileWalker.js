import fs from 'node:fs/promises';
import path from 'node:path';

export async function walkFiles(directory, { onError } = {}) {
    const root = path.resolve(directory);

    let rootStats;

    try {
        rootStats = await fs.stat(root);
    } catch (error) {
        if (error.code === 'ENOENT') {
            error.message = `Directory not found: ${root}`;
        } else if (error.code === 'EACCES' || error.code === 'EPERM') {
            error.message = `Permission denied: ${root}`;
        } else {
            error.message = `Unexpected error: ${error.message}`;
        }

        throw error;
    }

    if (!rootStats.isDirectory()) {
        const error = new Error(`Path is not a directory: ${root}`);
        error.code = 'ENOTDIR';
        throw error;
    }

    let entries;

    try {
        entries = await fs.readdir(root, {
            recursive: true,
            withFileTypes: true,
        });
    } catch (error) {
        if (error.code === 'ENOENT') {
            error.message = `Directory not found: ${root}`;
        } else if (error.code === 'EACCES' || error.code === 'EPERM') {
            error.message = `Permission denied: ${root}`;
        } else {
            error.message = `Unexpected error: ${error.message}`;
        }

        throw error;
    }

    const files = [];

    for (const entry of entries) {
        if (!entry.isFile()) continue;

        const parentPath = entry.parentPath ?? root;

        const filePath = path.isAbsolute(parentPath)
            ? path.join(parentPath, entry.name)
            : path.join(root, parentPath, entry.name);

        try {
            const stats = await fs.stat(filePath);

            files.push({
                path: filePath,
                name: entry.name,
                size: stats.size,
                mtime: stats.mtime,
                extension: path.extname(entry.name).toLowerCase() || '(other)',
            });
        } catch (error) {
            if (error.code === 'ENOENT') {
                error.message = `File not found: ${filePath}`;
            } else if (error.code === 'EACCES' || error.code === 'EPERM') {
                error.message = `Permission denied: ${filePath}`;
            } else {
                error.message = `Unexpected error: ${error.message}`;
            }

            if (onError) {
                onError(error, filePath);
                continue;
            }

            throw error;
        }
    }

    return files;
}
