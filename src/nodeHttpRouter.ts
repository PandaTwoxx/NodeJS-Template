import { readFile } from "node:fs/promises";
import * as http from "node:http";
import { join } from "node:path";
import { parse as parseQueryString } from "node:querystring";
import { URL } from "node:url";

// Enhanced route handler type definition
type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  params?: Record<string, string>,
  query?: Record<string, string | string[]>,
  body?: Record<string, string>,
) => void;

// Route definition interface
interface Route {
  methods: string[]; // Changed from string to string[]
  path: string;
  handler: RouteHandler;
}

// Custom response extension
interface EnhancedServerResponse extends http.ServerResponse {
  redirect: (url: string, statusCode?: number) => void;
  renderTemplate: (templatePath: string, context?: Record<string, any>) => Promise<void>;
}

// Test case interface
interface TestCase {
  name: string;
  method: string;
  path: string;
  expectedParams?: Record<string, string>;
  expectedMatch: boolean;
}

// Test result interface
interface TestResult {
  name: string;
  passed: boolean;
  message?: string;
}
// Updated Plugin interface
interface Plugin {
  name: string;
  handler: (
    req: http.IncomingMessage,
    res: EnhancedServerResponse,
    params?: Record<string, string>,
    query?: Record<string, string | string[]>,
    body?: Record<string, string>
  ) => Promise<RouteHandler | true | false>; // Return new handler, true (to proceed), or false (to halt)
}

// Template rendering utility
async function renderTemplate(
  templatePath: string,
  context: Record<string, any> = {},
): Promise<string> {
  try {
    // Read template file from templates directory
    const fullPath = join(process.cwd(), "templates", templatePath);
    let template = await readFile(fullPath, "utf-8");

    // Use Function constructor for safe template interpolation
    const templateFunction = new Function(
      ...Object.keys(context),
      `return \`${template}\`;`
    );

    // Apply context values to template
    return templateFunction(...Object.values(context));
  } catch (error) {
    console.error("Template rendering error:", error);
    throw new Error(`Failed to render template: ${templatePath}`);
  }
}

// Body parsing utility (unchanged from previous version)
async function parseBody(req: http.IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        const contentType = req.headers["content-type"] || "";

        if (contentType.includes("application/x-www-form-urlencoded")) {
          resolve(parseQueryString(body) as Record<string, string>);
        } else if (contentType.includes("application/json")) {
          resolve(JSON.parse(body));
        } else {
          resolve({});
        }
      } catch (error) {
        reject(error);
      }
    });
  });
}

function enhanceResponse(res: http.ServerResponse): EnhancedServerResponse {
  const enhancedRes = res as EnhancedServerResponse;

  enhancedRes.redirect = (url: string, statusCode: number = 302) => {
    enhancedRes.writeHead(statusCode, { Location: url });
    enhancedRes.end();
  };

  enhancedRes.renderTemplate = async (templatePath, context = {}) => {
    try {
      const content = await renderTemplate(templatePath, context);
      enhancedRes.setHeader("Content-Type", "text/html");
      enhancedRes.end(content);
    } catch (error) {
      enhancedRes.statusCode = 500;
      enhancedRes.end("Template rendering error");
    }
  };

  return enhancedRes;
}

class Router {
  private routes: Route[] = [];
  private globalPlugins: Plugin[] = [];

  // Add a global plugin
  addGlobalPlugin(plugin: Plugin) {
    this.globalPlugins.push(plugin);
  }

  // Enhanced addRoute with support for custom plugins and handler override
  addRoute(
    methods: string | string[], // Accept single method or array of methods
    path: string,
    handler: RouteHandler,
    customPlugins: Plugin[] = [], // Add custom plugins per route
    redirectTo?: string
  ) {
    const normalizedMethods = Array.isArray(methods) ? methods.map(m => m.toUpperCase()) : [methods.toUpperCase()];
    const wrappedHandler: RouteHandler = async (req, res, params, query, body) => {
      const enhancedRes = res as EnhancedServerResponse;

      // Run global plugins
      for (const plugin of this.globalPlugins) {
        const result = await plugin.handler(req, enhancedRes, params, query, body);

        if (result === false) return; // Halt the request if the plugin returns false
        if (result !== true) handler = result; // Override handler if plugin provides a new one
      }

      // Run custom plugins
      for (const plugin of customPlugins) {
        const result = await plugin.handler(req, enhancedRes, params, query, body);

        if (result === false) return; // Halt the request if the plugin returns false
        if (result !== true) handler = result; // Override handler if plugin provides a new one
      }

      // Run the final (possibly overridden) route handler
      await handler(req, enhancedRes, params, query, body);

      // Optional redirection
      if (redirectTo) {
        enhancedRes.redirect(redirectTo);
      }
    };

    this.routes.push({ methods: normalizedMethods, path, handler: wrappedHandler });
  }

