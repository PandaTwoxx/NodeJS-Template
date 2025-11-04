import { Router } from './nodeHttpRouter.js';
const router = new Router();
// 1. Logger Plugin
const loggerPlugin = {
    name: 'logger',
    handler: async (req, res) => {
        console.log(`[Plugin] Incoming: ${req.method} ${req.url}`);
        return true; // Proceed
    },
};
router.addGlobalPlugin(loggerPlugin);
// 2. Add Routes
router.addRoute('GET', '/', (req, res) => {
    res.end('Welcome!');
});
router.addRoute('GET', '/users/:id', (req, res, params) => {
    res.end(`Viewing user ID: ${params.id}. Query: ${JSON.stringify(req.url)}`);
});
router.addRoute('POST', '/data', async (req, res, params, query, body) => {
    res.writeHead(201, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Data received', body }));
});
router.addRoute('GET', '/redirect-test', (req, res) => {
    res.end('Will be redirected!');
}, [], '/');
router.addRoute('GET', '/template', async (req, res) => {
    await res.renderTemplate('welcome.html', { name: 'Router User' });
});
// 3. Serve Static Directory (requires a 'public' folder)
// fs.mkdirSync('public', { recursive: true });
// fs.writeFileSync('public/style.css', 'body { color: blue; }');
// router.addDirectory('public'); // This will serve files at /public/...
// 4. Run Tests
const testCases = [
    { name: 'Home GET', method: 'GET', path: '/', expectedMatch: true },
    { name: 'User GET with params', method: 'GET', path: '/users/99', expectedMatch: true, expectedParams: { id: '99' } },
    { name: 'Data POST', method: 'POST', path: '/data', expectedMatch: true },
    { name: 'Unknown GET', method: 'GET', path: '/nowhere', expectedMatch: false },
];
const results = router.runTests(testCases);
router.printTestResults(results);
// 5. Start Server
const server = router.createServer();
const PORT = 3000;
server.listen(PORT, () => {
    console.log('Server listening on port 3000');
});
