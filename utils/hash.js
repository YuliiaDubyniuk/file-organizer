import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";


export async function hashFile(filePath) {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    for await (const chunk of stream) {
        hash.update(chunk);
    }

    return hash.digest("hex");
}

