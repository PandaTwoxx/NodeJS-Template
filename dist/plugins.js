import { enhanceResponse, renderTemplate } from './nodeHttpRouter';
import { watch } from 'fs';
const createLiveReloadPlugin = (options) => {
    return {
        name: options.pluginName,
        handler: async (req, res, params, query, body) => {
            if (req.method === 'GET' && req.url === options.templatePage) {
                const enhancedRes = enhanceResponse(res);
                res.setHeader('Content-Type', 'text/event-stream');
                res.setHeader('Cache-Control', 'no-cache');
                res.setHeader('Connection', 'keep-alive');
                res.flushHeaders();
                const sendUpdate = async () => {
                    try {
                        const content = await renderTemplate(options.templatePath, options.templateData);
                        res.write(`data: ${JSON.stringify({ html: content })}\n\n`);
                    }
                    catch (error) {
                        console.error('Error rendering template:', error);
                        res.write(`data: ${JSON.stringify({ error: 'Failed to render template' })}\n\n`);
                    }
                };
                await sendUpdate();
                const watcher = watch(options.templatePath, { persistent: true }, async (eventType, filename) => {
                    if (filename && eventType === 'change') {
                        console.log(`Template file changed: ${filename}`);
                        await sendUpdate();
                    }
                });
                req.on('close', () => {
                    console.log('Client disconnected, closing file watcher.');
                    watcher.close();
                });
                req.on('end', () => {
                    console.log('Client connection ended, closing file watcher.');
                    watcher.close();
                });
                req.on('error', (err) => {
                    console.error('Client connection error:', err);
                    watcher.close();
                });
                return false; // Halt further processing as the response is being streamed
            }
            return true; // Allow other handlers/plugins to process the request
        },
    };
};
export { createLiveReloadPlugin };
