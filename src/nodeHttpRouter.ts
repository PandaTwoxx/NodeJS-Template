import * as http from 'node:http';
import * as url from 'node:url';
import * as fs from 'node:fs';
import * as path from 'node:path';
// You will need to install this package: npm install mime-types
import * as mime from 'mime-types'; 

// --- 1. Types and Interfaces ---

type RecordString = Record<string, string>;
type RecordStringOrArray = Record<string, string | string[]>;

interface EnhancedServerResponse extends http.ServerResponse {
  redirect: (url: string, statusCode?: number) => void;
  renderTemplate: (templatePath: string, context?: Record<string, any>) => Promise<void>;
}

type RouteHandler = (
  req: http.IncomingMessage,
  res: EnhancedServerResponse,
  params: RecordString,
  query: RecordStringOrArray,
  body: RecordString,
) => void;

interface Route {
  methods: string[];
  path: string;
  handler: RouteHandler;
  plugins: Plugin[];
  redirectTo?: string;
  // Internal fields for matching
  pathRegex: RegExp;
  paramNames: string[];
}

interface TestCase {
  name: string;
  method: string;
  path: string;
  expectedParams?: RecordString;
  expectedMatch: boolean;
}

interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}

interface Plugin {
  name: string;
  handler: (
    req: http.IncomingMessage,
    res: EnhancedServerResponse,
    params: RecordString,
    query: RecordStringOrArray,
    body: RecordString
  ) => Promise<RouteHandler | true | false>;
}

// --- 2. Utility Functions ---

/**
 * Extends the standard ServerResponse with redirect and renderTemplate methods.
 */
function enhanceResponse(res: http.ServerResponse): EnhancedServerResponse {
  const enhancedRes = res as EnhancedServerResponse;

  enhancedRes.redirect = (redirectUrl: string, statusCode: number = 302) => {
    enhancedRes.writeHead(statusCode, { 'Location': redirectUrl });
    enhancedRes.end();
  };

  enhancedRes.renderTemplate = async (templatePath: string, context: Record<string, any> = {}) => {
    try {
      const fullPath = path.join(process.cwd(), 'templates', templatePath);
      let content = await renderTemplate(fullPath, context);
      
      enhancedRes.setHeader('Content-Type', 'text/html');
      enhancedRes.writeHead(200);
      enhancedRes.end(content);
    } catch (error) {
      console.error('Template rendering error:', error);
      enhancedRes.writeHead(500);
      enhancedRes.end('Template rendering failed.');
    }
  };

  return enhancedRes;
}

/**
 * Asynchronously reads a template file and performs simple context substitution.
 */
async function renderTemplate(templatePath: string, context: Record<string, any>): Promise<string> {
  const templateContent = await fs.promises.readFile(templatePath, 'utf8');
  
  // Simple substitution: replaces {{key}} with context[key]
  return templateContent.replace(/{{(\w+)}}/g, (match, key) => {
    return context.hasOwnProperty(key) ? String(context[key]) : match;
  });
}

/**
 * Asynchronously parses the request body based on Content-Type.
 */
async function parseBody(req: http.IncomingMessage): Promise<RecordString> {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/x-www-form-urlencoded') && !contentType.includes('application/json')) {
    return {};
  }

  return new Promise((resolve, reject) => {
    let rawData = '';
    req.on('data', chunk => {
      rawData += chunk;
    });
    req.on('end', () => {
      try {
        if (contentType.includes('application/json')) {
          resolve(JSON.parse(rawData));
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const parsed = new url.URLSearchParams(rawData);
          const body: RecordString = {};
          parsed.forEach((val, key) => body[key] = val);
          resolve(body);
        } else {
          resolve({});
        }
      } catch (e) {
        console.error('Body parsing error:', e);
        resolve({}); // Resolve with empty body on error
      }
    });
    req.on('error', reject);
  });
}

/**
 * Reads the contents of a file. Used mainly for static file serving.
 */
