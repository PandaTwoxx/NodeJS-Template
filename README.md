import { Router, Plugin, RouteHandler, renderTemplate, EnhancedServerResponse  } from "./nodeHttpRouter";

const router = new Router();

// Global Plugin: Logs each request
const loggerPlugin: Plugin = {
  name: "Logger",
  handler: async (req, res) => {
    console.log(`Request received: ${req.method} ${req.url}`);
    return true; // Allow default handler to proceed
  },
};

// Route Plugin: Checks authentication
const authPlugin: Plugin = {
  name: "Auth",
  handler: async (req, res) => {
    const isAuthenticated = req.headers["x-auth-token"] === "valid-token";
    if (!isAuthenticated) {
      res.writeHead(401, { "Content-Type": "text/plain" });
      res.end("Unauthorized");
      return false; // Halt the request
    }
    return true; // Allow default handler to proceed
  },
};

// Add global plugin
router.addGlobalPlugin(loggerPlugin);

// Route: Static greeting
router.addRoute(
  "GET",
  "/greet",
  (req, res) => {
    res.end("Hello, welcome to our server!");
  },
  [authPlugin] // Auth plugin applied to this route
);

// Route: Render a dynamic template
router.addRoute(
  "GET",
  "/template",
  async (req, res) => {
    await renderTemplate("example.html", { name: "Weston" });
  }
);

// Route: JSON body parsing and response
router.addRoute("POST", "/submit", async (req, res, params, query, body) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ received: body }));
});

// Route: Redirect example
router.addRoute("GET", "/redirect", (req, res) => {
    (res as EnhancedServerResponse).redirect("/greet");
});

// Route with parameters
router.addRoute(
  "GET",
  "/user/:id",
  (req, res, params) => {
    res.end(`User ID: ${params?.id}`);
  }
);

// Test cases
const testCases = [
  {
    name: "Match /greet",
    method: "GET",
    path: "/greet",
    expectedMatch: true,
  },
  {
    name: "Match /user/123 with params",
    method: "GET",
    path: "/user/123",
    expectedMatch: true,
    expectedParams: { id: "123" },
  },
  {
    name: "No match for invalid route",
    method: "GET",
    path: "/invalid",
    expectedMatch: false,
  },
];

// Run tests
const results = router.runTests(testCases);
router.printTestResults(results);

// Start the server
const server = router.createServer();
server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
