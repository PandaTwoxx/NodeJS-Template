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
  method: string;
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
      `
      return \`${template}\`;
    `,
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

class Router {
  private routes: Route[] = [];

  // Enhanced addRoute to support optional redirect
  addRoute(
    method: string,
    path: string,
    handler: RouteHandler,
    redirectTo?: string,
  ) {
    const wrappedHandler: RouteHandler = async (req, res, params, query, body) => {
      await handler(req, res, params, query, body);

      if (redirectTo) {
        (res as EnhancedServerResponse).redirect(redirectTo);
      }
    };

    this.routes.push({ method, path, handler: wrappedHandler });
  }

  // Match route with dynamic parameter support (unchanged)
  matchRoute(method: string, url: string) {
    for (const route of this.routes) {
      const paramNames: string[] = [];
      const regexPath = route.path.replace(/:[^\s/]+/g, (match) => {
        paramNames.push(match.slice(1));
        return "([^/]+)";
      });

      const regex = new RegExp(`^${regexPath}$`);
      const match = url.match(regex);

      if (match && route.method === method) {
        const params: Record<string, string> = {};
        paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });
        return { handler: route.handler, params };
      }
    }
    return null;
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
}

// Create server with routing
const createServer = () => {
  const router = new Router();

  // Existing route setup (unchanged)
  router.addRoute("GET", "/", async (req, res) => {
    const renderedHtml = await renderTemplate("home.html", {
      title: "Home Page",
      links: [
        { href: "/users", text: "Users" },
        { href: "/posts", text: "Posts" },
        { href: "/users/create", text: "Create User" },
      ],
    });

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderedHtml);
  });

  // Users route with template rendering
  router.addRoute("GET", "/users", async (req, res, params, query) => {
    const renderedHtml = await renderTemplate("users/list.html", {
      users: [
        { id: 1, name: "User 1" },
        { id: 2, name: "User 2" },
      ],
      message: query?.message,
    });

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderedHtml);
  });

  // Create user form route with template rendering
  router.addRoute("GET", "/users/create", async (req, res) => {
    const renderedHtml = await renderTemplate("users/create.html");

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderedHtml);
  });

  // Create user POST route with template rendering
  router.addRoute("POST", "/users/create", async (req, res, params, query, body) => {
    console.log("Creating user:", body);

    const renderedHtml = await renderTemplate("users/created.html", {
      username: body?.username,
      email: body?.email,
    });

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderedHtml);
  }, "/users?message=User%20Created%20Successfully");

  // User detail route with template rendering
  router.addRoute("GET", "/users/:id", async (req, res, params, query) => {
    const renderedHtml = await renderTemplate("users/detail.html", {
      userId: params?.id,
      message: query?.message,
    });

    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(renderedHtml);
  });

  // 404 Not Found handler with template rendering
  const notFoundHandler: RouteHandler = async (req, res) => {
    const renderedHtml = await renderTemplate("404.html");

    res.writeHead(404, { "Content-Type": "text/html" });
    res.end(renderedHtml);
  };

  // Create HTTP server
  const server = http.createServer(async (req, res) => {
    // Extend response with redirect and renderTemplate methods
    (res as EnhancedServerResponse).redirect = (url: string, statusCode = 302) => {
      res.writeHead(statusCode, { "Location": url });
      res.end();
    };

    (res as EnhancedServerResponse).renderTemplate = async (templatePath, context) => {
      const renderedHtml = await renderTemplate(templatePath, context);
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(renderedHtml);
    };

    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host}`);

    // Parse query parameters
    const query = Object.fromEntries(parsedUrl.searchParams);

    // Parse body for POST requests
    let body = {};
    if (["POST", "PUT", "PATCH"].includes(req.method || "")) {
      try {
        body = await parseBody(req);
      } catch (error) {
        console.error("Body parsing error:", error);
      }
    }

    const routeMatch = router.matchRoute(req.method || "GET", parsedUrl.pathname);

    if (routeMatch) {
      routeMatch.handler(req, res, routeMatch.params, query, body);
    } else {
      notFoundHandler(req, res);
    }
  });

  // Demonstration of test running
  const testCases: TestCase[] = [
    {
      name: "Match User List Route",
      method: "GET",
      path: "/users",
      expectedMatch: true,
    },
    {
      name: "Match User Create Route",
      method: "GET",
      path: "/users/create",
      expectedMatch: true,
    },
    {
      name: "Match User Detail Route",
      method: "GET",
      path: "/users/123",
      expectedMatch: true,
      expectedParams: { id: "123" },
    },
    {
      name: "Reject Invalid Route",
      method: "GET",
      path: "/nonexistent",
      expectedMatch: false,
    },
  ];

  // Run tests automatically when server is created
  const testResults = router.runTests(testCases);
  router.printTestResults(testResults);

  return server;
};

// Export server creation function
export default createServer;