function pullFile(filePath: string): { content: Buffer, mimeType: string } | undefined {
  try {
    const fileContent = fs.readFileSync(filePath);
    const mimeType = mime.lookup(filePath) || 'application/octet-stream';
    return { content: fileContent, mimeType };
  } catch (e) {
    return undefined;
  }
}

// --- 3. Router Class ---

export class Router {
  private routes: Route[] = [];
  private globalPlugins: Plugin[] = [];

  constructor() {}

  /**
   * Registers a global plugin (middleware).
   */
  public addGlobalPlugin(plugin: Plugin): void {
    this.globalPlugins.push(plugin);
  }

  /**
   * Internal helper to create the regex and param names for a route path.
   */
  private static parseRoutePath(pathStr: string): { pathRegex: RegExp, paramNames: string[] } {
    const paramNames: string[] = [];
    let pathRegexStr = pathStr.replace(/([\\/])/g, '\\$&'); // Escape slashes

    // Replace :param with a regex capture group and record the param name
    pathRegexStr = pathRegexStr.replace(/:(\w+)/g, (match, name) => {
      paramNames.push(name);
      return '([^/]+)'; // Non-slash characters for a segment
    });

    // Handle trailing slash sensitivity and exact match
    pathRegexStr = `^${pathRegexStr}$`;

    return { pathRegex: new RegExp(pathRegexStr), paramNames };
  }

  /**
   * Registers a new route.
   */
  public addRoute(
    methods: string | string[],
    path: string,
    handler: RouteHandler,
    customPlugins: Plugin[] = [],
    redirectTo?: string
  ): void {
    const methodArray = Array.isArray(methods) ? methods.map(m => m.toUpperCase()) : [methods.toUpperCase()];
    const { pathRegex, paramNames } = Router.parseRoutePath(path);

    this.routes.push({
      methods: methodArray,
      path,
      handler,
      plugins: customPlugins,
      redirectTo,
      pathRegex,
      paramNames,
    });
  }

  /**
   * Adds routes to serve static files from the specified directory.
   */
  public addDirectory(directoryPath: string): void {
    const fullDir = path.resolve(directoryPath);
    if (!fs.existsSync(fullDir)) {
      console.error(`[Router] Cannot serve directory: ${fullDir} not found.`);
      return;
    }

    const serveHandler: RouteHandler = (req, res, params, query, body) => {
      // req.url is the full path including the directory name
      const fileUrlPath = url.parse(req.url || '').pathname || '';
      const filePath = path.join(process.cwd(), fileUrlPath);

      const fileData = pullFile(filePath);

      if (fileData) {
        res.setHeader('Content-Type', fileData.mimeType);
        res.writeHead(200);
        res.end(fileData.content);
      } else {
        res.writeHead(404);
        res.end('File Not Found');
      }
    };
    
    // The path for static files is the directory name + all subpaths
    // e.g., if directoryPath is 'public', path will be '/public/:filePath*'
    const urlSegment = path.basename(directoryPath);
    const staticPath = `/${urlSegment}/:filePath*`; // Using a simple catch-all for params

    this.addRoute('GET', staticPath, serveHandler);
  }


  /**
   * Attempts to find a matching route for the given HTTP method and URL path.
   */
  public matchRoute(method: string, requestPath: string): { 
    handler: RouteHandler; 
    params: RecordString; 
    plugins: Plugin[];
    redirectTo?: string;
  } | null {
    
    const methodUpper = method.toUpperCase();
    
    for (const route of this.routes) {
      if (route.methods.includes(methodUpper)) {
        const match = requestPath.match(route.pathRegex);

        if (match) {
          const params: RecordString = {};
          // match[0] is the full string, so parameters start at index 1
          route.paramNames.forEach((name, index) => {
            // Note: This simple impl doesn't handle splat (*) well, but captures standard params
            params[name] = match[index + 1] || ''; 
          });

          return {
            handler: route.handler,
            params,
            plugins: route.plugins,
            redirectTo: route.redirectTo,
          };
        }
      }
    }
    return null;
  }

