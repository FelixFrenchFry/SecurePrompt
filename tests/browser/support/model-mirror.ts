import { appendFileSync, createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve, sep } from 'node:path';
import { MIRROR_PORT, MODELS_DIR } from './paths';

// serves .models/ in the Hugging Face layout (/<model>/resolve/<revision>/<file>) and logs
// every request it receives, so tests can check what the extension sent
export const startModelMirror = async (logFile: string): Promise<Server> =>
{
    const server = createServer((request, response) =>
    {
        const chunks: Buffer[] = [];

        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () =>
        {
            appendFileSync(logFile, `${JSON.stringify({ method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString() })}\n`);

            const match = /^\/(.+?)\/resolve\/[^/]+\/(.+)$/.exec(decodeURIComponent(new URL(request.url ?? '/', 'http://mirror').pathname));
            const file = match == null ? undefined : resolve(MODELS_DIR, match[1]!, match[2]!);

            response.setHeader('Access-Control-Allow-Origin', '*');
            response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

            if (file == null || !file.startsWith(MODELS_DIR + sep) || !existsSync(file))
            {
                response.statusCode = 404;
                response.end();
                return;
            }

            response.setHeader('Content-Length', statSync(file).size);

            if (request.method === 'HEAD')
            {
                response.end();
                return;
            }

            createReadStream(file).pipe(response);
        });
    });

    await new Promise<void>((done, fail) =>
    {
        server.once('error', fail);
        server.listen(MIRROR_PORT, '127.0.0.1', done);
    });

    return server;
};