  // Match route (unchanged from your original code)
  matchRoute(method: string, url: string) {
    const normalizedMethod = method.toUpperCase();
    for (const route of this.routes) {
      const paramNames: string[] = [];
      const regexPath = route.path.replace(/:[^\s/]+/g, (match) => {
        paramNames.push(match.slice(1));
        return "([^/]+)";
      });

      const regex = new RegExp(`^${regexPath}$`);
      const match = url.match(regex);

      if (match && route.methods.includes(normalizedMethod)) { // Check if method is in the allowed methods
        const params: Record<string, string> = {};
        paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });
        return { handler: route.handler, params };
      }
    }
    return null;
  }

  handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const enhancedRes = enhanceResponse(res);
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const match = this.matchRoute(req.method || "", url.pathname);

    if (match) {
      const query = Object.fromEntries(url.searchParams.entries());
      parseBody(req)
        .then((body) => match.handler(req, enhancedRes, match.params, query, body))
        .catch((error) => {
          enhancedRes.statusCode = 500;
          enhancedRes.end("Internal Server Error");
          console.error("Request handling error:", error);
        });
    } else {
      enhancedRes.statusCode = 404;
      enhancedRes.end("Not Found");
    }
  }

  /**
   * Run a comprehensive test suite for route matching
   * @param testCases Array of test cases to run
   * @returns Detailed test results
   */
  runTests(testCases: TestCase[]): TestResult[] {
    const results: TestResult[] = [];

    testCases.forEach(testCase => {
      try {
        const matchResult = this.matchRoute(testCase.method, testCase.path);
        const passed = testCase.expectedMatch
          ? matchResult !== null
          : matchResult === null;

        const result: TestResult = {
          name: testCase.name,
          passed: passed,
        };

        // Additional checks for parameter matching if expected
        if (passed && testCase.expectedParams && matchResult) {
          const paramKeys = Object.keys(testCase.expectedParams);
          const allParamsMatch = paramKeys.every(key => matchResult.params[key] === testCase.expectedParams?.[key]);

          if (!allParamsMatch) {
            result.passed = false;
            result.message = `Parameter mismatch. Expected: ${JSON.stringify(testCase.expectedParams)}, Got: ${
              JSON.stringify(matchResult.params)
            }`;
          }
        }

        // Add detailed message for failed tests
        if (!result.passed) {
          result.message = result.message || `Route match failed for ${testCase.path}`;
        }

        results.push(result);
      } catch (error) {
        results.push({
          name: testCase.name,
          passed: false,
          message: `Test error: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    });

    return results;
  }

  /**
   * Utility method to print test results with color and formatting
   * @param results Test results to print
   */
  printTestResults(results: TestResult[]) {
    console.log("\n🧪 Router Test Results:");
    console.log("--------------------");

    let passedCount = 0;
    let failedCount = 0;

    results.forEach(result => {
      if (result.passed) {
        console.log(`✅ ${result.name}: PASSED`);
        passedCount++;
      } else {
        console.log(`❌ ${result.name}: FAILED`);
        console.log(`   ${result.message || "Unknown failure"}`);
        failedCount++;
      }
    });

    console.log("\nSummary:");
    console.log(`Total Tests: ${results.length}`);
    console.log(`Passed: ${passedCount}`);
    console.log(`Failed: ${failedCount}`);

    return {
      totalTests: results.length,
      passed: passedCount,
      failed: failedCount,
    };
  }

  /**
   * Returns an HTTP server configured with the router.
   * @returns {http.Server} The configured HTTP server.
   */
  createServer(): http.Server {
    return http.createServer(async (req, res) => {
      const enhancedRes = enhanceResponse(res); // Enhance the response object
      const url = new URL(req.url || "", `http://${req.headers.host}`);
      const match = this.matchRoute(req.method || "", url.pathname);

      if (match) {
        const query = Object.fromEntries(url.searchParams.entries());
        try {
          const body = await parseBody(req);
          await match.handler(req, enhancedRes, match.params, query, body);
        } catch (error) {
          console.error("Handler error:", error);
          enhancedRes.statusCode = 500;
          enhancedRes.end("Internal Server Error");
        }
      } else {
        enhancedRes.statusCode = 404;
        enhancedRes.end("Not Found");
      }
    });
  }
}

// Export server creation function
export { Router, renderTemplate, enhanceResponse, parseBody, Plugin, RouteHandler, EnhancedServerResponse };