  /**
   * The main request handling logic.
   */
  public async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const reqUrl = req.url || '/';
    const parsedUrl = url.parse(reqUrl, true);
    const requestPath = parsedUrl.pathname || '/';
    const requestMethod = req.method || 'GET';

    const enhancedRes = enhanceResponse(res);
    const query = parsedUrl.query as RecordStringOrArray;

    const match = this.matchRoute(requestMethod, requestPath);
    const body = await parseBody(req);
    const params = match?.params || {};

    if (!match) {
      enhancedRes.writeHead(404);
      enhancedRes.end('Not Found');
      return;
    }
    
    let currentHandler: RouteHandler = match.handler;
    let plugins = [...this.globalPlugins, ...match.plugins];

    // Execute Plugins
    for (const plugin of plugins) {
      const result = await plugin.handler(req, enhancedRes, params, query, body);

      if (result === false) {
        // Halt request processing
        return;
      } else if (typeof result === 'function') {
        // Override the route handler
        currentHandler = result;
      }
      // If result is true, proceed
    }

    // Execute final handler
    currentHandler(req, enhancedRes, params, query, body);

    // Handle redirection after execution (if specified in route config)
    if (match.redirectTo) {
      enhancedRes.redirect(match.redirectTo);
    }
  }

  /**
   * Executes a series of test cases.
   */
  public runTests(testCases: TestCase[]): TestResult[] {
    const results: TestResult[] = [];

    for (const test of testCases) {
      const result: TestResult = { name: test.name, passed: false };
      const match = this.matchRoute(test.method, test.path);
      
      const matched = !!match;

      if (matched !== test.expectedMatch) {
        result.message = `Expected match: ${test.expectedMatch}, Actual: ${matched}`;
      } else if (matched && test.expectedMatch) {
        // Check parameters
        const actualParams = match?.params || {};
        const expectedParams = test.expectedParams || {};

        const keysMatch = Object.keys(actualParams).length === Object.keys(expectedParams).length &&
                         Object.keys(expectedParams).every(key => actualParams[key] === expectedParams[key]);

        if (!keysMatch) {
            result.message = `Parameter mismatch. Expected: ${JSON.stringify(expectedParams)}, Actual: ${JSON.stringify(actualParams)}`;
        } else {
            result.passed = true;
        }
      } else {
        result.passed = true; // Expected no match and got no match
      }

      results.push(result);
    }
    return results;
  }

  /**
   * Prints the results of the test suite.
   */
  public printTestResults(results: TestResult[]): { totalTests: number; passed: number; failed: number; } {
    let passed = 0;
    let failed = 0;

    console.log('\n--- Route Test Results ---');
    for (const result of results) {
      if (result.passed) {
        console.log(`✅ PASS: ${result.name}`);
        passed++;
      } else {
        console.log(`❌ FAIL: ${result.name} - ${result.message}`);
        failed++;
      }
    }
    console.log('--------------------------');
    console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);
    return { totalTests: results.length, passed, failed };
  }

  /**
   * Creates and returns a configured http.Server instance.
   */
  public createServer(): http.Server {
    return http.createServer(async (req, res) => {
      // Use this.handleRequest as the listener
      await this.handleRequest(req, res);
    });
  }
}

export { Plugin, TestCase };

// --- 4. Example Usage ---

/**
 * Example usage is commented out but shows how to set up the server.
 * To run this example:
 * 1. Save the code as Router.ts
 * 2. Run: npm install typescript ts-node @types/node mime-types
 * 3. Add a 'templates' directory with a 'welcome.html' file (e.g., <h1>Hello, {{name}}!</h1>)
 * 4. Run: ts-node Router.ts
 */

/*
const router = new Router();

// 1. Logger Plugin
const loggerPlugin: Plugin = {
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
const testCases: TestCase[] = [
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
*/